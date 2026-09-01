-- Pipeline identity + duplicate-safe catalogue.
-- UUID identity remains internal. PPL references are tenant-scoped, server-generated,
-- immutable, and safe to show to people and PAIGE.

alter table public.pipelines add column if not exists short_ref text;
alter table public.pipelines add column if not exists created_through text;
alter table public.pipelines add column if not exists requested_by uuid references auth.users(id) on delete set null;
alter table public.pipelines add column if not exists archived_at timestamptz;
alter table public.pipelines add column if not exists archived_by uuid references auth.users(id) on delete set null;

-- Legacy V1 contains one global, unowned pipeline with no deals or attributable
-- tenant. Never guess its owner, archive it, or delete it in this slice. It remains
-- invisible to every tenant because every read policy/RPC requires tenant equality.
-- The insert trigger below rejects a missing tenant for every new pipeline.

alter table public.pipelines drop constraint if exists pipelines_created_through_check;
alter table public.pipelines add constraint pipelines_created_through_check
  check (created_through is null or created_through in ('owner','team_member','paige','approved_automation'));
alter table public.pipelines drop constraint if exists pipelines_short_ref_format_check;
alter table public.pipelines add constraint pipelines_short_ref_format_check
  check (short_ref is null or short_ref ~ '^PPL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$');

create or replace function public.generate_pipeline_short_ref(_tenant uuid)
returns text language plpgsql security definer set search_path=public as $$
declare _alphabet constant text:='23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; _candidate text; _i int; _attempt int;
begin
  perform pg_advisory_xact_lock(hashtextextended('pipeline-short-ref:'||coalesce(_tenant::text,'none'),0));
  for _attempt in 1..64 loop
    _candidate:='PPL-';
    for _i in 0..4 loop
      _candidate:=_candidate||substr(_alphabet,1+(get_byte(gen_random_bytes(1),0)%length(_alphabet)),1);
    end loop;
    if not exists(select 1 from public.pipelines p where p.tenant_id is not distinct from _tenant and p.short_ref=_candidate) then return _candidate; end if;
  end loop;
  raise exception 'PIPELINE_REFERENCE_ALLOCATION_FAILED' using errcode='40001';
end$$;
revoke all on function public.generate_pipeline_short_ref(uuid) from public,anon,authenticated;
grant execute on function public.generate_pipeline_short_ref(uuid) to service_role;

do $$
declare _row record;
begin
  for _row in select id,tenant_id from public.pipelines where short_ref is null order by created_at,id loop
    update public.pipelines set short_ref=public.generate_pipeline_short_ref(_row.tenant_id) where id=_row.id;
  end loop;
end$$;

alter table public.pipelines alter column short_ref set not null;
alter table public.pipelines drop constraint if exists pipelines_tenant_short_ref_key;
alter table public.pipelines add constraint pipelines_tenant_short_ref_key unique (tenant_id,short_ref);
create unique index if not exists pipelines_legacy_short_ref_key
  on public.pipelines(short_ref) where tenant_id is null;

-- A missing id means the caller omitted it. The server fills both identities and
-- overwrites provenance from authenticated/server context; supplied identities fail.
alter table public.pipelines alter column id drop default;
create or replace function public.assign_pipeline_identity()
returns trigger language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _through text:=nullif(current_setting('app.pipeline_created_through',true),''); _requester uuid:=nullif(current_setting('app.pipeline_requested_by',true),'')::uuid;
begin
  if new.id is not null or new.short_ref is not null then raise exception 'PIPELINE_IDENTITY_SERVER_GENERATED' using errcode='42501'; end if;
  if new.tenant_id is null then new.tenant_id:=public.current_user_tenant_id(); end if;
  if new.tenant_id is null then raise exception 'PIPELINE_TENANT_REQUIRED' using errcode='23514'; end if;
  if _caller is null and _requester is null then raise exception 'PIPELINE_CREATION_CONTRACT_REQUIRED' using errcode='42501'; end if;
  new.id:=gen_random_uuid();
  new.short_ref:=public.generate_pipeline_short_ref(new.tenant_id);
  new.created_at:=now();
  if _through in ('paige','approved_automation') then
    new.created_through:=_through;
    new.created_by:=null;
    new.requested_by:=coalesce(_requester,_caller);
  elsif exists(select 1 from public.tenants t where t.id=new.tenant_id and t.owner_user_id=_caller) then
    new.created_by:=_caller; new.created_through:='owner'; new.requested_by:=null;
  else
    new.created_by:=_caller; new.created_through:='team_member'; new.requested_by:=null;
  end if;
  return new;
