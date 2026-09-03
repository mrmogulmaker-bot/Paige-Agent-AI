-- get_tenant_people(): the admin gate becomes tenant-scoped.
--
-- WHAT THIS FUNCTION RETURNS, which is why the gate matters. Per active member of the caller's
-- workspace: full_name, city, state, aggregated app-roles, onboarding/intake flags, and the
-- business demographic flags is_minority_owned / is_women_owned / is_veteran_owned. Those last
-- three are PROTECTED-CLASS attributes. The tenant is server-derived and never a parameter, so
-- there is no cross-tenant leak and never was -- migration 20260728120000 introduced this function
-- specifically to CLOSE one (#257). The defect is narrower and entirely in the predicate.
--
-- THE DEFECT. The gate read:
--     public.has_role(auth.uid(), 'admin'::public.app_role)
-- public.user_roles carries NO tenant_id, so that predicate is tenant-agnostic and wrong in both
-- directions (§59's global-role trap, the fourth sighting in this codebase):
--   * WRONGLY ADMITS -- a caller who holds 'admin' because of workspace X passes the gate while
--     current_user_tenant_id() resolves workspace Y, where they may be a plain member. They would
--     read Y's roster including the protected-class flags.
--   * WRONGLY REFUSES -- the deferred-signup path (record_signup_acceptance / provision_tenant,
--     20260808190000) grants a new owner the BASE role 'user' and nothing else, so a freshly
--     provisioned Solo owner holds no 'admin' row at all and is refused their own people directory.
--     That failure is invisible: the surface just renders empty.
--     THIS HALF IS NOT FIXED BY THIS MIGRATION, and saying otherwise would be the §70 claim this
--     repo keeps making -- "the code is wired, therefore a human can use it". The sole caller
--     applies the IDENTICAL global-role check CLIENT-SIDE first
--     (ClientManagementDashboard.tsx:200, isAdmin = roles.includes("admin") read straight from
--     user_roles), so for that freshly provisioned owner the RPC is never called and the surface
--     still renders "No users found." This migration fixes the ADMIT direction on the server. The
--     refuse direction needs that client gate to change, which is Clients UI and a different
--     owner -- routed as a handoff, not crossed into here.
--
-- MEASURED ON PRODUCTION BEFORE CHANGING IT (2026-09-03), and corrected by an independent
-- adversarial read that falsified my first two claims. Both corrections are recorded here rather
-- than quietly fixed, because the first draft of this comment was the actual defect in the work.
--
--   * The population is 9, not 7 -- 9 of 16 auth users resolve an active workspace. All 9 hold a
--     global 'admin' row, so old and new admit the same 9 at rest.
--   * That evidence is WEAKER than "no divergence" implies. All 14 tenant_members rows on prod are
--     status='active' with role IN ('owner','admin'): there is not one ordinary member on the
--     platform, and zero inactive rows. So the WRONGLY-ADMITS case has NO representation in the
--     data at all. The measurement cannot distinguish the two gates for an ordinary member,
--     because no ordinary member exists to distinguish them with. This change is justified by the
--     predicate asking the right question, not by a divergence anyone has observed.
--   * The at-rest measurement was FALSIFIED for the operator, and that is why the gate below is
--     widened. See the next block.
--
-- THE OPERATOR REGRESSION THIS AVOIDS (§58 -- caught by peer review, not by me).
-- My first draft gated solely on is_tenant_admin(), and claimed a no-op for every current user.
-- That claim measured the RESTING state -- both operator accounts sit at active_tenant_id = NULL --
-- and generalised it to the CAPABILITY. One click of Act-as falsifies it. operator_enter_tenant()
-- (live, driven from src/operator/surfaces/FleetConsole.tsx) sets profiles.active_tenant_id and
-- inserts NO tenant_members row -- by design, and FleetConsole says so in its own comment. So an
-- acting-as operator can never satisfy is_tenant_admin(), which requires an active membership row.
-- Driven on prod inside a rolled-back transaction, super_admin acting into Antonio Daniel LLC:
--     resolved_tenant = e7f1b157...   old_gate = true   is_tenant_admin = FALSE   rows today = 3
-- That is 3 rows to 0 -- a shipped operator capability silently removed. The gate therefore also
-- admits public.is_platform_operator() (§53). Tenant scoping is untouched by this: the operator
-- still reads ONLY the workspace they have entered, because current_user_tenant_id() resolves
-- their active_tenant_id and the join is unchanged.
--
-- SCOPE. One predicate. Nothing else changes: the same columns, the same tenant derivation, the
-- same null-tenant-is-empty behaviour, the same ordering, the same grants. §37 producer inventory:
-- exactly ONE caller exists -- src/components/dashboard/ClientManagementDashboard.tsx:212, whose
-- own comment already describes this as an admin-gated read, so its expectation is unchanged.
--
-- DELIBERATELY NOT WIDENED. Whether a roster read should carry protected-class attributes at all
-- is a data-minimisation question with a different owner and a different decision; it is routed,
-- not answered here. This migration makes the existing gate ask the right question.

CREATE OR REPLACE FUNCTION public.get_tenant_people()
RETURNS TABLE (
  user_id                uuid,
  full_name              text,
  city                   text,
  state                  text,
  created_at             timestamptz,
  onboarding_completed   boolean,
  intake_completed       boolean,
  primary_goal_category  text,
  is_complimentary       boolean,
  roles                  text[],
  is_minority_owned      boolean,
  is_women_owned         boolean,
  is_veteran_owned       boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.full_name,
    p.city,
    p.state,
    p.created_at,
    p.onboarding_completed,
    p.intake_completed,
    p.primary_goal_category,
    p.is_complimentary,
    COALESCE(
      (SELECT array_agg(ur.role::text ORDER BY ur.role::text)
         FROM public.user_roles ur
        WHERE ur.user_id = p.user_id),
      ARRAY[]::text[]
    ) AS roles,
    COALESCE((SELECT bool_or(b.is_minority_owned)
                FROM public.businesses b WHERE b.owner_user_id = p.user_id), false) AS is_minority_owned,
    COALESCE((SELECT bool_or(b.is_women_owned)
                FROM public.businesses b WHERE b.owner_user_id = p.user_id), false) AS is_women_owned,
    COALESCE((SELECT bool_or(b.is_veteran_owned)
                FROM public.businesses b WHERE b.owner_user_id = p.user_id), false) AS is_veteran_owned
  FROM public.tenant_members tm
  JOIN public.profiles p ON p.user_id = tm.user_id
  WHERE tm.status = 'active'
    AND tm.tenant_id = public.current_user_tenant_id()
    AND public.current_user_tenant_id() IS NOT NULL   -- explicit: null-tenant (operator, no workspace) => empty
    -- TENANT-SCOPED, not global. has_role() reads public.user_roles, which carries NO tenant_id, so
    -- it answered the wrong question (§59 global-role trap): it ADMITTED a caller who is 'admin' by
    -- virtue of workspace X while resolving workspace Y. is_tenant_admin() asks the only question that
    -- matters here -- is this caller an owner/admin OF THE WORKSPACE THESE ROWS DESCRIBE.
    --
    -- The OR is not a loophole and is not optional (§58). A platform operator acting into a workspace
    -- via operator_enter_tenant() holds no tenant_members row there by design, so is_tenant_admin()
    -- alone would strip a shipped operator capability -- measured as 3 rows to 0. is_platform_operator()
    -- is the §53 helper (super_admin OR platform_admin); it does NOT widen which tenant is read, only
    -- who may read the tenant already resolved above.
    AND (
      public.is_tenant_admin(public.current_user_tenant_id())
      OR public.is_platform_operator()
    )
  ORDER BY p.created_at DESC NULLS LAST;
$$;

-- Restated rather than relied upon: CREATE OR REPLACE preserves an existing function's ACL, so these
-- are a no-op today. They are here so the migration is self-describing about the grant surface it
-- expects to leave behind, and so a future reader does not have to prove the absence is deliberate.
revoke all on function public.get_tenant_people() from public, anon;
grant execute on function public.get_tenant_people() to authenticated;

comment on function public.get_tenant_people() is
  'Returns the active people roster (profiles + aggregated app-roles + business demographic flags) for the tenant the caller is currently operating inside, derived server-side via current_user_tenant_id() and joined through tenant_members. Gated by is_tenant_admin() on that SAME resolved tenant, OR is_platform_operator() so an operator acting into a workspace (who holds no membership row there by design) keeps the roster read they already had -- tenant-scoped, not the tenant-agnostic has_role(), which admitted an admin-of-another-workspace (§59/§53/§58). Tenant is never a parameter. Returns empty when the caller has no active workspace or is not an admin of it. No consumer-credit/FICO fields are exposed (coaching-generic surface, §2). Paige-governable seam (§10).';
