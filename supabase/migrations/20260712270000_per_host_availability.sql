-- Per-host availability (#48a) — each host on a calendar's roster may keep their
-- OWN weekly hours + timezone, falling back to the calendar's when unset.
--
-- Until now availability lived only on `calendars` (availability_json + timezone),
-- shared by every host on the roster. That's wrong for real teams: a round-robin
-- pool where each rep works different hours, or a collective panel spanning
-- timezones, could only be described with one shared schedule. These two nullable
-- columns let a host override just their hours/timezone; NULL means "inherit the
-- calendar's" — so every existing roster keeps booking EXACTLY as before (the
-- columns are added NULL, and the engine treats NULL as inherit).
--
-- Only availability_json + timezone are per-host. Duration, buffers, minimum
-- notice, booking horizon, and date-specific overrides stay calendar-level and
-- shared — a host's custom hours are their weekly pattern, nothing else.

ALTER TABLE public.calendar_hosts
  ADD COLUMN IF NOT EXISTS availability_json jsonb,
  ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.calendar_hosts.availability_json IS
  'Per-host weekly windows [{day,start,end}]. NULL = inherit calendars.availability_json. An empty array means the host keeps no hours on this calendar (offered no slots), which is distinct from NULL/inherit.';
COMMENT ON COLUMN public.calendar_hosts.timezone IS
  'Per-host IANA timezone for interpreting availability_json. NULL = inherit calendars.timezone.';

-- Rewrite set_calendar_hosts to accept + persist per-host availability + timezone
-- alongside user_id/priority. Still one atomic replace-all in the given order,
-- still gated on can_manage_calendar with tenant-membership validation — the only
-- change is that each roster element may now carry optional availability_json /
-- timezone, and absent/invalid values persist as NULL (inherit).
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
  -- Per-host availability_json is only stored when it's a JSON array (else NULL =
  -- inherit); timezone is trimmed to NULL when blank. DISTINCT ON keeps the first
  -- occurrence per user (lowest ordinal), carrying its availability/timezone.
  DELETE FROM public.calendar_hosts WHERE calendar_id = _cal;
  INSERT INTO public.calendar_hosts (calendar_id, user_id, priority, availability_json, timezone)
  SELECT DISTINCT ON ((h->>'user_id')::uuid)
         _cal,
         (h->>'user_id')::uuid,
         (ord - 1)::int,
         CASE WHEN jsonb_typeof(h->'availability_json') = 'array' THEN h->'availability_json' ELSE NULL END,
         NULLIF(btrim(h->>'timezone'), '')
    FROM jsonb_array_elements(_hosts) WITH ORDINALITY AS t(h, ord)
   ORDER BY (h->>'user_id')::uuid, ord;
END $$;

REVOKE ALL ON FUNCTION public.set_calendar_hosts(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_calendar_hosts(uuid, jsonb) TO authenticated, service_role;
