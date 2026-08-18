-- ============================================================================
-- §65 — extend agency_switch_context() with agency_account_number.
--
-- WHY: a confirmed agency manager currently lands on the bare `/agency` route,
-- which dead-ends on the LEGACY board. The §65 route taxonomy roots the agency
-- shell at `/agency/{account_number}/…`, so the landing resolver needs the
-- agency's account_number at the same moment it learns `is_agency_manager` —
-- without a second round-trip (the same Option-B2 shape used for
-- agency_list_my_subaccounts in 20260917000000).
--
-- ADDITIVE-ONLY (§37): this is a byte-faithful superset of the live definition
-- (20260714140017_tier_rail_phaseA.sql (1b) — re-verified against prod
-- pg_get_functiondef on 2026-08-18, identical). The delta is EXACTLY:
--   (a) one new DECLARE var `_agency_account_number bigint`,
--   (b) `t.account_number` added to the EXISTING `_is_mgr`-gated tenants SELECT,
--   (c) one new jsonb key `agency_account_number`, gated by the SAME `_is_mgr`
--       CASE as agency_name.
-- The four existing keys, their values, their gates, the rail-derived
-- `_is_mgr` logic, the `auth.uid()` derivation, LANGUAGE/STABLE/SECURITY
-- DEFINER/search_path, and the REVOKE/GRANT are all unchanged.
--
-- §9/§59: the new field is INSIDE the `_is_mgr` gate — a non-manager caller
-- gets NULL, exactly like agency_id/agency_name. Caller scope is still derived
-- SERVER-SIDE from auth.uid() (never a parameter); the function takes no args,
-- so there is nothing a caller can supply to widen its own scope. §51: the
-- manager test still runs through agency_current_id() + agency_team_role(),
-- both hardened by 20260807230000 so a sub-account can never resolve as an
-- agency — that narrowing is inherited unchanged, not weakened.
--
-- §9 note on the value itself: account_number is an ADDRESS, not a grant
-- (20260916000000) — and it is only ever returned for the agency this caller
-- is already a confirmed manager of.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.agency_switch_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid         uuid := auth.uid();
  _agency_id   uuid;
  _agency_name text;
  _agency_account_number bigint;
  _active      uuid;
  _is_mgr      boolean;
BEGIN
  -- Resolve the actor's agency off the declared rail (agency_current_id is now
  -- rail-first), then gate manager status on the rail-derived role.
  _agency_id := public.agency_current_id(_uid);
  _is_mgr := _agency_id IS NOT NULL
             AND public.agency_team_role(_agency_id, _uid) IS NOT NULL;

  IF _is_mgr THEN
    SELECT t.name, t.account_number
      INTO _agency_name, _agency_account_number
      FROM public.tenants t WHERE t.id = _agency_id;
  END IF;

  SELECT active_tenant_id INTO _active FROM public.profiles WHERE user_id = _uid;

  RETURN jsonb_build_object(
    'is_agency_manager', COALESCE(_is_mgr, false),
    'agency_id',         CASE WHEN _is_mgr THEN _agency_id ELSE NULL END,
    'agency_name',       CASE WHEN _is_mgr THEN _agency_name ELSE NULL END,
    'agency_account_number', CASE WHEN _is_mgr THEN _agency_account_number ELSE NULL END,
    'active_tenant_id',  _active
  );
END;
$function$;

-- Re-apply the exact live grants (CREATE OR REPLACE preserves them, but the
-- repo convention — and 20260714140017 — restates them so the guarantee is in
-- the migration, not implied).
REVOKE ALL ON FUNCTION public.agency_switch_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agency_switch_context() TO authenticated;

COMMIT;
