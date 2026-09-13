-- ============================================================================
-- CALENDAR: booking-preset DUPLICATE · ARCHIVE · RESTORE — extending the ONE
-- server seam (20270301000000), never a second model (§18/§57).
--
-- WHY THIS EXISTS
-- 20270301000000 gave a booking preset a Draft → Publish → Pause lifecycle and
-- the canonical create/update/publish/pause RPCs both the Settings UI and Paige's
-- (handed-off) chat capability drive. The owner's Calendar definition-of-done also
-- requires an authorized human — and Paige, through the SAME governed path — to be
-- able to DUPLICATE a preset (start a new one from an existing config) and to
-- ARCHIVE / RESTORE one (put it away without destroying it, bring it back). This
-- migration adds exactly those three seams and one additive column. It adds no new
-- source of truth: `enabled` stays the authoritative bookability gate the public
-- resolver reads, `published_at` still records first-publish, and `archived_at`
-- (added here, nullable) records only whether a preset is put away.
--
-- THE LIFECYCLE, extended (§57 — one derivation, never stored):
--     Archived = archived_at IS NOT NULL            (highest precedence)
--     Live     = archived_at IS NULL AND enabled = true
--     Paused   = archived_at IS NULL AND enabled = false AND published_at IS NOT NULL
--     Draft    = archived_at IS NULL AND enabled = false AND published_at IS NULL
--   Archive ALWAYS sets enabled = false, so an archived preset can never also be
--   Live — the precedence above is exhaustive and non-overlapping.
--
-- PUBLIC BOOKABILITY — no resolver change, on purpose (§57/§32). Archive takes the
-- preset off the air by setting `enabled = false`; public-booking/loadCalendar
-- already refuses `enabled !== true`, so an archived preset is unreachable publicly
-- through the ONE authoritative gate. Adding an `archived_at` predicate to the edge
-- resolver's SELECT would (a) duplicate the gate and (b) risk a deploy-window read
-- error if the edge deploys before this column lands — so it is deliberately NOT
-- done. `enabled = false` on archive is the belt; the resolver gate is unchanged.
--
-- AUTHORIZATION MODEL (§59 — the grant is never the guard). Every function here
-- re-enforces the caller's scope IN-BODY through the SAME shared helper the
-- lifecycle RPCs use, `_assert_can_manage_preset(_cal, _tenant)`:
--   • authenticated  → must pass can_manage_calendar (creator / platform admin /
--     tenant admin) for the row; nothing trusts a client-supplied identity.
--   • service-role / Paige (auth.uid() IS NULL) → trusted ONLY for the tenant it
--     already resolved and passed as `_tenant`; a mismatch is refused.
--   Duplicate creates the copy in the SOURCE's own tenant, so manage-the-source is
--   sufficient authority — there is no cross-tenant surface to open.
--
-- §2: zero finance content — a generic scheduling seam. anon is REVOKEd on every
-- function; authenticated + service_role only.
-- ============================================================================

-- ── 1. archived_at: the one additive column ─────────────────────────────────
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.calendars.archived_at IS
  'When this booking preset was archived (put away). NULL = active. Archive also '
  'sets enabled=false so the public resolver''s enabled gate keeps it off the air; '
  'restore clears this column and the preset returns to Draft or Paused per '
  'published_at. Never gates a booking directly — enabled remains authoritative.';