end$$;
revoke all on function public.assign_pipeline_identity() from public,anon,authenticated;
grant execute on function public.assign_pipeline_identity() to service_role;

drop trigger if exists zz_assign_pipeline_identity on public.pipelines;
create trigger zz_assign_pipeline_identity before insert on public.pipelines
for each row execute function public.assign_pipeline_identity();

create or replace function public.protect_pipeline_identity()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id then
    raise exception 'PIPELINE_ID_IMMUTABLE' using errcode='42501';
  end if;
  if new.short_ref is distinct from old.short_ref then
    raise exception 'PIPELINE_REFERENCE_IMMUTABLE' using errcode='42501';
  end if;
  if new.created_by is distinct from old.created_by or
     new.created_through is distinct from old.created_through or new.requested_by is distinct from old.requested_by or
     new.created_at is distinct from old.created_at or new.archived_at is distinct from old.archived_at or
     new.archived_by is distinct from old.archived_by then
    raise exception 'PIPELINE_PROVENANCE_IMMUTABLE' using errcode='42501';
  end if;
  return new;
end$$;
revoke all on function public.protect_pipeline_identity() from public,anon,authenticated;
grant execute on function public.protect_pipeline_identity() to service_role;
drop trigger if exists trg_protect_pipeline_identity on public.pipelines;
create trigger trg_protect_pipeline_identity before update on public.pipelines
for each row execute function public.protect_pipeline_identity();

create or replace function public.stamp_pipeline_archive_metadata()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.lifecycle_status='archived' and old.lifecycle_status is distinct from 'archived' then
    new.archived_at:=now();
    new.archived_by:=auth.uid();
  elsif old.lifecycle_status='archived' and new.lifecycle_status is distinct from 'archived' then
    new.archived_at:=null;
    new.archived_by:=null;
  end if;
  return new;
end$$;
revoke all on function public.stamp_pipeline_archive_metadata() from public,anon,authenticated;
grant execute on function public.stamp_pipeline_archive_metadata() to service_role;
drop trigger if exists trg_stamp_pipeline_archive_metadata on public.pipelines;
create trigger trg_stamp_pipeline_archive_metadata before update on public.pipelines
for each row execute function public.stamp_pipeline_archive_metadata();

-- Close the original global-role coach policies. Direct table reads must obey the
-- same active tenant boundary as the workspace RPC.
drop policy if exists pipelines_coach_read on public.pipelines;
create policy pipelines_coach_read on public.pipelines for select to authenticated
using (public.has_role(auth.uid(),'coach'::public.app_role) and tenant_id=public.current_user_tenant_id());
drop policy if exists pipelines_coach_manage_own on public.pipelines;
drop policy if exists pipelines_admin_all on public.pipelines;
create policy pipelines_admin_read on public.pipelines for select to authenticated
using (public.has_role(auth.uid(),'admin'::public.app_role) and tenant_id=public.current_user_tenant_id());
drop policy if exists pipeline_stages_coach_read on public.pipeline_stages;
create policy pipeline_stages_coach_read on public.pipeline_stages for select to authenticated
using (public.has_role(auth.uid(),'coach'::public.app_role) and tenant_id=public.current_user_tenant_id());
drop policy if exists pipeline_stages_coach_manage_own on public.pipeline_stages;
drop policy if exists pipeline_stages_admin_all on public.pipeline_stages;
create policy pipeline_stages_admin_read on public.pipeline_stages for select to authenticated
using (public.has_role(auth.uid(),'admin'::public.app_role) and tenant_id=public.current_user_tenant_id());
revoke insert,update,delete on public.pipelines,public.pipeline_stages from authenticated;

create or replace function public.get_pipeline_catalogue(_tenant_id uuid,_search text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id()); _query text:=nullif(btrim(_search),''); _items jsonb;
begin
  if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant=public.current_user_tenant_id()) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'short_ref',p.short_ref,'name',p.name,'description',p.description,'is_default',p.is_default,
    'lifecycle_status',p.lifecycle_status,'version',p.version,'created_at',p.created_at,'updated_at',p.updated_at,
    'created_by',p.created_by,'created_by_name',case when p.created_by is not null and (exists(select 1 from public.tenants t where t.id=p.tenant_id and t.owner_user_id=p.created_by) or exists(select 1 from public.tenant_members tm where tm.tenant_id=p.tenant_id and tm.user_id=p.created_by and tm.status='active')) then nullif(btrim(cp.full_name),'') end,'created_through',p.created_through,
    'requested_by',p.requested_by,'requested_by_name',case when p.requested_by is not null and (exists(select 1 from public.tenants t where t.id=p.tenant_id and t.owner_user_id=p.requested_by) or exists(select 1 from public.tenant_members tm where tm.tenant_id=p.tenant_id and tm.user_id=p.requested_by and tm.status='active')) then nullif(btrim(rp.full_name),'') end,
    'stage_count',coalesce(sc.count,0),'deal_count',coalesce(dc.count,0)
  ) order by p.is_default desc,p.created_at,p.id),'[]'::jsonb) into _items
  from public.pipelines p
  left join public.profiles cp on cp.user_id=p.created_by
  left join public.profiles rp on rp.user_id=p.requested_by
  left join lateral (select count(*)::int count from public.pipeline_stages s where s.pipeline_id=p.id and s.archived_at is null) sc on true
  left join lateral (select count(*)::int count from public.deals d where d.pipeline_id=p.id and d.tenant_id=_tenant) dc on true
  where p.tenant_id=_tenant and (_query is null or p.short_ref=upper(_query) or position(lower(_query) in lower(p.name))>0);
  return jsonb_build_object('items',_items,'match_count',jsonb_array_length(_items),'query',_query,'outcome',case when jsonb_array_length(_items)=0 then 'no_match' else 'matched' end);
