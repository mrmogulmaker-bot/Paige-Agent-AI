-- Canonical governed CRM command: synthetic tenant fixtures only; always rolled back.
BEGIN;
SELECT plan(44);

SELECT ok(NOT has_function_privilege('anon','public.execute_crm_command(uuid,uuid,jsonb,text)','EXECUTE'),'anon cannot execute the CRM domain writer');
SELECT ok(NOT has_function_privilege('authenticated','public.execute_crm_command(uuid,uuid,jsonb,text)','EXECUTE'),'authenticated callers cannot bypass the CRM action door');
SELECT ok(has_function_privilege('service_role','public.execute_crm_command(uuid,uuid,jsonb,text)','EXECUTE'),'only the trusted service action door can execute');
SELECT ok(NOT has_table_privilege('authenticated','public.crm_command_results','SELECT'),'browser callers cannot read the private replay store');
SELECT ok(NOT has_table_privilege('authenticated','public.crm_command_previews','SELECT'),'browser callers cannot read the private destructive preview store');

INSERT INTO auth.users(id,aud,role,email) VALUES
 ('c7100000-0000-4000-8000-000000000001','authenticated','authenticated','crm-owner-a@tests.invalid'),
 ('c7100000-0000-4000-8000-000000000002','authenticated','authenticated','crm-member-a@tests.invalid'),
 ('c7200000-0000-4000-8000-000000000001','authenticated','authenticated','crm-owner-b@tests.invalid');
INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,account_number,features) VALUES
 ('c7100000-0000-4000-8000-000000001111','crm-governed-a','CRM Governed A','active','standalone','CGA',8710001,'{}'),
 ('c7200000-0000-4000-8000-000000002222','crm-governed-b','CRM Governed B','active','standalone','CGB',8720002,'{}');
INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at) VALUES
 ('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','owner','active',true,now()),
 ('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002','member','active',false,now()),
 ('c7200000-0000-4000-8000-000000002222','c7200000-0000-4000-8000-000000000001','owner','active',true,now()),
 ('c7200000-0000-4000-8000-000000002222','c7100000-0000-4000-8000-000000000001','admin','active',false,now());
INSERT INTO public.profiles(user_id,active_tenant_id) VALUES
 ('c7100000-0000-4000-8000-000000000001','c7100000-0000-4000-8000-000000001111'),
 ('c7100000-0000-4000-8000-000000000002','c7100000-0000-4000-8000-000000001111'),
 ('c7200000-0000-4000-8000-000000000001','c7200000-0000-4000-8000-000000002222')
ON CONFLICT(user_id) DO UPDATE SET active_tenant_id=excluded.active_tenant_id;
INSERT INTO public.clients(id,tenant_id,account_number,created_by,first_name,last_name,email,updated_at) VALUES
 ('c7100000-0000-4000-8000-00000000c101','c7100000-0000-4000-8000-000000001111','CLT-CGA-1','c7100000-0000-4000-8000-000000000001','Safe','Contact','before@tests.invalid','2026-09-13 00:00:00+00'),
 ('c7200000-0000-4000-8000-00000000c201','c7200000-0000-4000-8000-000000002222','CLT-CGB-1','c7200000-0000-4000-8000-000000000001','Other','Tenant','other@tests.invalid','2026-09-13 00:00:00+00'),
 ('c7100000-0000-4000-8000-00000000c102','c7100000-0000-4000-8000-000000001111','CLT-CGA-2','c7100000-0000-4000-8000-000000000001','Delete','Fixture','delete@tests.invalid','2026-09-13 00:00:00+00'),
 ('c7100000-0000-4000-8000-00000000c103','c7100000-0000-4000-8000-000000001111','CLT-CGA-3','c7100000-0000-4000-8000-000000000001','Merge','Fixture','merge@tests.invalid','2026-09-13 00:00:00+00'),
 ('c7100000-0000-4000-8000-00000000c104','c7100000-0000-4000-8000-000000001111','CLT-CGA-4','c7100000-0000-4000-8000-000000000001','Bulk','Fixture','bulk@tests.invalid','2026-09-13 00:00:00+00'),
 ('c7100000-0000-4000-8000-00000000c105','c7100000-0000-4000-8000-000000001111','CLT-CGA-5','c7100000-0000-4000-8000-000000000001','Coach','Fixture','coach@tests.invalid','2026-09-13 00:00:00+00');
