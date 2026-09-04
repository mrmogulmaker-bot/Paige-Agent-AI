-- Synthetic fixtures only, rolled back. Run against isolated full-migration CI, never production.
BEGIN;
SELECT '1..1';
CREATE FUNCTION pg_temp.check_receipt(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'receipt contract failed: %', label; END IF; END $$;
SELECT pg_temp.check_receipt(has_table_privilege('service_role','public.email_send_log','SELECT'),'source read privilege');
SELECT pg_temp.check_receipt(has_table_privilege('service_role','public.email_send_log','INSERT'),'outcome insert privilege');
SELECT pg_temp.check_receipt(has_table_privilege('service_role','public.email_send_log','UPDATE'),'source lock privilege');
SELECT pg_temp.check_receipt(has_table_privilege('service_role','public.tenant_invite_tokens','SELECT'),'invitation read privilege');
SELECT pg_temp.check_receipt(has_table_privilege('service_role','public.tenant_invite_tokens','UPDATE'),'invitation lock privilege');
INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,account_number,features) VALUES
('fa900000-0000-0000-0000-000000000001','receipt-test-a','Receipt test A','active','standalone','RTA',9447001,'{}'),
('fa900000-0000-0000-0000-000000000002','receipt-test-b','Receipt test B','active','standalone','RTB',9447002,'{}');
INSERT INTO public.tenant_invite_tokens(id,tenant_id,token,kind,default_role,email,expires_at,uses) VALUES
('fa900000-0000-0000-0000-000000000011','fa900000-0000-0000-0000-000000000001','receipt-fixture-token','team','member','fixture@tests.invalid',now()+interval '7 days',0);
INSERT INTO public.email_send_log(message_id,template_name,recipient_email,status,tenant_id,metadata) VALUES
('receipt-origin','team_invite','fixture@tests.invalid','sent','fa900000-0000-0000-0000-000000000001',
 '{"via":"send-portal-invite","kind":"team","invite_id":"fa900000-0000-0000-0000-000000000011"}'),
('receipt-wrong-tenant','team_invite','fixture@tests.invalid','sent','fa900000-0000-0000-0000-000000000002',
 '{"via":"send-portal-invite","kind":"team","invite_id":"fa900000-0000-0000-0000-000000000011"}'),
('receipt-platform','platform_invite','platform@tests.invalid','sent',NULL,'{"via":"send-platform-invite"}'),
('receipt-template','fixture_template','template@tests.invalid','sent',NULL,'{"via":"mcp.send_btf_template_email"}');
CREATE TEMP TABLE receipt_history_before AS SELECT * FROM public.email_send_log;
INSERT INTO public.tenant_invite_tokens(id,tenant_id,token,kind,default_role,email,expires_at,uses) VALUES
('fa900000-0000-0000-0000-000000000012','fa900000-0000-0000-0000-000000000001','receipt-null-token','consumer','member',NULL,now()+interval '7 days',0),
('fa900000-0000-0000-0000-000000000013','fa900000-0000-0000-0000-000000000001','receipt-blank-token','consumer','member','  ',now()+interval '7 days',0),
('fa900000-0000-0000-0000-000000000014','fa900000-0000-0000-0000-000000000001','receipt-mismatch-token','consumer','member','different@tests.invalid',now()+interval '7 days',0);
INSERT INTO public.email_send_log(message_id,template_name,recipient_email,status,tenant_id,metadata)
SELECT 'receipt-portal-' || right(id::text,2),'portal_invite','chosen@tests.invalid','sent',tenant_id,
  jsonb_build_object('via','send-portal-invite','kind',kind,'invite_id',id)
FROM public.tenant_invite_tokens WHERE id IN ('fa900000-0000-0000-0000-000000000012','fa900000-0000-0000-0000-000000000013','fa900000-0000-0000-0000-000000000014');
-- Historic duplicate rows are deliberately preserved, not cleaned up.
INSERT INTO public.email_send_log(message_id,template_name,recipient_email,status,tenant_id,metadata)
SELECT message_id,template_name,recipient_email,'delivered',tenant_id,
 jsonb_build_object('via','handle-resend-webhook','svix_id','msg_historic','invite_id',metadata->>'invite_id')
FROM public.email_send_log CROSS JOIN generate_series(1,2) WHERE message_id='receipt-origin' AND status='sent';
-- Isolated proof only: expose a bounded category if the production-safe catch hides a schema incompatibility.
SAVEPOINT receipt_schema_probe;
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('public.process_resend_receipt(text)'::regprocedure) INTO definition;
  definition := replace(definition, 'EXCEPTION WHEN OTHERS THEN',
    'EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION ''receipt proof category: %'', CASE SQLSTATE WHEN ''42501'' THEN ''permission'' WHEN ''42703'' THEN ''column'' WHEN ''42702'' THEN ''ambiguous'' WHEN ''42883'' THEN ''operator_or_function'' WHEN ''23514'' THEN ''constraint'' ELSE ''other'' END;');
  EXECUTE definition;
