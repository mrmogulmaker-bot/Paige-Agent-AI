-- Growth expansion — blocks (6→17), form-schema validator, funnel sessions (WS-A, §3).
-- Vibe Coding Studio Phase 1. This migration is the LOCKSTEP DB half of the block-union
-- expansion: it moves the server-side validators in growth_page_upsert / growth_form_upsert
-- forward to match the 17-type GrowthBlock union and the branching form schema in
-- src/lib/growth.ts (WS-A type contract), and it gives funnel progress its missing home
-- (growth_funnel_sessions) with the IDOR closed (blueprint B4).
--
-- Doctrine: tenant-scoped and OUT OF THE AUTH LANE (§6) — current_user_tenant_id() /
-- has_any_role() / has_role() are REUSED unchanged, never redefined. Both re-declared RPCs
-- carry their FULL live body verbatim (pulled with pg_get_functiondef); only the intended
-- validator delta changes. Every guard, tenant-pin, audit_logs insert, and REVOKE/GRANT is
-- re-emitted exactly (§13). Coaching-generic, §2-clean — nothing vertical is seeded here.
-- Idempotent + re-runnable: CREATE OR REPLACE, CREATE TABLE IF NOT EXISTS, DROP POLICY IF
-- EXISTS before CREATE, defensive REVOKE.

-- ============================================================
-- 1. growth_page_upsert — FULL live body; only the block validator loop changes
-- ============================================================
-- Delta vs live (20260713090000): the block-type IN-list grows 6→17 to match the
-- GrowthBlock union; the rich_text 20k cap is unchanged; and four new per-type guards land:
--   • media  — provider ∈ (youtube,vimeo,loom,mp4) AND an https url
--   • image  — an https url
--   • gallery — every image carries an https url
--   • countdown — ends_at present and parseable as timestamptz
-- URL-bearing blocks (media/image/gallery) with no valid https URL are REJECTED here; the
-- generator OMITS them rather than emitting placeholder tokens, so the validator never has
-- to silently accept a placeholder (resolves the generator-vs-validator contradiction, B6).
-- Everything else — tenant resolution/pin, role gate, draft-only writes, ON CONFLICT, and
-- the audit_logs insert — is byte-identical to the live body.
CREATE OR REPLACE FUNCTION public.growth_page_upsert(
  p_tenant_id  uuid,
  p_slug       text,
  p_title      text,
  p_blocks_json jsonb,
  p_theme_json jsonb DEFAULT NULL,
  p_seo_json   jsonb DEFAULT NULL,
  p_id         uuid DEFAULT NULL
)
RETURNS public.growth_pages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _slug   text := NULLIF(btrim(p_slug), '');
  _block  jsonb;
  _btype  text;
  _row    public.growth_pages;
