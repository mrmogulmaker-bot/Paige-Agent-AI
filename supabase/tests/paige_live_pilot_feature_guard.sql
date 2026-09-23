-- INT-104: the normal tenant-admin role cannot self-enable third-party audio.
-- Synthetic fixture only. Every write rolls back.
BEGIN;
SELECT plan(8);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.paige_live_tenant_availability'::regclass),'platform availability has RLS');
SELECT ok(NOT has_table_privilege('authenticated','public.paige_live_tenant_availability','SELECT'),'tenant roles cannot read pilot holder rows');
SELECT ok(NOT has_table_privilege('authenticated','public.paige_live_tenant_availability','INSERT,UPDATE,DELETE'),'tenant roles cannot write platform availability');
SELECT ok(has_table_privilege('service_role','public.paige_live_tenant_availability','SELECT,INSERT,UPDATE,DELETE'),'server operational role can manage availability');

INSERT INTO auth.users(id,aud,role,email)
VALUES ('fa100000-0000-4000-8000-000000000001','authenticated','authenticated','live-admin@tests.invalid');
INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,account_number,features,brand,owner_user_id)
VALUES ('fa100000-0000-4000-8000-000000001111','live-pilot-guard-test','Live Pilot Guard Test','active','standalone','LPG',9381011,'{}','{}','fa100000-0000-4000-8000-000000000001');
INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at)
VALUES ('fa100000-0000-4000-8000-000000001111','fa100000-0000-4000-8000-000000000001','admin','active',false,now());

SELECT is((SELECT count(*)::integer FROM public.paige_live_tenant_availability WHERE tenant_id='fa100000-0000-4000-8000-000000001111'),0,'new workspace is off without a platform row');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"fa100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($q$INSERT INTO public.paige_live_tenant_availability(tenant_id,enabled) VALUES('fa100000-0000-4000-8000-000000001111',true)$q$,'42501',NULL,'active tenant admin cannot enable live audio');

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($q$INSERT INTO public.paige_live_tenant_availability(tenant_id,enabled) VALUES('fa100000-0000-4000-8000-000000001111',true)$q$,'platform service can enable the same generic workspace');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"fa100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($q$UPDATE public.paige_live_tenant_availability SET enabled=false WHERE tenant_id='fa100000-0000-4000-8000-000000001111'$q$,'42501',NULL,'active tenant admin cannot rewrite platform availability');

SELECT * FROM finish();
ROLLBACK;
