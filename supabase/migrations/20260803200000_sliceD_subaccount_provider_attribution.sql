-- Slice D · agency ATTRIBUTION (#221 Tier x Capability matrix — ATTRIBUTION
-- column of the Sub-account tier row). Resolves the display name (+ brand mark)
-- of the AGENCY that provides the caller's sub-account, so the admin chrome can
-- render a "Provided by <agency>" line.
--
-- §18/§13: NO new column. The provider IS the structural parent (parent_tenant_id);
-- a separate provided_by_agency_id would be a premature dead flag today (no
-- reseller-≠-parent tier exists). If one is ever added, this resolver's single
-- parent lookup becomes COALESCE(provided_by_agency_id, parent_tenant_id) — a
-- one-line delta, not a rework.
--
-- §9 crux: a sub-account user is a member ONLY of their own sub-account, so the
-- tenants SELECT policy (is_platform_owner() OR is_tenant_member(id)) blocks them
-- from reading their PARENT agency's tenants row. Seeing your OWN provider's name
-- is a legitimate, narrow disclosure — but it must NOT come from widening tenants
-- RLS or a client-side join (either would over-expose). It comes ONLY through this
-- SECURITY DEFINER RPC, which derives the tenant strictly from auth (never a
-- request body) and returns ONLY the parent's name + brand mark, nothing else.
CREATE OR REPLACE FUNCTION public.subaccount_provider_context()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _self_id   uuid;
  _parent_id uuid;
  _name      text;
  _logo      text;
BEGIN
  -- Caller's OWN active tenant, auth.uid()-keyed (§9). Never trust a body param.
  _self_id := public.current_user_tenant_id();
  IF _self_id IS NULL THEN
    -- God / platform tier (no tenant scope) provides nothing to attribute.
    RETURN jsonb_build_object('provided_by', NULL);
  END IF;

  -- Walk to the structural parent (== provider in the single-tier model).
  SELECT parent_tenant_id INTO _parent_id
  FROM public.tenants WHERE id = _self_id;

  IF _parent_id IS NULL THEN
    -- Standalone Tenant / Agency parent — no provider above them. No line renders.
    RETURN jsonb_build_object('provided_by', NULL);
  END IF;

  -- Only an agency/enterprise parent is a "provider". A parent that is neither
  -- yields NULL (chrome renders nothing) rather than a misleading attribution.
  SELECT t.name, NULLIF(t.brand->>'logo_url', '')
  INTO _name, _logo
  FROM public.tenants t
  WHERE t.id = _parent_id
    AND t.account_type IN ('agency', 'enterprise');

  RETURN jsonb_build_object(
    'provided_by',      _name,   -- NULL if parent isn't an agency/enterprise
    'provided_by_logo', _logo,   -- optional brand mark; chrome uses text only
    'provided_by_id',   CASE WHEN _name IS NULL THEN NULL ELSE _parent_id END
  );
END;
$$;

-- Least privilege — authenticated only, keyed on auth.uid(). No anon/public;
-- the caller's identity IS the scope.
REVOKE ALL ON FUNCTION public.subaccount_provider_context() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.subaccount_provider_context() TO authenticated;
