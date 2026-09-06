-- Solo Tenant Brain · Business Mission selected-context read.
-- Extends the existing Mission system; creates no parallel store or authority path.

create index if not exists business_missions_thread_context_idx
  on public.business_missions (tenant_id, request_thread_id, updated_at desc)
  where request_thread_id is not null;

create or replace function public.get_paige_thread_business_mission(p_thread_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a uuid;
  t uuid;
  r jsonb;
begin
  select c.actor_id, c.tenant_id into a, t
  from public.business_mission_owner_context() c;

  if p_thread_id is null then
    raise exception 'MISSION_THREAD_CONTEXT_INVALID' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'mission', jsonb_build_object(
      'id', m.id,
      'title', m.title,
      'state', m.lifecycle_state,
      'state_reason', m.state_reason,
      'next_action', m.next_action,
      'revision', m.revision,
      'created_at', m.created_at,
      'updated_at', m.updated_at,
      'closure_outcome', m.closure_outcome,
      'outcome_summary', m.outcome_summary,
      'outcome_unknowns', m.outcome_unknowns,
      'request_source', m.request_source,
      'request_thread_id', m.request_thread_id
    ),
    'brief', to_jsonb(b) - 'tenant_id' - 'mission_id' - 'created_by'
  )
  into r
  from public.business_missions m
  join lateral (
    select v.*
    from public.business_mission_brief_versions v
    where v.tenant_id = m.tenant_id and v.mission_id = m.id
    order by v.version desc
    limit 1
  ) b on true
  where m.tenant_id = t and m.request_thread_id = p_thread_id
  order by m.updated_at desc, m.id desc
  limit 1;

  return jsonb_build_object(
    'resolved_tenant_id', t,
    'selected_by', 'paige_thread_latest',
    'record', r
  );
end
$$;

revoke all on function public.get_paige_thread_business_mission(uuid) from public, anon;
grant execute on function public.get_paige_thread_business_mission(uuid) to authenticated;

comment on function public.get_paige_thread_business_mission(uuid) is
  'Owner-only, active-tenant-derived selected Mission context for one persisted Paige thread. The thread UUID is a locator, never tenant authority.';
