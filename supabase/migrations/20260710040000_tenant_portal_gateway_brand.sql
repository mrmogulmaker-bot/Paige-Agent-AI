-- Tenant-branded portal gateway (post-signout landing + "log back in").
-- A signed-out customer has no session, so the gateway resolves the tenant's
-- PUBLIC brand by slug (logo + name + primary color only — nothing sensitive).
-- This is the surface a customer returns to; they never see the Paige platform
-- page (§9). Anon-callable by design (they're logged out).
-- Brand-only, no tenant_id: the anon caller (a logged-out customer) needs the
-- name/slug/logo/color to render the gateway and nothing else.
CREATE OR REPLACE FUNCTION public.peek_tenant_portal_brand(_slug text)
RETURNS TABLE (
  tenant_name text,
  tenant_slug text,
  logo_url text,
  primary_color text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    t.name,
    t.slug,
    COALESCE(NULLIF(t.brand->>'logo_url', ''), p.brand_logo_url) AS logo_url,
    NULLIF(t.brand->>'primary_color', '') AS primary_color
  FROM public.tenants t
  LEFT JOIN public.tenant_legal_profile p ON p.tenant_id = t.id
  WHERE lower(t.slug) = lower(trim(_slug))
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.peek_tenant_portal_brand(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_tenant_portal_brand(text) TO anon, authenticated;

-- Add tenant_slug to the authed client-brand helper so the portal knows which
-- gateway to send the customer back to on sign-out. Return-type change → DROP+CREATE.
DROP FUNCTION IF EXISTS public.get_client_portal_brand();
CREATE FUNCTION public.get_client_portal_brand()
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  logo_url text,
  primary_color text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    t.slug AS tenant_slug,
    COALESCE(NULLIF(t.brand->>'logo_url', ''), p.brand_logo_url) AS logo_url,
    NULLIF(t.brand->>'primary_color', '') AS primary_color
  FROM public.clients c
  JOIN public.tenants t ON t.id = c.tenant_id
  LEFT JOIN public.tenant_legal_profile p ON p.tenant_id = t.id
  WHERE c.linked_user_id = auth.uid()
  ORDER BY c.created_at ASC
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_client_portal_brand() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_portal_brand() TO authenticated;
