-- Portal Studio config (§9/§10/§11) — the tenant-authored PRESENTATION OVERLAY that
-- skins which client-portal tabs a client sees, their order, and the welcome greeting.
--
-- The Playbook's portal.modules (tenants.features.playbook_config) stays the MODULE
-- CATALOG + default order (authored in Your Paige) — we do NOT move it. This overlay
-- is purely SUBTRACTIVE/REORDERING on top of that catalog and NEVER introduces new
-- module keys. Shape stored at tenants.features.portal_config (jsonb):
--   { modules: [ { key, visible, order } ], welcome?: { headline?, subhead? } }
-- FAIL-OPEN by construction: absent/empty/malformed ⇒ current AppNav behavior byte-for-byte.
--
-- One write seam (set_tenant_portal_config) is the §10 Paige-callable entry for both the
-- UI and Paige; it reuses the SAME authority as brand editing (can_manage_tenant_brand),
-- never a forked check. One client read seam (get_client_portal_config) lets AppNav honor
-- visibility, mirroring get_client_portal_brand's client keying.

-- 1. Storage: portal_config lives INSIDE the existing tenants.features jsonb — no column
--    to add, no rows to rewrite. Document where it lives for the next reader (§12).
COMMENT ON COLUMN public.tenants.features IS
  'Tenant feature bag (jsonb). Holds playbook_config (the Playbook / module CATALOG) '
  'and portal_config (Portal Studio PRESENTATION OVERLAY: '
  '{ modules:[{key,visible,order}], welcome?:{headline,subhead} } — subtractive/reorder '
  'over the catalog, never new keys; absent/empty ⇒ default portal). Written via '
  'set_tenant_portal_config, read for clients via get_client_portal_config.';

-- 2. WRITE SEAM (§10). Merge-patch features.portal_config; authorized via
--    can_manage_tenant_brand so Paige (chat) and the UI share ONE entry point and the
--    SAME authority as brand editing (no forked check). Mirrors set_tenant_brand.
CREATE OR REPLACE FUNCTION public.set_tenant_portal_config(_tenant_id uuid, _patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _merged jsonb;
BEGIN
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'portal config patch must be a JSON object' USING ERRCODE='22023';
  END IF;
  -- Light defensive shape check: if the patch carries modules, it must be an array.
  IF _patch ? 'modules' AND jsonb_typeof(_patch->'modules') <> 'array' THEN
    RAISE EXCEPTION 'invalid_portal_config' USING ERRCODE='22023';
  END IF;
  IF NOT public.can_manage_tenant_brand(_tenant_id) THEN
    RAISE EXCEPTION 'portal_config_forbidden' USING ERRCODE='42501';
  END IF;
  -- Shallow-merge the patch into features.portal_config, then write it back into features.
  _merged := COALESCE(
    (SELECT COALESCE(features->'portal_config','{}'::jsonb) FROM public.tenants WHERE id = _tenant_id),
    '{}'::jsonb
  ) || _patch;   -- shallow merge; caller sends only changed keys
  UPDATE public.tenants
     SET features = COALESCE(features,'{}'::jsonb)
                 || jsonb_build_object('portal_config', _merged)
   WHERE id = _tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant % not found', _tenant_id USING ERRCODE='P0002';
  END IF;
  RETURN _merged;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_tenant_portal_config(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_tenant_portal_config(uuid, jsonb) TO authenticated;

-- 3. CLIENT READ SEAM. Keyed on the caller being a client (clients.linked_user_id =
--    auth.uid()), resolve their tenant, return features.portal_config. Mirrors
--    get_client_portal_brand's `me` CTE. FAIL-OPEN: returns '{}'::jsonb (never null,
--    never error) when the caller is not a client or the tenant has no config, so the
--    frontend renders the default portal.
CREATE OR REPLACE FUNCTION public.get_client_portal_config()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  WITH me AS (
    SELECT c.tenant_id AS tid
    FROM public.clients c
    WHERE c.linked_user_id = auth.uid()
    ORDER BY c.created_at ASC
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT COALESCE(t.features->'portal_config','{}'::jsonb)
       FROM public.tenants t
       JOIN me ON me.tid = t.id),
    '{}'::jsonb
  );
$$;
REVOKE EXECUTE ON FUNCTION public.get_client_portal_config() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_client_portal_config() TO authenticated;
