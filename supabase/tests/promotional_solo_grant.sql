BEGIN;
SELECT plan(33);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.platform_grant_promotional_solo(uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'ordinary authenticated callers cannot grant promotional Solo access'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.platform_grant_promotional_solo(uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'service role can enter the platform promotional grant seam'
);

INSERT INTO auth.users (id,aud,role,email) VALUES
  ('e2900000-0000-4000-8000-000000000001','authenticated','authenticated','operator-promo-proof@tests.invalid'),
  ('e2900000-0000-4000-8000-000000000002','authenticated','authenticated','recipient-promo-proof@tests.invalid'),
  ('e2900000-0000-4000-8000-000000000003','authenticated','authenticated','other-owner-promo-proof@tests.invalid'),
  ('e2900000-0000-4000-8000-000000000004','authenticated','authenticated','provider-conflict-promo-proof@tests.invalid');
INSERT INTO public.user_roles (user_id,role) VALUES
  ('e2900000-0000-4000-8000-000000000001','super_admin'),
  ('e2900000-0000-4000-8000-000000000002','user'),
  ('e2900000-0000-4000-8000-000000000003','user'),
  ('e2900000-0000-4000-8000-000000000004','user');

INSERT INTO public.tenants (
  id,slug,name,owner_user_id,parent_tenant_id,status,account_type,account_number_prefix,account_number,features,brand
) VALUES (
  'e2900000-0000-4000-8000-00000000a001','existing-agency-proof','Existing Agency Proof',
  'e2900000-0000-4000-8000-000000000003',NULL,'active','agency','EAP',8929001,'{}'::jsonb,'{}'::jsonb
);
INSERT INTO public.tenant_members (tenant_id,user_id,role,status,is_owner,joined_at) VALUES
  ('e2900000-0000-4000-8000-00000000a001','e2900000-0000-4000-8000-000000000003','owner','active',true,now()),
  ('e2900000-0000-4000-8000-00000000a001','e2900000-0000-4000-8000-000000000002','admin','active',false,now());
INSERT INTO public.profiles (user_id,active_tenant_id,full_name)
VALUES ('e2900000-0000-4000-8000-000000000002','e2900000-0000-4000-8000-00000000a001',NULL)
ON CONFLICT (user_id) DO UPDATE SET active_tenant_id=excluded.active_tenant_id,full_name=NULL;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT * FROM public.platform_grant_promotional_solo(
    'e2900000-0000-4000-8000-000000000003',
    'e2900000-0000-4000-8000-000000000002',
    'Should Not Exist','Recipient Proof','invalid operator'
  )$$,
  '42501','promotional_solo_platform_owner_required',
  'a service caller still must supply a proven platform owner'
);
SELECT lives_ok(
  $$SELECT * FROM public.platform_grant_promotional_solo(
    'e2900000-0000-4000-8000-000000000001',
    'e2900000-0000-4000-8000-000000000002',
    'Recipient Promotional Solo','Recipient Proof','owner-authorized grandfathered access'
  )$$,
  'a platform-owner-authorized service call grants promotional Solo access'
);
RESET ROLE;