BEGIN
  -- Resolve effective tenant server-side. JWT callers are pinned to their own tenant —
  -- p_tenant_id is IGNORED for them (no IDOR, §9). Only trusted service-role may name a
  -- tenant explicitly.
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'GROWTH_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
  ELSE
    _tenant := p_tenant_id;
  END IF;

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'GROWTH_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF _slug IS NULL THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SLUG: a non-empty slug is required' USING ERRCODE = '22023';
  END IF;

  -- Validate blocks server-side: must be a JSON array of known GrowthBlock types.
  IF p_blocks_json IS NULL OR jsonb_typeof(p_blocks_json) <> 'array' THEN
    RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: blocks_json must be a JSON array' USING ERRCODE = '22023';
  END IF;
  FOR _block IN SELECT value FROM jsonb_array_elements(p_blocks_json) LOOP
    IF jsonb_typeof(_block) <> 'object' THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: each block must be an object' USING ERRCODE = '22023';
    END IF;
    _btype := _block->>'type';
    -- The 17-type union (src/lib/growth.ts) — original six plus the Framer/Webflow-class
    -- expansion. Kept in lockstep with the GrowthBlocks renderer and growth-page-draft.
    IF _btype IS NULL OR _btype NOT IN
       ('hero','phase_cards','feature_grid','cta','rich_text','embedded_form',
        'social_proof','testimonial','pricing','faq','media','stats','countdown',
        'two_column','image','gallery','steps') THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: unknown block type %', COALESCE(_btype, '(null)')
        USING ERRCODE = '22023';
    END IF;

    IF _btype = 'rich_text' AND char_length(COALESCE(_block->>'html', '')) > 20000 THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: rich_text html exceeds 20000 characters'
        USING ERRCODE = '22023';
    END IF;

    -- media: allowlisted provider + an https URL (client-side <iframe>/<video> egress, §13).
    IF _btype = 'media' THEN
      IF COALESCE(_block->>'provider', '') NOT IN ('youtube','vimeo','loom','mp4') THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: media provider must be youtube, vimeo, loom or mp4'
          USING ERRCODE = '22023';
      END IF;
      IF COALESCE(_block->>'url', '') !~* '^https://' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: media url must be an https URL'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    -- image: an https URL is required (URL-bearing block — omitted upstream when absent).
    IF _btype = 'image' AND COALESCE(_block->>'url', '') !~* '^https://' THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: image url must be an https URL'
        USING ERRCODE = '22023';
    END IF;

    -- gallery: every image must carry an https URL.
    IF _btype = 'gallery' THEN
      IF jsonb_typeof(_block->'images') <> 'array'
         OR jsonb_array_length(_block->'images') = 0
         OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(_block->'images') AS g
              WHERE COALESCE(g->>'url', '') !~* '^https://'
            ) THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: every gallery image must have an https URL'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    -- countdown: ends_at must be present and parse as a timestamptz.
    IF _btype = 'countdown' THEN
      IF COALESCE(_block->>'ends_at', '') = '' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: countdown requires an ends_at timestamp'
          USING ERRCODE = '22023';
      END IF;
      BEGIN
        PERFORM (_block->>'ends_at')::timestamptz;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: countdown ends_at must be a valid timestamp'
          USING ERRCODE = '22023';
      END;
    END IF;
  END LOOP;

  -- Update by id (tenant-scoped) …
  IF p_id IS NOT NULL THEN
    UPDATE public.growth_pages SET
      slug             = _slug,
      title            = COALESCE(NULLIF(btrim(p_title), ''), title),
      draft_blocks_json = p_blocks_json,
      draft_theme_json  = COALESCE(p_theme_json, draft_theme_json),
      draft_seo_json    = COALESCE(p_seo_json, draft_seo_json)
    WHERE id = p_id AND tenant_id = _tenant
    RETURNING * INTO _row;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'GROWTH_NOT_FOUND: page not found in this tenant' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    -- … or upsert on (tenant_id, slug). Live blocks_json stays at its default '[]' until
    -- a publish copies the draft over; status stays 'draft' on a fresh page.
    INSERT INTO public.growth_pages (
      tenant_id, slug, title, status, created_by,
      draft_blocks_json, draft_theme_json, draft_seo_json
    ) VALUES (
      _tenant, _slug, COALESCE(NULLIF(btrim(p_title), ''), 'Untitled'), 'draft', _caller,
      p_blocks_json, p_theme_json, p_seo_json
    )
    ON CONFLICT (tenant_id, slug) DO UPDATE SET
      title             = COALESCE(NULLIF(btrim(EXCLUDED.title), ''), public.growth_pages.title),
      draft_blocks_json = EXCLUDED.draft_blocks_json,
      draft_theme_json  = COALESCE(EXCLUDED.draft_theme_json, public.growth_pages.draft_theme_json),
      draft_seo_json    = COALESCE(EXCLUDED.draft_seo_json, public.growth_pages.draft_seo_json)
    RETURNING * INTO _row;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'growth_pages', 'growth_page_upsert', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'slug', _row.slug,
                             'blocks', jsonb_array_length(p_blocks_json)));

  RETURN _row;
END;
$$;

