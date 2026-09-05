-- Campaigns -> Overview (the Campaign Command Desk): the durable, tenant-safe Campaign BRIEF
-- foundation. This is the §18 first home for a campaign object — none existed. A brief is an
-- owner-authored PLANNING record, never proof of a live campaign: the platform still has no
-- tenant-authorized universal campaign-state source (useSoloCampaigns keeps `campaigns:[]`), so
-- nothing here fabricates counts, revenue, reach, attribution, ad spend, audience size, active
-- status, or completion. The two links a brief carries — offer (tenant_products) and pipeline
-- (pipelines) — are the only cross-surface facts, each tenant-validated, so the growth-loop map
-- can be honest without inventing a link. All writes flow through the SECURITY DEFINER RPC
-- `configure_campaign_brief`, which re-resolves the tenant from auth (never trusts the arg, §9/§59),
-- gates writes on tenant-admin/owner (§53), is version-checked (optimistic concurrency) and
-- idempotent, and audits every command. Modeled verbatim on configure_tenant_pipeline
-- (20260831224500_solo_pipeline_governed_management.sql).

-- ── table ────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.campaign_briefs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  short_ref text,
  name text not null,
  objective text,
  audience text,
  positioning text,
  -- intended distribution — INTENT, never proof that anything published. jsonb array of strings.
  channels jsonb not null default '[]'::jsonb,
  desired_outcome text,
  success_definition text,
  -- a TARGET the owner set — never actual ad spend, a forecast, or connected media buying.
  budget_target text,
  timing text,
  constraints text,
  content_needs text,
  conversion_destination text,
  followup_path text,
  -- the two real cross-surface links; tenant-validated by the RPC on every write.
  offer_id uuid references public.tenant_products(id) on delete set null,
  pipeline_id uuid references public.pipelines(id) on delete set null,
  -- reserved for the Mission System; not writable by the RPC until that system lands.
  mission_id uuid,
  -- owner-authored lifecycle. `active` is a state the owner/a governed action SETS; the surface
  -- never INFERS it from data.
  lifecycle_status text not null default 'draft',
  blocker text,
  created_through text,
  created_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campaign_briefs drop constraint if exists campaign_briefs_lifecycle_status_check;
alter table public.campaign_briefs add constraint campaign_briefs_lifecycle_status_check
  check (lifecycle_status in ('draft','ready_for_review','blocked','approved','active','paused','completed','archived'));
alter table public.campaign_briefs drop constraint if exists campaign_briefs_channels_is_array;
alter table public.campaign_briefs add constraint campaign_briefs_channels_is_array
  check (jsonb_typeof(channels) = 'array');

create index if not exists campaign_briefs_tenant_updated_idx on public.campaign_briefs(tenant_id, updated_at desc);
create index if not exists campaign_briefs_tenant_lifecycle_idx on public.campaign_briefs(tenant_id, lifecycle_status);

-- RLS: tenant-scoped READ only. Every write goes through the definer RPC below.
alter table public.campaign_briefs enable row level security;
drop policy if exists campaign_briefs_tenant_read on public.campaign_briefs;
create policy campaign_briefs_tenant_read on public.campaign_briefs for select to authenticated
  using (public.is_platform_owner() or tenant_id = public.current_user_tenant_id());
revoke insert, update, delete on public.campaign_briefs from authenticated;
grant select on public.campaign_briefs to authenticated;
grant all on public.campaign_briefs to service_role;

-- ── idempotency ledger ───────────────────────────────────────────────────────────────────────
create table if not exists public.campaign_brief_command_results (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  idempotency_key text not null,
  command_hash text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('human','paige')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, idempotency_key)
);
alter table public.campaign_brief_command_results enable row level security;
revoke all on public.campaign_brief_command_results from public, anon, authenticated;
grant all on public.campaign_brief_command_results to service_role;

-- ── version trigger (optimistic concurrency) ───────────────────────────────────────────────────
create or replace function public.bump_campaign_brief_version()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.version := old.version + 1;
  return new;
