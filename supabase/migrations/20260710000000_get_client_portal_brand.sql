-- Client-onboarding branding: a client (a tenant's customer) can't read the
-- tenants table directly under RLS, but their onboarding must wear the TENANT's
-- brand (§6/§9). This SECURITY DEFINER helper returns the brand for the tenant of
-- the caller's own linked clients row — logo + primary color from the canonical
-- tenants.brand jsonb, falling back to the tenant_legal_profile logo.
CREATE OR REPLACE FUNCTION public.get_client_portal_brand()
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  logo_url text,
  primary_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
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