-- ============================================================
-- 2. growth_form_upsert — FULL live body; only the schema validator is extended
-- ============================================================
-- Delta vs live (20260713090000): the shape check stays, then the validator WALKS
-- sections→fields enforcing the GrowthFormSchema contract (src/lib/growth.ts):
--   • field keys are non-empty and UNIQUE across the whole form
--   • choice fields (select/radio/checkbox) require a non-empty options array
--   • visible_when.field must reference an EARLIER field key (no dangling/forward branch)
--   • maps_to is allowlisted to clients.<column> | businesses.<column> (the physical
--     namespace is `clients`, NOT `contacts` — confirmed against live)
--   • caps: ≤40 sections, ≤200 fields
-- NO signature change (B3): the automation registry lives in its own table (m3), not a
-- p_success_actions_json extension. Everything else is byte-identical to the live body.
CREATE OR REPLACE FUNCTION public.growth_form_upsert(
  p_tenant_id  uuid,
  p_slug       text,
  p_name       text,
  p_schema_json jsonb,
  p_success_action_json jsonb DEFAULT NULL,
  p_auto_create_contact boolean DEFAULT true,
  p_pipeline_id uuid DEFAULT NULL,
  p_stage_id    uuid DEFAULT NULL,
  p_id          uuid DEFAULT NULL
)
RETURNS public.growth_forms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _slug   text := NULLIF(btrim(p_slug), '');
  _row    public.growth_forms;
  _schema_ok boolean;
  _sections  jsonb;
  _section   jsonb;
  _field     jsonb;
  _vw        jsonb;
  _cond      jsonb;
  _seen      text[] := ARRAY[]::text[];
  _key       text;
  _ftype     text;
  _maps      text;
  _fieldcount int := 0;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'GROWTH_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
  ELSE
    _tenant := p_tenant_id;
  END IF;

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'GROWTH_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF _slug IS NULL THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SLUG: a non-empty slug is required' USING ERRCODE = '22023';
  END IF;

  -- Validate schema shape: an object with a `sections` array, or a bare array of sections.
  _schema_ok := p_schema_json IS NOT NULL AND (
       (jsonb_typeof(p_schema_json) = 'object' AND jsonb_typeof(p_schema_json->'sections') = 'array')
    OR (jsonb_typeof(p_schema_json) = 'array')
  );
  IF NOT _schema_ok THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: schema_json must be {sections:[…]} or an array of sections'
      USING ERRCODE = '22023';
  END IF;

  -- Walk sections→fields (GrowthFormSchema contract). Fields are validated in document
  -- order so a visible_when branch can only reference a field declared before it.
  _sections := CASE WHEN jsonb_typeof(p_schema_json) = 'array'
                    THEN p_schema_json ELSE p_schema_json->'sections' END;
  IF jsonb_array_length(_sections) > 40 THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: too many sections (max 40)' USING ERRCODE = '22023';
  END IF;

  FOR _section IN SELECT value FROM jsonb_array_elements(_sections) LOOP
    -- section-level visible_when may only reference fields from EARLIER sections.
    _vw := _section->'visible_when';
    IF jsonb_typeof(_vw) = 'object' THEN
      FOR _cond IN SELECT value FROM jsonb_array_elements(
             (CASE WHEN jsonb_typeof(_vw->'all') = 'array' THEN _vw->'all' ELSE '[]'::jsonb END)
          || (CASE WHEN jsonb_typeof(_vw->'any') = 'array' THEN _vw->'any' ELSE '[]'::jsonb END)
      ) LOOP
        IF _cond->>'field' IS NULL OR NOT (_cond->>'field' = ANY(_seen)) THEN
          RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: a section branches on unknown or later field "%"',
            COALESCE(_cond->>'field', '(null)') USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    IF jsonb_typeof(_section->'fields') <> 'array' THEN
      RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: each section must have a fields array' USING ERRCODE = '22023';
    END IF;

    FOR _field IN SELECT value FROM jsonb_array_elements(_section->'fields') LOOP
      _fieldcount := _fieldcount + 1;
      IF _fieldcount > 200 THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: too many fields (max 200)' USING ERRCODE = '22023';
      END IF;

      _key := NULLIF(btrim(COALESCE(_field->>'key', '')), '');
      IF _key IS NULL THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: every field needs a non-empty key' USING ERRCODE = '22023';
      END IF;

      -- field-level visible_when must reference an EARLIER key (checked before this key is
      -- appended to _seen, so a field can never branch on itself or a later field).
      _vw := _field->'visible_when';
      IF jsonb_typeof(_vw) = 'object' THEN
        FOR _cond IN SELECT value FROM jsonb_array_elements(
               (CASE WHEN jsonb_typeof(_vw->'all') = 'array' THEN _vw->'all' ELSE '[]'::jsonb END)
            || (CASE WHEN jsonb_typeof(_vw->'any') = 'array' THEN _vw->'any' ELSE '[]'::jsonb END)
        ) LOOP
          IF _cond->>'field' IS NULL OR NOT (_cond->>'field' = ANY(_seen)) THEN
            RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" branches on unknown or later field "%"',
              _key, COALESCE(_cond->>'field', '(null)') USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END IF;

      IF _key = ANY(_seen) THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: duplicate field key "%"', _key USING ERRCODE = '22023';
      END IF;

      -- choice fields require at least one option.
      _ftype := _field->>'type';
      IF _ftype IN ('select','radio','checkbox') THEN
        IF jsonb_typeof(_field->'options') <> 'array'
           OR jsonb_array_length(_field->'options') = 0 THEN
          RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" (%) needs at least one option',
            _key, _ftype USING ERRCODE = '22023';
        END IF;
      END IF;

      -- maps_to allowlist: only clients.<column> or businesses.<column>.
      _maps := NULLIF(btrim(COALESCE(_field->>'maps_to', '')), '');
      IF _maps IS NOT NULL AND _maps !~ '^(clients|businesses)\.[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" maps_to must target clients.<column> or businesses.<column>',
          _key USING ERRCODE = '22023';
      END IF;

      _seen := array_append(_seen, _key);
    END LOOP;
  END LOOP;

  IF p_id IS NOT NULL THEN
    UPDATE public.growth_forms SET
      slug                = _slug,
      name                = COALESCE(NULLIF(btrim(p_name), ''), name),
      schema_json         = p_schema_json,
      success_action_json = COALESCE(p_success_action_json, success_action_json),
      auto_create_contact = COALESCE(p_auto_create_contact, auto_create_contact),
      pipeline_id         = COALESCE(p_pipeline_id, pipeline_id),
      stage_id            = COALESCE(p_stage_id, stage_id)
    WHERE id = p_id AND tenant_id = _tenant
    RETURNING * INTO _row;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'GROWTH_NOT_FOUND: form not found in this tenant' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.growth_forms (
      tenant_id, slug, name, status, schema_json, success_action_json,
      auto_create_contact, pipeline_id, stage_id, created_by
    ) VALUES (
      _tenant, _slug, COALESCE(NULLIF(btrim(p_name), ''), 'Lead form'), 'active',
      p_schema_json,
      COALESCE(p_success_action_json,
               '{"type":"thank_you","message":"Thanks — we''ll be in touch."}'::jsonb),
      COALESCE(p_auto_create_contact, true), p_pipeline_id, p_stage_id, _caller
    )
    ON CONFLICT (tenant_id, slug) DO UPDATE SET
      name                = COALESCE(NULLIF(btrim(EXCLUDED.name), ''), public.growth_forms.name),
      schema_json         = EXCLUDED.schema_json,
      success_action_json = COALESCE(EXCLUDED.success_action_json, public.growth_forms.success_action_json),
      auto_create_contact = EXCLUDED.auto_create_contact,
      pipeline_id         = COALESCE(EXCLUDED.pipeline_id, public.growth_forms.pipeline_id),
      stage_id            = COALESCE(EXCLUDED.stage_id, public.growth_forms.stage_id)
    RETURNING * INTO _row;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'growth_forms', 'growth_form_upsert', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'slug', _row.slug));

  RETURN _row;
