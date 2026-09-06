-- Executable actor/RLS proof for the Business Vault Phase 2 security boundary.
-- Synthetic fixtures only; the entire test is rolled back.
BEGIN;
SELECT plan(38);

INSERT INTO auth.users(id,aud,role,email) VALUES
 ('b1000000-0000-4000-8000-000000000001','authenticated','authenticated','vault-owner@tests.invalid'),
 ('b1000000-0000-4000-8000-000000000002','authenticated','authenticated','vault-admin@tests.invalid'),
 ('b1000000-0000-4000-8000-000000000003','authenticated','authenticated','vault-member@tests.invalid'),
 ('b2000000-0000-4000-8000-000000000001','authenticated','authenticated','vault-owner-b@tests.invalid');
INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,account_number,features) VALUES
 ('b1000000-0000-4000-8000-00000000aaaa','vault-a','Vault A','active','standalone','VAA',9701001,'{}'),
 ('b2000000-0000-4000-8000-00000000bbbb','vault-b','Vault B','active','standalone','VAB',9701002,'{}');
INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at) VALUES
 ('b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','owner','active',true,now()),
 ('b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000002','admin','active',false,now()),
 ('b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000003','member','active',false,now()),
 ('b2000000-0000-4000-8000-00000000bbbb','b2000000-0000-4000-8000-000000000001','owner','active',true,now());
INSERT INTO public.profiles(user_id,active_tenant_id) VALUES
 ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa'),
 ('b1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-00000000aaaa'),
 ('b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-00000000aaaa'),
 ('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000bbbb')
ON CONFLICT(user_id) DO UPDATE SET active_tenant_id=excluded.active_tenant_id;

INSERT INTO public.business_vault_records(id,tenant_id,title,section,record_type,handling_mode,visibility,lifecycle_state,
 truth_state,source_kind,source_state,interpretation_state,created_by) VALUES
 ('ba000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','Owner source','contracts','Agreement','approved_context','owner_only','active','owner_entered','manual_upload','current','unavailable','b1000000-0000-4000-8000-000000000001'),
 ('ba000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-00000000aaaa','Admin source','contracts','Agreement','approved_context','owner_admin','active','owner_entered','manual_upload','current','unavailable','b1000000-0000-4000-8000-000000000001'),
 ('bb000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000bbbb','Other tenant','library','Evidence','store_only','owner_admin','active','owner_entered','manual_upload','current','not_requested','b2000000-0000-4000-8000-000000000001');
INSERT INTO public.business_vault_versions(id,tenant_id,record_id,storage_path,original_filename,declared_mime,actual_mime,
 declared_size,actual_size,sha256,validation_state,access_scope,created_by,finalized_at) VALUES
 ('ca000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000001','a/owner/v1/object','owner.pdf','application/pdf','application/pdf',100,100,repeat('a',64),'validation_unavailable','owner_only','b1000000-0000-4000-8000-000000000001',now()),
 ('ca000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000002','a/admin/v1/object','admin.pdf','application/pdf','application/pdf',100,100,repeat('b',64),'validation_unavailable','owner_admin','b1000000-0000-4000-8000-000000000001',now()),
 ('cb000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000bbbb','bb000000-0000-4000-8000-000000000001','b/record/v1/object','other.pdf','application/pdf','application/pdf',100,100,repeat('c',64),'validation_unavailable','owner_admin','b2000000-0000-4000-8000-000000000001',now());
UPDATE public.business_vault_records SET current_version_id=CASE id
 WHEN 'ba000000-0000-4000-8000-000000000001' THEN 'ca000000-0000-4000-8000-000000000001'::uuid
 WHEN 'ba000000-0000-4000-8000-000000000002' THEN 'ca000000-0000-4000-8000-000000000002'::uuid
 ELSE 'cb000000-0000-4000-8000-000000000001'::uuid END;
INSERT INTO public.business_vault_contracts(id,tenant_id,record_id,contract_type,state,review_state,created_by) VALUES
 ('da000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000001','Owner agreement','active','owner_entered','b1000000-0000-4000-8000-000000000001');