END $$;
SET LOCAL ROLE service_role;
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_schema_probe','receipt-portal-12','delivered',NULL)='processed','source schema compatibility');
RESET ROLE;
ROLLBACK TO receipt_schema_probe;
SET LOCAL ROLE service_role;
DO $$ DECLARE result text; reason text; BEGIN
  result := public.ingest_resend_receipt('msg_portal_null','receipt-portal-12','delivered',NULL);
  SELECT p.reason INTO reason FROM public.resend_receipt_processing p WHERE receipt_id='msg_portal_null';
  PERFORM pg_temp.check_receipt(result='processed','nullable portal binding preserved: ' || result || '/' || coalesce(reason,'none'));
END $$;
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_portal_blank','receipt-portal-13','delivered',NULL)='processed','blank portal binding preserved');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_portal_wrong','receipt-portal-14','delivered',NULL)='unresolved','nonempty portal binding mismatch refused');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_historic','receipt-origin','delivered',NULL)='processed','historical identity reused');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_one','receipt-origin','delivered',NULL)='processed','valid Team outcome');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_one','receipt-origin','delivered',NULL)='duplicate','duplicate receipt');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_one','receipt-platform','delivered',NULL)='conflict','identity reuse wrong message');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_one','receipt-origin','bounced',NULL)='conflict','identity reuse changed status');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_sent','receipt-origin','sent',NULL)='processed','sent reuses source');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_open1','receipt-origin','opened',NULL)='processed','distinct open one');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_open2','receipt-origin','opened',NULL)='processed','distinct open two');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_cross','receipt-wrong-tenant','delivered',NULL)='unresolved','cross-tenant refuses');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_platform','receipt-platform','delivered',NULL)='processed','platform null tenant preserved');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_template','receipt-template','clicked',NULL)='processed','legacy template preserved');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_early','receipt-early','delivered',now()-interval '5 minutes')='pending','early receipt retained');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_unknown','receipt-unknown','bounced',NULL)='pending','unknown receipt not delivery failure');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('bad id','receipt-origin','delivered',NULL)='invalid','malformed id refuses');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_bad','receipt-origin','invented',NULL)='invalid','unknown status refuses');
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_bad','receipt-origin','delivered','infinity')='invalid','invalid timestamp refuses');
RESET ROLE;
SELECT pg_temp.check_receipt((SELECT count(*)=1 FROM public.email_send_log WHERE metadata->>'svix_id'='msg_one'),'one durable outcome');
SELECT pg_temp.check_receipt((SELECT count(*)=2 FROM public.email_send_log WHERE metadata->>'svix_id'='msg_historic'),'historical duplicates untouched and no new append');
SELECT pg_temp.check_receipt((SELECT count(*)=1 FROM public.email_send_log WHERE message_id='receipt-origin' AND status='sent'),'no duplicated sent outcome');
SELECT pg_temp.check_receipt((SELECT count(*)=2 FROM public.email_send_log WHERE message_id='receipt-origin' AND status='opened'),'different receipt ids retained');
SELECT pg_temp.check_receipt(NOT EXISTS(SELECT FROM public.email_send_log WHERE metadata->>'svix_id'='msg_cross'),'no cross-tenant outcome');
SELECT pg_temp.check_receipt((SELECT tenant_id IS NULL FROM public.email_send_log WHERE metadata->>'svix_id'='msg_platform'),'no fabricated platform tenant');
SELECT pg_temp.check_receipt((SELECT state='pending' AND attempts=1 FROM public.resend_receipt_processing WHERE receipt_id='msg_early'),'early journal is durable');
SELECT pg_temp.check_receipt(NOT EXISTS(SELECT FROM public.email_send_log WHERE message_id='receipt-early'),'early receipt invents nothing');
INSERT INTO public.email_send_log(message_id,template_name,recipient_email,status,tenant_id,metadata)
SELECT 'receipt-early',template_name,recipient_email,status,tenant_id,metadata FROM public.email_send_log WHERE message_id='receipt-origin' AND status='sent';
UPDATE public.resend_receipt_processing SET next_attempt_at=now() WHERE receipt_id='msg_early';
SET LOCAL ROLE service_role;
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_later_open','receipt-early','opened',now()-interval '1 minute')='processed','later event arrives before reconciliation');
SELECT public.reconcile_resend_receipts();
RESET ROLE;
SELECT pg_temp.check_receipt((SELECT state='processed' FROM public.resend_receipt_processing WHERE receipt_id='msg_early'),'early later resolved');
SELECT pg_temp.check_receipt((SELECT count(*)=1 FROM public.email_send_log WHERE metadata->>'svix_id'='msg_early'),'early exactly one outcome');
SELECT pg_temp.check_receipt((SELECT l.created_at=p.event_at FROM public.email_send_log l JOIN public.resend_receipt_processing p ON p.outcome_id=l.id WHERE p.receipt_id='msg_early'),'reconciliation preserves provider event time');
SELECT pg_temp.check_receipt((SELECT early.created_at < later.created_at FROM public.email_send_log early CROSS JOIN public.email_send_log later WHERE early.metadata->>'svix_id'='msg_early' AND later.metadata->>'svix_id'='msg_later_open'),'out-of-order arrival retains lifecycle order');
SELECT pg_temp.check_receipt((SELECT l.created_at=p.received_at FROM public.email_send_log l JOIN public.resend_receipt_processing p ON p.outcome_id=l.id WHERE p.receipt_id='msg_one'),'missing provider time uses receipt time');
UPDATE public.resend_receipt_processing SET expires_at=now()-interval '1 second',next_attempt_at=now() WHERE receipt_id='msg_unknown';
SET LOCAL ROLE service_role;
SELECT public.reconcile_resend_receipts();
RESET ROLE;
SELECT pg_temp.check_receipt((SELECT state='unresolved' AND reason='expired' FROM public.resend_receipt_processing WHERE receipt_id='msg_unknown'),'bounded expiry');
SELECT pg_temp.check_receipt(NOT EXISTS(SELECT FROM public.email_send_log WHERE message_id='receipt-unknown'),'expiry is not delivery failure');
SELECT pg_temp.check_receipt(NOT EXISTS(SELECT FROM receipt_history_before b LEFT JOIN public.email_send_log l ON l.id=b.id WHERE l IS DISTINCT FROM b),'historical rows unchanged');
SELECT pg_temp.check_receipt(NOT has_table_privilege('authenticated','public.resend_receipt_processing','SELECT'),'tenant cannot read journal');
SELECT pg_temp.check_receipt(NOT has_function_privilege('authenticated','public.ingest_resend_receipt(text,text,text,timestamptz)','EXECUTE'),'tenant cannot ingest');
SELECT pg_temp.check_receipt(NOT has_function_privilege('anon','public.reconcile_resend_receipts()','EXECUTE'),'anon cannot reconcile');
-- A failed outcome append rolls back only that subtransaction and leaves a retryable receipt.
CREATE FUNCTION pg_temp.force_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.metadata->>'svix_id'='msg_fail' THEN RAISE EXCEPTION 'private database error must stay caught'; END IF; RETURN NEW; END $$;
CREATE TRIGGER receipt_test_failure BEFORE INSERT ON public.email_send_log FOR EACH ROW EXECUTE FUNCTION pg_temp.force_receipt_failure();
SET LOCAL ROLE service_role;
SELECT pg_temp.check_receipt(public.ingest_resend_receipt('msg_fail','receipt-origin','delivered',NULL)='pending','append failure retained');
RESET ROLE;
SELECT pg_temp.check_receipt((SELECT reason='storage_retry' AND state='pending' FROM public.resend_receipt_processing WHERE receipt_id='msg_fail'),'safe retry category only');
SELECT pg_temp.check_receipt(NOT EXISTS(SELECT FROM public.email_send_log WHERE metadata->>'svix_id'='msg_fail'),'failed append creates no outcome');
DROP TRIGGER receipt_test_failure ON public.email_send_log;
UPDATE public.resend_receipt_processing SET next_attempt_at=now() WHERE receipt_id='msg_fail';
SET LOCAL ROLE service_role;
SELECT public.reconcile_resend_receipts();
RESET ROLE;
SELECT pg_temp.check_receipt((SELECT state='processed' FROM public.resend_receipt_processing WHERE receipt_id='msg_fail'),'append retry recovers');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.ingest_resend_receipt('msg_attack','receipt-origin','delivered',NULL); RAISE EXCEPTION 'tenant ingest allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.resend_receipt_processing; RAISE EXCEPTION 'tenant read allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Negative control: removing the completed-receipt guard makes the same duplicate oracle fail.
SAVEPOINT duplicate_control;
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('public.process_resend_receipt(text)'::regprocedure) INTO definition;
  definition := replace(definition, 'IF r.state = ''processed'' THEN RETURN ''duplicate''; END IF;', '');
  definition := replace(definition, 'ORDER BY l.created_at, l.id LIMIT 1;', 'AND false ORDER BY l.created_at, l.id LIMIT 1;');
  EXECUTE definition;
