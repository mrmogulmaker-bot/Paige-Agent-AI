-- MCP Agency Tier (#25) — completion: robust agency-tier derivation + a working
-- enter/exit round-trip for switch_into_subaccount.
--
-- The first cut derived "agency tier" from the caller's ACTIVE tenant's
-- account_type. That trapped the operator: switching into a standalone child
-- dropped them to 'tenant' tier with no MCP path back (§10 dead-end). The fix:
--   1. agency-ness = "does this actor own/admin ANY agency/enterprise tenant",
--      independent of which tenant they're currently in, so the agency tools stay
--      reachable while operating inside a child;
--   2. entering a child grants the operator a membership on THEIR OWN child (they
--      own the parent agency → entitled; the GHL agency model) so the active
--      tenant actually resolves there and tenant tools operate in the child;
--   3. an explicit exit that returns them to their agency home.
-- All writes stay behind the same parentage guard (agency_can_manage_child).

-- ── (1) actor_manages_any_agency — the robust agency-tier signal ──────────────
CREATE OR REPLACE FUNCTION public.actor_manages_any_agency(_actor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members m
    JOIN public.tenants t ON t.id = m.tenant_id
    WHERE m.user_id = _actor
      AND m.status = 'active'
      AND m.role IN ('owner', 'admin')
      AND t.account_type IN ('agency', 'enterprise')
  );
$$;

-- ── (2) actor_primary_agency — the agency "home" to exit back to ─────────────
-- The first (oldest) agency/enterprise tenant the actor owns/admins. NULL when
-- they manage none (the exit RPC treats NULL as an error).
CREATE OR REPLACE FUNCTION public.actor_primary_agency(_actor uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id
  FROM public.tenant_members m
  JOIN public.tenants t ON t.id = m.tenant_id
  WHERE m.user_id = _actor
    AND m.status = 'active'
    AND m.role IN ('owner', 'admin')
    AND t.account_type IN ('agency', 'enterprise')
  ORDER BY m.joined_at ASC NULLS LAST, t.created_at ASC
  LIMIT 1;
$$;

-- ── (3) agency_enter_subaccount — guarded switch INTO a child ─────────────────
-- Parentage-checked, then (a) ensures the operator has a membership on the child
-- so actorTenantId() resolves there, and (b) points their active tenant at it.
-- ON CONFLICT DO NOTHING preserves an existing (e.g. 'owner') membership rather
-- than downgrading a self-created child's creator.
CREATE OR REPLACE FUNCTION public.agency_enter_subaccount(_child uuid, _actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.agency_can_manage_child(_child, _actor) THEN
    RAISE EXCEPTION 'agency_scope_forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (_child, _actor, 'admin', 'active', now())
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
  UPDATE public.profiles SET active_tenant_id = _child WHERE user_id = _actor;
END;
$$;

-- ── (4) agency_exit_subaccount — return to the agency home ────────────────────
CREATE OR REPLACE FUNCTION public.agency_exit_subaccount(_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _agency uuid;
BEGIN
  SELECT public.actor_primary_agency(_actor) INTO _agency;
  IF _agency IS NULL THEN
    RAISE EXCEPTION 'no_agency_home' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET active_tenant_id = _agency WHERE user_id = _actor;
  RETURN _agency;
END;
$$;

-- ── Least privilege — service_role only (MCP passes the token-derived actor) ──
REVOKE ALL ON FUNCTION public.actor_manages_any_agency(uuid)     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.actor_primary_agency(uuid)         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.agency_enter_subaccount(uuid,uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.agency_exit_subaccount(uuid)       FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.actor_manages_any_agency(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.actor_primary_agency(uuid)         TO service_role;
GRANT EXECUTE ON FUNCTION public.agency_enter_subaccount(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agency_exit_subaccount(uuid)       TO service_role;
