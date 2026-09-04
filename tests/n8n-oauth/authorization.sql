\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION public.n8n_proof_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'PROOF_FAILED: %',label; END IF; END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT n8n_proof_assert(get_n8n_connection_readiness()->'api'->>'state'='api_connected_zero','api-only-zero');
SELECT n8n_proof_assert(get_n8n_connection_readiness()->'mcp'->>'state'='mcp_not_configured','mcp-separate');
DO $$ BEGIN PERFORM n8n_oauth_service('begin','{}'); RAISE EXCEPTION 'browser reached secret writer'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN PERFORM * FROM tenant_n8n_oauth_attempts; RAISE EXCEPTION 'browser read secret table'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT n8n_proof_assert((get_n8n_connection_readiness()->>'can_manage')::boolean=false,'non-owner-cannot-manage');
RESET ROLE;
UPDATE tenant_n8n_connections SET status='error',last_sync_at=now()+interval '1 minute' WHERE tenant_id='10000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT n8n_proof_assert(get_n8n_connection_readiness()->'api'->>'state'='api_health_failed','failed-is-not-zero');
SELECT n8n_proof_assert(get_n8n_connection_readiness()->'api'->>'workflow_count' IS NULL,'failed-count-unknown');
SELECT n8n_proof_assert(get_n8n_connection_readiness()->'api'->>'last_success_at' IS NOT NULL,'last-success-preserved');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{"role":"service_role"}',false);
SET ROLE service_role;
DO $$
DECLARE ctx jsonb:='{"tenant_id":"10000000-0000-0000-0000-000000000001","actor_id":"00000000-0000-0000-0000-000000000001","session_id":"20000000-0000-0000-0000-000000000001"}';
 a jsonb; l jsonb; b jsonb; d jsonb; bad jsonb;
 payload jsonb:='{"resource":"https://fixture.example/mcp-server/http","redirect_uri":"https://fixture.supabase.co/functions/v1/tenant-n8n-oauth","authorization_url":"https://fixture.example/authorize","server":{"issuer":"https://fixture.example"},"client":{"clientId":"fixture-client"}}';
 tokens jsonb:='{"accessToken":"fixture-access","refreshToken":"fixture-refresh","expiresAt":"2099-01-01T00:00:00Z","scopes":["workflow:read","workflow:write"]}';
BEGIN
 BEGIN PERFORM n8n_oauth_service('begin',ctx||'{"actor_id":"00000000-0000-0000-0000-000000000002"}'); RAISE EXCEPTION 'non-owner passed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM n8n_oauth_service('begin',ctx||jsonb_build_object('state_hash','state-one','launch_hash','launch-one','launch_proof_hash','proof-one','payload',payload));
 BEGIN PERFORM n8n_oauth_service('launch','{"launch_hash":"launch-one","launch_proof_hash":"wrong","binding_hash":"cookie"}'); RAISE EXCEPTION 'wrong launch proof passed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM n8n_oauth_service('launch','{"launch_hash":"launch-one","launch_proof_hash":"proof-one","binding_hash":"cookie"}');
 BEGIN PERFORM n8n_oauth_service('launch','{"launch_hash":"launch-one","launch_proof_hash":"proof-one","binding_hash":"cookie"}'); RAISE EXCEPTION 'launch replay passed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM n8n_oauth_service('consume','{"state_hash":"state-one","binding_hash":"wrong"}'); RAISE EXCEPTION 'wrong cookie passed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 a:=n8n_oauth_service('consume','{"state_hash":"state-one","binding_hash":"cookie"}');
 BEGIN PERFORM n8n_oauth_service('consume','{"state_hash":"state-one","binding_hash":"cookie"}'); RAISE EXCEPTION 'callback replay passed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 FOR bad IN SELECT value FROM jsonb_array_elements('[null,["workflow:read"],["workflow:read","workflow:write","workflow:execute"],["workflow:read","workflow:read"]]'::jsonb) LOOP
  BEGIN
   PERFORM n8n_oauth_service('finish',jsonb_build_object('attempt_id',a->>'attempt_id','outcome','success','tokens',tokens||jsonb_build_object('scopes',bad)));
   RAISE EXCEPTION 'invalid scope persisted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'N8N_SCOPE_REFUSED' THEN RAISE; END IF; END;
 END LOOP;
 PERFORM n8n_oauth_service('finish',jsonb_build_object('attempt_id',a->>'attempt_id','outcome','success','tokens',tokens||'{"scopes":["workflow:write","workflow:read"]}'::jsonb));
 l:=n8n_oauth_service('acquire',ctx);
 b:=ctx||jsonb_build_object('lease',l->>'lease','generation',l->>'generation');
 BEGIN PERFORM n8n_oauth_service('acquire',ctx); RAISE EXCEPTION 'second lease passed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'N8N_BUSY' THEN RAISE; END IF; END;
 PERFORM n8n_oauth_service('rotate',b||jsonb_build_object('tokens',tokens||'{"accessToken":"fixture-rotated"}'));
 d:=n8n_oauth_service('snapshot',b||'{"payload":{"pin":"pin-one","workflows":[{"id":"approved1","name":"Preview"}]}}');
 PERFORM n8n_oauth_service('approve',b||d||'{"pin":"pin-one","workflow_ids":["approved1"]}');
 PERFORM n8n_oauth_service('release',b);
 l:=n8n_oauth_service('acquire',ctx); b:=ctx||jsonb_build_object('lease',l->>'lease','generation',l->>'generation');
 PERFORM n8n_proof_assert(l->'approved_ids'='["approved1"]'::jsonb,'approved-id-only');
 PERFORM n8n_oauth_service('disconnect',ctx);
 BEGIN PERFORM n8n_oauth_service('rotate',b||jsonb_build_object('tokens',tokens)); RAISE EXCEPTION 'stale refresh resurrected disconnect'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'N8N_STALE_OPERATION' THEN RAISE; END IF; END;
 PERFORM n8n_oauth_service('begin',ctx||jsonb_build_object('state_hash','state-two','launch_hash','launch-two','launch_proof_hash','proof-two','payload',payload));
 PERFORM n8n_oauth_service('cancel',ctx);
 BEGIN PERFORM n8n_oauth_service('launch','{"launch_hash":"launch-two","launch_proof_hash":"proof-two","binding_hash":"cookie"}'); RAISE EXCEPTION 'cancelled flow launched'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Real session expiry, failed replacement, and switch-away/back commit fences.
