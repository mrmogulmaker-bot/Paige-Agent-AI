-- Rail remediation (#794) — the Rail reader must check the caller's role IN THE WORKSPACE IT RETURNS.
--
-- THE DEFECT THIS CLOSES, exactly. `get_solo_rail_activity` (migration 20261042000000, shipped in
-- PR #785 and live on production) gated on two clauses that answer questions about DIFFERENT
-- tenants:
--
--   row filter :  WHERE e.tenant_id = v_tenant,  v_tenant := public.current_user_tenant_id()
--   role gate  :  public.has_any_role(v_uid, ARRAY['admin','super_admin','coach'])
--
-- `current_user_tenant_id()` honours `profiles.active_tenant_id` whenever the caller holds ANY
-- active `tenant_members` row for it — at ANY `tenant_role`, including a plain `member`.
-- `has_any_role` reads `public.user_roles`, whose columns are (id, user_id, role, created_at):
-- there is NO `tenant_id`. It is a global question. That is §59's global-role trap.
--
-- So a user holding a global `coach`/`admin`/`super_admin` role earned in tenant A, who is also a
-- plain member of tenant B, could set `active_tenant_id = B`, satisfy the role gate ON THE ROLE
-- FROM A, and read ALL of tenant B's Rail — including `audience='owner'` /
-- `visibility='owner_internal'` rows, which are precisely the rows `record_rail_event` narrows
-- away from everyone but the owner.
--
-- WHY THE ORIGINAL PASSED REVIEW AND TESTS. It faithfully reproduced `pce_staff_read`, which
-- carries the same flaw — but that policy was UNREACHABLE, because `authenticated` has no SELECT
-- on `paige_client_events`; the table privilege refuses before RLS is ever consulted. The revoked
-- grant WAS the containment. Shipping an EXECUTE-granted SECURITY DEFINER function with those
-- semantics re-opened it. Fidelity to a defective policy resurrects the defect, and a test that
-- asserts the function matches the policy cannot see it.
--
-- THE FIX. Ask the role question about the SAME workspace the rows come from. `tenant_members`
-- carries `tenant_id` and a `tenant_role` of ('owner','admin','coach','member'), so the membership
-- row is both the scope and the role in one predicate — and it cannot be satisfied by a role
-- earned somewhere else.
--
-- DELIBERATELY NOT CHANGED HERE (narrow remediation; each is parked separately):
--   * `pce_staff_read` carries the same global-role flaw. It stays unreachable behind the revoked
--     table grant, so it is not this fix's business — but the next reader must not copy it.
--   * `is_platform_owner()` excludes the §53 `platform_admin` tier. Widening operator access is the
--     wrong direction to add unreviewed inside a security fix.
--   * The `service_role` EXECUTE grant is inert (auth.uid() is NULL there, so the function raises).
create or replace function public.get_solo_rail_activity(p_limit integer default 50)
returns table (
  id              uuid,
  event_kind      text,
  surface         text,
  actor_type      text,
  audience        text,
  visibility      text,
  from_department text,
  to_department   text,
  title           text,
  summary         text,
  occurred_at     timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_owner  boolean;
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  v_owner  := public.is_platform_owner();
  v_tenant := public.current_user_tenant_id();

  if v_tenant is null then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  -- THE CORRECTION. The role is read from the caller's membership OF `v_tenant`, so a role held in
  -- another workspace can no longer satisfy it. `tenant_members` is the only source consulted, and
  -- it is the same row that would have to exist for `current_user_tenant_id()` to have resolved
  -- `v_tenant` at all — the two clauses now agree about which workspace they mean.
  if not v_owner then
    if not exists (
      select 1
        from public.tenant_members m
       where m.user_id  = v_uid
         and m.tenant_id = v_tenant
         and m.status    = 'active'
         and m.role in ('owner', 'admin', 'coach')
    ) then
      raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
    end if;
  end if;

  return query
  select e.id, e.event_kind, e.surface, e.actor_type, e.audience, e.visibility,
         e.from_department, e.to_department, e.title, e.summary, e.occurred_at
  from public.paige_client_events e
  where e.tenant_id = v_tenant
  order by e.occurred_at desc
  limit v_limit;
end
$$;

comment on function public.get_solo_rail_activity(integer) is
  'Owner-visible tenant-scoped Context Rail history. #794: the staff-role check is scoped to the '
  'membership of the SAME workspace the rows come from, so a role held in another tenant cannot '
  'satisfy it. Returns reviewed display fields only; refuses rather than returning zero rows.';
