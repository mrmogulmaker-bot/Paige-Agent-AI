-- The Pipeline board could name a deal's client but not identify it.
--
-- `get_pipeline_workspace_pre_identity` already joins `public.clients` under the
-- caller's own client-visibility predicate and emits `client_name` from it. It emits
-- no identifier, so a deal card cannot hand PAIGE a client scope and every
-- client-scoped read from that surface was unreachable.
--
-- This migration re-creates that innermost projection with ONE added key,
-- `client_id`, taken from the ALREADY-JOINED and ALREADY-FILTERED `c` — never from
-- `d.contact_client_id`. Reading it off `c` means it is null in exactly the cases
-- where the client is not visible to this caller, so the identifier can never
-- outrun the name beside it. Every predicate below is carried over verbatim from
-- 20260831224500; nothing else changes.
--
-- No new grant, table, policy or authority. The value is UI context only: the
-- server re-resolves tenant, authorization and client scope on every request that
-- carries it back (paige-ai-chat authorizes the id by tenant equality before any
-- client-scoped read).

create or replace function public.get_pipeline_workspace_pre_identity(_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id()); _deal_admin boolean; _client_admin boolean; _task_admin boolean; _is_coach boolean;
begin
  if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant=public.current_user_tenant_id()) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  _deal_admin:=public.is_platform_owner() or public.has_role(_caller,'admin'::public.app_role);
  _client_admin:=public.is_platform_owner() or public.has_any_role(_caller,array['admin','super_admin']::text[]);
  _task_admin:=public.is_platform_owner() or public.has_role(_caller,'admin'::public.app_role) or public.has_role(_caller,'super_admin'::public.app_role);
  _is_coach:=public.has_role(_caller,'coach'::public.app_role);
  return jsonb_build_object(
    'can_manage',public.is_platform_owner() or public.is_tenant_admin(_tenant),
    'pipelines',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'is_default',p.is_default,'lifecycle_status',p.lifecycle_status,'version',p.version) order by p.is_default desc,p.created_at) from public.pipelines p where p.tenant_id=_tenant),'[]'::jsonb),
    'stages',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'pipeline_id',s.pipeline_id,'label',s.label,'description',s.description,'order_index',s.order_index,'archived_at',s.archived_at,'move_policy',s.move_policy,'version',s.version) order by s.pipeline_id,s.order_index) from public.pipeline_stages s where s.tenant_id=_tenant),'[]'::jsonb),
    'deals',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'title',d.title,'pipeline_id',d.pipeline_id,'stage_id',d.stage_id,'owner_user_id',d.owner_user_id,'status',d.status,'source',d.source,'updated_at',d.updated_at,'version',d.version,
      'client_id',c.id,'client_name',coalesce(nullif(btrim(concat_ws(' ',c.first_name,c.last_name)),''),nullif(c.entity_name,''),'Client not recorded'),
      'next_action',(select t.title from public.tasks t where t.deal_id=d.id and t.tenant_id=_tenant and t.status::text not in ('completed','cancelled') and (_task_admin or t.user_id=_caller or (_is_coach and exists(select 1 from public.clients tc where tc.linked_user_id=t.user_id and tc.assigned_coach_user_id=_caller))) order by t.due_date nulls last,t.created_at limit 1),
      'history',coalesce((select jsonb_agg(jsonb_build_object('summary',coalesce(a.summary,a.type),'createdAt',a.created_at) order by a.created_at desc) from (select * from public.deal_activities da where da.deal_id=d.id order by da.created_at desc limit 20) a where _deal_admin or _is_coach),'[]'::jsonb)
    ) order by d.updated_at desc) from public.deals d left join public.clients c on c.id=d.contact_client_id and c.tenant_id=_tenant and (_client_admin or (_is_coach and (c.assigned_coach_user_id=_caller or c.created_by=_caller or public.is_assigned_to_client(_caller,c.id,'coach')))) where d.tenant_id=_tenant and (_deal_admin or (_is_coach and (d.owner_user_id=_caller or exists(select 1 from public.clients dc where dc.id=d.contact_client_id and dc.assigned_coach_user_id=_caller))))),'[]'::jsonb)
  );
end$$;
revoke all on function public.get_pipeline_workspace_pre_identity(uuid) from public,anon,authenticated;

comment on function public.get_pipeline_workspace_pre_identity(uuid) is
  'Innermost Pipeline workspace projection. Emits client_id from the visibility-filtered clients join so a deal card can scope PAIGE to a client the caller can already see; null when that client is not visible. Internal — reached only through public.get_pipeline_workspace.';
