import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { canonicalAppUrl } from "../_shared/canonical-app-url.ts";
import {
  SOLO_BETA_OFFER_CODE,
  SOLO_BETA_PRODUCT_NAME,
  validateSoloBetaOffer,
} from "../_shared/solo-beta-offer.ts";
import { readSubscriptionItemPeriod } from "../_shared/solo-beta-stripe-shapes.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY_V2") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey || !stripeKey) {
    return json(503, { error: "needs_config" });
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "unauthenticated" });
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json(401, { error: "unauthenticated" });
  const user = authData.user;

  const { data: authorityRows, error: authorityError } = await caller.rpc("get_workspace_billing_authority");
  const authority = Array.isArray(authorityRows) ? authorityRows[0] : authorityRows;
  if (authorityError || !authority) return json(503, { error: "authority_unreadable" });
  if (authority.scope !== "top_level_solo") return json(403, { error: "not_applicable_scope" });
  if (authority.can_manage_billing !== true || authority.role !== "owner") {
    return json(403, { error: "owner_only" });
  }
  const tenantId = typeof authority.tenant_id === "string" ? authority.tenant_id : null;
  if (!tenantId) return json(409, { error: "no_active_workspace" });

  const [subscriptionResult, mappingResult, tenantResult, offerResult] = await Promise.all([
    admin.from("platform_subscriptions")
      .select("stripe_subscription_id,stripe_customer_id,stripe_product_id,stripe_price_id,offer_code,provider_mode")
      .eq("tenant_id", tenantId).eq("offer_code", SOLO_BETA_OFFER_CODE).maybeSingle(),
    admin.from("platform_billing_accounts")
      .select("stripe_customer_id,stripe_account").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("tenants").select("account_number").eq("id", tenantId).maybeSingle(),
    admin.from("platform_subscription_offers")
      .select("stripe_product_id,stripe_price_id,status,provider_mode,trial_days")
      .eq("offer_code", SOLO_BETA_OFFER_CODE).maybeSingle(),
  ]);
  if (subscriptionResult.error || mappingResult.error || tenantResult.error || offerResult.error) {
    return json(503, { error: "billing_account_unresolvable" });
  }
  const persisted = subscriptionResult.data;
  if (!persisted) return json(409, { error: "not_solo_beta" });
  const mapping = mappingResult.data;
  const offer = offerResult.data;
  if (!mapping || mapping.stripe_account !== "v2"
    || mapping.stripe_customer_id !== persisted.stripe_customer_id
    || persisted.provider_mode !== "test" || !persisted.stripe_subscription_id
    || !offer || offer.status !== "test_ready" || offer.provider_mode !== "test" || offer.trial_days !== 30
    || offer.stripe_product_id !== persisted.stripe_product_id
    || offer.stripe_price_id !== persisted.stripe_price_id) {
    return json(409, { error: "billing_account_unresolvable" });
  }
  const returnUrl = canonicalAppUrl({
    actor: "account",
    tier: "solo",
    account: tenantResult.data?.account_number ?? null,
    destination: "billing",
  });
  if (!returnUrl) return json(503, { error: "needs_config" });

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  try {
    const subscription = await stripe.subscriptions.retrieve(persisted.stripe_subscription_id, {
      expand: ["items.data.price.product"],
    });
    if (subscription.items.data.length !== 1) return json(409, { error: "billing_account_unresolvable" });
    const item = subscription.items.data[0];
    const price = item.price;
    const product = typeof price.product === "string" ? null : price.product;
    const productDeleted = product && "deleted" in product ? product.deleted : false;
    const customerId = typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
    const validation = validateSoloBetaOffer({
      offerCode: subscription.metadata?.offer_code ?? null,
      purpose: "lifecycle_sync",
      livemode: subscription.livemode,
      configuredProductId: offer.stripe_product_id,
      configuredPriceId: offer.stripe_price_id,
      observedProductId: product?.id ?? null,
      observedPriceId: price.id,
      priceActive: price.active,
      unitAmountCents: price.unit_amount,
      currency: price.currency,
      recurring: price.recurring
        ? { interval: price.recurring.interval, intervalCount: price.recurring.interval_count }
        : null,
      trialStart: subscription.trial_start,
      trialEnd: subscription.trial_end,
      paymentMethodCollected: Boolean(subscription.default_payment_method),
      subscriptionStatus: subscription.status,
    });
    if (!validation.ok || item.quantity !== 1 || !readSubscriptionItemPeriod(item)
      || !product || productDeleted || !("active" in product) || product.active !== true
      || !("name" in product) || product.name !== SOLO_BETA_PRODUCT_NAME
      || customerId !== mapping.stripe_customer_id) {
      return json(409, { error: "billing_account_unresolvable" });
    }
    const { error: requestedError } = await admin.from("paige_audit_log").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      actor_role: "owner",
      action: "solo_beta_billing_portal_requested",
      target_type: "platform_billing_account",
      target_id: tenantId,
      payload: { offer_code: SOLO_BETA_OFFER_CODE, provider_mode: "test" },
    });
    if (requestedError) return json(500, { error: "audit_failed" });

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    await admin.from("paige_audit_log").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      actor_role: "owner",
      action: "solo_beta_billing_portal_opened",
      target_type: "platform_billing_account",
      target_id: tenantId,
      payload: { offer_code: SOLO_BETA_OFFER_CODE, provider_mode: "test" },
    });
    return json(200, { url: portal.url, tenant_id: tenantId });
  } catch {
    return json(409, { error: "billing_account_unresolvable" });
  }
});
