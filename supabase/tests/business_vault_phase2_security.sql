-- Executable actor/RLS proof for the Business Vault Phase 2 security boundary.
-- Synthetic fixtures only; the entire test is rolled back.
BEGIN;
SELECT plan(71);

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

INSERT INTO public.business_vault_inspection_configuration(id,adapter_key,enabled,pdf_ocr,image_ocr,
 secret_inspection,financial_sensitive_inspection,minimum_confidence)
VALUES('vault','test-inspector',true,true,true,true,true,.900);

INSERT INTO public.business_vault_quarantine_uploads(id,tenant_id,requested_by,title,section,record_type,handling_mode,
 visibility,storage_path,original_filename,declared_mime,declared_size,actual_mime,actual_size,sha256,adapter_key,
 inspection_state,ocr_completed,inspection_confidence,secret_pattern_detected,financial_sensitive_detected,
 encrypted_detected,inspected_at) VALUES
 ('aa000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Owner source','contracts','Agreement','approved_context','owner_only','a/owner/v1/object','owner.pdf','application/pdf',100,'application/pdf',100,repeat('a',64),'test-inspector','promoted',true,.99,false,false,false,now()),
 ('aa000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Admin source','contracts','Agreement','approved_context','owner_admin','a/admin/v1/object','admin.pdf','application/pdf',100,'application/pdf',100,repeat('b',64),'test-inspector','promoted',true,.99,false,false,false,now()),
 ('ab000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000bbbb','b2000000-0000-4000-8000-000000000001','Other tenant','library','Evidence','store_only','owner_admin','b/record/v1/object','other.pdf','application/pdf',100,'application/pdf',100,repeat('c',64),'test-inspector','promoted',true,.99,false,false,false,now());

INSERT INTO public.business_vault_records(id,tenant_id,title,section,record_type,handling_mode,visibility,lifecycle_state,
 truth_state,source_kind,source_state,interpretation_state,created_by) VALUES
 ('ba000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','Owner source','contracts','Agreement','approved_context','owner_only','active','owner_entered','manual_upload','current','unavailable','b1000000-0000-4000-8000-000000000001'),
 ('ba000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-00000000aaaa','Admin source','contracts','Agreement','approved_context','owner_admin','active','owner_entered','manual_upload','current','unavailable','b1000000-0000-4000-8000-000000000001'),
 ('bb000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000bbbb','Other tenant','library','Evidence','store_only','owner_admin','active','owner_entered','manual_upload','current','not_requested','b2000000-0000-4000-8000-000000000001');
INSERT INTO public.business_vault_versions(id,tenant_id,record_id,storage_path,original_filename,declared_mime,actual_mime,
 declared_size,actual_size,sha256,validation_state,access_scope,created_by,finalized_at,inspection_id,inspected_at,inspection_adapter) VALUES
 ('ca000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000001','a/owner/v1/object','owner.pdf','application/pdf','application/pdf',100,100,repeat('a',64),'ready','owner_only','b1000000-0000-4000-8000-000000000001',now(),'aa000000-0000-4000-8000-000000000001',now(),'test-inspector'),
 ('ca000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-00000000aaaa','ba000000-0000-4000-8000-000000000002','a/admin/v1/object','admin.pdf','application/pdf','application/pdf',100,100,repeat('b',64),'ready','owner_admin','b1000000-0000-4000-8000-000000000001',now(),'aa000000-0000-4000-8000-000000000002',now(),'test-inspector'),
 ('cb000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000bbbb','bb000000-0000-4000-8000-000000000001','b/record/v1/object','other.pdf','application/pdf','application/pdf',100,100,repeat('c',64),'ready','owner_admin','b2000000-0000-4000-8000-000000000001',now(),'ab000000-0000-4000-8000-000000000001',now(),'test-inspector');
UPDATE public.business_vault_records SET current_version_id=CASE id
 WHEN 'ba000000-0000-4000-8000-000000000001' THEN 'ca000000-0000-4000-8000-000000000001'::uuid
 WHEN 'ba000000-0000-4000-8000-000000000002' THEN 'ca000000-0000-4000-8000-000000000002'::uuid
 ELSE 'cb000000-0000-4000-8000-000000000001'::uuid END;
