
-- Add tenant feature flags (BTF gated to MMA only)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

-- MMA gets BTF; everyone else does not
UPDATE public.tenants
   SET features = features || '{"btf_enabled": true}'::jsonb
 WHERE slug = 'mma';

-- Helper: read a feature flag for the active tenant
CREATE OR REPLACE FUNCTION public.tenant_has_feature(_feature text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (features ->> _feature)::boolean
       FROM public.tenants
      WHERE id = public.current_user_tenant_id()),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.tenant_has_feature(text) TO authenticated, service_role;

-- Helper: resolve sender identity for a tenant (used by every email-sending edge function)
CREATE OR REPLACE FUNCTION public.tenant_sender_identity(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tenant_id',     t.id,
    'tenant_name',   t.name,
    'tenant_slug',   t.slug,
    'from_name',     COALESCE(t.brand ->> 'from_name', t.name),
    'support_email', t.brand ->> 'support_email',
    -- MMA keeps its verified portal subdomain; everyone else uses the shared paige subdomain
    'from_address',  CASE
                       WHEN t.slug = 'mma' THEN 'alerts@portal.mogulmakeracademy.com'
                       ELSE 'notify@paigeagent.ai'
                     END,
    'reply_to',      COALESCE(t.brand ->> 'support_email', 'support@paigeagent.ai')
  )
  FROM public.tenants t
  WHERE t.id = _tenant_id;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_sender_identity(uuid) TO authenticated, service_role;
