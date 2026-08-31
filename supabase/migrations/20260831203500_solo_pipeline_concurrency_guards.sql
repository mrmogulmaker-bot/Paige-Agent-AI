-- Serialize tenant pipeline defaults and per-pipeline stage ordering across sessions.

create or replace function public.create_tenant_pipeline(_tenant_id uuid,_name text,_description text default null,_stages jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id()); _pid uuid; _stage jsonb; _index int:=0;
begin
  if _tenant is null or (_caller is not null and not (public.is_platform_owner() or public.is_tenant_admin(_tenant))) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if coalesce(btrim(_name),'')='' then raise exception 'PIPELINE_NAME_REQUIRED' using errcode='22023'; end if;
  if _stages is null or jsonb_typeof(_stages)<>'array' then raise exception 'PIPELINE_STAGES_INVALID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pipeline-default:'||_tenant::text,0));
  insert into public.pipelines(name,description,is_default,created_by,tenant_id) values(btrim(_name),nullif(btrim(_description),''),not exists(select 1 from public.pipelines where tenant_id=_tenant),_caller,_tenant) returning id into _pid;
  for _stage in select * from jsonb_array_elements(_stages) loop
    _index:=_index+1;
    insert into public.pipeline_stages(pipeline_id,label,description,order_index,stage_type,tenant_id)
    values(_pid,coalesce(nullif(btrim(_stage->>'label'),''),'Stage '||_index),nullif(btrim(_stage->>'description'),''),_index,case when _stage->>'stage_type' in ('open','won','lost') then _stage->>'stage_type' else 'open' end,_tenant);
  end loop;
  insert into public.audit_logs(user_id,entity,action,entity_id,data) values(_caller,'pipeline','create_tenant_pipeline',_pid,jsonb_build_object('tenant_id',_tenant,'stage_count',jsonb_array_length(_stages)));
  return _pid;
end$$;
revoke all on function public.create_tenant_pipeline(uuid,text,text,jsonb) from public,anon;
grant execute on function public.create_tenant_pipeline(uuid,text,text,jsonb) to authenticated,service_role;

create or replace function public.manage_pipeline_stage(_action text,_pipeline_id uuid default null,_stage_id uuid default null,_label text default null,_description text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid; _pipeline uuid; _result uuid; _position int;
begin
  if _action='create' then select tenant_id,id into _tenant,_pipeline from public.pipelines where id=_pipeline_id;
  else select tenant_id,pipeline_id,id into _tenant,_pipeline,_result from public.pipeline_stages where id=_stage_id; end if;
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

