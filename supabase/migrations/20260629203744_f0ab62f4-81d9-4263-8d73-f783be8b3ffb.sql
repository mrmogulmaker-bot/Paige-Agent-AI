-- Doctrine §118: tenant-scope paige_workflow_registry.
-- NULL tenant_id = platform-default workflow (visible to all tenants).
-- NOT NULL tenant_id = tenant-specific (only that tenant can list/run it).

ALTER TABLE public.paige_workflow_registry
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pwr_tenant_id
  ON public.paige_workflow_registry (tenant_id);

-- Backfill: MMA-only providers (langgraph_bridge → MMA OS bridge, n8n → MMA n8n instance)
-- are scoped to the MMA tenant. direct_edge_function + cron_only stay platform-default (NULL).
UPDATE public.paige_workflow_registry
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mma' LIMIT 1)
WHERE tenant_id IS NULL
  AND provider IN ('langgraph_bridge', 'n8n');

-- Tighten the existing admin-write RLS so tenant-specific rows can only be managed
-- by an admin who belongs to that tenant (platform-default rows still admin-only).
DROP POLICY IF EXISTS "Admins manage workflow registry" ON public.paige_workflow_registry;
DROP POLICY IF EXISTS "Workflow registry admin write" ON public.paige_workflow_registry;

CREATE POLICY "Workflow registry admin read"
  ON public.paige_workflow_registry
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (
      tenant_id IS NULL
      OR tenant_id = public.current_user_tenant_id()
    )
  );

CREATE POLICY "Workflow registry admin write"
  ON public.paige_workflow_registry
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (
      tenant_id IS NULL
      OR tenant_id = public.current_user_tenant_id()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND (
      tenant_id IS NULL
      OR tenant_id = public.current_user_tenant_id()
    )
  );
