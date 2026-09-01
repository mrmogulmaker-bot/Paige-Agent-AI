-- Make the legacy default selector share the tenant pipeline-default lock.

create or replace function public.set_default_pipeline(_pipeline_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  _caller uuid:=auth.uid();
  _tenant uuid;
begin
  select tenant_id into _tenant from public.pipelines where id=_pipeline_id;
  if _tenant is null then raise exception 'PIPELINE_NOT_FOUND' using errcode='22023'; end if;
  if _caller is not null and not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then
    raise exception 'PIPELINE_FORBIDDEN' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pipeline-default:'||_tenant::text,0));
  if not exists(select 1 from public.pipelines where id=_pipeline_id and tenant_id=_tenant) then
    raise exception 'PIPELINE_NOT_FOUND' using errcode='22023';
  end if;
  update public.pipelines
    set is_default=(id=_pipeline_id),updated_at=now()
    where tenant_id=_tenant and (is_default=true or id=_pipeline_id);
  insert into public.audit_logs(user_id,entity,action,entity_id,data)
  values(_caller,'pipeline','set_default_pipeline',_pipeline_id,jsonb_build_object('tenant_id',_tenant));
end;
$$;

revoke all on function public.set_default_pipeline(uuid) from public,anon;
grant execute on function public.set_default_pipeline(uuid) to authenticated,service_role;
