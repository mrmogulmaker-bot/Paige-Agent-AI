// marketplace-checkout-session — create a Stripe Checkout Session to BUY a paid
// marketplace item (the §17 Marketplace paid-install revenue leg, B-ii-a).
//
// Why a separate function from marketplace-install: install is payment-AGNOSTIC —
// it flips skills, seeds KB, and writes the ledger the moment it's called. That is
// exactly right for a FREE item, but a PAID item must not install until money has
// actually moved. So this function does the ONE thing install must not assume:
// it collects payment first (Stripe Checkout), and the stripe-webhook's
// checkout.session.completed arm is what then invokes marketplace-install (service
// path) so the real, non-zero ledger row is written by the SAME single writer (§18 —
// we never fork the ledger; install_marketplace_item stays the one source of truth).
//
// JWT-gated (verify_jwt=true): the buyer is derived server-side from their session —
// userId from getUser(token), tenantId from profiles.active_tenant_id. A body
// tenant_id is honored ONLY for a platform owner; everyone else buys for their own
// active tenant. The buyer tenant is NEVER trusted from the body (§9).
//
// PRE-CHARGE AUTHORIZATION PARITY (§13 — money-movement): before any Stripe session
// is created we mirror the EXACT gates the webhook's fulfillment will enforce. The
// webhook installs via the service-role 5-arg install_marketplace_item overload,
// which authorizes ONLY on is_tenant_admin_as(actor, tenant) and, running under
// service role, evaluates item visibility with _is_owner=false / auth.uid()=NULL.
// So we FAIL CLOSED here unless the fulfillment would also succeed:
//   • is_tenant_admin_as(actor, tenant) must be true  → else 403 (never charge).
//   • item must be 'listed' with a published version   → else 404 / 409.
//   • scope='tenant' must match visible_to_tenant_id    → else 403.
//   • scope='agency' is not purchasable via the service-role fulfillment path today
//     (the 5-arg overload can't satisfy the agency-role check under service role) →
//     403, so we never take money we can't fulfill. (Follow-up to lift when the
//     overload gains an actor-scoped agency-visibility path.)
// This guarantees we never capture a payment the webhook install would 42501 on
// ("money captured, nothing installed").
//
// POST { item_slug, success_path?, cancel_path? }  -> { url }
//
// Charge routing (verified ground truth: the only vendor today is first-party 'paige'
// with no connect account):
//   • FIRST-PARTY item (vendor.owner_tenant_id NULL OR no connect account): a plain
//     platform charge — OMIT transfer_data / application_fee (platform keeps 100%).
//   • VENDOR item with a ready connect account: a destination charge —
//     transfer_data.destination = the vendor's connect account, and
//     application_fee_amount = floor(price_cents * take_rate_bps / 10000).
//   • VENDOR item that is paid but whose payouts are NOT ready: 409 — we do NOT
//     create an un-transferable charge that would strand the vendor's money.
//
// §38: this is a Tier-2 Paige-held rail — Paige is merchant of record on the
// Marketplace (correct); distinct from the tenant-storefront direct-charge fix (#461).
//
// Stripe metadata is the SIGNED bridge the webhook trusts (§9): it carries
// marketplace_item_slug (the discriminant), marketplace_item_id, tenant_id, and
// actor_user_id. It NEVER sets tenant_price_id — that is the storefront branch's
// discriminant in stripe-webhook and would collide.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPA_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

// Open-redirect guard (§9): success/cancel targets are built from a fixed origin
// ALLOWLIST + a same-origin relative path, never a reflected absolute URL from the
// body. If the caller's Origin isn't recognized we fall back to the canonical app.
const ORIGIN_ALLOWLIST = new Set<string>([
  "https://paigeagent.ai",
  "https://www.paigeagent.ai",
  "https://app.paigeagent.ai",
  "http://localhost:5173",
  "http://localhost:3000",
]);
const DEFAULT_ORIGIN = "https://app.paigeagent.ai";

function resolveOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  return ORIGIN_ALLOWLIST.has(origin) ? origin : DEFAULT_ORIGIN;
}

// Only accept a same-origin relative path ("/…"); anything with a scheme/host or a
// protocol-relative "//" is rejected so a body value can never redirect off-origin.
function safePath(raw: unknown, fallback: string): string {
  if (typeof raw !== "string" || !raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!STRIPE_KEY) return json(500, { error: "stripe_not_configured" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "Unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const itemSlug = String(body.item_slug ?? "");
  if (!itemSlug) return json(400, { error: "item_slug_required" });

  const admin = createClient(SUPA_URL, SUPA_SRK);

  // ── AUTH: resolve the buyer from their session, never from the body ────────────
  // getUser via the anon key + the caller's bearer — the actor is auth.uid().
  const userClient = createClient(SUPA_URL, SUPA_ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) return json(401, { error: "Unauthorized" });
  const actorUserId = user.id;

  // Buyer tenant: a body override is honored ONLY for a platform owner; everyone
  // else buys for their own active tenant (§9 — never trust body tenant_id).
  // is_platform_owner() is auth.uid()-based, so it MUST run on the USER-scoped
  // client — on the service-role client auth.uid() is NULL and it is dead code.
  let tenantId: string | null = null;
  const bodyTenantId =
    typeof body.tenant_id === "string" ? (body.tenant_id as string) : null;
  const { data: isOwner } = await userClient.rpc("is_platform_owner");
  if (bodyTenantId && isOwner === true) {
    tenantId = bodyTenantId;
  } else {
    const { data: prof } = await admin
      .from("profiles")
      .select("active_tenant_id")
      .eq("user_id", actorUserId)
      .maybeSingle();
    tenantId = prof?.active_tenant_id ?? null;
  }
  if (!tenantId) return json(400, { error: "No active tenant for this user" });

  // ── LOAD the item (service role) — pull the visibility columns too ─────────────
  const { data: item, error: itemErr } = await admin
    .from("marketplace_items")
    .select(
      "id, slug, name, status, pricing_model, price_cents, take_rate_bps, vendor_id, scope, visible_to_tenant_id, visible_to_agency_id, current_version_id",
    )
    .eq("slug", itemSlug)
    .maybeSingle();
  if (itemErr) return json(400, { error: itemErr.message });
  if (!item || item.status !== "listed") {
    return json(404, { error: `marketplace item ${itemSlug} not found` });
  }

  // GUARD: this endpoint is for PAID items only. A free item installs directly via
  // marketplace-install; sending it here would create a $0 Stripe session.
  const priceCents = Number(item.price_cents ?? 0);
  if (item.pricing_model === "free" || priceCents <= 0) {
    return json(400, { error: "item_not_paid" });
  }
  // Fail closed on recurring items: this leg only mints a one-time 'payment' session.
  // A 'subscription'-priced item charged one-time would mis-bill (§13) — reject until
  // a recurring marketplace-checkout path exists (follow-up).
  if (item.pricing_model === "subscription") {
    return json(400, { error: "subscription_items_not_supported_yet" });
  }

  // ── PRE-CHARGE AUTHORIZATION PARITY (§13, BLOCKER fix) ─────────────────────────
  // Fail closed BEFORE creating any Stripe session, mirroring exactly what the
  // webhook's service-role 5-arg install will enforce.

  // (1) Admin gate — the 5-arg overload authorizes ONLY on is_tenant_admin_as.
  //     Owner-ship is NOT sufficient for the paid-install fulfillment path, so we
  //     do not add an owner bypass here (that would let an owner pay and then have
  //     the webhook install 42501 with "actor is not an admin").
  const { data: isAdmin, error: adminErr } = await admin.rpc(
    "is_tenant_admin_as",
    { _actor: actorUserId, _tenant: tenantId },
  );
  if (adminErr) return json(400, { error: adminErr.message });
  if (isAdmin !== true) {
    return json(403, { error: "Not authorized for this tenant" });
  }

  // (2) Published version — the node raises 'no published version' otherwise.
  if (!item.current_version_id) {
    return json(409, { error: `item ${itemSlug} has no published version` });
  }

  // (3) Scope visibility — mirror _marketplace_install_node, evaluated as the
  //     webhook will (service role → non-owner). tenant-scope has NO owner escape.
  if (item.scope === "tenant") {
    if (item.visible_to_tenant_id !== tenantId) {
      return json(403, { error: "This item is scoped to another workspace." });
    }
  } else if (item.scope === "agency") {
    // The service-role 5-arg install evaluates agency visibility via
    // agency_team_role(agency, auth.uid()) with auth.uid()=NULL, so it can never
    // satisfy it. Fail closed rather than capture an un-fulfillable payment.
    return json(403, {
      error: "Agency-scoped items aren't purchasable yet.",
    });
  }

  // ── LOAD the vendor to decide charge routing ──────────────────────────────────
  const { data: vendor, error: vendorErr } = await admin
    .from("marketplace_vendors")
    .select("id, owner_tenant_id, stripe_connect_account_id, payout_status")
    .eq("id", item.vendor_id)
    .maybeSingle();
  if (vendorErr) return json(400, { error: vendorErr.message });
  if (!vendor) return json(404, { error: "vendor_not_found" });

  const isFirstParty =
    !vendor.owner_tenant_id || !vendor.stripe_connect_account_id;

  // A VENDOR item (owned by a tenant, meant to pay out) that isn't ready to receive
  // funds must not be sold — we won't create a charge we can't transfer (§13).
  if (!isFirstParty) {
    const payoutsReady = vendor.payout_status === "ready";
    if (!vendor.stripe_connect_account_id || !payoutsReady) {
      return json(409, { error: "vendor_payouts_not_ready" });
    }
  }

  const takeRateBps = Number(item.take_rate_bps ?? 0);
  const applicationFee = Math.floor((priceCents * takeRateBps) / 10000);

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-11-20.acacia" });

  const origin = resolveOrigin(req);
  const successPath = safePath(body.success_path, "/marketplace?purchase=success");
  const cancelPath = safePath(body.cancel_path, "/marketplace?purchase=cancelled");
  const successUrl =
    origin +
    successPath +
    (successPath.includes("?") ? "&" : "?") +
    "session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl = origin + cancelPath;

  // Stripe-SIGNED metadata — the ONLY thing stripe-webhook trusts (§9). The slug is
  // the webhook's discriminant for this arm. NEVER set tenant_price_id (that is the
  // storefront branch's discriminant and would collide).
  const metadata: Record<string, string> = {
    marketplace_item_slug: item.slug,
    marketplace_item_id: String(item.id),
    tenant_id: tenantId,
    actor_user_id: actorUserId,
  };

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment", // one-time purchase — never a subscription
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: priceCents,
          product_data: { name: String(item.name ?? item.slug) },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: user.email ?? undefined,
    metadata,
  };

  // First-party → plain platform charge (100% to platform, no transfer). Vendor →
  // destination charge with the platform's application fee carved out.
  if (!isFirstParty) {
    params.payment_intent_data = {
      application_fee_amount: applicationFee || undefined,
      transfer_data: { destination: vendor.stripe_connect_account_id! },
    };
  }

  console.log(
    `[marketplace-checkout-session] tenant=${tenantId} item=${item.slug} price_cents=${priceCents} ` +
      `first_party=${isFirstParty} fee=${isFirstParty ? 0 : applicationFee}`,
  );

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(params);
  } catch (e) {
    console.error("[marketplace-checkout-session] stripe error:", e);
    return json(502, { error: "stripe_session_failed", detail: (e as Error).message });
  }

  return json(200, { url: session.url });
});
