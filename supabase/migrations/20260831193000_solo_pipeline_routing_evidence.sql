-- Pipeline supporting evidence: resolve the canonical approval lane and aggregate
-- the complete durable dispatch ledger without implying a bounded client window.

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
        'id',a.id,
        'form_id',a.form_id,
        'target_slug',a.target_slug,
        'enabled',a.enabled,
        'effective_autonomy_lane',coalesce(
          a.autonomy_lane,
          kind.default_autonomy_lane,
          case when target.executor in ('contact_upsert','pipeline_attach','client_rail_event') then 'auto' else 'confirm' end
        ),
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
        )
          and k.enabled
          and (k.tenant_id=_tenant or k.tenant_id is null)
        order by (k.tenant_id=_tenant) desc
        limit 1
      ) kind on true
      where a.tenant_id=_tenant
    ),'[]'::jsonb)
  );
end$$;

revoke all on function public.get_pipeline_routing_evidence(uuid) from public,anon;
grant execute on function public.get_pipeline_routing_evidence(uuid) to authenticated,service_role;

