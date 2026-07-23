-- 20260717160000_studio_session_thumbnail.sql
-- Studio Task #295 — a direct, Paige-callable seam to set a project's gallery cover.
--
-- WHY THIS EXISTS: link_session_artifact derives studio_sessions.thumbnail_url with
-- COALESCE(s.thumbnail_url, _thumb) — it seeds a cover ONCE (from growth_pages.og_image_url,
-- etc.) and never overwrites it. That "first artifact wins" behavior is correct for the derive
-- path, but it means a rebuilt page can't refresh its captured preview. This RPC SETs the column
-- outright so a freshly-captured page thumbnail replaces the old one, while staying tenant-scoped
-- and owner/admin-gated exactly like set_studio_session_starred (§9/§10/§13). SECURITY DEFINER
-- with the same studio_role_ok gate, the same owner-or-admin row filter, REVOKE from PUBLIC/anon,
-- GRANT to authenticated + service_role.
CREATE OR REPLACE FUNCTION public.set_studio_session_thumbnail(
  p_id uuid, p_thumbnail_url text, p_tenant_id uuid DEFAULT NULL
) RETURNS public.studio_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _row public.studio_sessions;
  _url text := nullif(btrim(p_thumbnail_url), '');
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.studio_role_ok(_caller) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501'; END IF;
    _tenant := public.current_user_tenant_id();
  ELSE _tenant := p_tenant_id; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023'; END IF;
  IF _url IS NULL THEN RAISE EXCEPTION 'STUDIO_INVALID_THUMBNAIL: a non-empty thumbnail url is required' USING ERRCODE = '22023'; END IF;
  UPDATE public.studio_sessions SET thumbnail_url = _url
    WHERE id = p_id AND tenant_id = _tenant
      AND (auth.uid() IS NULL OR owner_user_id = auth.uid() OR public.is_tenant_admin(_tenant))
    RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_NOT_FOUND: session not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.set_studio_session_thumbnail(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_studio_session_thumbnail(uuid, text, uuid) TO authenticated, service_role;
