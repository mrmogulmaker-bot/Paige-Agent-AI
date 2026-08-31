-- Reordering must share the same per-pipeline lock as every stage insert.

create or replace function public.reorder_pipeline_stages(_pipeline_id uuid,_ordered_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid; _i int; _expected int;
begin
  select tenant_id into _tenant from public.pipelines where id=_pipeline_id;
  if _tenant is null then raise exception 'PIPELINE_NOT_FOUND' using errcode='22023'; end if;
  if _caller is not null and not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pipeline-stage-order:'||_pipeline_id::text,0));
  select count(*) into _expected from public.pipeline_stages where pipeline_id=_pipeline_id;
  if coalesce(array_length(_ordered_ids,1),0)<>_expected or (select count(distinct value) from unnest(_ordered_ids) value)<>_expected or exists(select 1 from unnest(_ordered_ids) value left join public.pipeline_stages s on s.id=value and s.pipeline_id=_pipeline_id where s.id is null) then raise exception 'PIPELINE_STAGE_ORDER_INVALID' using errcode='22023'; end if;
  for _i in 1.._expected loop update public.pipeline_stages set order_index=_i,updated_at=now() where id=_ordered_ids[_i] and pipeline_id=_pipeline_id; end loop;
  insert into public.audit_logs(user_id,entity,action,entity_id,data) values(_caller,'pipeline','reorder_pipeline_stages',_pipeline_id,jsonb_build_object('tenant_id',_tenant,'ordered_ids',to_jsonb(_ordered_ids)));
end$$;
revoke all on function public.reorder_pipeline_stages(uuid,uuid[]) from public,anon;
grant execute on function public.reorder_pipeline_stages(uuid,uuid[]) to authenticated,service_role;

