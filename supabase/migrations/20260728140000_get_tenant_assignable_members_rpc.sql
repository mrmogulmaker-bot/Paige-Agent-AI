-- =============================================================================
-- get_tenant_assignable_members — the coach-accessible assignee-picker roster for
-- the Conversations rail's Owner select (Slice 1B fix, §37 read=write parity).
--
-- The rail's Owner picker WRITES via assign_contact (20260711160000), whose guard is
-- has_any_role(admin | super_admin | coach). The READ that populates its options must
-- match that SAME caller set — otherwise a non-admin coach (the rail is coach-reachable
-- by design) sees an EMPTY picker and can neither (re)assign a contact nor even self-assign,
-- and a set owner resolves to a generic label instead of the real name.
--
-- That gap is exactly what get_tenant_people() (20260728120000) leaves open: it is the RICH
-- people DIRECTORY for admin dashboards — has_role(admin)-only, and it returns demographic
-- ownership flags. Reusing it for the picker would (a) hide the roster from coaches and
-- (b) over-return demographic data to a broader caller set. So this is a DISTINCT capability
-- with its own home (§18): the MINIMAL assignee PICKER — user_id + full_name + app-roles ONLY
-- (least-privilege, §9) — gated to precisely assign_contact's write set.
--
-- Tenant is ALWAYS server-derived via current_user_tenant_id() (NEVER a param — no IDOR, §9),
-- joined through tenant_members so rows are pre-scoped to the ONE tenant the caller operates in.
-- The has_any_role predicate sits in the WHERE (mirrors get_tenant_people's has_role placement),
-- so a caller with no workspace OR without an assigning role gets an EMPTY set, not an error.
-- The client filters to the assignable roles it offers; roles ride along so it can.
-- =============================================================================

create or replace function public.get_tenant_assignable_members()
returns table (
  user_id   uuid,
  full_name text,
  roles     text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    p.full_name,
    coalesce(
      (select array_agg(ur.role::text order by ur.role::text)
         from public.user_roles ur
        where ur.user_id = p.user_id),
      array[]::text[]
    ) as roles
  from public.tenant_members tm
  join public.profiles p on p.user_id = tm.user_id
  where tm.status = 'active'
    and tm.tenant_id = public.current_user_tenant_id()
    and public.current_user_tenant_id() is not null   -- null-tenant (operator, no workspace) => empty
    and public.has_any_role(auth.uid(), array['admin','super_admin','coach'])  -- match assign_contact
  order by p.full_name nulls last;
$$;

-- §9 hardening: strip the implicit PUBLIC execute grant; allow only signed-in users.
-- current_user_tenant_id() reads auth.uid() from the request JWT, so a service_role / anon
-- call (no JWT subject) resolves to a null tenant and returns empty by construction.
revoke all on function public.get_tenant_assignable_members() from public;
grant execute on function public.get_tenant_assignable_members() to authenticated;

comment on function public.get_tenant_assignable_members() is
  'Minimal tenant assignee-picker roster (user_id + full_name + aggregated app-roles) for the Conversations rail Owner select. Tenant server-derived via current_user_tenant_id() (never a param, no IDOR, doctrine 9), joined through tenant_members. Gated to admin/super_admin/coach to MATCH the assign_contact write guard (doctrine 37 read=write parity) so any staff member who can (re)assign a contact can also see the roster to assign to. Distinct from get_tenant_people (the admin-only rich people directory with demographic flags) — this is the least-privilege picker (doctrine 9/18). Paige-governable seam (doctrine 10). Returns empty for a caller with no active workspace or without an assigning role.';
