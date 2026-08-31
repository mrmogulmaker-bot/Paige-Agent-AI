-- Pipeline tenant isolation follow-up: fail closed on cross-tenant deal
-- references and reissue the workspace read with a tenant-bound client join.

create or replace function public.enforce_deal_tenant_links()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.tenant_id is null then
    raise exception 'DEAL_TENANT_REQUIRED' using errcode='23514';
  end if;
  if not exists(select 1 from public.pipelines p where p.id=new.pipeline_id and p.tenant_id=new.tenant_id) then
    raise exception 'DEAL_PIPELINE_TENANT_MISMATCH' using errcode='23514';
  end if;
  if not exists(select 1 from public.pipeline_stages s where s.id=new.stage_id and s.pipeline_id=new.pipeline_id and s.tenant_id=new.tenant_id) then
    raise exception 'DEAL_STAGE_TENANT_MISMATCH' using errcode='23514';
  end if;
  if new.contact_client_id is not null and not exists(select 1 from public.clients c where c.id=new.contact_client_id and c.tenant_id=new.tenant_id) then
    raise exception 'DEAL_CLIENT_TENANT_MISMATCH' using errcode='23514';
  end if;
  return new;
end$$;

revoke all on function public.enforce_deal_tenant_links() from public,anon,authenticated;
grant execute on function public.enforce_deal_tenant_links() to service_role;

drop trigger if exists deals_enforce_tenant_links on public.deals;
create trigger deals_enforce_tenant_links
before insert or update of tenant_id,pipeline_id,stage_id,contact_client_id on public.deals
for each row execute function public.enforce_deal_tenant_links();

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
      'next_action',(select t.title from public.tasks t where t.deal_id=d.id and t.status::text not in ('completed','cancelled') order by t.due_date nulls last,t.created_at limit 1),
      'history',coalesce((select jsonb_agg(jsonb_build_object('summary',coalesce(a.summary,a.type),'createdAt',a.created_at) order by a.created_at desc) from (select * from public.deal_activities da where da.deal_id=d.id order by da.created_at desc limit 20) a),'[]'::jsonb)
    ) order by d.updated_at desc) from public.deals d left join public.clients c on c.id=d.contact_client_id and c.tenant_id=_tenant where d.tenant_id=_tenant),'[]'::jsonb)
  );
end$$;

revoke all on function public.get_pipeline_workspace(uuid) from public,anon;
grant execute on function public.get_pipeline_workspace(uuid) to authenticated,service_role;

