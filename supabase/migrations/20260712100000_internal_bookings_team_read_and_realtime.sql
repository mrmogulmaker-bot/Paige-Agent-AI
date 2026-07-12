-- Team schedule view foundations (calendar epic).
--
-- internal_bookings RLS (20260709140000) is own-row-only: a caller can only
-- SELECT host_user_id = auth.uid(). That blocks any team "what's booked" view.
-- list_team_bookings is the SECURITY DEFINER read seam that lets a tenant admin
-- see the whole team's schedule in a range — tenant-isolated, with an own-host
-- fallback for non-admin staff. This is the ONLY sanctioned cross-host read;
-- it is deliberately narrow and strictly scoped to the caller's own tenant.
--
-- Also: add internal_bookings to the realtime publication (the live schedule
-- subscribes to it) and a manage_token_version column so a cancelled booking's
-- signed manage link can be revoked (booking-manage checks it).

ALTER TABLE public.internal_bookings
  ADD COLUMN IF NOT EXISTS manage_token_version smallint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.list_team_bookings(
  _from timestamptz,
  _to timestamptz,
  _host_ids uuid[] DEFAULT NULL,
  _tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, tenant_id uuid, calendar_id uuid, host_user_id uuid, host_full_name text,
  contact_id uuid, title text, start_at timestamptz, end_at timestamptz, timezone text,
  status text, source text, guest_name text, guest_email text, guest_phone text,
  notes text, location_type text, location_value text,
  booking_kind text, class_session_id uuid, capacity integer, collective_group_id uuid,
  appointment_type jsonb, intake_answers jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(_tenant_id, public.current_user_tenant_id());
  _team boolean;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'BOOKING_FORBIDDEN: auth required' USING ERRCODE='42501'; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'BOOKING_NO_TENANT' USING ERRCODE='22023'; END IF;
  -- Hard tenant gate: the caller must belong to (or own the platform for) the
  -- tenant they ask about — a caller can NEVER read another tenant's bookings.
  IF NOT (public.is_platform_owner() OR public.is_tenant_member(_tenant)) THEN
    RAISE EXCEPTION 'BOOKING_FORBIDDEN: not a member of this tenant' USING ERRCODE='42501';
  END IF;
  -- Team-wide read only for tenant admins / platform staff; everyone else is
  -- narrowed to their own rows (same visibility their RLS already grants).
  _team := public.is_platform_owner() OR public.is_tenant_admin(_tenant);

  RETURN QUERY
    SELECT b.id, b.tenant_id, b.calendar_id, b.host_user_id, p.full_name,
           b.contact_id, b.title, b.start_at, b.end_at, b.timezone,
           b.status, b.source, b.guest_name, b.guest_email, b.guest_phone,
           b.notes, b.location_type, b.location_value,
           b.booking_kind, b.class_session_id, b.capacity, b.collective_group_id,
           b.appointment_type, b.intake_answers
      FROM public.internal_bookings b
      LEFT JOIN public.profiles p ON p.user_id = b.host_user_id
     WHERE b.tenant_id = _tenant
       AND b.start_at < _to
       AND b.end_at >= _from
       AND (_team OR b.host_user_id = _caller)
       AND (_host_ids IS NULL OR b.host_user_id = ANY(_host_ids))
     ORDER BY b.start_at ASC;
END $$;

REVOKE ALL ON FUNCTION public.list_team_bookings(timestamptz,timestamptz,uuid[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_team_bookings(timestamptz,timestamptz,uuid[],uuid) TO authenticated, service_role;

-- Realtime: the live schedule subscribes to internal_bookings via postgres_changes.
-- Postgres delivers row events under the subscriber's RLS, so this does NOT widen
-- visibility — it only enables change streams. Guarded so re-runs don't error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='internal_bookings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_bookings';
  END IF;
END $$;
