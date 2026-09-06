-- Business Mission Phase 2: durable tenant/RLS/lifecycle contract.
-- Synthetic fixtures only; the enclosing transaction is always rolled back.
BEGIN;
SELECT plan(30);

SELECT ok(has_function_privilege('authenticated','public.create_business_mission(uuid,text,text,date,text,text,text[],text,text,text[],text[],text,text,uuid)','EXECUTE'),'authenticated callers may reach governed Mission create');
SELECT ok(NOT has_function_privilege('anon','public.create_business_mission(uuid,text,text,date,text,text,text[],text,text,text[],text[],text,text,uuid)','EXECUTE'),'anonymous callers cannot reach Mission create');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid='public.create_business_mission(uuid,text,text,date,text,text,text[],text,text,text[],text[],text,text,uuid)'::regprocedure),'Mission create is SECURITY DEFINER');
SELECT ok((SELECT proconfig && ARRAY['search_path=','search_path=""'] FROM pg_proc WHERE oid='public.create_business_mission(uuid,text,text,date,text,text,text[],text,text,text[],text[],text,text,uuid)'::regprocedure),'Mission create pins an empty search path');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.business_missions'::regclass),'Mission rows have RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.business_mission_brief_versions'::regclass),'Mission Brief rows have RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.business_mission_mutation_receipts'::regclass),'Mission receipts have RLS enabled');
SELECT ok(NOT has_table_privilege('authenticated','public.business_missions','SELECT,INSERT,UPDATE,DELETE'),'browser has no direct Mission table access');
SELECT ok(NOT has_table_privilege('authenticated','public.business_mission_brief_versions','SELECT,INSERT,UPDATE,DELETE'),'browser has no direct Brief table access');
SELECT ok(NOT has_table_privilege('authenticated','public.business_mission_mutation_receipts','SELECT,INSERT,UPDATE,DELETE'),'browser has no direct receipt table access');

INSERT INTO auth.users(id,aud,role,email) VALUES
 ('d1000000-0000-4000-8000-000000000001','authenticated','authenticated','mission-owner-a@tests.invalid'),
 ('d1000000-0000-4000-8000-000000000002','authenticated','authenticated','mission-coowner-a@tests.invalid'),
 ('d1000000-0000-4000-8000-000000000003','authenticated','authenticated','mission-member-a@tests.invalid'),
 ('d2000000-0000-4000-8000-000000000001','authenticated','authenticated','mission-owner-b@tests.invalid'),
 ('d3000000-0000-4000-8000-000000000001','authenticated','authenticated','mission-owner-child@tests.invalid'),
 ('d4000000-0000-4000-8000-000000000001','authenticated','authenticated','mission-owner-enterprise@tests.invalid');

INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,account_number,features,brand,owner_user_id,parent_tenant_id) VALUES
 ('d1000000-0000-4000-8000-000000001111','mission-contract-a','Mission Contract A','active','standalone','MCA',9381001,'{}','{}','d1000000-0000-4000-8000-000000000001',NULL),
 ('d2000000-0000-4000-8000-000000002222','mission-contract-b','Mission Contract B','active','standalone','MCB',9381002,'{}','{}','d2000000-0000-4000-8000-000000000001',NULL),
 ('d3000000-0000-4000-8000-000000003333','mission-contract-child','Mission Contract Child','active','standalone','MCC',9381003,'{}','{}','d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000001111'),
 ('d4000000-0000-4000-8000-000000004444','mission-contract-enterprise','Mission Contract Enterprise','active','enterprise','MCE',9381004,'{}','{}','d4000000-0000-4000-8000-000000000001',NULL);

INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at) VALUES
 ('d1000000-0000-4000-8000-000000001111','d1000000-0000-4000-8000-000000000001','owner','active',true,now()),
 ('d1000000-0000-4000-8000-000000001111','d1000000-0000-4000-8000-000000000002','owner','active',true,now()),
 ('d1000000-0000-4000-8000-000000001111','d1000000-0000-4000-8000-000000000003','member','active',false,now()),
 ('d2000000-0000-4000-8000-000000002222','d1000000-0000-4000-8000-000000000001','member','active',false,now()),
 ('d2000000-0000-4000-8000-000000002222','d2000000-0000-4000-8000-000000000001','owner','active',true,now()),
 ('d3000000-0000-4000-8000-000000003333','d3000000-0000-4000-8000-000000000001','owner','active',true,now()),
 ('d4000000-0000-4000-8000-000000004444','d4000000-0000-4000-8000-000000000001','owner','active',true,now());

INSERT INTO public.profiles(user_id,active_tenant_id) VALUES
 ('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000001111'),
 ('d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000001111'),
 ('d1000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000001111'),
 ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000002222'),
 ('d3000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000003333'),
 ('d4000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000004444')
ON CONFLICT(user_id) DO UPDATE SET active_tenant_id=excluded.active_tenant_id;

