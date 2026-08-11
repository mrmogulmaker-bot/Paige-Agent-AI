-- definer-anon-exempt: is_platform_operator is a role-check helper — returns false for anon (is_super_admin OR is_platform_admin of auth.uid()); exposes no data (§9 #117 audit).
-- §53 Operator role tiers + super_admin/platform_admin grant lockdown (owner-ruled 2026-08-09).
--
-- (CLAUDE.md §9/§51 platform-vs-tenant seam · §13/§32 provable · §37 producer inventory ·
--  §51 ABSOLUTE-INVARIANT structural-lock pattern, mirrors 20260807230000 sub-account-never-agency)
--
-- ── OWNER RULING (Antonio, 2026-08-09) ────────────────────────────────────────────────────────────
-- The God-tier `super_admin` role is grantable ONLY by an existing super_admin (or a trusted service
-- context) — admin@paigeagent.ai is the sole holder until Antonio explicitly invites more. The rule is
-- SCOPED to the platform-operator tiers (`super_admin`, `platform_admin`); every OTHER role grant
-- (admin, coach, client, broker_team_member, sales_rep, …) stays OPEN per today's design — this
-- migration does NOT touch them. `platform_admin` is a REAL lower-tier operator role (it already exists
-- in the app_role enum; `is_platform_admin()` = platform_admin OR super_admin): Antonio can delegate
-- platform-staff duties (Fleet Console, support, provisioning approval, all-tenant read) WITHOUT
-- granting God-tier — but only a super_admin can mint a platform_admin (same lockdown as super_admin).
--
-- ── §30 DIAGNOSE (grant-path audit, this session) ─────────────────────────────────────────────────
-- super_admin was ALREADY well-defended: user_roles INSERT RLS requires is_platform_owner();
-- change_user_role() RAISEs 'super_admin is bootstrap-only'; grant_tenant_member_role() RAISEs on
-- super_admin; signup provisioning inserts only 'user'; invite flows insert 'client'; the
-- tenant→app_role sync maps through an enum with no super_admin. NO active super_admin escalation.
-- BUT a REAL §9 gap surfaced for the NEW protected tier: grant_tenant_member_role() is
-- is_tenant_admin()-callable and blocks ONLY super_admin — so a TENANT ADMIN could grant
-- `platform_admin` (map_app_role_to_tenant_role returns 'member', no error) and mint themselves
-- platform-staff, crossing the tenant→platform seam. change_user_role() already protects it via
-- _protected=['admin','super_admin','platform_admin'] (owner-only), but the grant RPC did not.
--
-- ── THE FIX: one STRUCTURAL trigger (catches EVERY write path, not per-RPC) ────────────────────────
-- A BEFORE INSERT/UPDATE trigger on user_roles blocks a `super_admin`/`platform_admin` grant unless the
-- writer is a trusted server context (service_role, or a direct no-JWT connection = migration/pg_cron)
-- OR an existing platform owner (super_admin) acting via a verified JWT. This is the §51-invariant
-- pattern: a structural lock at the table, not a convention scattered across RPCs — so it holds no
-- matter which path (change_user_role, grant_tenant_member_role, the sync trigger, or a direct insert)
-- attempts the grant. It closes the platform_admin escalation AND makes the super_admin singleton
-- ENDURING (a snapshot audit would not).
--
-- ── §37 PRODUCER INVENTORY (why the trigger breaks NO legitimate writer) ──────────────────────────
--   • Bootstrap seed of super_admin — runs as a migration (no JWT → allowed by the service-context arm).
--   • Backend/service_role role writes — allowed by the service_role arm.
--   • change_user_role() granting a PROTECTED role — only reachable when is_platform_owner() (its own
--     _protected guard already enforces owner-only) → allowed. Non-owner protected grants it already RAISEs.
--   • grant_tenant_member_role() / signup / invite / tenant-sync — only ever grant NON-protected roles
--     (user/client/coach/admin/broker_team_member/member-mapped); the trigger's IN(...) never fires. The
--     ONE exception is the escalation this fix CLOSES: a tenant admin trying to grant platform_admin →
--     now correctly BLOCKED (was the gap).
--   • Frontend DIRECT user_roles writes (src/components/dashboard/ClientManagementDashboard.tsx:275-276
--     owner insert/delete of a client's role; src/pages/broker/AcceptBrokerInvite.tsx:186 broker_team_member)
--     — these grant NON-protected roles, so the trigger never fires on them. (This is ALSO why the
--     defense-in-depth REVOKE of anon/authenticated DML on user_roles is DEFERRED, NOT done here: the
--     §37 inventory found real authenticated direct writers, so a blanket REVOKE would break the owner's
--     role-management UI. That REVOKE requires migrating those two flows to SECURITY DEFINER RPCs first —
--     tracked as a follow-up. The structural trigger delivers the actual super_admin/platform_admin
--     lockdown the owner asked for WITHOUT that breakage.)
--
-- ── is_platform_operator() — the NEW widened operator helper (§18: add, don't widen in place) ──────
-- is_platform_operator() = is_super_admin() OR is_platform_admin(auth.uid()). is_platform_owner() is
-- LEFT FROZEN as super_admin-only (owner §18 ruling) — every integrity gate that uses it (#31 revenue
-- trigger, Systems Check RLS, tenant_revenue_classification writes, dozens of RLS policies) keeps its
-- exact God-tier behavior with ZERO blast radius. Operator-scoped surfaces migrate from
-- is_platform_owner() → is_platform_operator() DELIBERATELY, one at a time, as each opens to platform_admin.

begin;

-- ── 1. is_platform_operator() — super_admin OR platform_admin. ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_operator()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT public.is_super_admin() OR public.is_platform_admin(auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.is_platform_operator() FROM public;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.is_platform_operator() IS
  '§53 platform-operator tier = is_super_admin() OR is_platform_admin(). The WIDENED operator helper. '
  'is_platform_owner() stays super_admin-only (frozen); migrate operator-scoped surfaces to this '
  'deliberately as each opens to platform_admin (§18 — add, do not widen in place).';

-- ── 2. Structural grant-lockdown trigger on user_roles (protected tiers = super_admin, platform_admin). ──
CREATE OR REPLACE FUNCTION public.enforce_protected_role_grant()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _role_txt text := NEW.role::text;
  _jwt_role text := auth.role();  -- 'authenticated' | 'anon' | 'service_role' | NULL (direct/no-JWT)
BEGIN
  IF _role_txt IN ('super_admin', 'platform_admin') THEN
    -- Allowed writers: (a) an existing platform owner (super_admin) acting via a verified JWT, OR
    -- (b) a trusted server context — a service_role API caller, or a direct no-JWT connection
    -- (migration / pg_cron / superuser), where auth.role() is 'service_role' or NULL. A genuine
    -- authenticated/anon JWT that is NOT the platform owner is REFUSED. coalesce maps the no-JWT
    -- NULL to 'service' so it is treated as trusted (only real 'authenticated'/'anon' JWTs are gated).
    IF NOT (
         public.is_platform_owner()
      OR coalesce(_jwt_role, 'service') NOT IN ('authenticated', 'anon')
    ) THEN
      RAISE EXCEPTION
        'PROTECTED_ROLE_GRANT_FORBIDDEN: role "%" (a platform-operator tier) may be granted only by an existing super_admin or a trusted service context (§53).', _role_txt
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_protected_role_grant() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_protected_role_grant ON public.user_roles;
CREATE TRIGGER trg_enforce_protected_role_grant
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_protected_role_grant();

COMMENT ON FUNCTION public.enforce_protected_role_grant() IS
  '§53 structural lock: super_admin/platform_admin are grantable only by an existing super_admin '
  '(is_platform_owner via verified JWT) or a trusted service context. Holds on every write path '
  '(RPCs, sync trigger, direct insert). Every other role grant is unaffected. Mirrors the §51 '
  'sub-account-never-agency ABSOLUTE INVARIANT pattern (20260807230000).';

commit;
