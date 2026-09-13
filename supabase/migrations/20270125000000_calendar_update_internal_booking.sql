-- ============================================================================
-- CALENDAR: owner-side EDIT of a native booking's details (#calendar), plus a
-- §59 caller-scope hardening of the whole internal-booking mutation family.
--
-- The Solo Calendar already lets an owner CREATE (create_internal_booking),
-- CANCEL/status (admin_set_booking_status), and — newly wired in this PR — MOVE
-- (reschedule_internal_booking) a booking. It had NO seam to fix the details of
-- an existing booking (a typo in the title, the guest's name, a note, which
-- calendar it belongs to). Editing those from the client via a raw table UPDATE
-- would be scoped by RLS to the caller's own rows and would silently no-op on a
-- teammate's booking while reporting success — the exact §13 trap the sibling
-- RPCs were built to close. This adds the tenant-gated seam that performs the
-- change server-side and refuses truthfully.
--
-- AUTHORIZATION MODEL (§59 in-body caller scope — the grant is never the guard):
-- an authenticated caller may act only when they are the booking's own host, a
-- platform operator, OR an ACTIVE owner/admin/coach member OF THE BOOKING'S OWN
-- TENANT. A service-role / Paige caller (auth.uid() NULL) is trusted for the
-- tenant it resolved. Every check keys on the ROW's tenant, never on a
-- client-supplied identity and never on a tenant-agnostic GLOBAL role.
--
-- §59 GLOBAL-ROLE-TRAP FIX (applies to all three functions below). The prior
-- guard combined "caller's ACTIVE tenant = row tenant" with
-- `has_any_role(caller, admin|coach|super_admin)`. Because `user_roles` is a
-- GLOBAL table with no tenant_id, a user who is only a plain member of tenant Y
-- but who holds an admin/coach role granted in some OTHER tenant X passed the
-- role half and could edit/move a teammate's booking in Y — a cross-tenant
-- authority leak (§9). Conversely a tenant owner without a global row could be
-- refused. The fix replaces the global-role predicate with a tenant-scoped
-- membership check on `tenant_members` keyed on the ROW's tenant, exactly the
-- `role IN ('owner','admin','coach')` shape used elsewhere in the schema.
--
-- §37 PRODUCER INVENTORY (verified before tightening the two shipped siblings):
-- the ONLY runtime caller of reschedule_internal_booking is this PR's own
-- useSoloCalendar.reschedule (the surface that first exposes it); update's only
-- caller is useSoloCalendar.edit (new here); cancel_internal_booking has NO
-- runtime caller at all (the Solo cancel path goes through
-- admin_set_booking_status). No edge function, pg_cron, MCP tool, webhook, CI
-- script, or other UI invokes any of the three. The one legitimate caller (a
-- Solo owner, i.e. an 'owner' member of their own tenant) still passes; the only
-- path removed is the illegitimate cross-tenant one. This is a security fix, not
-- a capability removal (§58).
--
-- DELIBERATELY NARROW (update): it touches title, guest_name, notes and
-- calendar_id ONLY. start_at / end_at / status are untouched, so this fires NO
-- false booking.rescheduled or booking.cancelled Rail event — the
-- emit_booking_rail trigger keys on a real start_at move or a transition into
-- cancelled, and a details edit is neither. Moving time stays
-- reschedule_internal_booking's job; cancelling stays admin_set_booking_status's.
-- One capability, one seam (§18).
--
-- §2: zero finance content — a generic booking-detail edit. Granted to
-- authenticated + service_role only; anon is explicitly revoked.
-- ============================================================================

-- ── EDIT: fix a booking's details (new seam) ─────────────────────────────────
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

  -- Caller scope — tenant-scoped (§59): host, platform operator, or an active
  -- owner/admin/coach member of the BOOKING'S OWN tenant. Never a global role.
  IF _caller IS NOT NULL THEN
    IF NOT (
      public.is_platform_owner()
      OR _row.host_user_id = _caller
      OR EXISTS (
           SELECT 1 FROM public.tenant_members m
            WHERE m.tenant_id = _row.tenant_id
              AND m.user_id = _caller
              AND m.status = 'active'
              AND m.role IN ('owner','admin','coach')
         )
    ) THEN
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

