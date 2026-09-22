-- INT-104: tenant roles keep their normal tenant identity and feature writes,
-- but none can grant or revoke platform-controlled live-audio eligibility.
-- Synthetic fixtures only; all writes roll back.
BEGIN;
SELECT plan(7);

INSERT INTO auth.users(id,aud,role,email) VALUES
 ('fa100000-0000-4000-8000-000000000001','authenticated','authenticated','live-owner@tests.invalid'),
 ('fa100000-0000-4000-8000-000000000002','authenticated','authenticated','live-admin@tests.invalid'),
 ('fa100000-0000-4000-8000-000000000003','authenticated','authenticated','live-member@tests.invalid');

INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,account_number,features,brand,owner_user_id)
VALUES ('fa100000-0000-4000-8000-000000001111','live-pilot-guard-test','Live Pilot Guard Test','active','standalone','LPG',9381011,'{}','{}','fa100000-0000-4000-8000-000000000001');
INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at) VALUES
 ('fa100000-0000-4000-8000-000000001111','fa100000-0000-4000-8000-000000000001','owner','active',true,now()),
 ('fa100000-0000-4000-8000-000000001111','fa100000-0000-4000-8000-000000000002','admin','active',false,now()),
 ('fa100000-0000-4000-8000-000000001111','fa100000-0000-4000-8000-000000000003','member','active',false,now());

SELECT ok(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.tenants'::regclass AND tgname='trg_guard_paige_live_audio_pilot' AND NOT tgisinternal),'existing tenant feature row has the pilot-key guard');
SELECT is((SELECT features ? 'paige_live_audio_pilot' FROM public.tenants WHERE slug='live-pilot-guard-test'),false,'pilot defaults off without tenant exceptions');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"fa100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT lives_ok($q$UPDATE public.tenants SET features=features || '{"ordinary_setting":true}'::jsonb WHERE slug='live-pilot-guard-test'$q$,'owner retains unrelated tenant feature writes');
SELECT throws_ok($q$UPDATE public.tenants SET features=features || '{"paige_live_audio_pilot":true}'::jsonb WHERE slug='live-pilot-guard-test'$q$,'42501','PAIGE_LIVE_PILOT_PLATFORM_ONLY','owner cannot grant live audio through REST-equivalent role');

SELECT set_config('request.jwt.claims','{"sub":"fa100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT throws_ok($q$UPDATE public.tenants SET features=features || '{"paige_live_audio_pilot":true}'::jsonb WHERE slug='live-pilot-guard-test'$q$,'42501','PAIGE_LIVE_PILOT_PLATFORM_ONLY','admin cannot grant live audio through REST-equivalent role');

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($q$UPDATE public.tenants SET features=features || '{"paige_live_audio_pilot":true}'::jsonb WHERE slug='live-pilot-guard-test'$q$,'server-side operational role can enable the same tenant-neutral capability');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"fa100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($q$UPDATE public.tenants SET features=features || '{"paige_live_audio_pilot":false}'::jsonb WHERE slug='live-pilot-guard-test'$q$,'42501','PAIGE_LIVE_PILOT_PLATFORM_ONLY','owner cannot revoke platform pilot while other tenant writes remain allowed');

SELECT * FROM finish();
ROLLBACK;
