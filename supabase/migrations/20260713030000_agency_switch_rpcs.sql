-- Agency Switcher (#27) — BROWSER-CALLABLE, §9-parentage-gated switch RPCs.
--
-- The enter/exit RPCs shipped in #25 (20260712310000) are actor-EXPLICIT and
-- GRANTed to service_role ONLY, so the browser cannot call them: a forged
-- _actor would be a §9 IDOR hole (any user could point their active tenant at
-- any tenant). The agency-owner-only sub-account SWITCHER runs in the user's own
-- authenticated session, so it needs auth.uid()-keyed wrappers that carry NO
-- caller-supplied identity at all — the caller's own token IS the scope.
--
-- These MIRROR the Agency View wrappers (20260713010000) exactly: SECURITY
-- DEFINER SET search_path = public, keyed on auth.uid(), REVOKE public/anon +
-- GRANT authenticated, every child-touching write proven via
-- agency_can_manage_child(_child, auth.uid()) BEFORE any mutation.
--
-- The OWNER'S HARD RULE, enforced by construction: only an AGENCY owner/admin can
-- switch. agency_can_manage_child JOINs child→parent and requires the caller be
-- an owner/admin active member of the PARENT agency/enterprise. A SUB-ACCOUNT
-- user manages no children ⇒ agency_enter_subaccount always raises for them ⇒
-- they can never enter anything, and agency_switch_context reports
-- is_agency_manager=false ⇒ the frontend never renders the switcher for them.
--
-- Design rules honored:
--   • auth.uid() only — no _actor param on any function here, so a browser
--     client has nothing to forge (§9/§13).
--   • Reuses the audited agency_can_manage_child(_child, _actor) guard — no
--     copy-paste fork of the authority check (§13).
--   • §10 — this is the Paige-callable switch seam; the switcher UI is one
--     caller, Paige's agent is another. No switch logic lives only in React.

-- ── (1) agency_enter_subaccount(_child) — browser switch INTO a child ─────────
-- Parentage-checked FIRST, then (a) grants the acting agency owner a temporary
-- membership on the child so RLS lets them operate AS the sub-account, and (b)
-- points their active tenant at it. The ON CONFLICT clause NEVER downgrades a
-- real owner: an existing 'owner' row stays 'owner'; anything else is (re)set to
-- an active 'admin'. Distinct signature ((uuid) vs the #25 (uuid,uuid)) so this
-- overload coexists with the service_role one — PostgreSQL keys on arg types.
CREATE OR REPLACE FUNCTION public.agency_enter_subaccount(_child uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- §9 IDOR guard — parentage proven BEFORE any write. A sub-account user (who
  -- manages no children) fails here, so they can never enter anything.
  IF NOT public.agency_can_manage_child(_child, auth.uid()) THEN
    RAISE EXCEPTION 'agency_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  -- Temporary child membership so actorTenantId()/RLS resolve in the child.
  -- Never downgrade a legitimately-owned membership.
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (_child, auth.uid(), 'admin', 'active', now())
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET status = 'active',
        role   = CASE WHEN tenant_members.role = 'owner' THEN 'owner' ELSE 'admin' END;

  UPDATE public.profiles SET active_tenant_id = _child WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'active_tenant_id', _child,
    'name',             (SELECT name FROM public.tenants WHERE id = _child)
  );
END;
$$;

-- ── (2) agency_exit_subaccount() — return to the agency home ──────────────────
-- Resolves the caller's primary agency inline (the same predicate as
-- actor_primary_agency: the oldest agency/enterprise tenant the caller
-- owns/admins), points active_tenant_id back at it, and returns it. A caller who
-- manages no agency raises 'not_an_agency_manager' — a plain sub-account user
-- should never reach this.
--
-- §9 hygiene: this does NOT revoke the temporary child membership on exit. The
-- enter overload above upserts either an 'owner' (real, must keep) or an 'admin'
-- (which may be temp OR a legitimately-granted admin seat), and there is no
-- reliable marker distinguishing "temp grant this function created" from "real
-- admin membership". Deleting on that ambiguous signal risks removing a real
-- membership (§13: never break a legitimate grant), so we conservatively LEAVE
-- it: agency_can_manage_child already re-authorizes every future entry, so a
-- lingering child admin row grants no authority the parentage guard doesn't
-- already confirm. Reclaiming temp seats, if ever wanted, belongs in an explicit
-- marked-membership scheme, not a heuristic DELETE here.
CREATE OR REPLACE FUNCTION public.agency_exit_subaccount()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _agency uuid;
BEGIN
  SELECT t.id
  INTO _agency
  FROM public.tenant_members m
  JOIN public.tenants t ON t.id = m.tenant_id
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('owner', 'admin')
    AND t.account_type IN ('agency', 'enterprise')
  ORDER BY m.joined_at ASC NULLS LAST, t.created_at ASC
  LIMIT 1;

  IF _agency IS NULL THEN
    RAISE EXCEPTION 'not_an_agency_manager' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET active_tenant_id = _agency WHERE user_id = auth.uid();

  RETURN jsonb_build_object('active_tenant_id', _agency);
END;
$$;

-- ── (3) agency_switch_context() — should the switcher render at all? ──────────
-- auth.uid()-keyed gate the frontend calls once on load to decide whether to
-- show the switcher, WITHOUT leaking any tenant it cannot manage. Returns the
-- caller's primary agency (id+name), their current active tenant, and whether
-- they manage ANY agency/enterprise (the same signal as actor_manages_any_agency,
-- inlined). A sub-account user gets is_agency_manager=false, agency_id=NULL ⇒ no
-- switcher, exactly the owner's rule.
CREATE OR REPLACE FUNCTION public.agency_switch_context()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _agency_id   uuid;
  _agency_name text;
  _active      uuid;
BEGIN
  SELECT t.id, t.name
  INTO _agency_id, _agency_name
  FROM public.tenant_members m
  JOIN public.tenants t ON t.id = m.tenant_id
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('owner', 'admin')
    AND t.account_type IN ('agency', 'enterprise')
  ORDER BY m.joined_at ASC NULLS LAST, t.created_at ASC
  LIMIT 1;

  SELECT active_tenant_id INTO _active
  FROM public.profiles WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'is_agency_manager', _agency_id IS NOT NULL,
    'agency_id',         _agency_id,
    'agency_name',       _agency_name,
    'active_tenant_id',  _active
  );
END;
$$;

-- ── (4) Least privilege — authenticated only, no anon/public ──────────────────
-- Every function keys off auth.uid(), so authenticated is exactly the audience:
-- the caller's own identity IS the scope, and it cannot be forged. Note the
-- (uuid) signature on enter — distinct from the #25 service_role (uuid,uuid)
-- overload, whose grants are untouched.
REVOKE ALL ON FUNCTION public.agency_enter_subaccount(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.agency_exit_subaccount()      FROM public, anon;
REVOKE ALL ON FUNCTION public.agency_switch_context()       FROM public, anon;

GRANT EXECUTE ON FUNCTION public.agency_enter_subaccount(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_exit_subaccount()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_switch_context()       TO authenticated;
