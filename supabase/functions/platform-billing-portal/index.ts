// platform-billing-portal — Billing Foundation A: open Stripe's hosted customer portal for the
// caller's OWN workspace, as its OWNER, through the ONE server-authoritative mapping.
//
// This replaces, for PLATFORM billing, the legacy `customer-portal` lookup that found a Stripe
// Customer by the signed-in person's EMAIL (finding A1, HIGH). Nothing here reads a request body;
// the workspace and the caller's authority come from get_workspace_billing_authority(), which is
// auth.uid()-keyed and resolves the workspace through billing_active_tenant_id() — no agency,
// operator or oldest-membership fallback (design v2 §4.1–§4.3).
//
// Owner rulings encoded (packet §4.2): R1 identity per top-level workspace, never email · R2 the
// workspace OWNER only; Admin/Member fail closed · R3 Stripe-hosted portal, PAIGE never touches
// card data · R8 sub-account/Agency/Enterprise are not_applicable, never "no subscription" · R13
// absence of a mapping is refused, never inferred around.
//
// DEFAULT OFF. PLATFORM_BILLING_PORTAL_ENABLED must be exactly "true" or every call is refused
// `not_enabled` (audited). The flag is flipped only after the authenticated owner drive proves
// the mapping + authority boundary on the deployed function (design v2 T10, §10).
//
// The decision itself is pure (decide.ts, tested against every row of design §6). This file only
// gathers inputs and performs, in order: refuse → audit `requested` (fail closed) → Stripe → audit
// `opened` → return { url, tenant_id }. The URL is never stored anywhere.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { canonicalAppUrl } from "../_shared/canonical-app-url.ts";
import { decidePortalAccess, stripeKeyNameFor, type WorkspaceBillingAuthority } from "./decide.ts";

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

// Never logs an email, a customer id, a URL, or a raw provider message (§13 T12).
const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[PLATFORM-BILLING-PORTAL] ${step}${details ? " " + JSON.stringify(details) : ""}`);
};

type AuditClient = ReturnType<typeof createClient>;

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
    console.error(`[PLATFORM-BILLING-PORTAL] audit insert failed for ${row.action}: ${error.code ?? "unknown"}`);
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const flagEnabled = Deno.env.get("PLATFORM_BILLING_PORTAL_ENABLED") === "true";

  // Service-role client for the mapping read and every audit row (design v2 C8: a refusal audited
  // under the user client could be RLS-blocked and go unrecorded).
  const admin = createClient(supabaseUrl, serviceKey);

  // 1. Who is calling. verify_jwt=true already rejected an unsigned request; getUser binds the
  //    actor to the token, never to anything in the body.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
  const user = userData?.user ?? null;
  if (userErr || !user) return json(401, { error: "unauthenticated" });

  // 2. What may this caller do, here. auth.uid()-keyed RPC on the user client; body ignored.
  let authority: WorkspaceBillingAuthority | null = null;
  const { data: authRows, error: authErr } = await userClient.rpc("get_workspace_billing_authority");
  if (!authErr) {
    const row = Array.isArray(authRows) ? authRows[0] : authRows;
    if (row && typeof row === "object") authority = row as WorkspaceBillingAuthority;
  } else {
    logStep("authority read failed", { code: authErr.code ?? "unknown" });
  }

  // 3. The pure decision.
  const decision = decidePortalAccess(flagEnabled, authority);
  if (!decision.allow) {
    await audit(admin, {
      tenantId: authority?.tenant_id ?? null,
      actorUserId: user.id,
      actorRole: authority?.role ?? null,
      action: "platform_billing_portal_refused",
      payload: { reason: decision.code, scope: authority?.scope ?? null, state: authority?.billing_account_state ?? null },
    });
    logStep("refused", { reason: decision.code });
    return json(decision.status, { error: decision.code });
  }
  const tenantId = decision.tenantId;

  // 4. The mapping, read as service role (tenants cannot SELECT this table; the RPC already said
  //    the state is `mapped`, so an absent row here is a race and is refused, not guessed).
  const { data: mapping, error: mapErr } = await admin
    .from("platform_billing_accounts")
    .select("stripe_customer_id, stripe_account")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (mapErr || !mapping) {
    await audit(admin, { tenantId, actorUserId: user.id, actorRole: authority!.role, action: "platform_billing_portal_refused", payload: { reason: "billing_account_absent" } });
    return json(409, { error: "billing_account_absent" });
  }

  // 5. The Stripe key BY NAME for the mapping's account. No cross-account fallback (T11).
  const keyName = stripeKeyNameFor(String(mapping.stripe_account));
  const stripeKey = keyName ? Deno.env.get(keyName) : undefined;
  if (!stripeKey) {
    await audit(admin, { tenantId, actorUserId: user.id, actorRole: authority!.role, action: "platform_billing_portal_refused", payload: { reason: "needs_config", missing: keyName ?? "stripe_account" } });
    return json(503, { error: "needs_config" });
  }

  // 6. Where the portal returns: the canonical Solo Settings → Billing address for THIS workspace.
  //    An absolute URL is required by Stripe; a workspace with no account number cannot be routed
  //    and is refused rather than sent to a legacy path (design v2 C7).
  const { data: tenantRow } = await admin.from("tenants").select("account_number").eq("id", tenantId).maybeSingle();
  const returnUrl = canonicalAppUrl({ actor: "account", tier: "solo", account: tenantRow?.account_number ?? null, destination: "billing" });
  if (!returnUrl) {
    await audit(admin, { tenantId, actorUserId: user.id, actorRole: authority!.role, action: "platform_billing_portal_refused", payload: { reason: "needs_config", missing: "account_number" } });
    return json(503, { error: "needs_config" });
  }

  // 7. Record the act BEFORE the provider call, and fail closed if the record cannot be written:
  //    a portal URL with no audit row would break F-A6 silently (design v2 C8).
  const requested = await audit(admin, {
    tenantId, actorUserId: user.id, actorRole: authority!.role,
    action: "platform_billing_portal_requested",
    payload: { stripe_account: mapping.stripe_account },
  });
  if (!requested) return json(500, { error: "audit_failed" });

  // 8. The one side effect. The raw provider message is never returned (it may carry the id).
  let url: string;
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.billingPortal.sessions.create({
      customer: String(mapping.stripe_customer_id),
      return_url: returnUrl,
    });
    url = session.url;
  } catch (e) {
    console.error("[PLATFORM-BILLING-PORTAL] stripe portal session failed", (e as { type?: string })?.type ?? "unknown");
    await audit(admin, { tenantId, actorUserId: user.id, actorRole: authority!.role, action: "platform_billing_portal_refused", payload: { reason: "billing_account_unresolvable", stripe_account: mapping.stripe_account } });
    return json(409, { error: "billing_account_unresolvable" });
  }

  // 9. Opened. A failure here is logged loudly but does not take the URL back — the act happened.
  await audit(admin, {
    tenantId, actorUserId: user.id, actorRole: authority!.role,
    action: "platform_billing_portal_opened",
    payload: { stripe_account: mapping.stripe_account },
  });
  logStep("opened", { stripe_account: String(mapping.stripe_account) });

  // The tenant id travels with the URL so the caller can refuse to open it after a workspace switch.
  return json(200, { url, tenant_id: tenantId });
});