end$$;
revoke all on function public.get_pipeline_catalogue(uuid,text) from public,anon;
grant execute on function public.get_pipeline_catalogue(uuid,text) to authenticated,service_role;

-- Keep the workspace read as one home while replacing only its pipeline metadata.
alter function public.get_pipeline_workspace(uuid) rename to get_pipeline_workspace_pre_identity;
revoke all on function public.get_pipeline_workspace_pre_identity(uuid) from public,anon,authenticated;
create or replace function public.get_pipeline_workspace(_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _workspace jsonb; _catalogue jsonb;
begin
  _workspace:=public.get_pipeline_workspace_pre_identity(_tenant_id);
  _catalogue:=public.get_pipeline_catalogue(_tenant_id,null);
  return _workspace||jsonb_build_object('pipelines',_catalogue->'items');
end$$;
revoke all on function public.get_pipeline_workspace(uuid) from public,anon;
grant execute on function public.get_pipeline_workspace(uuid) to authenticated,service_role;

-- Rename the prior implementation into a revoked core. Public callers retain the
-- same signature, but actor kind is now derived by the wrapper, never trusted.
alter function public.configure_tenant_pipeline(uuid,jsonb,text,text) rename to configure_tenant_pipeline_core_identity;
revoke all on function public.configure_tenant_pipeline_core_identity(uuid,jsonb,text,text) from public,anon,authenticated;

create or replace function public.configure_tenant_pipeline(_tenant_id uuid,_command jsonb,_idempotency_key text,_actor_kind text default 'human')
returns jsonb language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id()); _pipeline public.pipelines%rowtype; _action text:=replace(coalesce(_command->>'type',''),'-','_'); _result jsonb; _through text;
begin
  if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant=public.current_user_tenant_id()) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if _action in ('delete_pipeline','delete_stage') then raise exception 'PIPELINE_HARD_DELETE_UNAVAILABLE' using errcode='42501'; end if;
  _through:=case when exists(select 1 from public.tenants t where t.id=_tenant and t.owner_user_id=_caller) then 'owner' else 'team_member' end;
  perform set_config('app.pipeline_created_through',_through,true);
  if _action='archive_pipeline' then
    if coalesce(btrim(_command->>'pipelineRef'),'')='' then raise exception 'PIPELINE_ARCHIVE_REFERENCE_REQUIRED' using errcode='22023'; end if;
    select p.* into _pipeline from public.pipelines p where p.id=(_command->>'pipelineId')::uuid and p.tenant_id=_tenant and p.short_ref=upper(btrim(_command->>'pipelineRef'));
    if not found then raise exception 'PIPELINE_ARCHIVE_REFERENCE_MISMATCH' using errcode='22023'; end if;
    if upper(btrim(coalesce(_command->>'confirmedReference','')))<>_pipeline.short_ref then raise exception 'PIPELINE_ARCHIVE_CONFIRMATION_MISMATCH' using errcode='22023'; end if;
  end if;
  _result:=public.configure_tenant_pipeline_core_identity(_tenant,_command,_idempotency_key,'human');
  return _result||jsonb_build_object('pipeline_ref',coalesce(_pipeline.short_ref,(select p.short_ref from public.pipelines p where p.id=(_result->>'pipeline_id')::uuid)),'actor_kind',_through);
end$$;
revoke all on function public.configure_tenant_pipeline(uuid,jsonb,text,text) from public,anon;
grant execute on function public.configure_tenant_pipeline(uuid,jsonb,text,text) to authenticated;

