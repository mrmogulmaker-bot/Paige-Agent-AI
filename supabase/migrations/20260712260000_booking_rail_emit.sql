-- Calendar Wave 2 #48(c) — bookings feed the Paige Context Rail.
--
-- The last gap in the calendar waves: a booking already links to a CRM contact
-- (public-booking.findOrCreateContact stamps internal_bookings.contact_id) and
-- fires the legacy notify-team-event notifier, but nothing writes to the rail.
-- This closes it so a booking lights up BOTH the client's own activity feed and
-- the owner's command center in real time (§7 one brain facing both sides, §8
-- Client Experience → Owner Ops on the action bus), consistent with the rail
-- epic (Steps 1-6) — which we USE here, not re-create.
--
-- Shape of the wiring:
--   • three coaching-generic, platform-default event kinds (tenant_id NULL,
--     §2-clean — every practice books meetings, zero finance wording);
--   • an AFTER INSERT OR UPDATE trigger on internal_bookings that files exactly
--     one rail event per real booking transition via record_rail_event(), on the
--     trusted service path (explicit p_tenant_id, since the public booking path
--     runs with auth.uid() NULL).
--
-- Hard rule (§13): the emit is BEST-EFFORT. The entire body is wrapped so a rail
-- failure can NEVER roll back or block a customer's booking — a booking that
-- succeeds must never be undone because a downstream feed hiccuped.

-- ── (A) EVENT KINDS — platform defaults, client-facing (§2/§9) ───────────────
-- A booking is client-facing: audience 'both' + visibility 'client_visible' so
-- it reaches the client's own feed AND the owner rail; department
-- 'client_experience' (the Client team detected/served it, routes to Owner Ops).
-- Idempotent: DO NOTHING never overwrites a kind that somehow already exists.
INSERT INTO public.paige_event_kinds
  (slug, tenant_id, label, description, default_audience, default_visibility, department)
VALUES
  ('booking.created',     NULL, 'Meeting booked',    'A meeting was booked.',   'both', 'client_visible', 'client_experience'),
  ('booking.cancelled',   NULL, 'Meeting cancelled', 'A meeting was cancelled.','both', 'client_visible', 'client_experience'),
  ('booking.rescheduled', NULL, 'Meeting moved',     'A meeting was moved.',    'both', 'client_visible', 'client_experience')
ON CONFLICT (slug) DO NOTHING;

-- ── (B) EMITTER — best-effort rail write on the booking's own transaction ────
-- SECURITY DEFINER so it can (1) EXECUTE record_rail_event regardless of the
-- inserting role and (2) read internal_bookings for the collective-dedup MIN()
-- lookup irrespective of RLS. It never mutates internal_bookings, so it cannot
-- recurse.
CREATE OR REPLACE FUNCTION public.emit_booking_rail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind    text;
  v_title   text;
  v_verb    text;
  v_rep_id  uuid;
