-- 20260715123000_growth_page_form_schema.sql
-- Extends growth_page_upsert with an optional REAL form schema, replacing the hardcoded
-- generic 3-field synthesis only when the caller supplies one (Vibe Studio probing fix).
-- Idempotency (ON CONFLICT DO NOTHING) is UNCHANGED — an operator's later manual edit to a
-- form is never clobbered, whether the original schema was generic or real.

-- 1. Shared form-schema validator, extracted to mirror growth_validate_blocks's own
--    extraction (this file's own migration 20260714091000 set that precedent). Faithful
--    copy of growth_form_upsert's existing inline checks (20260714090000_..., lines 243-329) —
--    behavior is byte-identical, just reusable. growth_form_upsert itself is NOT migrated to
--    call this in this pass (out of scope) — tracked exactly like growth-blocks.ts's own
--    documented follow-up for growth-page-draft's un-migrated copy.
CREATE OR REPLACE FUNCTION public.growth_validate_form_schema(p_schema jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _schema_ok boolean; _sections jsonb; _section jsonb; _field jsonb;
  _vw jsonb; _cond jsonb; _seen text[] := ARRAY[]::text[];
  _key text; _ftype text; _maps text; _fieldcount int := 0;
BEGIN
  _schema_ok := p_schema IS NOT NULL AND (
       (jsonb_typeof(p_schema) = 'object' AND jsonb_typeof(p_schema->'sections') = 'array')
    OR (jsonb_typeof(p_schema) = 'array'));
  IF NOT _schema_ok THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: schema_json must be {sections:[…]} or an array of sections' USING ERRCODE = '22023';
  END IF;

  _sections := CASE WHEN jsonb_typeof(p_schema) = 'array' THEN p_schema ELSE p_schema->'sections' END;
  IF jsonb_array_length(_sections) > 40 THEN
    RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: too many sections (max 40)' USING ERRCODE = '22023';
  END IF;

  FOR _section IN SELECT value FROM jsonb_array_elements(_sections) LOOP
    _vw := _section->'visible_when';
    IF jsonb_typeof(_vw) = 'object' THEN
      FOR _cond IN SELECT value FROM jsonb_array_elements(
             (CASE WHEN jsonb_typeof(_vw->'all') = 'array' THEN _vw->'all' ELSE '[]'::jsonb END)
          || (CASE WHEN jsonb_typeof(_vw->'any') = 'array' THEN _vw->'any' ELSE '[]'::jsonb END)) LOOP
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
      _vw := _field->'visible_when';
      IF jsonb_typeof(_vw) = 'object' THEN
        FOR _cond IN SELECT value FROM jsonb_array_elements(
               (CASE WHEN jsonb_typeof(_vw->'all') = 'array' THEN _vw->'all' ELSE '[]'::jsonb END)
            || (CASE WHEN jsonb_typeof(_vw->'any') = 'array' THEN _vw->'any' ELSE '[]'::jsonb END)) LOOP
          IF _cond->>'field' IS NULL OR NOT (_cond->>'field' = ANY(_seen)) THEN
            RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" branches on unknown or later field "%"',
              _key, COALESCE(_cond->>'field', '(null)') USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END IF;
      IF _key = ANY(_seen) THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: duplicate field key "%"', _key USING ERRCODE = '22023';
      END IF;
      _ftype := _field->>'type';
      IF _ftype IN ('select','radio','checkbox') THEN
        IF jsonb_typeof(_field->'options') <> 'array' OR jsonb_array_length(_field->'options') = 0 THEN
          RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" (%) needs at least one option', _key, _ftype USING ERRCODE = '22023';
        END IF;
      END IF;
      _maps := NULLIF(btrim(COALESCE(_field->>'maps_to', '')), '');
      IF _maps IS NOT NULL AND _maps !~ '^(clients|businesses)\.[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_SCHEMA: field "%" maps_to must target clients.<column> or businesses.<column>', _key USING ERRCODE = '22023';
      END IF;
      _seen := array_append(_seen, _key);
    END LOOP;
  END LOOP;
END; $function$;

REVOKE ALL ON FUNCTION public.growth_validate_form_schema(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_validate_form_schema(jsonb) TO authenticated, service_role;

-- 2. growth_page_upsert — DROP the live 7-arg signature, CREATE the 8-arg replacement.
--    Only two deltas vs. the live body (20260714091000_...:124-202): (a) validate
--    p_form_schema_json when supplied, (b) COALESCE it into the auto-form-authoring INSERT in
--    place of the hardcoded literal. Everything else — guards, ON CONFLICT DO NOTHING, audit
--    log — is verbatim.
DROP FUNCTION IF EXISTS public.growth_page_upsert(uuid, text, text, jsonb, jsonb, jsonb, uuid);

CREATE FUNCTION public.growth_page_upsert(
  p_tenant_id uuid, p_slug text, p_title text, p_blocks_json jsonb,
  p_theme_json jsonb DEFAULT NULL::jsonb, p_seo_json jsonb DEFAULT NULL::jsonb,
  p_id uuid DEFAULT NULL::uuid,
  p_form_schema_json jsonb DEFAULT NULL::jsonb   -- NEW, trailing, optional
)
 RETURNS growth_pages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _slug   text := NULLIF(btrim(p_slug), '');
  _row    public.growth_pages;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'GROWTH_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
  ELSE
    _tenant := p_tenant_id;
  END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'GROWTH_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _slug IS NULL THEN RAISE EXCEPTION 'GROWTH_INVALID_SLUG: a non-empty slug is required' USING ERRCODE = '22023'; END IF;

  PERFORM public.growth_validate_blocks(p_blocks_json);

  -- NEW: validate the caller-supplied schema, if any, with the SAME shared validator
  -- growth_form_upsert's inline logic mirrors — so anything that reaches the INSERT below is
  -- guaranteed valid (defense in depth; growth-page-draft's TS-side cleanFormSchema already
  -- guarantees this in practice, exactly as validateBlock does for blocks).
  IF p_form_schema_json IS NOT NULL THEN
    PERFORM public.growth_validate_form_schema(p_form_schema_json);
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.growth_pages SET
      slug = _slug, title = COALESCE(NULLIF(btrim(p_title), ''), title),
      draft_blocks_json = p_blocks_json,
      draft_theme_json  = COALESCE(p_theme_json, draft_theme_json),
      draft_seo_json    = COALESCE(p_seo_json, draft_seo_json)
    WHERE id = p_id AND tenant_id = _tenant RETURNING * INTO _row;
    IF _row.id IS NULL THEN RAISE EXCEPTION 'GROWTH_NOT_FOUND: page not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  ELSE
    INSERT INTO public.growth_pages (tenant_id, slug, title, status, created_by, draft_blocks_json, draft_theme_json, draft_seo_json)
    VALUES (_tenant, _slug, COALESCE(NULLIF(btrim(p_title), ''), 'Untitled'), 'draft', _caller, p_blocks_json, p_theme_json, p_seo_json)
    ON CONFLICT (tenant_id, slug) DO UPDATE SET
      title = COALESCE(NULLIF(btrim(EXCLUDED.title), ''), public.growth_pages.title),
      draft_blocks_json = EXCLUDED.draft_blocks_json,
      draft_theme_json  = COALESCE(EXCLUDED.draft_theme_json, public.growth_pages.draft_theme_json),
      draft_seo_json    = COALESCE(EXCLUDED.draft_seo_json, public.growth_pages.draft_seo_json)
    RETURNING * INTO _row;
  END IF;

  -- Auto-author a backing form for every embedded_form block with no form yet. CHANGED: uses
  -- the caller's REAL schema when supplied, falling back to the generic 3-field synthesis
  -- otherwise. ON CONFLICT DO NOTHING is UNCHANGED — never overwrites an operator's edit.
  INSERT INTO public.growth_forms (tenant_id, slug, name, status, schema_json, success_action_json, auto_create_contact, created_by)
  SELECT _tenant, fs.form_slug,
         left(COALESCE(NULLIF(btrim(p_title), ''), 'Signup'), 80) || ' — signup',
         'active',
         COALESCE(p_form_schema_json, jsonb_build_object(
           'submit_label', 'Count me in',
           'sections', jsonb_build_array(jsonb_build_object(
             'title', '',
             'fields', jsonb_build_array(
               jsonb_build_object('key', 'full_name', 'label', 'Your name', 'type', 'text', 'required', true),
               jsonb_build_object('key', 'email', 'label', 'Email', 'type', 'email', 'required', true, 'maps_to', 'clients.email'),
               jsonb_build_object('key', 'goal', 'label', 'What are you hoping to get out of this?', 'type', 'textarea', 'required', false)
             )
           ))
         )),
         '{"type":"thank_you","message":"Thanks — we''ll be in touch."}'::jsonb,
         true, _caller
  FROM (
    SELECT DISTINCT btrim(b->>'form_slug') AS form_slug
    FROM jsonb_array_elements(p_blocks_json) b
    WHERE b->>'type' = 'embedded_form'
      AND NULLIF(btrim(COALESCE(b->>'form_slug', '')), '') IS NOT NULL
  ) fs
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'growth_pages', 'growth_page_upsert', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'slug', _row.slug, 'blocks', jsonb_array_length(p_blocks_json)));
  RETURN _row;
END; $function$;

REVOKE ALL ON FUNCTION public.growth_page_upsert(uuid,text,text,jsonb,jsonb,jsonb,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_page_upsert(uuid,text,text,jsonb,jsonb,jsonb,uuid,jsonb) TO authenticated, service_role;
