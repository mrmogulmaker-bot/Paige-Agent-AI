-- Fleet Communications resolver behavioral proof. Synthetic rows only; rolls back.
BEGIN;

SELECT plan(9);

SELECT ok(NOT has_function_privilege('anon', 'public.resolve_platform_operator_workspace()', 'EXECUTE'),
  'anonymous callers cannot execute the operator workspace resolver');
SELECT ok(has_function_privilege('authenticated', 'public.resolve_platform_operator_workspace()', 'EXECUTE'),
  'authenticated callers reach the owner check inside the resolver');

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'fleet-owner@x.invalid'),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'fleet-user@x.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'super_admin');
INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'fleet-ops-test', 'Paige Operations Test', 'trial', 'standalone', 'FOT', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000002', 'fleet-suspended-test', 'Suspended Ops Test', 'suspended', 'standalone', 'FOS', '{}'::jsonb);

SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::integer FROM public.resolve_platform_operator_workspace()), 0,
  'a non-owner receives no workspace');

SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DELETE FROM public.admin_app_settings WHERE key = 'platform_operator_tenant_id';
SELECT is((SELECT count(*)::integer FROM public.resolve_platform_operator_workspace()), 0,
  'an unset designation fails closed');

INSERT INTO public.admin_app_settings (key, value) VALUES ('platform_operator_tenant_id', '{"bad":true}'::jsonb);
SELECT is((SELECT count(*)::integer FROM public.resolve_platform_operator_workspace()), 0,
  'a malformed designation fails closed');

UPDATE public.admin_app_settings SET value = to_jsonb('a2000000-0000-4000-8000-000000000002'::text)
WHERE key = 'platform_operator_tenant_id';
SELECT is((SELECT count(*)::integer FROM public.resolve_platform_operator_workspace()), 0,
  'a suspended designation fails closed');

UPDATE public.admin_app_settings SET value = to_jsonb('a2000000-0000-4000-8000-000000000001'::text)
WHERE key = 'platform_operator_tenant_id';
SELECT is((SELECT count(*)::integer FROM public.resolve_platform_operator_workspace()), 1,
  'an owner resolves one designated trial workspace');
SELECT is((SELECT name FROM public.resolve_platform_operator_workspace()), 'Paige Operations Test',
  'the resolver returns the exact designated workspace');

UPDATE public.tenants SET status = 'active' WHERE id = 'a2000000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*)::integer FROM public.resolve_platform_operator_workspace()), 1,
  'an owner resolves one designated active workspace');

SELECT * FROM finish();
ROLLBACK;

