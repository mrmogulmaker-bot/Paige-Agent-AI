BEGIN;
SELECT plan(22);

SELECT is((SELECT unit_amount_cents FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1'),7450,'offer amount is exactly 7450 cents');
SELECT is((SELECT currency FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1'),'usd','offer currency is usd');
SELECT is((SELECT billing_interval FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1'),'month','offer is monthly');
SELECT is((SELECT interval_count FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1'),1,'offer interval count is one');
SELECT is((SELECT trial_days FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1'),30,'offer has exactly one 30-day trial');
SELECT is((SELECT provider_mode FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1'),'test','offer is test mode only');
SELECT is((SELECT account_type FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1'),'standalone','offer provisions only the Solo standalone account type');
SELECT is((SELECT stripe_account FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1'),'v2','offer is pinned to the approved Stripe account contract');
SELECT is((SELECT p.slug FROM public.platform_subscription_offers o JOIN public.platform_subscription_plans p ON p.id=o.plan_id WHERE o.offer_code='paige-solo-beta-monthly-v1'),'solo','offer is bound only to the canonical Solo plan');
SELECT is((SELECT status FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1'),'configuration_required','offer fails closed until test provider identifiers are configured');
SELECT ok((SELECT stripe_product_id IS NULL AND stripe_price_id IS NULL FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1'),'repository migrations do not bake provider objects into the offer');
SELECT is((SELECT count(*)::integer FROM public.platform_subscription_offers WHERE status<>'retired'),1,'Solo Beta is the only non-retired public enrollment offer');
SELECT ok(NOT has_table_privilege('authenticated','public.platform_subscription_offers','SELECT'),'browser cannot read provider offer identifiers');
SELECT ok(NOT has_table_privilege('authenticated','public.solo_beta_enrollments','SELECT'),'browser cannot read enrollment authority rows');
SELECT ok(NOT has_table_privilege('authenticated','public.solo_beta_fulfillment_receipts','SELECT'),'browser cannot read fulfillment receipts directly');
SELECT ok(NOT has_function_privilege('authenticated','public.solo_beta_claim_checkout(uuid)','EXECUTE'),'browser cannot claim checkout attempts');
SELECT ok(NOT has_function_privilege('authenticated','public.solo_beta_claim_stripe_event(text,text,boolean,text,uuid,text,text,text,timestamptz)','EXECUTE'),'browser cannot claim Stripe events');
SELECT ok(NOT has_function_privilege('authenticated','public.solo_beta_fulfill_checkout(text,uuid,integer,uuid,text,text,text,text,text,boolean,integer,text,text,integer,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean)','EXECUTE'),'browser cannot fulfill an entitlement');
SELECT ok(has_function_privilege('service_role','public.solo_beta_fulfill_checkout(text,uuid,integer,uuid,text,text,text,text,text,boolean,integer,text,text,integer,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean)','EXECUTE'),'service role retains atomic fulfillment');
SELECT throws_ok(
  $$SELECT * FROM public.solo_beta_claim_stripe_event('evt_live_rejected','checkout.session.completed',true,'digest','00000000-0000-0000-0000-000000000001','cs_test','sub_test','cus_test',now())$$,
  'P0001','solo_beta_event_not_eligible','live events fail closed before processing'
);
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stripe_event_log' AND policyname='admins read stripe_event_log'),'tenant-admin cross-account event policy is removed');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stripe_event_log' AND policyname='stripe_event_log_platform_owner_read'),'platform-owner-only event read policy exists');

SELECT * FROM finish();
ROLLBACK;
