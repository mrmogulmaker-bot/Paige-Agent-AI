import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20270118010000_solo_beta_atomic_fulfillment.sql", "utf8");
const lifecycle = readFileSync("supabase/migrations/20270118020000_solo_beta_subscription_lifecycle.sql", "utf8");
const integrity = readFileSync("supabase/migrations/20270118040000_solo_beta_integrity_fencing.sql", "utf8");
const authz = readFileSync("supabase/migrations/20270119010000_solo_beta_authz_hardening.sql", "utf8");
const checkout = readFileSync("supabase/functions/solo-beta-subscription-checkout/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/solo-beta-stripe-webhook/index.ts", "utf8");
const status = readFileSync("supabase/functions/solo-beta-enrollment-status/index.ts", "utf8");
const welcome = readFileSync("src/pages/Welcome.tsx", "utf8");
const offerValidator = readFileSync("supabase/functions/_shared/solo-beta-offer.ts", "utf8");
const provisioner = readFileSync("supabase/migrations/20260810000000_signup_flow_reorder_intake.sql", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const joinWorkspace = readFileSync("src/pages/JoinWorkspace.tsx", "utf8");
const acceptInvite = readFileSync("src/pages/AcceptInvite.tsx", "utf8");
const auth = readFileSync("src/pages/Auth.tsx", "utf8");
const portal = readFileSync("supabase/functions/solo-beta-billing-portal/index.ts", "utf8");
const routeGate = readFileSync("src/components/auth/RequireSoloBetaEntitlement.tsx", "utf8");
const legal = readFileSync("src/lib/legal/useLegalDocuments.ts", "utf8");
const offerStatus = readFileSync("supabase/functions/solo-beta-offer-status/index.ts", "utf8");
const pricing = readFileSync("src/pages/Pricing.tsx", "utf8");
const provisionerUi = readFileSync("src/components/onboarding/WorkspaceProvisioner.tsx", "utf8");
const functionConfig = readFileSync("supabase/config.toml", "utf8");

describe("Solo Beta security boundary", () => {
  it("encodes one immutable test-mode 7450 USD monthly offer with a 30-day trial", () => {
    expect(migration).toContain("'paige-solo-beta-monthly-v1'");
    expect(migration).toContain("unit_amount_cents = 7450");
    expect(migration).toContain("provider_mode = 'test'");
    expect(migration).toContain("billing_interval = 'month'");
    expect(migration).toContain("trial_days = 30");
  });

  it("removes browser authority from generic provisioning and actor-explicit signup reads", () => {
    expect(authz).toMatch(/REVOKE ALL ON FUNCTION public\.provision_tenant[\s\S]+FROM PUBLIC, anon, authenticated/);
    expect(authz).toMatch(/REVOKE ALL ON FUNCTION public\.is_signup_complete\(uuid\)[\s\S]+FROM PUBLIC, anon, authenticated/);
  });

  it("requires exact server/provider evidence before atomic fulfillment", () => {
    for (const guard of ["_product_id<>_offer.stripe_product_id", "_price_id<>_offer.stripe_price_id", "_unit_amount<>7450", "lower(_currency)<>'usd'", "_interval<>'month'", "_interval_count<>1", "_offer.trial_days<>30"]) {
      expect(migration).toContain(guard);
    }
    expect(migration).toContain("solo_beta_agreement_unpersisted");
    expect(migration).toContain("lifecycle_state='completed'");
  });

  it("requires the exact current standalone agreement at checkout and fulfillment", () => {
    expect(checkout).toContain('.eq("slug", "saas-standalone").eq("is_current", true)');
    expect(checkout).toContain('intake.agreement_slug !== "saas-standalone"');
    expect(integrity).toContain("_intake.agreement_slug IS DISTINCT FROM 'saas-standalone'");
    expect(integrity).toContain("_intake.agreement_version IS DISTINCT FROM _agreement_version");
  });

  it("fences checkout creation, failure, opening, and fulfillment", () => {
    expect(integrity).toContain("checkout_fencing_token uuid");
    expect(integrity).toContain("checkout_claimed_at >= now()-interval '5 minutes'");
    expect(integrity).toMatch(/solo_beta_checkout_failed\([\s\S]+_fencing_token uuid/);
    expect(integrity).toMatch(/solo_beta_fulfill_checkout\([\s\S]+_attempt integer,_fencing_token uuid/);
    expect(checkout).toContain("_fencing_token: fencingToken");
    expect(webhook).toContain("_fencing_token: enrollment.checkout_fencing_token");
  });

  it("compares immutable provider event identity before replay acknowledgement", () => {
    for (const field of ["payload_digest", "owner_user_id", "checkout_session_id", "stripe_subscription_id", "stripe_customer_id", "provider_created_at"]) {
      expect(integrity).toContain(`_row.${field} IS DISTINCT FROM`);
    }
    expect(integrity).toContain("solo_beta_event_identity_mismatch");
  });

  it("claims lifecycle events and rejects stale provider ordering", () => {
    expect(webhook).toContain('_event_type: event.type');
    expect(webhook).toContain('_provider_created_at: providerCreatedAt');
    expect(integrity).toContain("provider_event_precedence");
    expect(integrity).toContain("_outcome := 'ignored_stale'");
    expect(integrity).toContain("solo_beta_lifecycle_receipts");
  });

  it("fails closed when checkout or status authority reads fail", () => {
    expect(checkout).toContain("ownedResult.error || membershipsResult.error || subscriptionHistoryResult.error || intakeResult.error || offerResult.error");
    expect(checkout).toContain("acceptanceError");
    expect(status).toContain("enrollmentResult.error || membershipsResult.error");
    expect(status).toContain("intakeResult.error || agreementResult.error");
    expect(status).toContain("subscriptionResult.error || receiptResult.error || entitlementResult.error");
  });

  it("uses immutable fulfilled subscription facts for lifecycle and converges revoking states", () => {
    expect(webhook).toContain('admin.from("platform_subscriptions")');
    expect(webhook).toContain('persisted.provider_mode !== "test"');
    expect(offerValidator).toContain('"unpaid", "paused"');
    expect(integrity).toContain("_sub.stripe_product_id IS DISTINCT FROM _product_id");
    expect(integrity).toContain("'active','past_due','canceled','unpaid','paused'");
  });

  it("verifies fulfilled users before current-agreement acquisition checks", () => {
    expect(status.indexOf('enrollment?.state === "fulfilled"')).toBeLessThan(status.indexOf('admin.from("signup_intake")'));
    expect(status).toContain('admin.from("solo_beta_fulfillment_receipts")');
    expect(status).toContain("receipt?.subscription_id === subscription.id");
  });

  it("reuses the previous provider idempotency slot when reclaiming a stale creation lease", () => {
    expect(integrity).toContain("idempotency_slot integer");
    expect(integrity).toContain("WHEN _row.state='checkout_creating' THEN _row.checkout_attempt");
    expect(checkout).toContain('idempotencyKey: `solo-beta-checkout-${user.id}-${idempotencySlot}`');
  });

  it("never opens a second trial after subscription creation or prior subscription history", () => {
    expect(checkout).toContain('admin.from("user_subscriptions")');
    expect(checkout).toContain('(subscriptionHistory?.length ?? 0) > 0');
    expect(integrity).toContain("SET state='verification_pending',stripe_subscription_id=_subscription_id");
    expect(migration).toContain("THEN 'verification_pending' ELSE 'retryable_failure'");
  });

  it("keeps a completed Checkout in server-verification recovery instead of opening another subscription", () => {
    expect(checkout).toContain('existing.status === "complete"');
    expect(checkout).toContain('error: "checkout_verification_pending"');
    expect(provisionerUi).toContain('code === "checkout_verification_pending"');
    expect(provisionerUi).toContain('/welcome?checkout=success');
  });

  it("persists confirmation-required signup consent transactionally and idempotently", () => {
    expect(auth).toContain("signUpWithReferral");
    expect(auth).toContain('signup_offer_code: "paige-solo-beta-monthly-v1"');
    expect(integrity).toContain("CREATE OR REPLACE FUNCTION public.persist_solo_beta_signup_consent()");
    expect(integrity).toContain("AFTER INSERT ON auth.users");
    expect(integrity).toContain("d.required_at_signup = true");
    expect(checkout).toContain('error: "solo_beta_signup_consent_incomplete"');
    expect(legal).toContain('onConflict: "user_id,document_slug,document_version"');
    expect(legal).toContain("ignoreDuplicates: true");
  });

  it("advertises enrollment only from a safe exact-contract server readiness read", () => {
    expect(functionConfig).toMatch(/\[functions\.solo-beta-offer-status\][\s\S]*verify_jwt = false/);
    expect(offerStatus).toContain('offer.status === "test_ready"');
    expect(offerStatus).toContain('offer.provider_mode === "test"');
    expect(offerStatus).not.toContain("stripe_product_id:");
    expect(offerStatus).not.toContain("stripe_price_id:");
    expect(pricing).toContain('availability !== "available"');
    expect(pricing).toContain("Enrollment is not open yet.");
  });

  it("allows equal-time lifecycle delivery to converge while rejecting lower-precedence stale events", () => {
    expect(integrity).toContain("_precedence < _sub.provider_event_precedence");
    expect(integrity).not.toContain("_precedence <= _sub.provider_event_precedence");
  });

  it("authorizes a freshly provisioned Solo owner from tenant scope without a fake global admin role", () => {
    expect(provisioner).toContain("values (_owner, 'user')");
    expect(provisioner).toContain("values (_tenant.id, _owner, 'owner', 'active', true, now())");
    expect(authz).toContain("tm.role IN ('owner','admin','coach')");
    expect(authz).not.toContain("super_admin");
    expect(authz).not.toContain("has_any_role(_creator");
    expect(authz).toContain("FUNCTION public.create_contact_v2");
    expect(authz).toContain("was_created := false");
    expect(authz).not.toContain("FUNCTION public.create_contact(");
  });

  it("keeps failed webhook fulfillment retryable and never acknowledges it", () => {
    expect(migration).toContain("lifecycle_state='retryable_failure'");
    expect(webhook).toContain("solo_beta_fail_stripe_event");
    expect(webhook).toContain("return json(500, { error: \"solo_beta_webhook_retry_required\" })");
    expect(webhook).not.toContain("email_confirm: true");
  });

  it("records signed Checkout expiration atomically and idempotently", () => {
    expect(webhook).toContain('event.type === "checkout.session.expired"');
    expect(webhook).toContain('admin.rpc("solo_beta_expire_checkout"');
    expect(integrity).toContain("CREATE FUNCTION public.solo_beta_expire_checkout");
    expect(integrity).toContain("'checkout.session.expired',false,_payload_digest,'completed'");
    expect(integrity).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(integrity).toContain("SET state='expired',last_error_code='checkout_expired'");
  });

  it("checkout rejects caller-selected tiers and fixes the trial server-side", () => {
    expect(checkout).toContain('body.offer_code !== SOLO_BETA_OFFER_CODE');
    expect(checkout).toContain('"plan_slug" in body');
    expect(checkout).toContain('"account_type" in body');
    expect(checkout).toContain('"billing_period" in body');
    expect(checkout).toContain('"trial_period_days" in body');
    expect(checkout).toContain("trial_period_days: SOLO_BETA_TRIAL_DAYS");
    expect(checkout).toContain('payment_method_collection: "always"');
    expect(checkout).toContain('session.status !== "open"');
  });

  it("derives current-shell destination only after membership and entitlement readback", () => {
    expect(status).toContain('["trialing", "active"].includes(subscription.status)');
    expect(status).toContain('membership.is_owner === true');
    // tier-feature-exempt: assertion covers canonical account-type routing, not a feature toggle.
    expect(status).toContain('tenant?.account_type === "standalone"');
    expect(status).toContain('destination: `/solo/${tenant.account_number}/command-center`');
    expect(status).not.toContain('destination: "/app"');
  });

  it("separates trialing, paid, recovery, canceled-trial, and canceled-paid customer states", () => {
    expect(status).toContain('["trialing", "active"].includes(subscription.status)');
    expect(status).toContain('state: "payment_recovery"');
    expect(status).toContain('"canceled_trial" : "canceled_paid"');
    expect(welcome).toContain('payment_recovery: { title: "Payment recovery is required"');
    expect(welcome).toContain('canceled_trial: { title: "Your Solo Beta trial is canceled"');
    expect(welcome).toContain('canceled_paid: { title: "Your paid Solo subscription has ended"');
  });

  it("uses the Stripe Basil invoice parent and item billing periods", () => {
    expect(webhook).toContain("readInvoiceSubscriptionId(invoice)");
    expect(webhook).toContain("readSubscriptionItemPeriod(item)");
    expect(webhook).not.toContain("subscription as unknown as { current_period_start");
    expect(webhook).not.toContain("invoiceSubscription");
  });

  it("gates marked Beta workspaces on fresh server entitlement readback", () => {
    expect(integrity).toContain("'solo_beta_offer_code', 'paige-solo-beta-monthly-v1'");
    expect(app).toContain("<RequireSoloBetaEntitlement>");
    expect(routeGate).toContain('supabase.functions.invoke("solo-beta-enrollment-status")');
    expect(status).toContain('admin.from("user_subscriptions")');
    expect(status).toContain('entitlement.status === subscription.status');
  });

  it("opens a dedicated exact-contract test-mode portal for Beta billing recovery", () => {
    expect(portal).toContain('persisted.provider_mode !== "test"');
    expect(portal).toContain("validateSoloBetaOffer");
    expect(portal).toContain("SOLO_BETA_PRODUCT_NAME");
    expect(portal).toContain("stripe.billingPortal.sessions.create");
  });

  it("removes retired public acquisition detours and blocks new invite-created account types", () => {
    expect(app).toContain('<Route path="/get-started" element={<SignupRedirect />} />');
    expect(app).toContain('<Route path="/signup/coach-qualify" element={<SignupRedirect />} />');
    expect(joinWorkspace).not.toContain("signUpTenant(");
    expect(joinWorkspace).not.toContain("Need an account? Create one");
    expect(acceptInvite).toContain("Client Portal enrollment is not open");
    expect(auth).not.toContain('import { signUpTenant }');
    expect(auth).not.toContain("supabase.auth.signUp({");
    expect(auth).toContain("!isClientInvite && isLogin && <>");
    expect(auth).toContain("New Client Portal accounts are not open during the Solo Beta");
    expect(auth).toContain("!isClientInvite && <>");
    expect(auth).not.toContain("Create a free account");
  });

  it("offers immediate sign-in recovery for a signed-out checkout return", () => {
    expect(welcome).toContain("supabase.auth.getSession()");
    expect(welcome).toMatch(/if \(sessionError \|\| !sessionData\.session\)[\s\S]+setView\("needs_identity"\)/);
    expect(welcome).toContain("Sign in and resume");
    expect(welcome).toContain("Access is not granted until every check passes.");
  });

  it("syncs cancellation and payment state from a verified subscription contract", () => {
    expect(lifecycle).toContain("_subscription_status NOT IN ('trialing','active','past_due','canceled')");
    expect(lifecycle).toContain("cancel_at_period_end=coalesce(_cancel_at_period_end,false)");
    expect(lifecycle).toContain("trial_ends_at=_trial_end");
  });
});
