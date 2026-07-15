-- 20260714091000_growth_authoring_seams.sql
-- Vibe Coding Studio · Phase 1 · WS-D (coordinated with WS-A). Blueprint §3.
--
-- Authoring seams that both the Studio buttons and Paige's tools bottom out in — one
-- tenant-safe rail, two callers (§10). Nothing here touches the auth lane: has_any_role /
-- current_user_tenant_id() are REUSED unchanged, never redefined. Every DEFINER RPC pins
-- JWT callers to current_user_tenant_id() (client tenant ids IGNORED for JWT callers);
-- service-role may name a tenant. All new/replaced functions REVOKE FROM PUBLIC, anon and
-- GRANT authenticated, service_role.
--
-- Contents:
--   1. growth_validate_blocks(jsonb)         — the shared 17-type block validator (extracted
--                                              so page_upsert and page_edit_blocks never diverge)
--   2. growth_page_upsert (CREATE OR REPLACE) — full body re-declared; validator loop replaced
--                                              by the shared helper; auto-form authoring moved in
--   3. growth_funnel_upsert(...)             — DEFINER, tenant-pinned; resolves identity/ownership
--                                              BEFORE any write (B18); writes the REAL page_id/form_id
--                                              FK columns; DRAFT only (status='draft')
--   4. growth_funnel_publish(...)            — refuses unpublished-page / inactive-form steps;
--                                              returns the real /f/<tenant>/<slug> URL
--   5. growth_page_edit_blocks(...)          — read-modify-write, B17 fallback to blocks_json,
--                                              re-validates with the shared helper
--   6. De-finance the funnel-architect sub-agent seed (§2/§9 platform-default cleanliness)

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Shared block validator (WS-A/WS-D lockstep helper).
--    Extracted from the growth_page_upsert validator loop so growth_page_edit_blocks and
--    growth_page_upsert enforce the SAME 17-type contract and can never drift apart.
--    Pure validation — touches no tables. URL-bearing blocks (media/image/gallery) must
--    carry an https URL when present; the generator OMITS them entirely when it has no
--    real URL (never emits placeholder tokens — resolves the generator-vs-validator gap, B6).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_validate_blocks(p_blocks jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _block jsonb;
  _btype text;
  _url   text;
  _img   jsonb;
BEGIN
  IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' THEN
    RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: blocks_json must be a JSON array' USING ERRCODE = '22023';
  END IF;
  FOR _block IN SELECT value FROM jsonb_array_elements(p_blocks) LOOP
    IF jsonb_typeof(_block) <> 'object' THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: each block must be an object' USING ERRCODE = '22023';
    END IF;
    _btype := _block->>'type';
    IF _btype IS NULL OR _btype NOT IN (
      'hero','phase_cards','feature_grid','cta','rich_text','embedded_form',
      'social_proof','testimonial','pricing','faq','media','stats','countdown',
      'two_column','image','gallery','steps'
    ) THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: unknown block type %', COALESCE(_btype, '(null)') USING ERRCODE = '22023';
    END IF;

    IF _btype = 'rich_text' AND char_length(COALESCE(_block->>'html', '')) > 20000 THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: rich_text html exceeds 20000 characters' USING ERRCODE = '22023';
    END IF;

    IF _btype = 'media' THEN
      IF COALESCE(_block->>'provider', '') NOT IN ('youtube','vimeo','loom','mp4') THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: media.provider must be one of youtube, vimeo, loom, mp4' USING ERRCODE = '22023';
      END IF;
      _url := _block->>'url';
      IF _url IS NULL OR _url !~ '^https://' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: media.url must be an https URL' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF _btype = 'image' THEN
      _url := _block->>'url';
      IF _url IS NULL OR _url !~ '^https://' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: image.url must be an https URL' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF _btype = 'gallery' THEN
      IF jsonb_typeof(_block->'images') <> 'array' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: gallery.images must be an array' USING ERRCODE = '22023';
      END IF;
      FOR _img IN SELECT value FROM jsonb_array_elements(_block->'images') LOOP
        _url := _img->>'url';
        IF _url IS NULL OR _url !~ '^https://' THEN
          RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: gallery image url must be an https URL' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    IF _btype = 'countdown' THEN
      IF NULLIF(btrim(COALESCE(_block->>'ends_at', '')), '') IS NULL THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: countdown.ends_at is required' USING ERRCODE = '22023';
      END IF;
      BEGIN
        PERFORM (_block->>'ends_at')::timestamptz;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: countdown.ends_at must be a valid timestamp' USING ERRCODE = '22023';
      END;
    END IF;
  END LOOP;
END; $function$;

REVOKE ALL ON FUNCTION public.growth_validate_blocks(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_validate_blocks(jsonb) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. growth_page_upsert — CREATE OR REPLACE, FULL body re-declared.
--    Deltas vs. the live body (all guards / audit / grants preserved verbatim):
--      (a) the inline block-validator loop is replaced by growth_validate_blocks() — the
--          shared helper — so edit_blocks and upsert can never diverge;
--      (b) auto-form authoring is MOVED here from paige-ai-chat:5932-5969 so the Studio Save
--          button (not just the Paige chat tool) gets a backing active growth_forms row for
--          every embedded_form block (§10 / B1). Idempotent (ON CONFLICT DO NOTHING) — never
--          overwrites a form the operator already customized. maps_to uses the physical
--          clients.* namespace (not the non-existent contacts.*), per §3.
--    NOTE (coordination with m1 20260714090000): m1 also CREATE OR REPLACEs this function with
--    an inline 17-type validator. This migration runs AFTER m1 and is the authoritative final
--    body. See open_risks for the recommended reconciliation.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_page_upsert(p_tenant_id uuid, p_slug text, p_title text, p_blocks_json jsonb, p_theme_json jsonb DEFAULT NULL::jsonb, p_seo_json jsonb DEFAULT NULL::jsonb, p_id uuid DEFAULT NULL::uuid)
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

  -- Shared 17-type block validation (never diverges from growth_page_edit_blocks).
  PERFORM public.growth_validate_blocks(p_blocks_json);

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

  -- Auto-author a backing form for every embedded_form block that has no form yet, so the
  -- published page never renders an INVISIBLE signup and publish never falsely reports success
  -- (§10 / lead-capture B1). Idempotent: ON CONFLICT DO NOTHING preserves any form the operator
  -- already customized. Coaching-generic defaults (name / email / goal), §2-clean.
  INSERT INTO public.growth_forms (tenant_id, slug, name, status, schema_json, success_action_json, auto_create_contact, created_by)
  SELECT _tenant, fs.form_slug,
         left(COALESCE(NULLIF(btrim(p_title), ''), 'Signup'), 80) || ' — signup',
         'active',
         jsonb_build_object(
           'submit_label', 'Count me in',
           'sections', jsonb_build_array(jsonb_build_object(
             'title', '',
             'fields', jsonb_build_array(
               jsonb_build_object('key', 'full_name', 'label', 'Your name', 'type', 'text', 'required', true),
               jsonb_build_object('key', 'email', 'label', 'Email', 'type', 'email', 'required', true, 'maps_to', 'clients.email'),
               jsonb_build_object('key', 'goal', 'label', 'What are you hoping to get out of this?', 'type', 'textarea', 'required', false)
             )
           ))
         ),
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

REVOKE ALL ON FUNCTION public.growth_page_upsert(uuid,text,text,jsonb,jsonb,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_page_upsert(uuid,text,text,jsonb,jsonb,jsonb,uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. growth_funnel_upsert — DEFINER, tenant-pinned, modeled on growth_page_upsert.
--    B18: resolve p_id/slug identity + ownership and resolve/guard every step's page/form
--    reference BEFORE any INSERT/UPDATE, so a bad reference aborts before any mutation and
--    an ON-CONFLICT can never mutate a different funnel. Writes the REAL page_id/form_id FK
--    columns (resolving page_slug/form_slug server-side, cross-tenant-guarded); config_json
--    carries only booking/payment/thankyou extras. Writes DRAFT (status='draft' on create;
--    status left untouched on edit). Go-live is a separate step: growth_funnel_publish flips
--    to 'active' (the funnels CHECK has no 'published').
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_funnel_upsert(
  p_tenant_id uuid,
  p_slug text,
  p_name text,
  p_goal text DEFAULT NULL::text,
  p_steps jsonb DEFAULT NULL::jsonb,
  p_entry_page_id uuid DEFAULT NULL::uuid,
  p_success_page_id uuid DEFAULT NULL::uuid,
  p_id uuid DEFAULT NULL::uuid)
 RETURNS growth_funnels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _slug   text := NULLIF(btrim(p_slug), '');
  _row    public.growth_funnels;
  _existing_id uuid;
  _resolved_steps jsonb := '[]'::jsonb;
  _step   jsonb;
  _stype  text;
  _oidx   int;
  _pid    uuid;
  _fid    uuid;
  _i      int := 0;
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

  -- Cross-tenant guards on the funnel-level entry/success pages (BEFORE any write).
  IF p_entry_page_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.growth_pages WHERE id = p_entry_page_id AND tenant_id = _tenant) THEN
    RAISE EXCEPTION 'GROWTH_ENTRY_PAGE_NOT_FOUND: entry page is not in this tenant' USING ERRCODE = '22023';
  END IF;
  IF p_success_page_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.growth_pages WHERE id = p_success_page_id AND tenant_id = _tenant) THEN
    RAISE EXCEPTION 'GROWTH_SUCCESS_PAGE_NOT_FOUND: success page is not in this tenant' USING ERRCODE = '22023';
  END IF;

  -- Resolve + guard every step's page/form reference BEFORE any write (B18). page_slug/form_slug
  -- are resolved to the REAL FK ids server-side; a reference outside this tenant aborts here.
  IF p_steps IS NOT NULL THEN
    IF jsonb_typeof(p_steps) <> 'array' THEN
      RAISE EXCEPTION 'GROWTH_INVALID_STEPS: p_steps must be a JSON array' USING ERRCODE = '22023';
    END IF;
    FOR _step IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
      IF jsonb_typeof(_step) <> 'object' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_STEPS: each step must be an object' USING ERRCODE = '22023';
      END IF;
      _stype := _step->>'step_type';
      IF _stype IS NULL OR _stype NOT IN ('page','form','payment','booking','thankyou') THEN
        RAISE EXCEPTION 'GROWTH_INVALID_STEPS: unknown step_type %', COALESCE(_stype, '(null)') USING ERRCODE = '22023';
      END IF;
      _oidx := COALESCE(NULLIF(_step->>'order_index', '')::int, _i);
      _pid := NULL;
      _fid := NULL;

      IF NULLIF(btrim(COALESCE(_step->>'page_id', '')), '') IS NOT NULL THEN
        _pid := (_step->>'page_id')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.growth_pages WHERE id = _pid AND tenant_id = _tenant) THEN
          RAISE EXCEPTION 'GROWTH_STEP_PAGE_NOT_FOUND: a step page is not in this tenant' USING ERRCODE = '22023';
        END IF;
      ELSIF NULLIF(btrim(COALESCE(_step->>'page_slug', '')), '') IS NOT NULL THEN
        SELECT id INTO _pid FROM public.growth_pages WHERE tenant_id = _tenant AND slug = btrim(_step->>'page_slug');
        IF _pid IS NULL THEN
          RAISE EXCEPTION 'GROWTH_STEP_PAGE_NOT_FOUND: no page with slug % in this tenant', _step->>'page_slug' USING ERRCODE = '22023';
        END IF;
      END IF;

      IF NULLIF(btrim(COALESCE(_step->>'form_id', '')), '') IS NOT NULL THEN
        _fid := (_step->>'form_id')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.growth_forms WHERE id = _fid AND tenant_id = _tenant) THEN
          RAISE EXCEPTION 'GROWTH_STEP_FORM_NOT_FOUND: a step form is not in this tenant' USING ERRCODE = '22023';
        END IF;
      ELSIF NULLIF(btrim(COALESCE(_step->>'form_slug', '')), '') IS NOT NULL THEN
        SELECT id INTO _fid FROM public.growth_forms WHERE tenant_id = _tenant AND slug = btrim(_step->>'form_slug');
        IF _fid IS NULL THEN
          RAISE EXCEPTION 'GROWTH_STEP_FORM_NOT_FOUND: no form with slug % in this tenant', _step->>'form_slug' USING ERRCODE = '22023';
        END IF;
      END IF;

      _resolved_steps := _resolved_steps || jsonb_build_object(
        'order_index', _oidx,
        'step_type', _stype,
        'page_id', _pid,
        'form_id', _fid,
        'config_json', COALESCE(_step->'config_json', '{}'::jsonb));
      _i := _i + 1;
    END LOOP;
  END IF;

  -- Resolve identity + ownership BEFORE any write (B18 — no ON-CONFLICT-mutates-wrong-funnel).
  IF p_id IS NOT NULL THEN
    SELECT id INTO _existing_id FROM public.growth_funnels WHERE id = p_id AND tenant_id = _tenant;
    IF _existing_id IS NULL THEN
      RAISE EXCEPTION 'GROWTH_NOT_FOUND: funnel not found in this tenant' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT id INTO _existing_id FROM public.growth_funnels WHERE tenant_id = _tenant AND slug = _slug;
  END IF;

  IF _existing_id IS NOT NULL THEN
    UPDATE public.growth_funnels SET
      slug = _slug,
      name = COALESCE(NULLIF(btrim(p_name), ''), name),
      goal = COALESCE(p_goal, goal),
      entry_page_id = COALESCE(p_entry_page_id, entry_page_id),
      success_page_id = COALESCE(p_success_page_id, success_page_id),
      updated_at = now()
    WHERE id = _existing_id AND tenant_id = _tenant RETURNING * INTO _row;
  ELSE
    INSERT INTO public.growth_funnels (tenant_id, slug, name, goal, status, entry_page_id, success_page_id, created_by)
    VALUES (_tenant, _slug, COALESCE(NULLIF(btrim(p_name), ''), 'Untitled funnel'), p_goal, 'draft', p_entry_page_id, p_success_page_id, _caller)
    RETURNING * INTO _row;
  END IF;

  -- Full-replace the step list only when the caller supplied one (NULL = leave steps as-is).
  IF p_steps IS NOT NULL THEN
    DELETE FROM public.growth_funnel_steps WHERE funnel_id = _row.id;
    INSERT INTO public.growth_funnel_steps (funnel_id, tenant_id, order_index, step_type, page_id, form_id, config_json)
    SELECT _row.id, _tenant,
           (s->>'order_index')::int,
           s->>'step_type',
           NULLIF(s->>'page_id', '')::uuid,
           NULLIF(s->>'form_id', '')::uuid,
           COALESCE(s->'config_json', '{}'::jsonb)
    FROM jsonb_array_elements(_resolved_steps) s;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'growth_funnels', 'growth_funnel_upsert', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'slug', _row.slug, 'steps', jsonb_array_length(_resolved_steps)));
  RETURN _row;
