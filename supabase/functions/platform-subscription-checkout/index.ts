// platform-subscription-checkout — create a Stripe Checkout Session to BECOME a
// Paige customer: the Tier-1 platform-subscription CREATE leg (B-Platform).
//
// This is the "sign up + pay to run your practice on Paige" money leg. It mints a
// `mode: "subscription"` Stripe Checkout Session for a self-serve platform plan
// (practice / academy) and returns its hosted URL. The webhook's
// checkout.session.completed arm — discriminated on the Stripe-signed
// `platform_plan_slug` metadata — is what actually WRITES `platform_subscriptions`
// (service role; the table's RLS lets only the platform owner write, so the webhook
// is the sole writer). This function never writes the subscription row itself; it
// only collects payment and hands the signed bridge to the webhook (§18 — one writer).
//
// JWT-gated (verify_jwt=true): the subscriber is derived server-side from their
// session — actor from getUser(token), tenant from profiles.active_tenant_id. A body
// tenant_id is honored ONLY for a platform owner; everyone else subscribes their own
// active tenant. The tenant is NEVER trusted from the body (§9).
//
// TWO PATHS (B-Platform pay-before-workspace):
//   • GRANDFATHERED upgrade — the caller ALREADY has a workspace
//     (profiles.active_tenant_id resolves, or they own a top-level tenant). The signed
//     metadata CARRIES tenant_id, and the webhook simply upserts the subscription onto
//     that existing tenant (no provisioning). Full pre-charge gates apply (below).
//   • ONBOARDING (the dominant new-customer path) — a freshly-signed-up auth user with
//     NO tenant yet (active_tenant_id NULL AND owns no top-level tenant). We do NOT
//     require admin/tenant (there is none to be admin of). The signed metadata OMITS
//     tenant_id — and that ABSENCE is the webhook's signal to PROVISION the tenant +
//     owner role + subscription on payment (provision_tenant_as, §32 idempotent). The
//     self-serve/amount gate still applies to this path too.
//
// PRE-CHARGE AUTHORIZATION PARITY (§13 — money-movement): before any Stripe session
// is created we mirror the EXACT gate the webhook fulfillment relies on.
//   • the plan must be SELF-SERVE, i.e. the chosen period's price > 0 → else 400.
//     (This rejects the enterprise/custom plan, whose prices are 0 → "contact sales".)
//     Applies to BOTH paths — we never mint a $0 recurring session.
//   • GRANDFATHERED path only — the webhook upserts `platform_subscriptions` onto an
//     existing tenant under the service role, and the only human who may subscribe a
//     tenant is a tenant admin — so we FAIL CLOSED unless that holds:
//       – is_tenant_admin_as(actor, tenant) must be true       → else 403 (never charge).
//         (NO owner bypass — ownership alone does not subscribe a tenant.)
//       – the tenant must NOT already carry a live subscription → else 409.
//         (Prevents a double-subscribe; manage/cancel/upgrade is a follow-up surface.)
//   • ONBOARDING path — no tenant exists yet, so there is no admin/already-subscribed
//     gate to run; provision-on-pay creates the owner. We only defensively confirm the
//     user does NOT already own a top-level tenant (which would make it grandfathered).
// This guarantees we never capture money we can't cleanly fulfill.
//
// §38: this is a Tier-1 Paige-HELD rail — Paige is merchant of record for its own
// platform subscription (correct). It is a PLAIN platform charge: no transfer_data,
// no application_fee (that pattern is only for tenant→client destination charges).
//
// Price: the plan rows have stripe_price_id = NULL and a single monthly/annual price
// pair, so we build an INLINE `price_data` with a recurring interval derived from
// billing_period. Inline is correct AND self-contained — it lets one plan row serve
// both monthly and annual without pre-provisioning two Stripe Price objects.
//
// Stripe metadata is the SIGNED bridge the webhook trusts (§9): it carries
// `platform_plan_slug` (the discriminant), platform_plan_id, tenant_id,
// actor_user_id, and billing_period. It is set on BOTH the session AND
// subscription_data so the customer.subscription.* lifecycle events (update/cancel)
// also carry `platform_plan_slug` and route to the platform-subscription arms. It
// NEVER sets tenant_price_id or marketplace_item_slug — those are other arms'
// discriminants and would collide.
//
// POST { plan_slug, billing_period?, success_path?, cancel_path? }  -> { url }

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

  // planSlug may be supplied by the body OR derived from an invite token below,
  // so it is reassignable and the empty check is deferred until after invite
  // resolution.
  let planSlug = String(body.plan_slug ?? "");

  const billingPeriod = body.billing_period === "annual" ? "annual" : "monthly";

  const admin = createClient(SUPA_URL, SUPA_SRK);

  // ── AUTH: resolve the subscriber from their session, never from the body ───────
  // getUser via the anon key + the caller's bearer — the actor is auth.uid().
  const userClient = createClient(SUPA_URL, SUPA_ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) return json(401, { error: "Unauthorized" });
  const actorUserId = user.id;

  // Subscriber tenant: a body override is honored ONLY for a platform owner; everyone
  // else subscribes their own active tenant (§9 — never trust body tenant_id).
  // is_platform_owner() is auth.uid()-based, so it MUST run on the USER-scoped
  // client — on the service-role client auth.uid() is NULL and it is dead code.
  // A NULL tenant is NOT an error here: it is the ONBOARDING signal (a freshly-
  // signed-up auth user with no workspace yet) — the branch below routes it to the
  // provision-on-pay path.
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

  // ── §217 SUB-ACCOUNT REJECT (server-derived, never body-trusted) ───────────────
  // A sub-account under an agency does NOT independently subscribe to a platform plan
  // — the parent agency's plan covers it (§9 tenant seam, §17 unlimited-sub NRR, §38
  // money boundary). If the RESOLVED tenant carries a parent, refuse BEFORE any Stripe
  // call, on BOTH the grandfathered and body-override(owner) paths. `tenantId` is null
  // here only for onboarding (no workspace yet) — nothing to reject, and the onboarding
  // branch below already restricts owned-tenant grandfathering to top-level tenants.
  // This fires BEFORE invite-token resolution ON PURPOSE: a super-admin trial invite is
  // granted at the AGENCY level, never to a sub-account, so a sub-account is refused
  // even with an invite. DISTINCT from the onboarding branch's `parent_tenant_id IS NULL`
  // owned-tenant *filter* (~:281, which selects which owned top-level tenant to
  // grandfather) — this is a separate REJECT on an already-resolved sub-account tenant.
  if (tenantId) {
    const { data: scopeRow, error: scopeErr } = await admin
      .from("tenants")
      .select("parent_tenant_id")
      .eq("id", tenantId)
      .maybeSingle();
    if (scopeErr) return json(400, { error: scopeErr.message });
    if (scopeRow?.parent_tenant_id) {
      return json(403, {
        error: "sub_account_billing_managed_by_agency",
        detail:
          "This workspace runs on its parent agency's plan. Platform billing is managed by the agency — you can manage your own client billing under Setup.",
      });
    }
  }

  // ── INVITE TOKEN (super-admin 30-day trial invite) ─────────────────────────────
  // Optional signed invite. When present, plan + trial length are derived
  // AUTHORITATIVELY from the token (NEVER the body), so a super-admin invite grants
  // exactly the plan/trial it was minted for. get_platform_invite is leak-safe
  // (valid=false for missing/expired/consumed) and never exposes the token table (§9).
  const inviteToken =
    typeof body.invite_token === "string" && body.invite_token
      ? (body.invite_token as string)
      : null;
  let inviteTrialDays: number | null = null;
  if (inviteToken) {
    const { data: inv, error: invErr } = await admin.rpc("get_platform_invite", {
      _token: inviteToken,
    });
    if (invErr) return json(400, { error: invErr.message });
    const invRow = Array.isArray(inv) ? inv[0] : inv;
    if (!invRow || invRow.valid !== true) {
      return json(400, {
        error: "invite_invalid",
        detail: "This invite is invalid, expired, or already used.",
      });
    }
    // The token dictates plan + trial, overriding any body value.
    planSlug = String(invRow.plan_slug);
    inviteTrialDays = Number(invRow.trial_period_days) || 30;
  }

  // Deferred empty-slug guard (post-invite): every path must now have a slug.
  if (!planSlug) return json(400, { error: "plan_slug_required" });

  // ── LOAD the plan (service role) ───────────────────────────────────────────────
  const { data: plan, error: planErr } = await admin
    .from("platform_subscription_plans")
    .select(
      "id, slug, name, monthly_price_cents, annual_price_cents, stripe_price_id, is_active",
    )
    .eq("slug", planSlug)
    .maybeSingle();
  if (planErr) return json(400, { error: planErr.message });
  if (!plan || plan.is_active !== true) {
    return json(404, { error: "plan_not_found" });
  }

  // ── SELF-SERVE / AMOUNT GATE (§13 — applies to BOTH paths) ─────────────────────
  // Enterprise/custom is NOT self-serve (its prices are 0). The chosen period's price
  // must be a real, positive amount or we refuse and point to sales, rather than mint
  // a $0 recurring session — this fires before EITHER path, so we never open a free
  // checkout whether the caller is onboarding or grandfathered.
  // Annual falls back to 12× monthly when no explicit annual price is set — this
  // MATCHES what the Setup › Billing card renders (annual = annual_price_cents ??
  // monthly*12), so the UI can never show a Subscribe the edge fn would 400 on.
  const monthlyCents = Number(plan.monthly_price_cents);
  const amount =
    billingPeriod === "annual"
      ? Number(plan.annual_price_cents) > 0
        ? Number(plan.annual_price_cents)
        : monthlyCents > 0
          ? monthlyCents * 12
          : 0
      : monthlyCents;
  if (!(Number(amount) > 0)) {
    return json(400, {
      error: "plan_not_self_serve",
      detail: "Contact sales for this plan.",
    });
  }

  // ── PATH BRANCH: grandfathered (has workspace) vs onboarding (provision-on-pay) ──
  // `onboarding` stays true only when the caller has NO tenant at all — that is the
  // signal to OMIT tenant_id from the signed metadata so the webhook provisions.
  let onboarding = false;
  if (tenantId) {
    // ── GRANDFATHERED: an existing tenant becomes/updates a Paige subscriber ───────
    // Fail closed BEFORE any Stripe session, mirroring exactly what the webhook's
    // service-role upsert onto this existing tenant relies on.
    // (1) Admin gate — only a tenant admin may subscribe the tenant. No owner bypass:
    //     an owner is not automatically an admin of an arbitrary tenant, and the
    //     webhook's write is tenant-scoped, so we mirror the human gate exactly.
    const { data: isAdmin, error: adminErr } = await admin.rpc(
      "is_tenant_admin_as",
      { _actor: actorUserId, _tenant: tenantId },
    );
    if (adminErr) return json(400, { error: adminErr.message });
    if (isAdmin !== true) {
      return json(403, { error: "Not authorized for this tenant" });
    }
    // (2) Already-subscribed guard — one live subscription per tenant. A tenant already
    //     'active'/'trialing'/'past_due' must manage/cancel (follow-up surface), not
    //     open a second checkout that would create a duplicate subscription row.
    const { data: existingSub, error: existingErr } = await admin
      .from("platform_subscriptions")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "trialing", "past_due"])
      .maybeSingle();
    if (existingErr) return json(400, { error: existingErr.message });
    if (existingSub) {
      return json(409, { error: "already_subscribed" });
    }
  } else {
    // ── ONBOARDING: freshly-signed-up auth user, no workspace yet ──────────────────
    // Defensive (§32): confirm the user does NOT already OWN a top-level tenant. A
    // profile whose active_tenant_id merely wasn't backfilled would still own one; if
    // so, treat this as the grandfathered path against that tenant (never double-
    // provision — provision_tenant_as is idempotent, but we also refuse to open a
    // second checkout for an already-subscribed owner).
    const { data: ownedTenant, error: ownedErr } = await admin
      .from("tenants")
      .select("id")
      .eq("owner_user_id", actorUserId)
      .is("parent_tenant_id", null)
      .maybeSingle();
    if (ownedErr) return json(400, { error: ownedErr.message });
    if (ownedTenant?.id) {
      tenantId = ownedTenant.id;
      const { data: isAdmin, error: adminErr } = await admin.rpc(
        "is_tenant_admin_as",
        { _actor: actorUserId, _tenant: tenantId },
      );
      if (adminErr) return json(400, { error: adminErr.message });
      if (isAdmin !== true) {
        return json(403, { error: "Not authorized for this tenant" });
      }
      const { data: existingSub, error: existingErr } = await admin
        .from("platform_subscriptions")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .in("status", ["active", "trialing", "past_due"])
        .maybeSingle();
      if (existingErr) return json(400, { error: existingErr.message });
      if (existingSub) {
        return json(409, { error: "already_subscribed" });
      }
    } else {
      onboarding = true;
    }
  }

  // ── PRICE (inline recurring; plan.stripe_price_id is NULL and can't carry annual) ─
  const interval = billingPeriod === "annual" ? "year" : "month";

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-11-20.acacia" });

  const origin = resolveOrigin(req);
  // Onboarding lands on a post-payment WAIT route (/welcome) — the webhook is
  // provisioning the tenant asynchronously, so the app polls there until the
  // workspace + subscription exist. Grandfathered stays on the in-app billing surface.
  const successPath = safePath(
    body.success_path,
    onboarding
      ? "/welcome?checkout=success"
      : "/admin/setup/billing?subscribe=success",
  );
  const cancelPath = safePath(
    body.cancel_path,
    onboarding
      ? "/pricing?checkout=cancelled"
      : "/admin/setup/billing?subscribe=cancelled",
  );
  const successUrl =
    origin +
    successPath +
    (successPath.includes("?") ? "&" : "?") +
    "session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl = origin + cancelPath;

  // Stripe-SIGNED metadata — the ONLY thing stripe-webhook trusts (§9). The slug is
  // the webhook's discriminant for this arm. Set on BOTH the session AND
  // subscription_data so the customer.subscription.* lifecycle events also carry it.
  // NEVER set tenant_price_id / marketplace_item_slug — those are other arms'
  // discriminants and would collide.
  // ONBOARDING omits tenant_id ON PURPOSE — its ABSENCE is the webhook's signal to
  // PROVISION a new tenant + owner role for actor_user_id on payment. GRANDFATHERED
  // carries tenant_id so the webhook upserts onto the existing tenant (no provision).
  const md: Record<string, string> = {
    platform_plan_slug: plan.slug,
    platform_plan_id: String(plan.id),
    actor_user_id: actorUserId,
    billing_period: billingPeriod,
  };
  if (!onboarding && tenantId) {
    md.tenant_id = tenantId;
  }
  // Carry the invite token in the SIGNED metadata so the webhook can mark it
  // consumed on provision (§9 — the webhook trusts only signed metadata).
  if (inviteToken) {
    md.invite_token = inviteToken;
  }

  // 14-day self-serve trial by default; an invite dictates its own trial (30d).
  // Enterprise is already 400'd by the self-serve gate, so every plan reaching
  // here is solo/agency and receives a trial. Card is collected upfront (Checkout
  // mode:"subscription"); the first charge fires when the trial ends.
  const trialDays = inviteTrialDays ?? 14;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Number(amount),
          recurring: { interval },
          product_data: { name: `Paige ${plan.name} (${billingPeriod})` },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: user.email ?? undefined,
    metadata: md,
    // §38 Tier-1 Paige-held rail: a plain platform charge — Paige is merchant of
    // record, so NO transfer_data / application_fee.
    subscription_data: { metadata: md, trial_period_days: trialDays },
  };

  console.log(
    `[platform-subscription-checkout] path=${onboarding ? "onboarding" : "grandfathered"} ` +
      `tenant=${tenantId ?? "(provision-on-pay)"} actor=${actorUserId} plan=${plan.slug} ` +
      `billing_period=${billingPeriod} amount=${Number(amount)}`,
  );

  // §13/§32 double-charge guard: on the ONBOARDING path there is no tenant/sub yet, so
  // two rapid checkouts (double-click / two tabs) would each mint a DISTINCT Stripe
  // subscription and the webhook would provision one tenant but attach BOTH subs —
  // a double charge. A Stripe idempotency key keyed on actor+plan+period makes repeated
  // create() calls in Stripe's 24h window return the SAME session, so the buyer can
  // only ever open one live checkout per plan choice. (Grandfathered already guards via
  // the already-subscribed 409, so the key is scoped to the onboarding lane.)
  // Invite discriminant on the idempotency key so an invite-driven checkout is a
  // distinct idempotent slot (and the otherwise key-less grandfathered path also
  // gets a key when an invite is present, preventing a double invite redemption).
  const inviteSuffix = inviteToken ? `_inv_${inviteToken.slice(0, 16)}` : "";
  const createOpts = onboarding
    ? {
        idempotencyKey: `psub_onboard_${actorUserId}_${plan.slug}_${billingPeriod}${inviteSuffix}`,
      }
    : inviteToken
      ? {
          idempotencyKey: `psub_grand_${tenantId}_${plan.slug}_${billingPeriod}${inviteSuffix}`,
        }
      : undefined;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(params, createOpts);
  } catch (e) {
    console.error("[platform-subscription-checkout] stripe error:", e);
    return json(502, {
      error: "stripe_session_failed",
      detail: (e as Error).message,
    });
  }

  return json(200, { url: session.url });
});
