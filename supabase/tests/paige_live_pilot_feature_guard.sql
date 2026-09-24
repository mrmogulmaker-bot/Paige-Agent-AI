-- INT-104: the normal tenant-admin role cannot self-enable third-party audio.
-- Synthetic fixture only. Every write rolls back.
BEGIN;
SELECT plan(54);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.paige_live_tenant_availability'::regclass),'platform availability has RLS');
SELECT ok(NOT has_table_privilege('authenticated','public.paige_live_tenant_availability','SELECT'),'tenant roles cannot read pilot holder rows');
SELECT ok(NOT has_table_privilege('authenticated','public.paige_live_tenant_availability','INSERT,UPDATE,DELETE'),'tenant roles cannot write platform availability');
SELECT ok(has_table_privilege('service_role','public.paige_live_tenant_availability','SELECT,INSERT,UPDATE,DELETE'),'server operational role can manage availability');

INSERT INTO auth.users(id,aud,role,email)
VALUES ('fa100000-0000-4000-8000-000000000001','authenticated','authenticated','live-admin@tests.invalid');
INSERT INTO auth.users(id,aud,role,email)
VALUES ('fa100000-0000-4000-8000-000000000002','authenticated','authenticated','live-owner@tests.invalid');
INSERT INTO public.user_roles(user_id,role)
VALUES ('fa100000-0000-4000-8000-000000000002','super_admin');
INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,account_number,features,brand,owner_user_id)
VALUES ('fa100000-0000-4000-8000-000000001111','live-pilot-guard-test','Live Pilot Guard Test','active','standalone','LPG',9381011,'{}','{}','fa100000-0000-4000-8000-000000000001');
INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,account_number,features,brand,owner_user_id)
VALUES ('fa100000-0000-4000-8000-000000002222','live-pilot-other-test','Live Pilot Other Test','active','standalone','LPO',9381012,'{}','{}','fa100000-0000-4000-8000-000000000002');
INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at)
VALUES ('fa100000-0000-4000-8000-000000001111','fa100000-0000-4000-8000-000000000001','admin','active',false,now());
-- Preserve legacy same-actor authorization coverage with a real active membership.
INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at)
VALUES ('fa100000-0000-4000-8000-000000001111','fa100000-0000-4000-8000-000000000002','member','active',false,now());

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

SELECT ok(NOT has_function_privilege('authenticated','public.paige_live_pilot_authorized_internal(uuid,uuid)','EXECUTE'),
  'authenticated roles cannot call the pilot reader');
SELECT ok(NOT has_function_privilege('authenticated','public.set_paige_live_pilot_internal(uuid,uuid,boolean,text,uuid)','EXECUTE'),
  'authenticated roles cannot call the pilot writer');
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111',true,'test-consent',NULL)$q$,
  '42501',NULL,'tenant admin cannot authorize live audio via RPC');
SELECT ok(NOT has_table_privilege('authenticated','public.paige_voice_readiness','UPDATE'),
  'tenant admin has no direct readiness write privilege');
SELECT throws_ok($q$UPDATE public.paige_voice_readiness SET pilot_enabled=true WHERE singleton=true$q$,
  '42501',NULL,'tenant admin cannot directly edit pilot readiness');

RESET ROLE;
SELECT is((SELECT pilot_enabled FROM public.paige_voice_readiness WHERE singleton),false,
  'pilot defaults off for every workspace');
SELECT is((SELECT pilot_zero_retention_state FROM public.paige_voice_readiness WHERE singleton),'UNAVAILABLE',
  'zero retention is honestly unavailable by default');
SELECT is((SELECT pilot_speaker_identity_enforced FROM public.paige_voice_readiness WHERE singleton),false,
  'no physical speaker identity is claimed');

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($q$UPDATE public.paige_voice_readiness
  SET pilot_enabled=true WHERE singleton=true$q$,
  '23514',NULL,'even service-role direct write cannot enable an incomplete pilot row');
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111',true,'test-consent',NULL)$q$,
  '42501',NULL,'service-role call with a non-platform actor is denied');
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,'test-consent',NULL)$q$,
  '22023',NULL,'platform owner cannot enable without an inspection');

INSERT INTO public.paige_audit_log(id,actor_user_id,actor_role,action,target_type,created_at,payload)
VALUES
('fa100000-0000-4000-8000-000000000098','fa100000-0000-4000-8000-000000000002',
 'super_admin','platform.paige_voice_profile.inspect','paige_voice_profiles',now(),
 '{"phase":"inspection_completed","profile_revision":"elevenlabs-jessica-take5-r1","inspection":{"code":"metadata_only","subscription":{"transport":"ok"},"voice":{"transport":"ok","accessible":false,"referenceMatches":true}}}'::jsonb),
('fa100000-0000-4000-8000-000000000099','fa100000-0000-4000-8000-000000000002',
 'super_admin','platform.paige_voice_profile.inspect','paige_voice_profiles',now(),
 '{"phase":"inspection_completed","profile_revision":"elevenlabs-jessica-take5-r1","inspection":{"code":"metadata_only","subscription":{"transport":"ok"},"voice":{"transport":"ok","accessible":true,"referenceMatches":true}}}'::jsonb),
('fa100000-0000-4000-8000-000000000097','fa100000-0000-4000-8000-000000000002',
 'super_admin','platform.paige_voice_profile.inspect','paige_voice_profiles',now()-interval '10 minutes',
 '{"phase":"inspection_completed","profile_revision":"elevenlabs-jessica-take5-r1","inspection":{"code":"metadata_only","subscription":{"transport":"ok"},"voice":{"transport":"ok","accessible":true,"referenceMatches":true}}}'::jsonb);
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000098')$q$,
  '22023',NULL,'inaccessible candidate voice cannot authorize');
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000097')$q$,
  '22023',NULL,'stale inspection cannot authorize');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111'),false,
  'rejected proof leaves pilot off');
