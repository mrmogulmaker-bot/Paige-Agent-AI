-- =============================================================================
-- CANONICAL SOLO PROVISIONING CONTRACT (PR 3, Canonical Parity program).
--
-- OWNER INVARIANT: "Every newly provisioned standalone Solo tenant is
-- canonically routable by construction" — account type determines the shell,
-- and a fresh standalone tenant must deterministically resolve to
-- /solo/{account}/… with NO shell/version flag, no manual repair, no
-- customer-specific logic, no creation-date branch.
--
-- GROUNDING (traced on prod, 2026-09-18): the three Solo producers do NOT
-- share one seam. `provision_tenant` (public signup) and
-- `provision_tenant_as` (the paid path's primitive, called by
-- `solo_beta_fulfill_checkout`) are near-duplicate siblings, and
-- `operator_provision_tenant` bypasses BOTH with its own bare INSERT. That
-- operator INSERT also OMITS `is_owner` on the owner membership — and the
-- column defaults to FALSE — so an operator-created tenant's named owner
-- fails `is_tenant_owner()` (the R22 gate behind billing reads, media usage,
-- and more). Zero such rows exist on prod today (latent, never exercised).
--
-- THE SMALLEST SHARED CONTRACT: ONE server-owned assertion every producer
-- calls at the end of its CREATE path. Fail-closed on exactly the structural
-- conditions that would make a standalone tenant unroutable or unusable:
--   parented standalone | non-standalone type slipping through the solo lane
--   | missing/invalid account_number | no active owner membership with
--   is_owner=true | missing tenant_features support row.
-- The assert NEVER writes, NEVER reads features flags (the dead
-- solo_shell_enabled is not and must not become part of this contract), and
-- is revoked from every caller except the producers that invoke it.
--
-- Idempotent found-branches deliberately do NOT assert — this is a
-- NEW-provision contract, and legacy/existing returns stay byte-unchanged.
-- =============================================================================

create or replace function public.assert_canonical_solo_tenant(_tenant public.tenants)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_owner_members int;
  v_features int;
