-- ─────────────────────────────────────────────────────────────────────────────
-- Business-in-a-box · Phase 1 — Paige-orchestrated starter business (#129)
--
-- A new tenant should open as a WORKING practice, not an empty shell — but NOT as a
-- static snapshot. Paige is the driver: on tenant creation she stands up the minimum
-- working business (Playbook → default pipeline → a booking calendar) and files each
-- step as an action on the two-department rail (§8), so it's visible, governable, and
-- re-runnable by voice/text (§10).
--
-- Architecture (the load-bearing decision): the AFTER INSERT trigger only ENQUEUES a
-- ledger row (wrapped so it can never abort the signup). A service-role worker, drained
-- by pg_cron, does the real seeding AFTER commit — because a brand-new owner is not yet
-- an admin/tenant_member at trigger time, so the guarded RPCs' JWT branches would reject
-- them; the service branch (auth.uid() IS NULL + p_tenant_id) is the only clean path.
-- Every seeding step is already a SQL RPC, so the worker is pure SQL — no edge function.
--
-- §2/§9: everything seeded is coaching-generic (neutral 'general' playbook fallback,
-- a generic "Sales Pipeline", a plain "Consultation" calendar). ZERO funding/credit —
-- that stays a later opt-in module, never a default.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Two coaching-generic action kinds for the provisioning tree ──────────────
INSERT INTO public.paige_action_kinds
  (slug, tenant_id, label, description, default_from_department, default_to_department,
   executor, requires_approval, default_autonomy_lane, default_priority, enabled)
VALUES
  ('owner.provision_starter_business', NULL,
   'Set up the business', 'Paige stands up the starter workspace — playbook, pipeline, and a booking calendar.',
   'owner_ops', 'owner_ops', 'record_only', false, 'auto', 'normal', true),
  ('owner.provision_step', NULL,
   'Setup step', 'One step of standing up the starter workspace.',
   'owner_ops', 'owner_ops', 'record_only', false, 'auto', 'low', true)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Industry → starter Playbook slug (server-side single source of truth) ─────
-- Mirrors the onboarding client map so ALL creation paths (front door, subaccount,
-- future import) resolve the same preset. Anything unlisted → the vertical-NEUTRAL
-- 'general' baseline, never a coaching-voiced one (§2).
CREATE OR REPLACE FUNCTION public.resolve_starter_playbook_slug(_industry text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE lower(btrim(COALESCE(_industry, '')))
    WHEN 'coaching'                        THEN 'coaching-default'
    WHEN 'fitness & wellness'              THEN 'fitness'
    WHEN 'consulting'                      THEN 'consultant'
    WHEN 'advisory / professional services' THEN 'consultant'
    WHEN 'real estate'                     THEN 'consultant'
    WHEN 'agency / marketing'              THEN 'agency'
    WHEN 'creative / design'               THEN 'agency'
    ELSE 'general'
  END;
$$;

-- ── 3. set_tenant_playbook — add the service/Paige path ─────────────────────────
-- Was JWT-only, so Paige/worker couldn't seed a playbook headlessly. Add the
-- service branch (auth.uid() IS NULL → trusted, matches create_pipeline_with_stages).
CREATE OR REPLACE FUNCTION public.set_tenant_playbook(_tenant_id uuid, _config jsonb DEFAULT NULL::jsonb, _slug text DEFAULT NULL::text, _only_if_unset boolean DEFAULT false)
RETURNS tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tenant public.tenants;
  _has_playbook boolean;
BEGIN
  -- JWT caller must be a tenant admin / platform owner. The service path (auth.uid()
  -- NULL = worker/Paige, reachable only by service_role) is trusted with _tenant_id.
  IF _uid IS NOT NULL AND NOT (public.is_tenant_admin(_tenant_id) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'only a tenant admin may set the playbook' USING ERRCODE = '42501';
  END IF;
  IF _config IS NULL AND _slug IS NULL THEN
    RAISE EXCEPTION 'provide a playbook config or a slug' USING ERRCODE = '22000';
  END IF;

  IF _only_if_unset THEN
    SELECT (coalesce(t.features, '{}'::jsonb) ? 'playbook_config'
            OR coalesce(t.features, '{}'::jsonb) ? 'playbook')
      INTO _has_playbook FROM public.tenants t WHERE t.id = _tenant_id;
    IF _has_playbook IS NULL THEN
      RAISE EXCEPTION 'tenant not found' USING ERRCODE = '22000';
    END IF;
    IF _has_playbook THEN
      SELECT * INTO _tenant FROM public.tenants WHERE id = _tenant_id;
      RETURN _tenant;
    END IF;
  END IF;

  IF _config IS NOT NULL THEN
    UPDATE public.tenants
       SET features = coalesce(features, '{}'::jsonb)
                      || jsonb_build_object('playbook_config', _config)
                      || (CASE WHEN _config ? 'slug'
                               THEN jsonb_build_object('playbook', _config->>'slug')
                               ELSE '{}'::jsonb END)
     WHERE id = _tenant_id
     RETURNING * INTO _tenant;
  ELSE
    UPDATE public.tenants
       SET features = (coalesce(features, '{}'::jsonb) - 'playbook_config')
                      || jsonb_build_object('playbook', _slug)
     WHERE id = _tenant_id
     RETURNING * INTO _tenant;
  END IF;

  IF _tenant.id IS NULL THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = '22000';
  END IF;
  RETURN _tenant;
END;
$function$;

-- ── 4. create_calendar — headless, dual-caller, slug-collision-safe ─────────────
-- Seeds a DRAFT booking calendar (enabled=false) + the owner as its host, so the
-- owner reviews hours and turns it on. Also the governed seam CalendarsPanel can adopt.
CREATE OR REPLACE FUNCTION public.create_calendar(
  p_tenant_id uuid,
  p_title text DEFAULT 'Consultation',
  p_type text DEFAULT 'personal',
  p_duration_min integer DEFAULT 30,
  p_owner_user_id uuid DEFAULT NULL,
  p_enabled boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _owner  uuid;
  _base   text;
  _slug   text;
  _n      int := 1;
  _cid    uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'CALENDAR_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND p_tenant_id IS NOT NULL THEN _tenant := p_tenant_id; END IF;
    IF NOT (public.is_tenant_admin(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'CALENDAR_FORBIDDEN: admin required' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := p_tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'CALENDAR_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  _owner := COALESCE(p_owner_user_id, (SELECT owner_user_id FROM public.tenants WHERE id = _tenant));

  -- slug: sanitize(title)-<tenant-slug>, globally unique with a bumped suffix.
  _base := public.sanitize_email_local_part(COALESCE(NULLIF(btrim(p_title), ''), 'meet'))
           || '-' || COALESCE((SELECT slug FROM public.tenants WHERE id = _tenant), left(_tenant::text, 8));
  _base := left(_base, 48);
  _slug := _base;
  WHILE EXISTS (SELECT 1 FROM public.calendars WHERE lower(slug) = lower(_slug)) LOOP
    _n := _n + 1;
    _slug := left(_base, 44) || '-' || _n::text;
  END LOOP;

  INSERT INTO public.calendars (tenant_id, created_by, slug, type, title, duration_min, enabled)
  VALUES (_tenant, _owner, _slug, COALESCE(p_type, 'personal'),
          COALESCE(NULLIF(btrim(p_title), ''), 'Consultation'), GREATEST(5, COALESCE(p_duration_min, 30)),
          COALESCE(p_enabled, false))
  RETURNING id INTO _cid;

  -- Only add the host if they actually belong to this tenant (the tenant owner, or an
  -- active member) — never let a caller register an out-of-tenant user as a host.
  IF _owner IS NOT NULL AND (
       _owner = (SELECT owner_user_id FROM public.tenants WHERE id = _tenant)
       OR EXISTS (SELECT 1 FROM public.tenant_members
                   WHERE tenant_id = _tenant AND user_id = _owner AND status = 'active')
     ) THEN
    INSERT INTO public.calendar_hosts (calendar_id, user_id, priority)
    VALUES (_cid, _owner, 0)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN _cid;
END;
$$;

-- ── 5. The provisioning ledger (idempotency + retry spine) ──────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_provisioning (
  tenant_id       uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  steps           jsonb NOT NULL DEFAULT '{}'::jsonb,
  parent_action_id uuid,
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_provisioning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform owner reads provisioning" ON public.tenant_provisioning;
CREATE POLICY "Platform owner reads provisioning"
  ON public.tenant_provisioning FOR SELECT USING (public.is_platform_owner());

DROP POLICY IF EXISTS "Tenant admins read own provisioning" ON public.tenant_provisioning;
CREATE POLICY "Tenant admins read own provisioning"
  ON public.tenant_provisioning FOR SELECT
  USING (tenant_id = public.current_user_tenant_id());

-- ── 6. Enqueue (called by the trigger; idempotent, does nothing heavy) ──────────
CREATE OR REPLACE FUNCTION public.seed_starter_business(_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _tenant_id IS NULL THEN RETURN; END IF;
  -- Never re-queue a tenant already provisioned (covers provision_tenant's
  -- pre-existing-tenant early return).
  INSERT INTO public.tenant_provisioning (tenant_id, status)
  VALUES (_tenant_id, 'queued')
  ON CONFLICT (tenant_id) DO NOTHING;
END;
$$;

-- ── 7. The worker — Paige stands up the business, on the rails (idempotent) ──────
-- Runs under BOTH callers: cron/service (auth.uid() NULL → service branches) and the
-- Paige chat tool (owner JWT → admin branches). Each step self-heals / skips if done.
CREATE OR REPLACE FUNCTION public.run_starter_provisioning(
  _tenant_id uuid,
  _force boolean DEFAULT false,
  _steps text[] DEFAULT NULL   -- NULL = all; else subset of {playbook,pipeline,calendar}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _t          public.tenants;
  _led        public.tenant_provisioning;
  _steps_done jsonb := '{}'::jsonb;
  _parent     uuid;
  _r          jsonb;
  _slug       text;
  _cid        uuid;
  _want_pb    boolean := (_steps IS NULL OR 'playbook' = ANY(_steps));
  _want_pipe  boolean := (_steps IS NULL OR 'pipeline' = ANY(_steps));
  _want_cal   boolean := (_steps IS NULL OR 'calendar' = ANY(_steps));
  _err        text;
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'PROVISION_NO_TENANT' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _t FROM public.tenants WHERE id = _tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVISION_TENANT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  -- IDOR guard: a JWT caller may only (re)drive their OWN tenant (admin/owner);
  -- the service/cron path (auth.uid() NULL) drives any tenant. Before any ledger write.
  IF auth.uid() IS NOT NULL AND NOT (public.is_tenant_admin(_tenant_id) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'PROVISION_FORBIDDEN: admin required' USING ERRCODE = '42501';
  END IF;

  -- Ensure a ledger row and short-circuit an already-done run unless forced.
  INSERT INTO public.tenant_provisioning (tenant_id, status)
  VALUES (_tenant_id, 'running') ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO _led FROM public.tenant_provisioning WHERE tenant_id = _tenant_id;
  IF _led.status = 'done' AND NOT _force THEN
    RETURN jsonb_build_object('ok', true, 'status', 'done', 'skipped', true, 'steps', _led.steps);
  END IF;
  _steps_done := COALESCE(_led.steps, '{}'::jsonb);
  _parent := _led.parent_action_id;

  UPDATE public.tenant_provisioning
     SET status = 'running', attempts = attempts + 1, updated_at = now()
   WHERE tenant_id = _tenant_id;

  -- Parent action on the Owner Ops rail (file once). Wrapped for symmetry with the
  -- steps, so a transient filing error degrades to a retryable 'failed' ledger row.
  IF _parent IS NULL THEN
    BEGIN
      _r := public.file_action('owner.provision_starter_business',
              'Set up ' || COALESCE(_t.name, 'the workspace'),
              'Paige is standing up the starter workspace — playbook, pipeline, and a booking calendar.',
              NULL, jsonb_build_object('tenant_id', _tenant_id), 'owner_ops', 'owner_ops', 'normal',
              NULL, NULL, NULL, 'paige', _tenant_id);
      _parent := NULLIF(_r->>'action_id','')::uuid;
      UPDATE public.tenant_provisioning SET parent_action_id = _parent WHERE tenant_id = _tenant_id;
    EXCEPTION WHEN OTHERS THEN _err := 'parent: '||SQLERRM;
    END;
  END IF;

  -- Step: Playbook (never clobber an authored one).
  IF _want_pb AND (_force OR NOT (_steps_done ? 'playbook')) THEN
    BEGIN
      _slug := public.resolve_starter_playbook_slug(_t.brand->>'industry');
      PERFORM public.set_tenant_playbook(_tenant_id, NULL, _slug, true);
      _r := public.file_action('owner.provision_step', 'Configure Paige''s playbook',
              'Set the starter playbook: ' || _slug || '.', NULL,
              jsonb_build_object('step','playbook','slug',_slug), 'owner_ops', 'owner_ops', 'low',
              NULL, NULL, _parent, 'paige', _tenant_id);
      PERFORM public.advance_action(NULLIF(_r->>'action_id','')::uuid, 'executing',
              NULL, NULL, NULL, NULL, jsonb_build_object('slug',_slug), NULL, NULL, _tenant_id);
      _steps_done := _steps_done || jsonb_build_object('playbook', _slug);
    EXCEPTION WHEN OTHERS THEN _err := 'playbook: '||SQLERRM;
    END;
  END IF;

  -- Step: default sales pipeline (skip if the tenant already has one).
  IF _want_pipe AND (_force OR NOT (_steps_done ? 'pipeline')) THEN
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM public.pipelines WHERE tenant_id = _tenant_id) THEN
        PERFORM public.create_pipeline_with_stages(_tenant_id, 'Sales Pipeline', '[]'::jsonb,
                'Your default deal pipeline.', NULL, true, _t.owner_user_id);
      END IF;
      _r := public.file_action('owner.provision_step', 'Build the sales pipeline',
              'Created a default deal pipeline with starter stages.', NULL,
              jsonb_build_object('step','pipeline'), 'owner_ops', 'owner_ops', 'low',
              NULL, NULL, _parent, 'paige', _tenant_id);
      PERFORM public.advance_action(NULLIF(_r->>'action_id','')::uuid, 'executing',
              NULL, NULL, NULL, NULL, '{}'::jsonb, NULL, NULL, _tenant_id);
      _steps_done := _steps_done || jsonb_build_object('pipeline', true);
    EXCEPTION WHEN OTHERS THEN _err := COALESCE(_err||' | ','')||'pipeline: '||SQLERRM;
    END;
  END IF;

  -- Step: draft booking calendar (skip if the tenant already has one).
  IF _want_cal AND (_force OR NOT (_steps_done ? 'calendar')) THEN
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM public.calendars WHERE tenant_id = _tenant_id) THEN
        _cid := public.create_calendar(_tenant_id, 'Consultation', 'personal', 30, _t.owner_user_id, false);
      END IF;
      _r := public.file_action('owner.provision_step', 'Set up a booking calendar',
              'Drafted a "Consultation" booking calendar — set your hours and turn it on.', NULL,
              jsonb_build_object('step','calendar','calendar_id',_cid), 'owner_ops', 'owner_ops', 'low',
              NULL, NULL, _parent, 'paige', _tenant_id);
      PERFORM public.advance_action(NULLIF(_r->>'action_id','')::uuid, 'executing',
              NULL, NULL, NULL, NULL, jsonb_build_object('calendar_id',_cid), NULL, NULL, _tenant_id);
      _steps_done := _steps_done || jsonb_build_object('calendar', true);
    EXCEPTION WHEN OTHERS THEN _err := COALESCE(_err||' | ','')||'calendar: '||SQLERRM;
    END;
  END IF;

  -- Settle the ledger + parent action.
  IF _err IS NULL THEN
    UPDATE public.tenant_provisioning
       SET status='done', steps=_steps_done, last_error=NULL, updated_at=now()
     WHERE tenant_id=_tenant_id;
    IF _parent IS NOT NULL THEN
      PERFORM public.advance_action(_parent, 'executing', NULL, NULL, NULL, NULL,
              jsonb_build_object('steps',_steps_done), NULL, NULL, _tenant_id);
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'done', 'steps', _steps_done);
  ELSE
    UPDATE public.tenant_provisioning
       SET status='failed', steps=_steps_done, last_error=_err, updated_at=now()
     WHERE tenant_id=_tenant_id;
    RETURN jsonb_build_object('ok', false, 'status', 'failed', 'steps', _steps_done, 'error', _err);
  END IF;
END;
$$;

-- ── 8. Queue drain (cron) — pick up queued/failed rows, run them ────────────────
CREATE OR REPLACE FUNCTION public.process_starter_provisioning_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row record; _count int := 0;
BEGIN
  FOR _row IN
    SELECT tenant_id FROM public.tenant_provisioning
    WHERE status = 'queued' OR (status = 'failed' AND attempts < 5)
    ORDER BY created_at
    LIMIT 25
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.run_starter_provisioning(_row.tenant_id, false, NULL);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.tenant_provisioning
         SET status='failed', last_error='drain: '||SQLERRM, attempts=attempts+1, updated_at=now()
       WHERE tenant_id=_row.tenant_id;
    END;
  END LOOP;
  RETURN _count;
END;
$$;

-- ── 9. Non-blocking enqueue trigger on tenant creation ──────────────────────────
-- Sorts AFTER trg_tenants_ensure_features and trg_tenants_provision_email_identity
-- (alphabetical: ensure < provision < seed). Wrapped so it can NEVER abort a signup.
CREATE OR REPLACE FUNCTION public.trg_seed_starter_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.seed_starter_business(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'starter-business enqueue failed for tenant %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_seed_starter_business ON public.tenants;
CREATE TRIGGER trg_tenants_seed_starter_business
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_starter_business();

-- ── 10. Schedule the drain every minute (mirrors booking-notifications cron) ─────
SELECT cron.schedule(
  'starter-provisioning-drain',
  '* * * * *',
  $cron$ SELECT public.process_starter_provisioning_queue(); $cron$
);

-- ── 11. Grants ──────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.resolve_starter_playbook_slug(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_starter_playbook_slug(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_calendar(uuid, text, text, integer, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_calendar(uuid, text, text, integer, uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.seed_starter_business(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.seed_starter_business(uuid) TO service_role;

-- run_starter_provisioning: authenticated (owner re-drives via Paige) + service (worker).
REVOKE ALL ON FUNCTION public.run_starter_provisioning(uuid, boolean, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.run_starter_provisioning(uuid, boolean, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.process_starter_provisioning_queue() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_starter_provisioning_queue() TO service_role;

REVOKE ALL ON FUNCTION public.trg_seed_starter_business() FROM PUBLIC, anon, authenticated;
