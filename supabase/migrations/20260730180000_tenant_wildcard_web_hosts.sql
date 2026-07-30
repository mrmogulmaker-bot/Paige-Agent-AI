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


-- One canonical outward-facing domain identity contract. Every consumer
-- (Paige chat, Paige MCP, onboarding, settings) reads this seam instead of
-- reconstructing domains independently.
CREATE OR REPLACE FUNCTION public.resolve_tenant_domain_identity(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  default_web_hostname text,
  default_web_url text,
  default_portal_path text,
  default_email_domain text,
  default_email_sender text,
  default_email_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
  ELSIF _jwt_role = 'service_role' THEN
    _tenant := p_tenant_id;
  ELSE
    RAISE EXCEPTION 'DOMAIN_IDENTITY_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'DOMAIN_IDENTITY_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT t.id,
         t.slug,
         t.name,
         t.slug || '.paigeagent.ai',
         'https://' || t.slug || '.paigeagent.ai',
         '/portal/' || t.slug,
         ed.domain,
         CASE
           WHEN ed.domain IS NULL THEN NULL
           ELSE coalesce(nullif(ed.from_email_local, ''), 'hello') || '@' || ed.domain
         END,
         ed.status::text
    FROM public.tenants t
    LEFT JOIN LATERAL (
      SELECT d.domain, d.from_email_local, d.status
        FROM public.tenant_email_domains d
       WHERE d.tenant_id = t.id
         AND d.is_default = true
       ORDER BY d.verified_at DESC NULLS LAST, d.created_at DESC
       LIMIT 1
    ) ed ON true
   WHERE t.id = _tenant
   LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_tenant_domain_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_domain_identity(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_tenant_domain_identity(uuid) IS
  'Canonical tenant domain identity for Paige, onboarding, settings, and domain routing. Authenticated callers are pinned to their own tenant; service_role must pass p_tenant_id.';
