-- Solo Campaigns -> Pipeline folders.
-- One tenant-owned level only. "Unfiled" is virtual (pipelines.folder_id is null).
-- Folder actions stay behind the same governed pipeline.configure contract.

create table public.pipeline_folders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (btrim(name)<>'' and lower(btrim(name))<>'unfiled'),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','archived')),
  version bigint not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_through text not null check (created_through in ('owner','team_member','paige','approved_automation')),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  unique (tenant_id,id)
);
create unique index pipeline_folders_tenant_name_key on public.pipeline_folders(tenant_id,lower(btrim(name)));

alter table public.pipelines add column if not exists folder_id uuid;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='pipelines_tenant_id_id_key') then
    alter table public.pipelines add constraint pipelines_tenant_id_id_key unique (tenant_id,id);
  end if;
  if not exists(select 1 from pg_constraint where conname='pipelines_folder_tenant_fkey') then
    alter table public.pipelines add constraint pipelines_folder_tenant_fkey
      foreign key (tenant_id,folder_id) references public.pipeline_folders(tenant_id,id) on delete restrict;
  end if;
end $$;
create index if not exists pipelines_tenant_folder_idx on public.pipelines(tenant_id,folder_id);

create trigger trg_pipeline_folder_version before update on public.pipeline_folders
for each row execute function public.bump_pipeline_record_version();

alter table public.pipeline_folders enable row level security;
create policy pipeline_folders_tenant_read on public.pipeline_folders for select to authenticated
using (public.is_platform_owner() or tenant_id=public.current_user_tenant_id());
revoke insert,update,delete on public.pipeline_folders,public.pipelines from authenticated;
grant select on public.pipeline_folders to authenticated;
grant all on public.pipeline_folders to service_role;

create table public.pipeline_folder_archive_confirmations (
  token uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  folder_id uuid not null references public.pipeline_folders(id) on delete cascade,
  folder_name text not null,
  expected_version bigint not null,
  expected_pipeline_count int not null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now()+interval '15 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.pipeline_folder_archive_confirmations enable row level security;
revoke all on public.pipeline_folder_archive_confirmations from public,anon,authenticated;
grant all on public.pipeline_folder_archive_confirmations to service_role;

create or replace function public.prepare_pipeline_folder_archive_as_paige(_tenant_id uuid,_requested_by uuid,_folder_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _folder public.pipeline_folders%rowtype; _token uuid; _count int; _old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  if auth.role()<>'service_role' then raise exception 'PIPELINE_FOLDER_FORBIDDEN' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',_requested_by::text,true);
  if not (public.is_platform_owner() or exists(select 1 from public.tenants t where t.id=_tenant_id and t.owner_user_id=_requested_by)) then raise exception 'PIPELINE_FOLDER_OWNER_REQUIRED' using errcode='42501'; end if;
  select * into _folder from public.pipeline_folders where id=_folder_id and tenant_id=_tenant_id and lifecycle_status='active';
  if not found then return jsonb_build_object('ok',false,'outcome','no_match','message','No active folder matched that exact selection.'); end if;
  select count(*)::int into _count from public.pipelines where tenant_id=_tenant_id and folder_id=_folder.id and lifecycle_status<>'archived';
  insert into public.pipeline_folder_archive_confirmations(tenant_id,folder_id,folder_name,expected_version,expected_pipeline_count,requested_by)
  values(_tenant_id,_folder.id,_folder.name,_folder.version,_count,_requested_by) returning token into _token;
  perform set_config('request.jwt.claim.sub',coalesce(_old_sub,''),true);
  return jsonb_build_object('ok',true,'confirmation_token',_token,'folder_id',_folder.id,'name',_folder.name,'pipeline_count',_count,'expected_version',_folder.version,'consequence','Archive removes this folder only. Its pipelines stay active and move to Unfiled; no pipeline, deal, stage, or history is deleted.');
end$$;
revoke all on function public.prepare_pipeline_folder_archive_as_paige(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_pipeline_folder_archive_as_paige(uuid,uuid,uuid) to service_role;

-- Extend the zero-deal catalogue without changing its existing signature.
alter function public.get_pipeline_catalogue(uuid,text) rename to get_pipeline_catalogue_pre_folders;
revoke all on function public.get_pipeline_catalogue_pre_folders(uuid,text) from public,anon,authenticated;

create or replace function public.get_pipeline_catalogue(_tenant_id uuid,_search text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id()); _base jsonb; _items jsonb; _folders jsonb; _unfiled int;
begin
  _base:=public.get_pipeline_catalogue_pre_folders(_tenant,_search);
  select coalesce(jsonb_agg(item||jsonb_build_object('folder_id',p.folder_id,'folder_name',f.name) order by ordinality),'[]'::jsonb)
  into _items
  from jsonb_array_elements(coalesce(_base->'items','[]'::jsonb)) with ordinality entry(item,ordinality)
  join public.pipelines p on p.id=(item->>'id')::uuid and p.tenant_id=_tenant
  left join public.pipeline_folders f on f.id=p.folder_id and f.tenant_id=p.tenant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'name',f.name,'lifecycle_status',f.lifecycle_status,'version',f.version,
    'created_by',f.created_by,'created_through',f.created_through,'requested_by',f.requested_by,
    'created_at',f.created_at,'updated_at',f.updated_at,
    'pipeline_count',(select count(*)::int from public.pipelines p where p.tenant_id=f.tenant_id and p.folder_id=f.id and p.lifecycle_status<>'archived')
  ) order by f.lifecycle_status,f.name,f.id),'[]'::jsonb) into _folders
  from public.pipeline_folders f where f.tenant_id=_tenant;

  select count(*)::int into _unfiled from public.pipelines p
  where p.tenant_id=_tenant and p.folder_id is null and p.lifecycle_status<>'archived';

  return (_base-'items')||jsonb_build_object('items',_items,'folders',_folders,'unfiled_count',_unfiled);
