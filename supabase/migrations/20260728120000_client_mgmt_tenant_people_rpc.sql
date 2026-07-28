-- TASK #481 — §9/§2 fix for ClientManagementDashboard "Clients"/"Team Members" cards + tabs.
-- NET-NEW SECURITY DEFINER RPC that returns the caller's tenant-scoped people roster.
-- public.profiles / public.user_roles / public.businesses have NO tenant_id column, so they
-- cannot be scoped by a client-side .eq(); this RPC server-derives the tenant from
-- current_user_tenant_id() (the tenant-isolation keystone helper) and joins the roster through
-- public.tenant_members, so the returned rows are pre-scoped to the ONE tenant the caller is
-- operating inside. Tenant is ALWAYS server-derived, NEVER a body/arg param (no IDOR).
-- §2: NO FICO / consumer-credit fields are returned — this is a coaching-generic surface.
--
-- Least-privilege gate (doctrine 9): the row set is additionally guarded by
-- has_role(auth.uid(), 'admin'), mirroring the caller-side isAdmin gate the UI already applies
-- before it ever calls this RPC. A signed-in NON-admin tenant member calling the function
-- directly therefore receives an empty set, not the same-tenant directory.
--
-- Proof note (prose, no literals per the linter): when the caller has no active workspace the
-- tenant helper resolves to null, the tenant_id equality matches no rows, and the function
-- returns an empty set — a platform owner with no workspace selected never sees all-tenant rows.

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
    AND public.has_role(auth.uid(), 'admin'::public.app_role)  -- least-privilege: mirror the UI isAdmin gate
  ORDER BY p.created_at DESC NULLS LAST;
$$;

-- §9 hardening: strip the implicit PUBLIC execute grant, allow only signed-in users.
-- current_user_tenant_id() reads auth.uid() from the request JWT, so a service_role /
-- anon call (no JWT subject) resolves to null tenant and returns empty by construction.
REVOKE ALL ON FUNCTION public.get_tenant_people() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_people() TO authenticated;

COMMENT ON FUNCTION public.get_tenant_people() IS
  'Returns the active people roster (profiles + aggregated app-roles + business demographic flags) for the tenant the caller is currently operating inside, derived server-side via current_user_tenant_id() and joined through tenant_members, gated by has_role(admin) least-privilege. Tenant is never a parameter. Returns empty when the caller has no active workspace or is not an admin. No consumer-credit/FICO fields are exposed (coaching-generic surface, doctrine 2). Paige-governable seam (doctrine 10).';
