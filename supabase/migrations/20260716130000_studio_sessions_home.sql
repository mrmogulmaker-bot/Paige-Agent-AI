-- ============================================================================
-- Studio sessions — the projects/authoring HOME for Vibe Studio (Slice 2).
--
-- §18 SEAM (one capability / one home): studio_sessions is the AUTHORING layer —
-- "projects" the operator returns to and keeps building. It is NOT a second copy of
-- the artifact libraries. Published artifacts still live in growth_pages /
-- growth_forms / growth_funnels / marketing_content and stay listed by GrowthHub /
-- the Content library. A session holds only TYPED REFS to those rows (artifact_refs),
-- never their content. Home = sessions; GrowthHub = artifact rows. They never list
-- the same object as "a project".
--
-- §9 (platform vs tenant): tenant-isolated AND user-scoped. tenant_id pins the row to
-- one workspace; owner_user_id is the "My projects"/recency axis. This is a TENANT
-- surface — never mounted in the God nav.
--
-- §19 (stays reachable): seed_brief + transcript + artifact_refs make a session
-- durably resumable — reload/refresh/link-share keeps the brief and the wired artifacts.
--
-- §10 (Paige-callable): the entire lifecycle is DEFINER RPCs, dual-caller and
-- tenant-pinned, so Paige drives sessions from chat exactly as the UI does.
--
-- RECONCILIATION (blocking #1): this migration is the SINGLE canonical schema. It
-- takes the JSONB artifact_refs manifest (no join table — refs span four tables with
-- no single FK target, the set is tiny, and §10 wants it as data Paige rewrites), the
-- owner_user_id column name, a status lifecycle enum that ALSO carries 'archived', and
-- adds seed_brief (blocking #4: the brief is persisted server-side, never only in
-- router location.state). Frontend Spec 3's studio_session_artifacts join table is
-- dropped in favor of artifact_refs; its archiveStudioSession maps to status='archived'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.studio_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- "My projects" / recency owner. SET NULL (not CASCADE): a departed teammate's
  -- projects survive for the tenant's admins; they just lose their owner.
  owner_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title          text NOT NULL DEFAULT 'Untitled project',
  -- §19/§4 durable resume: the opening brief, persisted at create so a reloaded
  -- zero-artifact session can still replay classifyStudioIntent. NOT ephemeral state.
  seed_brief     text,
  -- SESSION lifecycle, distinct from any one artifact's status. draft=empty shell;
  -- building=at least one artifact wired; published=an artifact went live;
  -- archived=owner/admin retired the project (Spec 3's archiveStudioSession).
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','building','published','archived')),
  starred        boolean NOT NULL DEFAULT false,
  -- Gallery card cover. link_session_artifact derives it (COALESCE, never overwrite)
  -- from the first thumbnail-bearing artifact (growth_pages.og_image_url, then
  -- marketing_content.image_url). NULL => the card renders the GlyphPlate fallback.
  thumbnail_url  text,
  -- §19 resumable conversation transcript (full turn-by-turn is a later slice; v1
  -- seeds nothing here and leans on seed_brief — the column ships now so the seam exists).
  transcript     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Typed refs to the artifacts this MULTI-ARTIFACT session authored, e.g.
  -- [{"kind":"page","id":"…","title":"…","slug":"…","thumbnail_url":null,"added_at":"…"}].
  -- Integrity is enforced at WRITE time by link_session_artifact (existence + tenant
  -- match). A deleted underlying row leaves a tombstoned ref the UI renders as "removed"
  -- (the card glyph row and builder hydration must tolerate an unresolvable id).
  artifact_refs  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- §2: whatever the platform ever seeds as templates must be coaching-generic — no
  -- credit/funding default — and per §9 must never live in the God/Super-Admin account.
  is_template    boolean NOT NULL DEFAULT false,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- "My projects" + "Recently viewed" (owner axis, newest-open first).
CREATE INDEX IF NOT EXISTS idx_studio_sessions_owner_recent
  ON public.studio_sessions (tenant_id, owner_user_id, last_opened_at DESC);
-- Tenant-wide recency (admin oversight / all projects).
CREATE INDEX IF NOT EXISTS idx_studio_sessions_tenant_recent
  ON public.studio_sessions (tenant_id, last_opened_at DESC);
-- Starred + Templates filter views — partial, so they stay tiny.
CREATE INDEX IF NOT EXISTS idx_studio_sessions_starred
  ON public.studio_sessions (tenant_id, owner_user_id, last_opened_at DESC)
  WHERE starred;
CREATE INDEX IF NOT EXISTS idx_studio_sessions_templates
  ON public.studio_sessions (tenant_id, last_opened_at DESC)
  WHERE is_template;

DROP TRIGGER IF EXISTS trg_studio_sessions_updated ON public.studio_sessions;
CREATE TRIGGER trg_studio_sessions_updated BEFORE UPDATE ON public.studio_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Grants: no anon; authenticated may READ (RLS-scoped) but only WRITE through the
-- DEFINER RPCs (the REVOKE is the real write fence). service_role (Paige) is full.
REVOKE ALL ON public.studio_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.studio_sessions FROM authenticated;
GRANT SELECT ON public.studio_sessions TO authenticated;
GRANT ALL ON public.studio_sessions TO service_role;

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.studio_sessions ENABLE ROW LEVEL SECURITY;

-- 1. RESTRICTIVE tenant wall (fail-closed, AND-ed with every permissive policy).
--    NULL tenant -> row invisible, never all. Platform owner keeps §9 break-glass.
DROP POLICY IF EXISTS studio_sessions_tenant_isolation ON public.studio_sessions;
CREATE POLICY studio_sessions_tenant_isolation ON public.studio_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id())
  WITH CHECK (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

-- 2. Permissive SELECT — the three read audiences, all inside the active tenant:
--      • the OWNER of the session  ("My projects" / "Recently viewed" / "Starred")
--      • ANY tenant admin          (oversight of every project in the workspace)
--      • ANY in-tenant user for a TEMPLATE (tenant-wide starting points)
DROP POLICY IF EXISTS studio_sessions_select ON public.studio_sessions;
CREATE POLICY studio_sessions_select ON public.studio_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR (
      tenant_id = public.current_user_tenant_id()
      AND (
        owner_user_id = auth.uid()
        OR is_template = true
        OR public.is_tenant_admin(tenant_id)
      )
    )
  );
-- No permissive INSERT/UPDATE/DELETE policy exists, so direct writes are denied even
-- before the grant-level REVOKE — writes travel the DEFINER RPCs only.

-- ============================================================================
-- Seam RPCs (§10). Every JWT caller is role-gated + pinned to current_user_tenant_id()
-- (p_tenant_id IGNORED for JWT callers -> no IDOR); only service_role (Paige) may name
-- a tenant/owner. MUTATIONS additionally require owner-or-tenant-admin (blocking #2).
-- ============================================================================

-- list_studio_sessions(filter) — gallery feed. filter ∈ recent|mine|starred|templates.
-- 'recent' is scoped to the caller's OWN sessions unless they are a tenant admin
-- (blocking #3: the DEFINER read must not over-share every colleague's projects to a
-- non-admin coach — it now agrees with the RLS SELECT audiences).
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
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
  ELSE
    _tenant := p_tenant_id;   -- service_role (Paige) names the tenant
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  -- service_role has no uid -> treated as full-tenant reader.
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

-- create_studio_session — the home composer's "new". Persists seed_brief so the brief
-- survives reload (blocking #4). Returns the row so the caller routes into the builder.
CREATE OR REPLACE FUNCTION public.create_studio_session(
  p_title         text    DEFAULT NULL,
  p_seed_brief    text    DEFAULT NULL,
  p_transcript    jsonb   DEFAULT '[]'::jsonb,
  p_is_template   boolean DEFAULT false,
  p_tenant_id     uuid    DEFAULT NULL,
  p_owner_user_id uuid    DEFAULT NULL   -- honored only for service_role
)
RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _owner uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
    _owner  := _caller;                    -- a JWT caller always owns their own session
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

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'studio_sessions', 'create_studio_session', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'is_template', _row.is_template));
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.create_studio_session(text, text, jsonb, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_studio_session(text, text, jsonb, boolean, uuid, uuid) TO authenticated, service_role;

-- Shared ownership gate for mutations (blocking #2): a JWT caller must OWN the session
-- or be a tenant admin. service_role (auth.uid() IS NULL) passes. Enforced in each
-- mutation's WHERE via the (auth.uid() IS NULL OR owner_user_id = auth.uid() OR
-- is_tenant_admin(_tenant)) predicate, so a non-owner match affects 0 rows -> NOT_FOUND.

-- rename_studio_session
CREATE OR REPLACE FUNCTION public.rename_studio_session(
  p_id uuid, p_title text, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
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

-- set_studio_session_starred
CREATE OR REPLACE FUNCTION public.set_studio_session_starred(
  p_id uuid, p_starred boolean, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
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

-- set_studio_session_status — lifecycle (archive/restore). Replaces Spec 3's
-- archiveStudioSession; only 'draft'|'building'|'published'|'archived' accepted.
CREATE OR REPLACE FUNCTION public.set_studio_session_status(
  p_id uuid, p_status text, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions; _s text := lower(btrim(p_status));
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
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

-- set_studio_session_transcript — durable §19 conversation persistence (ships in v1 as
-- the seam; the UI wires it per turn in a later slice). Validates array shape.
CREATE OR REPLACE FUNCTION public.set_studio_session_transcript(
  p_id uuid, p_transcript jsonb, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
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

-- touch_studio_session — bump last_opened_at (drives "Recently viewed") AND returns the row,
-- so it carries the same owner-or-admin gate as the other mutations: this is a SECURITY
-- DEFINER path that bypasses the RLS SELECT policy, and RETURNING * would otherwise hand a
-- non-owner non-admin peer another user's seed_brief/transcript/artifact_refs. Admins and
-- service_role still touch any project in the tenant (recency stamping intact).
CREATE OR REPLACE FUNCTION public.touch_studio_session(
  p_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
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

-- delete_studio_session — remove the AUTHORING session only. §18 seam: the underlying
-- growth_*/marketing_content rows are NOT deleted — they stay in their libraries.
CREATE OR REPLACE FUNCTION public.delete_studio_session(
  p_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _deleted uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.studio_sessions
    WHERE id = p_id AND tenant_id = _tenant
      AND (auth.uid() IS NULL OR owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
    RETURNING id INTO _deleted;
  IF _deleted IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'studio_sessions', 'delete_studio_session', _deleted, jsonb_build_object('tenant_id', _tenant));
  RETURN _deleted;
END; $$;
REVOKE ALL ON FUNCTION public.delete_studio_session(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_studio_session(uuid, uuid) TO authenticated, service_role;

-- link_session_artifact — attach a growth_*/marketing_content row to a session. IDOR-safe:
-- verifies the artifact EXISTS in the SAME tenant before appending the ref. Dedups on
-- (kind,id). Derives thumbnail_url (COALESCE) from the first thumbnail-bearing artifact.
-- p_kind ∈ page|form|funnel|content.
CREATE OR REPLACE FUNCTION public.link_session_artifact(
  p_session_id uuid, p_kind text, p_artifact_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _kind text := lower(btrim(p_kind));
  _row public.studio_sessions; _title text; _slug text; _thumb text; _ref jsonb;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('page','form','funnel','content') THEN
    RAISE EXCEPTION 'STUDIO_INVALID_KIND: kind must be page, form, funnel or content' USING ERRCODE = '22023'; END IF;

  -- Resolve + tenant-verify the artifact (IDOR fence).
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

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'studio_sessions', 'link_session_artifact', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'kind', _kind, 'artifact_id', p_artifact_id));
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.link_session_artifact(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_session_artifact(uuid, text, uuid, uuid) TO authenticated, service_role;

-- ensure_studio_session_for_artifact — the ?pageId deep-link SHIM (blocking #5). Finds
-- the caller's existing session that already references (kind,id); if none, creates one
-- (title from the artifact) and links it. Idempotent, so repeated "Edit in Studio"
-- clicks resolve to the SAME session instead of forking duplicates. Returns the row so
-- the caller redirects to /admin/studio/:id. Paige-callable (§10).
CREATE OR REPLACE FUNCTION public.ensure_studio_session_for_artifact(
  p_kind text, p_artifact_id uuid, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _kind text := lower(btrim(p_kind));
  _row public.studio_sessions; _title text;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('page','form','funnel','content') THEN
    RAISE EXCEPTION 'STUDIO_INVALID_KIND: kind must be page, form, funnel or content' USING ERRCODE = '22023'; END IF;

  -- Reuse an existing OWNED session that already wraps this artifact.
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

  -- None yet: mint one and link the artifact (link derives title/thumb + flips to building).
  _row := public.create_studio_session(NULL, NULL, '[]'::jsonb, false, _tenant, _caller);
  _row := public.link_session_artifact(_row.id, _kind, p_artifact_id, _tenant);
  -- Title the fresh wrapper from the artifact's real name.
  SELECT (r->>'title') INTO _title FROM jsonb_array_elements(_row.artifact_refs) r LIMIT 1;
  IF nullif(btrim(_title), '') IS NOT NULL THEN
    _row := public.rename_studio_session(_row.id, _title, _tenant);
  END IF;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_studio_session_for_artifact(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_studio_session_for_artifact(text, uuid, uuid) TO authenticated, service_role;
