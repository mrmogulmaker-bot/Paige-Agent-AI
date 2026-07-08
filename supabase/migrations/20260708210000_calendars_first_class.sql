-- ---------------------------------------------------------------------------
-- Calendars as a first-class entity (campaign calendars + per-calendar brand).
-- ---------------------------------------------------------------------------
-- Today a booking page is keyed off the STAFF row (staff_calendar_settings) —
-- one page per person (the Calendly axis). This promotes "calendar" to its own
-- entity so a tenant can run MANY independently-branded calendars (one per
-- campaign/service/team) — the GoHighLevel model. Hosts attach via a join
-- (0 = event/class, 1 = personal, N = round-robin/collective, added later).
-- staff_calendar_settings stays as per-user sync + defaults.

CREATE TABLE IF NOT EXISTS public.calendars (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid REFERENCES public.tenants(id) ON DELETE CASCADE,  -- null = operator/platform-owned
  created_by         uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable (SET NULL on user delete)
  slug               text NOT NULL UNIQUE,
  type               text NOT NULL DEFAULT 'personal',  -- personal | round_robin | collective | event
  title              text,
  description        text,
  logo_url           text,
  accent             text,
  cover_url          text,
  duration_min       integer NOT NULL DEFAULT 30,
  buffer_before_min  integer NOT NULL DEFAULT 0,
  buffer_after_min   integer NOT NULL DEFAULT 0,
  min_notice_min     integer NOT NULL DEFAULT 60,
  timezone           text NOT NULL DEFAULT 'America/New_York',
  availability_json  jsonb,
  enabled            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendars_tenant_idx ON public.calendars (tenant_id);
CREATE INDEX IF NOT EXISTS calendars_created_by_idx ON public.calendars (created_by);

CREATE TABLE IF NOT EXISTS public.calendar_hosts (
  calendar_id uuid NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  priority    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (calendar_id, user_id)
);
CREATE INDEX IF NOT EXISTS calendar_hosts_user_idx ON public.calendar_hosts (user_id);

ALTER TABLE public.internal_bookings
  ADD COLUMN IF NOT EXISTS calendar_id uuid REFERENCES public.calendars(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS internal_bookings_calendar_idx ON public.internal_bookings (calendar_id);

-- --- SECURITY DEFINER helpers (break the calendars<->calendar_hosts RLS cycle) --
-- Referencing another RLS-protected table inside a policy re-expands that table's
-- policies; two policies pointing at each other recurse (42P17). SECURITY DEFINER
-- functions are not RLS-expanded, so routing the cross-table checks through them
-- breaks the cycle (and avoids nested-RLS cost).
CREATE OR REPLACE FUNCTION public.is_calendar_host(_cal uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.calendar_hosts WHERE calendar_id = _cal AND user_id = auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.can_manage_calendar(_cal uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.calendars c
     WHERE c.id = _cal
       AND (c.created_by = auth.uid()
            OR public.is_platform_admin()
            OR (c.tenant_id IS NOT NULL AND public.is_tenant_admin(c.tenant_id)))
  );
$$;

-- --- RLS --------------------------------------------------------------------
-- Public booking reads via the service-role edge function (bypasses RLS); no
-- anon policy. Authenticated management only.
ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_hosts ENABLE ROW LEVEL SECURITY;

-- Manage: creator, platform staff, or the tenant's admin. WITH CHECK additionally
-- forbids injecting/moving a calendar into a tenant you don't belong to, and
-- reserves platform-owned (null-tenant) calendars for platform admins.
DROP POLICY IF EXISTS "manage calendars" ON public.calendars;
CREATE POLICY "manage calendars" ON public.calendars
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

-- Hosts can read the calendars they're assigned to (via SECURITY DEFINER helper).
DROP POLICY IF EXISTS "hosts read calendars" ON public.calendars;
CREATE POLICY "hosts read calendars" ON public.calendars
  FOR SELECT TO authenticated
  USING (public.is_calendar_host(id));

-- calendar_hosts: a host may read/remove their own membership; managing the
-- roster requires managing the parent calendar (via SECURITY DEFINER helper).
DROP POLICY IF EXISTS "manage calendar hosts" ON public.calendar_hosts;
CREATE POLICY "manage calendar hosts" ON public.calendar_hosts
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_calendar(calendar_id))
  WITH CHECK (public.can_manage_calendar(calendar_id));

GRANT EXECUTE ON FUNCTION public.is_calendar_host(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_calendar(uuid) TO authenticated;