end$$;
revoke all on function public.bump_campaign_brief_version() from public, anon, authenticated;
grant execute on function public.bump_campaign_brief_version() to service_role;

drop trigger if exists trg_campaign_brief_version on public.campaign_briefs;
create trigger trg_campaign_brief_version before update on public.campaign_briefs
  for each row execute function public.bump_campaign_brief_version();

-- ── read seam ──────────────────────────────────────────────────────────────────────────────────
-- Returns the tenant's non-archived briefs (newest first) + can_manage + an archived count. The
-- linked offer/pipeline names and the linked pipeline's deal count are resolved server-side, each
-- scoped to the SAME tenant, so the client needs no second read and can never surface another
-- tenant's offer/pipeline. A deal count is the only "number" here and it is a real tenant-scoped
-- read of `deals`, never an invented figure.
create or replace function public.get_campaign_briefs(_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _caller uuid := auth.uid(); _tenant uuid := coalesce(_tenant_id, public.current_user_tenant_id());
begin
  if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant = public.current_user_tenant_id()) then
    raise exception 'CAMPAIGN_BRIEF_FORBIDDEN' using errcode='42501';
  end if;
  return jsonb_build_object(
    'can_manage', public.is_platform_owner() or public.is_tenant_admin(_tenant),
    'archived_count', (select count(*) from public.campaign_briefs where tenant_id=_tenant and lifecycle_status='archived'),
    'briefs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'short_ref', b.short_ref, 'name', b.name, 'objective', b.objective,
        'audience', b.audience, 'positioning', b.positioning, 'channels', b.channels,
        'desired_outcome', b.desired_outcome, 'success_definition', b.success_definition,
        'budget_target', b.budget_target, 'timing', b.timing, 'constraints', b.constraints,
        'content_needs', b.content_needs, 'conversion_destination', b.conversion_destination,
        'followup_path', b.followup_path, 'lifecycle_status', b.lifecycle_status, 'blocker', b.blocker,
        'offer_id', b.offer_id, 'pipeline_id', b.pipeline_id, 'mission_id', b.mission_id,
        'offer_name', (select p.name from public.tenant_products p where p.id=b.offer_id and p.tenant_id=_tenant),
        'pipeline_name', (select pl.name from public.pipelines pl where pl.id=b.pipeline_id and pl.tenant_id=_tenant),
        'pipeline_deal_count', (select count(*) from public.deals d where d.pipeline_id=b.pipeline_id and d.tenant_id=_tenant),
        'version', b.version, 'created_through', b.created_through,
        'created_at', b.created_at, 'updated_at', b.updated_at
      ) order by b.updated_at desc)
      from public.campaign_briefs b where b.tenant_id=_tenant and b.lifecycle_status <> 'archived'), '[]'::jsonb)
  );
end$$;
revoke all on function public.get_campaign_briefs(uuid) from public, anon;
grant execute on function public.get_campaign_briefs(uuid) to authenticated, service_role;