INSERT INTO public.business_vault_obligations(id,tenant_id,source_record_id,contract_id,category,title,state,source_state,created_by) VALUES
 ('ea000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','renewal','Owner renewal','confirmed','current','b1000000-0000-4000-8000-000000000001');
INSERT INTO public.business_vault_context_facts(id,tenant_id,record_id,version_id,fact_key,fact_value,provenance,state,created_by) VALUES
 ('fa000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','policy_status','"active"','owner_entered','proposed','b1000000-0000-4000-8000-000000000001'),
 ('fa000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','business_legal_name','"Owner Canonical LLC"','owner_entered','approved','b1000000-0000-4000-8000-000000000001'),
 ('fa000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000002','ca000000-0000-4000-8000-000000000002','business_legal_name','"Admin Override LLC"','owner_entered','proposed','b1000000-0000-4000-8000-000000000002');

SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT is((SELECT count(*)::int FROM public.business_vault_records),1,'admin sees only owner-admin records');
SELECT is((SELECT count(*)::int FROM public.business_vault_contracts),0,'owner-only contract metadata is invisible to admin');
SELECT is((SELECT count(*)::int FROM public.business_vault_obligations),0,'owner-only obligation metadata is invisible to admin');
SELECT is((public.business_vault_snapshot()->'contracts')::text,'[]','snapshot does not leak owner-only contracts');
SELECT is((public.business_vault_snapshot()->'obligations')::text,'[]','snapshot does not leak owner-only obligations');
SELECT throws_ok($$SELECT public.business_vault_save_contract('b1000000-0000-4000-8000-00000000aaaa','{"recordId":"ba000000-0000-4000-8000-000000000001","contractType":"Attack"}')$$,'42501','VAULT_UNAVAILABLE','known owner-only ID cannot be mutated by admin');
SELECT throws_ok($$SELECT public.business_vault_download_version('b1000000-0000-4000-8000-00000000aaaa','ca000000-0000-4000-8000-000000000001')$$,'42501','VAULT_UNAVAILABLE','known owner-only version cannot be downloaded by admin');
SELECT throws_ok($$SELECT public.business_vault_reserve_upload('b2000000-0000-4000-8000-00000000bbbb','Spoof','library','Evidence','store_only','owner_admin','x.pdf','application/pdf',100,NULL)$$,'42501','VAULT_UNAVAILABLE','client tenant spoof is refused');
SELECT throws_ok($$SELECT public.business_vault_reserve_upload('b1000000-0000-4000-8000-00000000aaaa','Secret','library','Evidence','store_only','owner_only','x.pdf','application/pdf',100,NULL)$$,'22023','VAULT_UPLOAD_REFUSED','admin cannot create owner-only upload');
SELECT throws_ok($$SELECT public.business_vault_review_fact('b1000000-0000-4000-8000-00000000aaaa','fa000000-0000-4000-8000-000000000003','approved')$$,'42501','VAULT_UNAVAILABLE','admin cannot replace an owner-only canonical fact');
RESET ROLE;
SELECT is((SELECT state FROM public.business_vault_context_facts WHERE id='fa000000-0000-4000-8000-000000000002'),'approved','owner-only canonical fact remains approved');

SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SELECT is(public.business_vault_access_status()->>'allowed','false','ordinary member is denied without metadata');
SELECT throws_ok($$SELECT public.business_vault_snapshot()$$,'42501','VAULT_UNAVAILABLE','ordinary member cannot invoke snapshot');

SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($$SELECT public.business_vault_archive_record('b1000000-0000-4000-8000-00000000aaaa','bb000000-0000-4000-8000-000000000001')$$,'42501','VAULT_UNAVAILABLE','cross-tenant known record ID is refused');
SELECT lives_ok($$SELECT public.business_vault_review_fact('b1000000-0000-4000-8000-00000000aaaa','fa000000-0000-4000-8000-000000000001','approved')$$,'owner approves a current bounded fact');
SELECT ok(public.business_vault_get_context() @> '[{"fact_key":"policy_status","fact_value":"active"}]'::jsonb,'approved fact enters the bounded context projection');
SELECT lives_ok($$SELECT public.business_vault_review_fact('b1000000-0000-4000-8000-00000000aaaa','fa000000-0000-4000-8000-000000000001','revoked')$$,'owner revokes an approved fact');
SELECT ok(NOT(public.business_vault_get_context() @> '[{"fact_key":"policy_status"}]'::jsonb),'revoked fact leaves the bounded context projection');
SELECT lives_ok($$SELECT public.business_vault_propose_fact('b1000000-0000-4000-8000-00000000aaaa','{"recordId":"ba000000-0000-4000-8000-000000000001","versionId":"ca000000-0000-4000-8000-000000000001","factKey":"policy_status","factValue":"active"}')$$,'owner can propose a bounded source-linked fact');
SELECT lives_ok($$SELECT public.business_vault_archive_record('b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000001')$$,'owner can archive their active record');
RESET ROLE;
SELECT is((SELECT bool_and(state NOT IN('proposed','approved')) FROM public.business_vault_context_facts WHERE record_id='ba000000-0000-4000-8000-000000000001'),true,'archive leaves no proposed or approved fact current');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($$SELECT public.business_vault_review_fact('b1000000-0000-4000-8000-00000000aaaa','fa000000-0000-4000-8000-000000000001','approved')$$,'42501','VAULT_UNAVAILABLE','retired stale fact cannot later be approved');

RESET ROLE;
UPDATE public.tenant_members SET status='suspended' WHERE tenant_id='b1000000-0000-4000-8000-00000000aaaa' AND user_id='b1000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT throws_ok($$SELECT public.business_vault_reserve_upload('b1000000-0000-4000-8000-00000000aaaa','Demoted','library','Evidence','store_only','owner_admin','x.pdf','application/pdf',100,NULL)$$,'42501','VAULT_UNAVAILABLE','demotion between form and submit fails closed');

RESET ROLE;
UPDATE public.tenants SET status='suspended' WHERE id='b1000000-0000-4000-8000-00000000aaaa';
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT is(public.business_vault_access_status()->>'allowed','false','suspended tenant loses Vault entry even with active owner membership');
SELECT throws_ok($$SELECT public.business_vault_snapshot()$$,'42501','VAULT_UNAVAILABLE','suspended tenant cannot request Vault metadata');
RESET ROLE;
UPDATE public.tenants SET status='active' WHERE id='b1000000-0000-4000-8000-00000000aaaa';

INSERT INTO public.business_vault_records(id,tenant_id,title,section,record_type,handling_mode,visibility,lifecycle_state,
 truth_state,source_kind,source_state,interpretation_state,created_by) VALUES
 ('ba000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-00000000aaaa','Scoped duplicate','library','Evidence','store_only','owner_admin','draft','owner_entered','manual_upload','current','not_requested','b1000000-0000-4000-8000-000000000001'),
 ('ba000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-00000000aaaa','Cleanup race','library','Evidence','store_only','owner_admin','draft','owner_entered','manual_upload','current','not_requested','b1000000-0000-4000-8000-000000000001'),
 ('ba000000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-00000000aaaa','Workspace switch','library','Evidence','store_only','owner_admin','draft','owner_entered','manual_upload','current','not_requested','b1000000-0000-4000-8000-000000000001');
