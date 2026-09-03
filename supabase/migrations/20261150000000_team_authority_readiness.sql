-- Team Authority Readiness — the two Team-owned authority facts PAIGE cannot get today.
--
-- WHAT THIS ADDS, AND WHY IT IS ONLY TWO FACTS.
-- PAIGE already receives a Team block every turn (get_paige_team_context() ->
-- _shared/team-context.ts): the roster with names and emails, member_count, and the invitation list
-- with a per-row status. So a Spine projection carrying member_count or an invitation count would be
-- a SECOND, separately-computed answer to a question already answered — the drift §18 exists to
-- prevent. (It would also be a WRONG second answer if computed differently: Team's invitation_count
-- has no status filter, so on production 2026-09-03 tenant d8a0a880 shows invitation_count = 2 for a
-- workspace whose two team tokens are one accepted and one revoked — zero outstanding. That is
-- Team's to fix, and this migration deliberately does not shadow it with a rival number.)
--
-- Exactly two facts are genuinely absent from PAIGE's context, and they are the two the integration
-- brief asks not to conflate:
--   viewer_permission     -- the caller's RAW tenant_members.role
--   viewer_is_legal_owner -- the caller's ownership, from the canonical predicate
--
-- WHY THEY MUST BE TWO FACTS RATHER THAN ONE.
-- get_paige_team_context() computes each person's permission as
--     CASE WHEN tm.is_owner OR tm.role = 'owner' THEN 'owner' ELSE tm.role END
-- which is WIDER than the canonical ownership predicate: public.is_tenant_owner() keys on is_owner
-- alone and ignores role entirely, and Platform Billing's own resolver comments that ownership is
-- "the canonical is_owner predicate, never role = 'owner'". Collapsed, PAIGE holds a single string
-- meaning membership and ownership at once, and cannot tell a member whose role happens to read
-- 'owner' from an actual legal owner. This function returns the two separately, each from its own
-- canonical source. Measured on production 2026-09-03 the two agree for all 13 active members
-- (7 owner/is_owner=true, 6 admin/is_owner=false, zero divergent rows), so this changes no answer
-- today — it stops a future divergence from becoming a wrong one. The collapse itself lives in a
-- Team-owned function and is Team's to narrow; this projection simply declines to inherit it.
--
-- ownership is is_tenant_owner(auth.uid(), v_tenant) — BOTH arguments, deliberately. The second
-- parameter defaults to NULL and the body then reads "owner of ANY workspace":
--     WHERE tm.user_id = _user_id AND tm.is_owner AND (_tenant_id IS NULL OR tm.tenant_id = _tenant_id)
-- On production five workspaces would report a non-owner as owner if the argument were dropped.
-- It is NOT read from get_workspace_billing_authority().can_manage_billing either, which is
--     is_tenant_owner(auth.uid(), _t) AND _scope = 'top_level_solo'
-- — ownership AND billing scope. Two of the seven legal owners on production sit on agency-scope
-- workspaces and would be projected as non-owners by that field. Billing authority and legal
-- ownership are different questions; using one for the other is the same conflation in a new place.
--
-- NO TENANT ARGUMENT, AND NO service_role GRANT — deliberately, unlike get_business_context_readiness.
-- Both facts describe the CALLER. A service-role caller is not a person in any workspace, so there is
-- no honest answer to give it and no reason to open a path that would have to be guarded. This is
-- JWT-only, exactly like the Team read it complements, which also means there is no _tenant_id
-- parameter for a caller to steer and therefore no IDOR surface to defend (§9/§588).
--
-- THE GATE MATCHES TEAM'S OWN, neither stricter nor looser. get_paige_team_context() returns NULL
-- unless the caller holds an ACTIVE seat in the resolved tenant; so does this. It can therefore never
-- disclose anything Team's own read would have refused the same caller. It is not is_tenant_admin
-- (as business_context.readiness uses) because that would be stricter than the source owner's own
-- boundary for facts about the caller themselves — and inventing a different gate over the same data
-- is how two answers to one question start to drift.
--
-- ALWAYS TWO ROWS, on every call including a refusal, so a caller can never confuse "no signal" with
-- "the read failed silently", and a refusal leaks nothing about the values it is refusing (§13).
--
-- Team owns the underlying facts and remains the sole writer. Nothing here writes. No name, no
-- email, no user id is ever selected, so no contact data leaves Postgres.

create or replace function public.get_team_authority_readiness()
returns table (
  fact_key text,
  value text,
  status text,
  source text,
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_role text;
  v_is_legal_owner boolean := false;
begin
  if v_uid is null then
    return query
    select f.fact_key, null::text, 'unavailable'::text, null::text, 'no caller identity'::text
    from unnest(array['viewer_permission','viewer_is_legal_owner']) as f(fact_key);
    return;
  end if;

  v_tenant := public.current_user_tenant_id();

  if v_tenant is null then
    return query
    select f.fact_key, null::text, 'unavailable'::text, null::text, 'workspace not resolved'::text
    from unnest(array['viewer_permission','viewer_is_legal_owner']) as f(fact_key);
    return;
  end if;

  select tm.role::text into v_role
  from public.tenant_members tm
  where tm.tenant_id = v_tenant and tm.user_id = v_uid and tm.status = 'active'
  limit 1;

  if v_role is null then
    return query
    select f.fact_key, null::text, 'unavailable'::text, null::text,
           'not permitted for this account'::text
    from unnest(array['viewer_permission','viewer_is_legal_owner']) as f(fact_key);
    return;
  end if;

  v_is_legal_owner := public.is_tenant_owner(v_uid, v_tenant);

  return query
  select 'viewer_permission'::text, v_role, 'available'::text, 'team'::text, null::text
  union all
  select 'viewer_is_legal_owner'::text, v_is_legal_owner::text, 'available'::text, 'team'::text, null::text;
end;
$$;

comment on function public.get_team_authority_readiness() is
  'Spine-owned narrow projection of the two Team authority facts PAIGE cannot otherwise get: '
  'viewer_permission (the caller''s RAW tenant_members.role) and viewer_is_legal_owner '
  '(is_tenant_owner(caller, tenant) — both arguments, since the one-argument form means "owner of any '
  'workspace"). Deliberately TWO facts: get_paige_team_context() collapses them into one wider string '
  '(is_owner OR role = ''owner''), and Billing''s can_manage_billing is ownership AND billing scope — '
  'neither answers "is this caller the legal owner of this workspace". Carries no name, email, user id, '
  'member count or invitation count: Team''s own block already ships the last two and a rival '
  'computation would drift from it. JWT-only — both facts describe the caller, so there is no tenant '
  'argument and no service_role grant, hence no IDOR surface. Gated on an ACTIVE seat in the resolved '
  'tenant, matching get_paige_team_context() exactly. Always returns exactly two rows. Team owns the '
  'underlying facts; this never writes.';

revoke all on function public.get_team_authority_readiness() from public, anon, service_role;
grant execute on function public.get_team_authority_readiness() to authenticated;
