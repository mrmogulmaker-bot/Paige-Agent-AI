-- ============================================================================
-- CALENDAR: booking-preset Draft → Publish lifecycle + the canonical server seam
-- both the Settings UI and Paige's chat capability drive (§10 callable seam).
--
-- WHY THIS EXISTS
-- A booking preset (a `calendars` row with a public `/book/:slug` page) is made
-- publicly bookable by exactly one fact today: `calendars.enabled = true` plus at
-- least one host (public-booking/index.ts gates on `cal.enabled !== true`). There
-- is no draft/published/status column anywhere. And there is NO create/edit/
-- publish/pause RPC — the Settings surface writes the `calendars` table DIRECTLY
-- through the "manage calendars" RLS policy, and its create path (createCalendar)
-- inserts `enabled:false` then FLIPS it to `enabled:true` the moment a host row
-- exists. The consequence the owner flagged: a freshly-created preset's public
-- booking link goes LIVE on creation, with no explicit "publish" step and no
-- server-side check that the page can actually take a booking.
--
-- Two things this migration establishes, server-side (never UI-only), so the fix
-- cannot be bypassed by Paige, the MCP door, or a direct table write:
--   1. DRAFT BY DEFAULT. `create_calendar_preset` inserts `enabled = false` and
--      never flips it. A new preset is a private draft; its `/book/:slug` returns
--      404 (the resolver already refuses `enabled <> true`).
--   2. EXPLICIT, VALIDATED PUBLISH. `publish_calendar_preset` is the ONLY seam
--      that sets `enabled = true`, and it refuses unless the page can honestly take
--      a booking: the caller may manage it, it has enough eligible hosts for its
--      scheduling model, it has at least one open window, and it has a usable
--      meeting method. Pausing (`pause_calendar_preset`) sets `enabled = false`
--      again but keeps `published_at`, which is what tells a paused preset from a
--      never-published draft.
--
-- THE LIFECYCLE, expressed WITHOUT a second source of truth (§57). `enabled` stays
-- the authoritative bookability gate the resolver reads. `published_at` (added
-- here, nullable) records only whether the preset has ever been published:
--     Live   = enabled = true
--     Paused = enabled = false AND published_at IS NOT NULL
--     Draft  = enabled = false AND published_at IS NULL
--     "Ready to publish" is derived (Draft|Paused that would pass publish
--     validation) and is never stored — a computed state cannot drift.
--
-- SCOPE / NON-GOALS (honest, §13/§58):
--   • This is the Solo Settings → Connections → Calendars seam. The legacy admin
--     builder `components/admin/calendar/CalendarsPanel.tsx` (agency tier) is a
--     SECOND, pre-existing minter that inserts `enabled:true` live-on-create with
--     its own inline builder. Reconciling it onto these RPCs is a separate,
--     tracked follow-up — NOT silently done here. `published_at` is additive and
--     nullable, so that panel keeps working unchanged (it neither selects nor
--     writes the column; its live rows read as Live because `enabled` wins).
--   • `provision_tenant_default_calendar` still creates each tenant's default
--     "Meetings" calendar `enabled:true` (born live). That is the system default,
--     a different flow from a user clicking "New booking preset", and is left as-is
--     pending an owner ruling — flagged, not changed.
--   • This lands the FU-2 (server-authorized preset-config WRITE) and FU-3 (Rail/
--     audit provenance) SUBSET of docs/doctrine/calendar-capability-contract.md.
--     FU-1 (the full per-capability Trust-Compass clamp) still depends on the
--     §67/§68 autonomy architecture and remains owed.
--
-- AUTHORIZATION MODEL (§59 — the grant is never the guard). Every function
-- re-enforces the caller's scope IN-BODY:
--   • An authenticated caller (auth.uid() present) must satisfy the SAME rule the
--     "manage calendars" RLS policy uses — `can_manage_calendar(_cal)` for an
--     existing row (creator / platform admin / tenant admin), and for create the
--     RLS WITH CHECK shape (platform admin, tenant admin, or a tenant member
--     creating their own). Nothing here trusts a client-supplied identity.
--   • A service-role / Paige caller (auth.uid() IS NULL) is trusted ONLY for the
--     tenant it already resolved and passed as `_tenant`; a `_tenant` that does not
--     match the row's tenant is refused. This is the exact pattern the internal-
--     booking RPC family uses.
--
-- §2: zero finance content — a generic scheduling seam. anon is explicitly
-- REVOKEd on every function; authenticated + service_role only.
-- ============================================================================

