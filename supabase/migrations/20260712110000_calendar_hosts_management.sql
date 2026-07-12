-- Host-roster management as a governable RPC seam (§10) + round-robin strategy.
--
-- Roster mutations used to be direct calendar_hosts table CRUD trapped in the
-- UI (Paige couldn't add a host from chat), and the priority reorder fired N
-- parallel UPDATEs (non-atomic — a partial failure left duplicate priorities).
-- set_calendar_hosts replaces the whole roster in one transaction, in the given
-- order, gated on can_manage_calendar. calendar_host_load powers the owner's
-- "is round-robin balanced?" view. assignment_strategy picks the rotation mode.

ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS assignment_strategy jsonb NOT NULL DEFAULT '{"mode":"balanced"}'::jsonb;

CREATE OR REPLACE FUNCTION public.set_calendar_hosts(_cal uuid, _hosts jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid; _bad int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CALENDAR_FORBIDDEN: auth required' USING ERRCODE='42501'; END IF;
  IF NOT public.can_manage_calendar(_cal) THEN RAISE EXCEPTION 'CALENDAR_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _hosts IS NULL OR jsonb_typeof(_hosts) <> 'array' OR jsonb_array_length(_hosts) < 1 THEN
    RAISE EXCEPTION 'HOSTS_REQUIRED: at least one host' USING ERRCODE='22023';
  END IF;

  SELECT tenant_id INTO _tenant FROM public.calendars WHERE id = _cal;

  -- Every proposed host must be an active member of the calendar's tenant
  -- (platform/null-tenant calendars skip this — their pool is platform staff).
  IF _tenant IS NOT NULL THEN
    SELECT count(*) INTO _bad
      FROM jsonb_array_elements(_hosts) h
     WHERE NOT EXISTS (
       SELECT 1 FROM public.tenant_members tm
        WHERE tm.tenant_id = _tenant
          AND tm.user_id = (h->>'user_id')::uuid
          AND tm.status = 'active'
     );
    IF _bad > 0 THEN
      RAISE EXCEPTION 'HOST_NOT_ELIGIBLE: % host(s) are not active members of this tenant', _bad USING ERRCODE='22023';
    END IF;
  END IF;

  -- Atomic replace: array order IS the priority (0..n-1), always contiguous.
  DELETE FROM public.calendar_hosts WHERE calendar_id = _cal;
  INSERT INTO public.calendar_hosts (calendar_id, user_id, priority)
  SELECT DISTINCT ON ((h->>'user_id')::uuid) _cal, (h->>'user_id')::uuid, (ord - 1)::int
    FROM jsonb_array_elements(_hosts) WITH ORDINALITY AS t(h, ord)
   ORDER BY (h->>'user_id')::uuid, ord;
END $$;

REVOKE ALL ON FUNCTION public.set_calendar_hosts(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_calendar_hosts(uuid, jsonb) TO authenticated, service_role;

-- Per-host upcoming-load stats so the owner can see round-robin balance and
-- spot a starved/overloaded host. Counts a host's own upcoming, non-cancelled
-- bookings (global, matching how public-booking's fairness actually counts).
CREATE OR REPLACE FUNCTION public.calendar_host_load(_cal uuid)
RETURNS TABLE (user_id uuid, full_name text, priority integer, upcoming_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_calendar(_cal) THEN RAISE EXCEPTION 'CALENDAR_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN QUERY
    SELECT ch.user_id, p.full_name, ch.priority,
           (SELECT count(*) FROM public.internal_bookings b
             WHERE b.host_user_id = ch.user_id
               AND b.status NOT IN ('cancelled','no_show')
               AND b.start_at >= now()) AS upcoming_count
      FROM public.calendar_hosts ch
      LEFT JOIN public.profiles p ON p.user_id = ch.user_id
     WHERE ch.calendar_id = _cal
     ORDER BY ch.priority ASC;
END $$;

REVOKE ALL ON FUNCTION public.calendar_host_load(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_host_load(uuid) TO authenticated, service_role;
