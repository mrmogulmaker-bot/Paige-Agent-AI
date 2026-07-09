-- Booking-level support for Collective and Class. Design principle: keep
-- "one row = one person's relationship to one interval" rather than arrays
-- or a junction table (a GiST EXCLUDE constraint can't span a join, so a
-- junction table would need its own duplicate, trigger-synced EXCLUDE to get
-- the same guarantee this table's constraint already provides). Instead, one
-- new discriminator column tells the existing constraints which rows are
-- allowed to share a slot and which aren't:
--
--   'single'        — today's behavior, unchanged (personal / round_robin).
--   'collective'    — N symmetric rows, one per host, correlated by
--                      collective_group_id. Each is a full, normal booking
--                      for that host — the existing EXCLUDE protects every
--                      one of them with zero change to its semantics.
--   'class_session' — 1 marker row per class time slot: the host's real
--                      busy block + the capacity ceiling for that slot.
--   'class_seat'    — 1 row per registered guest, linked via
--                      class_session_id. The ONLY kind exempt from the
--                      overlap guard (many guests intentionally share one
--                      host+slot); capacity is enforced separately (below)
--                      since EXCLUDE is pairwise and can't express "≤ N rows".
ALTER TABLE public.internal_bookings
  ADD COLUMN IF NOT EXISTS booking_kind text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS collective_group_id uuid,
  ADD COLUMN IF NOT EXISTS class_session_id uuid REFERENCES public.internal_bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capacity integer;

ALTER TABLE public.internal_bookings
  ADD CONSTRAINT internal_bookings_kind_chk
  CHECK (booking_kind IN ('single', 'collective', 'class_session', 'class_seat'));

ALTER TABLE public.internal_bookings
  ADD CONSTRAINT internal_bookings_capacity_chk
  CHECK (capacity IS NULL OR capacity > 0);

CREATE INDEX IF NOT EXISTS internal_bookings_collective_group_idx
  ON public.internal_bookings (collective_group_id) WHERE collective_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS internal_bookings_class_session_idx
  ON public.internal_bookings (class_session_id) WHERE class_session_id IS NOT NULL;

-- At most one active session marker per calendar+time — the lock/lookup
-- target `create_class_booking` uses to find-or-create a session.
CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_bookings_class_session
  ON public.internal_bookings (calendar_id, start_at)
  WHERE booking_kind = 'class_session' AND status <> 'cancelled';

-- This OLDER exact-start unique index (from 20260708190000, predates
-- appointment types AND this migration) would otherwise reject every 2nd
-- class_seat outright, independent of the EXCLUDE fix below. Re-scope it the
-- same way: class_seat rows are meant to share (host_user_id, start_at).
DROP INDEX IF EXISTS uq_internal_bookings_host_start_active;
CREATE UNIQUE INDEX uq_internal_bookings_host_start_active
  ON public.internal_bookings (host_user_id, start_at)
  WHERE status <> 'cancelled' AND booking_kind <> 'class_seat';

-- Re-scope the GiST EXCLUDE constraint (added this session in
-- 20260709100000) the same way. Postgres can't ALTER an EXCLUDE constraint's
-- WHERE clause in place, so drop + recreate. 'single', 'collective' (each
-- host's own leg), and 'class_session' (the host's real busy block) stay
-- fully protected per host_user_id — the existing guarantee is unchanged for
-- every kind except the one that's explicitly meant to share a slot.
ALTER TABLE public.internal_bookings DROP CONSTRAINT internal_bookings_no_overlap;
ALTER TABLE public.internal_bookings
  ADD CONSTRAINT internal_bookings_no_overlap
  EXCLUDE USING gist (
    host_user_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status <> 'cancelled' AND booking_kind <> 'class_seat');

-- Cascade cancel: cancelling a class session cancels every seat on it (the
-- class isn't happening — nobody should show up expecting it to). Cancelling
-- any one leg of a collective booking cancels the whole session — nobody
-- silently drops off a panel interview without every other host and the
-- guest knowing.
CREATE OR REPLACE FUNCTION public.cascade_booking_group_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF NEW.booking_kind = 'class_session' THEN
      UPDATE public.internal_bookings SET status = 'cancelled'
       WHERE class_session_id = NEW.id AND status <> 'cancelled';
    ELSIF NEW.booking_kind = 'collective' AND NEW.collective_group_id IS NOT NULL THEN
      UPDATE public.internal_bookings SET status = 'cancelled'
       WHERE collective_group_id = NEW.collective_group_id AND id <> NEW.id AND status <> 'cancelled';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_booking_group_cancel ON public.internal_bookings;
CREATE TRIGGER trg_cascade_booking_group_cancel
  AFTER UPDATE ON public.internal_bookings
  FOR EACH ROW EXECUTE FUNCTION public.cascade_booking_group_cancel();

-- Race-safe Class capacity enforcement. EXCLUDE is pairwise ("no two rows
-- conflict") — there's no declarative constraint for "≤ N rows share this
-- key", so capacity needs lock → count → insert in one transaction. The
-- FOR UPDATE lock is scoped to (calendar_id, start_at): different slots never
-- block each other; concurrent claims for the SAME slot serialize correctly,
-- so count-then-insert can never oversell a seat. Capacity is snapshotted
-- onto the session row at first-booking time (not re-read from
-- calendars.capacity live) so an in-progress sell-out isn't retroactively
-- invalidated if the owner changes capacity later — new sessions pick up the
-- new number.
CREATE OR REPLACE FUNCTION public.create_class_booking(
  _calendar_id uuid, _host_user_id uuid, _tenant_id uuid,
  _start_at timestamptz, _end_at timestamptz, _timezone text, _capacity integer,
  _title text, _guest_name text, _guest_email text, _guest_phone text, _notes text,
  _location_type text, _location_value text, _intake_answers jsonb, _source text
) RETURNS public.internal_bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _session public.internal_bookings;
  _seat public.internal_bookings;
  _booked integer;
BEGIN
  LOOP
    SELECT * INTO _session FROM public.internal_bookings
     WHERE calendar_id = _calendar_id AND start_at = _start_at
       AND booking_kind = 'class_session' AND status <> 'cancelled'
     FOR UPDATE;
    EXIT WHEN FOUND;
    BEGIN
      INSERT INTO public.internal_bookings
        (tenant_id, host_user_id, calendar_id, booking_kind, capacity,
         title, start_at, end_at, timezone, status, source)
      VALUES (_tenant_id, _host_user_id, _calendar_id, 'class_session', _capacity,
              _title, _start_at, _end_at, _timezone, 'scheduled', _source)
      RETURNING * INTO _session;
      EXIT;
    EXCEPTION WHEN unique_violation OR exclusion_violation THEN
      -- Someone else just created the session (loop back and find it via the
      -- SELECT above), or the host has a real conflicting booking at this
      -- time (the EXCLUDE constraint rejected it — loop back, re-select will
      -- find nothing, and we'll hit this same branch again; the caller's
      -- retry cap, not this function, is what should bound that case).
      CONTINUE;
    END;
  END LOOP;

  SELECT count(*) INTO _booked FROM public.internal_bookings
   WHERE class_session_id = _session.id AND status <> 'cancelled';
  IF _booked >= _session.capacity THEN
    RAISE EXCEPTION 'sold_out';
  END IF;

  INSERT INTO public.internal_bookings
    (tenant_id, host_user_id, calendar_id, booking_kind, class_session_id,
     title, start_at, end_at, timezone, status, source,
     guest_name, guest_email, guest_phone, notes, location_type, location_value, intake_answers)
  VALUES (_tenant_id, _host_user_id, _calendar_id, 'class_seat', _session.id,
          _title, _start_at, _end_at, _timezone, 'scheduled', _source,
          _guest_name, _guest_email, _guest_phone, _notes, _location_type, _location_value, _intake_answers)
  RETURNING * INTO _seat;
  RETURN _seat;
END;
$$;

REVOKE ALL ON FUNCTION public.create_class_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, text, text, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_class_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, text, text, jsonb, text) TO service_role;