END;
$$;

-- ============================================================
-- 3. Re-emit grants for the two re-declared functions (identical to live)
-- ============================================================
REVOKE ALL ON FUNCTION public.growth_page_upsert(uuid, text, text, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_page_upsert(uuid, text, text, jsonb, jsonb, jsonb, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.growth_form_upsert(uuid, text, text, jsonb, jsonb, boolean, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_form_upsert(uuid, text, text, jsonb, jsonb, boolean, uuid, uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- 4. growth_funnel_sessions — funnel progress's missing home (blueprint B4 IDOR fix)
-- ============================================================
-- growth_form_submissions.funnel_session_id (text, :144) already links here via
-- session_token. The base migration modeled a permissive anon write on the sessions idea;
-- here the ONLY write path is the DEFINER RPC below — no anon write grants, no public
-- write/advance policies. That closes the IDOR (anyone could otherwise UPDATE any session /
-- rewind any step). Tenant is pinned to the referenced funnel; the step is monotonic.
CREATE TABLE IF NOT EXISTS public.growth_funnel_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,        -- the client-facing funnel_session_id (unguessable)
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  funnel_id     uuid NOT NULL REFERENCES public.growth_funnels(id) ON DELETE CASCADE,
  current_step  int  NOT NULL DEFAULT 0,     -- monotonic — the RPC never decrements it
  completed     boolean NOT NULL DEFAULT false,
  utm_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  referrer      text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_funnel_sessions_funnel
  ON public.growth_funnel_sessions (funnel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_funnel_sessions_tenant
  ON public.growth_funnel_sessions (tenant_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_growth_funnel_sessions_updated ON public.growth_funnel_sessions;
CREATE TRIGGER trg_growth_funnel_sessions_updated BEFORE UPDATE ON public.growth_funnel_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- B4: strip any anon write grant and force writes through the RPC only. authenticated keeps
-- READ (tenant analytics) but never a direct write; service-role is full.
REVOKE ALL ON public.growth_funnel_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.growth_funnel_sessions FROM authenticated;
GRANT SELECT ON public.growth_funnel_sessions TO authenticated;
GRANT ALL ON public.growth_funnel_sessions TO service_role;
ALTER TABLE public.growth_funnel_sessions ENABLE ROW LEVEL SECURITY;

-- B4: drop any public write/advance policies a prior lane draft may have created.
DROP POLICY IF EXISTS "growth_funnel_sessions_public_insert"  ON public.growth_funnel_sessions;
DROP POLICY IF EXISTS "growth_funnel_sessions_public_update"  ON public.growth_funnel_sessions;
DROP POLICY IF EXISTS "growth_funnel_sessions_public_advance" ON public.growth_funnel_sessions;

DROP POLICY IF EXISTS "growth_funnel_sessions_tenant_read" ON public.growth_funnel_sessions;
CREATE POLICY "growth_funnel_sessions_tenant_read" ON public.growth_funnel_sessions
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id()
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'coach'));

-- RPC-only writer (mirrors paige_actions / the automations no-direct-write pattern).
DROP POLICY IF EXISTS "growth_funnel_sessions_no_direct_write" ON public.growth_funnel_sessions;
CREATE POLICY "growth_funnel_sessions_no_direct_write" ON public.growth_funnel_sessions
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ============================================================
-- 5. growth_funnel_session_upsert — the ONLY write path (DEFINER, tenant-pinned, monotonic)
-- ============================================================
-- Public funnel visitors are anon, so anon MUST be able to progress a session — but only
-- through this guarded DEFINER function, never a raw table write. The function pins tenant
-- to the referenced funnel (client-supplied tenant IGNORED for anon), allows anon writes
-- only against a LIVE ('active') funnel, generates an unguessable session_token on create
-- (the visitor's ownership proof for later advances), and advances the step MONOTONICALLY
-- (GREATEST — never rewinds). This is the B4 IDOR fix in function form.
CREATE OR REPLACE FUNCTION public.growth_funnel_session_upsert(
  p_funnel_id     uuid,
  p_session_token text    DEFAULT NULL,   -- NULL/empty => create a new session
  p_step          int     DEFAULT 0,
  p_completed     boolean DEFAULT NULL,
  p_utm_json      jsonb   DEFAULT NULL,
  p_referrer      text    DEFAULT NULL,
  p_user_agent    text    DEFAULT NULL,
  p_tenant_id     uuid    DEFAULT NULL    -- honored only for service-role; must match funnel
)
RETURNS public.growth_funnel_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _funnel public.growth_funnels;
  _tenant uuid;
  _token  text := NULLIF(btrim(p_session_token), '');
  _step   int  := GREATEST(COALESCE(p_step, 0), 0);
  _row    public.growth_funnel_sessions;
BEGIN
  IF p_funnel_id IS NULL THEN
    RAISE EXCEPTION 'GROWTH_FUNNEL_REQUIRED: a funnel id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _funnel FROM public.growth_funnels WHERE id = p_funnel_id;
  IF _funnel.id IS NULL THEN
    RAISE EXCEPTION 'GROWTH_NOT_FOUND: funnel not found' USING ERRCODE = 'P0002';
  END IF;

  -- Tenant is pinned to the FUNNEL's tenant — never a client-supplied id (§9). A JWT caller
  -- must own the funnel (or be admin); an anon visitor may only progress a LIVE funnel; a
  -- service-role caller that names a tenant must match the funnel.
  _tenant := _funnel.tenant_id;
  IF _caller IS NOT NULL THEN
    -- IS DISTINCT FROM (not <>) so a tenantless JWT caller — current_user_tenant_id() = NULL —
    -- is BLOCKED, not silently let through (<> NULL yields NULL, and IF(NULL) never raises).
    IF _funnel.tenant_id IS DISTINCT FROM public.current_user_tenant_id()
       AND NOT public.has_role(_caller, 'admin') THEN
      RAISE EXCEPTION 'GROWTH_FORBIDDEN: funnel belongs to another tenant' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF _funnel.status <> 'active' THEN
      RAISE EXCEPTION 'GROWTH_FUNNEL_INACTIVE: this funnel is not live' USING ERRCODE = '22023';
    END IF;
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> _funnel.tenant_id THEN
      RAISE EXCEPTION 'GROWTH_TENANT_MISMATCH: tenant does not match funnel' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF _token IS NULL THEN
    -- Create a fresh session with a server-generated unguessable token.
    INSERT INTO public.growth_funnel_sessions (
      session_token, tenant_id, funnel_id, current_step, completed, utm_json, referrer, user_agent
    ) VALUES (
      'fs_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      _tenant, p_funnel_id, _step, COALESCE(p_completed, false),
      COALESCE(p_utm_json, '{}'::jsonb), p_referrer, p_user_agent
    )
    RETURNING * INTO _row;
  ELSE
    -- Advance an existing session — step is monotonic (GREATEST), tenant/funnel pinned.
    UPDATE public.growth_funnel_sessions SET
      current_step = GREATEST(current_step, _step),
      completed    = COALESCE(p_completed, completed),
      utm_json     = CASE WHEN p_utm_json IS NULL OR p_utm_json = '{}'::jsonb THEN utm_json ELSE p_utm_json END,
      referrer     = COALESCE(referrer, p_referrer),
      user_agent   = COALESCE(user_agent, p_user_agent)
    WHERE session_token = _token AND funnel_id = p_funnel_id AND tenant_id = _tenant
    RETURNING * INTO _row;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'GROWTH_NOT_FOUND: funnel session not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN _row;
END;
$$;

-- anon must EXECUTE (public funnel visitor path); the DEFINER body is the guard.
REVOKE ALL ON FUNCTION public.growth_funnel_session_upsert(uuid, text, int, boolean, jsonb, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.growth_funnel_session_upsert(uuid, text, int, boolean, jsonb, text, text, uuid) TO anon, authenticated, service_role;

-- ============================================================
-- 6. Funnel page steps require a PUBLISHED page (blueprint B5)
-- ============================================================
-- Funnel-embedded page steps rely on the existing growth_pages_public_read_published
-- policy — an anon visitor reads a funnel's page step only when that page is published.
-- v1 does not support funnel-embedded unpublished pages. Drop the redundant funnel-scoped
-- page-read policy ("policy D") if a prior lane draft created it (no-op otherwise).
DROP POLICY IF EXISTS "growth_pages_funnel_public_read" ON public.growth_pages;
