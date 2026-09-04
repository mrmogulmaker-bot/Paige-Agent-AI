\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION public.n8n_rail_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'RAIL_PROOF_FAILED: %',label; END IF; END $$;
CREATE OR REPLACE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.paige_client_events(id uuid PRIMARY KEY,tenant_id uuid,event_kind text,surface text,actor_type text,audience text,visibility text,from_department text,to_department text,title text,summary text,occurred_at timestamptz);
INSERT INTO paige_client_events VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','client_existing','clients','owner_staff','owner','owner_internal',NULL,NULL,'Existing client event',NULL,clock_timestamp()),('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','client_other','clients','owner_staff','owner','owner_internal',NULL,NULL,'Other tenant client event',NULL,clock_timestamp());
CREATE SCHEMA realtime;
CREATE TABLE realtime.n8n_test_broadcasts(payload jsonb,event text,topic text,private boolean);
CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO realtime.n8n_test_broadcasts VALUES(payload,event,topic,private) $$;
\ir ../../supabase/migrations/20261043000000_the_rail_reader_checks_the_right_tenant.sql
-- Existing terminal record must never be backfilled as fresh activity.
INSERT INTO tenant_n8n_oauth_attempts(id,tenant_id,actor_id,session_id,state_hash,launch_hash,launch_proof_hash,status)
VALUES('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','history-state','history-launch','proof','failed');
\ir ../../supabase/migrations/20261201000200_n8n_workspace_rail_events.sql
\ir ../../supabase/migrations/20261201000200_n8n_workspace_rail_events.sql
SELECT n8n_rail_assert((SELECT count(*)=0 FROM paige_workspace_events),'no historical backfill');
INSERT INTO tenant_n8n_oauth_attempts(id,tenant_id,actor_id,session_id,state_hash,launch_hash,launch_proof_hash,payload_ct)
VALUES('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','canary-private-state','canary-private-launch','canary-proof',platform_encrypt('canary-provider-payload'));
UPDATE tenant_n8n_oauth_attempts SET status='failed',payload_ct=NULL WHERE id='40000000-0000-0000-0000-000000000002';
UPDATE tenant_n8n_oauth_attempts SET status='failed' WHERE id='40000000-0000-0000-0000-000000000002';
SELECT _record_n8n_workspace_event('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','oauth_attempt','40000000-0000-0000-0000-000000000002',0,'oauth_failed');
SELECT n8n_rail_assert((SELECT count(*)=1 FROM paige_workspace_events),'idempotent same source outcome');
SELECT n8n_rail_assert((SELECT count(*)=1 FROM realtime.n8n_test_broadcasts),'idempotent broadcast');
DO $$ BEGIN
 BEGIN
  UPDATE tenant_n8n_oauth_attempts SET status='cancelled' WHERE id='40000000-0000-0000-0000-000000000002';
  RAISE EXCEPTION 'fixture rollback';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 PERFORM n8n_rail_assert((SELECT count(*)=1 FROM paige_workspace_events),'event rolls back with source');
