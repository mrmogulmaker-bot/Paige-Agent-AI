BEGIN;
SELECT plan(20);

SELECT has_table('public','solo_beta_welcome_deliveries','verified welcome outbox exists');
SELECT is((SELECT count(*)::integer FROM cron.job WHERE jobname='solo-beta-welcome-drain'),1,'Vault-authorized welcome retry drainer is durably scheduled');
SELECT ok(NOT has_table_privilege('authenticated','public.solo_beta_welcome_deliveries','SELECT'),'browser cannot inspect welcome recipients or delivery internals');
SELECT ok(NOT has_table_privilege('authenticated','public.solo_beta_welcome_deliveries','INSERT'),'browser cannot enqueue a welcome');
SELECT ok(NOT has_function_privilege('authenticated','public.solo_beta_claim_welcome_delivery(text)','EXECUTE'),'browser cannot claim welcome delivery');
SELECT ok(NOT has_function_privilege('authenticated','public.solo_beta_complete_welcome_delivery(uuid,uuid,text)','EXECUTE'),'browser cannot complete welcome delivery');
SELECT ok(NOT has_function_privilege('authenticated','public.solo_beta_fail_welcome_delivery(uuid,uuid,text,boolean)','EXECUTE'),'browser cannot mutate welcome failure state');

INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data)
VALUES('b2030000-0000-0000-0000-000000000001','authenticated','authenticated',
       'solo-welcome-proof@tests.invalid','{"full_name":"Solo Proof"}'::jsonb);
UPDATE public.profiles SET full_name='Solo Proof'
WHERE user_id='b2030000-0000-0000-0000-000000000001';

INSERT INTO public.tenants(
  id,slug,name,status,account_type,account_number_prefix,account_number,features,brand
) VALUES(
  'b2030000-0000-0000-0000-00000000aaaa','solo-welcome-proof','Solo Welcome Proof',
  'active','standalone','SWP',8920301,
  '{"solo_beta_offer_code":"paige-solo-beta-monthly-v1"}'::jsonb,'{}'::jsonb
);
INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at)
VALUES(
  'b2030000-0000-0000-0000-00000000aaaa',
  'b2030000-0000-0000-0000-000000000001','owner','active',true,now()
);

INSERT INTO public.platform_subscriptions(
  id,tenant_id,plan_id,status,billing_period,current_period_start,current_period_end,
  stripe_subscription_id,stripe_customer_id,offer_code,provider_mode,
  stripe_product_id,stripe_price_id,trial_started_at,trial_ends_at,provider_verified_at
)
SELECT
  'b2030000-0000-0000-0000-00000000bbbb',
  'b2030000-0000-0000-0000-00000000aaaa',plan_id,'trialing','monthly',now(),now()+interval '30 days',
  'sub_solo_welcome_proof','cus_solo_welcome_proof',offer_code,'live',
  stripe_product_id,stripe_price_id,now(),now()+interval '30 days',now()
FROM public.platform_subscription_offers WHERE offer_code='paige-solo-beta-monthly-v1';

INSERT INTO public.solo_beta_enrollments(
  user_id,offer_code,state,stripe_customer_id,checkout_session_id,stripe_subscription_id,tenant_id,reference_id
) VALUES(
  'b2030000-0000-0000-0000-000000000001','paige-solo-beta-monthly-v1','fulfilled',
  'cus_solo_welcome_proof','cs_live_solo_welcome_proof','sub_solo_welcome_proof',
  'b2030000-0000-0000-0000-00000000aaaa','b2030000-0000-0000-0000-00000000cccc'
);

INSERT INTO public.solo_beta_fulfillment_receipts(
  event_id,user_id,tenant_id,subscription_id,offer_code,outcome,reference_id
) VALUES(
  'evt_solo_welcome_proof','b2030000-0000-0000-0000-000000000001',
  'b2030000-0000-0000-0000-00000000aaaa','b2030000-0000-0000-0000-00000000bbbb',
  'paige-solo-beta-monthly-v1','completed','b2030000-0000-0000-0000-00000000cccc'
);

SELECT is((SELECT count(*)::integer FROM public.solo_beta_welcome_deliveries
  WHERE fulfillment_event_id='evt_solo_welcome_proof'),1,'completed fulfillment atomically queues exactly one welcome');
SELECT is((SELECT state FROM public.solo_beta_welcome_deliveries
  WHERE fulfillment_event_id='evt_solo_welcome_proof'),'pending','new verified welcome starts pending');

SELECT set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE claimed_welcome AS
SELECT * FROM public.solo_beta_claim_welcome_delivery('evt_solo_welcome_proof');
RESET ROLE;

SELECT is((SELECT claimed FROM claimed_welcome),true,'service role claims the verified welcome');
SELECT is((SELECT recipient_email FROM claimed_welcome),'solo-welcome-proof@tests.invalid','recipient is derived from the fulfilled auth identity');
SELECT is((SELECT account_number FROM claimed_welcome),8920301::bigint,'destination account is derived from the fulfilled standalone tenant');
SELECT is((SELECT subscription_status FROM claimed_welcome),'trialing','welcome copy state is freshly derived from the verified subscription');
SELECT ok((SELECT trial_ends_at FROM claimed_welcome) > now()+interval '29 days','verified trial end is carried into truthful welcome copy');
SELECT is((SELECT state FROM public.solo_beta_welcome_deliveries
  WHERE fulfillment_event_id='evt_solo_welcome_proof'),'sending','claim durably records sending state');

SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.solo_beta_claim_welcome_delivery('evt_solo_welcome_proof')$$,
  '42501','permission denied for function solo_beta_claim_welcome_delivery',
  'ordinary authenticated role cannot claim a welcome'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.solo_beta_complete_welcome_delivery(
    (SELECT delivery_id FROM claimed_welcome),
    (SELECT claim_token FROM claimed_welcome),
    'provider-proof-id'
  )$$,
  'provider acceptance completes the exact claim'
);
RESET ROLE;

SELECT is((SELECT state FROM public.solo_beta_welcome_deliveries
  WHERE fulfillment_event_id='evt_solo_welcome_proof'),'sent','completed claim is durable');
SELECT is((SELECT count(*)::integer FROM public.paige_audit_log
  WHERE action='solo_beta.welcome.sent'
    AND target_id='b2030000-0000-0000-0000-00000000aaaa'),1,'safe welcome audit outcome is recorded');

SELECT is((SELECT count(*)::integer FROM public.platform_usage_events
  WHERE event_type='solo_beta_welcome_sent'
    AND tenant_id='b2030000-0000-0000-0000-00000000aaaa'),1,'bounded welcome Rail receipt is recorded');
SELECT * FROM finish();
ROLLBACK;