UPDATE public.business_vault_quarantine_uploads SET promoted_record_id=CASE id
 WHEN 'aa000000-0000-4000-8000-000000000001' THEN 'ba000000-0000-4000-8000-000000000001'::uuid
 WHEN 'aa000000-0000-4000-8000-000000000002' THEN 'ba000000-0000-4000-8000-000000000002'::uuid
 ELSE 'bb000000-0000-4000-8000-000000000001'::uuid END,
 promoted_version_id=CASE id
 WHEN 'aa000000-0000-4000-8000-000000000001' THEN 'ca000000-0000-4000-8000-000000000001'::uuid
 WHEN 'aa000000-0000-4000-8000-000000000002' THEN 'ca000000-0000-4000-8000-000000000002'::uuid
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
SELECT throws_ok($$SELECT public.business_vault_reserve_quarantine_upload('b2000000-0000-4000-8000-00000000bbbb','test-inspector','Spoof','library','Evidence','store_only','owner_admin','x.pdf','application/pdf',100,NULL)$$,'42501','VAULT_UNAVAILABLE','client tenant spoof is refused');
SELECT throws_ok($$SELECT public.business_vault_reserve_quarantine_upload('b1000000-0000-4000-8000-00000000aaaa','test-inspector','Secret','library','Evidence','store_only','owner_only','x.pdf','application/pdf',100,NULL)$$,'22023','VAULT_UPLOAD_REFUSED','admin cannot create owner-only quarantine upload');
SELECT throws_ok($$SELECT public.business_vault_review_fact('b1000000-0000-4000-8000-00000000aaaa','fa000000-0000-4000-8000-000000000003','approved')$$,'42501','VAULT_UNAVAILABLE','admin cannot replace an owner-only canonical fact');
RESET ROLE;
SELECT is((SELECT state FROM public.business_vault_context_facts WHERE id='fa000000-0000-4000-8000-000000000002'),'approved','owner-only canonical fact remains approved');

SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SELECT is(public.business_vault_access_status()->>'allowed','false','ordinary member is denied without metadata');
SELECT throws_ok($$SELECT public.business_vault_snapshot()$$,'42501','VAULT_UNAVAILABLE','ordinary member cannot invoke snapshot');

SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($$SELECT public.business_vault_archive_record('b1000000-0000-4000-8000-00000000aaaa','bb000000-0000-4000-8000-000000000001')$$,'42501','VAULT_UNAVAILABLE','cross-tenant known record ID is refused');
SELECT throws_ok($$SELECT public.business_vault_download_version('b1000000-0000-4000-8000-00000000aaaa','cb000000-0000-4000-8000-000000000001')$$,'42501','VAULT_UNAVAILABLE','cross-tenant known version ID is refused');
SELECT ok(NOT(public.business_vault_get_context() @> '[{"fact_key":"policy_status"}]'::jsonb),'proposed fact is absent from Paige context before approval');
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
SELECT throws_ok($$SELECT public.business_vault_reserve_quarantine_upload('b1000000-0000-4000-8000-00000000aaaa','test-inspector','Demoted','library','Evidence','store_only','owner_admin','x.pdf','application/pdf',100,NULL)$$,'42501','VAULT_UNAVAILABLE','demotion between form and submit fails closed');

RESET ROLE;
UPDATE public.tenants SET status='suspended' WHERE id='b1000000-0000-4000-8000-00000000aaaa';
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT is(public.business_vault_access_status()->>'allowed','false','suspended tenant loses Vault entry even with active owner membership');
SELECT throws_ok($$SELECT public.business_vault_snapshot()$$,'42501','VAULT_UNAVAILABLE','suspended tenant cannot request Vault metadata');
RESET ROLE;
UPDATE public.tenants SET status='active' WHERE id='b1000000-0000-4000-8000-00000000aaaa';

SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($$SELECT count(*) FROM public.business_vault_quarantine_uploads$$,'42501','permission denied for table business_vault_quarantine_uploads','browser cannot enumerate quarantine metadata');
SELECT ok(NOT has_function_privilege('authenticated','public.business_vault_claim_quarantine_inspections(integer)','EXECUTE'),'browser cannot claim inspection work');
RESET ROLE;
UPDATE public.business_vault_inspection_configuration SET enabled=false WHERE id='vault';
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT is(public.business_vault_inspection_capability()->>'available','false','binary intake is unavailable without an enabled inspector');
SELECT throws_ok($$SELECT public.business_vault_reserve_quarantine_upload('b1000000-0000-4000-8000-00000000aaaa','test-inspector','Unavailable','library','Evidence','store_only','owner_admin','x.pdf','application/pdf',100,NULL)$$,'22023','VAULT_UPLOAD_REFUSED','unconfigured inspector cannot reserve quarantine');
RESET ROLE;
UPDATE public.business_vault_inspection_configuration SET enabled=true WHERE id='vault';
INSERT INTO public.business_vault_quarantine_uploads(id,tenant_id,requested_by,title,section,record_type,handling_mode,
 visibility,replace_record_id,storage_path,original_filename,declared_mime,declared_size,actual_mime,actual_size,sha256,
 adapter_key,inspection_state) VALUES
 ('ad000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Secret','library','Evidence','store_only','owner_admin',NULL,'a/q/secret','secret.pdf','application/pdf',100,'application/pdf',100,repeat('d',64),'test-inspector','stored'),
 ('ad000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Encrypted','library','Evidence','store_only','owner_admin',NULL,'a/q/encrypted','encrypted.pdf','application/pdf',100,'application/pdf',100,repeat('e',64),'test-inspector','stored'),
 ('ad000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','OCR fail','library','Evidence','store_only','owner_admin','ba000000-0000-4000-8000-000000000002','a/q/ocr','ocr.pdf','application/pdf',100,'application/pdf',100,repeat('f',64),'test-inspector','stored'),
 ('ad000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Timeout','library','Evidence','store_only','owner_admin',NULL,'a/q/timeout','timeout.png','image/png',100,'image/png',100,repeat('1',64),'test-inspector','stored'),
 ('ad000000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Low confidence','library','Evidence','store_only','owner_admin',NULL,'a/q/low','low.jpg','image/jpeg',100,'image/jpeg',100,repeat('2',64),'test-inspector','stored'),
 ('ad000000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Replacement','contracts','Agreement','approved_context','owner_admin','ba000000-0000-4000-8000-000000000002','a/q/pass','replacement.pdf','application/pdf',100,'application/pdf',100,repeat('3',64),'test-inspector','stored'),
 ('ad000000-0000-4000-8000-000000000007','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Unscannable','library','Evidence','store_only','owner_admin',NULL,'a/q/unscannable','unscannable.pdf','application/pdf',100,'application/pdf',100,repeat('4',64),'test-inspector','stored'),
 ('ad000000-0000-4000-8000-000000000008','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Financial sensitive','library','Evidence','store_only','owner_admin',NULL,'a/q/financial','financial.png','image/png',100,'image/png',100,repeat('5',64),'test-inspector','stored'),
 ('ad000000-0000-4000-8000-000000000009','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Image pass','library','Evidence','store_only','owner_admin',NULL,'a/q/image-pass','image.png','image/png',100,'image/png',100,repeat('6',64),'test-inspector','stored');
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) SELECT 'business-vault-quarantine',storage_path,requested_by,'{"size":100}' FROM public.business_vault_quarantine_uploads WHERE id::text LIKE 'ad000000%';
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($$SELECT * FROM public.business_vault_claim_quarantine_inspections(20)$$,'service claims stored quarantine work with a lease');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.business_vault_quarantine_uploads WHERE id::text LIKE 'ad000000%' AND inspection_state='inspecting'),9,'all synthetic inspection items are claimed');
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000005','passed',true,.50,false,false,false)$$,'22023','VAULT_INSPECTION_REFUSED','low-confidence content cannot pass');
SELECT throws_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000006','passed',true,NULL,false,false,false)$$,'42501','VAULT_UNAVAILABLE','NULL inspection confidence cannot pass');
SELECT throws_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000001','passed',true,.99,true,false,false)$$,'22023','VAULT_INSPECTION_REFUSED','secret detection cannot pass');
SELECT lives_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000001','secret_pattern_detected',true,.99,true,false,false)$$,'secret detection is rejected with a safe code');
RESET ROLE;
SELECT is((SELECT inspection_state FROM public.business_vault_quarantine_uploads WHERE id='ad000000-0000-4000-8000-000000000001'),'cleanup_pending','secret-bearing bytes remain outside normal lifecycle');
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000002','encrypted',false,0,false,false,true)$$,'encrypted PDF is rejected');
RESET ROLE;
SELECT is((SELECT safe_reason_code FROM public.business_vault_quarantine_uploads WHERE id='ad000000-0000-4000-8000-000000000002'),'encrypted','encrypted failure stores only a safe code');
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000003','ocr_failed',false,0,false,false,false)$$,'OCR failure is rejected');
SELECT lives_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000004','timed_out',false,0,false,false,false)$$,'inspection timeout is rejected');
SELECT lives_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000005','low_confidence',true,.50,false,false,false)$$,'low-confidence inspection is rejected');
SELECT lives_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000006','passed',true,.99,false,false,false)$$,'complete OCR and sensitive inspection may pass');
SELECT lives_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000007','unscannable',false,0,false,false,false)$$,'unscannable source is rejected');
SELECT lives_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000008','financial_sensitive_detected',true,.99,false,true,false)$$,'financial-sensitive image is rejected');
RESET ROLE;
UPDATE public.business_vault_inspection_configuration SET secret_inspection=false WHERE id='vault';
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000009','passed',true,.99,false,false,false)$$,'42501','VAULT_UNAVAILABLE','revoked sensitive-inspection capability stops in-flight work');
RESET ROLE;
UPDATE public.business_vault_inspection_configuration SET secret_inspection=true WHERE id='vault';
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($$SELECT public.business_vault_record_inspection_result('ad000000-0000-4000-8000-000000000009','passed',true,.99,false,false,false)$$,'image OCR and sensitive inspection may pass after capability is restored');
RESET ROLE;
SELECT is((SELECT inspection_state FROM public.business_vault_quarantine_uploads WHERE id='ad000000-0000-4000-8000-000000000006'),'passed','passed bytes remain quarantined before promotion');
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT ok(NOT has_function_privilege('service_role','public.business_vault_claim_quarantine_promotions(integer)','EXECUTE'),'promotion claim is disabled without an approved inspection worker');
SELECT ok(NOT has_function_privilege('service_role','public.business_vault_promote_quarantine_upload(uuid,uuid,uuid,text,text,bigint)','EXECUTE'),'normal-lifecycle promotion is disabled without an approved inspection worker');
RESET ROLE;
SELECT is((SELECT current_version_id FROM public.business_vault_records WHERE id='ba000000-0000-4000-8000-000000000002'),'ca000000-0000-4000-8000-000000000002'::uuid,'quarantined replacement cannot alter the valid current version');
SELECT is((SELECT state FROM public.business_vault_context_facts WHERE id='fa000000-0000-4000-8000-000000000003'),'proposed','quarantine alone does not mutate an existing proposed fact');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id='business-vault-files' AND name LIKE 'a/q/%'),0,'no quarantined bytes are copied into normal Vault storage');