-- ── 1. published_at: the one additive lifecycle column ──────────────────────
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

COMMENT ON COLUMN public.calendars.published_at IS
  'When this booking preset was first made public. NULL = never published (Draft). '
  'Set on publish and preserved across pause, so a paused preset (enabled=false, '
  'published_at set) is distinguishable from a never-published draft. `enabled` '
  'remains the authoritative bookability gate; this column never gates a booking.';

-- Backfill: a row that is already enabled has, by definition, been published.
-- created_at is the honest lower-bound proxy (we do not know the real first-publish
-- instant for historical rows; it is at least this old), and never now() — which
-- would falsely claim they were all published at migration time.
UPDATE public.calendars
   SET published_at = created_at
 WHERE enabled = true AND published_at IS NULL;

-- ── 2. Shared internal helper: does this caller pass the manage gate? ────────
-- Both an authenticated manage check and the service-role trusted-tenant check,
-- in one place, so all four RPCs enforce identical scope. Returns the resolved
-- tenant on success; RAISES 42501 on refusal and P0002 when the row is absent.
CREATE OR REPLACE FUNCTION public._assert_can_manage_preset(_cal uuid, _tenant uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tid uuid; _exists boolean;
BEGIN
  SELECT tenant_id, true INTO _tid, _exists FROM public.calendars WHERE id = _cal;
  IF NOT COALESCE(_exists, false) THEN
    RAISE EXCEPTION 'PRESET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF _caller IS NOT NULL THEN
    -- Authenticated: exactly the "manage calendars" authority (creator / platform
    -- admin / tenant admin), evaluated in-body — never the EXECUTE grant.
    IF NOT public.can_manage_calendar(_cal) THEN
      RAISE EXCEPTION 'PRESET_FORBIDDEN: manage permission required' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Service-role / Paige: trusted only for the tenant it resolved and named.
    IF _tenant IS NULL OR _tenant IS DISTINCT FROM _tid THEN
      RAISE EXCEPTION 'PRESET_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN _tid;
END $$;

REVOKE ALL ON FUNCTION public._assert_can_manage_preset(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_can_manage_preset(uuid, uuid) TO authenticated, service_role;

-- ── 2b. The publish bar, in ONE place (§18): can this preset honestly take a
-- booking? Returns NULL when it can, else the first blocker's tagged reason.
-- Both publish (which refuses) and update (which auto-pauses a Live preset that
-- an edit pushes below the bar) call it, so the "a Live page must be bookable"
-- invariant cannot be enforced in one write path and forgotten in the other.
--
-- It validates the jsonb SHAPES rather than trusting them (a non-UI writer could
-- store a malformed window or a bare `ask_invitee` with no options): a window
-- must be zero-padded HH:MM with start < end; a method must be a CONCRETE one
-- (`ask_invitee` is not a method by itself — it needs at least one real option).
-- Internal helper: REVOKEd from anon/PUBLIC and not granted to authenticated, so
-- it cannot be used to probe another tenant's config (no caller-scope check here —
-- its callers do that). It runs as owner, so its callers (also DEFINER) reach it.
CREATE OR REPLACE FUNCTION public._calendar_preset_block_reason(_cal uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE _row public.calendars%ROWTYPE; _hosts int; _min_hosts int; _has_window boolean; _has_method boolean;
BEGIN
  SELECT * INTO _row FROM public.calendars WHERE id = _cal;
  IF _row.id IS NULL THEN RETURN 'PRESET_NOT_FOUND: preset does not exist'; END IF;

  SELECT count(*) INTO _hosts FROM public.calendar_hosts WHERE calendar_id = _cal;
  _min_hosts := CASE WHEN _row.type IN ('round_robin', 'collective') THEN 2 ELSE 1 END;
  IF _hosts < _min_hosts THEN
    RETURN format('PRESET_NEEDS_HOSTS: this scheduling model needs at least %s host(s); %s assigned', _min_hosts, _hosts);
  END IF;

  _has_window :=
    (jsonb_typeof(_row.availability_json) = 'array' AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(_row.availability_json) w
        WHERE (w->>'start') ~ '^\d{2}:\d{2}$' AND (w->>'end') ~ '^\d{2}:\d{2}$' AND (w->>'start') < (w->>'end')))
    OR (jsonb_typeof(_row.date_overrides) = 'array' AND EXISTS (
       SELECT 1
         FROM jsonb_array_elements(_row.date_overrides) o,
              jsonb_array_elements(CASE WHEN jsonb_typeof(o->'windows') = 'array' THEN o->'windows' ELSE '[]'::jsonb END) w
        WHERE COALESCE((o->>'blocked')::boolean, false) = false
          AND (w->>'start') ~ '^\d{2}:\d{2}$' AND (w->>'end') ~ '^\d{2}:\d{2}$' AND (w->>'start') < (w->>'end')));
  IF NOT _has_window THEN
    RETURN 'PRESET_NO_HOURS: add at least one open window before publishing';
  END IF;

  -- A CONCRETE, deliverable method. phone/in_person/custom are always usable; the
  -- provider methods (google_meet/zoom) are too — the resolver labels them "link
  -- to follow" honestly when unconnected. `ask_invitee` alone is NOT a method: it
  -- needs at least one concrete option to offer, or the page asks the guest to
  -- pick from nothing.
  _has_method :=
    (jsonb_typeof(_row.location_options) = 'array' AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(_row.location_options) m
        WHERE (m->>'type') IN ('google_meet','zoom','phone','in_person','custom')))
    OR COALESCE(_row.location_type, '') IN ('google_meet','zoom','phone','in_person','custom');
  IF NOT _has_method THEN
    RETURN 'PRESET_NO_METHOD: choose how the meeting happens before publishing';
  END IF;

  RETURN NULL;  -- publishable