END; $function$;

REVOKE ALL ON FUNCTION public.growth_funnel_upsert(uuid,text,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_funnel_upsert(uuid,text,text,text,jsonb,uuid,uuid,uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. growth_funnel_publish — DEFINER, tenant-pinned. Mirrors growth_page_publish's
--    lead-capture guard: refuses to ship a funnel whose steps reference an unpublished page
--    or an inactive form (and whose entry/success pages aren't published), so a "live" funnel
--    never renders an empty/blank step (§13 truthful reporting). Returns the REAL public URL.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_funnel_publish(p_tenant_id uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _row    public.growth_funnels;
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
  IF _tenant IS NULL THEN RAISE EXCEPTION 'GROWTH_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;

  SELECT * INTO _row FROM public.growth_funnels WHERE id = p_id AND tenant_id = _tenant;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'GROWTH_NOT_FOUND: funnel not found in this tenant' USING ERRCODE = 'P0002'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.growth_funnel_steps WHERE funnel_id = _row.id) THEN
    RAISE EXCEPTION 'GROWTH_FUNNEL_EMPTY: this funnel has no steps yet — add at least one before publishing' USING ERRCODE = '22023';
  END IF;

  -- A page step with no page, or referencing an unpublished page, would render blank.
  IF EXISTS (SELECT 1 FROM public.growth_funnel_steps WHERE funnel_id = _row.id AND step_type = 'page' AND page_id IS NULL) THEN
    RAISE EXCEPTION 'GROWTH_FUNNEL_STEP_INCOMPLETE: a page step has no page attached' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.growth_funnel_steps s
    JOIN public.growth_pages p ON p.id = s.page_id
    WHERE s.funnel_id = _row.id AND s.page_id IS NOT NULL AND p.status <> 'published'
  ) THEN
    RAISE EXCEPTION 'GROWTH_FUNNEL_UNPUBLISHED_PAGE: a step references a page that is not published — publish it first' USING ERRCODE = '22023';
  END IF;

  -- A form step with no form, or referencing an inactive form, would capture nothing.
  IF EXISTS (SELECT 1 FROM public.growth_funnel_steps WHERE funnel_id = _row.id AND step_type = 'form' AND form_id IS NULL) THEN
    RAISE EXCEPTION 'GROWTH_FUNNEL_STEP_INCOMPLETE: a form step has no form attached' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.growth_funnel_steps s
    JOIN public.growth_forms f ON f.id = s.form_id
    WHERE s.funnel_id = _row.id AND s.form_id IS NOT NULL AND f.status <> 'active'
  ) THEN
    RAISE EXCEPTION 'GROWTH_FUNNEL_INACTIVE_FORM: a step references a form that is not active — activate it first' USING ERRCODE = '22023';
  END IF;

  -- Funnel-level entry/success pages must be published too.
  IF _row.entry_page_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.growth_pages WHERE id = _row.entry_page_id AND tenant_id = _tenant AND status = 'published') THEN
    RAISE EXCEPTION 'GROWTH_FUNNEL_UNPUBLISHED_PAGE: the entry page is not published — publish it first' USING ERRCODE = '22023';
  END IF;
  IF _row.success_page_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.growth_pages WHERE id = _row.success_page_id AND tenant_id = _tenant AND status = 'published') THEN
    RAISE EXCEPTION 'GROWTH_FUNNEL_UNPUBLISHED_PAGE: the success page is not published — publish it first' USING ERRCODE = '22023';
  END IF;

  SELECT slug INTO _tenant_slug FROM public.tenants WHERE id = _tenant;
  IF _tenant_slug IS NULL OR btrim(_tenant_slug) = '' THEN
    RAISE EXCEPTION 'GROWTH_NO_TENANT_SLUG: this workspace has no public slug — set one before publishing' USING ERRCODE = '22023';
  END IF;

  UPDATE public.growth_funnels SET status = 'active', updated_at = now()
  WHERE id = _row.id AND tenant_id = _tenant RETURNING * INTO _row;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'growth_funnels', 'growth_funnel_publish', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'slug', _row.slug));

  RETURN jsonb_build_object(
    'id', _row.id, 'slug', _row.slug, 'tenant_slug', _tenant_slug,
    'status', _row.status, 'url', '/f/' || _tenant_slug || '/' || _row.slug);