INSERT INTO public.business_vault_quarantine_uploads(id,tenant_id,requested_by,title,section,record_type,handling_mode,
 visibility,storage_path,original_filename,declared_mime,declared_size,adapter_key,inspection_state) VALUES
 ('ae000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Null digest','library','Evidence','store_only','owner_admin','a/q/null-digest','null-digest.pdf','application/pdf',100,'test-inspector','reserved'),
 ('ae000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Null mime','library','Evidence','store_only','owner_admin','a/q/null-mime','null-mime.pdf','application/pdf',100,'test-inspector','reserved'),
 ('ae000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Null size','library','Evidence','store_only','owner_admin','a/q/null-size','null-size.pdf','application/pdf',100,'test-inspector','reserved');
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) SELECT 'business-vault-quarantine',storage_path,requested_by,'{"size":100}'
 FROM public.business_vault_quarantine_uploads WHERE id::text LIKE 'ae000000%';
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.business_vault_mark_quarantine_stored('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ae000000-0000-4000-8000-000000000001','application/pdf',100,NULL)$$,'42501','VAULT_UNAVAILABLE','NULL digest cannot confirm quarantined bytes');
SELECT throws_ok($$SELECT public.business_vault_mark_quarantine_stored('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ae000000-0000-4000-8000-000000000002',NULL,100,repeat('7',64))$$,'42501','VAULT_UNAVAILABLE','NULL MIME cannot confirm quarantined bytes');
SELECT throws_ok($$SELECT public.business_vault_mark_quarantine_stored('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ae000000-0000-4000-8000-000000000003','application/pdf',NULL,repeat('8',64))$$,'42501','VAULT_UNAVAILABLE','NULL size cannot confirm quarantined bytes');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.business_vault_quarantine_uploads WHERE id::text LIKE 'ae000000%' AND inspection_state='reserved'),3,'invalid confirmation evidence leaves every upload quarantined');

SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT throws_ok($$SELECT public.business_vault_reserve_quarantine_upload('b1000000-0000-4000-8000-00000000aaaa','test-inspector','Mismatched replacement','contracts','Agreement','approved_context','owner_only','mismatch.pdf','application/pdf',100,'ba000000-0000-4000-8000-000000000002')$$,'42501','VAULT_UNAVAILABLE','replacement visibility is resolved from and must match the existing record');
RESET ROLE;

INSERT INTO public.business_vault_quarantine_uploads(id,tenant_id,requested_by,title,section,record_type,handling_mode,
 visibility,storage_path,original_filename,declared_mime,declared_size,adapter_key,inspection_state) VALUES
 ('ae000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000001','Workspace changed','library','Evidence','store_only','owner_admin','a/q/workspace','workspace.pdf','application/pdf',100,'test-inspector','reserved'),
 ('ae000000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-00000000aaaa','b1000000-0000-4000-8000-000000000002','Role changed','library','Evidence','store_only','owner_admin','a/q/role','role.pdf','application/pdf',100,'test-inspector','reserved');
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) SELECT 'business-vault-quarantine',storage_path,requested_by,'{"size":100}'
 FROM public.business_vault_quarantine_uploads WHERE id IN('ae000000-0000-4000-8000-000000000004','ae000000-0000-4000-8000-000000000005');
UPDATE public.profiles SET active_tenant_id='b2000000-0000-4000-8000-00000000bbbb' WHERE user_id='b1000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT throws_ok($$SELECT public.business_vault_mark_quarantine_stored('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-00000000aaaa','ae000000-0000-4000-8000-000000000004','application/pdf',100,repeat('9',64))$$,'42501','VAULT_UNAVAILABLE','workspace switch before upload confirmation fails closed');
SELECT throws_ok($$SELECT public.business_vault_mark_quarantine_stored('b1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-00000000aaaa','ae000000-0000-4000-8000-000000000005','application/pdf',100,repeat('0',64))$$,'42501','VAULT_UNAVAILABLE','role demotion before upload confirmation fails closed');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.business_vault_quarantine_uploads WHERE id IN('ae000000-0000-4000-8000-000000000004','ae000000-0000-4000-8000-000000000005') AND inspection_state='reserved'),2,'workspace and role changes leave bytes quarantined');
UPDATE public.profiles SET active_tenant_id='b1000000-0000-4000-8000-00000000aaaa' WHERE user_id='b1000000-0000-4000-8000-000000000001';

UPDATE public.business_vault_quarantine_uploads SET created_at=now()-interval '2 days',expires_at=now()-interval '1 second'
 WHERE id='ad000000-0000-4000-8000-000000000006';
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($$SELECT * FROM public.business_vault_claim_quarantine_cleanup(50)$$,'rejected and promoted quarantine bytes enter bounded cleanup');
SELECT lives_ok($$SELECT public.business_vault_defer_quarantine_cleanup('ad000000-0000-4000-8000-000000000001')$$,'failed physical deletion returns quarantine cleanup to a retryable state');
SELECT lives_ok($$SELECT * FROM public.business_vault_claim_quarantine_cleanup(50)$$,'deferred quarantine cleanup can be claimed again');
SELECT throws_ok($$SELECT public.business_vault_complete_quarantine_cleanup('ad000000-0000-4000-8000-000000000001')$$,'42501','VAULT_UNAVAILABLE','cleanup cannot claim deletion while quarantined bytes still exist');
RESET ROLE;
DELETE FROM storage.objects WHERE bucket_id='business-vault-quarantine' AND name='a/q/secret';
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT lives_ok($$SELECT public.business_vault_complete_quarantine_cleanup('ad000000-0000-4000-8000-000000000001')$$,'cleanup completes only after physical removal succeeds');
RESET ROLE;
SELECT is((SELECT inspection_state FROM public.business_vault_quarantine_uploads WHERE id='ad000000-0000-4000-8000-000000000001'),'deleted','retryable cleanup reaches a terminal deleted state');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id='business-vault-quarantine' AND name='a/q/secret'),0,'deleted quarantine bytes are physically absent');
SELECT ok(has_function_privilege('service_role','public.business_vault_claim_quarantine_cleanup(integer)','EXECUTE'),'service role owns quarantine cleanup');
SELECT ok(NOT EXISTS(
 SELECT 1 FROM storage.buckets b CROSS JOIN LATERAL unnest(b.allowed_mime_types) mime
 WHERE b.id='business-vault-files' AND mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
),'DOCX is refused until robust OOXML validation exists');

SELECT * FROM finish();
ROLLBACK;