INSERT INTO public.business_vault_versions(id,tenant_id,record_id,storage_path,original_filename,declared_mime,declared_size,
 validation_state,access_scope,created_by) VALUES
 ('ca000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000003','a/scoped/object','scoped.pdf','application/pdf',100,'reserved','owner_admin','b1000000-0000-4000-8000-000000000001'),
 ('ca000000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000004','a/race/object','race.pdf','application/pdf',100,'validating','owner_admin','b1000000-0000-4000-8000-000000000001'),
 ('ca000000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000005','a/switch/object','switch.pdf','application/pdf',100,'reserved','owner_admin','b1000000-0000-4000-8000-000000000001');
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES
 ('business-vault-files','a/scoped/object','b1000000-0000-4000-8000-000000000001','{"size":100}'),
 ('business-vault-files','a/race/object','b1000000-0000-4000-8000-000000000001','{"size":100}'),
 ('business-vault-files','a/switch/object','b1000000-0000-4000-8000-000000000001','{"size":100}');
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($$SELECT public.business_vault_finalize_upload('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ca000000-0000-4000-8000-000000000004','application/pdf',100,repeat('a',64),'validation_unavailable','scope proof')$$,'same digest in owner-admin scope does not reveal owner-only source');
SELECT is((SELECT validation_state FROM public.business_vault_versions WHERE id='ca000000-0000-4000-8000-000000000004'),'validation_unavailable','scoped duplicate becomes its own current source');
SELECT throws_ok($$SELECT public.business_vault_finalize_upload('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ca000000-0000-4000-8000-000000000005','application/pdf',100,repeat('e',64),'validation_unavailable','race proof')$$,'42501','VAULT_UNAVAILABLE','cleanup-owned version cannot race to current');

RESET ROLE;
UPDATE public.profiles SET active_tenant_id='b2000000-0000-4000-8000-00000000bbbb' WHERE user_id='b1000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.business_vault_finalize_upload('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ca000000-0000-4000-8000-000000000006','application/pdf',100,repeat('f',64),'validation_unavailable','switch proof')$$,'42501','VAULT_UNAVAILABLE','workspace switch before finalization fails closed');
RESET ROLE;
SELECT is((SELECT validation_state FROM public.business_vault_versions WHERE id='ca000000-0000-4000-8000-000000000006'),'reserved','workspace-switched upload remains unfinalized');
SELECT is((SELECT current_version_id FROM public.business_vault_records WHERE id='ba000000-0000-4000-8000-000000000005'),NULL::uuid,'workspace-switched record never becomes current');
UPDATE public.profiles SET active_tenant_id='b1000000-0000-4000-8000-00000000aaaa' WHERE user_id='b1000000-0000-4000-8000-000000000001';

RESET ROLE;
INSERT INTO public.business_vault_versions(id,tenant_id,record_id,storage_path,original_filename,declared_mime,declared_size,
 validation_state,supersedes_version_id,created_by) VALUES
 ('ca000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000002','a/admin/v2/object','replacement.pdf','application/pdf',100,'reserved','ca000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001');
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($$SELECT public.business_vault_finalize_upload('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ca000000-0000-4000-8000-000000000003','application/octet-stream',0,NULL,'failed','fixture failure')$$,'failed replacement is recorded without replacing current evidence');
RESET ROLE;
SELECT is((SELECT current_version_id FROM public.business_vault_records WHERE id='ba000000-0000-4000-8000-000000000002'),'ca000000-0000-4000-8000-000000000002'::uuid,'failed replacement preserves current version');
SELECT is((SELECT lifecycle_state FROM public.business_vault_records WHERE id='ba000000-0000-4000-8000-000000000002'),'active','failed replacement preserves lifecycle');
SELECT is((SELECT truth_state FROM public.business_vault_records WHERE id='ba000000-0000-4000-8000-000000000002'),'owner_entered','failed replacement preserves truth state');
SELECT ok(has_function_privilege('service_role','public.business_vault_claim_stale_uploads(timestamptz,integer)','EXECUTE'),'service role can reconcile interrupted uploads');
SELECT ok(NOT has_function_privilege('authenticated','public.business_vault_claim_stale_uploads(timestamptz,integer)','EXECUTE'),'browser cannot claim orphan cleanup');
SELECT ok(NOT EXISTS(
 SELECT 1 FROM storage.buckets b CROSS JOIN LATERAL unnest(b.allowed_mime_types) mime
 WHERE b.id='business-vault-files' AND mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
),'DOCX is refused until robust OOXML validation exists');

SELECT * FROM finish();
ROLLBACK;
