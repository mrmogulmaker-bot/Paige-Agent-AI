-- Safe workspace readiness for Spine, Chat and Mind. Owner-approved n8n grounding
-- extension. No credentials, configuration URLs, provider payloads or action authority.
-- Version follows the preserved future-dated migration ledger.
CREATE OR REPLACE FUNCTION public.get_n8n_spine_readiness()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r jsonb; a jsonb; m jsonb;
BEGIN
 -- The existing resolver enforces signed-in active membership and resolves tenant.
 -- Its editable configuration is never returned across this projection boundary.
 r:=public.get_n8n_connection_readiness(); a:=r->'api'; m:=r->'mcp';
 RETURN jsonb_build_object('tenant_id',r->'tenant_id',
 'api',jsonb_build_object('state',a->'state','workflow_count',a->'workflow_count',
  'last_successful_check',a->'last_success_at','action_needed',CASE a->>'state'
   WHEN 'not_connected' THEN 'connect_api' WHEN 'api_health_failed' THEN 'reconnect_api'
   WHEN 'api_saved' THEN 'check_api' ELSE 'none' END),
 'mcp',jsonb_build_object('state',m->'state','oauth_readiness',m->'oauth_readiness',
  'approved_workflow_count',m->'approved_workflow_count','approved_tool_count',m->'approved_tool_count',
  'last_successful_check',m->'last_success_at','action_needed',m->'action_needed'));
END $$;
REVOKE ALL ON FUNCTION public.get_n8n_spine_readiness() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_n8n_spine_readiness() TO authenticated;
COMMENT ON FUNCTION public.get_n8n_spine_readiness() IS 'Caller-bound safe n8n API and MCP readiness, not execution authority.';
