-- Solo Campaigns -> Pipeline: tenant-owned board and governed stage lifecycle.
-- Local migration only. No provider action is part of this draft.

alter table public.pipeline_stages add column if not exists description text;
alter table public.pipeline_stages add column if not exists archived_at timestamptz;
alter table public.pipeline_stages add column if not exists archived_by uuid references auth.users(id) on delete set null;

create or replace function public.get_pipeline_workspace(_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id());
begin
  if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant=public.current_user_tenant_id()) then
    raise exception 'PIPELINE_FORBIDDEN' using errcode='42501';
  end if;
  return jsonb_build_object(
    'can_manage',public.is_platform_owner() or public.is_tenant_admin(_tenant),
    'pipelines',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'is_default',p.is_default) order by p.is_default desc,p.created_at) from public.pipelines p where p.tenant_id=_tenant),'[]'::jsonb),
    'stages',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'pipeline_id',s.pipeline_id,'label',s.label,'description',s.description,'order_index',s.order_index,'archived_at',s.archived_at) order by s.pipeline_id,s.order_index) from public.pipeline_stages s where s.tenant_id=_tenant),'[]'::jsonb),
    'deals',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'title',d.title,'pipeline_id',d.pipeline_id,'stage_id',d.stage_id,'owner_user_id',d.owner_user_id,
      'status',d.status,'source',d.source,'updated_at',d.updated_at,
      'client_name',coalesce(nullif(btrim(concat_ws(' ',c.first_name,c.last_name)),''),nullif(c.entity_name,''),'Client not recorded'),
      'portal_available',c.linked_user_id is not null,
      'next_action',(select t.title from public.tasks t where t.deal_id=d.id and t.tenant_id=_tenant and t.status::text not in ('completed','cancelled') order by t.due_date nulls last,t.created_at limit 1),
      'history',coalesce((select jsonb_agg(jsonb_build_object('summary',coalesce(a.summary,a.type),'createdAt',a.created_at) order by a.created_at desc) from (select * from public.deal_activities da where da.deal_id=d.id order by da.created_at desc limit 20) a),'[]'::jsonb)
    ) order by d.updated_at desc) from public.deals d left join public.clients c on c.id=d.contact_client_id and c.tenant_id=_tenant where d.tenant_id=_tenant),'[]'::jsonb)
  );
end$$;
revoke all on function public.get_pipeline_workspace(uuid) from public,anon;
grant execute on function public.get_pipeline_workspace(uuid) to authenticated,service_role;

create or replace function public.create_tenant_pipeline(_tenant_id uuid,_name text,_description text default null,_stages jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id()); _pid uuid; _stage jsonb; _index int:=0;
begin
  if _tenant is null or (_caller is not null and not (public.is_platform_owner() or public.is_tenant_admin(_tenant))) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if coalesce(btrim(_name),'')='' then raise exception 'PIPELINE_NAME_REQUIRED' using errcode='22023'; end if;
  if _stages is null or jsonb_typeof(_stages)<>'array' then raise exception 'PIPELINE_STAGES_INVALID' using errcode='22023'; end if;
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

create or replace function public.update_pipeline_details(_pipeline_id uuid,_name text,_description text default null)
returns void language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid;
begin
  select tenant_id into _tenant from public.pipelines where id=_pipeline_id;
  if _tenant is null then raise exception 'PIPELINE_NOT_FOUND' using errcode='22023'; end if;
  if _caller is not null and not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if coalesce(btrim(_name),'')='' then raise exception 'PIPELINE_NAME_REQUIRED' using errcode='22023'; end if;
  update public.pipelines set name=btrim(_name),description=nullif(btrim(_description),''),updated_at=now() where id=_pipeline_id;
  insert into public.audit_logs(user_id,entity,action,entity_id,data) values(_caller,'pipeline','update_pipeline_details',_pipeline_id,jsonb_build_object('tenant_id',_tenant));
end$$;
revoke all on function public.update_pipeline_details(uuid,text,text) from public,anon;
grant execute on function public.update_pipeline_details(uuid,text,text) to authenticated,service_role;

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

-- Strengthen the existing reorder seam: it must receive every stage exactly once.
create or replace function public.reorder_pipeline_stages(_pipeline_id uuid,_ordered_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid; _i int; _expected int;
begin
  select tenant_id into _tenant from public.pipelines where id=_pipeline_id;
  if _tenant is null then raise exception 'PIPELINE_NOT_FOUND' using errcode='22023'; end if;
  if _caller is not null and not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  select count(*) into _expected from public.pipeline_stages where pipeline_id=_pipeline_id;
  if coalesce(array_length(_ordered_ids,1),0)<>_expected or (select count(distinct value) from unnest(_ordered_ids) value)<>_expected or exists(select 1 from unnest(_ordered_ids) value left join public.pipeline_stages s on s.id=value and s.pipeline_id=_pipeline_id where s.id is null) then raise exception 'PIPELINE_STAGE_ORDER_INVALID' using errcode='22023'; end if;
  for _i in 1.._expected loop update public.pipeline_stages set order_index=_i,updated_at=now() where id=_ordered_ids[_i] and pipeline_id=_pipeline_id; end loop;
  insert into public.audit_logs(user_id,entity,action,entity_id,data) values(_caller,'pipeline','reorder_pipeline_stages',_pipeline_id,jsonb_build_object('tenant_id',_tenant,'ordered_ids',to_jsonb(_ordered_ids)));
end$$;
revoke all on function public.reorder_pipeline_stages(uuid,uuid[]) from public,anon;
grant execute on function public.reorder_pipeline_stages(uuid,uuid[]) to authenticated,service_role;

