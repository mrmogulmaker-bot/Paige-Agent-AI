-- ============================================================================
-- Vibe Studio — artifact VERSION lineage (append-only). Additive only: CREATEs a
-- new table + indexes + RLS + grants + three DEFINER RPCs. NO ALTER of any existing
-- table, NO backfill, NO change to any existing RPC or read path. Fully reversible
-- (DROP TABLE + DROP FUNCTIONs restores the prior schema byte-for-byte). Mirrors the
-- studio_sessions RLS pattern and the manifest-RPC guard discipline (§9/§10/§13).
--
-- Why (owner's bug): a version stack that lived only in client state vanished on reload.
-- This table makes "work never vanishes" STRUCTURAL: every session-bound write appends a
-- snapshot keyed on (session, kind, lineage_id = the artifact's OWN row id), read straight
-- back from the DB on every reload. §18: versioning gets exactly ONE home (mirrors the
-- shipped marketplace_item_versions precedent, §12); it changes ZERO existing read/write path.
--
-- Lineage note (§13 — honest boundary): a stack forms only when a REGENERATION reuses the
-- artifact's row (so lineage_id is stable). growth_pages already reuse the row (ON CONFLICT
-- by slug) — pages stack today. marketing_content (image/document) INSERTs a new row per call
-- UNLESS the caller threads the existing content_id, so image/document stacking requires the
-- Studio iterate path to pass the on-canvas artifact's id as the reuse target (the "refine
-- this" seam). Until that thread is wired, the version strip stays honestly HIDDEN for those
-- types (it renders only when versions>1) — no fabricated history, ever.
-- ============================================================================

-- 1) The append-only snapshot store. One row per captured state of one artifact
--    (lineage_id = the artifact's own id) inside one session.
CREATE TABLE IF NOT EXISTS public.studio_artifact_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id    uuid NOT NULL REFERENCES public.studio_sessions(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('page','form','funnel','content')),
  lineage_id    uuid NOT NULL,                 -- the artifact this version belongs to
  version_no    integer NOT NULL,              -- 1,2,3… per (session_id,kind,lineage_id)
  is_current    boolean NOT NULL DEFAULT false,-- the version the live library row reflects
  snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb, -- self-contained content (to_jsonb of the live row)
  title         text,
  thumbnail_url text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, kind, lineage_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_saved_versions_lineage
  ON public.studio_artifact_versions (session_id, kind, lineage_id, version_no DESC);
-- One current version per lineage, enforced structurally.
CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_versions_current
  ON public.studio_artifact_versions (session_id, kind, lineage_id)
  WHERE is_current;

-- 2) Write fence: all mutations travel the DEFINER RPCs below (§10). Reads are RLS-gated.
REVOKE ALL ON public.studio_artifact_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.studio_artifact_versions FROM authenticated;
GRANT SELECT ON public.studio_artifact_versions TO authenticated;
GRANT ALL ON public.studio_artifact_versions TO service_role;

ALTER TABLE public.studio_artifact_versions ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE tenant wall (fail-closed, AND-ed with every permissive policy) — a NULL
-- tenant is invisible, never universal; platform owner keeps §9 break-glass.
DROP POLICY IF EXISTS saved_versions_tenant_isolation ON public.studio_artifact_versions;
CREATE POLICY saved_versions_tenant_isolation ON public.studio_artifact_versions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id())
  WITH CHECK (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

-- Permissive SELECT: the owning user or a tenant admin, resolved through the parent session.
DROP POLICY IF EXISTS saved_versions_select ON public.studio_artifact_versions;
CREATE POLICY saved_versions_select ON public.studio_artifact_versions
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR (
      tenant_id = public.current_user_tenant_id()
      AND EXISTS (
        SELECT 1 FROM public.studio_sessions s
        WHERE s.id = studio_artifact_versions.session_id
          AND s.tenant_id = studio_artifact_versions.tenant_id
          AND (s.owner_user_id = auth.uid() OR public.is_tenant_admin(s.tenant_id))
      )
    )
  );

