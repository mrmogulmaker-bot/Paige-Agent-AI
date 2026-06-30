
CREATE TABLE IF NOT EXISTS public.tenant_email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  from_email_local text NOT NULL DEFAULT 'no-reply',
  from_name text NOT NULL,
  resend_domain_id text,
  status text NOT NULL DEFAULT 'pending', -- pending | verifying | verified | failed
  dns_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_email_domains_one_default
  ON public.tenant_email_domains (tenant_id) WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_email_domains TO authenticated;
GRANT ALL ON public.tenant_email_domains TO service_role;

ALTER TABLE public.tenant_email_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access"
  ON public.tenant_email_domains FOR ALL
  TO authenticated
  USING (is_platform_owner())
  WITH CHECK (is_platform_owner());

CREATE POLICY "Tenant admins manage own domains"
  ON public.tenant_email_domains FOR ALL
  TO authenticated
  USING (tenant_id = current_user_tenant_id() AND has_role(auth.uid(),'admin'))
  WITH CHECK (tenant_id = current_user_tenant_id() AND has_role(auth.uid(),'admin'));

CREATE POLICY "Tenant members read own domains"
  ON public.tenant_email_domains FOR SELECT
  TO authenticated
  USING (tenant_id = current_user_tenant_id());

CREATE TRIGGER trg_tenant_email_domains_updated_at
  BEFORE UPDATE ON public.tenant_email_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: resolve sender for a tenant. Falls back to paigeagent.ai default.
CREATE OR REPLACE FUNCTION public.get_tenant_sender(_tenant_id uuid)
RETURNS TABLE (from_name text, from_email text, source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(d.from_name, 'Paige Agent') AS from_name,
    COALESCE(d.from_email_local || '@' || d.domain, 'no-reply@paigeagent.ai') AS from_email,
    CASE WHEN d.id IS NULL THEN 'platform_default' ELSE 'tenant_domain' END AS source
  FROM (SELECT _tenant_id AS t) x
  LEFT JOIN public.tenant_email_domains d
    ON d.tenant_id = x.t
    AND d.is_default = true
    AND d.status = 'verified'
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_sender(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_sender(uuid) TO authenticated, service_role;

-- Seed MMA's verified mogulmakeracademy.com sender (Antonio's primary brand domain).
INSERT INTO public.tenant_email_domains
  (tenant_id, domain, from_email_local, from_name, status, is_default, verified_at)
SELECT id, 'mogulmakeracademy.com', 'no-reply', 'Mogul Maker Academy', 'verified', true, now()
FROM public.tenants WHERE slug = 'mma'
ON CONFLICT (tenant_id, domain) DO NOTHING;