-- ── 2. DUPLICATE: start a new DRAFT from an existing preset's config ─────────
-- Copies every config column and the source's host pool into a NEW row that is a
-- private Draft (enabled=false, published_at=NULL, archived_at=NULL) with a fresh,
-- caller-supplied unique slug. The creator is registered as a host (priority 0) so
-- the copy is immediately manageable even if the source's hosts don't include them.
-- Authorization = manage-the-SOURCE (which also validates existence + resolves the
-- tenant); the copy lands in that same tenant, so no cross-tenant surface opens.
CREATE OR REPLACE FUNCTION public.duplicate_calendar_preset(
  _cal uuid,
  _new_slug text,
  _new_title text DEFAULT NULL,
  _tenant uuid DEFAULT NULL,
  _created_by uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tid uuid; _creator uuid; _new_cal uuid; _src_title text; _final_title text;
BEGIN
  IF COALESCE(btrim(_new_slug), '') = '' THEN
    RAISE EXCEPTION 'PRESET_SLUG_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Manage the source (existence + caller scope + resolved tenant), §59.
  _tid := public._assert_can_manage_preset(_cal, _tenant);

  -- The creator to register as the copy's first host. An authenticated caller is
  -- it; a service-role caller must name one (auth.uid() is NULL for it).
  _creator := COALESCE(_caller, _created_by);
  IF _creator IS NULL THEN
    RAISE EXCEPTION 'PRESET_CREATOR_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT title INTO _src_title FROM public.calendars WHERE id = _cal;
  _final_title := COALESCE(
    NULLIF(btrim(COALESCE(_new_title, '')), ''),
    NULLIF(btrim(COALESCE(_src_title, '')), '') || ' (copy)',
    'Booking preset (copy)');

  BEGIN
    INSERT INTO public.calendars (
      tenant_id, slug, created_by, enabled, published_at, archived_at,
      type, title, description, color, accent, logo_url,
      duration_min, buffer_before_min, buffer_after_min, min_notice_min,
      booking_horizon_days, capacity, redirect_url, timezone, availability_json,
      group_id, theme, subtitle, show_company_name,
      location_options, location_type, location_value,
      intake_questions, appointment_types, date_overrides, notify_config, assignment_strategy
    )
    SELECT
      _tid, btrim(_new_slug), _creator, false, NULL, NULL,
      s.type, _final_title, s.description, s.color, s.accent, s.logo_url,
      s.duration_min, s.buffer_before_min, s.buffer_after_min, s.min_notice_min,
      s.booking_horizon_days, s.capacity, s.redirect_url, s.timezone, s.availability_json,
      s.group_id, s.theme, s.subtitle, s.show_company_name,
      s.location_options, s.location_type, s.location_value,
      s.intake_questions, s.appointment_types, s.date_overrides, s.notify_config, s.assignment_strategy
    FROM public.calendars s
    WHERE s.id = _cal
    RETURNING id INTO _new_cal;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'PRESET_SLUG_TAKEN: that booking link is already in use' USING ERRCODE = '23505';
  END;

  -- Carry the source's host pool so a team preset duplicates as a team preset…
  INSERT INTO public.calendar_hosts (calendar_id, user_id, priority)
  SELECT _new_cal, h.user_id, h.priority
    FROM public.calendar_hosts h
   WHERE h.calendar_id = _cal
  ON CONFLICT (calendar_id, user_id) DO NOTHING;

  -- …and ensure the creator can manage the copy even if they weren't a source host.
  INSERT INTO public.calendar_hosts (calendar_id, user_id, priority)
  VALUES (_new_cal, _creator, 0)
  ON CONFLICT (calendar_id, user_id) DO NOTHING;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'calendar_preset', 'duplicate_calendar_preset', _new_cal,
          jsonb_build_object('tenant_id', _tid, 'source_id', _cal, 'slug', btrim(_new_slug), 'status', 'draft'));

  RETURN jsonb_build_object('ok', true, 'calendar_id', _new_cal, 'source_id', _cal,
                            'enabled', false, 'status', 'draft');
END $$;

