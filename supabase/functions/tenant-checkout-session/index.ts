// Create a Stripe Checkout Session for a tenant's product using a destination
// charge: the platform account owns the session, an application fee is taken
// (tenants.platform_fee_bps), and the remainder is transferred to the
// tenant's connected Stripe account.
//
// PUBLIC endpoint (no auth) so the storefront /store/:slug page can call it.
//
// POST { price_id: uuid, success_url?: string, cancel_url?: string,
//        customer_email?: string }
//   -> { url, session_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!STRIPE_KEY) return json(500, { error: "stripe_not_configured" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const priceId = body.price_id as string;
  if (!priceId) return json(400, { error: "price_id_required" });

  const admin = createClient(SUPA_URL, SUPA_SRK);

  const { data: price } = await admin
    .from("tenant_prices")
    .select(
      "id, tenant_id, product_id, stripe_price_id, currency, unit_amount, billing_interval, active",
    )
    .eq("id", priceId)
    .maybeSingle();
  if (!price || !price.active) return json(404, { error: "price_not_found" });
  if (!price.stripe_price_id)
    return json(409, { error: "price_not_synced_to_stripe" });

  const { data: product } = await admin
    .from("tenant_products")
    .select("id, name, status")
    .eq("id", price.product_id)
    .single();
  if (!product || product.status !== "active")
    return json(404, { error: "product_unavailable" });

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, slug, name, platform_fee_bps, storefront_enabled")
    .eq("id", price.tenant_id)
    .single();
  if (!tenant || !tenant.storefront_enabled)
    return json(404, { error: "storefront_not_enabled" });

  const { data: connect } = await admin
    .from("tenant_stripe_accounts")
    .select("stripe_account_id, charges_enabled")
    .eq("tenant_id", price.tenant_id)
    .maybeSingle();
  if (!connect?.stripe_account_id || !connect.charges_enabled) {
    return json(409, { error: "tenant_payments_not_ready" });
  }

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-11-20.acacia" });

  const mode =
    price.billing_interval && price.billing_interval !== "one_time"
      ? "subscription"
      : "payment";

  const feeBps = tenant.platform_fee_bps ?? 0;
  const applicationFee = Math.floor((price.unit_amount * feeBps) / 10000);

  const successUrl =
    body.success_url ??
    `https://paigeagent.ai/store/${tenant.slug}/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    body.cancel_url ?? `https://paigeagent.ai/store/${tenant.slug}`;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode,
    line_items: [{ price: price.stripe_price_id, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: body.customer_email ?? undefined,
    metadata: {
      tenant_id: tenant.id,
      tenant_product_id: product.id,
      tenant_price_id: price.id,
    },
  };

  if (mode === "payment") {
    params.payment_intent_data = {
      application_fee_amount: applicationFee || undefined,
      transfer_data: { destination: connect.stripe_account_id },
    };
  } else {
    params.subscription_data = {
      application_fee_percent: feeBps > 0 ? feeBps / 100 : undefined,
      transfer_data: { destination: connect.stripe_account_id },
    };
  }

  const session = await stripe.checkout.sessions.create(params);

  await admin.from("tenant_orders").insert({
    tenant_id: tenant.id,
    product_id: product.id,
    price_id: price.id,
    stripe_session_id: session.id,
    customer_email: body.customer_email ?? null,
    amount_total: price.unit_amount,
    currency: price.currency,
    status: "pending",
    application_fee_amount: applicationFee || null,
    metadata: { mode },
  });

  return json(200, { url: session.url, session_id: session.id });
});
