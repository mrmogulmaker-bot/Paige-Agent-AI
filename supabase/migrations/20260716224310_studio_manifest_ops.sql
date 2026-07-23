-- ============================================================================
-- Vibe Studio — artifact-manifest operations (additive, §10 seam extension).
--
-- The session's artifact_refs jsonb manifest ([{kind,id,title,slug,thumbnail_url,
-- added_at}]) already gains members through link_session_artifact. These four RPCs
-- give Paige (and the UI) the rest of the manifest lifecycle so a whole campaign can
-- be composed, reordered, relabeled and pruned inside ONE Studio session (§19) with
-- no human required in the UI (§10):
--
--   1. unlink_session_artifact       — splice one ref OUT of the manifest.
--   2. reorder_session_artifacts     — reorder the manifest to a caller-given order.
--   3. create_session_artifact       — MINT a blank draft in the right library table
--                                       AND link it, in one atomic step.
--   +  rename_session_artifact_ref   — set a project-local label on one ref only.
--
-- GUARANTEES
-- • §9 (platform vs tenant / one home per capability): the underlying growth_pages /
--   growth_forms / growth_funnels / marketing_content rows are the artifact LIBRARIES.
--   unlink and reorder NEVER touch those rows — removing an artifact from a project
--   only edits this session's manifest; the artifact stays in its library. create mints
--   into the tenant's OWN library (tenant_id pinned), never a platform/God default.
-- • §10 (Paige-governable): every op is a SECURITY DEFINER RPC, dual-callable (UI JWT +
--   service_role/Paige), tenant-pinned (p_tenant_id IGNORED for JWT callers → no IDOR),
--   role-gated through the shared studio_role_ok(), and owner-or-tenant-admin gated on
--   the session. Paige drives them from chat exactly as the UI does.
-- • §13 (built right): create_session_artifact runs in the caller's transaction and
--   verifies session ownership (FOR UPDATE) BEFORE minting, so a forbidden/absent
--   session mints nothing (atomic). reorder iterates over the EXISTING refs only —
--   an id the caller names that was never linked can never be injected (no IDOR), and
--   an existing ref the caller omits is appended, never silently lost. INSERTs target
--   only real, verified, NOT-NULL-satisfying columns of each library table. Audit
--   writes are best-effort (never block the op). Idempotent CREATE OR REPLACE.
-- ============================================================================