-- ── CANCEL: §59 tenant-scoped guard (was global-role) ────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_internal_booking(_booking_id uuid, _reason text DEFAULT NULL, _tenant_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _row public.internal_bookings%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.internal_bookings WHERE id=_booking_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF _caller IS NOT NULL THEN
    IF NOT (
      public.is_platform_owner()
      OR _row.host_user_id = _caller
      OR EXISTS (
           SELECT 1 FROM public.tenant_members m
            WHERE m.tenant_id = _row.tenant_id AND m.user_id = _caller
              AND m.status = 'active' AND m.role IN ('owner','admin','coach')
         )
    ) THEN RAISE EXCEPTION 'BOOKING_FORBIDDEN: admin, coach, or host required' USING ERRCODE='42501'; END IF;
  ELSIF _tenant_id IS NOT NULL AND _tenant_id <> _row.tenant_id THEN RAISE EXCEPTION 'BOOKING_FORBIDDEN: tenant mismatch' USING ERRCODE='42501'; END IF;

  UPDATE public.internal_bookings SET status='cancelled', cancelled_at=now(), cancelled_by=_caller, cancellation_reason=_reason WHERE id=_booking_id;
  INSERT INTO public.audit_logs(user_id, entity, action, entity_id, data)
  VALUES (_caller,'internal_booking','cancel_internal_booking',_booking_id, jsonb_build_object('tenant_id',_row.tenant_id,'reason',_reason));
  RETURN jsonb_build_object('ok',true,'booking_id',_booking_id,'status','cancelled');
END $$;

REVOKE ALL ON FUNCTION public.cancel_internal_booking(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_internal_booking(uuid,text,uuid) TO authenticated, service_role;

-- ── RESCHEDULE (MOVE): §59 tenant-scoped guard (was global-role) ──────────────
CREATE OR REPLACE FUNCTION public.reschedule_internal_booking(_booking_id uuid, _start_at timestamptz, _end_at timestamptz, _tenant_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _row public.internal_bookings%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.internal_bookings WHERE id=_booking_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF _caller IS NOT NULL THEN
    IF NOT (
      public.is_platform_owner()
      OR _row.host_user_id = _caller
      OR EXISTS (
           SELECT 1 FROM public.tenant_members m
            WHERE m.tenant_id = _row.tenant_id AND m.user_id = _caller
              AND m.status = 'active' AND m.role IN ('owner','admin','coach')
         )
    ) THEN RAISE EXCEPTION 'BOOKING_FORBIDDEN: admin, coach, or host required' USING ERRCODE='42501'; END IF;
  ELSIF _tenant_id IS NOT NULL AND _tenant_id <> _row.tenant_id THEN RAISE EXCEPTION 'BOOKING_FORBIDDEN: tenant mismatch' USING ERRCODE='42501'; END IF;
  IF _end_at <= _start_at THEN RAISE EXCEPTION 'BOOKING_BAD_TIME: end must be after start' USING ERRCODE='22023'; END IF;

  UPDATE public.internal_bookings SET start_at=_start_at, end_at=_end_at WHERE id=_booking_id;
  INSERT INTO public.audit_logs(user_id, entity, action, entity_id, data)
  VALUES (_caller,'internal_booking','reschedule_internal_booking',_booking_id, jsonb_build_object('tenant_id',_row.tenant_id,'start_at',_start_at));
  RETURN jsonb_build_object('ok',true,'booking_id',_booking_id,'start_at',_start_at,'end_at',_end_at);
END $$;

REVOKE ALL ON FUNCTION public.reschedule_internal_booking(uuid,timestamptz,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_internal_booking(uuid,timestamptz,timestamptz,uuid) TO authenticated, service_role;
