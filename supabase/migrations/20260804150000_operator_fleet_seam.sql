-- =============================================================================
-- Operator Fleet Seam — §10 callable control-plane for tenant provisioning +
-- lifecycle (Wave S1, #248). God/Super-Admin (is_platform_owner) only.
-- =============================================================================
-- Why this exists (§18 / §10): the Fleet Console UI drove tenant status by a raw
-- RLS-gated `UPDATE public.tenants`, and there was NO operator path to PROVISION
-- a tenant at all (`provision_tenant()` is self-provision — owner = auth.uid()).
-- These two SECURITY DEFINER RPCs are the ONE canonical, server-gated home for
-- the operator lifecycle acts, so the UI and any future Paige agent call the SAME
-- seam instead of forking write logic. The gate is server-derived
-- (`is_platform_owner()` — never a body-passed tenant/owner), so a
-- tenant/agency/sub-account/client caller RAISEs 42501 (§9/§51 tier matrix).
--
-- Tier matrix (§51): God/Owner = full provision + lifecycle. Every other tier
-- (Agency, Standalone Tenant, Sub-account, Client, Anonymous) = DENIED at the
-- 42501 gate. Sub-account creation is a SEPARATE seam (`create_subaccount`) and
-- is intentionally NOT reachable here.
--
-- §4 destructive gate: these RPCs can SET a status (incl. suspended/canceled) but
-- perform NO hard delete — there is no tenant-delete path and this migration adds
-- none. The UI keeps its confirm-dialog on suspend/cancel; no auto-destroy is
-- wired. §2: coaching-generic, zero finance/credit default.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- operator_set_tenant_status — the canonical lifecycle-transition seam.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.operator_set_tenant_status(
  _tenant_id uuid,
  _status text,
  _reason text DEFAULT NULL
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _tenant public.tenants;
BEGIN
  -- §9/§51: server-derived God-tier gate. Bypassing RLS via SECURITY DEFINER is
  -- exactly why this explicit check is the FIRST statement — never trust the RLS
  -- policy alone under a definer, and never trust a caller-supplied identity.
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'platform owner only' USING ERRCODE = '42501';
  END IF;
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant id required' USING ERRCODE = '22000';
  END IF;
  IF _status NOT IN ('trial', 'active', 'past_due', 'suspended', 'canceled') THEN
    RAISE EXCEPTION 'invalid tenant status: %', _status USING ERRCODE = '22000';
  END IF;

  UPDATE public.tenants
     SET status = _status::public.tenant_status
   WHERE id = _tenant_id
  RETURNING * INTO _tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0002';
  END IF;

  -- Audit trail (actor = the operator; satisfies audit_logs "own row" policy).
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, data)
  VALUES (
    _actor, 'tenant.status_change', 'tenant', _tenant_id,
    jsonb_strip_nulls(jsonb_build_object('status', _status, 'reason', _reason))
  );

  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.operator_set_tenant_status(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.operator_set_tenant_status(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.operator_set_tenant_status(uuid, text, text) IS
  'Operator/God-only (is_platform_owner) tenant lifecycle transition. §10 callable seam for the Fleet Console + Paige. Audited. No hard delete (§4).';

-- ---------------------------------------------------------------------------
-- operator_provision_tenant — the operator-provisions-a-workspace seam.
-- Distinct from provision_tenant() (self-serve signup, owner = auth.uid()):
-- here the OPERATOR stands up a workspace for a prospect, optionally naming an
-- owner. Slug is auto-derived + de-duplicated when not supplied.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.operator_provision_tenant(
  _name text,
  _slug text DEFAULT NULL,
  _owner_user_id uuid DEFAULT NULL,
  _plan_offer text DEFAULT NULL,
  _seat_limit int DEFAULT NULL,
  _customer_limit int DEFAULT NULL,
  _status text DEFAULT 'trial'
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _tenant public.tenants;
  _base_slug text;
  _slug_final text;
  _suffix int := 0;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'platform owner only' USING ERRCODE = '42501';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'tenant name required' USING ERRCODE = '22000';
  END IF;
  IF _status NOT IN ('trial', 'active', 'past_due', 'suspended', 'canceled') THEN
    RAISE EXCEPTION 'invalid tenant status: %', _status USING ERRCODE = '22000';
  END IF;

  -- Derive a URL-safe slug from the supplied slug or the name, then de-dupe.
  _base_slug := trim(both '-' from regexp_replace(
    lower(trim(COALESCE(NULLIF(trim(_slug), ''), _name))), '[^a-z0-9]+', '-', 'g'));
  IF _base_slug IS NULL OR length(_base_slug) = 0 THEN _base_slug := 'tenant'; END IF;
  _base_slug := left(_base_slug, 40);
  _slug_final := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = _slug_final) LOOP
    _suffix := _suffix + 1;
    _slug_final := _base_slug || '-' || _suffix::text;
  END LOOP;

  INSERT INTO public.tenants (
    slug, name, owner_user_id, parent_tenant_id, status,
    plan_offer, seat_limit, customer_limit, trial_ends_at
  )
  VALUES (
    _slug_final, trim(_name), _owner_user_id, NULL, _status::public.tenant_status,
    _plan_offer,
    GREATEST(COALESCE(_seat_limit, 0), 0),
    GREATEST(COALESCE(_customer_limit, 0), 0),
    CASE WHEN _status = 'trial' THEN now() + interval '14 days' ELSE NULL END
  )
  RETURNING * INTO _tenant;

  -- If an owner was named, seat them as the tenant's owner member.
  IF _owner_user_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (_tenant.id, _owner_user_id, 'owner', 'active', now())
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, data)
  VALUES (
    _actor, 'tenant.provision', 'tenant', _tenant.id,
    jsonb_strip_nulls(jsonb_build_object(
      'slug', _tenant.slug, 'name', _tenant.name, 'status', _status,
      'plan_offer', _plan_offer, 'owner_user_id', _owner_user_id
    ))
  );

  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.operator_provision_tenant(text, text, uuid, text, int, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.operator_provision_tenant(text, text, uuid, text, int, int, text) TO authenticated;

COMMENT ON FUNCTION public.operator_provision_tenant(text, text, uuid, text, int, int, text) IS
  'Operator/God-only (is_platform_owner) workspace provisioning. §10 callable seam for the Fleet Console + Paige. Auto-slugs, seats named owner, audited. Coaching-generic (§2).';
