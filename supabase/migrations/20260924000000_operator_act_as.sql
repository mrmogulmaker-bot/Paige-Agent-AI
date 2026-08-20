-- =============================================================================
-- Operator act-as — enter/exit a tenant from the Fleet console (Slice 2)
-- =============================================================================
-- The Fleet Tenants directory already tells the operator, in shipped CD copy:
--   "Entering a tenant puts you in their shell with their data.
--    Every session is recorded in Governance."
-- Until this migration that sentence was false on both halves: "Enter" only wrote
-- `?tenant=` into the URL (a selection inside the console), nothing switched scope,
-- and nothing was recorded anywhere. These two RPCs make the copy true (§13).
--
-- WHY NOT agency_enter_subaccount (§18 — the sibling was examined and rejected)
-- -------------------------------------------------------------------------
-- That function INSERTs a `tenant_members` row so RLS resolves inside the child.
-- For an AGENCY that is correct: a parent genuinely holds a seat in its own child.
-- For the PLATFORM OPERATOR it would be a §9 defect — the operator would silently
-- become a member of every tenant they ever looked at, which:
--   • pollutes each tenant's own roster with a person who does not work there,
--   • inflates seat counts, and
--   • corrupts the very fleet metrics the operator reads — `fleet.tenants_at_risk`
--     (A2) grades a tenant at risk partly on having zero active seats, so visiting
--     a seatless tenant would quietly "fix" its risk grade by joining it.
-- It is also gated on `agency_can_manage_child`, which an operator fails outright:
-- they are not the parent agency of anything.
--
-- So operator act-as grants NO membership at all. The enabling fact (verified
-- against the live schema, not assumed) is that `current_user_tenant_id()` already
-- honours `profiles.active_tenant_id` when `is_platform_admin(auth.uid())` is true,
-- with no `tenant_members` row required — and `is_platform_admin(_actor)` matches
-- role IN ('platform_admin','super_admin'), so it covers the real super_admin
-- operator. Pointing `active_tenant_id` is therefore sufficient, and membership
-- would be both unnecessary and harmful.
--
-- §59 — these are SECURITY DEFINER, so the EXECUTE grant is NOT the guard: each
-- body re-enforces the caller's scope with `is_platform_operator()` and RAISEs
-- before any write. Keyed on auth.uid() only; no caller-supplied actor to forge.
-- Gated on is_platform_operator() (§53 — super_admin OR platform_admin), never the
-- frozen is_platform_owner(), which stays super_admin-only under the integrity gates.
-- =============================================================================

-- ── (1) operator_enter_tenant(_tenant) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operator_enter_tenant(_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _name    text;
  _prev    uuid;
  _touched integer;
BEGIN
  -- Authority first, before anything is read or written.
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  -- A real tenant, or a loud failure. Without this, entering a deleted/mistyped id
  -- would point active_tenant_id at nothing and strand the operator in a shell with
  -- no tenant — a blank screen with no explanation, which is the silent-failure
  -- class §32 exists to kill.
  SELECT name INTO _name FROM public.tenants WHERE id = _tenant;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT active_tenant_id INTO _prev FROM public.profiles WHERE user_id = auth.uid();

  UPDATE public.profiles SET active_tenant_id = _tenant WHERE user_id = auth.uid();

  -- Guard the write rather than trust it. `profiles.user_id` is uniquely indexed and
  -- every current operator has a row, so this is 1 today — but an operator without a
  -- profile row would otherwise get a silent 0-row UPDATE, a success-shaped response,
  -- and a shell that never switched. Fail loudly instead (§32).
  GET DIAGNOSTICS _touched = ROW_COUNT;
  IF _touched <> 1 THEN
    RAISE EXCEPTION 'operator_profile_missing' USING ERRCODE = 'P0002';
  END IF;

  -- The audit row is the second half of the promise the UI already makes. Written
  -- INSIDE the same transaction as the scope change, so "entered" and "recorded"
  -- cannot disagree: if the insert fails, the switch rolls back with it.
  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload)
  VALUES
    (auth.uid(), 'platform_operator', 'operator.tenant.enter', 'tenant', _tenant, _tenant,
     jsonb_build_object('tenant_name', _name, 'previous_active_tenant_id', _prev));

  RETURN jsonb_build_object('active_tenant_id', _tenant, 'name', _name);
END;
$$;

COMMENT ON FUNCTION public.operator_enter_tenant(uuid) IS
  'Platform operator acts as a tenant: points profiles.active_tenant_id and records the act in paige_audit_log. Grants NO tenant_members membership by design (§9) — current_user_tenant_id() resolves operator scope without one.';

-- ── (2) operator_exit_tenant() ───────────────────────────────────────────────
-- Restores the operator to TENANT-LESS (active_tenant_id = NULL), which is their
-- real resting state — verified on prod: the platform's only operator carries a
-- profile row with a NULL active_tenant_id. This is deliberately NOT the agency
-- exit's behaviour (which resolves back to a primary agency); an operator has no
-- home tenant to return to, and inventing one would put them in someone's book.
--
-- KNOWN CONSEQUENCE, recorded rather than discovered later (§13): §52's operator
-- briefing is gated on a tenant-less persona, so while acting as a tenant the
-- operator's Paige briefing NO-OPs and returns on exit. That is arguably correct —
-- they are standing in a tenant, not at the platform — but it is a real behaviour
-- change and belongs in the record, not in a surprise.
CREATE OR REPLACE FUNCTION public.operator_exit_tenant()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _prev    uuid;
  _touched integer;
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT active_tenant_id INTO _prev FROM public.profiles WHERE user_id = auth.uid();

  UPDATE public.profiles SET active_tenant_id = NULL WHERE user_id = auth.uid();

  GET DIAGNOSTICS _touched = ROW_COUNT;
  IF _touched <> 1 THEN
    RAISE EXCEPTION 'operator_profile_missing' USING ERRCODE = 'P0002';
  END IF;

  -- Exit is logged even when the operator was already tenant-less (_prev IS NULL).
  -- An exit that records nothing would make the audit trail read as an unbounded
  -- session that never ended.
  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload)
  VALUES
    (auth.uid(), 'platform_operator', 'operator.tenant.exit', 'tenant', _prev, _prev,
     jsonb_build_object('previous_active_tenant_id', _prev));

  RETURN jsonb_build_object('active_tenant_id', NULL, 'previous_active_tenant_id', _prev);
END;
$$;

COMMENT ON FUNCTION public.operator_exit_tenant() IS
  'Platform operator stops acting as a tenant: restores the tenant-less resting state (active_tenant_id = NULL) and records the exit in paige_audit_log.';

-- ── (3) grants — authenticated only; the body is the real guard (§59) ────────
REVOKE ALL ON FUNCTION public.operator_enter_tenant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.operator_exit_tenant()      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.operator_enter_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_exit_tenant()      TO authenticated;