begin
  if _tenant is null then
    raise exception 'CANONICAL_SOLO_PROVISION_INVALID: null tenant' using errcode = '23514';
  end if;

  -- Structural shape: a standalone tenant is unparented by definition.
  if _tenant.parent_tenant_id is not null then
    raise exception 'CANONICAL_SOLO_PROVISION_INVALID: standalone tenant created with a parent (%)', _tenant.id
      using errcode = '23514';
  end if;

  if _tenant.account_type <> 'standalone' then
    raise exception 'CANONICAL_SOLO_PROVISION_INVALID: solo lane produced account_type=% (%)', _tenant.account_type, _tenant.id
      using errcode = '23514';
  end if;

  -- Routability: the canonical root is /solo/{account}/… — without a valid
  -- account_number the tenant has no addressable shell.
  if _tenant.account_number is null or _tenant.account_number <= 0 then
    raise exception 'CANONICAL_SOLO_PROVISION_INVALID: no account_number (%)', _tenant.id
      using errcode = '23514';
  end if;

  -- Owner authority: an active owner membership carrying the authoritative
  -- is_owner=true (the exact column the operator path historically omitted —
  -- its column default is FALSE, and is_tenant_owner() reads only this flag).
  select count(*) into v_owner_members
  from public.tenant_members tm
  where tm.tenant_id = _tenant.id
    and tm.status = 'active'
    and tm.is_owner = true;

  if v_owner_members < 1 then
    raise exception 'CANONICAL_SOLO_PROVISION_INVALID: no active is_owner=true membership (%)', _tenant.id
      using errcode = '23514';
  end if;

  -- Support state: the tenant_features row the platform's feature reads
  -- assume exists (normally guaranteed by the ensure_features trigger; this
  -- closes the "producer returned success while a required durable write
  -- failed" hole — a missing row now fails the provision, loudly).
  select count(*) into v_features
  from public.tenant_features tf
  where tf.tenant_id = _tenant.id;

  if v_features < 1 then
    raise exception 'CANONICAL_SOLO_PROVISION_INVALID: no tenant_features row (%)', _tenant.id
      using errcode = '23514';
  end if;
end;
$function$;

revoke all on function public.assert_canonical_solo_tenant(public.tenants) from public, anon, authenticated;
-- No grant at all: producer-invoked only (the house trigger/RPC posture).

-- ─────────────────────────────────────────────────────────────────────────────
-- Wire the contract into every producer's CREATE path.
-- Bodies are the current-main definitions with exactly two deltas each:
-- (1) the assert call before the final RETURN of the create branch;
-- (2) operator path only: is_owner=true + explicit account_type on the
--     INSERTs — the omission the assert would otherwise (correctly) reject.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.provision_tenant(_name text, _industry text default null::text, _team_size text default null::text, _description text default null::text, _account_type text default 'standalone'::text, _agreement_slug text default null::text, _agreement_version integer default null::integer)
returns tenants
language plpgsql
security definer
set search_path = public
as $function$
declare
  _uid uuid := auth.uid();
  _tenant public.tenants;
  _base_slug text;
  _slug text;
  _suffix int := 0;
  _type text := lower(coalesce(_account_type, 'standalone'));
begin
  if _uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if _name is null or length(trim(_name)) = 0 then
    raise exception 'business name required' using errcode = '22000';
  end if;
  if _type not in ('standalone', 'agency', 'enterprise') then
    _type := 'standalone';
  end if;

  insert into public.user_roles (user_id, role)
  values (_uid, 'user')
  on conflict (user_id, role) do nothing;

  perform public.ensure_provisioning_entitlements(_uid);

  select t.* into _tenant
    from public.tenants t
   where t.owner_user_id = _uid and t.parent_tenant_id is null
   order by t.created_at asc
   limit 1;
  if found then
    update public.profiles set active_tenant_id = _tenant.id
     where user_id = _uid and active_tenant_id is null;
    return _tenant;
  end if;

  if _agreement_slug is null or _agreement_version is null
     or not exists (
       select 1 from public.legal_documents ld
        where ld.slug = _agreement_slug
          and ld.version = _agreement_version
          and ld.is_current
     ) then
    raise exception 'You must review and accept the subscriber agreement to create your account'
      using errcode = 'P0001';
  end if;

  _base_slug := trim(both '-' from regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g'));
  if _base_slug is null or length(_base_slug) = 0 then _base_slug := 'tenant'; end if;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  while exists (select 1 from public.tenants where slug = _slug) loop
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  end loop;

  begin
    insert into public.tenants (slug, name, owner_user_id, parent_tenant_id, status, trial_ends_at, account_type, brand)
    values (
      _slug, trim(_name), _uid, null, 'trial', now() + interval '14 days', _type,
      jsonb_strip_nulls(jsonb_build_object(
        'industry', _industry,
        'team_size', _team_size,
        'about', _description
      ))
    )
    returning * into _tenant;
  exception when unique_violation then
    select t.* into _tenant
      from public.tenants t
     where t.owner_user_id = _uid and t.parent_tenant_id is null
     order by t.created_at asc
     limit 1;
    if not found then raise; end if;
    update public.profiles set active_tenant_id = _tenant.id
     where user_id = _uid and active_tenant_id is null;
    return _tenant;
  end;

  insert into public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
  values (_tenant.id, _uid, 'owner', 'active', true, now());

  update public.profiles set
    active_tenant_id    = _tenant.id,
    signup_completed_at = coalesce(signup_completed_at, now()),
    terms_accepted_at   = coalesce(terms_accepted_at, now()),
    terms_version       = _agreement_slug || '@' || _agreement_version::text,
    signup_lane         = _type
  where user_id = _uid;
  if not found then
    insert into public.profiles (user_id, active_tenant_id, signup_completed_at, terms_accepted_at, terms_version, signup_lane)
    values (_uid, _tenant.id, now(), now(), _agreement_slug || '@' || _agreement_version::text, _type);
  end if;

  insert into public.legal_acceptances (user_id, document_slug, document_version, context)
  values (
    _uid, _agreement_slug, _agreement_version,
    jsonb_build_object('via', 'provision_tenant', 'lane', _type, 'tenant_id', _tenant.id)
  )
  on conflict (user_id, document_slug, document_version) do nothing;

  begin
    insert into public.platform_usage_events (tenant_id, event_type, quantity, unit, metadata)
    values (
      _tenant.id, 'tenant_provisioned', 1, 'signup',
      jsonb_strip_nulls(jsonb_build_object(
        'account_type', _type,
        'owner_user_id', _uid,
        'tenant_name', _tenant.name,
        'source', 'front_door',
        'agreement', _agreement_slug || '@' || _agreement_version::text
      ))
    );
  exception when others then
    raise warning 'signup platform feed (tenant_provisioned) failed: %', sqlerrm;
  end;

  -- PR3: the canonical-provisioning contract — a standalone provision that is
  -- not canonically routable fails HERE, never returns success.
  if _type = 'standalone' then
    perform public.assert_canonical_solo_tenant(_tenant);
  end if;

  return _tenant;
end;
$function$;

create or replace function public.provision_tenant_as(_owner uuid, _name text default null::text, _account_type text default 'standalone'::text, _industry text default null::text, _team_size text default null::text, _description text default null::text, _agreement_slug text default null::text, _agreement_version integer default null::integer)
returns tenants
language plpgsql
security definer
set search_path = public
as $function$
declare
  _tenant public.tenants;
  _display text;
  _base_slug text;
  _slug text;
  _suffix int := 0;
  _type text := lower(coalesce(_account_type, 'standalone'));
begin
  if _owner is null then
    raise exception 'owner required' using errcode = '22004';
  end if;
  if _type not in ('standalone', 'agency', 'enterprise') then
    _type := 'standalone';
  end if;

  insert into public.user_roles (user_id, role)
  values (_owner, 'user')
  on conflict (user_id, role) do nothing;

  perform public.ensure_provisioning_entitlements(_owner);

  if _agreement_slug is not null and _agreement_version is not null
     and exists (
       select 1 from public.legal_documents ld
        where ld.slug = _agreement_slug
          and ld.version = _agreement_version
          and ld.is_current
     ) then
    insert into public.legal_acceptances (user_id, document_slug, document_version, context)
    values (
      _owner, _agreement_slug, _agreement_version,
      jsonb_build_object('via', 'provision_tenant_as', 'lane', _type)
    )
    on conflict (user_id, document_slug, document_version) do nothing;
  end if;

  select t.* into _tenant
    from public.tenants t
   where t.owner_user_id = _owner and t.parent_tenant_id is null
   order by t.created_at asc
   limit 1;
  if found then
    update public.profiles set active_tenant_id = _tenant.id
     where user_id = _owner and active_tenant_id is null;
    insert into public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
      values (_tenant.id, _owner, 'owner', 'active', true, now())
      on conflict (tenant_id, user_id) do nothing;
    return _tenant;
  end if;

  _display := coalesce(
    nullif(trim(_name), ''),
    nullif(trim((select full_name from public.profiles where user_id = _owner)), '') || '''s Workspace',
    'My Workspace'
  );

  _base_slug := trim(both '-' from regexp_replace(lower(trim(_display)), '[^a-z0-9]+', '-', 'g'));
  if _base_slug is null or length(_base_slug) = 0 then _base_slug := 'tenant'; end if;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  while exists (select 1 from public.tenants where slug = _slug) loop
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  end loop;

  begin
    insert into public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand)
    values (
      _slug, _display, _owner, null, 'active', _type,
      jsonb_strip_nulls(jsonb_build_object(
        'industry', _industry,
        'team_size', _team_size,
        'about', _description
      ))
    )
    returning * into _tenant;
  exception when unique_violation then
    select t.* into _tenant
      from public.tenants t
     where t.owner_user_id = _owner and t.parent_tenant_id is null
     order by t.created_at asc
     limit 1;
    if not found then raise; end if;
    update public.profiles set active_tenant_id = _tenant.id
     where user_id = _owner and active_tenant_id is null;
    return _tenant;
  end;

  insert into public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
  values (_tenant.id, _owner, 'owner', 'active', true, now())
  on conflict (tenant_id, user_id) do nothing;

  update public.profiles set
    active_tenant_id    = _tenant.id,
    signup_completed_at = coalesce(signup_completed_at, now()),
    signup_lane         = coalesce(signup_lane, _type),
    terms_accepted_at   = coalesce(terms_accepted_at, now()),
    terms_version       = coalesce(
                            terms_version,
                            case when _agreement_slug is not null and _agreement_version is not null
                                 then _agreement_slug || '@' || _agreement_version::text
                                 else terms_version end)
  where user_id = _owner;
  if not found then
    insert into public.profiles (user_id, active_tenant_id, signup_completed_at, signup_lane)
    values (_owner, _tenant.id, now(), _type)
    on conflict (user_id) do update set active_tenant_id = excluded.active_tenant_id;
  end if;

  begin
    insert into public.platform_usage_events (tenant_id, event_type, quantity, metadata)
    values (
      _tenant.id, 'tenant_provisioned', 1,
      jsonb_strip_nulls(jsonb_build_object(
        'via', 'platform_subscription_webhook',
        'account_type', _type,
        'tenant_name', _tenant.name,
        'source', 'onboarding_paid',
        'agreement', case when _agreement_slug is not null and _agreement_version is not null
                          then _agreement_slug || '@' || _agreement_version::text else null end
      ))
    );
  exception when others then null; end;

  -- PR3: same contract on the paid path's primitive.
  if _type = 'standalone' then
    perform public.assert_canonical_solo_tenant(_tenant);
  end if;

  return _tenant;
end;
$function$;

create or replace function public.operator_provision_tenant(_name text, _slug text default null::text, _owner_user_id uuid default null::uuid, _plan_offer text default null::text, _seat_limit integer default null::integer, _customer_limit integer default null::integer, _status text default 'trial'::text)
returns tenants
language plpgsql
security definer
set search_path = public
as $function$
declare
  _actor uuid := auth.uid();
  _tenant public.tenants;
  _base_slug text;
  _slug_final text;
  _suffix int := 0;
begin
  if not public.is_platform_owner() then
    raise exception 'platform owner only' using errcode = '42501';
  end if;
  if _name is null or length(trim(_name)) = 0 then
    raise exception 'tenant name required' using errcode = '22000';
  end if;
  if _status not in ('trial', 'active', 'past_due', 'suspended', 'canceled') then
    raise exception 'invalid tenant status: %', _status using errcode = '22000';
  end if;

  _base_slug := trim(both '-' from regexp_replace(
    lower(trim(coalesce(nullif(trim(_slug), ''), _name))), '[^a-z0-9]+', '-', 'g'));
  if _base_slug is null or length(_base_slug) = 0 then _base_slug := 'tenant'; end if;
  _base_slug := left(_base_slug, 40);
  _slug_final := _base_slug;
  while exists (select 1 from public.tenants where slug = _slug_final) loop
    _suffix := _suffix + 1;
    _slug_final := _base_slug || '-' || _suffix::text;
  end loop;

  -- PR3: account_type is now EXPLICIT (it could only ever be the column
  -- default 'standalone' here — the function has no type parameter — but the
  -- canonical contract is stated, not inherited).
  insert into public.tenants (
    slug, name, owner_user_id, parent_tenant_id, status, account_type,
    plan_offer, seat_limit, customer_limit, trial_ends_at
  )
  values (
    _slug_final, trim(_name), _owner_user_id, null, _status::public.tenant_status, 'standalone',
    _plan_offer,
    greatest(coalesce(_seat_limit, 0), 0),
    greatest(coalesce(_customer_limit, 0), 0),
    case when _status = 'trial' then now() + interval '14 days' else null end
  )
  returning * into _tenant;

  -- PR3 FIX: is_owner=true is now stamped explicitly. The historical INSERT
  -- omitted it and the column defaults to FALSE, so an operator-created
  -- tenant's named owner silently failed is_tenant_owner() — the exact
  -- structural defect the canonical contract exists to make impossible.
  if _owner_user_id is not null then
    insert into public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
    values (_tenant.id, _owner_user_id, 'owner', 'active', true, now())
    on conflict do nothing;
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, data)
  values (
    _actor, 'tenant.provision', 'tenant', _tenant.id,
    jsonb_strip_nulls(jsonb_build_object(
      'slug', _tenant.slug, 'name', _tenant.name, 'status', _status,
      'plan_offer', _plan_offer, 'owner_user_id', _owner_user_id
    ))
  );

  -- PR3: the operator path creates standalone tenants only, and a provision
  -- WITHOUT a named owner has no is_owner membership to assert — that shape
  -- is the platform's shell-less operator inventory row, deliberately outside
  -- this contract (nothing routable was promised). With an owner named, the
  -- full canonical contract applies.
  if _owner_user_id is not null then
    perform public.assert_canonical_solo_tenant(_tenant);
  end if;

  return _tenant;
end;
$function$;

-- Grants restated EXACTLY as each original migration left them (verified
-- against main: 20260809120000 / 20260810000000 / 20260804150000:156-157 —
-- the operator RPC ships to AUTHENTICATED, not service_role; the operator
-- console calls it from the browser client, gated in-body by
-- is_platform_owner()). This block changes no caller's reach.
revoke all on function public.provision_tenant(text, text, text, text, text, text, integer) from public, anon;
grant execute on function public.provision_tenant(text, text, text, text, text, text, integer) to authenticated, service_role;
revoke all on function public.provision_tenant_as(uuid, text, text, text, text, text, text, integer) from public, anon;
grant execute on function public.provision_tenant_as(uuid, text, text, text, text, text, text, integer) to authenticated, service_role;
revoke all on function public.operator_provision_tenant(text, text, uuid, text, integer, integer, text) from public, anon;
grant execute on function public.operator_provision_tenant(text, text, uuid, text, integer, integer, text) to authenticated, service_role;