END $$;

REVOKE ALL ON FUNCTION public._calendar_preset_block_reason(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. CREATE: a booking preset as a DRAFT (enabled=false), never live ───────
-- `_patch` is the same object the client's buildCalendarPatch() produces and the
-- Settings surface has always inserted; here it is applied through a fixed column
-- allowlist so no unexpected column (least of all `enabled`, `published_at`,
-- `tenant_id`, `slug`, `created_by`) can be smuggled in from the patch. Missing
-- keys fall back to the table's own defaults. The creator is registered as the
-- first host (priority 0) so the draft is immediately configurable and publishable,
-- exactly as createCalendar did — minus the go-live flip.
CREATE OR REPLACE FUNCTION public.create_calendar_preset(
  _tenant uuid,
  _slug text,
  _patch jsonb DEFAULT '{}'::jsonb,
  _created_by uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _creator uuid; _cal uuid;
BEGIN
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'PRESET_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(_slug), '') = '' THEN
    RAISE EXCEPTION 'PRESET_SLUG_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Caller scope — mirror the "manage calendars" WITH CHECK for a NEW row: a
  -- platform admin, a tenant admin, or a tenant member creating their own. A
  -- service-role caller is trusted for the tenant it named and must supply the
  -- creator to register as host (auth.uid() is NULL for it).
  _creator := COALESCE(_caller, _created_by);
  IF _caller IS NOT NULL THEN
    IF NOT (
      public.is_platform_admin()
      OR public.is_tenant_admin(_tenant)
      OR public.is_tenant_member(_tenant)
    ) THEN
      RAISE EXCEPTION 'PRESET_FORBIDDEN: membership required' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF _creator IS NULL THEN
      RAISE EXCEPTION 'PRESET_CREATOR_REQUIRED' USING ERRCODE = '22023';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.calendars (
      tenant_id, slug, created_by, enabled, published_at,
      type, title, description, color, accent, logo_url,
      duration_min, buffer_before_min, buffer_after_min, min_notice_min,
      booking_horizon_days, capacity, redirect_url, timezone, availability_json,
      group_id, theme, subtitle, show_company_name,
      location_options, location_type, location_value,
      intake_questions, appointment_types, date_overrides, notify_config, assignment_strategy
    )
    VALUES (
      _tenant, btrim(_slug), _creator, false, NULL,
      COALESCE(NULLIF(_patch->>'type', ''), 'personal'),
      _patch->>'title', _patch->>'description', _patch->>'color', _patch->>'accent', _patch->>'logo_url',
      COALESCE((_patch->>'duration_min')::int, 30),
      COALESCE((_patch->>'buffer_before_min')::int, 0),
      COALESCE((_patch->>'buffer_after_min')::int, 0),
      COALESCE((_patch->>'min_notice_min')::int, 60),
      COALESCE((_patch->>'booking_horizon_days')::int, 60),
      COALESCE((_patch->>'capacity')::int, 8),
      NULLIF(btrim(COALESCE(_patch->>'redirect_url', '')), ''),
      COALESCE(NULLIF(_patch->>'timezone', ''), 'America/New_York'),
      _patch->'availability_json',
      NULLIF(_patch->>'group_id', '')::uuid,
      COALESCE(NULLIF(_patch->>'theme', ''), 'light'),
      _patch->>'subtitle',
      COALESCE((_patch->>'show_company_name')::boolean, true),
      COALESCE(_patch->'location_options', '[{"type":"phone","value":null}]'::jsonb),
      COALESCE(NULLIF(_patch->>'location_type', ''), 'phone'),
      _patch->>'location_value',
      COALESCE(_patch->'intake_questions', '[]'::jsonb),
      COALESCE(_patch->'appointment_types', '[]'::jsonb),
      COALESCE(_patch->'date_overrides', '[]'::jsonb),
      COALESCE(_patch->'notify_config',
        '{"confirm_guest":true,"confirm_host":true,"reminders":[{"channel":"email","offset_min":1440}]}'::jsonb),
      COALESCE(_patch->'assignment_strategy', '{"mode":"balanced"}'::jsonb)
    )
    RETURNING id INTO _cal;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'PRESET_SLUG_TAKEN: that booking link is already in use' USING ERRCODE = '23505';
  END;

  -- Register the creator as the first host so the draft can be configured and,
  -- once ready, published. A preset with no host cannot be published (see publish).
  INSERT INTO public.calendar_hosts (calendar_id, user_id, priority)
  VALUES (_cal, _creator, 0)
  ON CONFLICT (calendar_id, user_id) DO NOTHING;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'calendar_preset', 'create_calendar_preset', _cal,
          jsonb_build_object('tenant_id', _tenant, 'slug', btrim(_slug), 'status', 'draft'));

  RETURN jsonb_build_object('ok', true, 'calendar_id', _cal, 'enabled', false, 'status', 'draft');
END $$;

REVOKE ALL ON FUNCTION public.create_calendar_preset(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_calendar_preset(uuid, text, jsonb, uuid) TO authenticated, service_role;

-- ── 4. UPDATE: apply a config patch to a preset (never its lifecycle) ────────
-- A true partial update: only keys PRESENT in `_patch` change, so the same seam
-- serves the Settings surface (which sends the full buildCalendarPatch) and Paige
-- (which may send only the fields she is changing). `enabled`, `published_at`,
-- `tenant_id`, `slug` and `created_by` are NEVER writable here — publish/pause own
-- the lifecycle, and identity is fixed at create.
CREATE OR REPLACE FUNCTION public.update_calendar_preset(
  _cal uuid,
  _patch jsonb,
  _tenant uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tid uuid; _was_enabled boolean; _block text;
BEGIN
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'PRESET_BAD_PATCH: object required' USING ERRCODE = '22023';
  END IF;
  _tid := public._assert_can_manage_preset(_cal, _tenant);

  -- Guard the one raw ::uuid cast in the UPDATE below. A non-UI writer (Paige, a
  -- direct call) could send a malformed group_id; without this the cast surfaces an
  -- unhandled 22P02 instead of a tagged reason. A present-but-empty group_id NULLs
  -- the group (intentional), so only a present NON-empty malformed value is refused.
  IF (_patch ? 'group_id') AND COALESCE(_patch->>'group_id', '') <> ''
     AND (_patch->>'group_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'PRESET_BAD_GROUP: group_id must be a valid id' USING ERRCODE = '22023';
  END IF;

  SELECT enabled INTO _was_enabled FROM public.calendars WHERE id = _cal;

  UPDATE public.calendars SET
    type              = CASE WHEN _patch ? 'type'              THEN COALESCE(NULLIF(_patch->>'type',''), type) ELSE type END,
    title             = CASE WHEN _patch ? 'title'             THEN _patch->>'title' ELSE title END,
    description       = CASE WHEN _patch ? 'description'       THEN _patch->>'description' ELSE description END,
    color             = CASE WHEN _patch ? 'color'             THEN _patch->>'color' ELSE color END,
    accent            = CASE WHEN _patch ? 'accent'            THEN _patch->>'accent' ELSE accent END,
    logo_url          = CASE WHEN _patch ? 'logo_url'          THEN _patch->>'logo_url' ELSE logo_url END,
    duration_min      = CASE WHEN _patch ? 'duration_min'      THEN COALESCE((_patch->>'duration_min')::int, duration_min) ELSE duration_min END,
    buffer_before_min = CASE WHEN _patch ? 'buffer_before_min' THEN COALESCE((_patch->>'buffer_before_min')::int, buffer_before_min) ELSE buffer_before_min END,
    buffer_after_min  = CASE WHEN _patch ? 'buffer_after_min'  THEN COALESCE((_patch->>'buffer_after_min')::int, buffer_after_min) ELSE buffer_after_min END,
    min_notice_min    = CASE WHEN _patch ? 'min_notice_min'    THEN COALESCE((_patch->>'min_notice_min')::int, min_notice_min) ELSE min_notice_min END,
    booking_horizon_days = CASE WHEN _patch ? 'booking_horizon_days' THEN COALESCE((_patch->>'booking_horizon_days')::int, booking_horizon_days) ELSE booking_horizon_days END,
    capacity          = CASE WHEN _patch ? 'capacity'          THEN COALESCE((_patch->>'capacity')::int, capacity) ELSE capacity END,
    redirect_url      = CASE WHEN _patch ? 'redirect_url'      THEN NULLIF(btrim(COALESCE(_patch->>'redirect_url','')), '') ELSE redirect_url END,
    timezone          = CASE WHEN _patch ? 'timezone'          THEN COALESCE(NULLIF(_patch->>'timezone',''), timezone) ELSE timezone END,
    availability_json = CASE WHEN _patch ? 'availability_json' THEN _patch->'availability_json' ELSE availability_json END,
    group_id          = CASE WHEN _patch ? 'group_id'          THEN NULLIF(_patch->>'group_id','')::uuid ELSE group_id END,
    theme             = CASE WHEN _patch ? 'theme'             THEN COALESCE(NULLIF(_patch->>'theme',''), theme) ELSE theme END,
    subtitle          = CASE WHEN _patch ? 'subtitle'          THEN _patch->>'subtitle' ELSE subtitle END,
    show_company_name = CASE WHEN _patch ? 'show_company_name' THEN COALESCE((_patch->>'show_company_name')::boolean, show_company_name) ELSE show_company_name END,
    location_options  = CASE WHEN _patch ? 'location_options'  THEN COALESCE(_patch->'location_options', location_options) ELSE location_options END,
    location_type     = CASE WHEN _patch ? 'location_type'     THEN COALESCE(NULLIF(_patch->>'location_type',''), location_type) ELSE location_type END,
    location_value    = CASE WHEN _patch ? 'location_value'    THEN _patch->>'location_value' ELSE location_value END,
    intake_questions  = CASE WHEN _patch ? 'intake_questions'  THEN COALESCE(_patch->'intake_questions', intake_questions) ELSE intake_questions END,
    appointment_types = CASE WHEN _patch ? 'appointment_types' THEN COALESCE(_patch->'appointment_types', appointment_types) ELSE appointment_types END,
    date_overrides    = CASE WHEN _patch ? 'date_overrides'    THEN COALESCE(_patch->'date_overrides', date_overrides) ELSE date_overrides END,
    notify_config     = CASE WHEN _patch ? 'notify_config'     THEN COALESCE(_patch->'notify_config', notify_config) ELSE notify_config END,
    assignment_strategy = CASE WHEN _patch ? 'assignment_strategy' THEN COALESCE(_patch->'assignment_strategy', assignment_strategy) ELSE assignment_strategy END,
    updated_at        = now()
  WHERE id = _cal;

  -- Auto-pause honesty gate (§13/§32). publish is the ONLY seam that turns a preset
  -- Live, but an edit to an ALREADY-live preset could push it below the publish bar
  -- (drop its last host, blank its hours, remove its only method) and — without this
  -- — leave a Live public page that shows a guest nothing bookable. So when the row
  -- was Live, re-run the SAME bar publish uses (§18) and, if it now fails, take it
  -- off the air: enabled=false, published_at preserved, so it reads as Paused (not
  -- Draft) and the owner is told why. A valid edit to a Live preset stays Live.
  IF COALESCE(_was_enabled, false) THEN
    _block := public._calendar_preset_block_reason(_cal);
    IF _block IS NOT NULL THEN
      UPDATE public.calendars SET enabled = false WHERE id = _cal;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'calendar_preset', 'update_calendar_preset', _cal,
          jsonb_build_object('tenant_id', _tid,
                             'keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(_patch) k),
                             'auto_paused', (_block IS NOT NULL),
                             'reason', _block));

  RETURN jsonb_build_object('ok', true, 'calendar_id', _cal,
                            'auto_paused', (_block IS NOT NULL), 'reason', _block);
END $$;

REVOKE ALL ON FUNCTION public.update_calendar_preset(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_calendar_preset(uuid, jsonb, uuid) TO authenticated, service_role;

-- ── 5. PUBLISH: the ONLY seam that makes a preset publicly bookable ──────────
-- Refuses unless the page can HONESTLY take a booking. The scheduling-model host
-- floor is the §13/§32 honesty gate the pack itself draws ("Needs 3 host
-- calendars"): the public resolver only treats round_robin/collective as such
-- when there is more than one host, so publishing one with a single host would
-- present a team page that silently behaves as one-on-one. Returns a structured
-- reason on refusal so the surface can tell the owner exactly what is missing.
CREATE OR REPLACE FUNCTION public.publish_calendar_preset(_cal uuid, _tenant uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tid uuid; _block text; _type text; _hosts int; _pub timestamptz;
BEGIN
  _tid := public._assert_can_manage_preset(_cal, _tenant);

  -- The ONE publish bar (§18): the EXACT same check update_calendar_preset re-runs to
  -- auto-pause a Live preset. Enforcing "a public page can honestly take a booking"
  -- in one place is what keeps the two write paths from drifting — a preset can never
  -- become Live through publish under a rule the auto-pause gate would then violate.
  -- The helper is stricter than the old inline check on purpose (§13): it validates
  -- HH:MM window shapes and refuses a bare `ask_invitee` with no concrete option.
  _block := public._calendar_preset_block_reason(_cal);
  IF _block IS NOT NULL THEN
    RAISE EXCEPTION '%', _block USING ERRCODE = '22023';
  END IF;

  SELECT type, published_at INTO _type, _pub FROM public.calendars WHERE id = _cal FOR UPDATE;
  SELECT count(*) INTO _hosts FROM public.calendar_hosts WHERE calendar_id = _cal;
  _pub := COALESCE(_pub, now());
  UPDATE public.calendars
     SET enabled = true, published_at = _pub, updated_at = now()
   WHERE id = _cal;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'calendar_preset', 'publish_calendar_preset', _cal,
          jsonb_build_object('tenant_id', _tid, 'hosts', _hosts, 'type', _type));

  RETURN jsonb_build_object('ok', true, 'calendar_id', _cal, 'enabled', true,
                            'status', 'live', 'published_at', _pub);
END $$;

REVOKE ALL ON FUNCTION public.publish_calendar_preset(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_calendar_preset(uuid, uuid) TO authenticated, service_role;

-- ── 6. PAUSE: take a live preset off the air (keeps published_at) ────────────
CREATE OR REPLACE FUNCTION public.pause_calendar_preset(_cal uuid, _tenant uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tid uuid; _pub timestamptz;
BEGIN
  _tid := public._assert_can_manage_preset(_cal, _tenant);
  UPDATE public.calendars SET enabled = false, updated_at = now()
   WHERE id = _cal
   RETURNING published_at INTO _pub;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'calendar_preset', 'pause_calendar_preset', _cal,
          jsonb_build_object('tenant_id', _tid));

  RETURN jsonb_build_object('ok', true, 'calendar_id', _cal, 'enabled', false,
                            'status', CASE WHEN _pub IS NOT NULL THEN 'paused' ELSE 'draft' END);
END $$;

REVOKE ALL ON FUNCTION public.pause_calendar_preset(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_calendar_preset(uuid, uuid) TO authenticated, service_role;

-- ── 7. READ: a tenant's presets with their derived lifecycle ─────────────────
-- The truthful-readback path (§13): the create/publish/pause RPCs return ids and
-- status, not rows, so Paige (and any governed caller) needs a scoped read to
-- list what exists and echo the saved draft back. It returns only safe projection
-- fields — never provider secrets or raw config — and derives the lifecycle label
-- from `enabled` + `published_at`, the same rule the UI uses. Tenant-scoped in body
-- (§9/§59): an authenticated caller must belong to the tenant; a service-role
-- caller is trusted for the tenant it names and reads only that tenant's rows.
CREATE OR REPLACE FUNCTION public.get_calendar_presets(_tenant uuid)
RETURNS TABLE (
  id uuid, slug text, title text, type text, duration_min int, capacity int,
  enabled boolean, published_at timestamptz, host_count int, lifecycle text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'PRESET_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _caller IS NOT NULL THEN
    IF NOT (
      public.is_platform_admin()
      OR public.is_tenant_admin(_tenant)
      OR public.is_tenant_member(_tenant)
    ) THEN
      RAISE EXCEPTION 'PRESET_FORBIDDEN: membership required' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- Service-role callers (auth.uid() NULL) are trusted for the tenant they name;
  -- the WHERE clause scopes the read to that tenant, so nothing else is exposed.
  RETURN QUERY
    SELECT c.id, c.slug, c.title, c.type, c.duration_min, c.capacity, c.enabled, c.published_at,
           (SELECT count(*)::int FROM public.calendar_hosts h WHERE h.calendar_id = c.id) AS host_count,
           CASE WHEN c.enabled THEN 'live'
                WHEN c.published_at IS NOT NULL THEN 'paused'
                ELSE 'draft' END AS lifecycle
      FROM public.calendars c
     WHERE c.tenant_id = _tenant
     ORDER BY c.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.get_calendar_presets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_presets(uuid) TO authenticated, service_role;
