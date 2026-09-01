-- Align Pipeline evidence with executors that currently bypass autonomy lanes,
-- reject archived-stage assignments, and serialize every stage insert path.

create or replace function public.get_pipeline_routing_evidence(_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _caller uuid:=auth.uid(); _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id());
begin
  if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant=public.current_user_tenant_id()) then
    raise exception 'PIPELINE_FORBIDDEN' using errcode='42501';
  end if;
  return jsonb_build_object(
    'routes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'form_id',a.form_id,'target_slug',a.target_slug,'enabled',a.enabled,
        'effective_autonomy_lane',case
          when target.executor in ('contact_upsert','pipeline_attach','client_rail_event','notify_team') then 'auto'
          else coalesce(a.autonomy_lane,kind.default_autonomy_lane,'confirm')
        end,
        'dispatch_statuses',coalesce((
          select jsonb_object_agg(outcome.status,outcome.outcome_count)
          from (
            select coalesce(d.status,'unrecorded') status,count(*) outcome_count
            from public.growth_submission_dispatches d
            where d.tenant_id=_tenant and d.automation_id=a.id
            group by coalesce(d.status,'unrecorded')
          ) outcome
        ),'{}'::jsonb)
      ) order by a.form_id,a.order_index)
      from public.growth_form_automations a
      left join public.growth_automation_targets target on target.slug=a.target_slug
      left join lateral (
        select k.default_autonomy_lane
        from public.paige_action_kinds k
        where k.slug=coalesce(
          nullif(a.config_json->>'action_kind',''),
          nullif(target.config_schema->>'action_kind',''),
          case a.target_slug when 'run_workflow' then 'owner.run_workflow' when 'notify_team' then 'owner.notify_team' end
        ) and k.enabled and (k.tenant_id=_tenant or k.tenant_id is null)
        order by (k.tenant_id=_tenant) desc
        limit 1
      ) kind on true
      where a.tenant_id=_tenant
    ),'[]'::jsonb)
  );
end$$;
revoke all on function public.get_pipeline_routing_evidence(uuid) from public,anon;
grant execute on function public.get_pipeline_routing_evidence(uuid) to authenticated,service_role;

create or replace function public.enforce_deal_tenant_links()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.tenant_id is null then raise exception 'DEAL_TENANT_REQUIRED' using errcode='23514'; end if;
  if not exists(select 1 from public.pipelines p where p.id=new.pipeline_id and p.tenant_id=new.tenant_id) then
    raise exception 'DEAL_PIPELINE_TENANT_MISMATCH' using errcode='23514';
  end if;
  if not exists(select 1 from public.pipeline_stages s where s.id=new.stage_id and s.pipeline_id=new.pipeline_id and s.tenant_id=new.tenant_id and s.archived_at is null) then
    raise exception 'DEAL_STAGE_INVALID_OR_ARCHIVED' using errcode='23514';
  end if;
  if new.contact_client_id is not null and not exists(select 1 from public.clients c where c.id=new.contact_client_id and c.tenant_id=new.tenant_id) then
    raise exception 'DEAL_CLIENT_TENANT_MISMATCH' using errcode='23514';
  end if;
  return new;
end$$;
revoke all on function public.enforce_deal_tenant_links() from public,anon,authenticated;
grant execute on function public.enforce_deal_tenant_links() to service_role;

create or replace function public.serialize_pipeline_stage_insert()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('pipeline-stage-order:'||new.pipeline_id::text,0));
  if exists(select 1 from public.pipeline_stages s where s.pipeline_id=new.pipeline_id and s.order_index=new.order_index) then
    select coalesce(max(s.order_index),0)+1 into new.order_index from public.pipeline_stages s where s.pipeline_id=new.pipeline_id;
  end if;
  return new;
end$$;
revoke all on function public.serialize_pipeline_stage_insert() from public,anon,authenticated;
grant execute on function public.serialize_pipeline_stage_insert() to service_role;

drop trigger if exists trg_serialize_pipeline_stage_insert on public.pipeline_stages;
create trigger trg_serialize_pipeline_stage_insert
before insert on public.pipeline_stages
for each row execute function public.serialize_pipeline_stage_insert();

