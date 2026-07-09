-- Guest-initiated class reschedule. Reusing the single-host "is this host
-- free" check (as booking-manage does for single/round-robin) is wrong for a
-- class: the host is SUPPOSED to be busy with other guests' seats at the
-- target time if it's an existing session. Moving a guest between class
-- sessions needs the same lock -> find-or-create -> count -> write shape as
-- create_class_booking, but ending in an UPDATE of the guest's existing seat
-- instead of an INSERT, so the move is atomic: a sold-out target leaves the
-- guest's original seat completely untouched (the whole function is one
-- transaction; nothing commits until the final UPDATE succeeds).
CREATE OR REPLACE FUNCTION public.reschedule_class_booking(
  _seat_id uuid, _new_start_at timestamptz, _new_end_at timestamptz
) RETURNS public.internal_bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _seat public.internal_bookings;
  _old_session_id uuid;
  _session public.internal_bookings;
  _booked integer;
  _attempts integer := 0;
BEGIN
  SELECT * INTO _seat FROM public.internal_bookings
   WHERE id = _seat_id AND booking_kind = 'class_seat' AND status = 'scheduled'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seat_not_found';
  END IF;
  _old_session_id := _seat.class_session_id;

  -- No-op guard: "rescheduling" to the slot the seat is already in. Without
  -- this, a full class's own occupant would fail the capacity check below
  -- (counted among the very seats they're being compared against).
  IF _seat.start_at = _new_start_at AND _seat.end_at = _new_end_at THEN
    RETURN _seat;
  END IF;

  LOOP
    SELECT * INTO _session FROM public.internal_bookings
     WHERE calendar_id = _seat.calendar_id AND start_at = _new_start_at
       AND booking_kind = 'class_session' AND status <> 'cancelled'
     FOR UPDATE;
    EXIT WHEN FOUND;

    _attempts := _attempts + 1;
    IF _attempts > 5 THEN
      -- Same reasoning as create_class_booking's retry-bound fix: a genuine,
      -- permanent host conflict (not a session-creation race) would otherwise
      -- retry the same failing INSERT forever.
      RAISE EXCLUSION_VIOLATION USING MESSAGE = 'That time is no longer available.';
    END IF;

    BEGIN
      -- Capacity is read fresh from calendars (not copied from the old
      -- session's snapshot) so a brand-new target session picks up the
      -- owner's CURRENT setting, same as a fresh booking would.
      INSERT INTO public.internal_bookings
        (tenant_id, host_user_id, calendar_id, booking_kind, capacity,
         title, start_at, end_at, timezone, status, source)
      SELECT s.tenant_id, s.host_user_id, s.calendar_id, 'class_session', c.capacity,
             s.title, _new_start_at, _new_end_at, s.timezone, 'scheduled', s.source
      FROM public.internal_bookings s
      JOIN public.calendars c ON c.id = s.calendar_id
      WHERE s.id = _old_session_id
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

  UPDATE public.internal_bookings
     SET class_session_id = _session.id, start_at = _new_start_at, end_at = _new_end_at
   WHERE id = _seat.id
   RETURNING * INTO _seat;

  RETURN _seat;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_class_booking(uuid, timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.reschedule_class_booking(uuid, timestamptz, timestamptz) TO service_role;
