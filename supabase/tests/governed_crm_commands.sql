-- Canonical governed CRM command: synthetic tenant fixtures only; always rolled back.
BEGIN;
SELECT plan(96);

SELECT ok(NOT has_function_privilege('anon','public.execute_crm_command(uuid,uuid,jsonb,text)','EXECUTE'),'anon cannot execute the CRM domain writer');
SELECT ok(NOT has_function_privilege('authenticated','public.execute_crm_command(uuid,uuid,jsonb,text)','EXECUTE'),'authenticated callers cannot bypass the CRM action door');
SELECT ok(has_function_privilege('service_role','public.execute_crm_command(uuid,uuid,jsonb,text)','EXECUTE'),'only the trusted service action door can execute');
SELECT ok(NOT has_table_privilege('authenticated','public.crm_command_results','SELECT'),'browser callers cannot read the private replay store');
SELECT ok(NOT has_table_privilege('authenticated','public.crm_command_previews','SELECT'),'browser callers cannot read the private destructive preview store');
SELECT ok(NOT has_function_privilege('authenticated','public.read_crm_command_result(uuid,uuid,jsonb,text)','EXECUTE'),'browser callers cannot read the private durable replay seam');
SELECT ok(has_function_privilege('service_role','public.read_crm_command_result(uuid,uuid,jsonb,text)','EXECUTE'),'only the trusted action door can recover an exact durable result');

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
 ('c7100000-0000-4000-8000-00000000c105','c7100000-0000-4000-8000-000000001111','CLT-CGA-5','c7100000-0000-4000-8000-000000000001','Coach','Fixture','coach@tests.invalid','2026-09-13 00:00:00+00'),
 ('c7100000-0000-4000-8000-00000000c106','c7100000-0000-4000-8000-000000001111','CLT-CGA-6','c7100000-0000-4000-8000-000000000001','Unlink','Fixture','unlink@tests.invalid','2026-09-13 00:00:00+00'),
 ('c7100000-0000-4000-8000-00000000c107','c7100000-0000-4000-8000-000000001111','CLT-CGA-7','c7100000-0000-4000-8000-000000000001','Identity','Survivor','survivor@tests.invalid','2026-09-13 00:00:00+00'),
 ('c7100000-0000-4000-8000-00000000c108','c7100000-0000-4000-8000-000000001111','CLT-CGA-8','c7100000-0000-4000-8000-000000000001','Identity','Loser','loser@tests.invalid','2026-09-13 00:00:00+00'),
 ('c7100000-0000-4000-8000-00000000c109','c7100000-0000-4000-8000-000000001111','CLT-CGA-9','c7100000-0000-4000-8000-000000000001','Recovery','Delete','recovery-delete@tests.invalid','2026-09-13 00:00:00+00');
UPDATE public.clients SET linked_user_id='c7100000-0000-4000-8000-000000000002' WHERE id='c7100000-0000-4000-8000-00000000c103';
UPDATE public.clients SET linked_user_id='c7200000-0000-4000-8000-000000000001' WHERE id='c7200000-0000-4000-8000-00000000c201';
INSERT INTO public.businesses(id,tenant_id,owner_user_id,legal_name,is_active,is_primary,updated_at) VALUES
 ('c7100000-0000-4000-8000-00000000b101','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','Archived Fixture',false,false,'2026-09-13 00:00:00+00'),
 ('c7100000-0000-4000-8000-00000000b102','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','Coach Scope Fixture',true,false,'2026-09-13 00:00:00+00'),
 ('c7200000-0000-4000-8000-00000000b201','c7200000-0000-4000-8000-000000002222','c7200000-0000-4000-8000-000000000001','Archived Primary',false,true,'2026-09-13 00:00:00+00'),
 ('c7200000-0000-4000-8000-00000000b202','c7200000-0000-4000-8000-000000002222','c7200000-0000-4000-8000-000000000001','Active Primary',true,true,'2026-09-13 00:00:00+00');
UPDATE public.clients SET entity_name='Unlink Fixture LLC',primary_business_id='c7100000-0000-4000-8000-00000000b102' WHERE id='c7100000-0000-4000-8000-00000000c106';
SELECT set_config('app.pipeline_created_through','paige',true);
SELECT set_config('app.pipeline_requested_by','c7100000-0000-4000-8000-000000000001',true);
INSERT INTO public.pipelines(tenant_id,name,is_default) VALUES
 ('c7100000-0000-4000-8000-000000001111','CRM Review Pipeline',true);
