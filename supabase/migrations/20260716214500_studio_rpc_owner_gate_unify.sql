-- Vibe Studio sessions — unify the role gate across ALL RPCs so the tenant OWNER seat works.
--
-- The create-hardening migration (20260716190000) added 'owner' to create_studio_session but
-- left its NINE sibling RPCs on ARRAY['admin','super_admin','coach']. Net effect for a solo
-- tenant owner (the common case the hardening itself named): create succeeds, but the gallery
-- LIST throws STUDIO_FORBIDDEN and never loads, opening a project (touch) fails, and wiring an
-- artifact (link) fails — the primary flow is broken by construction, and the gates drifted.
--
-- Fix (§9/§13): one shared gate `studio_role_ok(uuid)` — owner|admin|super_admin|coach — that
-- EVERY studio RPC calls, so they can never diverge again. All 10 functions are re-declared to
-- route through it; bodies are otherwise byte-for-byte the shipped versions (create keeps its
-- best-effort audit wrapper). Idempotent CREATE OR REPLACE; no data change; safe to re-run.

-- ── the ONE shared gate ────────────────────────────────────────────────────────────────────
-- Staff-only by design; client/consumer seats still can't author. Two sources, OR'd:
--   1. user_roles (has_any_role) — the app-level roles admin/coach (the enum has NO 'owner' or
--      'super_admin', so those two array entries are inert here, kept for forward-compat).
--   2. tenant_members — the tenant's OWN owner/admin membership. This is the load-bearing check:
--      it makes "the person who owns the workspace can build in it" TRUE by construction, instead
--      of relying on the coincidence that owners also happen to carry admin/coach in user_roles.
--      Never grants 'member' (client) seats. STABLE + DEFINER so it reads under the RPCs' authority.
CREATE OR REPLACE FUNCTION public.studio_role_ok(_caller uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_any_role(_caller, ARRAY['owner','admin','super_admin','coach'])
      OR EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = _caller AND tm.status = 'active' AND tm.role IN ('owner','admin')
      );
$$;
REVOKE ALL ON FUNCTION public.studio_role_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_role_ok(uuid) TO authenticated, service_role;

