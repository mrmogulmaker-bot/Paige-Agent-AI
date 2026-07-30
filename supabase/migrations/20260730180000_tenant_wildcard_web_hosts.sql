-- Tenant wildcard hosts: <tenant-slug>.paigeagent.ai
-- The hostname is public routing context only. This resolver returns the
-- minimum public identity needed to validate the host and never grants tenant
-- membership, data access, or an authenticated session.

CREATE OR REPLACE FUNCTION public.resolve_tenant_web_host(p_hostname text)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  public_brand jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT lower(trim(trailing '.' FROM split_part(coalesce(p_hostname, ''), ':', 1))) AS hostname
  ),
  candidate AS (
    SELECT split_part(n.hostname, '.', 1) AS slug,
           array_length(string_to_array(n.hostname, '.'), 1) AS labels,
           n.hostname
      FROM normalized n
  )
  SELECT t.id,
         t.slug,
         t.name,
         jsonb_strip_nulls(jsonb_build_object(
           'name', t.brand -> 'name',
           'logo_url', t.brand -> 'logo_url',
           'primary_color', t.brand -> 'primary_color',
           'accent_color', t.brand -> 'accent_color'
         ))
    FROM candidate c
    JOIN public.tenants t ON lower(t.slug) = c.slug
   WHERE c.labels = 3
     AND c.hostname LIKE '%.paigeagent.ai'
     AND c.slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
     AND c.slug <> ALL (ARRAY[
       'www','app','api','admin','auth','mail','notify','status','support',
       'cdn','assets','static','docs','blog','mcp','studio','staging','preview'
     ])
     AND t.status IN ('trial'::public.tenant_status, 'active'::public.tenant_status)
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_tenant_web_host(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_web_host(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_tenant_web_host(text) IS
  'Validates <tenant-slug>.paigeagent.ai and returns public tenant identity only. Hostname is never authorization.';