INSERT INTO public.pipeline_stages(id,pipeline_id,tenant_id,label,order_index,probability,stage_type) VALUES
 ('c7100000-0000-4000-8000-00000000a201',(SELECT id FROM public.pipelines WHERE tenant_id='c7100000-0000-4000-8000-000000001111' AND name='CRM Review Pipeline'),'c7100000-0000-4000-8000-000000001111','Review Stage',1,10,'open');
INSERT INTO public.deals(id,tenant_id,title,pipeline_id,stage_id,version,created_by) VALUES
 ('c7100000-0000-4000-8000-00000000d101','c7100000-0000-4000-8000-000000001111','Tenant-bound Deal',(SELECT id FROM public.pipelines WHERE tenant_id='c7100000-0000-4000-8000-000000001111' AND name='CRM Review Pipeline'),'c7100000-0000-4000-8000-00000000a201',1,'c7100000-0000-4000-8000-000000000001');
SELECT throws_ok($$INSERT INTO public.paige_invoices(tenant_id,contact_id,deal_id,invoice_number,amount_total_cents,created_by)
 VALUES ('c7200000-0000-4000-8000-000000002222','c7200000-0000-4000-8000-00000000c201','c7100000-0000-4000-8000-00000000d101','INV-CRM-CROSS-TENANT',100,'c7200000-0000-4000-8000-000000000001')$$,
 '23503','insert or update on table "paige_invoices" violates foreign key constraint "paige_invoices_tenant_deal_crm_fk"','a tenant cannot attach its invoice to another tenant deal');

-- Test-only privileges for direct durable-state assertions; the transaction rollback removes them.
-- The executor itself remains SECURITY DEFINER and is the only production mutation surface.
GRANT SELECT,UPDATE ON public.clients,public.paige_workspace_events TO service_role;
GRANT SELECT ON public.businesses TO service_role;

-- Test-local no-network spy: any unsuppressed task assignment trigger records here instead of
-- invoking an Edge Function. The outer transaction rollback restores the production function.
CREATE TEMP TABLE task_notification_spy(payload jsonb);
GRANT SELECT,INSERT ON task_notification_spy TO service_role;
CREATE OR REPLACE FUNCTION public.fire_team_event(payload jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN INSERT INTO pg_temp.task_notification_spy VALUES (payload); END $$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT is(
  (SELECT count(*)::integer FROM public.list_tool_autonomy(NULL)
   WHERE tool_key = ANY (ARRAY[
     'crm_create_contact','crm_update_contact','crm_archive_contact','crm_restore_contact',
     'crm_link_contact_company','crm_unlink_contact_company','crm_assign_coach','crm_assign_contact_owner',
     'crm_merge_contacts','crm_hard_delete_contact','crm_bulk_update_contacts',
     'crm_create_company','crm_update_company','crm_archive_company','crm_restore_company',
     'crm_create_task','crm_update_task','crm_assign_task','crm_reschedule_task',
     'crm_complete_task','crm_reopen_task','crm_cancel_task','crm_delete_task',
     'crm_log_activity','deal_create','crm_update_deal','crm_assign_deal_owner',
     'crm_assign_deal_contact','deal_move_stage','crm_close_deal','crm_reopen_deal','crm_delete_deal'
   ])),
  32,
  'the latest autonomy catalogue exposes all 32 governed CRM command controls'
);
CREATE TEMP TABLE auto_stub_primary_guard AS SELECT public.execute_crm_command(
 'c7200000-0000-4000-8000-000000002222','c7200000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"contact.create","patch":{"first_name":"Auto","last_name":"Stub","entity_name":"Secondary Auto Stub"}}','auto-stub-primary-guard-1') result;
SELECT is((SELECT count(*)::integer FROM public.businesses WHERE tenant_id='c7200000-0000-4000-8000-000000002222' AND owner_user_id='c7200000-0000-4000-8000-000000000001' AND is_active AND is_primary),1,'contact auto-stub preserves exactly one active primary company for the owner');
CREATE TEMP TABLE unlink_result AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 jsonb_build_object('approval_channel','operator_card','action','contact.unlink_company','contact_id','c7100000-0000-4000-8000-00000000c106','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c106')),
 'unlink-auto-stub-guard-1') result;
SELECT is((SELECT primary_business_id FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c106'),NULL::uuid,'explicit company unlink remains unlinked despite a populated entity name');
SELECT is((SELECT count(*)::integer FROM public.businesses WHERE tenant_id='c7100000-0000-4000-8000-000000001111'),2,'explicit company unlink creates no replacement auto-stub company');
CREATE TEMP TABLE post_unlink_update AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 jsonb_build_object('approval_channel','operator_card','action','contact.update','contact_id','c7100000-0000-4000-8000-00000000c106','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c106'),'patch',jsonb_build_object('phone','+15555550106')),
 'post-unlink-update-1') result;