-- ── create_studio_session (keeps the hardening's best-effort audit wrapper) ─────────────────
CREATE OR REPLACE FUNCTION public.create_studio_session(
  p_title text DEFAULT NULL,
  p_seed_brief text DEFAULT NULL,
  p_transcript jsonb DEFAULT '[]'::jsonb,
  p_is_template boolean DEFAULT false,
  p_tenant_id uuid DEFAULT NULL,
  p_owner_user_id uuid DEFAULT NULL
)
RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _owner uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
    _owner  := _caller;
  ELSE
    _tenant := p_tenant_id;
    _owner  := p_owner_user_id;
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF p_transcript IS NOT NULL AND jsonb_typeof(p_transcript) <> 'array' THEN
    RAISE EXCEPTION 'STUDIO_INVALID_TRANSCRIPT: transcript must be a JSON array' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.studio_sessions
    (tenant_id, owner_user_id, title, seed_brief, transcript, is_template, last_opened_at)
  VALUES (_tenant, _owner,
          coalesce(nullif(btrim(p_title), ''), 'Untitled project'),
          nullif(btrim(p_seed_brief), ''),
          coalesce(p_transcript, '[]'::jsonb), coalesce(p_is_template, false), now())
  RETURNING * INTO _row;

  BEGIN
    INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
    VALUES (_caller, 'studio_sessions', 'create_studio_session', _row.id,
            jsonb_build_object('tenant_id', _tenant, 'is_template', _row.is_template));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'create_studio_session: audit write failed (%): %', SQLSTATE, SQLERRM;
  END;

  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.create_studio_session(text, text, jsonb, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_studio_session(text, text, jsonb, boolean, uuid, uuid) TO authenticated, service_role;

-- ── list_studio_sessions ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_studio_sessions(
  p_filter    text DEFAULT 'recent',
  p_tenant_id uuid DEFAULT NULL,
  p_limit     int  DEFAULT 60
)
RETURNS SETOF public.studio_sessions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _is_admin boolean;
  _filter text := lower(coalesce(nullif(btrim(p_filter), ''), 'recent'));
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
  ELSE
    _tenant := p_tenant_id;   -- service_role (Paige) names the tenant
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  _is_admin := (_caller IS NULL) OR public.is_tenant_admin(_tenant);

  RETURN QUERY
  SELECT s.* FROM public.studio_sessions s
  WHERE s.tenant_id = _tenant
    AND s.status <> 'archived'
    AND CASE _filter
      WHEN 'templates' THEN s.is_template
      WHEN 'mine'      THEN s.owner_user_id = _caller AND NOT s.is_template
      WHEN 'starred'   THEN s.starred AND NOT s.is_template
                            AND (_is_admin OR s.owner_user_id = _caller)
      ELSE NOT s.is_template               -- 'recent'
                            AND (_is_admin OR s.owner_user_id = _caller)
    END
  ORDER BY s.last_opened_at DESC
  LIMIT GREATEST(LEAST(coalesce(p_limit, 60), 200), 1);
END; $$;
REVOKE ALL ON FUNCTION public.list_studio_sessions(text, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_studio_sessions(text, uuid, int) TO authenticated, service_role;

-- ── rename_studio_session ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rename_studio_session(
  p_id uuid, p_title text, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN RAISE EXCEPTION 'STUDIO_INVALID_TITLE: a non-empty title is required' USING ERRCODE = '22023'; END IF;
  UPDATE public.studio_sessions SET title = btrim(p_title)
    WHERE id = p_id AND tenant_id = _tenant
      AND (auth.uid() IS NULL OR owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
    RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.rename_studio_session(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_studio_session(uuid, text, uuid) TO authenticated, service_role;

-- ── set_studio_session_starred ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_studio_session_starred(
  p_id uuid, p_starred boolean, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  UPDATE public.studio_sessions SET starred = coalesce(p_starred, false)
    WHERE id = p_id AND tenant_id = _tenant
      AND (auth.uid() IS NULL OR owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
    RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.set_studio_session_starred(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_studio_session_starred(uuid, boolean, uuid) TO authenticated, service_role;

-- ── set_studio_session_status ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_studio_session_status(
  p_id uuid, p_status text, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions; _s text := lower(btrim(p_status));
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _s NOT IN ('draft','building','published','archived') THEN
    RAISE EXCEPTION 'STUDIO_INVALID_STATUS: unknown status' USING ERRCODE = '22023'; END IF;
  UPDATE public.studio_sessions SET status = _s
    WHERE id = p_id AND tenant_id = _tenant
      AND (auth.uid() IS NULL OR owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
    RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.set_studio_session_status(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_studio_session_status(uuid, text, uuid) TO authenticated, service_role;

-- ── set_studio_session_transcript ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_studio_session_transcript(
  p_id uuid, p_transcript jsonb, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF p_transcript IS NULL OR jsonb_typeof(p_transcript) <> 'array' THEN
    RAISE EXCEPTION 'STUDIO_INVALID_TRANSCRIPT: transcript must be a JSON array' USING ERRCODE = '22023'; END IF;
  UPDATE public.studio_sessions SET transcript = p_transcript
    WHERE id = p_id AND tenant_id = _tenant
      AND (auth.uid() IS NULL OR owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
    RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.set_studio_session_transcript(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_studio_session_transcript(uuid, jsonb, uuid) TO authenticated, service_role;

-- ── touch_studio_session ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_studio_session(
  p_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  UPDATE public.studio_sessions SET last_opened_at = now()
    WHERE id = p_id AND tenant_id = _tenant
      AND (auth.uid() IS NULL OR owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
    RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.touch_studio_session(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_studio_session(uuid, uuid) TO authenticated, service_role;

-- ── delete_studio_session ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_studio_session(
  p_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _deleted uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.studio_sessions
    WHERE id = p_id AND tenant_id = _tenant
      AND (auth.uid() IS NULL OR owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
    RETURNING id INTO _deleted;
  IF _deleted IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  BEGIN
    INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
    VALUES (_caller, 'studio_sessions', 'delete_studio_session', _deleted, jsonb_build_object('tenant_id', _tenant));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'delete_studio_session: audit write failed (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN _deleted;
END; $$;
REVOKE ALL ON FUNCTION public.delete_studio_session(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_studio_session(uuid, uuid) TO authenticated, service_role;

-- ── link_session_artifact ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_session_artifact(
  p_session_id uuid, p_kind text, p_artifact_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _kind text := lower(btrim(p_kind));
  _row public.studio_sessions; _title text; _slug text; _thumb text; _ref jsonb;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('page','form','funnel','content') THEN
    RAISE EXCEPTION 'STUDIO_INVALID_KIND: kind must be page, form, funnel or content' USING ERRCODE = '22023'; END IF;

  IF _kind = 'page' THEN
    SELECT title, slug, og_image_url INTO _title, _slug, _thumb FROM public.growth_pages WHERE id = p_artifact_id AND tenant_id = _tenant;
  ELSIF _kind = 'form' THEN
    SELECT name, slug, NULL::text INTO _title, _slug, _thumb FROM public.growth_forms WHERE id = p_artifact_id AND tenant_id = _tenant;
  ELSIF _kind = 'funnel' THEN
    SELECT name, slug, NULL::text INTO _title, _slug, _thumb FROM public.growth_funnels WHERE id = p_artifact_id AND tenant_id = _tenant;
  ELSE
    SELECT title, NULL::text, image_url INTO _title, _slug, _thumb FROM public.marketing_content WHERE id = p_artifact_id AND tenant_id = _tenant;
  END IF;
  IF _title IS NULL THEN
    RAISE EXCEPTION 'STUDIO_ARTIFACT_NOT_FOUND: % not found in this tenant', _kind USING ERRCODE = 'P0002'; END IF;

  _ref := jsonb_build_object('kind', _kind, 'id', p_artifact_id, 'title', _title,
                             'slug', _slug, 'thumbnail_url', _thumb, 'added_at', now());

  UPDATE public.studio_sessions s SET
    artifact_refs = CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(s.artifact_refs) r
        WHERE r->>'kind' = _kind AND r->>'id' = p_artifact_id::text)
      THEN s.artifact_refs ELSE s.artifact_refs || jsonb_build_array(_ref) END,
    thumbnail_url = COALESCE(s.thumbnail_url, _thumb),
    status = CASE WHEN s.status = 'draft' THEN 'building' ELSE s.status END
  WHERE s.id = p_session_id AND s.tenant_id = _tenant
    AND (auth.uid() IS NULL OR s.owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;

  BEGIN
    INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
    VALUES (_caller, 'studio_sessions', 'link_session_artifact', _row.id,
            jsonb_build_object('tenant_id', _tenant, 'kind', _kind, 'artifact_id', p_artifact_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'link_session_artifact: audit write failed (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.link_session_artifact(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_session_artifact(uuid, text, uuid, uuid) TO authenticated, service_role;

-- ── ensure_studio_session_for_artifact ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_studio_session_for_artifact(
  p_kind text, p_artifact_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _kind text := lower(btrim(p_kind));
  _row public.studio_sessions; _title text;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('page','form','funnel','content') THEN
    RAISE EXCEPTION 'STUDIO_INVALID_KIND: kind must be page, form, funnel or content' USING ERRCODE = '22023'; END IF;

  SELECT s.* INTO _row FROM public.studio_sessions s
  WHERE s.tenant_id = _tenant
    AND (_caller IS NULL OR s.owner_user_id = _caller)
    AND s.status <> 'archived'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.artifact_refs) r
                WHERE r->>'kind' = _kind AND r->>'id' = p_artifact_id::text)
  ORDER BY s.last_opened_at DESC LIMIT 1;

  IF _row.id IS NOT NULL THEN
    RETURN public.touch_studio_session(_row.id, _tenant);
  END IF;

  _row := public.create_studio_session(NULL, NULL, '[]'::jsonb, false, _tenant, _caller);
  _row := public.link_session_artifact(_row.id, _kind, p_artifact_id, _tenant);
  SELECT (r->>'title') INTO _title FROM jsonb_array_elements(_row.artifact_refs) r LIMIT 1;
  IF nullif(btrim(_title), '') IS NOT NULL THEN
    _row := public.rename_studio_session(_row.id, _title, _tenant);
  END IF;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_studio_session_for_artifact(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_studio_session_for_artifact(text, uuid, uuid) TO authenticated, service_role;
