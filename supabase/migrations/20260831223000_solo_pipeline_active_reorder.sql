-- Allow legacy active-only reorder while preserving archived stage positions.

create or replace function public.reorder_pipeline_stages(_pipeline_id uuid,_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  _caller uuid:=auth.uid();
  _tenant uuid;
  _i int;
  _all_count int;
  _active_count int;
  _given_count int:=coalesce(array_length(_ordered_ids,1),0);
  _active_only boolean:=false;
  _slots int[];
begin
  select tenant_id into _tenant from public.pipelines where id=_pipeline_id;
  if _tenant is null then raise exception 'PIPELINE_NOT_FOUND' using errcode='22023'; end if;
  if _caller is not null and not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then
    raise exception 'PIPELINE_FORBIDDEN' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pipeline-stage-order:'||_pipeline_id::text,0));

  select count(*),count(*) filter(where archived_at is null)
    into _all_count,_active_count
    from public.pipeline_stages where pipeline_id=_pipeline_id;
  if (select count(distinct value) from unnest(_ordered_ids) value)<>_given_count then
    raise exception 'PIPELINE_STAGE_ORDER_INVALID' using errcode='22023';
  end if;

  if _given_count=_all_count and not exists(
    select 1 from unnest(_ordered_ids) value
    left join public.pipeline_stages s on s.id=value and s.pipeline_id=_pipeline_id
    where s.id is null
  ) then
    _active_only:=false;
  elsif _given_count=_active_count and not exists(
    select 1 from unnest(_ordered_ids) value
    left join public.pipeline_stages s on s.id=value and s.pipeline_id=_pipeline_id and s.archived_at is null
    where s.id is null
  ) then
    _active_only:=true;
  else
    raise exception 'PIPELINE_STAGE_ORDER_INVALID' using errcode='22023';
  end if;

  if _active_only then
    select array_agg(order_index order by order_index) into _slots
      from public.pipeline_stages where pipeline_id=_pipeline_id and archived_at is null;
    for _i in 1.._active_count loop
      update public.pipeline_stages set order_index=_slots[_i],updated_at=now()
        where id=_ordered_ids[_i] and pipeline_id=_pipeline_id and archived_at is null;
    end loop;
  else
    for _i in 1.._all_count loop
      update public.pipeline_stages set order_index=_i,updated_at=now()
        where id=_ordered_ids[_i] and pipeline_id=_pipeline_id;
    end loop;
  end if;

  insert into public.audit_logs(user_id,entity,action,entity_id,data)
  values(_caller,'pipeline','reorder_pipeline_stages',_pipeline_id,jsonb_build_object('tenant_id',_tenant,'ordered_ids',to_jsonb(_ordered_ids),'active_only',_active_only));
end;
$$;

revoke all on function public.reorder_pipeline_stages(uuid,uuid[]) from public,anon;
grant execute on function public.reorder_pipeline_stages(uuid,uuid[]) to authenticated,service_role;
