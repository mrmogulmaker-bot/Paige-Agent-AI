
-- Restrict column-level SELECT on n8n_webhook_url so only service_role / admins can read it.
REVOKE SELECT ON public.paige_workflow_registry FROM authenticated;

GRANT SELECT (
  id, key, label, description, category, n8n_workflow_id,
  parameters_schema, requires_approval, is_active,
  created_at, updated_at, connection_id, provider,
  langgraph_graph_id, direct_function_name, needs_n8n_link,
  sort_order, allowed_roles
) ON public.paige_workflow_registry TO authenticated;

-- service_role retains full access (already granted ALL via prior migrations); re-assert to be safe.
GRANT ALL ON public.paige_workflow_registry TO service_role;
