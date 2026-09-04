-- Bounded Solo Owner deletion. No existing data is deleted by this migration.
begin;
create or replace function public.can_delete_solo_pipeline()
returns boolean language sql stable security definer set search_path=public as $$
  -- Canonical active multi-owner predicate; owner_user_id is display-only.
  select auth.uid() is not null and public.is_tenant_owner(auth.uid(),public.current_user_tenant_id()) and exists (
    select 1 from public.tenants t
    where t.id=public.current_user_tenant_id()
      and t.account_type::text='standalone' and t.parent_tenant_id is null
  );
$$;
revoke all on function public.can_delete_solo_pipeline() from public,anon,authenticated;

-- Normalize PostgreSQL-supported UUID spellings in legacy JSON references without
-- failing deletion scans on unrelated malformed configuration.
create or replace function public.pipeline_reference_uuid(_value text)
returns uuid language plpgsql immutable set search_path=public as $$
begin
  return nullif(btrim(_value),'')::uuid;
exception when invalid_text_representation then return null;
end$$;
revoke all on function public.pipeline_reference_uuid(text) from public,anon,authenticated;

-- FK-like guards only: unchanged legacy routes are neither rewritten nor validated.
create or replace function public.guard_pipeline_routing_reference()
returns trigger language plpgsql security definer set search_path=public as $$
declare _pid uuid; _sid uuid; _stage_pipeline uuid;
begin
  if tg_table_name='growth_forms' then
    if tg_op='UPDATE' and new.tenant_id is not distinct from old.tenant_id
      and new.pipeline_id is not distinct from old.pipeline_id
      and new.stage_id is not distinct from old.stage_id then return new; end if;
    _pid:=new.pipeline_id; _sid:=new.stage_id;
  else
    if tg_op='UPDATE' and new.tenant_id is not distinct from old.tenant_id
      and new.config_json->>'pipeline_id' is not distinct from old.config_json->>'pipeline_id'
      and new.config_json->>'stage_id' is not distinct from old.config_json->>'stage_id' then return new; end if;
    _pid:=nullif(btrim(new.config_json->>'pipeline_id'),'')::uuid;
    _sid:=nullif(btrim(new.config_json->>'stage_id'),'')::uuid;
  end if;
  if _pid is null and _sid is null then return new; end if;
  if _sid is not null then
    select pipeline_id into _stage_pipeline from public.pipeline_stages where id=_sid and tenant_id=new.tenant_id;
    if not found or (_pid is not null and _pid<>_stage_pipeline) then
      raise exception 'PIPELINE_ROUTE_REFERENCE_INVALID' using errcode='23503';
    end if;
    _pid:=coalesce(_pid,_stage_pipeline);
  end if;
  perform 1 from public.pipelines where id=_pid and tenant_id=new.tenant_id for key share;
  if not found then raise exception 'PIPELINE_ROUTE_REFERENCE_INVALID' using errcode='23503'; end if;
  if _sid is not null then
    perform 1 from public.pipeline_stages where id=_sid and tenant_id=new.tenant_id and pipeline_id=_pid for key share;
    if not found then raise exception 'PIPELINE_ROUTE_REFERENCE_INVALID' using errcode='23503'; end if;
  end if;
  return new;
end$$;
revoke all on function public.guard_pipeline_routing_reference() from public,anon,authenticated;
drop trigger if exists trg_pipeline_route_reference on public.growth_forms;
create trigger trg_pipeline_route_reference before insert or update of tenant_id,pipeline_id,stage_id
on public.growth_forms for each row execute function public.guard_pipeline_routing_reference();
drop trigger if exists trg_pipeline_route_reference on public.growth_form_automations;
create trigger trg_pipeline_route_reference before insert or update of tenant_id,config_json
on public.growth_form_automations for each row execute function public.guard_pipeline_routing_reference();

