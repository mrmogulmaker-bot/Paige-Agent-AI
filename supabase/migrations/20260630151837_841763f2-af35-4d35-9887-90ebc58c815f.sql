-- Fix: SUPA_function_search_path_mutable
-- Lock search_path on queue helper functions used by email processing.
ALTER FUNCTION public.delete_email(text, bigint)
  SET search_path = public, pgmq;

ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)
  SET search_path = public, pgmq;

ALTER FUNCTION public.read_email_batch(text, integer, integer)
  SET search_path = public, pgmq;

-- Fix: analytics_events_authenticated_write_blocked_anon_insert
-- The backend tracking function writes with service-role privileges after scrubbing payloads.
-- Keep direct anonymous table access blocked, but remove the authenticated ALL restrictive
-- policy that created an INSERT conflict for signed-in non-admin users.
DROP POLICY IF EXISTS "Block client writes to analytics_events" ON public.analytics_events;

DROP POLICY IF EXISTS "Block client read/update/delete analytics_events" ON public.analytics_events;
CREATE POLICY "Block client read/update/delete analytics_events"
  ON public.analytics_events
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Fix: paige_workflow_registry_n8n_webhook_url_exposed
-- Remove broad table-level browser grants, then grant only safe registry metadata columns.
-- Service role keeps full access for edge functions that actually trigger workflows.
REVOKE ALL ON public.paige_workflow_registry FROM anon, authenticated;
GRANT SELECT (
  id,
  key,
  label,
  description,
  category,
  provider,
  parameters_schema,
  requires_approval,
  is_active,
  created_at,
  updated_at,
  needs_n8n_link,
  sort_order,
  allowed_roles,
  tenant_id
) ON public.paige_workflow_registry TO authenticated;
GRANT ALL ON public.paige_workflow_registry TO service_role;

DROP POLICY IF EXISTS "Workflow registry read scoped" ON public.paige_workflow_registry;
DROP POLICY IF EXISTS "Workflow registry read scoped (no url)" ON public.paige_workflow_registry;
CREATE POLICY "Workflow registry read scoped safe metadata"
  ON public.paige_workflow_registry
  FOR SELECT
  TO authenticated
  USING (
    (
      public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
      OR (allowed_roles && public.current_user_roles())
    )
    AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
  );