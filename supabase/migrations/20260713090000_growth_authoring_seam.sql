-- Growth authoring seam (§10) — the tenant-scoped RPCs Paige (and the tenant UI /
-- generator) drive to build a branded landing page + lead form from a sentence and
-- publish it to a live URL. Every writer — the editor Save button, the vibe-coding
-- generator, and Paige's growth tools — lands here through one guarded seam, so Paige
-- can author pages/forms end-to-end with no human in the UI (§10). Tenant-authored and
-- tenant-scoped (§9); coaching-generic (§2) — nothing vertical is seeded here.
--
-- Guard/grant/audit shape copied verbatim from save_marketing_content
-- (20260711120000_marketing_content_library.sql): dual-caller (trusted service-role for
-- Paige, admin|coach|super_admin for JWT callers), SECURITY DEFINER + SET search_path,
-- tenant pinned server-side (JWT caller -> current_user_tenant_id(), NEVER a client id;
-- service-role -> explicit param), REVOKE from public/anon, GRANT authenticated +
-- service_role, structured RAISE EXCEPTION, audit_logs insert on write.

-- 1. Draft-safe publish columns. The public renderer keeps reading the LIVE blocks_json
--    (only 'published' rows are anon-readable); the editor/generator write draft_* and a
--    publish step copies draft -> live. So editing a live page never mutates what the
--    public sees until an explicit, placeholder-guarded publish.
ALTER TABLE public.growth_pages
  ADD COLUMN IF NOT EXISTS draft_blocks_json jsonb,
  ADD COLUMN IF NOT EXISTS draft_theme_json  jsonb,
  ADD COLUMN IF NOT EXISTS draft_seo_json    jsonb;

-- ============================================================
-- 2. growth_page_upsert — insert/update a page's DRAFT content
-- ============================================================
-- Dual-caller: JWT admin|coach|super_admin, or trusted service-role for Paige. Writes
-- draft_* only (never live). Server-side validates blocks_json is a well-formed
-- GrowthBlock array before it ever touches the row (§13 correctness by construction).
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
    IF _btype IS NULL OR _btype NOT IN
       ('hero','phase_cards','feature_grid','cta','rich_text','embedded_form') THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: unknown block type %', COALESCE(_btype, '(null)')
        USING ERRCODE = '22023';
    END IF;
    IF _btype = 'rich_text' AND char_length(COALESCE(_block->>'html', '')) > 20000 THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: rich_text html exceeds 20000 characters'
        USING ERRCODE = '22023';
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
-- 3. growth_page_publish — copy DRAFT -> LIVE and go public
-- ============================================================
-- Same tenant resolution + role gate. §15 placeholder guard rejects unresolved
-- [PLACEHOLDER] tokens before anything goes live. Returns the REAL resolved public URL
-- (§13 truthful) — never a blind "it's live".
CREATE OR REPLACE FUNCTION public.growth_page_publish(
  p_tenant_id uuid,
  p_id        uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _row    public.growth_pages;
  _tenant_slug text;
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

  SELECT * INTO _row FROM public.growth_pages WHERE id = p_id AND tenant_id = _tenant;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'GROWTH_NOT_FOUND: page not found in this tenant' USING ERRCODE = 'P0002';
  END IF;

  -- There must be draft content to publish, and it must be a valid array.
  IF _row.draft_blocks_json IS NULL OR jsonb_typeof(_row.draft_blocks_json) <> 'array' THEN
    RAISE EXCEPTION 'GROWTH_NO_DRAFT: nothing to publish — save draft blocks first'
      USING ERRCODE = '22023';
  END IF;

  -- §15 placeholder guard: refuse to publish unresolved [PLACEHOLDER] tokens.
  IF _row.draft_blocks_json::text ~ '\[[A-Z_]{3,}\]'
     OR COALESCE(_row.draft_seo_json::text, '') ~ '\[[A-Z_]{3,}\]' THEN
    RAISE EXCEPTION 'GROWTH_UNRESOLVED_PLACEHOLDER: page has unresolved [PLACEHOLDER] tokens — fill them before publishing'
      USING ERRCODE = '22023';
  END IF;

  -- Copy draft -> live and go published. Theme/SEO fall back to existing live when no
  -- draft override was set.
  UPDATE public.growth_pages SET
    blocks_json  = draft_blocks_json,
    theme_json   = COALESCE(draft_theme_json, theme_json),
    seo_json     = COALESCE(draft_seo_json, seo_json),
    status       = 'published',
    published_at = now()
  WHERE id = _row.id AND tenant_id = _tenant
  RETURNING * INTO _row;

  SELECT slug INTO _tenant_slug FROM public.tenants WHERE id = _tenant;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'growth_pages', 'growth_page_publish', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'slug', _row.slug));

  RETURN jsonb_build_object(
    'id',          _row.id,
    'slug',        _row.slug,
    'tenant_slug', _tenant_slug,
    'status',      _row.status,
    'published_at', _row.published_at,
    'url',         '/p/' || _tenant_slug || '/' || _row.slug
  );
END;
$$;

-- ============================================================
-- 4. growth_form_upsert — insert/update a lead form
-- ============================================================
-- Same dual-caller contract. schema_json is validated to a GrowthFormSchema shape
-- ({sections:[…]} or a bare array of sections). status defaults 'active' so the public
-- form renderer (growth_forms_public_read_active) can read it immediately.
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
-- 5. Grants — REVOKE from public/anon, GRANT authenticated + service_role
-- ============================================================
REVOKE ALL ON FUNCTION public.growth_page_upsert(uuid, text, text, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_page_upsert(uuid, text, text, jsonb, jsonb, jsonb, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.growth_page_publish(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_page_publish(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.growth_form_upsert(uuid, text, text, jsonb, jsonb, boolean, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_form_upsert(uuid, text, text, jsonb, jsonb, boolean, uuid, uuid, uuid) TO authenticated, service_role;
