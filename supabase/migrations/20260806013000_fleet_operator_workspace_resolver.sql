-- Fleet Communications launcher: resolve the ONE designated Paige Operations
-- workspace without accepting a browser-supplied tenant id (§9/§10/§200).
CREATE OR REPLACE FUNCTION public.resolve_platform_operator_workspace()
RETURNS TABLE (id uuid, name text, slug text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.id, t.name, t.slug, t.status::text
  FROM public.admin_app_settings s
  JOIN public.tenants t ON t.id = CASE
    WHEN jsonb_typeof(s.value) = 'string'
     AND (s.value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (s.value #>> '{}')::uuid ELSE NULL END
  WHERE s.key = 'platform_operator_tenant_id'
    AND t.status IN ('trial'::public.tenant_status, 'active'::public.tenant_status)
    AND public.is_platform_owner();
$$;

REVOKE ALL ON FUNCTION public.resolve_platform_operator_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_platform_operator_workspace() FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_platform_operator_workspace() TO authenticated;

COMMENT ON FUNCTION public.resolve_platform_operator_workspace() IS
  'Owner-only, zero-argument resolver for the designated Paige Operations workspace. Fails closed with zero rows.';