end$$;
revoke all on function public.get_pipeline_catalogue(uuid,text) from public,anon;
grant execute on function public.get_pipeline_catalogue(uuid,text) to authenticated,service_role;

alter function public.get_pipeline_workspace(uuid) rename to get_pipeline_workspace_pre_folders;
revoke all on function public.get_pipeline_workspace_pre_folders(uuid) from public,anon,authenticated;
create or replace function public.get_pipeline_workspace(_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _workspace jsonb; _catalogue jsonb;
begin
  _workspace:=public.get_pipeline_workspace_pre_folders(_tenant_id);
  _catalogue:=public.get_pipeline_catalogue(_tenant_id,null);
  return _workspace||jsonb_build_object(
    'can_archive_folders',public.is_platform_owner() or exists(select 1 from public.tenants t where t.id=_tenant_id and t.owner_user_id=auth.uid()),
    'pipelines',_catalogue->'items',
    'folders',_catalogue->'folders',
    'unfiled_count',_catalogue->'unfiled_count'
  );
end$$;
revoke all on function public.get_pipeline_workspace(uuid) from public,anon;
grant execute on function public.get_pipeline_workspace(uuid) to authenticated,service_role;

create or replace function public.configure_pipeline_folder_core(
  _tenant_id uuid,_command jsonb,_idempotency_key text,_actor_kind text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  _caller uuid:=auth.uid();
  _action text:=replace(coalesce(_command->>'type',''),'-','_');
  _hash text:=md5(coalesce(_command,'{}'::jsonb)::text||':'||coalesce(_caller::text,'')||':'||_actor_kind);
  _cached public.pipeline_command_results%rowtype;
  _folder public.pipeline_folders%rowtype;
  _pipeline public.pipelines%rowtype;
  _folder_id uuid;
  _from_folder_id uuid;
  _expected bigint;
  _count int;
  _result jsonb;
  _through text;
begin
  if _caller is null or _tenant_id is null or not (public.is_platform_owner() or _tenant_id=public.current_user_tenant_id()) then raise exception 'PIPELINE_FOLDER_TENANT_MISMATCH' using errcode='42501'; end if;
  if not (public.is_platform_owner() or public.is_tenant_admin(_tenant_id)) then raise exception 'PIPELINE_FOLDER_FORBIDDEN' using errcode='42501'; end if;
  if _actor_kind not in ('human','paige') then raise exception 'PIPELINE_ACTOR_INVALID' using errcode='22023'; end if;
  if coalesce(btrim(_idempotency_key),'')='' then raise exception 'PIPELINE_IDEMPOTENCY_REQUIRED' using errcode='22023'; end if;
  if _action not in ('create_folder','rename_folder','archive_folder','restore_folder','move_pipeline_to_folder') then raise exception 'PIPELINE_ACTION_INVALID' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('pipeline-command:'||_tenant_id::text||':'||_idempotency_key,0));
  select * into _cached from public.pipeline_command_results where tenant_id=_tenant_id and idempotency_key=_idempotency_key for update;
  if found then
    if _cached.command_hash<>_hash or _cached.actor_user_id is distinct from _caller or _cached.actor_kind<>_actor_kind then raise exception 'PIPELINE_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
    return _cached.result;
  end if;

  _through:=case when _actor_kind='paige' then 'paige' when exists(select 1 from public.tenants t where t.id=_tenant_id and t.owner_user_id=_caller) then 'owner' else 'team_member' end;

  if _action='create_folder' then
    if coalesce(btrim(_command->>'name'),'')='' then raise exception 'PIPELINE_FOLDER_NAME_REQUIRED' using errcode='22023'; end if;
    insert into public.pipeline_folders(tenant_id,name,created_by,created_through,requested_by)
    values(_tenant_id,btrim(_command->>'name'),case when _actor_kind='paige' then null else _caller end,_through,case when _actor_kind='paige' then _caller end)
    returning id into _folder_id;
    _result:=jsonb_build_object('ok',true,'outcome','folder_created','folder_id',_folder_id,'message','Folder created.');
  elsif _action in ('rename_folder','archive_folder','restore_folder') then
    select * into _folder from public.pipeline_folders where id=(_command->>'folderId')::uuid and tenant_id=_tenant_id for update;
    if not found then raise exception 'PIPELINE_FOLDER_TENANT_MISMATCH' using errcode='22023'; end if;
    _expected:=coalesce((_command->>'expectedVersion')::bigint,0);
    if _folder.version<>_expected then raise exception 'PIPELINE_VERSION_CONFLICT' using errcode='40001'; end if;
    if _action='rename_folder' then
      if _folder.lifecycle_status<>'active' then raise exception 'PIPELINE_FOLDER_ARCHIVED' using errcode='22023'; end if;
      if coalesce(btrim(_command->>'name'),'')='' then raise exception 'PIPELINE_FOLDER_NAME_REQUIRED' using errcode='22023'; end if;
      update public.pipeline_folders set name=btrim(_command->>'name'),updated_at=now() where id=_folder.id;
      _result:=jsonb_build_object('ok',true,'outcome','folder_renamed','folder_id',_folder.id,'message','Folder renamed.');
    elsif _action='archive_folder' then
      if not (public.is_platform_owner() or exists(select 1 from public.tenants t where t.id=_tenant_id and t.owner_user_id=_caller)) then raise exception 'PIPELINE_FOLDER_OWNER_REQUIRED' using errcode='42501'; end if;
      if coalesce(_command->>'confirmedName','')<>_folder.name then raise exception 'PIPELINE_FOLDER_CONFIRMATION_MISMATCH' using errcode='22023'; end if;
      select count(*)::int into _count from public.pipelines where tenant_id=_tenant_id and folder_id=_folder.id and lifecycle_status<>'archived';
      update public.pipelines set folder_id=null,updated_at=now() where tenant_id=_tenant_id and folder_id=_folder.id;
      update public.pipeline_folders set lifecycle_status='archived',archived_at=now(),archived_by=_caller,updated_at=now() where id=_folder.id;
      _result:=jsonb_build_object('ok',true,'outcome','folder_archived','folder_id',_folder.id,'pipelines_moved_to_unfiled',_count,'message','Folder archived. Its pipelines remain active in Unfiled.');
    else
      update public.pipeline_folders set lifecycle_status='active',archived_at=null,archived_by=null,updated_at=now() where id=_folder.id;
      _result:=jsonb_build_object('ok',true,'outcome','folder_restored','folder_id',_folder.id,'message','Folder restored. It remains empty until pipelines are moved into it.');
    end if;
  else
    select * into _pipeline from public.pipelines where id=(_command->>'pipelineId')::uuid and tenant_id=_tenant_id and short_ref=upper(btrim(_command->>'pipelineRef')) for update;
    if not found then raise exception 'PIPELINE_FOLDER_TENANT_MISMATCH' using errcode='22023'; end if;
    if _pipeline.version<>coalesce((_command->>'expectedVersion')::bigint,0) then raise exception 'PIPELINE_VERSION_CONFLICT' using errcode='40001'; end if;
    _from_folder_id:=_pipeline.folder_id;
    _folder_id:=nullif(_command->>'folderId','')::uuid;
    if _folder_id is not null and not exists(select 1 from public.pipeline_folders where id=_folder_id and tenant_id=_tenant_id and lifecycle_status='active') then raise exception 'PIPELINE_FOLDER_TENANT_MISMATCH' using errcode='22023'; end if;
    update public.pipelines set folder_id=_folder_id,updated_at=now() where id=_pipeline.id;
    _result:=jsonb_build_object('ok',true,'outcome','pipeline_moved_to_folder','pipeline_id',_pipeline.id,'pipeline_ref',_pipeline.short_ref,'folder_id',_folder_id,'message',case when _folder_id is null then 'Pipeline moved to Unfiled.' else 'Pipeline moved to folder.' end);
  end if;

  insert into public.audit_logs(user_id,entity,action,entity_id,data)
  values(_caller,'pipeline_folder','pipeline.configure',coalesce((_result->>'pipeline_id')::uuid,(_result->>'folder_id')::uuid),jsonb_build_object('tenant_id',_tenant_id,'actor_kind',_actor_kind,'requested_by',case when _actor_kind='paige' then _caller end,'created_through',_through,'command',_action,'idempotency_key',_idempotency_key,'outcome',_result->>'outcome','pipeline_id',_result->>'pipeline_id','pipeline_ref',_result->>'pipeline_ref','from_folder_id',_from_folder_id,'to_folder_id',_result->>'folder_id','folder_id',coalesce(_result->>'folder_id',_folder.id::text),'pipelines_moved_to_unfiled',_result->>'pipelines_moved_to_unfiled'));
  insert into public.pipeline_command_results(tenant_id,idempotency_key,command_hash,actor_user_id,actor_kind,result)
  values(_tenant_id,_idempotency_key,_hash,_caller,_actor_kind,_result);
  return _result;
exception when unique_violation then
  raise exception 'PIPELINE_FOLDER_NAME_CONFLICT' using errcode='23505';
end$$;
revoke all on function public.configure_pipeline_folder_core(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.configure_pipeline_folder_core(uuid,jsonb,text,text) to service_role;

alter function public.configure_tenant_pipeline(uuid,jsonb,text,text) rename to configure_tenant_pipeline_pre_folders;
revoke all on function public.configure_tenant_pipeline_pre_folders(uuid,jsonb,text,text) from public,anon,authenticated;
create or replace function public.configure_tenant_pipeline(_tenant_id uuid,_command jsonb,_idempotency_key text,_actor_kind text default 'human')
returns jsonb language plpgsql security definer set search_path=public as $$
declare _action text:=replace(coalesce(_command->>'type',''),'-','_');
begin
  if _action in ('create_folder','rename_folder','archive_folder','restore_folder','move_pipeline_to_folder') then
    return public.configure_pipeline_folder_core(_tenant_id,_command,_idempotency_key,'human');
  end if;
  return public.configure_tenant_pipeline_pre_folders(_tenant_id,_command,_idempotency_key,'human');
end$$;
revoke all on function public.configure_tenant_pipeline(uuid,jsonb,text,text) from public,anon;
grant execute on function public.configure_tenant_pipeline(uuid,jsonb,text,text) to authenticated;

alter function public.configure_tenant_pipeline_as_paige(uuid,uuid,jsonb,text) rename to configure_tenant_pipeline_as_paige_pre_folders;
revoke all on function public.configure_tenant_pipeline_as_paige_pre_folders(uuid,uuid,jsonb,text) from public,anon,authenticated;
create or replace function public.configure_tenant_pipeline_as_paige(_tenant_id uuid,_requested_by uuid,_command jsonb,_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _action text:=replace(coalesce(_command->>'type',''),'-','_'); _old_sub text:=current_setting('request.jwt.claim.sub',true); _result jsonb; _confirm public.pipeline_folder_archive_confirmations%rowtype; _folder public.pipeline_folders%rowtype; _cached public.pipeline_command_results%rowtype; _count int; _hash text:=md5(coalesce(_command,'{}'::jsonb)::text||':'||coalesce(_requested_by::text,'')||':paige');
begin
  if auth.role()<>'service_role' then raise exception 'PIPELINE_FOLDER_FORBIDDEN' using errcode='42501'; end if;
  if _action in ('create_folder','rename_folder','archive_folder','restore_folder','move_pipeline_to_folder') then
    perform set_config('request.jwt.claim.sub',_requested_by::text,true);
    if not public.is_tenant_admin(_tenant_id) then raise exception 'PIPELINE_FOLDER_FORBIDDEN' using errcode='42501'; end if;
    if _action='archive_folder' then
      if not (public.is_platform_owner() or exists(select 1 from public.tenants t where t.id=_tenant_id and t.owner_user_id=_requested_by)) then raise exception 'PIPELINE_FOLDER_OWNER_REQUIRED' using errcode='42501'; end if;
      select * into _cached from public.pipeline_command_results where tenant_id=_tenant_id and idempotency_key=_idempotency_key;
      if found then
        if _cached.command_hash<>_hash or _cached.actor_user_id is distinct from _requested_by or _cached.actor_kind<>'paige' then raise exception 'PIPELINE_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
        perform set_config('request.jwt.claim.sub',coalesce(_old_sub,''),true);
        return _cached.result||jsonb_build_object('actor_kind','paige','requested_by',_requested_by);
      end if;
      select * into _confirm from public.pipeline_folder_archive_confirmations where token=(_command->>'confirmationToken')::uuid and tenant_id=_tenant_id and requested_by=_requested_by and used_at is null and expires_at>now() for update;
      if not found then raise exception 'PIPELINE_FOLDER_ARCHIVE_CONFIRMATION_REQUIRED' using errcode='22023'; end if;
      select * into _folder from public.pipeline_folders where id=_confirm.folder_id and tenant_id=_tenant_id and lifecycle_status='active' for update;
      if not found then raise exception 'PIPELINE_FOLDER_ARCHIVE_CONFIRMATION_STALE' using errcode='40001'; end if;
      select count(*)::int into _count from public.pipelines where tenant_id=_tenant_id and folder_id=_folder.id and lifecycle_status<>'archived';
      if _folder.version<>_confirm.expected_version or _count<>_confirm.expected_pipeline_count or (_command->>'folderId')::uuid<>_confirm.folder_id or coalesce(_command->>'confirmedName','')<>_confirm.folder_name or _folder.name<>_confirm.folder_name then raise exception 'PIPELINE_FOLDER_ARCHIVE_CONFIRMATION_STALE' using errcode='40001'; end if;
    end if;
    _result:=public.configure_pipeline_folder_core(_tenant_id,_command,_idempotency_key,'paige');
    if _action='archive_folder' and coalesce((_result->>'ok')::boolean,false) then update public.pipeline_folder_archive_confirmations set used_at=now() where token=_confirm.token; end if;
    perform set_config('request.jwt.claim.sub',coalesce(_old_sub,''),true);
    return _result||jsonb_build_object('actor_kind','paige','requested_by',_requested_by);
  end if;
  return public.configure_tenant_pipeline_as_paige_pre_folders(_tenant_id,_requested_by,_command,_idempotency_key);
end$$;
revoke all on function public.configure_tenant_pipeline_as_paige(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.configure_tenant_pipeline_as_paige(uuid,uuid,jsonb,text) to service_role;

-- Read-only recovery for a lost Edge response. This never authorizes or executes a
-- new mutation: every durable identity must match the already committed command.
create or replace function public.replay_pipeline_folder_archive_as_paige(_tenant_id uuid,_requested_by uuid,_command jsonb,_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _old_sub text:=current_setting('request.jwt.claim.sub',true); _cached public.pipeline_command_results%rowtype; _hash text:=md5(coalesce(_command,'{}'::jsonb)::text||':'||coalesce(_requested_by::text,'')||':paige');
begin
  if auth.role()<>'service_role' then raise exception 'PIPELINE_FOLDER_FORBIDDEN' using errcode='42501'; end if;
  if replace(coalesce(_command->>'type',''),'-','_')<>'archive_folder' then return jsonb_build_object('replayed',false); end if;
  perform set_config('request.jwt.claim.sub',_requested_by::text,true);
  if not public.is_tenant_admin(_tenant_id) or not (public.is_platform_owner() or exists(select 1 from public.tenants t where t.id=_tenant_id and t.owner_user_id=_requested_by)) then raise exception 'PIPELINE_FOLDER_OWNER_REQUIRED' using errcode='42501'; end if;
  select * into _cached from public.pipeline_command_results where tenant_id=_tenant_id and idempotency_key=_idempotency_key;
  if not found then perform set_config('request.jwt.claim.sub',coalesce(_old_sub,''),true); return jsonb_build_object('replayed',false); end if;
  if _cached.command_hash<>_hash or _cached.actor_user_id is distinct from _requested_by or _cached.actor_kind<>'paige' then raise exception 'PIPELINE_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
  perform set_config('request.jwt.claim.sub',coalesce(_old_sub,''),true);
  return jsonb_build_object('replayed',true,'result',_cached.result||jsonb_build_object('actor_kind','paige','requested_by',_requested_by));
end$$;
revoke all on function public.replay_pipeline_folder_archive_as_paige(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.replay_pipeline_folder_archive_as_paige(uuid,uuid,jsonb,text) to service_role;