SELECT is(
  (SELECT count(*)::integer FROM public.tenants WHERE owner_user_id='e2900000-0000-4000-8000-000000000002' AND parent_tenant_id IS NULL),
  1,'exactly one owned top-level workspace is created'
);
SELECT is(
  (SELECT account_type FROM public.tenants WHERE owner_user_id='e2900000-0000-4000-8000-000000000002' AND parent_tenant_id IS NULL),
  'standalone','the promotional workspace is Solo standalone only'
);
SELECT is(
  (SELECT status::text FROM public.tenants WHERE owner_user_id='e2900000-0000-4000-8000-000000000002' AND parent_tenant_id IS NULL),
  'active','the promotional workspace is active'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.tenant_members m JOIN public.tenants t ON t.id=m.tenant_id
    WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002'
      AND m.user_id='e2900000-0000-4000-8000-000000000002'
      AND m.role='owner' AND m.status='active' AND m.is_owner
  ),
  'the recipient receives the active owner membership'
);
SELECT is(
  (SELECT p.active_tenant_id FROM public.profiles p WHERE p.user_id='e2900000-0000-4000-8000-000000000002'),
  (SELECT t.id FROM public.tenants t WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002' AND t.parent_tenant_id IS NULL),
  'the server selects the granted workspace as active'
);
SELECT is(
  (SELECT full_name FROM public.profiles WHERE user_id='e2900000-0000-4000-8000-000000000002'),
  'Recipient Proof','an empty profile name is filled from the authorized grant input'
);
SELECT is(
  (SELECT plan_slug FROM public.user_subscriptions WHERE user_id='e2900000-0000-4000-8000-000000000002'),
  'solo','the user entitlement is explicit Solo, never a free or planless fallback'
);
SELECT is(
  (SELECT status FROM public.user_subscriptions WHERE user_id='e2900000-0000-4000-8000-000000000002'),
  'active','the user entitlement is active without pretending to be a paid subscription'
);
SELECT ok(
  (SELECT trial_ends_at IS NULL AND stripe_subscription_id IS NULL
   FROM public.user_subscriptions WHERE user_id='e2900000-0000-4000-8000-000000000002'),
  'the promotional entitlement has no trial reuse and no Stripe subscription'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id='e2900000-0000-4000-8000-00000000a001'
      AND user_id='e2900000-0000-4000-8000-000000000002'
      AND role='admin' AND status='active'
  ),
  'the recipient keeps the pre-existing authorized non-Solo membership'
);
SELECT is(
  (SELECT c.revenue_class FROM public.tenant_revenue_classification c JOIN public.tenants t ON t.id=c.tenant_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002' AND t.parent_tenant_id IS NULL),
  'promotional','the workspace has an explicit promotional revenue classification'
);
SELECT is(
  (SELECT c.comp_reason FROM public.tenant_revenue_classification c JOIN public.tenants t ON t.id=c.tenant_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002' AND t.parent_tenant_id IS NULL),
  'owner-authorized grandfathered access','the internal promotional reason is retained'
);
SELECT is(
  (SELECT count(*)::integer FROM public.platform_subscriptions ps JOIN public.tenants t ON t.id=ps.tenant_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002' AND t.parent_tenant_id IS NULL),
  1,'the grant creates exactly one platform subscription envelope'
);
SELECT is(
  (SELECT p.slug FROM public.platform_subscriptions ps JOIN public.platform_subscription_plans p ON p.id=ps.plan_id
   JOIN public.tenants t ON t.id=ps.tenant_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002' AND t.parent_tenant_id IS NULL),
  'solo','the subscription envelope uses the canonical Solo plan'
);
SELECT is(
  (SELECT ps.status FROM public.platform_subscriptions ps JOIN public.tenants t ON t.id=ps.tenant_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002' AND t.parent_tenant_id IS NULL),
  'active','promotional access is represented as active'
);
SELECT ok(
  (SELECT ps.stripe_customer_id IS NULL AND ps.stripe_subscription_id IS NULL
      AND ps.stripe_product_id IS NULL AND ps.stripe_price_id IS NULL
      AND ps.offer_code IS NULL AND ps.provider_mode IS NULL
      AND ps.provider_verified_at IS NULL
   FROM public.platform_subscriptions ps JOIN public.tenants t ON t.id=ps.tenant_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002' AND t.parent_tenant_id IS NULL),
  'the promotional grant creates no Stripe or paid-offer binding'
);
SELECT ok(
  (SELECT ps.metadata->>'access_source'='promotional_grant'
      AND (ps.metadata->>'no_expiry')::boolean
      AND (ps.metadata->>'metering_enabled')::boolean
   FROM public.platform_subscriptions ps JOIN public.tenants t ON t.id=ps.tenant_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002' AND t.parent_tenant_id IS NULL),
  'the explicit grant is non-expiring and remains metering-aware'
);
SELECT is(
  (SELECT count(*)::integer FROM public.paige_audit_log a JOIN public.tenants t ON t.id=a.target_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002'
     AND a.action='platform.promotional_solo.granted'),
  1,'one canonical audit receipt records the grant'
);
SELECT is(
  (SELECT count(*)::integer FROM public.platform_usage_events e JOIN public.tenants t ON t.id=e.tenant_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002'
     AND e.event_type='promotional_solo_granted'),
  1,'one platform event records the metered workspace grant'
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT * FROM public.platform_grant_promotional_solo(
    'e2900000-0000-4000-8000-000000000001',
    'e2900000-0000-4000-8000-000000000002',
    'Recipient Promotional Solo','Recipient Proof','owner-authorized grandfathered access'
  )$$,
  'a repeated grant is idempotent'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.tenants WHERE owner_user_id='e2900000-0000-4000-8000-000000000002' AND parent_tenant_id IS NULL),
  1,'retry does not create a second workspace'
);
SELECT is(
  (SELECT count(*)::integer FROM public.platform_subscriptions ps JOIN public.tenants t ON t.id=ps.tenant_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002'),
  1,'retry does not create a second subscription envelope'
);
SELECT is(
  (SELECT count(*)::integer FROM public.paige_audit_log a JOIN public.tenants t ON t.id=a.target_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002'
     AND a.action='platform.promotional_solo.granted'),
  1,'retry does not duplicate the audit receipt'
);
SELECT is(
  (SELECT count(*)::integer FROM public.platform_usage_events e JOIN public.tenants t ON t.id=e.tenant_id
   WHERE t.owner_user_id='e2900000-0000-4000-8000-000000000002'
     AND e.event_type='promotional_solo_granted'),
  1,'retry does not duplicate the platform grant event'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e2900000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT is((SELECT access_state FROM public.get_workspace_billing_status()),'promotional','owner billing readback reports promotional access');
SELECT is((SELECT amount_due_cents FROM public.get_workspace_billing_status()),0,'owner billing readback reports zero due today');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);

INSERT INTO public.tenants (
  id,slug,name,owner_user_id,parent_tenant_id,status,account_type,account_number_prefix,account_number,features,brand,
  stripe_customer_id,stripe_subscription_id
) VALUES (
  'e2900000-0000-4000-8000-00000000b001','provider-conflict-proof','Provider Conflict Proof',
  'e2900000-0000-4000-8000-000000000004',NULL,'active','standalone','PCP',8929002,'{}'::jsonb,'{}'::jsonb,
  'cus_existing_proof','sub_existing_proof'
);
INSERT INTO public.tenant_members (tenant_id,user_id,role,status,is_owner,joined_at)
VALUES ('e2900000-0000-4000-8000-00000000b001','e2900000-0000-4000-8000-000000000004','owner','active',true,now());
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT * FROM public.platform_grant_promotional_solo(
    'e2900000-0000-4000-8000-000000000001',
    'e2900000-0000-4000-8000-000000000004',
    'Must Remain Existing','Conflict Proof','must fail closed'
  )$$,
  '23514','promotional_solo_provider_binding_conflict',
  'an existing provider-bound identity cannot be converted into promotional access'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.tenants WHERE owner_user_id='e2900000-0000-4000-8000-000000000004'),
  1,'provider-conflict refusal creates no duplicate tenant'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.platform_subscriptions ps
    WHERE ps.tenant_id='e2900000-0000-4000-8000-00000000b001'
      AND ps.metadata->>'access_source'='promotional_grant'
  ),
  'provider-conflict refusal creates no promotional subscription'
);

SELECT * FROM finish();
ROLLBACK;