END $$;
INSERT INTO tenant_mcp_connections(tenant_id,provider,auth_kind,enabled,status,server_url_ct,auth_token_ct,updated_by)
VALUES('10000000-0000-0000-0000-000000000001','n8n','bearer',true,'connected',platform_encrypt('https://canary-secret.example/mcp-server/http'),platform_encrypt('canary-access-token'),'00000000-0000-0000-0000-000000000001');
SELECT n8n_rail_assert((SELECT count(*)=1 FROM paige_workspace_events),'legacy bearer not OAuth verified');
UPDATE tenant_mcp_connections SET auth_kind='oauth' WHERE provider='n8n';
UPDATE tenant_mcp_connections SET n8n_approved_workflow_ids=ARRAY['canary-workflow-id'] WHERE provider='n8n';
UPDATE tenant_mcp_connections SET n8n_approved_workflow_ids=ARRAY['canary-workflow-id'] WHERE provider='n8n';
UPDATE tenant_mcp_connections SET status='error',last_error='canary-provider-error' WHERE provider='n8n';
UPDATE tenant_mcp_connections SET status='connected',last_error=NULL WHERE provider='n8n';
SELECT n8n_rail_assert((SELECT count(*)=2 FROM paige_workspace_events WHERE outcome='mcp_verified'),'distinct health recovery event');
SELECT n8n_rail_assert((SELECT count(*)=1 FROM paige_workspace_events WHERE outcome='read_approvals_changed'),'approval idempotency');
UPDATE tenant_mcp_connections SET enabled=false,auth_token_ct=NULL,n8n_approved_workflow_ids='{}' WHERE provider='n8n';
SELECT n8n_rail_assert((SELECT count(*)=1 FROM paige_workspace_events WHERE outcome='mcp_disconnected'),'disconnect recorded');
SELECT n8n_rail_assert((SELECT bool_and(actor_id='00000000-0000-0000-0000-000000000001'::uuid) FROM paige_workspace_events),'source actor preserved internally');
SELECT n8n_rail_assert((SELECT count(*)=0 FROM information_schema.columns WHERE table_schema='public' AND table_name='paige_workspace_events' AND column_name IN ('contact_id','title','summary','payload','token','server_url','workflow_ids')),'no free text or secret storage columns');
SELECT n8n_rail_assert((SELECT bool_and(private AND topic='rail:tenant:10000000-0000-0000-0000-000000000001' AND event='rail_event') FROM realtime.n8n_test_broadcasts),'tenant-only private existing channel');
SELECT n8n_rail_assert((SELECT bool_and(payload::text NOT LIKE '%canary%' AND NOT payload ?| ARRAY['actor_id','source_id','source_revision','payload','contact_id','auth_token_ct','server_url','workflow_ids']) FROM realtime.n8n_test_broadcasts),'safe broadcast no internals');
SELECT n8n_rail_assert((SELECT bool_and((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload) k)=ARRAY['actor_type','audience','event_kind','from_department','id','occurred_at','summary','surface','tenant_id','title','to_department','visibility']) FROM realtime.n8n_test_broadcasts),'exact broadcast envelope');
SET ROLE anon;
DO $$ BEGIN PERFORM get_solo_rail_activity(); RAISE EXCEPTION 'anon reader'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE r jsonb; BEGIN
 BEGIN PERFORM * FROM paige_workspace_events; RAISE EXCEPTION 'browser table read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM _record_n8n_workspace_event(NULL,NULL,'oauth_attempt',NULL,0,'oauth_success'); RAISE EXCEPTION 'browser write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT jsonb_agg(to_jsonb(e)) INTO r FROM get_solo_rail_activity() e;
 PERFORM n8n_rail_assert(jsonb_array_length(r)=8,'existing client plus workspace events');
 PERFORM n8n_rail_assert(r::text LIKE '%Existing client event%' AND r::text NOT LIKE '%Other tenant%','client source preserved scoped');
 PERFORM n8n_rail_assert(r::text NOT LIKE '%canary%' AND r::text NOT LIKE '%actor_id%' AND r::text NOT LIKE '%source_id%' AND r::text NOT LIKE '%tenant_id%','safe eleven-column reader');
 PERFORM n8n_rail_assert((SELECT count(*)=1 FROM get_solo_rail_activity(1)),'limit preserved');
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN PERFORM get_solo_rail_activity(); RAISE EXCEPTION 'member read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
UPDATE profiles SET active_tenant_id='10000000-0000-0000-0000-000000000002' WHERE user_id='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT n8n_rail_assert((SELECT count(*)=1 AND bool_and(title='Other tenant client event') FROM get_solo_rail_activity()),'switch has no prior workspace events');
RESET ROLE;
-- Owning another tenant does not authorize this tenant as an ordinary member.
UPDATE tenant_members SET role='member' WHERE user_id='00000000-0000-0000-0000-000000000001' AND tenant_id='10000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $$ BEGIN PERFORM get_solo_rail_activity(); RAISE EXCEPTION 'other-tenant role bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
DO $$ DECLARE outcome text; attempt uuid; BEGIN
 FOREACH outcome IN ARRAY ARRAY['success','cancelled','refused','expired'] LOOP
  attempt:=gen_random_uuid();
  INSERT INTO tenant_n8n_oauth_attempts(id,tenant_id,actor_id,session_id,state_hash,launch_hash,launch_proof_hash)
  VALUES(attempt,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',attempt::text,attempt::text,'fixture');
  UPDATE tenant_n8n_oauth_attempts SET status=outcome WHERE id=attempt;
 END LOOP;
 PERFORM n8n_rail_assert((SELECT count(DISTINCT w.outcome)=5 FROM paige_workspace_events w WHERE source_kind='oauth_attempt'),'all terminal outcome enums');
 BEGIN PERFORM _record_n8n_workspace_event('10000000-0000-0000-0000-000000000001',NULL,'oauth_attempt',gen_random_uuid(),0,'canary-arbitrary-payload'); RAISE EXCEPTION 'arbitrary outcome accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN INSERT INTO paige_workspace_events(tenant_id,source_kind,source_id,source_revision,outcome) VALUES('10000000-0000-0000-0000-000000000001','oauth_attempt',gen_random_uuid(),0,'mcp_verified'); RAISE EXCEPTION 'wrong source outcome accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
\echo PASS: workspace Rail transactional provenance, idempotency, fixed safe fields, real role/tenant isolation and existing client history
