-- INT-104: the normal tenant-admin role cannot self-enable third-party audio.
-- Synthetic fixture only. Every write rolls back.
BEGIN;
SELECT plan(72);

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

-- ===========================================================================
-- Rollout configuration is where the restriction lives (migration 20270419000000).
-- The product is one shared capability for every Solo account; WHO may speak today is a
-- configuration row. These assertions prove both halves, and prove the refusal rather than
-- asserting it: an ordinary Solo member with no platform role can be admitted and passes, and
-- an active member of the same enabled workspace who is NOT admitted is refused.
-- Synthetic identities only. Every write still rolls back.
-- ===========================================================================
RESET ROLE;
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.paige_live_pilot_subjects'::regclass),
  'rollout subject configuration has RLS');
SELECT ok(NOT has_table_privilege('authenticated','public.paige_live_pilot_subjects','SELECT'),
  'tenant roles cannot read who is admitted to the rollout');
SELECT ok(NOT has_table_privilege('authenticated','public.paige_live_pilot_subjects','INSERT,UPDATE,DELETE'),
  'tenant roles cannot write rollout configuration');
SELECT ok(has_table_privilege('service_role','public.paige_live_pilot_subjects','SELECT,INSERT,UPDATE,DELETE'),
  'the server operational role manages rollout configuration');

-- A third ordinary account in the SAME enabled workspace. It exists to be refused.
INSERT INTO auth.users(id,aud,role,email)
VALUES ('fa100000-0000-4000-8000-000000000003','authenticated','authenticated','live-bystander@tests.invalid');
INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at)
VALUES ('fa100000-0000-4000-8000-000000001111','fa100000-0000-4000-8000-000000000003','member','active',false,now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"fa100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($q$INSERT INTO public.paige_live_pilot_subjects(
  user_id,tenant_id,admitted_by,expires_at,accepted_default_provider_retention,
  accepted_procedural_single_speaker,acceptance_actor_user_id)
  VALUES('fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111',
    'fa100000-0000-4000-8000-000000000001',now()+interval '14 days',true,true,
    'fa100000-0000-4000-8000-000000000001')$q$,
  '42501',NULL,'a tenant admin cannot admit themselves to the rollout');

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
-- One person's acceptance may never stand as another's authorization.
SELECT throws_ok($q$INSERT INTO public.paige_live_pilot_subjects(
  user_id,tenant_id,admitted_by,expires_at,accepted_default_provider_retention,
  accepted_procedural_single_speaker,acceptance_actor_user_id)
  VALUES('fa100000-0000-4000-8000-000000000003','fa100000-0000-4000-8000-000000001111',
    'fa100000-0000-4000-8000-000000000002',now()+interval '14 days',true,true,
    'fa100000-0000-4000-8000-000000000002')$q$,
  '23514',NULL,'one subject''s consent cannot be recorded as another subject''s acceptance');
-- §68: an admission that never lapses is an authority nobody has to revisit.
SELECT throws_ok($q$INSERT INTO public.paige_live_pilot_subjects(
  user_id,tenant_id,admitted_by,admitted_at,expires_at,
  accepted_default_provider_retention,accepted_procedural_single_speaker,acceptance_actor_user_id)
  VALUES('fa100000-0000-4000-8000-000000000003','fa100000-0000-4000-8000-000000001111',
    'fa100000-0000-4000-8000-000000000002',now(),now()-interval '1 day',true,true,
    'fa100000-0000-4000-8000-000000000003')$q$,
  '23514',NULL,'an admission cannot be recorded already expired');

SELECT lives_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099')$q$,
  'the platform operator re-opens the rollout envelope');

-- Admitting a further subject is an INSERT into configuration. No product change, no role
-- elevation, no account identifier: the acceptance is recorded as the subject's own.
SELECT lives_ok($q$INSERT INTO public.paige_live_pilot_subjects(
  user_id,tenant_id,admitted_by,expires_at,accepted_default_provider_retention,
  accepted_procedural_single_speaker,acceptance_actor_user_id)
  VALUES('fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111',
    'fa100000-0000-4000-8000-000000000002',now()+interval '14 days',true,true,
    'fa100000-0000-4000-8000-000000000001')$q$,
  'admitting another subject is a configuration write');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),true,
  'an ordinary Solo member with no platform role passes the product gate');
SELECT ok((SELECT pilot_actor_user_id <> 'fa100000-0000-4000-8000-000000000001'
  FROM public.paige_voice_readiness WHERE singleton),
  'admission no longer reads the singleton subject column');

-- THE NEGATIVE PROOF. Same workspace, same enabled availability, real active membership,
-- simply not admitted. Unauthorized pilot access is refused.
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000003','fa100000-0000-4000-8000-000000001111'),false,
  'an active member of the enabled workspace who is not an admitted subject is refused');
SELECT ok((SELECT count(*) = 1 FROM public.tenant_members
  WHERE user_id='fa100000-0000-4000-8000-000000000003'
    AND tenant_id='fa100000-0000-4000-8000-000000001111' AND status='active'),
  'that refusal is about rollout configuration, not about missing workspace standing');
-- Enable the SECOND workspace too, so the only thing denying the subject there is the absence of a
-- configuration row. A negative taken against a workspace that was never switched on would pass
-- identically if the per-subject key were never consulted.
INSERT INTO public.paige_live_tenant_availability(tenant_id,enabled)
  VALUES('fa100000-0000-4000-8000-000000002222',true)
  ON CONFLICT (tenant_id) DO UPDATE SET enabled=true;