SELECT lives_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099')$q$,
  'platform owner can authorize one account and workspace with fresh matching metadata');
UPDATE public.paige_voice_profiles SET speech_policy=NULL WHERE slot='candidate';
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099')$q$,
  '22023',NULL,'missing speech policy cannot authorize');
UPDATE public.paige_voice_profiles SET speech_policy='{}'::jsonb WHERE slot='candidate';
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099')$q$,
  '22023',NULL,'missing spoken register cannot authorize');
UPDATE public.paige_voice_profiles
  SET speech_policy='{"source":"paige-profile","spoken_register":"take-5"}'::jsonb WHERE slot='candidate';
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111'),true,
  'exact authorized actor and tenant pass');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),false,
  'another actor in the enabled workspace is denied');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000002222'),false,
  'same actor in another workspace is denied');
UPDATE public.paige_live_tenant_availability
  SET enabled=false WHERE tenant_id='fa100000-0000-4000-8000-000000001111';
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111'),false,
  'platform availability revocation immediately denies pilot');
UPDATE public.paige_live_tenant_availability
  SET enabled=true WHERE tenant_id='fa100000-0000-4000-8000-000000001111';
UPDATE public.paige_voice_profiles SET provider_voice_ref='wrong-test-voice'
  WHERE slot='candidate';
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111'),false,
  'wrong candidate voice immediately denies pilot');
UPDATE public.paige_voice_profiles SET provider_voice_ref='g6xIsTj2HwM6VR4iXFCw'
  WHERE slot='candidate';
SELECT is((SELECT transport_enabled FROM public.paige_voice_readiness WHERE singleton),false,
  'scoped pilot does not activate legacy global voice transport');
SELECT is((SELECT provider || ':' || revision FROM public.paige_voice_profiles WHERE slot='active'),
  'openai:openai-fallback-r1','active OpenAI read-aloud is unchanged');
SELECT is((SELECT pilot_zero_retention_state FROM public.paige_voice_readiness WHERE singleton),
  'UNAVAILABLE','pilot never claims zero retention');
SELECT is((SELECT pilot_speaker_identity_enforced FROM public.paige_voice_readiness WHERE singleton),false,
  'procedural acceptance never claims speaker recognition');
SELECT is((SELECT pilot_single_speaker_accepted FROM public.paige_voice_readiness WHERE singleton),true,
  'owner action records procedural single-speaker acceptance');
SELECT is((SELECT quota_verified FROM public.paige_voice_readiness WHERE singleton),false,
  'pilot does not invent provider quota proof');
SELECT ok((SELECT hard_cost_limit_usd IS NULL FROM public.paige_voice_readiness WHERE singleton),
  'pilot does not invent a cost ceiling');
SELECT lives_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002',NULL,false,NULL,NULL)$q$,
  'owner can revoke without an inspection or another tenant choice');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111'),false,
  'revocation takes effect immediately');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.set_paige_live_pilot_internal(uuid,uuid,boolean,text,uuid,uuid)','EXECUTE'),
  'tenant roles cannot call the separate-participant writer');
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099',
  'fa100000-0000-4000-8000-000000000001')$q$,'42501',NULL,
  'participant cannot serve as the platform authorizer');
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000002222',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099',
  'fa100000-0000-4000-8000-000000000001')$q$,'22023',NULL,
  'participant cannot be authorized for a workspace they do not belong to');
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099',
  NULL)$q$,'22023',NULL,'null participant cannot be authorized');
SELECT lives_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099',
  'fa100000-0000-4000-8000-000000000001')$q$,
  'platform authorizer enables a distinct ordinary Solo participant');
SELECT ok((SELECT pilot_actor_user_id <> pilot_authorized_by
  FROM public.paige_voice_readiness WHERE singleton),'authorizer and participant remain separate');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),true,
  'ordinary Solo participant passes without platform privileges');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111'),false,
  'authorizing operator does not inherit participant access');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000002222'),false,
  'authorized participant remains blocked in another workspace');
RESET ROLE;
DELETE FROM public.tenant_members WHERE user_id='fa100000-0000-4000-8000-000000000001'
  AND tenant_id='fa100000-0000-4000-8000-000000001111';
SET LOCAL ROLE service_role;
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),false,
  'membership removal immediately blocks the canonical admission predicate');
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099',
  'fa100000-0000-4000-8000-000000000001')$q$,'22023',NULL,
  'removed membership cannot be reauthorized');
RESET ROLE;
INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at)
VALUES ('fa100000-0000-4000-8000-000000001111','fa100000-0000-4000-8000-000000000001','member','active',false,now());
SET LOCAL ROLE service_role;
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),true,
  'active ordinary member is eligible without an owner or admin role');
RESET ROLE;
DELETE FROM public.user_roles WHERE user_id='fa100000-0000-4000-8000-000000000002' AND role='super_admin';
SET LOCAL ROLE service_role;
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),false,
  'authorizer authority revocation still fails closed');
RESET ROLE;
INSERT INTO public.user_roles(user_id,role) VALUES ('fa100000-0000-4000-8000-000000000002','super_admin');
SET LOCAL ROLE service_role;
SELECT lives_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002',NULL,false,NULL,NULL)$q$,
  'legacy disable revokes a separately authorized participant');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),false,
  'disable denies the Solo participant immediately');

SELECT * FROM finish();
ROLLBACK;
