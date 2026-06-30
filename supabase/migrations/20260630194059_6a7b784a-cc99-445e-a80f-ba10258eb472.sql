
ALTER TABLE public.tenant_legal_profile
  ADD COLUMN IF NOT EXISTS white_label_ai_connect boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS brand_display_name text,
  ADD COLUMN IF NOT EXISTS brand_logo_url text;

CREATE OR REPLACE FUNCTION public.get_workspace_brand()
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  white_label_ai_connect boolean,
  brand_display_name text,
  brand_logo_url text,
  legal_business_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    COALESCE(p.white_label_ai_connect, true) AS white_label_ai_connect,
    p.brand_display_name,
    p.brand_logo_url,
    p.legal_business_name
  FROM public.clients c
  JOIN public.tenants t ON t.id = c.tenant_id
  LEFT JOIN public.tenant_legal_profile p ON p.tenant_id = t.id
  WHERE c.linked_user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_brand() TO authenticated;