-- 3a) save_artifact_version — append the current live state of (kind,lineage_id) as the
--     new head. Re-reads the just-persisted library row (generic to_jsonb → no drift),
--     so the edge fn just calls this once after link_session_artifact. Non-fatal by design.
CREATE OR REPLACE FUNCTION public.save_artifact_version(
  p_session_id uuid, p_kind text, p_artifact_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_artifact_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _kind text := lower(btrim(p_kind));
  _snap jsonb; _title text; _thumb text; _next int; _row public.studio_artifact_versions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('page','form','funnel','content') THEN
    RAISE EXCEPTION 'STUDIO_INVALID_KIND' USING ERRCODE = '22023'; END IF;
  -- Verify the session belongs to this tenant + caller before writing anything (no IDOR).
  IF NOT EXISTS (SELECT 1 FROM public.studio_sessions s WHERE s.id = p_session_id AND s.tenant_id = _tenant
      AND (auth.uid() IS NULL OR s.owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))) THEN
    RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;

  -- Snapshot the live row generically (tenant-pinned). Build/verify exact columns exist.
  IF _kind = 'page' THEN
    SELECT to_jsonb(t.*), t.title, NULL FROM public.growth_pages t
      WHERE t.id = p_artifact_id AND t.tenant_id = _tenant INTO _snap, _title, _thumb;
  ELSIF _kind = 'content' THEN
    SELECT to_jsonb(t.*), t.title, t.image_url FROM public.marketing_content t
      WHERE t.id = p_artifact_id AND t.tenant_id = _tenant INTO _snap, _title, _thumb;
  ELSIF _kind = 'funnel' THEN
    -- growth_funnels/growth_forms name their display column `name`, NOT `title` (byte-verified vs the
    -- live schema, §13 — the blueprint's t.title would have raised "column does not exist" and silently
    -- no-op'd every funnel/form version save). The snapshot itself is generic to_jsonb (no drift).
    SELECT to_jsonb(t.*), t.name, NULL FROM public.growth_funnels t
      WHERE t.id = p_artifact_id AND t.tenant_id = _tenant INTO _snap, _title, _thumb;
  ELSE -- form
    SELECT to_jsonb(t.*), t.name, NULL FROM public.growth_forms t
      WHERE t.id = p_artifact_id AND t.tenant_id = _tenant INTO _snap, _title, _thumb;
  END IF;
  IF _snap IS NULL THEN RAISE EXCEPTION 'STUDIO_ARTIFACT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- No-op dedup (§13 — the stack reflects real iterations, not every tool round-trip): if the
  -- current head already holds a byte-identical snapshot, return it unchanged instead of appending
  -- a duplicate v_{n+1}. save_artifact_version fires on EVERY session-bound write (incl. a re-link
  -- of an unchanged artifact), so this keeps identical regenerations from inflating the history.
  SELECT * INTO _row FROM public.studio_artifact_versions
    WHERE session_id = p_session_id AND kind = _kind AND lineage_id = p_artifact_id AND is_current
      AND snapshot = _snap;
  IF _row.id IS NOT NULL THEN RETURN _row; END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1 INTO _next
    FROM public.studio_artifact_versions
    WHERE session_id = p_session_id AND kind = _kind AND lineage_id = p_artifact_id;

  UPDATE public.studio_artifact_versions SET is_current = false
    WHERE session_id = p_session_id AND kind = _kind AND lineage_id = p_artifact_id AND is_current;

  INSERT INTO public.studio_artifact_versions
    (tenant_id, session_id, kind, lineage_id, version_no, is_current, snapshot, title, thumbnail_url, created_by)
  VALUES (_tenant, p_session_id, _kind, p_artifact_id, _next, true, _snap, _title, _thumb, _caller)
  RETURNING * INTO _row;
  RETURN _row;
END; $$;

-- 3b) list_artifact_versions — the stack, newest first, for one lineage.
CREATE OR REPLACE FUNCTION public.list_artifact_versions(
  p_session_id uuid, p_kind text, p_artifact_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS SETOF public.studio_artifact_versions
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT v.* FROM public.studio_artifact_versions v
  WHERE v.session_id = p_session_id AND v.kind = lower(btrim(p_kind)) AND v.lineage_id = p_artifact_id
    -- Fail-CLOSED tenant pin (§9): resolve the tenant, and if it is NULL the equality is NULL →
    -- zero rows (NOT the COALESCE-to-self that would make the clause always-true). Matches the
    -- RAISE-on-null-tenant discipline of save/restore; the EXISTS below is the second wall.
    AND v.tenant_id = (CASE WHEN auth.uid() IS NULL THEN p_tenant_id ELSE public.current_user_tenant_id() END)
    AND EXISTS (SELECT 1 FROM public.studio_sessions s
      WHERE s.id = v.session_id AND s.tenant_id = v.tenant_id
        AND (auth.uid() IS NULL OR s.owner_user_id = auth.uid() OR public.is_tenant_admin(v.tenant_id)))
  ORDER BY v.version_no DESC;
$$;

-- 3c) restore_artifact_version — write a past snapshot BACK into the live library row and
--     move is_current to it. Append-only preserved: no version row is deleted; the pointer
--     moves. (Build implements page + content now — the two iterated types in scope;
--     funnel/form restore is a tracked fast-follow, §19.)
CREATE OR REPLACE FUNCTION public.restore_artifact_version(
  p_version_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_artifact_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _v public.studio_artifact_versions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT' USING ERRCODE = '22023'; END IF;

  SELECT * INTO _v FROM public.studio_artifact_versions
    WHERE id = p_version_id AND tenant_id = _tenant;
  IF _v.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.studio_sessions s WHERE s.id = _v.session_id AND s.tenant_id = _tenant
      AND (auth.uid() IS NULL OR s.owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))) THEN
    RAISE EXCEPTION 'STUDIO_FORBIDDEN' USING ERRCODE = '42501'; END IF;

  IF _v.kind = 'page' THEN
    UPDATE public.growth_pages SET
      draft_blocks_json = _v.snapshot->'draft_blocks_json',
      draft_theme_json  = _v.snapshot->'draft_theme_json',
      draft_seo_json    = _v.snapshot->'draft_seo_json',
      title             = COALESCE(_v.snapshot->>'title', title)
    WHERE id = _v.lineage_id AND tenant_id = _tenant;
  ELSIF _v.kind = 'content' THEN
    UPDATE public.marketing_content SET
      body      = _v.snapshot->>'body',
      image_url = _v.snapshot->>'image_url',
      title     = COALESCE(_v.snapshot->>'title', title)
    WHERE id = _v.lineage_id AND tenant_id = _tenant;
  ELSE
    RAISE EXCEPTION 'STUDIO_RESTORE_UNSUPPORTED: % restore is a tracked follow-up', _v.kind USING ERRCODE = '0A000';
  END IF;

  UPDATE public.studio_artifact_versions SET is_current = false
    WHERE session_id = _v.session_id AND kind = _v.kind AND lineage_id = _v.lineage_id AND is_current;
  UPDATE public.studio_artifact_versions SET is_current = true WHERE id = _v.id RETURNING * INTO _v;
  RETURN _v;
END; $$;

REVOKE ALL ON FUNCTION public.save_artifact_version(uuid,text,uuid,uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.restore_artifact_version(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_artifact_version(uuid,text,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_artifact_versions(uuid,text,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_artifact_version(uuid,uuid) TO authenticated, service_role;