INSERT INTO public.paige_chat_threads(id,caller_user_id,tenant_id,lens,title)
VALUES('d1000000-0000-4000-8000-000000009999','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000001111','coach','Mission contract');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
CREATE TEMP TABLE mission_created AS
SELECT public.create_business_mission(
 'd1000000-0000-4000-8000-000000007001','Fill the workshop','Fill the next workshop with qualified people',current_date+30,
 'No current registration baseline','Use approved channels only',ARRAY['No discounting'],'Forty qualified registrations','Draft and plan only',ARRAY['Offer is ready'],ARRAY['Channel capacity unknown'],'Confirm channel readiness','owner_ui',NULL
) AS result;
SELECT ok((SELECT result->>'state'='proposed' AND (result->>'replayed')::boolean=false FROM mission_created),'owner creates one proposed Mission through the RPC');
SELECT ok((SELECT (public.create_business_mission(
 'd1000000-0000-4000-8000-000000007001','Fill the workshop','Fill the next workshop with qualified people',current_date+30,
 'No current registration baseline','Use approved channels only',ARRAY['No discounting'],'Forty qualified registrations','Draft and plan only',ARRAY['Offer is ready'],ARRAY['Channel capacity unknown'],'Confirm channel readiness','owner_ui',NULL
)->>'replayed')::boolean),'same request replays the committed result');
SELECT throws_ok($q$SELECT public.create_business_mission(
 'd1000000-0000-4000-8000-000000007001','Different title','Fill the next workshop with qualified people',current_date+30,
 'No current registration baseline','Use approved channels only',ARRAY[]::text[],'Forty qualified registrations','Draft only',ARRAY[]::text[],ARRAY[]::text[],NULL,'owner_ui',NULL)$q$,'23505','MISSION_IDEMPOTENCY_CONFLICT','same request key with a different payload fails closed');
SELECT throws_ok('SELECT * FROM public.business_missions','42501',NULL,'authenticated direct table read is denied');
SELECT is(jsonb_array_length(public.list_business_missions()->'missions'),1,'owner portfolio returns the one tenant Mission');

SELECT set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT is(jsonb_array_length(public.list_business_missions()->'missions'),1,'co-owner reads the shared tenant portfolio');
SELECT set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SELECT throws_ok('SELECT public.list_business_missions()','42501','MISSION_OWNER_REQUIRED','same-tenant member is refused');

RESET ROLE;
UPDATE public.profiles SET active_tenant_id='d2000000-0000-4000-8000-000000002222' WHERE user_id='d1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok('SELECT public.list_business_missions()','42501','MISSION_OWNER_REQUIRED','workspace switch to a tenant the caller does not own fails closed');

SELECT set_config('request.jwt.claims','{"sub":"d3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($q$SELECT public.create_business_mission('d3000000-0000-4000-8000-000000007003','Child mission','Outcome',NULL,'Baseline','Strategy','{}','Success','Draft only','{}','{}',NULL,'owner_ui',NULL)$q$,'42501','MISSION_OWNER_REQUIRED','child workspace creation is refused');
SELECT set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($q$SELECT public.create_business_mission('d4000000-0000-4000-8000-000000007004','Enterprise mission','Outcome',NULL,'Baseline','Strategy','{}','Success','Draft only','{}','{}',NULL,'owner_ui',NULL)$q$,'42501','MISSION_OWNER_REQUIRED','enterprise creation is refused');

RESET ROLE;
UPDATE public.profiles SET active_tenant_id='d1000000-0000-4000-8000-000000001111' WHERE user_id='d1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
CREATE TEMP TABLE mission_id AS SELECT (result->>'mission_id')::uuid id FROM mission_created;
SELECT is((public.revise_business_mission_brief((SELECT id FROM mission_id),1,'d1000000-0000-4000-8000-000000007010','Refined outcome',current_date+31,'Measured baseline','Refined strategy',ARRAY['No discounting'],'Forty qualified registrations','Draft only',ARRAY[]::text[],ARRAY[]::text[],'Owner refined scope','Fill the workshop',NULL)->>'revision')::integer,2,'revision appends Brief version 2');
SELECT throws_ok(format('SELECT public.revise_business_mission_brief(%L,1,%L,%L,NULL,%L,%L,%L,%L,%L,%L,%L,%L,NULL,NULL)',(SELECT id FROM mission_id),'d1000000-0000-4000-8000-000000007011','Stale','Baseline','Strategy','{}','Success','Draft only','{}','{}','Stale revision'),'40001','MISSION_REVISION_CONFLICT','stale expected revision is refused');
SELECT throws_ok(format('SELECT public.transition_business_mission(%L,2,%L,%L)',(SELECT id FROM mission_id),'d1000000-0000-4000-8000-000000007012','paused'),'22023','MISSION_INVALID_TRANSITION','invalid proposed-to-paused transition is refused');
SELECT is(public.transition_business_mission((SELECT id FROM mission_id),2,'d1000000-0000-4000-8000-000000007013','active')->>'state','active','proposed Mission activates');
SELECT throws_ok(format('SELECT public.transition_business_mission(%L,3,%L,%L)',(SELECT id FROM mission_id),'d1000000-0000-4000-8000-000000007014','completed'),'22023','MISSION_OUTCOME_REQUIRED','close without an outcome is refused');
SELECT is(public.transition_business_mission((SELECT id FROM mission_id),3,'d1000000-0000-4000-8000-000000007015','completed',NULL,'partly_achieved','Twenty registrations verified','Causality remains unknown')->>'state','completed','Mission closes with an honest partial outcome');

RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.business_mission_brief_versions WHERE mission_id=(SELECT id FROM mission_id)),2,'Brief history contains both immutable versions');
SELECT throws_ok(format('UPDATE public.business_mission_brief_versions SET strategy=%L WHERE mission_id=%L','overwrite',(SELECT id FROM mission_id)),'55000','MISSION_BRIEF_IMMUTABLE','Brief history cannot be overwritten even by a privileged writer');
SELECT is((SELECT count(*)::integer FROM public.business_mission_mutation_receipts WHERE mission_id=(SELECT id FROM mission_id)),4,'only committed create, revise, activate, and close receipts remain');
SELECT is((SELECT count(*)::integer FROM public.paige_audit_log WHERE target_type='business_mission' AND target_id=(SELECT id FROM mission_id)),4,'only first committed mutations create audit rows');

SELECT * FROM finish();
ROLLBACK;