REVOKE ALL ON FUNCTION public.duplicate_calendar_preset(uuid, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_calendar_preset(uuid, text, text, uuid, uuid) TO authenticated, service_role;

-- ── 3. ARCHIVE: put a preset away (idempotent) and take it off the air ───────
-- Sets archived_at (COALESCE → first-archive instant preserved on repeat) and
-- enabled=false, so the public resolver's enabled gate makes it unbookable at once.
-- published_at is preserved, so a restore returns it to Paused rather than Draft.
CREATE OR REPLACE FUNCTION public.archive_calendar_preset(_cal uuid, _tenant uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tid uuid;
BEGIN
  _tid := public._assert_can_manage_preset(_cal, _tenant);
  UPDATE public.calendars
     SET archived_at = COALESCE(archived_at, now()), enabled = false, updated_at = now()
   WHERE id = _cal;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'calendar_preset', 'archive_calendar_preset', _cal,
          jsonb_build_object('tenant_id', _tid));

  RETURN jsonb_build_object('ok', true, 'calendar_id', _cal, 'enabled', false, 'status', 'archived');
END $$;

REVOKE ALL ON FUNCTION public.archive_calendar_preset(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_calendar_preset(uuid, uuid) TO authenticated, service_role;

-- ── 4. RESTORE: bring an archived preset back to Draft or Paused ─────────────
-- Clears archived_at. enabled stays false (archive set it), so the preset returns
-- to Draft (never published) or Paused (published_at set) — NEVER straight to Live;
-- re-publishing is a separate, validated act through publish_calendar_preset (§13).
CREATE OR REPLACE FUNCTION public.restore_calendar_preset(_cal uuid, _tenant uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tid uuid; _pub timestamptz;
BEGIN
  _tid := public._assert_can_manage_preset(_cal, _tenant);
  UPDATE public.calendars SET archived_at = NULL, updated_at = now()
   WHERE id = _cal
   RETURNING published_at INTO _pub;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'calendar_preset', 'restore_calendar_preset', _cal,
          jsonb_build_object('tenant_id', _tid,
                             'status', CASE WHEN _pub IS NOT NULL THEN 'paused' ELSE 'draft' END));

  RETURN jsonb_build_object('ok', true, 'calendar_id', _cal, 'enabled', false,
                            'status', CASE WHEN _pub IS NOT NULL THEN 'paused' ELSE 'draft' END);
END $$;

REVOKE ALL ON FUNCTION public.restore_calendar_preset(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_calendar_preset(uuid, uuid) TO authenticated, service_role;

-- ── 5. PUBLISH — re-created with the archived guard (only delta vs 20270301000000)
-- An archived preset must be restored before it can be published again: publishing
-- a put-away preset would silently un-archive-and-go-live, which is the opposite of
-- what "archived" means (§13). Everything else is byte-identical to the prior body,
-- including the ONE publish bar (_calendar_preset_block_reason, §18).
CREATE OR REPLACE FUNCTION public.publish_calendar_preset(_cal uuid, _tenant uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tid uuid; _block text; _type text; _hosts int; _pub timestamptz;
BEGIN
  _tid := public._assert_can_manage_preset(_cal, _tenant);

  -- Archived guard (added 20270302000000): a put-away preset cannot be published.
  IF EXISTS (SELECT 1 FROM public.calendars WHERE id = _cal AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PRESET_ARCHIVED: restore this preset before publishing' USING ERRCODE = '22023';
  END IF;

  -- The ONE publish bar (§18): the EXACT same check update_calendar_preset re-runs to
  -- auto-pause a Live preset. Enforcing "a public page can honestly take a booking"
  -- in one place is what keeps the two write paths from drifting.
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

-- ── 6. UPDATE — re-created with the archived guard (only delta vs 20270301000000)
-- Archived presets are frozen: restore before editing (§13 — no silent edits to a
-- put-away preset). The rest is byte-identical to the prior body, including the
-- auto-pause honesty gate that shares the ONE publish bar.
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

  -- Archived guard (added 20270302000000): restore before editing.
  IF EXISTS (SELECT 1 FROM public.calendars WHERE id = _cal AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PRESET_ARCHIVED: restore this preset before editing' USING ERRCODE = '22023';
  END IF;

  -- Guard the one raw ::uuid cast below (a non-UI writer could send a malformed
  -- group_id). A present-but-empty group_id NULLs the group (intentional); only a
  -- present NON-empty malformed value is refused.
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

  -- Auto-pause honesty gate (§13/§32): an edit to an ALREADY-live preset that pushes
  -- it below the publish bar takes it off the air (enabled=false, published_at kept →
  -- reads as Paused). A valid edit to a Live preset stays Live.
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

-- ── 7. READ — re-created to expose archived_at + the 'archived' lifecycle ────
-- The return TABLE signature changes (adds archived_at), so the prior function is
-- dropped first. Lifecycle precedence puts 'archived' above live/paused/draft, the
-- same non-overlapping derivation the migration header states; the UI/hook split
-- the rows into an Active list and an Archived section from this one read (§57).
DROP FUNCTION IF EXISTS public.get_calendar_presets(uuid);

CREATE FUNCTION public.get_calendar_presets(_tenant uuid)
RETURNS TABLE (
  id uuid, slug text, title text, type text, duration_min int, capacity int,
  enabled boolean, published_at timestamptz, archived_at timestamptz,
  host_count int, lifecycle text
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
    SELECT c.id, c.slug, c.title, c.type, c.duration_min, c.capacity, c.enabled,
           c.published_at, c.archived_at,
           (SELECT count(*)::int FROM public.calendar_hosts h WHERE h.calendar_id = c.id) AS host_count,
           CASE WHEN c.archived_at IS NOT NULL THEN 'archived'
                WHEN c.enabled THEN 'live'
                WHEN c.published_at IS NOT NULL THEN 'paused'
                ELSE 'draft' END AS lifecycle
      FROM public.calendars c
     WHERE c.tenant_id = _tenant
     ORDER BY (c.archived_at IS NOT NULL), c.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.get_calendar_presets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_presets(uuid) TO authenticated, service_role;
