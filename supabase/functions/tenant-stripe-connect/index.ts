// Tenant Stripe Connect — Express account onboarding & status refresh.
//
// Actions:
//   POST { action: "start_onboarding", return_url, refresh_url }
//     -> { url }  (AccountLink URL — redirect the tenant admin here)
//   POST { action: "refresh_status" }
//     -> { charges_enabled, payouts_enabled, details_submitted, requirements }
//
// Auth: caller must be an admin/owner of their active tenant.

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
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!STRIPE_KEY) return json(500, { error: "stripe_not_configured" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "unauthorized" });

  const admin = createClient(SUPA_URL, SUPA_SRK);
  const userClient = createClient(SUPA_URL, SUPA_SRK, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) return json(401, { error: "unauthorized" });

  // Resolve active tenant
  const { data: profile } = await admin
    .from("profiles")
    .select("active_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const tenantId = profile?.active_tenant_id;
  if (!tenantId) return json(400, { error: "no_active_tenant" });

  // Must be tenant admin
  const { data: membership } = await admin
    .from("tenant_members")
    .select("role,status")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    !membership ||
    membership.status !== "active" ||
    !["owner", "admin"].includes(membership.role)
  ) {
    return json(403, { error: "tenant_admin_required" });
  }

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name, slug")
    .eq("id", tenantId)
    .single();
  if (!tenant) return json(404, { error: "tenant_not_found" });

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-11-20.acacia" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const action = String(body.action ?? "");

  // Existing connect record (if any)
  const { data: existing } = await admin
    .from("tenant_stripe_accounts")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (action === "start_onboarding") {
    let accountId = existing?.stripe_account_id ?? null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email ?? undefined,
        metadata: {
          tenant_id: tenant.id,
          tenant_slug: tenant.slug ?? "",
          tenant_name: tenant.name ?? "",
        },
      });
      accountId = account.id;

      await admin.from("tenant_stripe_accounts").upsert(
        {
          tenant_id: tenant.id,
          stripe_account_id: accountId,
          account_type: "express",
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        },
        { onConflict: "tenant_id" },
      );
    }

    const link = await stripe.accountLinks.create({
      account: accountId!,
      refresh_url:
        String(body.refresh_url ?? "") || "https://paigeagent.ai/workspace/storefront",
      return_url:
        String(body.return_url ?? "") || "https://paigeagent.ai/workspace/storefront",
      type: "account_onboarding",
    });

    return json(200, { url: link.url, stripe_account_id: accountId });
  }

  if (action === "refresh_status") {
    if (!existing?.stripe_account_id) {
      return json(404, { error: "no_connected_account" });
    }
    const acct = await stripe.accounts.retrieve(existing.stripe_account_id);
    await admin
      .from("tenant_stripe_accounts")
      .update({
        charges_enabled: acct.charges_enabled,
        payouts_enabled: acct.payouts_enabled,
        details_submitted: acct.details_submitted,
        country: acct.country,
        default_currency: acct.default_currency,
        requirements: (acct.requirements as unknown) ?? null,
      })
      .eq("tenant_id", tenantId);

    return json(200, {
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      details_submitted: acct.details_submitted,
    });
  }

  if (action === "login_link") {
    if (!existing?.stripe_account_id)
      return json(404, { error: "no_connected_account" });
    const link = await stripe.accounts.createLoginLink(
      existing.stripe_account_id,
    );
    return json(200, { url: link.url });
  }

  return json(400, { error: "unknown_action" });
});
