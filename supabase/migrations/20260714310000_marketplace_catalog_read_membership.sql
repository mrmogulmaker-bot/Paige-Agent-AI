-- ============================================================================
-- Marketplace — let any tenant MEMBER read their catalog (#217 UI repoint).
--
-- marketplace_catalog_for_tenant() gated read on is_tenant_admin, but the store
-- page is viewable by non-admin staff (install stays admin-only). Broaden the
-- read to tenant membership WITHOUT reopening the IDOR the §5 review closed:
-- current_user_tenant_id() returns the caller's membership-validated active
-- tenant, so `_tenant_id = current_user_tenant_id()` proves the caller belongs to
-- _tenant_id. Cross-tenant reads (A asking for B) still fail. Writes are unchanged
-- (install/uninstall remain is_platform_owner OR is_tenant_admin).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.marketplace_catalog_for_tenant(_tenant_id uuid)
 RETURNS TABLE (
   slug text, item_type public.marketplace_item_type, name text, tagline text,
   description text, category text, icon text, pricing_model text, price_cents integer,
   requires_embedding boolean, installed boolean, install_status text, version text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Member-or-admin of THIS tenant (or platform owner). current_user_tenant_id()
  -- is membership-validated, so this authorizes without leaking another tenant's
  -- install state (IDOR stays closed, §9/§13).
  IF NOT (
    public.is_platform_owner()
    OR public.is_tenant_admin(_tenant_id)
    OR _tenant_id = public.current_user_tenant_id()
  ) THEN
    RAISE EXCEPTION 'not authorized to read this tenant''s catalog' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.slug, i.item_type, i.name, i.tagline, i.description, i.category, i.icon,
         i.pricing_model, i.price_cents,
         (v.install_manifest ? 'kb_pack') AS requires_embedding,
         (mi.id IS NOT NULL AND mi.status = 'active') AS installed,
         mi.status AS install_status,
         v.semver AS version
  FROM public.marketplace_items i
  LEFT JOIN public.marketplace_item_versions v ON v.id = i.current_version_id
  LEFT JOIN public.marketplace_installs mi ON mi.item_id = i.id AND mi.tenant_id = _tenant_id
  WHERE public.is_platform_owner()
     OR (i.status = 'listed' AND (
          i.scope = 'public'
          OR (i.scope = 'tenant' AND i.visible_to_tenant_id = _tenant_id)
          OR (i.scope = 'agency' AND public.agency_team_role(i.visible_to_agency_id, auth.uid()) IS NOT NULL)
        ))
  ORDER BY i.category, i.name;
END $function$;
REVOKE ALL ON FUNCTION public.marketplace_catalog_for_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_catalog_for_tenant(uuid) TO authenticated, service_role;

COMMIT;