END $$;
UPDATE public.resend_receipt_processing SET next_attempt_at=now() WHERE receipt_id='msg_one';
SELECT public.ingest_resend_receipt('msg_one','receipt-origin','delivered',NULL);
SELECT pg_temp.check_receipt((SELECT count(*)>1 FROM public.email_send_log WHERE metadata->>'svix_id'='msg_one'),'negative duplicate oracle detects removed guard');
ROLLBACK TO duplicate_control;
-- Negative control: a no-persistence early acknowledgement must fail the same durable-row oracle.
SAVEPOINT early_control;
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('public.ingest_resend_receipt(text,text,text,timestamptz)'::regprocedure) INTO definition;
  definition := replace(definition, 'INSERT INTO public.resend_receipt_processing', 'RETURN ''pending''; INSERT INTO public.resend_receipt_processing');
  EXECUTE definition;
END $$;
SELECT public.ingest_resend_receipt('msg_early_control','no-origin','delivered',NULL);
SELECT pg_temp.check_receipt(NOT EXISTS(SELECT FROM public.resend_receipt_processing WHERE receipt_id='msg_early_control'),'negative early oracle detects discarded receipt');
ROLLBACK TO early_control;
SELECT 'ok 1 - receipt reliability, isolation, preservation and negative controls';
ROLLBACK;
