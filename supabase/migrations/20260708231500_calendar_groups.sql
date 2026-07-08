-- Calendar groups (GHL-style): organize many calendars under a named group
-- (a team, a service line, a campaign family). A calendar belongs to at most
-- one group (nullable FK); ungrouped calendars stand alone.
CREATE TABLE IF NOT EXISTS public.calendar_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES public.tenants(id) ON DELETE CASCADE,        -- null = operator/platform-owned
  created_by  uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_groups_tenant_idx ON public.calendar_groups (tenant_id);

ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.calendar_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS calendars_group_idx ON public.calendars (group_id);

ALTER TABLE public.calendar_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manage calendar groups" ON public.calendar_groups;
CREATE POLICY "manage calendar groups" ON public.calendar_groups
  FOR ALL TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_platform_admin()
    OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id))
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id))
    OR (created_by = auth.uid() AND tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_groups TO authenticated;