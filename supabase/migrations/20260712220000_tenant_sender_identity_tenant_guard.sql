-- Harden tenant_sender_identity (Rail Step 3 audit finding): it was SECURITY
-- DEFINER and returned ANY tenant's from-name/address to ANY authenticated
-- caller. Safe as used (callers pass their own tenant) but a latent cross-tenant
-- leak. Pin JWT callers to their own tenant; the platform owner (God) and the
-- service role (send-transactional-email) keep full cross-tenant access.
CREATE OR REPLACE FUNCTION public.tenant_sender_identity(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb; t public.tenants%ROWTYPE;
BEGIN
  -- auth.uid() IS NULL => service role (trusted). Platform owner (God) may resolve
  -- any tenant (§ God cross-tenant read invariant). Otherwise pin to own tenant.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_platform_owner()
     AND _tenant_id IS DISTINCT FROM public.current_user_tenant_id() THEN
    RETURN NULL;
  END IF;

  r := public.resolve_tenant_sender(_tenant_id);
  SELECT * INTO t FROM public.tenants WHERE id = _tenant_id;
  RETURN jsonb_build_object(
    'tenant_id',     _tenant_id,
    'tenant_name',   t.name,
    'tenant_slug',   t.slug,
    'from_name',     r ->> 'from_name',
    'support_email', t.brand ->> 'support_email',
    'from_address',  r ->> 'from_address',
    'reply_to',      r ->> 'reply_to'
  );
END; $$;
