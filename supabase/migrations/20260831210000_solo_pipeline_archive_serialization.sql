-- Serialize deal assignment with stage archival so the board cannot hide work,
-- and keep the existing governed stage lifecycle on the same row lock.

create or replace function public.enforce_deal_tenant_links()
returns trigger language plpgsql security definer set search_path=public as $$
declare _stage_archived timestamptz;
begin
  if new.tenant_id is null then raise exception 'DEAL_TENANT_REQUIRED' using errcode='23514'; end if;
  if not exists(select 1 from public.pipelines p where p.id=new.pipeline_id and p.tenant_id=new.tenant_id) then
    raise exception 'DEAL_PIPELINE_TENANT_MISMATCH' using errcode='23514';
  end if;
  select s.archived_at into _stage_archived
  from public.pipeline_stages s
  where s.id=new.stage_id and s.pipeline_id=new.pipeline_id and s.tenant_id=new.tenant_id
  for share;
  if not found or _stage_archived is not null then
    raise exception 'DEAL_STAGE_INVALID_OR_ARCHIVED' using errcode='23514';
  end if;
  if new.contact_client_id is not null and not exists(select 1 from public.clients c where c.id=new.contact_client_id and c.tenant_id=new.tenant_id) then
    raise exception 'DEAL_CLIENT_TENANT_MISMATCH' using errcode='23514';
  end if;
  return new;
end$$;
revoke all on function public.enforce_deal_tenant_links() from public,anon,authenticated;
grant execute on function public.enforce_deal_tenant_links() to service_role;

create or replace function public.manage_pipeline_stage(_action text,_pipeline_id uuid default null,_stage_id uuid default null,_label text default null,_description text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid; _pipeline uuid; _result uuid; _position int;
begin
  if _action='create' then select tenant_id,id into _tenant,_pipeline from public.pipelines where id=_pipeline_id;
  else select tenant_id,pipeline_id,id into _tenant,_pipeline,_result from public.pipeline_stages where id=_stage_id for update; end if;
  if _tenant is null then raise exception 'PIPELINE_STAGE_NOT_FOUND' using errcode='22023'; end if;
  if _caller is not null and not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if _action in ('create','update') and coalesce(btrim(_label),'')='' then raise exception 'PIPELINE_STAGE_NAME_REQUIRED' using errcode='22023'; end if;
  if _action='create' then
    perform pg_advisory_xact_lock(hashtextextended('pipeline-stage-order:'||_pipeline::text,0));
    select coalesce(max(order_index),0)+1 into _position from public.pipeline_stages where pipeline_id=_pipeline;
    insert into public.pipeline_stages(pipeline_id,label,description,order_index,stage_type,tenant_id) values(_pipeline,btrim(_label),nullif(btrim(_description),''),_position,'open',_tenant) returning id into _result;
  elsif _action='update' then update public.pipeline_stages set label=btrim(_label),description=nullif(btrim(_description),''),updated_at=now() where id=_stage_id;
  elsif _action='archive' then
    if exists(select 1 from public.deals where stage_id=_stage_id) then raise exception 'PIPELINE_STAGE_OCCUPIED: move its work before archiving' using errcode='23503'; end if;
    update public.pipeline_stages set archived_at=now(),archived_by=_caller,updated_at=now() where id=_stage_id;
  elsif _action='restore' then update public.pipeline_stages set archived_at=null,archived_by=null,updated_at=now() where id=_stage_id;
  else raise exception 'PIPELINE_STAGE_ACTION_INVALID' using errcode='22023'; end if;
  insert into public.audit_logs(user_id,entity,action,entity_id,data) values(_caller,'pipeline_stage','pipeline_stage_'||_action,_result,jsonb_build_object('tenant_id',_tenant,'pipeline_id',_pipeline));
  return _result;
end$$;
revoke all on function public.manage_pipeline_stage(text,uuid,uuid,text,text) from public,anon;
grant execute on function public.manage_pipeline_stage(text,uuid,uuid,text,text) to authenticated,service_role;

