-- Paige (and the UI) book a one-on-one meeting through one guarded seam (§10).
-- SECURITY DEFINER so it bypasses the kind-restricting RLS; admin|coach only;
-- host defaults to the caller. booking_kind must be 'single' for a 1:1.
-- Applied to prod via the Supabase MCP; committed here for repo parity.
CREATE OR REPLACE FUNCTION public.create_internal_booking(
  _title       text,
  _start_at    timestamptz,
  _end_at      timestamptz,
  _timezone    text DEFAULT 'UTC',
  _contact_id  uuid DEFAULT NULL,
  _host_user_id uuid DEFAULT NULL,
  _guest_name  text DEFAULT NULL,
  _guest_email text DEFAULT NULL,
  _notes       text DEFAULT NULL,
  _location    text DEFAULT NULL,
  _tenant_id   uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(_tenant_id, public.current_user_tenant_id());
  _host uuid := COALESCE(_host_user_id, auth.uid());
  _id uuid;
  _gname text; _gemail text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'BOOKING_FORBIDDEN: auth required' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_any_role(_caller, ARRAY['admin','super_admin','coach'])
          OR public.is_platform_owner()
          OR (_tenant IS NOT NULL AND public.is_tenant_admin(_tenant))) THEN
    RAISE EXCEPTION 'BOOKING_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _end_at <= _start_at THEN RAISE EXCEPTION 'BOOKING_BAD_TIME: end must be after start' USING ERRCODE = '22023'; END IF;
  IF COALESCE(btrim(_title), '') = '' THEN RAISE EXCEPTION 'BOOKING_TITLE_REQUIRED' USING ERRCODE = '22023'; END IF;

  IF _contact_id IS NOT NULL THEN
    SELECT COALESCE(_guest_name, btrim(concat_ws(' ', first_name, last_name))), COALESCE(_guest_email, email)
      INTO _gname, _gemail
      FROM public.clients WHERE id = _contact_id;
  ELSE
    _gname := _guest_name; _gemail := _guest_email;
  END IF;

  INSERT INTO public.internal_bookings (
    tenant_id, host_user_id, contact_id, guest_name, guest_email,
    title, notes, location, start_at, end_at, timezone,
    status, source, booking_kind, reminder_state
  ) VALUES (
    _tenant, _host, _contact_id, _gname, _gemail,
    btrim(_title), _notes, _location, _start_at, _end_at, COALESCE(NULLIF(btrim(_timezone), ''), 'UTC'),
    'confirmed', 'paige', 'single', '{}'::jsonb
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'internal_booking', 'create_internal_booking', _id,
          jsonb_build_object('tenant_id', _tenant, 'host_user_id', _host, 'contact_id', _contact_id, 'start_at', _start_at));

  RETURN _id;
END;
$$;

REVOKE ALL   ON FUNCTION public.create_internal_booking(text, timestamptz, timestamptz, text, uuid, uuid, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_internal_booking(text, timestamptz, timestamptz, text, uuid, uuid, text, text, text, text, uuid) TO authenticated, service_role;