END; $function$;

REVOKE ALL ON FUNCTION public.growth_funnel_publish(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_funnel_publish(uuid,uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. growth_page_edit_blocks — DEFINER, tenant-pinned. Read-modify-write on the block array
--    with B17 fallback: when draft_blocks_json IS NULL it seeds from the published blocks_json
--    (never a NULL crash on a never-drafted page). Applies index-based ops (last-write-wins;
--    no stable block ids in v1), re-validates with the SHARED growth_validate_blocks (so it
--    can never accept a block the upsert would reject), writes the draft, and returns the full
--    new array for client reconcile.
--    Op grammar (p_ops = ordered JSON array):
--      {op:'set',    blocks:[…]}            — replace the whole array
--      {op:'append', block:{…}}             — add to the end
--      {op:'insert', index:i, block:{…}}    — insert at 0-based index i (0..len)
--      {op:'update', index:i, block:{…}}    — replace the block at index i
--      {op:'remove', index:i}               — delete the block at index i
--      {op:'move',   from:i, to:j}          — move a block from i to j
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_page_edit_blocks(p_tenant_id uuid, p_id uuid, p_ops jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _row    public.growth_pages;
  _arr    jsonb[];
  _op     jsonb;
  _kind   text;
  _idx    int;
  _from   int;
  _to     int;
  _n      int;
  _elem   jsonb;
  _new    jsonb;
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
  IF p_ops IS NULL OR jsonb_typeof(p_ops) <> 'array' THEN
    RAISE EXCEPTION 'GROWTH_INVALID_OPS: p_ops must be a JSON array of edit operations' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.growth_pages WHERE id = p_id AND tenant_id = _tenant;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'GROWTH_NOT_FOUND: page not found in this tenant' USING ERRCODE = 'P0002'; END IF;

  -- B17: fall back to published blocks when there is no draft yet (never NULL-crash).
  _new := COALESCE(
    CASE WHEN jsonb_typeof(_row.draft_blocks_json) = 'array' THEN _row.draft_blocks_json END,
    CASE WHEN jsonb_typeof(_row.blocks_json)       = 'array' THEN _row.blocks_json       END,
    '[]'::jsonb);
  SELECT array_agg(value ORDER BY ord) INTO _arr
    FROM jsonb_array_elements(_new) WITH ORDINALITY AS t(value, ord);
  IF _arr IS NULL THEN _arr := ARRAY[]::jsonb[]; END IF;

  FOR _op IN SELECT value FROM jsonb_array_elements(p_ops) LOOP
    IF jsonb_typeof(_op) <> 'object' THEN
      RAISE EXCEPTION 'GROWTH_INVALID_OPS: each op must be an object' USING ERRCODE = '22023';
    END IF;
    _kind := _op->>'op';
    _n := COALESCE(array_length(_arr, 1), 0);

    IF _kind IN ('set', 'replace_all') THEN
      IF jsonb_typeof(_op->'blocks') <> 'array' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_OPS: set requires a blocks array' USING ERRCODE = '22023';
      END IF;
      SELECT array_agg(value ORDER BY ord) INTO _arr
        FROM jsonb_array_elements(_op->'blocks') WITH ORDINALITY AS t(value, ord);
      IF _arr IS NULL THEN _arr := ARRAY[]::jsonb[]; END IF;

    ELSIF _kind = 'append' THEN
      IF jsonb_typeof(_op->'block') <> 'object' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_OPS: append requires a block object' USING ERRCODE = '22023';
      END IF;
      _arr := array_append(_arr, _op->'block');

    ELSIF _kind = 'insert' THEN
      IF jsonb_typeof(_op->'block') <> 'object' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_OPS: insert requires a block object' USING ERRCODE = '22023';
      END IF;
      _idx := COALESCE(NULLIF(_op->>'index', '')::int, _n);
      IF _idx < 0 OR _idx > _n THEN
        RAISE EXCEPTION 'GROWTH_INVALID_OPS: insert index out of range' USING ERRCODE = '22023';
      END IF;
      _arr := _arr[1:_idx] || ARRAY[_op->'block'] || _arr[_idx+1:_n];

    ELSIF _kind = 'update' THEN
      IF jsonb_typeof(_op->'block') <> 'object' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_OPS: update requires a block object' USING ERRCODE = '22023';
      END IF;
      _idx := NULLIF(_op->>'index', '')::int;
      IF _idx IS NULL OR _idx < 0 OR _idx >= _n THEN
        RAISE EXCEPTION 'GROWTH_INVALID_OPS: update index out of range' USING ERRCODE = '22023';
      END IF;
      _arr[_idx+1] := _op->'block';

    ELSIF _kind = 'remove' THEN
      _idx := NULLIF(_op->>'index', '')::int;
      IF _idx IS NULL OR _idx < 0 OR _idx >= _n THEN
        RAISE EXCEPTION 'GROWTH_INVALID_OPS: remove index out of range' USING ERRCODE = '22023';
      END IF;
      _arr := _arr[1:_idx] || _arr[_idx+2:_n];

    ELSIF _kind = 'move' THEN
      _from := NULLIF(_op->>'from', '')::int;
      _to   := NULLIF(_op->>'to', '')::int;
      IF _from IS NULL OR _to IS NULL OR _from < 0 OR _from >= _n OR _to < 0 OR _to >= _n THEN
        RAISE EXCEPTION 'GROWTH_INVALID_OPS: move index out of range' USING ERRCODE = '22023';
      END IF;
      _elem := _arr[_from+1];
      _arr  := _arr[1:_from] || _arr[_from+2:_n];                       -- remove from source
      _arr  := _arr[1:_to] || ARRAY[_elem] || _arr[_to+1:COALESCE(array_length(_arr, 1), 0)];  -- insert at target

    ELSE
      RAISE EXCEPTION 'GROWTH_INVALID_OPS: unknown op %', COALESCE(_kind, '(null)') USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb) INTO _new
    FROM unnest(_arr) WITH ORDINALITY AS u(e, ord);

  -- Re-validate with the SAME shared helper the upsert uses (they can never diverge).
  PERFORM public.growth_validate_blocks(_new);

  UPDATE public.growth_pages SET draft_blocks_json = _new
  WHERE id = _row.id AND tenant_id = _tenant RETURNING * INTO _row;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'growth_pages', 'growth_page_edit_blocks', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'slug', _row.slug,
                             'ops', jsonb_array_length(p_ops), 'blocks', jsonb_array_length(_new)));

  RETURN _new;
