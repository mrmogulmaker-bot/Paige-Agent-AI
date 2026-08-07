-- ============================================================================
-- ABSOLUTE RULE — a SUB-ACCOUNT is NEVER an agency (§51 tier-matrix, §9 isolation)
-- ============================================================================
-- Owner directive (2026-08-07): "lock in an absolute rule so any new sub-account
-- that comes in under any new agency, that rule remains the same. So we can't
-- break this anymore."
--
-- WHAT BROKE (Antonio Daniel LLC, tenant e7f1b157, a sub-account under Project
-- Mogul Enterprise): it was mis-modeled TWO ways at once, and EITHER one alone
-- makes `agency_current_id()` resolve its owner as an "agency manager", so
-- `resolveLandingRoute` sent him to the /agency operator dashboard instead of his
-- OWN Command Center:
--   1. tenants.account_type = 'agency' WHILE parent_tenant_id IS NOT NULL
--      (a child can't also be a top-level agency).
--   2. an agency_team_members row naming his OWN sub-account as the agency
--      (agency_tenant_id pointed at a child tenant).
-- The data was corrected out-of-band; THIS migration makes the invariant
-- STRUCTURAL so no provisioning path, MCP call, manual edit, or future session
-- can reintroduce it. Three layers, defense in depth (§13):
--
--   (1) tenants CHECK      — a child tenant can never be 'agency'/'enterprise'.
--   (2) agency_team_members trigger — a roster row may only point at a REAL
--                            top-level agency, never a sub-account/standalone.
--   (3) agency_current_id  — belt: only count an agency target that is actually a
--                            top-level agency, so a sub-account owner can NEVER
--                            resolve as a manager even if a stray row slipped in.
--
-- Pre-verified on prod before writing: the ONLY account_type violator was
-- e7f1b157 (now 'standalone'); the ONLY stray agency_team_members row was
-- e7f1b157's (deleted); all remaining roster rows point at PME (valid). So both
-- guards below apply cleanly to existing data.
-- ============================================================================

-- (1) A child tenant can never be a manager-tier account. Only a TOP-LEVEL tenant
--     (parent_tenant_id IS NULL) may be 'agency'/'enterprise'; a child is a
--     sub-account (account_type 'standalone').
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_subaccount_not_agency;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_subaccount_not_agency
  CHECK (parent_tenant_id IS NULL OR account_type NOT IN ('agency','enterprise'));

-- (2) The agency-team roster may only point at a REAL top-level agency. This closes
--     the SECOND break path — a roster row is enough to route someone to /agency
--     on its own, independent of account_type — so guard it directly.
CREATE OR REPLACE FUNCTION public._assert_agency_team_target_is_agency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = NEW.agency_tenant_id
      AND t.parent_tenant_id IS NULL
      AND t.account_type IN ('agency','enterprise')
  ) THEN
    RAISE EXCEPTION
      'agency_team_members.agency_tenant_id (%) must reference a top-level agency/enterprise tenant, not a sub-account or standalone (sub-account-never-agency invariant)',
      NEW.agency_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_agency_team_target_is_agency ON public.agency_team_members;
CREATE TRIGGER trg_agency_team_target_is_agency
  BEFORE INSERT OR UPDATE OF agency_tenant_id ON public.agency_team_members
  FOR EACH ROW EXECUTE FUNCTION public._assert_agency_team_target_is_agency();

-- (3) Belt-and-suspenders in the resolver itself. BOTH branches now require the
--     resolved tenant to be a TOP-LEVEL agency/enterprise, so a sub-account owner
--     can never resolve as an agency manager and be mis-routed to /agency. Behavior
--     for a LEGITIMATE agency owner (parent_tenant_id IS NULL) is unchanged — this
--     only stops a mis-modeled child from qualifying. (§37: agency_switch_context
--     and the /agency landing are the consumers; both want exactly this narrowing.)
CREATE OR REPLACE FUNCTION public.agency_current_id(_actor uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT atm.agency_tenant_id FROM public.agency_team_members atm
       JOIN public.tenants at ON at.id = atm.agency_tenant_id
       WHERE atm.user_id = _actor AND atm.status = 'active'
         AND at.parent_tenant_id IS NULL
         AND at.account_type IN ('agency','enterprise')
       ORDER BY atm.joined_at ASC NULLS LAST LIMIT 1),
    (SELECT t.id FROM public.tenant_members m
       JOIN public.tenants t ON t.id = m.tenant_id
       WHERE m.user_id = _actor AND m.status = 'active' AND m.role = 'owner'
         AND t.account_type IN ('agency','enterprise')
         AND t.parent_tenant_id IS NULL
       ORDER BY m.joined_at ASC NULLS LAST, t.created_at ASC LIMIT 1)
  );
$function$;
