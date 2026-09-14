-- =============================================================================
-- E6 hardening — create_class_booking §59 in-body tenant-consistency guard (LOW-1).
--
-- create_class_booking is SECURITY DEFINER and writes internal_bookings rows using
-- _tenant_id / _host_user_id / _calendar_id taken VERBATIM from its arguments, with
-- no in-body check that they are mutually consistent (§39 E6 review, LOW-1). It is
-- safe today because EXECUTE is service_role-only and its sole caller (the
-- public-booking edge resolver) passes SERVER-derived values (tenant_id = the
-- resolved calendar's tenant). This closes the LATENT cross-tenant-write hazard:
-- any future service-role caller passing an attacker-influenced _tenant_id would
-- otherwise write a MIS-TENANTED booking row.
--
-- SCOPE (deliberately the SAFE half of the LOW-1 finding — §32/§58): this asserts
-- ONLY tenant-consistency (`_tenant_id = calendars.tenant_id`), which is guaranteed
-- for every legitimate call (the resolver passes `cal.tenant_id`), so no legit
-- caller breaks. The finding's host-membership assert (`_host_user_id ∈
-- calendar_hosts(_calendar_id)`) is NOT added here: it could break a legitimate
-- class booking if the resolver's chosen host is not always a calendar_hosts row,
-- and that cannot be authenticated-verified from this headless session — it is
-- recorded as a follow-up in docs/evidence/proofs/booking-preset-e6/README.md.
--
-- Additive + idempotent (CREATE OR REPLACE of one function body + the guard).
-- Grants unchanged (service_role only). §2: generic scheduling; no finance content.
--
-- NOTE (§32.a / E5 merge-window lesson): E6 is a HELD draft. Re-confirm this
-- migration version is unique against fresh `origin/main` immediately before merge;
-- renumber if a lower-in-flight migration has taken a colliding version.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_class_booking(
  _calendar_id uuid, _host_user_id uuid, _tenant_id uuid,
  _start_at timestamptz, _end_at timestamptz, _timezone text, _capacity integer,
  _title text, _guest_name text, _guest_email text, _guest_phone text, _notes text,
  _location_type text, _location_value text, _intake_answers jsonb, _source text,
  _contact_id uuid DEFAULT NULL
) RETURNS public.internal_bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _session public.internal_bookings;
  _seat public.internal_bookings;
  _booked integer;
  _attempts integer := 0;
BEGIN
  -- §59 in-body tenant-consistency guard (E6 LOW-1): the passed tenant MUST match
  -- the calendar's own tenant. `IS DISTINCT FROM` handles a null-tenant
  -- (platform-owned) calendar correctly: a null calendar tenant admits only a null
  -- _tenant_id, exactly what the resolver passes for such a calendar.
  IF _tenant_id IS DISTINCT FROM (SELECT tenant_id FROM public.calendars WHERE id = _calendar_id) THEN
    RAISE EXCEPTION 'create_class_booking: _tenant_id does not match the calendar''s tenant'
      USING ERRCODE = '42501';
  END IF;

  LOOP
    SELECT * INTO _session FROM public.internal_bookings
     WHERE calendar_id = _calendar_id AND start_at = _start_at
       AND booking_kind = 'class_session' AND status <> 'cancelled'
     FOR UPDATE;
    EXIT WHEN FOUND;

    _attempts := _attempts + 1;
    IF _attempts > 5 THEN
      RAISE EXCLUSION_VIOLATION USING MESSAGE = 'That time is no longer available.';
    END IF;

    BEGIN
      INSERT INTO public.internal_bookings
        (tenant_id, host_user_id, calendar_id, booking_kind, capacity,
         title, start_at, end_at, timezone, status, source)
      VALUES (_tenant_id, _host_user_id, _calendar_id, 'class_session', _capacity,
              _title, _start_at, _end_at, _timezone, 'scheduled', _source)
      RETURNING * INTO _session;
      EXIT;
    EXCEPTION WHEN unique_violation OR exclusion_violation THEN
      CONTINUE;
    END;
  END LOOP;

  SELECT count(*) INTO _booked FROM public.internal_bookings
   WHERE class_session_id = _session.id AND status <> 'cancelled';
  IF _booked >= _session.capacity THEN
    RAISE EXCEPTION 'sold_out';
  END IF;

  INSERT INTO public.internal_bookings
    (tenant_id, host_user_id, calendar_id, booking_kind, class_session_id, contact_id,
     title, start_at, end_at, timezone, status, source,
     guest_name, guest_email, guest_phone, notes, location_type, location_value, intake_answers)
  VALUES (_tenant_id, _host_user_id, _calendar_id, 'class_seat', _session.id, _contact_id,
          _title, _start_at, _end_at, _timezone, 'scheduled', _source,
          _guest_name, _guest_email, _guest_phone, _notes, _location_type, _location_value, _intake_answers)
  RETURNING * INTO _seat;
  RETURN _seat;
END;
$$;

REVOKE ALL ON FUNCTION public.create_class_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, text, text, jsonb, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_class_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, text, text, jsonb, text, uuid) TO service_role;