create or replace function public.delete_empty_pipeline(
  _expected_tenant_id uuid,_pipeline_id uuid,_pipeline_ref text,_expected_version bigint,
  _idempotency_key text,_expected_stage_count integer
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  _caller uuid:=auth.uid(); _tenant uuid:=public.current_user_tenant_id();
  _pipeline public.pipelines%rowtype; _cached public.pipeline_command_results%rowtype;
  _hash text; _stage_ids uuid[]; _stage_count integer; _deals integer; _dependencies jsonb;
  _result jsonb; _ref text:=upper(btrim(coalesce(_pipeline_ref,'')));
begin
  -- Scope and role checks precede replay and are independent of object identity.
  if _caller is null or _tenant is null or _expected_tenant_id is distinct from _tenant then
    raise exception 'PIPELINE_DELETE_CONTEXT_CHANGED' using errcode='42501';
  end if;
  if not public.can_delete_solo_pipeline() then
    raise exception 'PIPELINE_DELETE_OWNER_REQUIRED' using errcode='42501';
  end if;
  if _pipeline_id is null or _ref='' or _expected_version is null or _expected_version<1
    or _expected_stage_count is null or _expected_stage_count<0
    or coalesce(btrim(_idempotency_key),'')='' or length(_idempotency_key)>200 then
    raise exception 'PIPELINE_DELETE_CONFIRMATION_REQUIRED' using errcode='22023';
  end if;
  _hash:=md5(jsonb_build_object('command','delete_pipeline','actor',_caller,'pipeline',_pipeline_id,
    'reference',_ref,'version',_expected_version,'stage_count',_expected_stage_count)::text);
  perform pg_advisory_xact_lock(hashtextextended('pipeline-delete-key:'||_tenant::text||':'||_idempotency_key,0));
  select * into _cached from public.pipeline_command_results where tenant_id=_tenant and idempotency_key=_idempotency_key;
  if found then
    if _cached.command_hash<>_hash or _cached.actor_user_id is distinct from _caller or _cached.actor_kind<>'human' then
      raise exception 'PIPELINE_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return _cached.result||jsonb_build_object('replayed',true);
  end if;
  select * into _pipeline from public.pipelines where id=_pipeline_id and tenant_id=_tenant for update;
  if not found or _pipeline.short_ref<>_ref then
    raise exception 'PIPELINE_DELETE_REFERENCE_MISMATCH' using errcode='42501';
  end if;
  -- FK writers and routing guards hold key-share locks against this transaction.
  perform 1 from public.pipeline_stages where pipeline_id=_pipeline.id order by id for update;
  select coalesce(array_agg(id),'{}'::uuid[]),count(*)::integer into _stage_ids,_stage_count
    from public.pipeline_stages where pipeline_id=_pipeline.id;
  select count(*)::integer into _deals from public.deals
    where pipeline_id=_pipeline.id or stage_id=any(_stage_ids);
  if _pipeline.version<>_expected_version or _stage_count<>_expected_stage_count then
    return jsonb_build_object('ok',false,'outcome','PIPELINE_VERSION_CONFLICT','pipeline_id',_pipeline.id,
      'pipeline_ref',_pipeline.short_ref,'deal_count',_deals,'message','This pipeline changed. Review its current details before deleting.');
  end if;
  _dependencies:=jsonb_build_object(
    'deals',_deals,
    'foreign_stages',(select count(*) from public.pipeline_stages where pipeline_id=_pipeline.id and tenant_id is distinct from _tenant),
    'foreign_confirmations',(select count(*) from public.pipeline_archive_confirmations where pipeline_id=_pipeline.id and tenant_id is distinct from _tenant),
    'forms',(select count(*) from public.growth_forms where pipeline_id=_pipeline.id or stage_id=any(_stage_ids)),
    'routes',(select count(*) from public.growth_form_automations where
      public.pipeline_reference_uuid(config_json->>'pipeline_id')=_pipeline.id or public.pipeline_reference_uuid(config_json->>'stage_id')=any(_stage_ids)),
    'automations',(select count(*) from public.stage_automation_rules where pipeline_id=_pipeline.id or from_stage_id=any(_stage_ids) or to_stage_id=any(_stage_ids)),
    'approvals',(select count(*) from public.pipeline_move_approvals where from_stage_id=any(_stage_ids) or to_stage_id=any(_stage_ids)),
    'stage_history',(select count(*) from public.stage_automation_events where from_stage_id=any(_stage_ids) or to_stage_id=any(_stage_ids)),
    'deal_history',(select count(*) from public.deal_activities where
      public.pipeline_reference_uuid(payload->>'stage_id')=any(_stage_ids) or public.pipeline_reference_uuid(payload->>'from_stage_id')=any(_stage_ids)
      or public.pipeline_reference_uuid(payload->>'to_stage_id')=any(_stage_ids) or public.pipeline_reference_uuid(payload->>'pipeline_id')=_pipeline.id)
  );
  if exists(select 1 from jsonb_each_text(_dependencies) d where d.value::bigint>0) then
    _result:=jsonb_build_object('ok',false,'outcome',case when _deals>0 then 'PIPELINE_HAS_DEALS' else 'PIPELINE_DEPENDENCIES_UNRESOLVED' end,
      'pipeline_id',_pipeline.id,'pipeline_ref',_pipeline.short_ref,'deal_count',_deals,'dependencies',_dependencies,
      'message',case when _deals>0 then 'This pipeline has '||_deals||' deals. Move or resolve them before deleting this pipeline.'
      else 'This pipeline has routing, automation, approval, or retained history dependencies. It cannot be deleted. No records were changed.' end);
    -- Refusals are audited but not cached; retries inspect current dependencies.
    insert into public.audit_logs(user_id,entity,action,entity_id,data) values(_caller,'pipeline','pipeline.configure',_pipeline.id,
      jsonb_build_object('tenant_id',_tenant,'actor_kind','human','created_through','owner','command','delete_pipeline','outcome',_result->>'outcome','pipeline_ref',_pipeline.short_ref,'dependencies',_dependencies));
    return _result;
  end if;
  -- Only stages and archive-confirmation tokens can cascade. Folder and survivors stay intact.
  delete from public.pipelines where id=_pipeline.id and tenant_id=_tenant;
  _result:=jsonb_build_object('ok',true,'outcome','deleted','pipeline_id',_pipeline.id,'pipeline_ref',_pipeline.short_ref,
    'deal_count',0,'message','Pipeline deleted. Catalog offers, clients, payments, and other pipelines are unchanged.');
  insert into public.audit_logs(user_id,entity,action,entity_id,data) values(_caller,'pipeline','pipeline.configure',_pipeline.id,
    jsonb_build_object('tenant_id',_tenant,'actor_kind','human','created_through','owner','command','delete_pipeline','outcome','deleted',
      'pipeline_ref',_pipeline.short_ref,'stage_count',_stage_count,'deal_count',0,'idempotency_key',_idempotency_key));
  insert into public.pipeline_command_results(tenant_id,idempotency_key,command_hash,actor_user_id,actor_kind,result)
    values(_tenant,_idempotency_key,_hash,_caller,'human',_result);
  return _result;
end$$;
revoke all on function public.delete_empty_pipeline(uuid,uuid,text,bigint,text,integer) from public,anon,authenticated;
grant execute on function public.delete_empty_pipeline(uuid,uuid,text,bigint,text,integer) to authenticated;
revoke delete,truncate on public.pipelines,public.pipeline_stages from public,anon,authenticated;

do $$ begin
  if to_regprocedure('public.get_pipeline_workspace_pre_empty_delete(uuid)') is null then
    alter function public.get_pipeline_workspace(uuid) rename to get_pipeline_workspace_pre_empty_delete;
  end if;
end$$;
revoke all on function public.get_pipeline_workspace_pre_empty_delete(uuid) from public,anon,authenticated;
create or replace function public.get_pipeline_workspace(_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _workspace jsonb;
begin
  _workspace:=public.get_pipeline_workspace_pre_empty_delete(_tenant_id);
  return _workspace||jsonb_build_object('can_delete',
    coalesce(_tenant_id,public.current_user_tenant_id())=public.current_user_tenant_id() and public.can_delete_solo_pipeline());
end$$;
revoke all on function public.get_pipeline_workspace(uuid) from public,anon;
grant execute on function public.get_pipeline_workspace(uuid) to authenticated,service_role;
commit;