DO $$
DECLARE ctx jsonb:='{"tenant_id":"10000000-0000-0000-0000-000000000001","actor_id":"00000000-0000-0000-0000-000000000001","session_id":"20000000-0000-0000-0000-000000000001"}'; a jsonb;
BEGIN
 BEGIN PERFORM n8n_oauth_service('begin',ctx||'{"session_id":"20000000-0000-0000-0000-000000000099"}'); RAISE EXCEPTION 'missing session accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM n8n_oauth_service('begin',ctx||'{"state_hash":"switch-state","launch_hash":"switch-launch","launch_proof_hash":"proof","payload":{}}');
 PERFORM n8n_oauth_service('launch','{"launch_hash":"switch-launch","launch_proof_hash":"proof","binding_hash":"cookie"}');
 a:=n8n_oauth_service('consume','{"state_hash":"switch-state","binding_hash":"cookie"}');
 UPDATE profiles SET active_tenant_id='10000000-0000-0000-0000-000000000002' WHERE user_id=(ctx->>'actor_id')::uuid;
 UPDATE profiles SET active_tenant_id='10000000-0000-0000-0000-000000000001' WHERE user_id=(ctx->>'actor_id')::uuid;
 BEGIN PERFORM n8n_oauth_service('finish',jsonb_build_object('attempt_id',a->>'attempt_id','outcome','success')); RAISE EXCEPTION 'switched back callback accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM n8n_oauth_service('begin',ctx||'{"state_hash":"session-state","launch_hash":"session-launch","launch_proof_hash":"proof","payload":{}}');
 PERFORM n8n_oauth_service('launch','{"launch_hash":"session-launch","launch_proof_hash":"proof","binding_hash":"cookie"}');
 a:=n8n_oauth_service('consume','{"state_hash":"session-state","binding_hash":"cookie"}');
 UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=(ctx->>'session_id')::uuid;
 BEGIN PERFORM n8n_oauth_service('finish',jsonb_build_object('attempt_id',a->>'attempt_id','outcome','success')); RAISE EXCEPTION 'expired session commit accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE auth.sessions SET not_after=NULL WHERE id=(ctx->>'session_id')::uuid;
 PERFORM n8n_oauth_service('cancel',ctx);
 PERFORM n8n_oauth_service('begin',ctx||'{"state_hash":"expiry-state","launch_hash":"expiry-launch","launch_proof_hash":"proof","payload":{}}');
 UPDATE tenant_n8n_oauth_attempts SET expires_at=clock_timestamp()-interval '1 second' WHERE state_hash='expiry-state';
 PERFORM n8n_proof_assert((n8n_oauth_service('launch','{"launch_hash":"expiry-launch","launch_proof_hash":"proof","binding_hash":"cookie"}')->>'expired')::boolean,'expired attempt refused');
END $$;
RESET ROLE;
UPDATE profiles SET active_tenant_id='10000000-0000-0000-0000-000000000002' WHERE user_id='00000000-0000-0000-0000-000000000001';
SET ROLE service_role;
DO $$ BEGIN PERFORM n8n_oauth_service('begin','{"tenant_id":"10000000-0000-0000-0000-000000000001","actor_id":"00000000-0000-0000-0000-000000000001","session_id":"20000000-0000-0000-0000-000000000001"}');RAISE EXCEPTION 'workspace switch accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
UPDATE profiles SET active_tenant_id='10000000-0000-0000-0000-000000000001' WHERE user_id='00000000-0000-0000-0000-000000000001';
UPDATE tenant_mcp_connections SET auth_kind='bearer',auth_token_ct=platform_encrypt('fixture-legacy'),status='connected',enabled=true WHERE provider='n8n';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT n8n_proof_assert(get_n8n_connection_readiness()->'mcp'->>'state'='oauth_needed','legacy bearer never OAuth connected');
SELECT n8n_proof_assert(get_n8n_connection_readiness()->'mcp'->>'oauth_readiness'='authorization_needed','legacy bearer no OAuth authorization');
RESET ROLE;
SELECT n8n_proof_assert(platform_decrypt(api_key_ct)='fixture-api-secret','API key preserved') FROM tenant_n8n_connections;
SELECT n8n_proof_assert(NOT EXISTS(SELECT 1 FROM tenant_n8n_oauth_attempts WHERE payload_ct IS NOT NULL),'finished/cancelled payload destroyed');
ROLLBACK;
\echo PASS: actual SQL role boundaries, API states, callback replay, launch proof, cancellation, refresh lease, disconnect invalidation, workspace switch and API preservation