create table if not exists public.pipeline_archive_confirmations(
  token uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade, short_ref text not null,
  expected_version bigint not null, expected_deal_count int not null, requested_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now()+interval '15 minutes', used_at timestamptz, created_at timestamptz not null default now()
);
alter table public.pipeline_archive_confirmations enable row level security;
revoke all on public.pipeline_archive_confirmations from public,anon,authenticated;
grant all on public.pipeline_archive_confirmations to service_role;

create or replace function public.prepare_pipeline_archive_as_paige(_tenant_id uuid,_requested_by uuid,_pipeline_ref text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _pipeline public.pipelines%rowtype; _token uuid; _deals int; _old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  if auth.role()<>'service_role' then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',_requested_by::text,true);
  if not public.is_tenant_admin(_tenant_id) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  select p.* into _pipeline from public.pipelines p where p.tenant_id=_tenant_id and p.short_ref=upper(btrim(_pipeline_ref));
  if not found then return jsonb_build_object('ok',false,'outcome','no_match','message','No pipeline matched that exact reference.'); end if;
  select count(*)::int into _deals from public.deals d where d.tenant_id=_tenant_id and d.pipeline_id=_pipeline.id;
  insert into public.pipeline_archive_confirmations(tenant_id,pipeline_id,short_ref,expected_version,expected_deal_count,requested_by)
  values(_tenant_id,_pipeline.id,_pipeline.short_ref,_pipeline.version,_deals,_requested_by) returning token into _token;
  perform set_config('request.jwt.claim.sub',coalesce(_old_sub,''),true);
  return jsonb_build_object('ok',true,'confirmation_token',_token,'pipeline_id',_pipeline.id,'name',_pipeline.name,'short_ref',_pipeline.short_ref,'deal_count',_deals,'expected_version',_pipeline.version,'consequence','Archive removes this pipeline from active selection. It does not hard-delete the pipeline or its history.');
end$$;
revoke all on function public.prepare_pipeline_archive_as_paige(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_pipeline_archive_as_paige(uuid,uuid,text) to service_role;

create or replace function public.configure_tenant_pipeline_as_paige(_tenant_id uuid,_requested_by uuid,_command jsonb,_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _action text:=replace(coalesce(_command->>'type',''),'-','_'); _confirm public.pipeline_archive_confirmations%rowtype; _pipeline public.pipelines%rowtype; _deals int; _result jsonb; _old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  if auth.role()<>'service_role' then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',_requested_by::text,true);
  if not public.is_tenant_admin(_tenant_id) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if _action in ('delete_pipeline','delete_stage') then raise exception 'PIPELINE_HARD_DELETE_UNAVAILABLE' using errcode='42501'; end if;
  if _action='archive_pipeline' then
    select * into _confirm from public.pipeline_archive_confirmations where token=(_command->>'confirmationToken')::uuid and tenant_id=_tenant_id and requested_by=_requested_by and used_at is null and expires_at>now() for update;
    if not found then raise exception 'PIPELINE_ARCHIVE_CONFIRMATION_REQUIRED' using errcode='22023'; end if;
    select * into _pipeline from public.pipelines p where p.id=_confirm.pipeline_id and p.tenant_id=_tenant_id and p.short_ref=_confirm.short_ref for update;
    select count(*)::int into _deals from public.deals d where d.tenant_id=_tenant_id and d.pipeline_id=_pipeline.id;
    if _pipeline.version<>_confirm.expected_version or _deals<>_confirm.expected_deal_count or upper(btrim(coalesce(_command->>'pipelineRef','')))<>_confirm.short_ref or upper(btrim(coalesce(_command->>'confirmedReference','')))<>_confirm.short_ref then raise exception 'PIPELINE_ARCHIVE_CONFIRMATION_STALE' using errcode='40001'; end if;
  end if;
  perform set_config('app.pipeline_created_through','paige',true);
  perform set_config('app.pipeline_requested_by',_requested_by::text,true);
  _result:=public.configure_tenant_pipeline_core_identity(_tenant_id,_command,_idempotency_key,'paige');
  if _action='archive_pipeline' and coalesce((_result->>'ok')::boolean,false) then update public.pipeline_archive_confirmations set used_at=now() where token=_confirm.token; end if;
  perform set_config('request.jwt.claim.sub',coalesce(_old_sub,''),true);
  return _result||jsonb_build_object('pipeline_ref',coalesce(_pipeline.short_ref,(select p.short_ref from public.pipelines p where p.id=(_result->>'pipeline_id')::uuid)),'actor_kind','paige','requested_by',_requested_by);
end$$;
revoke all on function public.configure_tenant_pipeline_as_paige(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.configure_tenant_pipeline_as_paige(uuid,uuid,jsonb,text) to service_role;
