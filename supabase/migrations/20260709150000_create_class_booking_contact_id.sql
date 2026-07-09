-- On-booking CRM linkage (native calendar/booking engine, §7/§8): internal_bookings
-- already carries a contact_id FK into clients, but nothing populates it for a
-- class booking's seat row.
--
-- A new trailing parameter changes the function's (name, arg-types) identity
-- in Postgres, so CREATE OR REPLACE alone would ADD an overload rather than
-- replace the original -- leaving two candidates that any named-argument RPC
-- call (old caller or new) can't disambiguate ("function is not unique").
-- Drop the old 16-arg signature explicitly first.
DROP FUNCTION IF EXISTS public.create_class_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, text, text, jsonb, text);

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