BEGIN
  -- Everything below is best-effort. A rail failure must never abort or roll
  -- back the booking (§13): swallow, warn, and return the row unchanged.
  BEGIN
    -- The rail is per-contact and per-tenant. A contactless booking (e.g. a
    -- class_session marker row) files nothing — never fabricate a contact.
    IF NEW.contact_id IS NULL OR NEW.tenant_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- ── EVENT SELECTION (truthful, §13) ──────────────────────────────────────
    -- Active status vocabulary confirmed from the booking code + constraints:
    -- 'scheduled' is the active/booked status; 'cancelled' is the sole cancelled
    -- literal (every system guard is `status <> 'cancelled'`). We therefore
    -- treat active := status IS DISTINCT FROM 'cancelled'.
    IF TG_OP = 'INSERT' THEN
      -- Only a booking inserted in an ACTIVE status is a real "booked" moment.
      -- A row inserted already-cancelled files nothing.
      IF NEW.status IS DISTINCT FROM 'cancelled' THEN
        v_kind := 'booking.created';
        v_verb := 'Meeting booked';
      ELSE
        RETURN NEW;
      END IF;

    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' THEN
        -- Real transition into cancelled (not a re-set of the same status).
        v_kind := 'booking.cancelled';
        v_verb := 'Meeting cancelled';
      ELSIF NEW.start_at IS DISTINCT FROM OLD.start_at
            AND NEW.status IS DISTINCT FROM 'cancelled' THEN
        -- Start time actually moved and the booking is still active → moved.
        v_kind := 'booking.rescheduled';
        v_verb := 'Meeting moved';
      ELSE
        -- Any other update (notes, guest fields, re-set same status, …): nothing.
        RETURN NEW;
      END IF;

    ELSE
      RETURN NEW;
    END IF;

    -- ── COLLECTIVE DEDUP ─────────────────────────────────────────────────────
    -- A collective booking writes ONE symmetric internal_bookings row PER HOST,
    -- all sharing collective_group_id (one meeting = N rows). A naive per-row
    -- trigger would emit N duplicate rail events for the single meeting. Rule:
    -- emit ONLY for the deterministic representative leg — the row whose id is
    -- MIN(id) across the collective_group_id set. Legs are written in a single
    -- multi-row INSERT (all siblings are visible when each AFTER-ROW trigger
    -- fires) and cancel/reschedule propagate to the whole group, so MIN(id) is
    -- stable across every leg's invocation → exactly one leg emits. When
    -- collective_group_id IS NULL (single / round_robin / class_seat), always
    -- emit — each such row is its own distinct booking.
    IF NEW.collective_group_id IS NOT NULL THEN
      -- Deterministic representative = the smallest id in the group. NOTE: Postgres
      -- has no min(uuid) AGGREGATE, but uuid IS orderable (btree), so take the first
      -- row by ORDER BY id LIMIT 1 rather than min() (which would raise 42883 →
      -- get swallowed by the best-effort handler → collective bookings never emit).
      SELECT b.id INTO v_rep_id
        FROM public.internal_bookings b
       WHERE b.collective_group_id = NEW.collective_group_id
       ORDER BY b.id
       LIMIT 1;
      IF v_rep_id IS DISTINCT FROM NEW.id THEN
        RETURN NEW;
      END IF;
    END IF;

    -- Human title, no ids/slugs (§3).
    v_title := v_verb || ': ' || COALESCE(NULLIF(btrim(NEW.title), ''), 'a meeting');

    PERFORM public.record_rail_event(
      p_contact_id      => NEW.contact_id,
      p_event_kind      => v_kind,
      p_surface         => 'client_portal',   -- the booking belongs to the client
      p_actor_type      => 'client',
      p_title           => v_title,
      p_summary         => NULL,
      p_payload         => jsonb_build_object(
                             'booking_kind', NEW.booking_kind,
                             'start_at',     NEW.start_at,
                             'status',       NEW.status
                           ),
      p_ref_table       => 'internal_bookings',
      p_ref_id          => NEW.id,
      p_from_department => 'client_experience',
      p_to_department   => 'owner_ops',
      p_occurred_at     => NULL,
      p_narrow_to_owner => false,
      -- Service (public-booking) path runs with auth.uid() NULL, so the trusted
      -- service path REQUIRES an explicit tenant. record_rail_event validates
      -- the contact belongs to this tenant.
      p_tenant_id       => NEW.tenant_id
    );

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'emit_booking_rail skipped for booking % (op %): %',
      NEW.id, TG_OP, SQLERRM;
    RETURN NEW;
  END;
END $$;

-- Locked down: only the trigger machinery needs it. No PUBLIC/anon EXECUTE.
REVOKE ALL ON FUNCTION public.emit_booking_rail() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_emit_booking_rail ON public.internal_bookings;
CREATE TRIGGER trg_emit_booking_rail
  AFTER INSERT OR UPDATE ON public.internal_bookings
  FOR EACH ROW EXECUTE FUNCTION public.emit_booking_rail();