SELECT is((SELECT primary_business_id FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c106'),NULL::uuid,'a later ordinary contact edit preserves the explicit company unlink');
SELECT is((SELECT count(*)::integer FROM public.businesses WHERE tenant_id='c7100000-0000-4000-8000-000000001111'),2,'a later ordinary contact edit creates no replacement company after unlink');
CREATE TEMP TABLE contact_assignment_no_send AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 jsonb_build_object('approval_channel','operator_card','action','contact.assign_coach','contact_id','c7100000-0000-4000-8000-00000000c106','owner_user_id','c7100000-0000-4000-8000-000000000001','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c106')),
 'contact-assignment-no-send-1') result;
SELECT is((SELECT (result->'readback'->>'notification_sent')::boolean FROM contact_assignment_no_send),false,'canonical coach assignment truthfully reports no outbound notification');
SELECT is((SELECT count(*)::integer FROM task_notification_spy),0,'canonical coach assignment invokes no legacy outbound team event');
SELECT is((SELECT count(*)::integer FROM public.businesses WHERE tenant_id='c7200000-0000-4000-8000-000000002222' AND owner_user_id='c7200000-0000-4000-8000-000000000001' AND legal_name='Secondary Auto Stub' AND is_active AND NOT is_primary),1,'contact auto-stub creates the requested linked company without promoting a second primary');
CREATE TEMP TABLE task_metadata_fixture AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"task.create","patch":{"title":"Metadata Fixture"}}','task-metadata-create-1') result;
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','task.update','task_id',(SELECT result->'readback'->>'id' FROM task_metadata_fixture),'expected_updated_at',(SELECT result->'readback'->>'updated_at' FROM task_metadata_fixture),'patch',jsonb_build_object('metadata','urgent'))::text,'task-metadata-invalid-1'),'22023','CRM_TASK_METADATA_INVALID','task update refuses malformed metadata instead of recording a no-op success');
SELECT throws_ok($$SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"task.create","patch":{"title":"Unsupported contact follow-up","contact_id":"c7100000-0000-4000-8000-00000000c103"}}','contact-task-link-unavailable-1')$$,
 '0A000','CRM_TASK_CONTACT_LINK_UNAVAILABLE','task create refuses rather than discarding an unsupported contact relationship');
CREATE TEMP TABLE linked_contact_task AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"task.create","patch":{"title":"Operator follow-up"}}','linked-contact-task-1') result;
SELECT is((SELECT result->'readback'->>'assignee_user_id' FROM linked_contact_task),'c7100000-0000-4000-8000-000000000001','task create defaults to the requesting operator, never the contact portal identity');
SELECT is((SELECT jsonb_build_object('external_effect',(result->'readback'->>'external_effect')::boolean,'notification_sent',(result->'readback'->>'notification_sent')::boolean) FROM linked_contact_task),'{"external_effect":false,"notification_sent":false}'::jsonb,'task readback truthfully reports no assignment notification');
SELECT is((SELECT count(*)::integer FROM task_notification_spy),0,'canonical task creation invokes no outbound assignment notification');
CREATE TEMP TABLE linked_contact_task_assignment AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 jsonb_build_object('approval_channel','operator_card','action','task.assign','task_id',(SELECT (result->'readback'->>'id')::uuid FROM linked_contact_task),'expected_updated_at',(SELECT (result->'readback'->>'updated_at')::timestamptz FROM linked_contact_task),'patch',jsonb_build_object('assignee_user_id','c7100000-0000-4000-8000-000000000002')),'linked-contact-task-assign-1') result;
SELECT is((SELECT (result->'readback'->>'notification_sent')::boolean FROM linked_contact_task_assignment),false,'canonical task reassignment truthfully reports no outbound notification');
SELECT is((SELECT count(*)::integer FROM task_notification_spy),0,'canonical task reassignment invokes no outbound assignment notification');
CREATE TEMP TABLE archived_primary_company_create AS SELECT public.execute_crm_command(
 'c7200000-0000-4000-8000-000000002222','c7200000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"company.create","contact_id":"c7200000-0000-4000-8000-00000000c201","patch":{"legal_name":"Active Secondary"}}','archived-primary-create-1') result;
