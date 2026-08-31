-- Coordinate every default-setting pipeline creator with Solo's tenant lock.

create or replace function public.create_pipeline_with_stages(
  _tenant_id uuid,
  _name text,
  _stages jsonb default '[]'::jsonb,
  _description text default null,
  _color text default '#CFAE70',
  _is_default boolean default false,
  _created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  _caller uuid:=auth.uid();
  _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id());
  _pid uuid;
  _stage jsonb;
  _idx int:=0;
  _default_stages jsonb:='[
    {"label":"Lead","color":"#94a3b8","probability":10,"stage_type":"open"},
    {"label":"Qualified","color":"#3b82f6","probability":25,"stage_type":"open"},
    {"label":"Proposal","color":"#8b5cf6","probability":50,"stage_type":"open"},
    {"label":"Won","color":"#10b981","probability":100,"stage_type":"won"},
    {"label":"Lost","color":"#ef4444","probability":0,"stage_type":"lost"}
  ]'::jsonb;
begin
  if _caller is not null and not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then
    raise exception 'PIPELINE_FORBIDDEN: admin privileges required' using errcode='42501';
  end if;
  if _tenant is null then raise exception 'PIPELINE_NO_TENANT: a tenant context is required' using errcode='22023'; end if;
  if coalesce(btrim(_name),'')='' then raise exception 'PIPELINE_NAME_REQUIRED' using errcode='22023'; end if;

  if _stages is null or jsonb_typeof(_stages)<>'array' or jsonb_array_length(_stages)=0 then
    _stages:=_default_stages;
  end if;

  if _is_default then
    perform pg_advisory_xact_lock(hashtextextended('pipeline-default:'||_tenant::text,0));
    update public.pipelines set is_default=false,updated_at=now()
      where tenant_id=_tenant and is_default=true;
  end if;

  insert into public.pipelines(name,description,color,is_default,created_by,tenant_id)
  values(btrim(_name),_description,coalesce(_color,'#CFAE70'),_is_default,_created_by,_tenant)
  returning id into _pid;

  for _stage in select * from jsonb_array_elements(_stages) loop
    _idx:=_idx+1;
    insert into public.pipeline_stages(pipeline_id,label,color,order_index,probability,stage_type,tenant_id)
    values(
      _pid,
      coalesce(nullif(btrim(_stage->>'label'),''),'Stage '||_idx),
      coalesce(nullif(_stage->>'color',''),'#94a3b8'),
      coalesce((_stage->>'order_index')::int,_idx),
      least(100,greatest(0,coalesce((_stage->>'probability')::numeric,0))),
      case when _stage->>'stage_type' in ('open','won','lost') then _stage->>'stage_type' else 'open' end,
      _tenant
    );
  end loop;

  insert into public.audit_logs(user_id,entity,action,entity_id,data)
  values(_caller,'pipeline','create_pipeline_with_stages',_pid,jsonb_build_object('tenant_id',_tenant,'name',_name,'stage_count',jsonb_array_length(_stages)));
  return _pid;
end;
$$;

revoke all on function public.create_pipeline_with_stages(uuid,text,jsonb,text,text,boolean,uuid) from public,anon;
grant execute on function public.create_pipeline_with_stages(uuid,text,jsonb,text,text,boolean,uuid) to authenticated,service_role;
