\set ON_ERROR_STOP on
BEGIN;
-- Upgrade this isolated fixture to the real API validation evidence contract.
ALTER TABLE tenant_n8n_connections ADD COLUMN IF NOT EXISTS label text, ADD COLUMN IF NOT EXISTS last_error text;
CREATE OR REPLACE FUNCTION public.is_tenant_admin_as(u uuid,t uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.is_tenant_owner(u,t) $$;
\ir ../../supabase/migrations/20261200000400_n8n_api_connection_validation.sql
\ir ../../supabase/migrations/20261201000100_n8n_spine_readiness.sql
\ir ../../supabase/migrations/20261201000100_n8n_spine_readiness.sql
CREATE FUNCTION public.n8n_spine_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'SPINE_PROOF_FAILED: %',label; END IF; END $$;
-- Synthetic sources include URL, key and label canaries that must not cross projection.
UPDATE tenant_n8n_connections SET base_url_ct=platform_encrypt('https://private-canary.example'),label='private-label-canary' WHERE tenant_id='10000000-0000-0000-0000-000000000001';
UPDATE tenant_n8n_connections SET api_health='connected',api_workflow_count=0,api_checked_at='2026-09-01T12:00:00Z',api_last_success_at='2026-09-01T12:00:00Z' WHERE tenant_id='10000000-0000-0000-0000-000000000001';
SET ROLE anon;
DO $$ BEGIN PERFORM get_n8n_spine_readiness(); RAISE EXCEPTION 'anonymous allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{}',false);
DO $$ BEGIN PERFORM get_n8n_spine_readiness(); RAISE EXCEPTION 'missing user allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE r jsonb:=get_n8n_spine_readiness(); BEGIN
 PERFORM n8n_spine_assert(r->'api'->>'state'='api_connected_zero','actual validated API zero');
 PERFORM n8n_spine_assert(r->'api'->>'workflow_count'='0','source zero preserved');
 PERFORM n8n_spine_assert((r->'api'->>'last_successful_check')::timestamptz='2026-09-01T12:00:00Z'::timestamptz,'source freshness');
 PERFORM n8n_spine_assert(r->'mcp'->>'state'='mcp_not_configured','API not MCP authority');
 PERFORM n8n_spine_assert(r->'api'->>'action_needed'='none','healthy no action');
 PERFORM n8n_spine_assert((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r) k)=ARRAY['api','mcp','tenant_id'],'top exact allowlist');
 PERFORM n8n_spine_assert((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r->'api') k)=ARRAY['action_needed','last_successful_check','state','workflow_count'],'API exact allowlist');
 PERFORM n8n_spine_assert((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r->'mcp') k)=ARRAY['action_needed','approved_tool_count','approved_workflow_count','last_successful_check','oauth_readiness','state'],'MCP exact allowlist');
 PERFORM n8n_spine_assert(r::text NOT LIKE '%canary%' AND r::text NOT LIKE '%fixture-api-secret%' AND r::text NOT LIKE '%https://%','no configuration or secrets');
 BEGIN PERFORM get_n8n_spine_readiness('10000000-0000-0000-0000-000000000002'::uuid); RAISE EXCEPTION 'tenant selector exists'; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
UPDATE tenant_n8n_connections SET api_health='needs_attention',api_failure_code='authentication_rejected',api_workflow_count=NULL WHERE tenant_id='10000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT n8n_spine_assert(get_n8n_spine_readiness()->'api'->>'state'='api_health_failed','failed saved API');
SELECT n8n_spine_assert(get_n8n_spine_readiness()->'api'->'workflow_count'='null'::jsonb,'unknown count stays null');
SELECT n8n_spine_assert(get_n8n_spine_readiness()->'api'->>'action_needed'='reconnect_api','safe failure action');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
UPDATE profiles SET active_tenant_id='10000000-0000-0000-0000-000000000002' WHERE user_id='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT n8n_spine_assert(get_n8n_spine_readiness()->>'tenant_id'='10000000-0000-0000-0000-000000000002','server-selected new tenant');
SELECT n8n_spine_assert(get_n8n_spine_readiness()->'api'->>'state'='not_connected','new workspace no old connection');
SELECT n8n_spine_assert(get_n8n_spine_readiness()->'api'->'workflow_count'='null'::jsonb,'new workspace no old count');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT n8n_spine_assert(get_n8n_spine_readiness()->>'tenant_id'='10000000-0000-0000-0000-000000000001','member reads only own active tenant');
RESET ROLE;
UPDATE tenant_members SET status='inactive' WHERE user_id='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $$ BEGIN PERFORM get_n8n_spine_readiness(); RAISE EXCEPTION 'inactive member allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
ROLLBACK;
\echo PASS: real API evidence, caller roles, workspace isolation, null/zero distinction, freshness, safe projection, replay
