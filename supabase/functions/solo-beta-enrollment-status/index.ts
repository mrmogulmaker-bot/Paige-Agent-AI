import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
  if (!supabaseUrl || !anonKey || !serviceKey) return json(503, { error: "status_unavailable" });
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "authentication_required" });
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  const user = authData.user;
  if (authError || !user) return json(401, { error: "authentication_required" });

  const [enrollmentResult, membershipsResult] = await Promise.all([
    admin.from("solo_beta_enrollments").select("state,reference_id,tenant_id,stripe_subscription_id,last_error_code").eq("user_id", user.id).maybeSingle(),
    admin.from("tenant_members").select("tenant_id,role,is_owner,status,tenants(account_number,account_type,parent_tenant_id)").eq("user_id", user.id),
  ]);
  if (enrollmentResult.error || membershipsResult.error) return json(503, { error: "status_unavailable" });
  const enrollment = enrollmentResult.data;
  const memberships = membershipsResult.data ?? [];
  const activeMemberships = memberships.filter((row) => row.status === "active");
  const referenceId = enrollment?.reference_id ?? crypto.randomUUID();

  if (activeMemberships.length > 0 && !enrollment) {
    return json(200, {
      state: "failed", reference_id: referenceId, retryable: false,
      message: "Your existing workspace access is unchanged. Sign in through your usual workspace route; Solo Beta enrollment was not applied.",
    });
  }

  // Fulfilled access is verified from its immutable receipt/subscription/membership chain.
  // A later agreement rotation is a future-acquisition rule and never revokes an already-paid workspace.
  if (enrollment?.state === "fulfilled" && enrollment.tenant_id && enrollment.stripe_subscription_id) {
    const membership = memberships.find((row: Record<string, unknown>) => row.tenant_id === enrollment.tenant_id) as Record<string, unknown> | undefined;
    const tenantRaw = membership?.tenants;
    const tenant = (Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw) as { account_number?: number; account_type?: string; parent_tenant_id?: string | null } | null | undefined;
    const [subscriptionResult, receiptResult, entitlementResult] = await Promise.all([
      admin.from("platform_subscriptions")
        .select("id,status,offer_code,provider_mode,provider_verified_at,stripe_subscription_id,cancel_at_period_end,current_period_end,trial_ends_at")
        .eq("tenant_id", enrollment.tenant_id).eq("stripe_subscription_id", enrollment.stripe_subscription_id).maybeSingle(),
      admin.from("solo_beta_fulfillment_receipts")
        .select("subscription_id,user_id,tenant_id,outcome,reference_id")
        .eq("user_id", user.id).eq("tenant_id", enrollment.tenant_id).eq("outcome", "completed").maybeSingle(),
      admin.from("user_subscriptions")
        .select("plan_slug,status,stripe_subscription_id,current_period_end,trial_ends_at")
        .eq("user_id", user.id).eq("stripe_subscription_id", enrollment.stripe_subscription_id).maybeSingle(),
    ]);
    if (subscriptionResult.error || receiptResult.error || entitlementResult.error) return json(503, { error: "status_unavailable" });
    const subscription = subscriptionResult.data;
    const receipt = receiptResult.data;
    const entitlement = entitlementResult.data;
    const chainVerified = membership && membership.is_owner === true && tenant?.account_type === "standalone"
      && tenant.parent_tenant_id === null && tenant.account_number
      && subscription?.offer_code === "paige-solo-beta-monthly-v1"
      && subscription.provider_mode === "test" && subscription.provider_verified_at
      && receipt?.subscription_id === subscription.id && receipt?.reference_id === enrollment.reference_id
      && entitlement?.plan_slug === "solo"
      && entitlement.stripe_subscription_id === enrollment.stripe_subscription_id
      && entitlement.status === subscription.status;
    if (chainVerified && membership.status === "active" && ["trialing", "active"].includes(subscription.status)) {
      return json(200, {
        state: "verified", reference_id: referenceId, retryable: false,
        message: subscription.cancel_at_period_end
          ? subscription.status === "trialing"
            ? "Your cancellation is scheduled. Solo access remains available through the verified trial end, and no first paid renewal is scheduled."
            : "Your cancellation is scheduled. Solo access remains available through the verified paid service period."
          : subscription.status === "trialing"
            ? "Your 30-day Solo Beta trial, workspace, membership, and access are verified. Your first $74.50 monthly renewal is due after the trial unless you cancel first."
            : "Your paid Solo subscription, workspace, membership, and access are verified.",
        destination: `/solo/${tenant.account_number}/command-center`,
      });
    }
    if (chainVerified && membership.status === "suspended" && ["past_due", "unpaid", "paused"].includes(subscription.status)) {
      return json(200, {
        state: "payment_recovery", reference_id: referenceId, retryable: false,
        message: "Paige verified that this subscription needs billing attention. Update payment details in billing or contact support with this reference; access is not being inferred while recovery is required.",
        can_manage_billing: true,
      });
    }
    if (chainVerified && membership.status === "suspended" && subscription.status === "canceled") {
      const canceledDuringTrial = subscription.trial_ends_at
        && new Date(subscription.trial_ends_at).getTime() > Date.now();
      return json(200, {
        state: canceledDuringTrial ? "canceled_trial" : "canceled_paid",
        reference_id: referenceId,
        retryable: false,
        message: canceledDuringTrial
          ? "Your Solo Beta trial was canceled. No first paid renewal is scheduled, and trial access has ended."
          : "Your paid Solo subscription is canceled and its service period has ended. Review billing history or contact support with this reference.",
        can_manage_billing: true,
      });
    }
    return json(200, { state: "failed", reference_id: referenceId, retryable: true, message: "We received the billing result but could not verify every access record. Retry verification or contact support with this reference." });
  }

  const [intakeResult, agreementResult] = await Promise.all([
    admin.from("signup_intake").select("plan_slug,billing_period,account_type,terms_accepted_at,agreement_slug,agreement_version").eq("user_id", user.id).maybeSingle(),
    admin.from("legal_documents").select("version").eq("slug", "saas-standalone").eq("is_current", true).maybeSingle(),
  ]);
  if (intakeResult.error || agreementResult.error) return json(503, { error: "status_unavailable" });
  const intake = intakeResult.data;
  const currentAgreement = agreementResult.data;
  if (!intake || !currentAgreement || intake.plan_slug !== "solo" || intake.billing_period !== "monthly" || intake.account_type !== "standalone" || !intake.terms_accepted_at || intake.agreement_slug !== "saas-standalone" || intake.agreement_version !== currentAgreement.version) {
    return json(200, { state: "needs_intake", reference_id: referenceId, retryable: true, message: "Complete your Solo setup and agreement before checkout." });
  }
  const { data: acceptance, error: acceptanceError } = await admin.from("legal_acceptances").select("id")
    .eq("user_id", user.id).eq("document_slug", "saas-standalone")
    .eq("document_version", currentAgreement.version).maybeSingle();
  if (acceptanceError) return json(503, { error: "status_unavailable" });
  if (!acceptance) return json(200, { state: "needs_intake", reference_id: referenceId, retryable: true, message: "Accept the current Solo agreement before checkout." });

  if (!enrollment) return json(200, { state: "needs_checkout", reference_id: referenceId, retryable: true, message: "Your Solo setup is saved. Continue to the approved checkout when you are ready." });
  if (enrollment.state === "retryable_failure") return json(200, { state: "failed", reference_id: referenceId, retryable: true, message: "Paige could not finish verifying your workspace. No access was granted. Retry verification or contact support with this reference." });
  if (enrollment.state === "canceled" || enrollment.state === "expired") return json(200, { state: "needs_checkout", reference_id: referenceId, retryable: true, message: "Checkout was not completed. Your setup is saved and you can try again." });
  return json(200, { state: "pending", reference_id: referenceId, retryable: true, message: "Payment is not confirmed yet. Paige is waiting for verified provider and entitlement readback." });
});
