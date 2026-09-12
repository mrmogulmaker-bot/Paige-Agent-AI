-- ============================================================================
-- CALENDAR: owner-side EDIT of a native booking's details (#calendar).
--
-- The Solo Calendar already lets an owner CREATE (create_internal_booking),
-- CANCEL/status (admin_set_booking_status), and — newly wired — MOVE
-- (reschedule_internal_booking) a booking. It had NO seam to fix the details of
-- an existing booking (a typo in the title, the guest's name, a note, which
-- calendar it belongs to). Editing those from the client via a raw table UPDATE
-- would be scoped by RLS to the caller's own rows and would silently no-op on a
-- teammate's booking while reporting success — the exact §13 trap the sibling
-- RPCs were built to close. This adds the tenant-gated seam that performs the
-- change server-side and refuses truthfully.
--
-- AUTHORIZATION MODEL: identical to reschedule_internal_booking /
-- cancel_internal_booking — the booking's own tenant (or platform owner), AND an
-- admin/coach/super_admin of that tenant OR the booking's own host. A
-- service-role / Paige caller (auth.uid() NULL) is trusted for the tenant it
-- resolved. §9 IDOR closure: every check keys on the ROW's tenant, never on a
-- client-supplied identity.
--
-- DELIBERATELY NARROW: it touches title, guest_name, notes and calendar_id ONLY.
-- start_at / end_at / status are untouched, so this fires NO false
-- booking.rescheduled or booking.cancelled Rail event — the emit_booking_rail
-- trigger keys on a real start_at move or a transition into cancelled, and a
-- details edit is neither. Moving time stays reschedule_internal_booking's job;
-- cancelling stays admin_set_booking_status's. One capability, one seam (§18).
--
-- §2: zero finance content — a generic booking-detail edit. §59: SECURITY DEFINER
-- with the caller scope enforced IN-BODY (the grant is never the guard). Granted
-- to authenticated + service_role only; anon is explicitly revoked.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_internal_booking(
  _booking_id uuid,
  _title text,
  _guest_name text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _calendar_id uuid DEFAULT NULL,
  _tenant_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _row public.internal_bookings%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.internal_bookings WHERE id = _booking_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- Caller scope — the same shape as reschedule_internal_booking (§59).
  IF _caller IS NOT NULL THEN
    IF NOT (_row.tenant_id = public.current_user_tenant_id() OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'BOOKING_FORBIDDEN: wrong tenant' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) OR _row.host_user_id = _caller) THEN
      RAISE EXCEPTION 'BOOKING_FORBIDDEN: admin, coach, or host required' USING ERRCODE = '42501';
    END IF;
  ELSIF _tenant_id IS NOT NULL AND _tenant_id <> _row.tenant_id THEN
    RAISE EXCEPTION 'BOOKING_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(btrim(_title), '') = '' THEN
    RAISE EXCEPTION 'BOOKING_TITLE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- A moved-to calendar must belong to the booking's OWN tenant (no cross-tenant
  -- reassignment). NULL clears the assignment, exactly as create allows.
  IF _calendar_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.calendars c
        WHERE c.id = _calendar_id AND c.tenant_id IS NOT DISTINCT FROM _row.tenant_id
     ) THEN
    RAISE EXCEPTION 'BOOKING_BAD_CALENDAR: calendar not in this tenant' USING ERRCODE = '22023';
  END IF;

  UPDATE public.internal_bookings
     SET title       = btrim(_title),
         guest_name  = _guest_name,
         notes       = _notes,
         calendar_id = _calendar_id
   WHERE id = _booking_id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'internal_booking', 'update_internal_booking', _booking_id,
          jsonb_build_object('tenant_id', _row.tenant_id, 'calendar_id', _calendar_id));

  RETURN jsonb_build_object('ok', true, 'booking_id', _booking_id);
END $$;

REVOKE ALL ON FUNCTION public.update_internal_booking(uuid,text,text,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_internal_booking(uuid,text,text,text,uuid,uuid) TO authenticated, service_role;
