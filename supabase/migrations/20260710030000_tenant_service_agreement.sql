-- Per-tenant service agreement (#74). Each tenant can author their OWN client
-- agreement (their document, their attorney's language); if they haven't, the
-- client sees a neutral platform-default template (rendered client-side). This
-- replaces the hardcoded MMA/BUILD-to-FUND/credit contract that every client
-- was previously shown (§2/§9/§116).
ALTER TABLE public.tenant_legal_profile
  ADD COLUMN IF NOT EXISTS service_agreement_title text,
  ADD COLUMN IF NOT EXISTS service_agreement_body text,
  ADD COLUMN IF NOT EXISTS service_agreement_updated_at timestamptz;

-- Client read: a client can't read tenant_legal_profile under RLS, so this
-- SECURITY DEFINER helper returns their own tenant's agreement (title + body).
-- Body is NULL when the tenant hasn't authored one → the client UI renders the
-- neutral default.
CREATE OR REPLACE FUNCTION public.get_client_service_agreement()
RETURNS TABLE (tenant_name text, agreement_title text, agreement_body text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.name, p.service_agreement_title, p.service_agreement_body
  FROM public.clients c
  JOIN public.tenants t ON t.id = c.tenant_id
  LEFT JOIN public.tenant_legal_profile p ON p.tenant_id = t.id
  WHERE c.linked_user_id = auth.uid()
  ORDER BY c.created_at ASC
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_client_service_agreement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_service_agreement() TO authenticated;

-- Admin read (for the editor).
CREATE OR REPLACE FUNCTION public.get_tenant_service_agreement(_tenant_id uuid)
RETURNS TABLE (agreement_title text, agreement_body text, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to read this tenant''s agreement';
  END IF;
  RETURN QUERY
    SELECT p.service_agreement_title, p.service_agreement_body, p.service_agreement_updated_at
    FROM public.tenant_legal_profile p WHERE p.tenant_id = _tenant_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_tenant_service_agreement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_service_agreement(uuid) TO authenticated;

-- Admin write (the "custom field" — a tenant sets their own agreement).
CREATE OR REPLACE FUNCTION public.set_tenant_service_agreement(_tenant_id uuid, _title text, _body text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to edit this tenant''s agreement';
  END IF;
  -- legal_business_name is NOT NULL; seed it from the tenant name when first
  -- creating the legal profile row (unchanged on later updates).
  INSERT INTO public.tenant_legal_profile (tenant_id, legal_business_name, service_agreement_title, service_agreement_body, service_agreement_updated_at)
  VALUES (_tenant_id, COALESCE((SELECT name FROM public.tenants WHERE id = _tenant_id), 'Business'),
          NULLIF(trim(_title), ''), NULLIF(trim(_body), ''), now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET service_agreement_title = NULLIF(trim(_title), ''),
        service_agreement_body = NULLIF(trim(_body), ''),
        service_agreement_updated_at = now(),
        updated_at = now();
END $$;
REVOKE EXECUTE ON FUNCTION public.set_tenant_service_agreement(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_service_agreement(uuid, text, text) TO authenticated;
