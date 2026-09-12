-- Solo beta authorization hardening proof.
-- Synthetic fixtures only; every mutation rolls back.
BEGIN;

SELECT plan(17);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.provision_tenant(text,text,text,text,text,text,integer)', 'EXECUTE'),
  'authenticated callers cannot execute generic tenant provisioning'
);
SELECT ok(
  has_function_privilege('service_role', 'public.provision_tenant(text,text,text,text,text,text,integer)', 'EXECUTE'),
  'service role retains generic tenant provisioning for audited internal fulfillment'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.provision_tenant(text,text,text,text,text,text,integer)', 'EXECUTE'),
  'anonymous callers cannot execute generic tenant provisioning'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.is_signup_complete(uuid)', 'EXECUTE'),
  'authenticated callers cannot inspect another user through the uuid overload'
);
SELECT ok(
  has_function_privilege('service_role', 'public.is_signup_complete(uuid)', 'EXECUTE'),
  'service role retains the actor-explicit signup completion check'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.is_signup_complete(uuid)', 'EXECUTE'),
  'anonymous callers cannot execute the uuid signup completion check'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.is_signup_complete()', 'EXECUTE'),
  'authenticated callers retain the caller-pinned zero-argument signup check'
);
SELECT ok(
  has_function_privilege('service_role', 'public.is_signup_complete()', 'EXECUTE'),
  'service role retains the zero-argument signup check'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.create_contact(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text)', 'EXECUTE'),
  'authenticated contact creation remains available through its tenant-pinned path'
);
SELECT ok(
  has_function_privilege('service_role', 'public.create_contact(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text)', 'EXECUTE'),
  'service contact creation remains available for validated internal callers'
);

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('b1900000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'solo-authz-creator-a@tests.invalid'),
  ('b1900000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'solo-authz-coach-a@tests.invalid'),
  ('b1900000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'solo-authz-creator-b@tests.invalid'),
  ('b1900000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'solo-authz-revoked-a@tests.invalid');

INSERT INTO public.tenants
  (id, slug, name, status, account_type, account_number_prefix, account_number, features, brand)
VALUES
  ('b1900000-0000-0000-0000-00000000aaaa', 'solo-authz-workspace-a', 'Solo Authz Workspace A', 'active', 'standalone', 'SAA', 8919001, '{}'::jsonb, '{}'::jsonb),
  ('b1900000-0000-0000-0000-00000000bbbb', 'solo-authz-workspace-b', 'Solo Authz Workspace B', 'active', 'standalone', 'SAB', 8919002, '{}'::jsonb, '{}'::jsonb);

INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('b1900000-0000-0000-0000-00000000aaaa', 'b1900000-0000-0000-0000-000000000001', 'owner',  'active',  true,  now()),
  ('b1900000-0000-0000-0000-00000000aaaa', 'b1900000-0000-0000-0000-000000000002', 'coach',  'active',  false, now()),
  ('b1900000-0000-0000-0000-00000000bbbb', 'b1900000-0000-0000-0000-000000000003', 'owner',  'active',  true,  now()),
  ('b1900000-0000-0000-0000-00000000aaaa', 'b1900000-0000-0000-0000-000000000004', 'coach',  'revoked', false, now());

INSERT INTO public.profiles (user_id, active_tenant_id) VALUES
  ('b1900000-0000-0000-0000-000000000001', 'b1900000-0000-0000-0000-00000000aaaa'),
  ('b1900000-0000-0000-0000-000000000002', 'b1900000-0000-0000-0000-00000000aaaa'),
  ('b1900000-0000-0000-0000-000000000003', 'b1900000-0000-0000-0000-00000000bbbb')
ON CONFLICT (user_id) DO UPDATE SET active_tenant_id = EXCLUDED.active_tenant_id;

-- The revoked coach deliberately has no active workspace. Giving a revoked
-- membership an active_tenant_id would violate the existing profile guard and
-- would make the fixture less realistic than the boundary it is proving.

INSERT INTO public.user_roles (user_id, role) VALUES
  ('b1900000-0000-0000-0000-000000000001', 'user'),
  ('b1900000-0000-0000-0000-000000000002', 'coach'),
  ('b1900000-0000-0000-0000-000000000003', 'admin'),
  ('b1900000-0000-0000-0000-000000000004', 'coach')
ON CONFLICT DO NOTHING;

-- A fresh Solo provisioner grants only the base global role. Tenant-scoped
-- owner membership, not a fabricated global admin role, authorizes creation.
DELETE FROM public.user_roles
WHERE user_id = 'b1900000-0000-0000-0000-000000000001'
  AND role <> 'user';

SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$SELECT public.create_contact('Valid', 'Service', 'solo-authz-valid@tests.invalid', NULL, NULL, NULL, 'new_lead', 'proof', '{}', NULL, NULL, 'b1900000-0000-0000-0000-000000000002', 'b1900000-0000-0000-0000-00000000aaaa', 'b1900000-0000-0000-0000-000000000001', 'proof')$$,
  'service creation succeeds when creator and assigned coach are active members of the supplied tenant'
);
SELECT is(
  (SELECT tenant_id FROM public.clients WHERE email = 'solo-authz-valid@tests.invalid'),
  'b1900000-0000-0000-0000-00000000aaaa'::uuid,
  'valid service creation writes only to the supplied tenant'
);
SELECT throws_ok(
  $$SELECT public.create_contact('Wrong', 'Creator', 'solo-authz-wrong-creator@tests.invalid', NULL, NULL, NULL, 'new_lead', 'proof', '{}', NULL, NULL, NULL, 'b1900000-0000-0000-0000-00000000aaaa', 'b1900000-0000-0000-0000-000000000003', 'proof')$$,
  '42501', 'CONTACT_CREATOR_NOT_IN_TENANT',
  'service creation rejects a creator who is not active in the supplied tenant'
);
SELECT throws_ok(
  $$SELECT public.create_contact('Wrong', 'Coach', 'solo-authz-wrong-coach@tests.invalid', NULL, NULL, NULL, 'new_lead', 'proof', '{}', NULL, NULL, 'b1900000-0000-0000-0000-000000000003', 'b1900000-0000-0000-0000-00000000aaaa', 'b1900000-0000-0000-0000-000000000001', 'proof')$$,
  '42501', 'CONTACT_COACH_NOT_IN_TENANT',
  'service creation rejects an assigned coach active only in another tenant'
);
SELECT throws_ok(
  $$SELECT public.create_contact('Revoked', 'Coach', 'solo-authz-revoked-coach@tests.invalid', NULL, NULL, NULL, 'new_lead', 'proof', '{}', NULL, NULL, 'b1900000-0000-0000-0000-000000000004', 'b1900000-0000-0000-0000-00000000aaaa', 'b1900000-0000-0000-0000-000000000001', 'proof')$$,
  '42501', 'CONTACT_COACH_NOT_IN_TENANT',
  'service creation rejects a revoked assigned coach in the supplied tenant'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"b1900000-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT public.create_contact('Pinned', 'Caller', 'solo-authz-pinned@tests.invalid', NULL, NULL, NULL, 'new_lead', 'proof', '{}', NULL, NULL, NULL, 'b1900000-0000-0000-0000-00000000bbbb', 'b1900000-0000-0000-0000-000000000003', 'proof')$$,
  'authenticated Solo owner with only the base user role can create and remains pinned despite caller-supplied tenant/creator'
);
SELECT is(
  (SELECT tenant_id FROM public.clients WHERE email = 'solo-authz-pinned@tests.invalid'),
  'b1900000-0000-0000-0000-00000000aaaa'::uuid,
  'authenticated contact creation remains pinned to the caller active tenant'
);

SELECT * FROM finish();
ROLLBACK;