-- ── unlink_session_artifact ─────────────────────────────────────────────────────────────────
-- Remove the (kind,id) ref from artifact_refs. Idempotent: if the ref isn't present the
-- manifest is unchanged and the row is returned. Recomputes the session cover from the FIRST
-- remaining ref that carries a non-null thumbnail_url (NULL if none remain). Does NOT delete
-- the underlying library row (§9). p_kind ∈ page|form|funnel|content.
CREATE OR REPLACE FUNCTION public.unlink_session_artifact(
  p_session_id uuid, p_kind text, p_artifact_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _kind text := lower(btrim(p_kind));
  _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('page','form','funnel','content') THEN
    RAISE EXCEPTION 'STUDIO_INVALID_KIND: kind must be page, form, funnel or content' USING ERRCODE = '22023'; END IF;

  UPDATE public.studio_sessions s SET
    -- Keep every ref EXCEPT the matching (kind,id), preserving original order.
    artifact_refs = COALESCE((
      SELECT jsonb_agg(r ORDER BY ord)
      FROM jsonb_array_elements(s.artifact_refs) WITH ORDINALITY AS t(r, ord)
      WHERE NOT (r->>'kind' = _kind AND r->>'id' = p_artifact_id::text)
    ), '[]'::jsonb),
    -- Re-derive the cover from the first surviving ref that has a thumbnail.
    thumbnail_url = (
      SELECT r->>'thumbnail_url'
      FROM jsonb_array_elements(s.artifact_refs) WITH ORDINALITY AS t(r, ord)
      WHERE NOT (r->>'kind' = _kind AND r->>'id' = p_artifact_id::text)
        AND nullif(r->>'thumbnail_url', '') IS NOT NULL
      ORDER BY ord LIMIT 1
    )
  WHERE s.id = p_session_id AND s.tenant_id = _tenant
    AND (auth.uid() IS NULL OR s.owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;

  BEGIN
    INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
    VALUES (_caller, 'studio_sessions', 'unlink_session_artifact', _row.id,
            jsonb_build_object('tenant_id', _tenant, 'kind', _kind, 'artifact_id', p_artifact_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'unlink_session_artifact: audit write failed (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.unlink_session_artifact(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_session_artifact(uuid, text, uuid, uuid) TO authenticated, service_role;

-- ── reorder_session_artifacts ───────────────────────────────────────────────────────────────
-- Rewrite artifact_refs into the order named by p_ordered_refs (a jsonb array of {kind,id}
-- identifiers). Built by reordering the EXISTING refs to match p_ordered_refs; identifiers not
-- already linked are DROPPED (never injected — no IDOR), and existing refs not named in
-- p_ordered_refs are APPENDED at the end in their original order (a partial order can't lose
-- artifacts). The cover (thumbnail_url) is intentionally left as-is — reorder changes order,
-- not membership, and the cover is sticky (link derived it with COALESCE, first-set-wins).
CREATE OR REPLACE FUNCTION public.reorder_session_artifacts(
  p_session_id uuid, p_ordered_refs jsonb, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions;
  _existing jsonb; _new jsonb;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF p_ordered_refs IS NULL OR jsonb_typeof(p_ordered_refs) <> 'array' THEN
    RAISE EXCEPTION 'STUDIO_INVALID_ORDER: ordered_refs must be a JSON array' USING ERRCODE = '22023'; END IF;

  -- Lock + gate the session and read its current manifest.
  SELECT s.artifact_refs INTO _existing
  FROM public.studio_sessions s
  WHERE s.id = p_session_id AND s.tenant_id = _tenant
    AND (auth.uid() IS NULL OR s.owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;

  -- Reorder EXISTING refs by their position in p_ordered_refs; refs not named fall to the end
  -- in original order. Iterating over existing refs (never over p_ordered_refs) guarantees no
  -- ref can be injected that wasn't already linked.
  SELECT COALESCE(jsonb_agg(e.ref ORDER BY COALESCE(w.wpos, 2147483647), e.epos), '[]'::jsonb)
  INTO _new
  FROM (
    SELECT r AS ref, r->>'kind' AS k, r->>'id' AS i, ord AS epos
    FROM jsonb_array_elements(_existing) WITH ORDINALITY AS t(r, ord)
  ) e
  LEFT JOIN (
    SELECT o->>'kind' AS k, o->>'id' AS i, MIN(ord) AS wpos
    FROM jsonb_array_elements(p_ordered_refs) WITH ORDINALITY AS t(o, ord)
    GROUP BY o->>'kind', o->>'id'
  ) w ON w.k = e.k AND w.i = e.i;

  UPDATE public.studio_sessions s SET artifact_refs = _new
  WHERE s.id = p_session_id AND s.tenant_id = _tenant
    AND (auth.uid() IS NULL OR s.owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;

  BEGIN
    INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
    VALUES (_caller, 'studio_sessions', 'reorder_session_artifacts', _row.id,
            jsonb_build_object('tenant_id', _tenant, 'count', jsonb_array_length(_new)));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'reorder_session_artifacts: audit write failed (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.reorder_session_artifacts(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_session_artifacts(uuid, jsonb, uuid) TO authenticated, service_role;

-- ── create_session_artifact ─────────────────────────────────────────────────────────────────
-- Atomically MINT a blank draft in the correct library table for p_kind AND append its ref to
-- the session, flipping status draft→building. Ownership is verified (FOR UPDATE) BEFORE the
-- mint, and the whole thing runs in the caller's transaction, so a forbidden/absent session
-- mints nothing. Title comes from p_seed->>'title' (per-kind default otherwise). Slugs on the
-- growth_* tables are NOT NULL + UNIQUE(tenant_id,slug); a collision-proof value is generated.
-- p_kind ∈ page|form|funnel|content. NOTE: 'content' maps to marketing_content whose own kind
-- column is CHECK ('text','image') — so the row's kind is left to its 'text' default; only the
-- MANIFEST ref carries kind='content'.
CREATE OR REPLACE FUNCTION public.create_session_artifact(
  p_session_id uuid, p_kind text, p_seed jsonb DEFAULT '{}'::jsonb, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _kind text := lower(btrim(p_kind));
  _seed jsonb := coalesce(p_seed, '{}'::jsonb);
  _row public.studio_sessions;
  _new_id uuid; _title text; _slug text := 'untitled-' || replace(gen_random_uuid()::text, '-', '');
  _thumb text := NULL; _ref_slug text := NULL; _ref jsonb;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('page','form','funnel','content') THEN
    RAISE EXCEPTION 'STUDIO_INVALID_KIND: kind must be page, form, funnel or content' USING ERRCODE = '22023'; END IF;

  -- Gate + lock the session BEFORE minting (atomic: a forbidden/absent session mints nothing).
  PERFORM 1 FROM public.studio_sessions s
  WHERE s.id = p_session_id AND s.tenant_id = _tenant
    AND (auth.uid() IS NULL OR s.owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;

  -- Mint a minimal, valid blank draft into the right library table (only real NOT-NULL cols).
  IF _kind = 'page' THEN
    _title := coalesce(nullif(btrim(_seed->>'title'), ''), 'Untitled page');
    INSERT INTO public.growth_pages (tenant_id, slug, title, status, created_by)
    VALUES (_tenant, _slug, _title, 'draft', _caller)
    RETURNING id INTO _new_id;
    _ref_slug := _slug;
  ELSIF _kind = 'form' THEN
    _title := coalesce(nullif(btrim(_seed->>'title'), ''), 'Untitled form');
    INSERT INTO public.growth_forms (tenant_id, slug, name, status, created_by)
    VALUES (_tenant, _slug, _title, 'draft', _caller)
    RETURNING id INTO _new_id;
    _ref_slug := _slug;
  ELSIF _kind = 'funnel' THEN
    _title := coalesce(nullif(btrim(_seed->>'title'), ''), 'Untitled funnel');
    INSERT INTO public.growth_funnels (tenant_id, slug, name, status, created_by)
    VALUES (_tenant, _slug, _title, 'draft', _caller)
    RETURNING id INTO _new_id;
    _ref_slug := _slug;
  ELSE  -- 'content' → marketing_content (kind column left to its 'text' default)
    _title := coalesce(nullif(btrim(_seed->>'title'), ''), 'Untitled content');
    INSERT INTO public.marketing_content (tenant_id, title, created_by)
    VALUES (_tenant, _title, _caller)
    RETURNING id INTO _new_id;
    _ref_slug := NULL;
  END IF;

  _ref := jsonb_build_object('kind', _kind, 'id', _new_id, 'title', _title,
                             'slug', _ref_slug, 'thumbnail_url', _thumb, 'added_at', now());

  -- Append the ref and flip draft→building (fresh id → no dedup needed; new thumb is NULL so
  -- the COALESCE leaves any existing cover intact).
  UPDATE public.studio_sessions s SET
    artifact_refs = s.artifact_refs || jsonb_build_array(_ref),
    thumbnail_url = COALESCE(s.thumbnail_url, _thumb),
    status = CASE WHEN s.status = 'draft' THEN 'building' ELSE s.status END
  WHERE s.id = p_session_id AND s.tenant_id = _tenant
    AND (auth.uid() IS NULL OR s.owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;

  BEGIN
    INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
    VALUES (_caller, 'studio_sessions', 'create_session_artifact', _row.id,
            jsonb_build_object('tenant_id', _tenant, 'kind', _kind, 'artifact_id', _new_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'create_session_artifact: audit write failed (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.create_session_artifact(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_session_artifact(uuid, text, jsonb, uuid) TO authenticated, service_role;

-- ── rename_session_artifact_ref ─────────────────────────────────────────────────────────────
-- Set a project-local label ('title') on the matching (kind,id) ref only. Does NOT rename the
-- underlying library row (§9) — this is the artifact's name AS IT APPEARS IN THIS PROJECT.
-- Idempotent on the ref: a no-op if the ref isn't present; still returns the row.
CREATE OR REPLACE FUNCTION public.rename_session_artifact_ref(
  p_session_id uuid, p_kind text, p_artifact_id uuid, p_label text, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _kind text := lower(btrim(p_kind));
  _label text; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('page','form','funnel','content') THEN
    RAISE EXCEPTION 'STUDIO_INVALID_KIND: kind must be page, form, funnel or content' USING ERRCODE = '22023'; END IF;
  _label := nullif(btrim(p_label), '');
  IF _label IS NULL THEN RAISE EXCEPTION 'STUDIO_INVALID_TITLE: a non-empty label is required' USING ERRCODE = '22023'; END IF;

  UPDATE public.studio_sessions s SET
    artifact_refs = COALESCE((
      SELECT jsonb_agg(
        CASE WHEN r->>'kind' = _kind AND r->>'id' = p_artifact_id::text
             THEN r || jsonb_build_object('title', _label)
             ELSE r END
        ORDER BY ord)
      FROM jsonb_array_elements(s.artifact_refs) WITH ORDINALITY AS t(r, ord)
    ), '[]'::jsonb)
  WHERE s.id = p_session_id AND s.tenant_id = _tenant
    AND (auth.uid() IS NULL OR s.owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;

  BEGIN
    INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
    VALUES (_caller, 'studio_sessions', 'rename_session_artifact_ref', _row.id,
            jsonb_build_object('tenant_id', _tenant, 'kind', _kind, 'artifact_id', p_artifact_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rename_session_artifact_ref: audit write failed (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.rename_session_artifact_ref(uuid, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_session_artifact_ref(uuid, text, uuid, text, uuid) TO authenticated, service_role;