SELECT is((SELECT (result->'readback'->>'is_primary')::boolean FROM archived_primary_company_create),false,'company create does not duplicate an archived primary owner company');
CREATE TEMP TABLE archived_primary_company_restore AS SELECT public.execute_crm_command(
 'c7200000-0000-4000-8000-000000002222','c7200000-0000-4000-8000-000000000001',
 jsonb_build_object('approval_channel','operator_card','action','company.restore','company_id','c7200000-0000-4000-8000-00000000b201','expected_updated_at',(SELECT updated_at FROM public.businesses WHERE id='c7200000-0000-4000-8000-00000000b201')),
 'archived-primary-restore-1') result;
SELECT is((SELECT count(*)::integer FROM public.businesses WHERE tenant_id='c7200000-0000-4000-8000-000000002222' AND owner_user_id='c7200000-0000-4000-8000-000000000001' AND is_active AND is_primary),1,'restoring the archived primary leaves exactly one active primary for the owner');
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
SELECT is((SELECT count(*)::integer FROM public.paige_workspace_events WHERE tenant_id='c7100000-0000-4000-8000-000000001111' AND capability_key='crm_update_contact' AND outcome='capability_succeeded' AND detail->>'idempotency_key'='same-tenant-update-1'),1,'canonical Rail receipt persists once');
SELECT is((public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.update","contact_id":"c7100000-0000-4000-8000-00000000c101","expected_updated_at":"2026-09-13T00:00:00+00:00","patch":{"email":"after@tests.invalid"}}','same-tenant-update-1')->>'replayed')::boolean,true,'same-payload retry is idempotent');
SELECT is((public.read_crm_command_result('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"action":"contact.update","contact_id":"c7100000-0000-4000-8000-00000000c101","expected_updated_at":"2026-09-13T00:00:00+00:00","patch":{"email":"after@tests.invalid"}}','same-tenant-update-1')->>'replayed')::boolean,true,'lost-response recovery returns the exact durable result before another approval');
SELECT throws_ok($$SELECT public.read_crm_command_result('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"action":"contact.update","contact_id":"c7100000-0000-4000-8000-00000000c101","expected_updated_at":"2026-09-13T00:00:00+00:00","patch":{"email":"different@tests.invalid"}}','same-tenant-update-1')$$,'22023','CRM_IDEMPOTENCY_REUSE','lost-response recovery refuses a changed payload');
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.update","contact_id":"c7100000-0000-4000-8000-00000000c101","expected_updated_at":"2026-09-13T00:00:00+00:00","patch":{"tags":"vip"}}','malformed-tags-1')$$,'22023','CRM_TAGS_INVALID','malformed contact tags cannot advance history or fabricate a receipt');
SELECT throws_ok($$SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"deal.update","deal_id":"c7100000-0000-4000-8000-00000000d101","expected_version":1}','deal-noop-1')$$,'22023','CRM_DEAL_PATCH_REQUIRED','a no-op deal update cannot advance version or fabricate activity');
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
CREATE TEMP TABLE coach_command_input AS SELECT jsonb_build_object(
  'action','contact.update','contact_id','c7100000-0000-4000-8000-00000000c105',
  'expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c105'),
  'patch',jsonb_build_object('first_name','Coach Owned')
) command;
CREATE TEMP TABLE coach_command_result AS SELECT public.execute_crm_command(
  'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002',
  command||jsonb_build_object('approval_channel','operator_card'),'coach-recovery-1'
) result FROM coach_command_input;
SELECT is((SELECT public.read_crm_command_result(
  'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002',command,'coach-recovery-1'
)->>'replayed' FROM coach_command_input)::boolean,true,'coach can recover an exact result while current record assignment remains authorized');
SELECT throws_ok($$SELECT public.execute_crm_command(
  'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002',
  '{"approval_channel":"operator_card","action":"task.create","patch":{"title":"Foreign deal task","deal_id":"c7100000-0000-4000-8000-00000000d101"}}','coach-foreign-deal-task-1'
)$$,'42501','CRM_FORBIDDEN','coach cannot attach a task to an unrelated same-tenant deal');
SELECT throws_ok($$SELECT public.execute_crm_command(
  'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002',
  '{"approval_channel":"operator_card","action":"task.create","patch":{"title":"Foreign company task","company_id":"c7100000-0000-4000-8000-00000000b101"}}','coach-foreign-company-task-1'
)$$,'42501','CRM_FORBIDDEN','coach cannot attach a task to an unrelated same-tenant company');
RESET ROLE;
INSERT INTO public.businesses(id,tenant_id,owner_user_id,legal_name,is_active,is_primary,updated_at) VALUES
 ('c7100000-0000-4000-8000-00000000b103','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','Unrelated Coach Company',true,false,'2026-09-13 00:00:00+00');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002',jsonb_build_object('approval_channel','operator_card','action','contact.link_company','contact_id','c7100000-0000-4000-8000-00000000c105','company_id','c7100000-0000-4000-8000-00000000b103','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c105'))::text,'coach-foreign-contact-company-1'),'42501','CRM_FORBIDDEN','coach cannot link an assigned contact to an unrelated same-tenant company');
SELECT is((SELECT primary_business_id FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c105'),'c7100000-0000-4000-8000-00000000b102'::uuid,'refused coach company link preserves the existing relationship');
RESET ROLE;
DELETE FROM public.businesses WHERE id='c7100000-0000-4000-8000-00000000b103';
UPDATE public.clients SET assigned_coach_user_id=NULL WHERE id='c7100000-0000-4000-8000-00000000c105';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.read_crm_command_result(
  'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002',command,'coach-recovery-1'
) FROM coach_command_input$$,'42501','CRM_FORBIDDEN','cached readback is refused after the coach loses current record authorization');
SELECT throws_ok($$SELECT public.execute_crm_command(
  'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002',
  command||jsonb_build_object('approval_channel','operator_card'),'coach-recovery-1'
) FROM coach_command_input$$,'42501','CRM_FORBIDDEN','executor cache replay cannot bypass current record authorization');
RESET ROLE;
UPDATE public.clients SET assigned_coach_user_id='c7100000-0000-4000-8000-000000000002' WHERE id='c7100000-0000-4000-8000-00000000c105';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000002',jsonb_build_object('approval_channel','operator_card','action','company.archive','company_id','c7100000-0000-4000-8000-00000000b102','expected_updated_at',(SELECT updated_at FROM public.businesses WHERE id='c7100000-0000-4000-8000-00000000b102'))::text,'coach-company-archive-1'),'42501','CRM_FORBIDDEN','coach cannot archive a tenant-wide company outside assigned scope');
SELECT is((SELECT count(*)::integer FROM public.clients WHERE primary_business_id='c7100000-0000-4000-8000-00000000b102'),2,'refused coach company archive has no collateral effect');
RESET ROLE;
UPDATE public.businesses SET is_primary=true WHERE id='c7100000-0000-4000-8000-00000000b102';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
CREATE TEMP TABLE company_archive_result AS SELECT public.execute_crm_command(
  'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
  jsonb_build_object('approval_channel','operator_card','action','company.archive','company_id','c7100000-0000-4000-8000-00000000b102','expected_updated_at',(SELECT updated_at FROM public.businesses WHERE id='c7100000-0000-4000-8000-00000000b102')),
  'owner-company-archive-1') result;
SELECT is((SELECT jsonb_build_object('is_active',is_active,'is_primary',is_primary,'linked_contacts',(SELECT count(*) FROM public.clients WHERE primary_business_id='c7100000-0000-4000-8000-00000000b102')) FROM public.businesses WHERE id='c7100000-0000-4000-8000-00000000b102'),'{"is_active":false,"is_primary":true,"linked_contacts":2}'::jsonb,'company archive preserves primary state and contact relationships');
CREATE TEMP TABLE company_restore_result AS SELECT public.execute_crm_command(
  'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
  jsonb_build_object('approval_channel','operator_card','action','company.restore','company_id','c7100000-0000-4000-8000-00000000b102','expected_updated_at',(SELECT updated_at FROM public.businesses WHERE id='c7100000-0000-4000-8000-00000000b102')),
  'owner-company-restore-1') result;
SELECT is((SELECT jsonb_build_object('is_active',is_active,'is_primary',is_primary,'linked_contacts',(SELECT count(*) FROM public.clients WHERE primary_business_id='c7100000-0000-4000-8000-00000000b102')) FROM public.businesses WHERE id='c7100000-0000-4000-8000-00000000b102'),'{"is_active":true,"is_primary":true,"linked_contacts":2}'::jsonb,'company restore returns availability without reconstructing lost relationships');
SELECT throws_ok($$SELECT public.preview_crm_command(
  'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
  '{"approval_channel":"operator_card","action":"contact.bulk_update","target_ids":["c7100000-0000-4000-8000-00000000c104"],"patch":{"tags":["",7]}}','bulk-invalid-tags-1'
)$$,'22023','CRM_TAGS_INVALID','bulk preview refuses empty or non-string contact tags before approval');
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
CREATE TEMP TABLE bulk_assignee_preview AS SELECT public.preview_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"contact.bulk_update","target_ids":["c7100000-0000-4000-8000-00000000c104"],"patch":{"assigned_coach_user_id":"c7100000-0000-4000-8000-000000000002"}}','bulk-assignee-preview-1') result;
RESET ROLE;
UPDATE public.tenant_members SET status='suspended' WHERE tenant_id='c7100000-0000-4000-8000-000000001111' AND user_id='c7100000-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.bulk_update','preview_id',(SELECT result->>'preview_id' FROM bulk_assignee_preview))::text,'bulk-assignee-execute-1'),'42501','CRM_ASSIGNEE_FORBIDDEN','bulk execution revalidates the assignee active role after preview');
SELECT is((SELECT assigned_coach_user_id FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c104'),NULL::uuid,'refused stale-assignee bulk execution changes no contact');
SELECT throws_ok($$SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"deal.assign_owner","deal_id":"c7100000-0000-4000-8000-00000000d101","expected_version":1,"owner_user_id":"c7100000-0000-4000-8000-000000000002"}','deal-stale-owner-1')$$,
 '42501','PIPELINE_OWNER_INVALID','deal owner assignment refuses an inactive tenant member');
RESET ROLE;
UPDATE public.tenant_members SET status='active' WHERE tenant_id='c7100000-0000-4000-8000-000000001111' AND user_id='c7100000-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
CREATE TEMP TABLE bulk_assignment_success_preview AS SELECT public.preview_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"contact.bulk_update","target_ids":["c7100000-0000-4000-8000-00000000c104"],"patch":{"assigned_coach_user_id":"c7100000-0000-4000-8000-000000000002"}}','bulk-assignment-success-preview-1') result;
CREATE TEMP TABLE bulk_assignment_success AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 jsonb_build_object('approval_channel','operator_card','action','contact.bulk_update','preview_id',(SELECT result->>'preview_id' FROM bulk_assignment_success_preview)),'bulk-assignment-success-1') result;
SELECT ok((SELECT result->>'outcome'='succeeded' AND (result->'readback'->>'notification_sent')::boolean=false FROM bulk_assignment_success),'bulk coach assignment succeeds and truthfully reports no outbound notification');
SELECT is((SELECT count(*)::integer FROM task_notification_spy),0,'bulk coach assignment invokes no legacy outbound team event');
SELECT is((SELECT assigned_coach_user_id FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c104'),'c7100000-0000-4000-8000-000000000002'::uuid,'bulk coach assignment durably updates the exact preview-bound contact');

CREATE TEMP TABLE expired_preview_first AS SELECT public.preview_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.hard_delete","contact_id":"c7100000-0000-4000-8000-00000000c102","expected_updated_at":"2026-09-13T00:00:00+00:00"}','expired-delete-preview-1') result;
UPDATE public.crm_command_previews SET expires_at=now()+interval '90 seconds' WHERE id=(SELECT (result->>'preview_id')::uuid FROM expired_preview_first);
CREATE TEMP TABLE still_bound_preview AS SELECT public.preview_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.hard_delete","contact_id":"c7100000-0000-4000-8000-00000000c102","expected_updated_at":"2026-09-13T00:00:00+00:00"}','expired-delete-preview-1') result;
SELECT ok((SELECT result->>'preview_id' FROM expired_preview_first)=(SELECT result->>'preview_id' FROM still_bound_preview) AND (SELECT (result->>'replayed')::boolean FROM still_bound_preview),'a destructive preview remains stable while its bound confirmation can still be valid');
UPDATE public.crm_command_previews SET expires_at=now()+interval '30 seconds' WHERE id=(SELECT (result->>'preview_id')::uuid FROM expired_preview_first);
CREATE TEMP TABLE expired_preview_replacement AS SELECT public.preview_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.hard_delete","contact_id":"c7100000-0000-4000-8000-00000000c102","expected_updated_at":"2026-09-13T00:00:00+00:00"}','expired-delete-preview-1') result;
SELECT ok((SELECT result->>'preview_id' FROM expired_preview_first)<>(SELECT result->>'preview_id' FROM expired_preview_replacement) AND NOT (SELECT (result->>'replayed')::boolean FROM expired_preview_replacement),'a nearly expired destructive preview is revalidated and replaced before issuing an approval that could outlive it');
RESET ROLE;
INSERT INTO public.tasks(id,tenant_id,user_id,title,deal_id) VALUES
 ('c7100000-0000-4000-8000-00000000e101','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','Delete dependency A','c7100000-0000-4000-8000-00000000d101'),
 ('c7100000-0000-4000-8000-00000000e102','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','Delete dependency B','c7100000-0000-4000-8000-00000000d101');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
CREATE TEMP TABLE deal_delete_identity_preview AS SELECT public.preview_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"approval_channel":"operator_card","action":"deal.delete","deal_id":"c7100000-0000-4000-8000-00000000d101","expected_version":1}','deal-delete-identity-preview-1') result;
RESET ROLE;
DELETE FROM public.tasks WHERE id='c7100000-0000-4000-8000-00000000e101';
INSERT INTO public.tasks(id,tenant_id,user_id,title,deal_id) VALUES
 ('c7100000-0000-4000-8000-00000000e103','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','Replacement dependency','c7100000-0000-4000-8000-00000000d101');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','deal.delete','preview_id',(SELECT result->>'preview_id' FROM deal_delete_identity_preview))::text,'deal-delete-identity-execute-1'),'40001','CRM_DEPENDENCY_CONFLICT','deal delete refuses a same-count dependency identity swap after preview');
SELECT is((SELECT count(*)::integer FROM public.deals WHERE id='c7100000-0000-4000-8000-00000000d101'),1,'refused identity-changed deal delete preserves the deal');
CREATE TEMP TABLE delete_preview AS SELECT public.preview_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.hard_delete","contact_id":"c7100000-0000-4000-8000-00000000c102","expected_updated_at":"2026-09-13T00:00:00+00:00"}','delete-preview-1') result;
SELECT is((SELECT (result->>'eligible')::boolean FROM delete_preview),true,'hard-delete preview proves the synthetic contact is unlinked and dependency-free');
CREATE TEMP TABLE delete_result AS SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.hard_delete','preview_id',(SELECT result->>'preview_id' FROM delete_preview)),'delete-execute-1') result;
SELECT is((SELECT result->>'outcome' FROM delete_result),'succeeded','preview-bound synthetic hard delete succeeds atomically');
SELECT is((SELECT count(*)::integer FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c102'),0,'hard-delete readback is exact absence');
SELECT is((SELECT count(*)::integer FROM public.paige_workspace_events WHERE capability_key='crm_hard_delete_contact' AND outcome='capability_succeeded'),1,'hard delete writes the exact Rail capability receipt');
SELECT is((public.preview_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','{"approval_channel":"operator_card","action":"contact.hard_delete","contact_id":"c7100000-0000-4000-8000-00000000c102","expected_updated_at":"2026-09-13T00:00:00+00:00"}','delete-preview-1')->>'replayed')::boolean,true,'consumed preview retry returns the durable cached result');
CREATE TEMP TABLE lost_delete_preview AS SELECT public.preview_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"action":"contact.hard_delete","contact_id":"c7100000-0000-4000-8000-00000000c109","expected_updated_at":"2026-09-13T00:00:00+00:00"}','lost-delete-recovery-1:preview') result;
CREATE TEMP TABLE lost_delete_result AS SELECT public.execute_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 jsonb_build_object('approval_channel','operator_card','action','contact.hard_delete','preview_id',(SELECT result->>'preview_id' FROM lost_delete_preview)),'lost-delete-recovery-1') result;
RESET ROLE;
INSERT INTO public.tenant_tool_autonomy(tenant_id,tool_key,mode,updated_by) VALUES
 ('c7100000-0000-4000-8000-000000001111','crm_hard_delete_contact','off','c7100000-0000-4000-8000-000000000001')
ON CONFLICT (tenant_id,tool_key) DO UPDATE SET mode=excluded.mode,updated_by=excluded.updated_by,updated_at=now();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT is((public.read_crm_command_result(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"action":"contact.hard_delete","contact_id":"c7100000-0000-4000-8000-00000000c109","expected_updated_at":"2026-09-13T00:00:00+00:00"}','lost-delete-recovery-1')->>'replayed')::boolean,true,'lost destructive response remains recoverable after its autonomy lane is switched off');
SELECT throws_ok($$SELECT public.read_crm_command_result(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 '{"action":"contact.hard_delete","contact_id":"c7100000-0000-4000-8000-00000000c108","expected_updated_at":"2026-09-13T00:00:00+00:00"}','lost-delete-recovery-1')$$,
 '22023','CRM_IDEMPOTENCY_REUSE','destructive lost-response recovery refuses a changed original payload');
RESET ROLE;
UPDATE public.tenant_tool_autonomy SET mode='confirm',updated_at=now()
 WHERE tenant_id='c7100000-0000-4000-8000-000000001111' AND tool_key='crm_hard_delete_contact';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.link_company','contact_id','c7100000-0000-4000-8000-00000000c101','company_id','c7100000-0000-4000-8000-00000000b101','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c101'))::text,'archived-company-link-1'),'P0002','CRM_BUSINESS_NOT_FOUND','linking an archived company is refused');

INSERT INTO public.client_notes(id,contact_id,tenant_id,author_user_id,body) VALUES
 ('c7100000-0000-4000-8000-00000000f101','c7100000-0000-4000-8000-00000000c108','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','Preview-bound dependency A');
CREATE TEMP TABLE merge_identity_preview AS SELECT public.preview_crm_command(
 'c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',
 jsonb_build_object('action','contact.merge','contact_id','c7100000-0000-4000-8000-00000000c107','loser_contact_id','c7100000-0000-4000-8000-00000000c108','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c107'),'expected_loser_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c108')),
 'merge-identity-swap-1:preview') result;
RESET ROLE;
DELETE FROM public.client_notes WHERE id='c7100000-0000-4000-8000-00000000f101';
INSERT INTO public.client_notes(id,contact_id,tenant_id,author_user_id,body) VALUES
 ('c7100000-0000-4000-8000-00000000f102','c7100000-0000-4000-8000-00000000c108','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001','Replacement dependency B');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok(format('SELECT public.execute_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.merge','preview_id',(SELECT result->>'preview_id' FROM merge_identity_preview))::text,'merge-identity-swap-1'),'40001','CRM_DEPENDENCY_CONFLICT','merge refuses a same-count dependency identity swap after preview');
SELECT is((SELECT status FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c108'),'active','refused identity-changed merge preserves the losing contact');
SELECT throws_ok(format('SELECT public.preview_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.merge','contact_id','c7100000-0000-4000-8000-00000000c101','loser_contact_id','c7100000-0000-4000-8000-00000000c103','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c101'),'expected_loser_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c103'))::text,'merge-missing-identity-resolution-1'),'22023','CRM_MERGE_IDENTITY_RESOLUTION_REQUIRED','portal identity transfer requires an explicit merge resolution');
CREATE TEMP TABLE merge_preview AS SELECT public.preview_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.merge','contact_id','c7100000-0000-4000-8000-00000000c101','loser_contact_id','c7100000-0000-4000-8000-00000000c103','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c101'),'expected_loser_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c103'),'resolutions',jsonb_build_object('linked_user_id','loser')),'merge-preview-1') result;
SELECT is((SELECT (result->>'eligible')::boolean FROM merge_preview),true,'merge preview binds an eligible survivor and loser');
SELECT is((SELECT conflict->>'resolution' FROM merge_preview, pg_catalog.jsonb_array_elements(result->'conflicts') conflict WHERE conflict->>'field'='linked_user_id'),'loser','merge preview discloses one-sided portal identity transfer');
CREATE TEMP TABLE merge_result AS SELECT public.execute_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.merge','preview_id',(SELECT result->>'preview_id' FROM merge_preview)),'merge-execute-1') result;
SELECT is((SELECT result->>'outcome' FROM merge_result),'succeeded','preview-bound synthetic merge succeeds atomically');
SELECT is((SELECT status FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c103'),'archived','merge archives the losing contact instead of erasing it');
SELECT is((SELECT merged_into_contact_id FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c103'),'c7100000-0000-4000-8000-00000000c101'::uuid,'merge records the explicit survivor');
SELECT is((SELECT count(*)::integer FROM public.paige_workspace_events WHERE capability_key='crm_merge_contacts' AND outcome='capability_succeeded'),1,'merge writes the exact Rail capability receipt');
SELECT throws_ok(format('SELECT public.preview_crm_command(%L,%L,%L::jsonb,%L)','c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('action','contact.merge','contact_id','c7100000-0000-4000-8000-00000000c101','loser_contact_id','c7100000-0000-4000-8000-00000000c103','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c101'),'expected_loser_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c103'))::text,'inactive-merge-preview-1'),'42501','CRM_MERGE_TARGET_INACTIVE','an archived or already-merged contact cannot enter a new merge preview');
CREATE TEMP TABLE merged_survivor_delete_preview AS SELECT public.preview_crm_command('c7100000-0000-4000-8000-000000001111','c7100000-0000-4000-8000-000000000001',jsonb_build_object('approval_channel','operator_card','action','contact.hard_delete','contact_id','c7100000-0000-4000-8000-00000000c101','expected_updated_at',(SELECT updated_at FROM public.clients WHERE id='c7100000-0000-4000-8000-00000000c101')),'merged-survivor-delete-preview-1') result;
SELECT is((SELECT (result->>'eligible')::boolean FROM merged_survivor_delete_preview),false,'hard-delete preview refuses a merge survivor with incoming lineage');
SELECT is((SELECT (result->'dependency_counts'->'by_reference'->>'clients.merged_into_contact_id')::integer FROM merged_survivor_delete_preview),1,'hard-delete preview reports the exact incoming merge-lineage count');
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