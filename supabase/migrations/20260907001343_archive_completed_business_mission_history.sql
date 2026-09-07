-- Owner-complete Business Game Plan: archive a completed Strategic Play without
-- deleting or rewriting its previously verified completion outcome.
create or replace function public.transition_business_mission(p_mission_id uuid,p_expected_revision integer,p_request_key uuid,p_to_state text,p_reason text default null,
  p_closure_outcome text default null,p_outcome_summary text default null,p_outcome_unknowns text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid;t uuid;m public.business_missions%rowtype;h text;n integer;r public.business_mission_mutation_receipts%rowtype;answer jsonb;
begin
  select c.actor_id,c.tenant_id into a,t from public.business_mission_owner_context() c;
  if p_request_key is null then raise exception 'MISSION_REQUEST_KEY_REQUIRED' using errcode='22023'; end if;
  if p_expected_revision is null or p_expected_revision<1 then raise exception 'MISSION_EXPECTED_REVISION_REQUIRED' using errcode='22023'; end if;
  h:=md5(jsonb_build_object('mission_id',p_mission_id,'expected_revision',p_expected_revision,'state',p_to_state,'reason',p_reason,'outcome',p_closure_outcome,'summary',p_outcome_summary,'unknowns',p_outcome_unknowns)::text);
  insert into public.business_mission_mutation_receipts(tenant_id,actor_user_id,request_key,operation,payload_hash) values(t,a,p_request_key,'transition',h) on conflict do nothing;
  if not found then
    select * into r from public.business_mission_mutation_receipts x where x.tenant_id=t and x.actor_user_id=a and x.request_key=p_request_key for update;
    if r.operation<>'transition' or r.payload_hash<>h then raise exception 'MISSION_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    if r.result is null then raise exception 'MISSION_REQUEST_INCOMPLETE' using errcode='40001'; end if;
    return r.result||jsonb_build_object('replayed',true);
  end if;
  select * into m from public.business_missions x where x.tenant_id=t and x.id=p_mission_id for update;
  if not found then raise exception 'MISSION_NOT_FOUND' using errcode='P0002'; end if;
  if m.revision is distinct from p_expected_revision then raise exception 'MISSION_REVISION_CONFLICT' using errcode='40001'; end if;
  if not ((m.lifecycle_state='proposed' and p_to_state in ('active','stopped'))
    or (m.lifecycle_state='active' and p_to_state in ('blocked','paused','completed','stopped'))
    or (m.lifecycle_state='blocked' and p_to_state in ('active','paused','completed','stopped'))
    or (m.lifecycle_state='paused' and p_to_state in ('active','completed','stopped'))
    or (m.lifecycle_state='completed' and p_to_state='stopped'))
    then raise exception 'MISSION_INVALID_TRANSITION' using errcode='22023';end if;

  if m.lifecycle_state='completed' and p_to_state='stopped' then
    if p_closure_outcome is distinct from m.closure_outcome
      or btrim(coalesce(p_outcome_summary,'')) is distinct from m.outcome_summary
      or nullif(btrim(coalesce(p_outcome_unknowns,'')),'') is distinct from m.outcome_unknowns
      then raise exception 'MISSION_ARCHIVE_HISTORY_MISMATCH' using errcode='22023';end if;
  else
    if p_to_state in ('completed','stopped') and (p_closure_outcome is null or nullif(btrim(coalesce(p_outcome_summary,'')),'') is null)
      then raise exception 'MISSION_OUTCOME_REQUIRED' using errcode='22023';end if;
    if p_to_state='completed' and p_closure_outcome not in ('achieved','partly_achieved','blocked') then raise exception 'MISSION_BAD_OUTCOME' using errcode='22023';end if;
    if p_to_state='stopped' and p_closure_outcome<>'stopped' then raise exception 'MISSION_BAD_OUTCOME' using errcode='22023';end if;
  end if;

  n:=m.revision+1;
  update public.business_missions set lifecycle_state=p_to_state,state_reason=nullif(btrim(coalesce(p_reason,'')),''),revision=n,
    paused_at=case when p_to_state='paused' then now() else null end,
    closed_at=case when m.lifecycle_state='completed' and p_to_state='stopped' then m.closed_at when p_to_state in ('completed','stopped') then now() else null end,
    closure_outcome=case when m.lifecycle_state='completed' and p_to_state='stopped' then m.closure_outcome when p_to_state in ('completed','stopped') then p_closure_outcome else null end,
    outcome_summary=case when m.lifecycle_state='completed' and p_to_state='stopped' then m.outcome_summary when p_to_state in ('completed','stopped') then btrim(p_outcome_summary) else null end,
    outcome_unknowns=case when m.lifecycle_state='completed' and p_to_state='stopped' then m.outcome_unknowns when p_to_state in ('completed','stopped') then nullif(btrim(coalesce(p_outcome_unknowns,'')),'') else null end,
    updated_at=now()
    where tenant_id=t and id=p_mission_id;
  answer:=jsonb_build_object('ok',true,'mission_id',p_mission_id,'revision',n,'state',p_to_state,'replayed',false);
  update public.business_mission_mutation_receipts set mission_id=p_mission_id,result=answer where tenant_id=t and actor_user_id=a and request_key=p_request_key;
  insert into public.paige_audit_log(tenant_id,actor_user_id,actor_role,action,target_type,target_id,payload)
    values(t,a,'owner','business_mission.transitioned','business_mission',p_mission_id,
      jsonb_build_object('from_state',m.lifecycle_state,'to_state',p_to_state,'revision',n,'closure_outcome',
        case when m.lifecycle_state='completed' and p_to_state='stopped' then m.closure_outcome else p_closure_outcome end));
  return answer;
end $$;

revoke all on function public.transition_business_mission(uuid,integer,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.transition_business_mission(uuid,integer,uuid,text,text,text,text,text) to authenticated;
create or replace function public.list_business_missions(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a uuid;t uuid;r jsonb;
begin
  select c.actor_id,c.tenant_id into a,t from public.business_mission_owner_context() c;
  select coalesce(jsonb_agg(x order by (x->>'updated_at')::timestamptz desc),'[]'::jsonb) into r
  from (
    select jsonb_build_object(
      'id',m.id,'title',m.title,'state',m.lifecycle_state,'state_reason',m.state_reason,
      'next_action',m.next_action,'revision',m.revision,'created_at',m.created_at,
      'updated_at',m.updated_at,'deadline_on',b.deadline_on,'desired_outcome',b.desired_outcome,
      'success_definition',b.success_definition,'brief_version',b.version,
      'closure_outcome',m.closure_outcome,'outcome_summary',m.outcome_summary,
      'request_source',m.request_source
    ) x
    from public.business_missions m
    join lateral (
      select v.* from public.business_mission_brief_versions v
      where v.tenant_id=m.tenant_id and v.mission_id=m.id
      order by v.version desc limit 1
    ) b on true
    where m.tenant_id=t
    order by m.updated_at desc
    limit greatest(1,least(coalesce(p_limit,50),100))
  ) q;
  return jsonb_build_object('missions',r,'resolved_tenant_id',t);
end $$;

revoke all on function public.list_business_missions(integer) from public,anon;
grant execute on function public.list_business_missions(integer) to authenticated;