UPDATE public.clients SET linked_user_id='c7100000-0000-4000-8000-000000000002' WHERE id='c7100000-0000-4000-8000-00000000c103';
INSERT INTO public.businesses(id,tenant_id,owner_user_id,legal_name,is_active,updated_at) VALUES
 ('c7100000-0000-4000-8000-00000000b101','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','Archived Fixture',false,'2026-09-13 00:00:00+00'),
 ('c7100000-0000-4000-8000-00000000b102','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','Coach Scope Fixture',true,'2026-09-13 00:00:00+00');

-- Test-only privileges for direct durable-state assertions; the transaction rollback removes them.
-- The executor itself remains SECURITY DEFINER and is the only production mutation surface.
GRANT SELECT,UPDATE ON public.clients,public.paige_workspace_events TO service_role;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
CREATE TEMP TABLE crm_result AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"contact.update","contact_id":"c7100000-0000-4000-8000-00000000c101","expected_updated_at":"2026-09-13T00:00:00+00:00","patch":{"email":"after@tests.invalid"}}','same-tenant-update-1') result;
SELECT is((SELECT email FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c101'),'after@tests.invalid','same-tenant mutation commits');
SELECT is((SELECT result->>'outcome' FROM crm_result),'succeeded','executor returns truthful success');
SELECT is((SELECT result->'readback'->>'email' FROM crm_result),'after@tests.invalid','success contains durable readback');
CREATE TEMP TABLE crm_create_result AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"contact.create","patch":{"first_name":"Created","last_name":"Contact","email":"created@tests.invalid"}}','same-tenant-create-1') result;
SELECT is((SELECT result->'readback'->>'email' FROM crm_create_result),'created@tests.invalid','same-tenant contact create returns durable readback');
SELECT is((SELECT created_by_channel_type FROM public.clients WHERE id=((SELECT result->'readback'->>'id' FROM crm_create_result))::uuid),'api','Paige contact create uses canonical programmatic provenance');
SELECT is((SELECT count(*)::integer FROM public.paige_workspace_events WHERE tenant_id='c7100000-0000-4000-8000-000000001111' AND capability_key='crm_update_contact' AND outcome='capability_succeeded'),1,'canonical Rail receipt persists once');
SELECT is((public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.update","contact_id":"c7100000-0000-4000-8000-00000000c101","expected_updated_at":"2026-09-13T00:00:00+00:00","patch":{"email":"after@tests.invalid"}}','same-tenant-update-1')->>'replayed')::boolean,true,'same-payload retry is idempotent');
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.update","contact_id":"c7100000-0000-4000-8000-00000000c101","expected_updated_at":"2026-09-13T00:00:00+00:00","patch":{"email":"changed@tests.invalid"}}','same-tenant-update-1')$$,'22023','CRM_IDEMPOTENCY_REUSE','changed-payload replay is refused');
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.update","contact_id":"c7100000-0000-4000-8000-00000000c101","expected_updated_at":"2026-09-13T00:00:00+00:00","patch":{"email":"stale@tests.invalid"}}','stale-version-1')$$,'40001','CRM_VERSION_CONFLICT','stale optimistic version is refused');
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.update","contact_id":"c7200000-0000-4000-8000-00000000c201","expected_updated_at":"2026-09-13T00:00:00+00:00","patch":{"email":"forged@tests.invalid"}}','forged-target-1')$$,'P0002','CRM_CONTACT_NOT_FOUND','known cross-tenant target is refused without disclosure');
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002','{"approval_channel":"operator_card","action":"contact.create","patch":{"first_name":"Denied","last_name":"Member"}}','member-denial-1')$$,'42501','CRM_FORBIDDEN','ordinary member cannot mutate CRM');
RESET ROLE;
UPDATE public.tenant_members SET role='coach' WHERE tenant_id='c7100000-0000-4000-8000-000000001111' AND user_id='c7100000-0000-4000-8000-000000000002';
UPDATE public.clients SET assigned_coach_user_id='c7100000-0000-4000-8000-000000000002',primary_business_id='c7100000-0000-4000-8000-00000000b102' WHERE id='c7100000-0000-4000-8000-00000000c105';
UPDATE public.clients SET primary_business_id='c7100000-0000-4000-8000-00000000b102' WHERE id='c7100000-0000-4000-8000-00000000c101';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002',jsonb_build_object('approval_channel','operator_card','action','company.archive','company_id','c7100000-0000-4000-8000-00000000b102','expected_updated_at',(SELECT updated_at FROM public.businesses WHERE id='c7100000-0000-4000-8000-00000000b102'))::text,'coach-company-archive-1'),'42501','CRM_FORBIDDEN','coach cannot archive a company and unlink contacts outside coach scope');
SELECT is((SELECT count(*)::integer FROM public.clients WHERE primary_business_id='c7100000-0000-4000-8000-00000000b102'),2,'refused coach company archive has no collateral unlink effect');
CREATE TEMP TABLE bulk_preview AS SELECT public.preview_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"contact.bulk_update","target_ids":["c7100000-0000-4000-8000-00000000c104","c7200000-0000-4000-8000-00000000c201"],"patch":{"lifecycle_stage":"qualified"}}','bulk-preview-1') result;
SELECT is((SELECT (result->>'eligible_count')::integer FROM bulk_preview),1,'bulk preview binds only same-tenant eligible targets');
SELECT is((SELECT (result->>'refused_count')::integer FROM bulk_preview),1,'bulk preview reports forged or ineligible targets');
SELECT is((SELECT jsonb_array_length(result->'eligible_targets') FROM bulk_preview),1,'bulk preview exposes the exact eligible set for approval');
CREATE TEMP TABLE bulk_intervening_update AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 jsonb_build_object('approval_channel','operator_card','action','contact.update','contact_id','c7100000-0000-4000-8000-00000000c104',
   'expected_updated_at',(SELECT result->'eligible_targets'->0->>'updated_at' FROM bulk_preview),
   'patch',jsonb_build_object('current_notes','changed after preview')),'bulk-intervening-update-1') result;
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.bulk_update','preview_id',(SELECT result->>'preview_id' FROM bulk_preview))::text,'bulk-execute-1'),'40001','CRM_BULK_TARGET_VERSION_CONFLICT:1','bulk execution refuses a target changed after preview');
SELECT isnt((SELECT lifecycle_stage FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c104'),'qualified','failed bulk execution changes no eligible target');

CREATE TEMP TABLE delete_preview AS SELECT public.preview_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.hard_delete","contact_id":"c7100000-0000-4000-8000-00000000c102","expected_updated_at":"2026-09-13T00:00:00+00:00"}','delete-preview-1') result;
SELECT is((SELECT (result->>'eligible')::boolean FROM delete_preview),true,'hard-delete preview proves the synthetic contact is unlinked and dependency-free');
CREATE TEMP TABLE delete_result AS SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.hard_delete','preview_id',(SELECT result->>'preview_id' FROM delete_preview)),'delete-execute-1') result;
SELECT is((SELECT result->>'outcome' FROM delete_result),'succeeded','preview-bound synthetic hard delete succeeds atomically');
SELECT is((SELECT count(*)::integer FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c102'),0,'hard-delete readback is exact absence');
SELECT is((SELECT count(*)::integer FROM public.paige_workspace_events WHERE capability_key='crm_hard_delete_contact' AND outcome='capability_succeeded'),1,'hard delete writes the exact Rail capability receipt');
SELECT is((public.preview_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.hard_delete","contact_id":"c7100000-0000-4000-8000-00000000c102","expected_updated_at":"2026-09-13T00:00:00+00:00"}','delete-preview-1')->>'replayed')::boolean,true,'consumed preview retry returns the durable cached result');
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.link_company','contact_id','c7100000-0000-4000-8000-00000000c101','company_id','c7100000-0000-4000-8000-00000000b101','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c101'))::text,'archived-company-link-1'),'P0002','CRM_BUSINESS_NOT_FOUND','linking an archived company is refused');

SELECT throws_ok(format('SELECT public.preview_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.merge','contact_id','c7100000-0000-4000-8000-00000000c101','loser_contact_id','c7100000-0000-4000-8000-00000000c103','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c101'),'expected_loser_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c103'))::text,'merge-missing-identity-resolution-1'),'22023','CRM_MERGE_IDENTITY_RESOLUTION_REQUIRED','portal identity transfer requires an explicit merge resolution');
CREATE TEMP TABLE merge_preview AS SELECT public.preview_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.merge','contact_id','c7100000-0000-4000-8000-00000000c101','loser_contact_id','c7100000-0000-4000-8000-00000000c103','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c101'),'expected_loser_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c103'),'resolutions',jsonb_build_object('linked_user_id','loser')),'merge-preview-1') result;
SELECT is((SELECT (result->>'eligible')::boolean FROM merge_preview),true,'merge preview binds an eligible survivor and loser');
SELECT is((SELECT conflict->>'resolution' FROM merge_preview, pg_catalog.jsonb_array_elements(result->'conflicts') conflict WHERE conflict->>'field'='linked_user_id'),'loser','merge preview discloses one-sided portal identity transfer');
CREATE TEMP TABLE merge_result AS SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.merge','preview_id',(SELECT result->>'preview_id' FROM merge_preview)),'merge-execute-1') result;
SELECT is((SELECT result->>'outcome' FROM merge_result),'succeeded','preview-bound synthetic merge succeeds atomically');
SELECT is((SELECT status FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c103'),'archived','merge archives the losing contact instead of erasing it');
SELECT is((SELECT merged_into_contact_id FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c103'),'c7100000-0000-4000-8000-00000000c101'::uuid,'merge records the explicit survivor');
SELECT is((SELECT count(*)::integer FROM public.paige_workspace_events WHERE capability_key='crm_merge_contacts' AND outcome='capability_succeeded'),1,'merge writes the exact Rail capability receipt');
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.restore','contact_id','c7100000-0000-4000-8000-00000000c103','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c103'))::text,'restore-merged-1'),'42501','CRM_CONTACT_MERGED','merged-away contacts cannot be restored without an atomic unmerge');
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"action":"contact.create","patch":{"first_name":"Denied","last_name":"NoAuthority"}}','missing-authority-1')$$,'42501','CRM_AUTHORITY_REQUIRED','executor refuses commands without server-issued authority');

RESET ROLE;
UPDATE public.profiles SET active_tenant_id='c7200000-0000-4000-8000-000000002222' WHERE user_id='c7100000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.create","patch":{"first_name":"Denied","last_name":"Switched"}}','account-switch-1')$$,'42501','CRM_ACTIVE_ACCOUNT_CHANGED','active account is revalidated inside the write transaction');
RESET ROLE;
UPDATE public.profiles SET active_tenant_id='c7100000-0000-4000-8000-000000001111' WHERE user_id='c7100000-0000-4000-8000-000000000001';
UPDATE public.tenants SET status='suspended' WHERE id='c7100000-0000-4000-8000-000000001111';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.create","patch":{"first_name":"Denied","last_name":"SuspendedTenant"}}','tenant-suspended-1')$$,'42501','CRM_TENANT_SUSPENDED','suspended tenant cannot execute CRM writes');
RESET ROLE;
UPDATE public.tenants SET status='active' WHERE id='c7100000-0000-4000-8000-000000001111';

RESET ROLE;
UPDATE public.profiles SET active_tenant_id='c7100000-0000-4000-8000-000000001111' WHERE user_id='c7100000-0000-4000-8000-000000000001';
INSERT INTO public.tenant_tool_autonomy(tenant_id,tool_key,mode,updated_by)
VALUES ('c7100000-0000-4000-8000-000000001111','crm_create_contact','off','c7100000-0000-4000-8000-000000000001')
ON CONFLICT (tenant_id,tool_key) DO UPDATE SET mode=excluded.mode,updated_by=excluded.updated_by,updated_at=now();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.create","patch":{"first_name":"Denied","last_name":"AutonomyOff"}}','autonomy-off-1')$$,'42501','CRM_AUTONOMY_REFUSED','executor revalidates an off autonomy policy inside the write transaction');

RESET ROLE;
UPDATE public.tenant_tool_autonomy SET mode='auto',updated_at=now() WHERE tenant_id='c7100000-0000-4000-8000-000000001111' AND tool_key='crm_create_contact';
INSERT INTO public.tenant_tool_autonomy(tenant_id,tool_key,mode,updated_by)
VALUES ('c7100000-0000-4000-8000-000000001111','crm_assign_contact_owner','auto','c7100000-0000-4000-8000-000000000001')
ON CONFLICT (tenant_id,tool_key) DO UPDATE SET mode=excluded.mode,updated_by=excluded.updated_by,updated_at=now();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"standing_autonomy_setting","action":"contact.assign_owner"}','high-standing-lane-1')$$,'42501','CRM_APPROVAL_REQUIRED','high-risk commands require the single-use operator approval lane even when autonomy is auto');

RESET ROLE;
UPDATE public.tenant_members SET status='suspended' WHERE tenant_id='c7100000-0000-4000-8000-000000001111' AND user_id='c7100000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.create","patch":{"first_name":"Denied","last_name":"Suspended"}}','suspended-denial-1')$$,'42501','CRM_FORBIDDEN','stale membership is revalidated at execution');
SELECT is((SELECT email FROM public.clients WHERE id='c7200000-0000-4000-8000-00000000c201'),'other@tests.invalid','all refused attempts have no cross-tenant effect');

SELECT * FROM finish();
ROLLBACK;