END; $function$;

REVOKE ALL ON FUNCTION public.growth_page_edit_blocks(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_page_edit_blocks(uuid,uuid,jsonb) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. De-finance the funnel-architect sub-agent seed (20260630013222:84).
--    §2/§9 platform-default cleanliness: the platform default must be coaching-generic — no
--    "Borrower-to-Banker" voice, no "3M framework", no vertical/finance wording, and no
--    hardwired house aesthetic (a tenant funnel uses the TENANT's brand, not black/gold/white).
--    Idempotent UPDATE keyed on the stable slug.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.paige_subagents SET
  description = 'Drafts new client-acquisition funnels (landing page + multi-step form + funnel wiring) from a short brief. Outputs are DRAFTS — they land in the Campaigns Hub as unpublished assets for the owner to review and publish.',
  system_prompt = 'You are the Funnel Architect sub-agent for Paige. Given a short brief (offer, audience, primary CTA, success metric), produce a complete draft acquisition funnel for a client-based practice: (1) one landing page with a hero, value props, social-proof slots, and a single primary CTA; (2) one multi-step form (3-5 steps) that captures the qualification details the owner needs; (3) the funnel wiring page -> form -> thank-you. Write in the tenant''s own brand voice, lead with the outcome the client wants, and keep one primary CTA per view. Never publish — always return drafts for the owner to review and publish. Flag anything that needs the owner''s input before it ships.',
  enabled = true
WHERE slug = 'funnel-architect';
