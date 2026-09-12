import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  SOLO_BETA_OFFER_CODE,
  SOLO_BETA_PRODUCT_NAME,
  SOLO_BETA_TRIAL_DAYS,
  validateSoloBetaOffer,
} from "../_shared/solo-beta-offer.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});
const origins = new Set([
  "https://paigeagent.ai",
  "https://www.paigeagent.ai",
  "https://app.paigeagent.ai",
  "http://localhost:5173",
  "http://localhost:3000",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY_V2") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey || !stripeKey) {
    return json(503, { error: "solo_beta_configuration_unavailable" });
  }
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "authentication_required" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  if (body.offer_code !== SOLO_BETA_OFFER_CODE) {
    return json(400, { error: "solo_beta_offer_required" });
  }
  if ("plan_slug" in body || "account_type" in body || "billing_period" in body || "trial_period_days" in body) {
    return json(400, { error: "caller_selected_offer_not_allowed" });
  }

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  const user = authData.user;
  if (authError || !user) return json(401, { error: "authentication_required" });

  const [ownedResult, membershipsResult, subscriptionHistoryResult, intakeResult, offerResult, profileResult] = await Promise.all([
    admin.from("tenants").select("id").eq("owner_user_id", user.id).is("parent_tenant_id", null).limit(1),
    admin.from("tenant_members").select("tenant_id").eq("user_id", user.id).eq("status", "active").limit(1),
    admin.from("user_subscriptions").select("stripe_subscription_id,status").eq("user_id", user.id).not("stripe_subscription_id", "is", null).limit(1),
    admin.from("signup_intake").select("plan_slug,billing_period,account_type,agreement_slug,agreement_version,terms_accepted_at").eq("user_id", user.id).maybeSingle(),
    admin.from("platform_subscription_offers").select("offer_code,status,provider_mode,stripe_product_id,stripe_price_id,unit_amount_cents,currency,billing_interval,interval_count,trial_days").eq("offer_code", SOLO_BETA_OFFER_CODE).maybeSingle(),
    admin.from("profiles").select("consent_privacy_policy,consent_data_usage,consent_timestamp").eq("user_id", user.id).maybeSingle(),
  ]);
  if (ownedResult.error || membershipsResult.error || subscriptionHistoryResult.error || intakeResult.error || offerResult.error || profileResult.error) {
    return json(503, { error: "solo_beta_eligibility_unavailable" });
  }
  const owned = ownedResult.data;
  const memberships = membershipsResult.data;
  const subscriptionHistory = subscriptionHistoryResult.data;
  const intake = intakeResult.data;
  const offer = offerResult.data;
  const profile = profileResult.data;
  if ((owned?.length ?? 0) > 0 || (memberships?.length ?? 0) > 0 || (subscriptionHistory?.length ?? 0) > 0) {
    return json(409, { error: "existing_account_not_beta_eligible" });
  }
  if (!intake || intake.plan_slug !== "solo" || intake.billing_period !== "monthly" || intake.account_type !== "standalone" || !intake.terms_accepted_at || intake.agreement_slug !== "saas-standalone" || !intake.agreement_version) {
    return json(409, { error: "solo_beta_intake_incomplete" });
  }
  if (!profile?.consent_privacy_policy || !profile.consent_data_usage || !profile.consent_timestamp) {
    return json(409, { error: "solo_beta_signup_consent_incomplete" });
  }
  const { data: requiredDocs, error: requiredDocsError } = await admin.from("legal_documents")
    .select("slug,version").eq("is_current", true).eq("required_at_signup", true);
  if (requiredDocsError || !requiredDocs?.length) return json(503, { error: "solo_beta_eligibility_unavailable" });
  const { data: signupAcceptances, error: signupAcceptancesError } = await admin.from("legal_acceptances")
    .select("document_slug,document_version").eq("user_id", user.id)
    .in("document_slug", requiredDocs.map((document) => document.slug));
  if (signupAcceptancesError) return json(503, { error: "solo_beta_eligibility_unavailable" });
  const accepted = new Set((signupAcceptances ?? []).map((row) => `${row.document_slug}:${row.document_version}`));
  if (requiredDocs.some((document) => !accepted.has(`${document.slug}:${document.version}`))) {
    return json(409, { error: "solo_beta_signup_consent_incomplete" });
  }
  const { data: currentAgreement, error: agreementError } = await admin.from("legal_documents")
    .select("version").eq("slug", "saas-standalone").eq("is_current", true).maybeSingle();
  if (agreementError) return json(503, { error: "solo_beta_eligibility_unavailable" });
  if (!currentAgreement || intake.agreement_version !== currentAgreement.version) {
    return json(409, { error: "solo_beta_agreement_current_required" });
  }
  const { data: acceptance, error: acceptanceError } = await admin.from("legal_acceptances").select("id")
    .eq("user_id", user.id).eq("document_slug", "saas-standalone")
    .eq("document_version", currentAgreement.version).limit(1).maybeSingle();
  if (acceptanceError) return json(503, { error: "solo_beta_eligibility_unavailable" });
  if (!acceptance) return json(409, { error: "solo_beta_agreement_unpersisted" });
  if (!offer || offer.status !== "test_ready" || offer.provider_mode !== "test" || !offer.stripe_product_id || !offer.stripe_price_id || offer.trial_days !== SOLO_BETA_TRIAL_DAYS) {
    return json(503, { error: "solo_beta_configuration_unavailable" });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  let attempt = 0;
  let fencingToken: string | null = null;
  let idempotencySlot = 0;
  try {
    const price = await stripe.prices.retrieve(offer.stripe_price_id, { expand: ["product"] });
    const product = typeof price.product === "string" ? null : price.product;
    const validation = validateSoloBetaOffer({
      offerCode: SOLO_BETA_OFFER_CODE,
      purpose: "checkout_configuration",
      livemode: price.livemode,
      configuredProductId: offer.stripe_product_id,
      configuredPriceId: offer.stripe_price_id,
      observedProductId: typeof price.product === "string" ? price.product : price.product.id,
      observedPriceId: price.id,
      priceActive: price.active,
      unitAmountCents: price.unit_amount,
      currency: price.currency,
      recurring: price.recurring ? { interval: price.recurring.interval, intervalCount: price.recurring.interval_count } : null,
      trialStart: null,
      trialEnd: null,
      paymentMethodCollected: null,
      subscriptionStatus: null,
    });
    const productDeleted = product && "deleted" in product ? product.deleted : false;
    if (!validation.ok || !product || productDeleted || !("active" in product) || product.active !== true
      || !("name" in product) || product.name !== SOLO_BETA_PRODUCT_NAME) {
      return json(503, { error: "solo_beta_provider_contract_mismatch" });
    }

    const { data: claim, error: claimError } = await admin.rpc("solo_beta_claim_checkout", { _user_id: user.id });
    if (claimError) throw new Error("checkout_claim_failed");
    const row = Array.isArray(claim) ? claim[0] : claim;
    attempt = Number(row?.attempt ?? 0);
    fencingToken = typeof row?.fencing_token === "string" ? row.fencing_token : null;
    idempotencySlot = Number(row?.idempotency_slot ?? attempt);
    if (!row?.claimed) {
      if (row?.state === "fulfilled") return json(409, { error: "already_subscribed", reference_id: row.reference_id });
      if (row?.existing_session_id) {
        const existing = await stripe.checkout.sessions.retrieve(row.existing_session_id);
        if (existing.status === "open" && existing.url) return json(200, { url: existing.url, reference_id: row.reference_id, resumed: true });
        // A completed Checkout may be waiting on a delayed signed webhook. Never
        // replace it with a second subscription attempt: the return surface polls
        // fresh server state and gives the provider delivery time to converge.
        if (existing.status === "complete") {
          return json(409, { error: "checkout_verification_pending", reference_id: row.reference_id });
        }
        if (!fencingToken) throw new Error("checkout_fence_missing");
        const { error: closeError } = await admin.rpc("solo_beta_close_checkout", {
          _user_id: user.id, _attempt: attempt, _fencing_token: fencingToken,
          _session_id: row.existing_session_id,
          _next_state: existing.status === "expired" ? "expired" : "retryable_failure",
        });
        if (closeError) throw new Error("checkout_close_failed");
        const { data: retry, error: retryError } = await admin.rpc("solo_beta_claim_checkout", { _user_id: user.id });
        if (retryError) throw new Error("checkout_retry_claim_failed");
        const retryRow = Array.isArray(retry) ? retry[0] : retry;
        if (!retryRow?.claimed) return json(409, { error: "checkout_already_in_progress", reference_id: retryRow?.reference_id });
        attempt = Number(retryRow.attempt);
        fencingToken = typeof retryRow.fencing_token === "string" ? retryRow.fencing_token : null;
        idempotencySlot = Number(retryRow.idempotency_slot ?? attempt);
      } else {
        return json(409, { error: "checkout_already_in_progress", reference_id: row?.reference_id });
      }
    }

    if (!fencingToken) throw new Error("checkout_fence_missing");
    const { data: enrollment, error: enrollmentError } = await admin.from("solo_beta_enrollments").select("stripe_customer_id,reference_id").eq("user_id", user.id).single();
    if (enrollmentError || !enrollment) throw new Error("enrollment_read_failed");
    let customerId = enrollment?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { paige_user_id: user.id, offer_code: SOLO_BETA_OFFER_CODE } }, { idempotencyKey: `solo-beta-customer-${user.id}` });
      customerId = customer.id;
    }
    const originHeader = req.headers.get("Origin") ?? "";
    const origin = origins.has(originHeader) ? originHeader : "https://app.paigeagent.ai";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_collection: "always",
      customer: customerId,
      line_items: [{ price: offer.stripe_price_id, quantity: 1 }],
      success_url: `${origin}/welcome?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/welcome?checkout=cancelled`,
      client_reference_id: user.id,
      metadata: { offer_code: SOLO_BETA_OFFER_CODE, actor_user_id: user.id, provider_mode: "test" },
      subscription_data: {
        trial_period_days: SOLO_BETA_TRIAL_DAYS,
        metadata: { offer_code: SOLO_BETA_OFFER_CODE, actor_user_id: user.id, provider_mode: "test" },
      },
    }, { idempotencyKey: `solo-beta-checkout-${user.id}-${idempotencySlot}` });
    if (session.livemode || session.status !== "open" || !session.url) throw new Error("checkout_session_invalid");
    const { error: openedError } = await admin.rpc("solo_beta_checkout_opened", { _user_id: user.id, _attempt: attempt, _fencing_token: fencingToken, _customer_id: customerId, _session_id: session.id });
    if (openedError) throw new Error("checkout_open_persist_failed");
    return json(200, { url: session.url, reference_id: enrollment?.reference_id });
  } catch (error) {
    if (attempt > 0 && fencingToken) await admin.rpc("solo_beta_checkout_failed", { _user_id: user.id, _attempt: attempt, _fencing_token: fencingToken, _error_code: error instanceof Error ? error.message : "checkout_failed" });
    return json(503, { error: "solo_beta_checkout_unavailable" });
  }
});