SELECT ok((SELECT enabled FROM public.paige_live_tenant_availability
  WHERE tenant_id='fa100000-0000-4000-8000-000000002222'),
  'the second workspace is genuinely switched on, so the next negative means something');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000002222'),false,
  'an admitted subject is admitted for one workspace only');

-- paige_audit_log is writable by any authenticated user and its actor_role is free text, so a Solo
-- account can write itself a row that reads like a platform inspection. The predicate reads only the
-- receipt the owner-gated writer recorded, so the forgery must change nothing.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"fa100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SELECT lives_ok($q$INSERT INTO public.paige_audit_log(actor_user_id,actor_role,action,target_type,tenant_id,payload)
  VALUES('fa100000-0000-4000-8000-000000000003','super_admin',
    'platform.paige_voice_profile.inspect','paige_voice_profiles',NULL,
    '{"phase":"inspection_completed","profile_revision":"elevenlabs-jessica-take5-r1","inspection":{"code":"metadata_only","subscription":{"transport":"ok"},"voice":{"transport":"ok","accessible":true,"referenceMatches":true}}}'::jsonb)$q$,
  'an ordinary account can write an audit row that reads like a platform inspection');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000003','fa100000-0000-4000-8000-000000001111'),false,
  'a self-forged inspection receipt admits nobody');

-- §68 again, this time through the predicate rather than the constraint.
-- Age the whole admission. Pushing expires_at behind admitted_at would trip the CHECK and the
-- assertion would then pass on an exception instead of on a returned false.
UPDATE public.paige_live_pilot_subjects
   SET admitted_at=now()-interval '20 days', expires_at=now()-interval '6 days'
  WHERE user_id='fa100000-0000-4000-8000-000000000001';
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),false,
  'a lapsed admission denies the subject without anyone remembering to withdraw it');
UPDATE public.paige_live_pilot_subjects
   SET admitted_at=now(), expires_at=now()+interval '14 days'
  WHERE user_id='fa100000-0000-4000-8000-000000000001';
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),true,
  're-attesting the admission restores the subject');

-- Withdrawal is per subject and immediate, and does not disturb another subject.
UPDATE public.paige_live_pilot_subjects SET revoked_at=now()
  WHERE user_id='fa100000-0000-4000-8000-000000000001';
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),false,
  'withdrawing one subject denies that subject at once');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111'),true,
  'withdrawing one subject leaves another subject untouched');
UPDATE public.paige_live_pilot_subjects SET revoked_at=NULL
  WHERE user_id='fa100000-0000-4000-8000-000000000001';

-- Authority is revocable: an admission written by someone who is not a platform owner fails closed.
UPDATE public.paige_live_pilot_subjects SET admitted_by='fa100000-0000-4000-8000-000000000001'
  WHERE user_id='fa100000-0000-4000-8000-000000000001';
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),false,
  'an admission not written by a platform owner fails closed');
UPDATE public.paige_live_pilot_subjects SET admitted_by='fa100000-0000-4000-8000-000000000002'
  WHERE user_id='fa100000-0000-4000-8000-000000000001';
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),true,
  'restoring platform authorship restores the admission');

-- The per-workspace half of the gate still governs an admitted subject.
UPDATE public.paige_live_tenant_availability SET enabled=false
  WHERE tenant_id='fa100000-0000-4000-8000-000000001111';
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),false,
  'workspace availability off denies an admitted subject');
UPDATE public.paige_live_tenant_availability SET enabled=true
  WHERE tenant_id='fa100000-0000-4000-8000-000000001111';
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),true,
  'restoring workspace availability restores the admitted subject');

-- §53: rollout authority is super_admin only. A delegated platform_admin must NOT be able to open
-- the rollout, so the writer stays on the frozen is_platform_owner() helper. Pinned here, because a
-- later well-meaning migration to is_platform_operator() would otherwise pass unnoticed.
RESET ROLE;
INSERT INTO auth.users(id,aud,role,email)
VALUES ('fa100000-0000-4000-8000-000000000004','authenticated','authenticated','live-delegate@tests.invalid');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.user_roles(user_id,role)
VALUES ('fa100000-0000-4000-8000-000000000004','platform_admin');
SELECT throws_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000004','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099')$q$,
  '42501',NULL,'a delegated platform_admin cannot open the Live rollout');

-- Disable means nobody is admitted, and a later re-enable never revives a stale acceptance.
SELECT lives_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002',NULL,false,NULL,NULL)$q$,
  'the platform operator closes the rollout without naming a workspace');
SELECT is((SELECT count(*)::integer FROM public.paige_live_pilot_subjects WHERE revoked_at IS NULL),0,
  'disable withdraws every admitted subject');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),false,
  'disable denies the ordinary Solo subject immediately');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111'),false,
  'disable denies the operator subject immediately');
SELECT lives_ok($q$SELECT public.set_paige_live_pilot_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111',true,
  'test-owner-default-retention-acceptance','fa100000-0000-4000-8000-000000000099')$q$,
  'the operator re-opens the rollout with a fresh acceptance of their own');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000001111'),true,
  'the operator''s own fresh acceptance readmits the operator');
SELECT is(public.paige_live_pilot_authorized_internal(
  'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000001111'),false,
  'reopening the rollout never revives a withdrawn subject''s acceptance as fresh authorization');

SELECT * FROM finish();
ROLLBACK;
