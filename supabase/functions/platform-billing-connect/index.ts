// platform-billing-connect — Billing Experience item 4 (owner brief 2026-09-03): let a Solo
// workspace OWNER set up (or replace) the payment method PAIGE Platform charges for this
// workspace's own subscription. This is PLATFORM billing only — never the Sales/client-payment
// feature (§38 money boundary: what a Solo business charges its OWN customers is a completely
// different rail, on the tenant's own processor).
//
// The one side effect here is Stripe-side only: creating (or reusing) a Stripe Customer and
// opening a `mode: "setup"` Checkout Session — a secure, Stripe-hosted, tokenized collection
// page. PAIGE never receives or stores a raw card number, CVV, or bank credential (R3, unchanged
// from the portal). NOTHING is written to `platform_billing_accounts` from this function — that
// write happens ONLY in stripe-webhook, on a VERIFIED `checkout.session.completed` event, via the
// shared `upsertBillingAccount()` / `upsertPaymentMethod()` writers (§18 one writer). This
// function is a caller of that seam, not a second writer of it. So: an abandoned/failed/expired
// checkout leaves the platform's own records byte-for-byte unchanged — no plan, no charge, no
// promotional-access change, exactly as the brief requires.
//
// AUTHORITY: reuses get_workspace_billing_authority() (Foundation A, §18 — the ONE resolver for
// "who may act on this workspace's platform billing"), through the SAME pure decision shape as
// platform-billing-portal, but with a DIFFERENT decision (decide.ts): the portal only opens for an
// ALREADY-mapped workspace; connect must also allow `absent`, because that is the ordinary state
// of every workspace before its first payment method. `ambiguous` still refuses — a workspace
// whose provider records disagree gets a platform review, never a new provider object created
// over the conflict.
//
// Server-side tenant/user identity are enforced at every step: the caller's workspace comes ONLY
// from the signed-in session (getUser + the auth.uid()-keyed authority RPC), never a request body
// — there is no request body read here at all. The Stripe-side customer id used is EITHER the one
// already on record for this exact tenant (verified by direct read of the mapping row, service
// role — the tenant cannot SELECT that table itself) OR a freshly created one; either way it can
// never be supplied by the caller.
//
// verify_jwt defaults to true (not listed in config.toml — the same posture as
// platform-billing-portal and platform-subscription-checkout).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { canonicalAppUrl } from "../_shared/canonical-app-url.ts";
import { decideConnectAccess, stripeKeyNameFor, type WorkspaceBillingAuthority } from "./decide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Never logs an email, a customer id, a URL, or a raw provider message (§13 T12 — same discipline
// as platform-billing-portal).
const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[PLATFORM-BILLING-CONNECT] ${step}${details ? " " + JSON.stringify(details) : ""}`);
};

type AuditClient = SupabaseClient;

async function audit(
  admin: AuditClient,
  row: {
    tenantId: string | null;
    actorUserId: string | null;
    actorRole: string | null;
    action: string;
    payload: Record<string, unknown>;
  },
): Promise<boolean> {
  const { error } = await admin.from("paige_audit_log").insert({
    tenant_id: row.tenantId,
    actor_user_id: row.actorUserId,
    actor_role: row.actorRole,
    action: row.action,
    target_type: "platform_billing_account",
    target_id: row.tenantId,
    payload: row.payload,
  });
  if (error) {
    console.error(`[PLATFORM-BILLING-CONNECT] audit insert failed for ${row.action}: ${error.code ?? "unknown"}`);
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Service-role client for the mapping read/write and every audit row (same reasoning as the
  // portal, design v2 C8: a refusal audited under the user client could be RLS-blocked and go
  // unrecorded — this table's RLS lets only the platform owner/operator read or write it).
  const admin = createClient(supabaseUrl, serviceKey);

  // 1. Who is calling. verify_jwt=true already rejected an unsigned request; getUser binds the
  //    actor to the token, never to anything a body could claim.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
  const user = userData?.user ?? null;
  if (userErr || !user) return json(401, { error: "unauthenticated" });

  // 2. What may this caller do, here. auth.uid()-keyed RPC on the user client; no body to trust.
  let authority: WorkspaceBillingAuthority | null = null;
  const { data: authRows, error: authErr } = await userClient.rpc("get_workspace_billing_authority");
  if (!authErr) {
    const row = Array.isArray(authRows) ? authRows[0] : authRows;
    if (row && typeof row === "object") authority = row as WorkspaceBillingAuthority;
  } else {
    logStep("authority read failed", { code: authErr.code ?? "unknown" });
  }

  // 3. The pure decision.
  const decision = decideConnectAccess(authority);
  if (!decision.allow) {
    await audit(admin, {
      tenantId: authority?.tenant_id ?? null,
      actorUserId: user.id,
      actorRole: authority?.role ?? null,
      action: "platform_billing_connect_refused",
      payload: { reason: decision.code, scope: authority?.scope ?? null, state: authority?.billing_account_state ?? null },
    });
    logStep("refused", { reason: decision.code });
    return json(decision.status, { error: decision.code });
  }
  const tenantId = decision.tenantId;

  // 4. Which Stripe account: reuse the account already on record for a MAPPED workspace (never
  //    let a second account start writing over an existing mapping — T11), or 'legacy' for a
  //    workspace's first connect (matches platform-subscription-checkout's own account choice, so
  //    a workspace that later starts a real subscription is never split across two accounts).
  let existingCustomerId: string | null = null;
  let stripeAccount: "legacy" | "v2" = "legacy";
  if (decision.billingAccountState === "mapped") {
    const { data: mapping, error: mapErr } = await admin
      .from("platform_billing_accounts")
      .select("stripe_customer_id, stripe_account")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (mapErr || !mapping) {
      // The authority RPC just said 'mapped' — an absent row here is a race, not a fact. Refuse
      // rather than silently falling back to "create a fresh customer" (R13).
      await audit(admin, { tenantId, actorUserId: user.id, actorRole: authority!.role, action: "platform_billing_connect_refused", payload: { reason: "billing_account_unresolvable" } });
      return json(409, { error: "billing_account_unresolvable" });
    }
    existingCustomerId = String(mapping.stripe_customer_id);
    stripeAccount = mapping.stripe_account === "v2" ? "v2" : "legacy";
  }

  // 5. The Stripe key BY NAME for the chosen account. No cross-account fallback (T11).
  const keyName = stripeKeyNameFor(stripeAccount);
  const stripeKey = keyName ? Deno.env.get(keyName) : undefined;
  if (!stripeKey) {
    await audit(admin, { tenantId, actorUserId: user.id, actorRole: authority!.role, action: "platform_billing_connect_refused", payload: { reason: "needs_config", missing: keyName ?? "stripe_account" } });
    return json(503, { error: "needs_config" });
  }

  // 6. Where Stripe returns: the canonical Solo Settings → Billing address for THIS workspace,
  //    with a query flag the frontend uses to know a return just happened — never as an
  //    authority signal (the actual grant is entirely server-side, in the webhook, keyed on the
  //    session's SIGNED metadata; this flag only tells the page "go re-read your real status").
  const { data: tenantRow } = await admin.from("tenants").select("account_number").eq("id", tenantId).maybeSingle();
  const baseReturnUrl = canonicalAppUrl({ actor: "account", tier: "solo", account: tenantRow?.account_number ?? null, destination: "billing" });
  if (!baseReturnUrl) {
    await audit(admin, { tenantId, actorUserId: user.id, actorRole: authority!.role, action: "platform_billing_connect_refused", payload: { reason: "needs_config", missing: "account_number" } });
    return json(503, { error: "needs_config" });
  }
  const successUrl = `${baseReturnUrl}?payment_setup=success`;
  const cancelUrl = `${baseReturnUrl}?payment_setup=cancelled`;

  // 7. Record the act BEFORE the provider call, and fail closed if the record cannot be written
  //    (same discipline as the portal, design v2 C8).
  const requested = await audit(admin, {
    tenantId, actorUserId: user.id, actorRole: authority!.role,
    action: "platform_billing_connect_requested",
    payload: { stripe_account: stripeAccount, reusing_customer: existingCustomerId !== null },
  });
  if (!requested) return json(500, { error: "audit_failed" });

  // 8. The provider side effects. The Customer is created HERE, on this explicit owner click —
  //    never during deploy, migration, background reconciliation, or a page load — and ONLY when
  //    no customer already exists for this workspace. An idempotency key scoped to the tenant
  //    means a double-click (two tabs, a slow network retry) can never mint two customers for the
  //    same workspace within Stripe's 24h idempotency window.
  let url: string;
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customerId = existingCustomerId ?? (
      await stripe.customers.create(
        { email: user.email ?? undefined, metadata: { tenant_id: tenantId, source: "platform_billing_connect" } },
        { idempotencyKey: `pbc_customer_${tenantId}` },
      )
    ).id;

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Stripe-SIGNED metadata — the ONLY thing stripe-webhook trusts (§9). A discriminant that
      // collides with no other arm's key (tenant_price_id / marketplace_item_slug /
      // platform_plan_slug) and carries everything the webhook needs to attribute the completed
      // setup to exactly this workspace, without trusting anything the browser could echo back.
      metadata: { platform_billing_connect_tenant_id: tenantId, actor_user_id: user.id },
    });
    if (!session.url) throw new Error("no_session_url");
    url = session.url;
  } catch (e) {
    console.error("[PLATFORM-BILLING-CONNECT] stripe setup session failed", (e as { type?: string })?.type ?? "unknown");
    await audit(admin, { tenantId, actorUserId: user.id, actorRole: authority!.role, action: "platform_billing_connect_refused", payload: { reason: "billing_account_unresolvable", stripe_account: stripeAccount } });
    return json(409, { error: "billing_account_unresolvable" });
  }

  // 9. Opened. A failure here is logged loudly but does not take the URL back — the act happened.
  await audit(admin, {
    tenantId, actorUserId: user.id, actorRole: authority!.role,
    action: "platform_billing_connect_opened",
    payload: { stripe_account: stripeAccount },
  });
  logStep("opened", { stripe_account: stripeAccount });

  // The tenant id travels with the URL so the caller can refuse to open it after a workspace switch.
  return json(200, { url, tenant_id: tenantId });
});
