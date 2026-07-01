
CREATE TABLE IF NOT EXISTS public.staff_calendar_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  google_calendar_connected boolean NOT NULL DEFAULT false,
  google_refresh_token_encrypted text,
  google_calendar_id text,
  google_sync_token text,
  google_email text,
  google_last_sync_at timestamptz,
  apple_caldav_connected boolean NOT NULL DEFAULT false,
  apple_caldav_url text,
  apple_caldav_username text,
  apple_app_password_encrypted text,
  apple_last_sync_at timestamptz,
  booking_page_slug text UNIQUE,
  booking_page_enabled boolean NOT NULL DEFAULT false,
  default_meeting_duration_min integer NOT NULL DEFAULT 30,
  buffer_before_min integer NOT NULL DEFAULT 0,
  buffer_after_min integer NOT NULL DEFAULT 0,
  timezone text NOT NULL DEFAULT 'America/New_York',
  availability_json jsonb NOT NULL DEFAULT '{"mon":[{"start":"09:00","end":"17:00"}],"tue":[{"start":"09:00","end":"17:00"}],"wed":[{"start":"09:00","end":"17:00"}],"thu":[{"start":"09:00","end":"17:00"}],"fri":[{"start":"09:00","end":"17:00"}],"sat":[],"sun":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_calendar_settings TO authenticated;
GRANT ALL ON public.staff_calendar_settings TO service_role;
ALTER TABLE public.staff_calendar_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_cal_own_all" ON public.staff_calendar_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff_cal_tenant_admin_read" ON public.staff_calendar_settings FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND tenant_id = public.current_user_tenant_id()
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)));
CREATE TRIGGER trg_staff_calendar_settings_updated BEFORE UPDATE ON public.staff_calendar_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.internal_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  host_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  guest_email text, guest_name text, guest_phone text,
  title text NOT NULL, notes text, meeting_link text, location text,
  start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  status text NOT NULL DEFAULT 'scheduled',
  source text NOT NULL DEFAULT 'internal',
  external_event_id text, external_calendar_id text,
  cancelled_at timestamptz, cancelled_by uuid REFERENCES auth.users(id), cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_bookings_time_check CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS idx_internal_bookings_host_start ON public.internal_bookings (host_user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_internal_bookings_tenant_start ON public.internal_bookings (tenant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_internal_bookings_contact ON public.internal_bookings (contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_bookings_external ON public.internal_bookings (source, external_event_id) WHERE external_event_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_bookings TO authenticated;
GRANT ALL ON public.internal_bookings TO service_role;
ALTER TABLE public.internal_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings_host_all" ON public.internal_bookings FOR ALL TO authenticated
  USING (host_user_id = auth.uid()) WITH CHECK (host_user_id = auth.uid());
CREATE POLICY "bookings_tenant_admin_read" ON public.internal_bookings FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND tenant_id = public.current_user_tenant_id()
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)));
CREATE TRIGGER trg_internal_bookings_updated BEFORE UPDATE ON public.internal_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_public_booking_page(_slug text)
RETURNS TABLE (
  user_id uuid, tenant_id uuid, timezone text,
  default_meeting_duration_min integer, buffer_before_min integer, buffer_after_min integer,
  availability_json jsonb, display_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id, s.tenant_id, s.timezone,
    s.default_meeting_duration_min, s.buffer_before_min, s.buffer_after_min,
    s.availability_json,
    COALESCE(NULLIF(TRIM(p.full_name), ''), 'Host') AS display_name
  FROM public.staff_calendar_settings s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.booking_page_slug = _slug AND s.booking_page_enabled = true
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_booking_page(text) TO anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_bookings;