-- ── governed write seam ──────────────────────────────────────────────────────────────────────
create or replace function public.configure_campaign_brief(
  _tenant_id uuid,
  _command jsonb,
  _idempotency_key text,
  _actor_kind text default 'human'
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  _caller uuid := auth.uid();
  _tenant uuid := coalesce(_tenant_id, public.current_user_tenant_id());
  _action text := replace(coalesce(_command->>'type',''),'-','_');
  _hash text := md5(coalesce(_command,'{}'::jsonb)::text);
  _cached public.campaign_brief_command_results%rowtype;
  _brief public.campaign_briefs%rowtype;
  _result jsonb;
  _id uuid;
  _expected bigint;
  _offer uuid;
  _pipeline uuid;
  _status text;
  _channels jsonb;
  _created_through text;
begin
  -- §9/§59: the arg never widens access; the caller must own the resolved tenant.
  if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant = public.current_user_tenant_id()) then
    raise exception 'CAMPAIGN_BRIEF_FORBIDDEN' using errcode='42501';
  end if;
  -- §53: writes require tenant-admin/owner (the tenant-level app_role, on the RESOLVED tenant).
  if not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then
    raise exception 'CAMPAIGN_BRIEF_FORBIDDEN' using errcode='42501';
  end if;
  if _actor_kind not in ('human','paige') then raise exception 'CAMPAIGN_BRIEF_ACTOR_INVALID' using errcode='22023'; end if;
  if coalesce(btrim(_idempotency_key),'')='' then raise exception 'CAMPAIGN_BRIEF_IDEMPOTENCY_REQUIRED' using errcode='22023'; end if;

  select * into _cached from public.campaign_brief_command_results where tenant_id=_tenant and idempotency_key=_idempotency_key;
  if found then
    if _cached.command_hash <> _hash then raise exception 'CAMPAIGN_BRIEF_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
    return _cached.result;
  end if;

  _created_through := case when _actor_kind='paige' then 'paige'
    when _caller = (select owner_user_id from public.tenants where id=_tenant) then 'owner' else 'team_member' end;

  -- Resolve + tenant-validate the two optional links up front (used by create/update).
  _offer := nullif(btrim(coalesce(_command->>'offerId','')),'')::uuid;
  _pipeline := nullif(btrim(coalesce(_command->>'pipelineId','')),'')::uuid;
  if _offer is not null and not exists(select 1 from public.tenant_products p where p.id=_offer and p.tenant_id=_tenant) then
    raise exception 'CAMPAIGN_BRIEF_OFFER_TENANT_MISMATCH' using errcode='23514';
  end if;
  if _pipeline is not null and not exists(select 1 from public.pipelines pl where pl.id=_pipeline and pl.tenant_id=_tenant) then
    raise exception 'CAMPAIGN_BRIEF_PIPELINE_TENANT_MISMATCH' using errcode='23514';
  end if;
  _channels := case when jsonb_typeof(_command->'channels')='array' then _command->'channels' else '[]'::jsonb end;

  if _action='create_brief' then
    if coalesce(btrim(_command->>'name'),'')='' then raise exception 'CAMPAIGN_BRIEF_NAME_REQUIRED' using errcode='22023'; end if;
    insert into public.campaign_briefs(
      tenant_id, name, objective, audience, positioning, channels, desired_outcome, success_definition,
      budget_target, timing, constraints, content_needs, conversion_destination, followup_path,
      offer_id, pipeline_id, lifecycle_status, created_through, created_by)
    values(
      _tenant, btrim(_command->>'name'), nullif(btrim(_command->>'objective'),''), nullif(btrim(_command->>'audience'),''),
      nullif(btrim(_command->>'positioning'),''), _channels, nullif(btrim(_command->>'desiredOutcome'),''),
      nullif(btrim(_command->>'successDefinition'),''), nullif(btrim(_command->>'budgetTarget'),''),
      nullif(btrim(_command->>'timing'),''), nullif(btrim(_command->>'constraints'),''),
      nullif(btrim(_command->>'contentNeeds'),''), nullif(btrim(_command->>'conversionDestination'),''),
      nullif(btrim(_command->>'followupPath'),''), _offer, _pipeline, 'draft', _created_through, _caller)
    returning id into _id;
    update public.campaign_briefs set short_ref = 'CB-'||upper(left(replace(_id::text,'-',''),6)) where id=_id;
    _result := jsonb_build_object('ok',true,'outcome','created','brief_id',_id,'version',2,'message','Campaign brief saved as a draft on this workspace. Nothing is launched, sent, or published.');

  elsif _action='update_brief' then
    select * into _brief from public.campaign_briefs where id=(_command->>'briefId')::uuid and tenant_id=_tenant for update;
    if not found then raise exception 'CAMPAIGN_BRIEF_NOT_FOUND' using errcode='22023'; end if;
    _expected := coalesce((_command->>'expectedVersion')::bigint,0);
    if _brief.version <> _expected then raise exception 'CAMPAIGN_BRIEF_VERSION_CONFLICT' using errcode='40001'; end if;
    if coalesce(btrim(_command->>'name'),'')='' then raise exception 'CAMPAIGN_BRIEF_NAME_REQUIRED' using errcode='22023'; end if;
    update public.campaign_briefs set
      name=btrim(_command->>'name'), objective=nullif(btrim(_command->>'objective'),''),
      audience=nullif(btrim(_command->>'audience'),''), positioning=nullif(btrim(_command->>'positioning'),''),
      channels=_channels, desired_outcome=nullif(btrim(_command->>'desiredOutcome'),''),
      success_definition=nullif(btrim(_command->>'successDefinition'),''), budget_target=nullif(btrim(_command->>'budgetTarget'),''),
      timing=nullif(btrim(_command->>'timing'),''), constraints=nullif(btrim(_command->>'constraints'),''),
      content_needs=nullif(btrim(_command->>'contentNeeds'),''), conversion_destination=nullif(btrim(_command->>'conversionDestination'),''),
      followup_path=nullif(btrim(_command->>'followupPath'),''), offer_id=_offer, pipeline_id=_pipeline, updated_at=now()
    where id=_brief.id;
    _result := jsonb_build_object('ok',true,'outcome','updated','brief_id',_brief.id,'version',_brief.version+1,'message','Campaign brief saved.');

  elsif _action='transition_brief' then
    select * into _brief from public.campaign_briefs where id=(_command->>'briefId')::uuid and tenant_id=_tenant for update;
    if not found then raise exception 'CAMPAIGN_BRIEF_NOT_FOUND' using errcode='22023'; end if;
    _expected := coalesce((_command->>'expectedVersion')::bigint,0);
    if _brief.version <> _expected then raise exception 'CAMPAIGN_BRIEF_VERSION_CONFLICT' using errcode='40001'; end if;
    _status := btrim(coalesce(_command->>'status',''));
    if _status not in ('draft','ready_for_review','blocked','approved','active','paused','completed') then
      raise exception 'CAMPAIGN_BRIEF_STATUS_INVALID' using errcode='22023';
    end if;
    update public.campaign_briefs set
      lifecycle_status=_status,
      blocker = case when _status='blocked' then nullif(btrim(_command->>'blocker'),'') else null end,
      updated_at=now()
    where id=_brief.id;
    _result := jsonb_build_object('ok',true,'outcome','transitioned','brief_id',_brief.id,'lifecycle_status',_status,'version',_brief.version+1,'message','Campaign brief moved to '||_status||'.');

  elsif _action='archive_brief' then
    select * into _brief from public.campaign_briefs where id=(_command->>'briefId')::uuid and tenant_id=_tenant for update;
    if not found then raise exception 'CAMPAIGN_BRIEF_NOT_FOUND' using errcode='22023'; end if;
    _expected := coalesce((_command->>'expectedVersion')::bigint,0);
    if _brief.version <> _expected then raise exception 'CAMPAIGN_BRIEF_VERSION_CONFLICT' using errcode='40001'; end if;
    update public.campaign_briefs set lifecycle_status='archived', updated_at=now() where id=_brief.id;
    _result := jsonb_build_object('ok',true,'outcome','archived','brief_id',_brief.id,'version',_brief.version+1,'message','Campaign brief archived. It is removed from the active list; nothing is deleted.');

  else
    raise exception 'CAMPAIGN_BRIEF_ACTION_INVALID' using errcode='22023';
  end if;

  insert into public.audit_logs(user_id, entity, action, entity_id, data)
  values(_caller, 'campaign_brief', 'campaign_brief.configure', (_result->>'brief_id')::uuid,
    jsonb_build_object('tenant_id',_tenant,'actor_kind',_actor_kind,'command',_action,'idempotency_key',_idempotency_key,'outcome',_result->>'outcome'));
  insert into public.campaign_brief_command_results(tenant_id, idempotency_key, command_hash, actor_user_id, actor_kind, result)
  values(_tenant, _idempotency_key, _hash, _caller, _actor_kind, _result);
  return _result;
end$$;
revoke all on function public.configure_campaign_brief(uuid,jsonb,text,text) from public, anon;
grant execute on function public.configure_campaign_brief(uuid,jsonb,text,text) to authenticated;
