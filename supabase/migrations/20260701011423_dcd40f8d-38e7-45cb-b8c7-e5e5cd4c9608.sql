
-- growth_pages: hide blocks_json from anon
REVOKE SELECT ON public.growth_pages FROM anon;
GRANT SELECT (id, tenant_id, slug, title, status, template_key, theme_json, seo_json, og_image_url, published_at, created_by, created_at, updated_at)
  ON public.growth_pages TO anon;

-- paige_workflow_registry: hide n8n_webhook_url from generic authenticated readers.
-- Admins read the full row through the "Workflow registry admin read" policy,
-- which requires table-level SELECT — so we grant per-column SELECT to authenticated
-- (excluding n8n_webhook_url) and add an admin-only column grant back for the webhook.
REVOKE SELECT ON public.paige_workflow_registry FROM authenticated;
GRANT SELECT (id, key, label, description, category, n8n_workflow_id, parameters_schema, requires_approval, is_active, created_at, updated_at, connection_id, provider, langgraph_graph_id, direct_function_name, needs_n8n_link, sort_order, allowed_roles, tenant_id)
  ON public.paige_workflow_registry TO authenticated;

-- Provide admin-only access to n8n_webhook_url via a SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION public.admin_get_workflow_webhook_url(_workflow_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n8n_webhook_url
  FROM public.paige_workflow_registry
  WHERE id = _workflow_id
    AND has_role(auth.uid(), 'admin'::app_role)
    AND (tenant_id IS NULL OR tenant_id = current_user_tenant_id());
$$;

REVOKE ALL ON FUNCTION public.admin_get_workflow_webhook_url(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_workflow_webhook_url(uuid) TO authenticated, service_role;
