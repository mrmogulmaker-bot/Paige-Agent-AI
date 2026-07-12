-- Audit-crew blocker fixes (calendar epic).
--
-- BLOCKER 1: create_internal_booking v2 authorized on a GLOBAL admin/coach role
-- that every tenant owner holds, so a tenant operator could write bookings into
-- ANOTHER tenant's schedule and copy another tenant's client name/email via an
-- unscoped _contact_id (SECURITY DEFINER bypasses RLS). Harden: the caller must
-- be platform owner OR staff of the RESOLVED tenant; the contact and host must
-- belong to that tenant.
--
-- BLOCKER 2: the team board let a tenant admin cancel/no-show a teammate's
-- booking via a raw client-side UPDATE that RLS scopes to own rows — it hit 0
-- rows, returned no error, and falsely reported success (§13). admin_set_booking
-- _status is the tenant-gated seam that actually performs the change and reports
-- truthfully (and revokes the manage link on cancel).

CREATE OR REPLACE FUNCTION public.create_internal_booking(
  _title text, _start_at timestamptz, _end_at timestamptz,
  _timezone text DEFAULT 'UTC', _contact_id uuid DEFAULT NULL, _host_user_id uuid DEFAULT NULL,
  _guest_name text DEFAULT NULL, _guest_email text DEFAULT NULL, _notes text DEFAULT NULL,
  _location text DEFAULT NULL, _tenant_id uuid DEFAULT NULL,
  _calendar_id uuid DEFAULT NULL, _appointment_type jsonb DEFAULT NULL,
  _intake_answers jsonb DEFAULT NULL, _guest_phone text DEFAULT NULL,
  _status text DEFAULT 'scheduled', _source text DEFAULT 'paige'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(_tenant_id, public.current_user_tenant_id());
  _host uuid := COALESCE(_host_user_id, auth.uid());
  _id uuid; _gname text; _gemail text; _found boolean;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'BOOKING_FORBIDDEN: auth required' USING ERRCODE='42501'; END IF;
  -- Must be platform owner, a tenant admin of the resolved tenant, or a staff
  -- member OF that tenant. Closes the cross-tenant write hole (a global admin
  -- role alone is no longer sufficient).
  IF NOT (public.is_platform_owner()
          OR (_tenant IS NOT NULL AND public.is_tenant_admin(_tenant))
          OR (_tenant IS NOT NULL AND public.is_tenant_member(_tenant)
              AND public.has_any_role(_caller, ARRAY['admin','super_admin','coach']))) THEN
    RAISE EXCEPTION 'BOOKING_FORBIDDEN: staff of this tenant required' USING ERRCODE='42501';
  END IF;
  IF _end_at <= _start_at THEN RAISE EXCEPTION 'BOOKING_BAD_TIME: end must be after start' USING ERRCODE='22023'; END IF;
  IF COALESCE(btrim(_title), '') = '' THEN RAISE EXCEPTION 'BOOKING_TITLE_REQUIRED' USING ERRCODE='22023'; END IF;
  IF _calendar_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.calendars c WHERE c.id = _calendar_id AND c.tenant_id IS NOT DISTINCT FROM _tenant
     ) THEN
    RAISE EXCEPTION 'BOOKING_BAD_CALENDAR: calendar not in this tenant' USING ERRCODE='22023';
  END IF;
  -- A host booked on behalf of must be an active member of the resolved tenant.
  IF _host IS NOT NULL AND _host <> _caller THEN
    IF _tenant IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.tenant_members tm
          WHERE tm.tenant_id = _tenant AND tm.user_id = _host AND tm.status = 'active'
       ) THEN
      RAISE EXCEPTION 'BOOKING_BAD_HOST: host is not a member of this tenant' USING ERRCODE='22023';
    END IF;
  END IF;

  -- The contact must belong to the resolved tenant (no cross-tenant PII read).
  IF _contact_id IS NOT NULL THEN
    SELECT COALESCE(_guest_name, btrim(concat_ws(' ', first_name, last_name))), COALESCE(_guest_email, email), true
      INTO _gname, _gemail, _found
      FROM public.clients WHERE id = _contact_id AND tenant_id IS NOT DISTINCT FROM _tenant;
    IF NOT COALESCE(_found, false) THEN
      RAISE EXCEPTION 'BOOKING_BAD_CONTACT: contact not in this tenant' USING ERRCODE='22023';
    END IF;
  ELSE
    _gname := _guest_name; _gemail := _guest_email;
  END IF;

  INSERT INTO public.internal_bookings (
    tenant_id, calendar_id, host_user_id, contact_id, guest_name, guest_email, guest_phone,
    title, notes, location, start_at, end_at, timezone,
    status, source, booking_kind, appointment_type, intake_answers, reminder_state
  ) VALUES (
    _tenant, _calendar_id, _host, _contact_id, _gname, _gemail, _guest_phone,
    btrim(_title), _notes, _location, _start_at, _end_at, COALESCE(NULLIF(btrim(_timezone), ''), 'UTC'),
    COALESCE(NULLIF(btrim(_status), ''), 'scheduled'), COALESCE(NULLIF(btrim(_source), ''), 'paige'),
    'single', _appointment_type, _intake_answers, '{}'::jsonb
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'internal_booking', 'create_internal_booking', _id,
          jsonb_build_object('tenant_id', _tenant, 'host_user_id', _host, 'contact_id', _contact_id,
                             'calendar_id', _calendar_id, 'start_at', _start_at));
  RETURN _id;
END $$;

-- Tenant-gated status change for the team board (cancel / no-show / reschedule-
-- back-to-scheduled). Own-host OR tenant-admin/platform-owner of the booking's
-- tenant. Bumps manage_token_version on cancel so the guest's old link dies.
CREATE OR REPLACE FUNCTION public.admin_set_booking_status(_booking_id uuid, _status text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _host uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'BOOKING_FORBIDDEN: auth required' USING ERRCODE='42501'; END IF;
  IF _status NOT IN ('scheduled','cancelled','no_show','blocked','done') THEN
    RAISE EXCEPTION 'BOOKING_BAD_STATUS' USING ERRCODE='22023';
  END IF;
  SELECT tenant_id, host_user_id INTO _tenant, _host FROM public.internal_bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT (_host = _caller
          OR public.is_platform_owner()
          OR (_tenant IS NOT NULL AND public.is_tenant_admin(_tenant))) THEN
    RAISE EXCEPTION 'BOOKING_FORBIDDEN: cannot manage this booking' USING ERRCODE='42501';
  END IF;
  UPDATE public.internal_bookings
     SET status = _status,
         manage_token_version = CASE WHEN _status = 'cancelled' THEN manage_token_version + 1 ELSE manage_token_version END,
         updated_at = now()
   WHERE id = _booking_id;
  RETURN _booking_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_booking_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_booking_status(uuid, text) TO authenticated, service_role;
