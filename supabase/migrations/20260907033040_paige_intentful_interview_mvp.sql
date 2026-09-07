begin;

-- Resumable workflow state attached to the existing owner chat thread. This is
-- not Memory, Mind, a business-fact registry, or a transcript store.
create table public.paige_intentful_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.paige_chat_threads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  entry_source text not null check (entry_source in ('first_use','paige_brief')),
  focus_path text not null check (focus_path in ('business_foundation','strategy','offers_clients','operations')),
  status text not null default 'active' check (status in ('active','paused','recap','completed','skipped','ended')),
  step_key text,
  revision integer not null default 1 check (revision > 0),
  proposed_facts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint paige_intentful_interview_facts_array check (
    jsonb_typeof(proposed_facts) = 'array' and pg_column_size(proposed_facts) <= 32768
  )
);

create unique index paige_intentful_interview_one_open
  on public.paige_intentful_interview_sessions(tenant_id, owner_user_id)
  where status in ('active','paused','recap');
create index paige_intentful_interview_thread
  on public.paige_intentful_interview_sessions(thread_id, updated_at desc);

alter table public.paige_intentful_interview_sessions enable row level security;
revoke all on public.paige_intentful_interview_sessions from public, anon, authenticated;
grant all on public.paige_intentful_interview_sessions to service_role;
create policy paige_intentful_interview_service_only
  on public.paige_intentful_interview_sessions for all to service_role using (true) with check (true);

create or replace function public.paige_interview_assert_thread(p_thread_id uuid)
returns table(tenant_id uuid, owner_user_id uuid)
language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_user_tenant_id(); v_actor uuid := auth.uid();
begin
  if v_actor is null or v_tenant is null then raise exception 'INTERVIEW_ACTIVE_ACCOUNT_REQUIRED' using errcode='42501'; end if;
  if not (public.solo_setup_access_scope()='owner_full') then raise exception 'INTERVIEW_OWNER_REQUIRED' using errcode='42501'; end if;
  return query select t.tenant_id,t.caller_user_id from public.paige_chat_threads t
    where t.id=p_thread_id and t.tenant_id=v_tenant and t.caller_user_id=v_actor and t.lens='coach'
      and t.contact_id is null and t.studio_session_id is null and not t.is_archived;
  if not found then raise exception 'INTERVIEW_THREAD_INVALID' using errcode='42501'; end if;
end $$;
revoke all on function public.paige_interview_assert_thread(uuid) from public, anon, authenticated;
grant execute on function public.paige_interview_assert_thread(uuid) to service_role;

create or replace function public.get_paige_intentful_interview(p_thread_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_user_tenant_id(); v_actor uuid := auth.uid();
  v_session public.paige_intentful_interview_sessions%rowtype; v_was_offered boolean;
begin
  if v_actor is null or v_tenant is null then raise exception 'INTERVIEW_ACTIVE_ACCOUNT_REQUIRED' using errcode='42501'; end if;
  if not (public.solo_setup_access_scope()='owner_full') then raise exception 'INTERVIEW_OWNER_REQUIRED' using errcode='42501'; end if;
  select exists(select 1 from public.paige_intentful_interview_sessions s
    where s.tenant_id=v_tenant and s.owner_user_id=v_actor and s.entry_source='first_use') into v_was_offered;
  if p_thread_id is not null then
    perform 1 from public.paige_interview_assert_thread(p_thread_id);
    select * into v_session from public.paige_intentful_interview_sessions s
      where s.thread_id=p_thread_id and s.tenant_id=v_tenant and s.owner_user_id=v_actor order by s.updated_at desc limit 1;
  else
    select * into v_session from public.paige_intentful_interview_sessions s
      where s.tenant_id=v_tenant and s.owner_user_id=v_actor and s.status in ('active','paused','recap')
      order by s.updated_at desc limit 1;
  end if;
  return jsonb_build_object('eligibleForFirstUse',(public.solo_setup_access_scope()='owner_full') and not v_was_offered,
    'session',case when v_session.id is null then null else jsonb_build_object(
      'id',v_session.id,'threadId',v_session.thread_id,'entrySource',v_session.entry_source,
      'focusPath',v_session.focus_path,'status',v_session.status,'stepKey',v_session.step_key,
      'revision',v_session.revision,'proposedFacts',v_session.proposed_facts,'updatedAt',v_session.updated_at) end);
end $$;
revoke all on function public.get_paige_intentful_interview(uuid) from public, anon;
grant execute on function public.get_paige_intentful_interview(uuid) to authenticated;

create or replace function public.start_paige_intentful_interview(p_thread_id uuid,p_entry_source text,p_focus_path text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_scope record; v_session public.paige_intentful_interview_sessions%rowtype;
begin
  if p_entry_source not in ('first_use','paige_brief') or p_focus_path not in ('business_foundation','strategy','offers_clients','operations')
    then raise exception 'INTERVIEW_SELECTION_INVALID' using errcode='22023'; end if;
  select * into v_scope from public.paige_interview_assert_thread(p_thread_id);
  select * into v_session from public.paige_intentful_interview_sessions s
    where s.tenant_id=v_scope.tenant_id and s.owner_user_id=v_scope.owner_user_id
      and s.status in ('active','paused','recap') for update;
  if v_session.id is not null then
    return jsonb_build_object('id',v_session.id,'threadId',v_session.thread_id,'status',v_session.status,'revision',v_session.revision);
  end if;
  insert into public.paige_intentful_interview_sessions(thread_id,tenant_id,owner_user_id,entry_source,focus_path,status,step_key)
    values(p_thread_id,v_scope.tenant_id,v_scope.owner_user_id,p_entry_source,p_focus_path,'active','question_0') returning * into v_session;
  return jsonb_build_object('id',v_session.id,'threadId',v_session.thread_id,'status',v_session.status,'revision',v_session.revision);
end $$;
revoke all on function public.start_paige_intentful_interview(uuid,text,text) from public, anon;
grant execute on function public.start_paige_intentful_interview(uuid,text,text) to authenticated;

create or replace function public.update_paige_intentful_interview(
  p_session_id uuid,p_expected_revision integer,p_event text,p_step_key text default null,p_fact jsonb default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_user_tenant_id(); v_actor uuid := auth.uid();
  v_session public.paige_intentful_interview_sessions%rowtype;
  v_allowed_fields constant text[] := array['publicName','industry','idealCustomer','offers','annualDirection','goals90Day',
    'successDefinition','constraints','deliveryModel','currentPriority','operatingPreferences','doNotAssume'];
  v_fact_id text; v_field text; v_value text; v_facts jsonb; v_next_status text;
begin
  if v_actor is null or v_tenant is null then raise exception 'INTERVIEW_ACTIVE_ACCOUNT_REQUIRED' using errcode='42501'; end if;
  select * into v_session from public.paige_intentful_interview_sessions s
    where s.id=p_session_id and s.tenant_id=v_tenant and s.owner_user_id=v_actor for update;
  if not found then raise exception 'INTERVIEW_NOT_FOUND' using errcode='P0002'; end if;
  perform 1 from public.paige_interview_assert_thread(v_session.thread_id);
  if v_session.revision<>p_expected_revision then raise exception 'INTERVIEW_REVISION_CONFLICT' using errcode='40001'; end if;
  if v_session.status in ('completed','skipped','ended') then raise exception 'INTERVIEW_ALREADY_FINISHED' using errcode='22023'; end if;
  v_facts:=v_session.proposed_facts; v_next_status:=v_session.status;
  if p_event='answer' then
    if v_session.status<>'active' or p_fact is null or jsonb_typeof(p_fact)<>'object' then raise exception 'INTERVIEW_ANSWER_INVALID' using errcode='22023'; end if;
    v_fact_id:=nullif(btrim(p_fact->>'id'),''); v_field:=nullif(btrim(p_fact->>'fieldKey'),''); v_value:=nullif(btrim(p_fact->>'value'),'');
    if v_fact_id is null or v_field is null or not v_field=any(v_allowed_fields) or v_value is null or char_length(v_value)>800
      or array_length(regexp_split_to_array(v_value,E'\r?\n'),1)>8
      then raise exception 'INTERVIEW_FACT_INVALID' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(p_fact) as item(key) where not key=any(array['id','fieldKey','label','value']::text[]))
      or p_fact ?| array['tenantId','credential','secret','token','document','reasoning','transcript']
      or v_value ~* '(password|passcode|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|authorization|bearer|private[ _-]?key|client[ _-]?secret|session[ _-]?(cookie|token))[[:space:]]*[:=]'
      or v_value ~ '-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}'
      then raise exception 'INTERVIEW_SENSITIVE_FACT_REJECTED' using errcode='22023'; end if;
    select coalesce(jsonb_agg(item order by ord),'[]'::jsonb) into v_facts from (
      select item,ord from jsonb_array_elements(v_facts) with ordinality x(item,ord) where item->>'id'<>v_fact_id
      union all select jsonb_build_object('id',v_fact_id,'canonicalOwner','settings.setup.business_brief','fieldKey',v_field,
        'label',left(coalesce(nullif(p_fact->>'label',''),v_field),120),'value',v_value,'provenance','owner_statement','state','proposed'),2147483647::bigint
    ) q;
  elsif p_event='pause' then v_next_status:='paused';
  elsif p_event='resume' then v_next_status:='active';
  elsif p_event='recap' then v_next_status:='recap';
  elsif p_event='skip' then v_next_status:='skipped';
  elsif p_event='end' then v_next_status:='ended';
  else raise exception 'INTERVIEW_EVENT_INVALID' using errcode='22023'; end if;
  if v_next_status in ('skipped','ended') then v_facts:='[]'::jsonb; end if;
  update public.paige_intentful_interview_sessions set proposed_facts=v_facts,status=v_next_status,step_key=left(p_step_key,80),
    revision=revision+1,updated_at=clock_timestamp(),completed_at=case when v_next_status in ('skipped','ended') then clock_timestamp() else null end
    where id=v_session.id returning * into v_session;
  return jsonb_build_object('id',v_session.id,'threadId',v_session.thread_id,'entrySource',v_session.entry_source,
    'focusPath',v_session.focus_path,'status',v_session.status,'stepKey',v_session.step_key,'revision',v_session.revision,
    'proposedFacts',v_session.proposed_facts,'updatedAt',v_session.updated_at);
end $$;
revoke all on function public.update_paige_intentful_interview(uuid,integer,text,text,jsonb) from public, anon;
grant execute on function public.update_paige_intentful_interview(uuid,integer,text,text,jsonb) to authenticated;

create or replace function public.confirm_paige_intentful_interview_facts(
  p_session_id uuid,p_expected_revision integer,p_selected_ids text[]
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_user_tenant_id(); v_actor uuid := auth.uid();
  v_session public.paige_intentful_interview_sessions%rowtype; v_context jsonb; v_current jsonb; v_full jsonb:='{}'::jsonb; v_saved jsonb; v_expected_updated_at text;
  v_key text; v_verified boolean:=true; v_selected jsonb;
  v_allowed_keys constant text[]:=array['legalName','publicName','dbaName','website','address','phone','industry','naicsCode','sicCode',
    'offers','deliveryModel','idealCustomer','customerSegments','serviceArea','currentPriority','goals90Day','annualDirection',
    'successDefinition','constraints','brandVoice','operatingPreferences','doNotAssume'];
begin
  if v_actor is null or v_tenant is null then raise exception 'INTERVIEW_ACTIVE_ACCOUNT_REQUIRED' using errcode='42501'; end if;
  select * into v_session from public.paige_intentful_interview_sessions s
    where s.id=p_session_id and s.tenant_id=v_tenant and s.owner_user_id=v_actor for update;
  if not found then raise exception 'INTERVIEW_NOT_FOUND' using errcode='P0002'; end if;
  perform 1 from public.paige_interview_assert_thread(v_session.thread_id);
  if v_session.status<>'recap' then raise exception 'INTERVIEW_RECAP_REQUIRED' using errcode='22023'; end if;
  if v_session.revision<>p_expected_revision then raise exception 'INTERVIEW_REVISION_CONFLICT' using errcode='40001'; end if;
  if coalesce(array_length(p_selected_ids,1),0)=0 then raise exception 'INTERVIEW_SELECT_FACTS' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_selected_ids) id where not exists(
    select 1 from jsonb_array_elements(v_session.proposed_facts) f where f->>'id'=id and f->>'state'='proposed'))
    then raise exception 'INTERVIEW_SELECTION_INVALID' using errcode='22023'; end if;
  v_context:=public.get_solo_setup_context();
  if v_context is null or v_context->>'accessScope'<>'owner_full' then
    raise exception 'INTERVIEW_OWNER_REQUIRED' using errcode='42501';
  end if;
  v_current:=coalesce(v_context->'brief','{}'::jsonb);
  v_expected_updated_at:=nullif(v_current->>'updatedAt','');
  foreach v_key in array v_allowed_keys loop v_full:=v_full||jsonb_build_object(v_key,coalesce(v_current->>v_key,'')); end loop;
  v_full:=v_full||jsonb_build_object('representativeUserIds',coalesce(v_current->'representativeUserIds','[]'::jsonb));
  select coalesce(jsonb_agg(f),'[]'::jsonb) into v_selected from jsonb_array_elements(v_session.proposed_facts) f where f->>'id'=any(p_selected_ids);
  for v_key in select f->>'fieldKey' from jsonb_array_elements(v_selected) f loop
    v_full:=v_full||jsonb_build_object(v_key,(select f->>'value' from jsonb_array_elements(v_selected) f where f->>'fieldKey'=v_key limit 1));
  end loop;
  v_saved:=public.save_solo_business_brief(v_full,v_expected_updated_at,null);
  for v_key in select f->>'fieldKey' from jsonb_array_elements(v_selected) f loop
    if v_saved->>v_key is distinct from (select f->>'value' from jsonb_array_elements(v_selected) f where f->>'fieldKey'=v_key limit 1)
      then v_verified:=false; end if;
  end loop;
  if not v_verified then raise exception 'INTERVIEW_READBACK_MISMATCH' using errcode='40001'; end if;
  perform public.record_capability_run(v_tenant,v_actor,'business_brief_confirmed_fact','capability_succeeded',v_session.id,'paige');
  update public.paige_intentful_interview_sessions set status='completed',revision=revision+1,completed_at=clock_timestamp(),updated_at=clock_timestamp(),
    proposed_facts=(select jsonb_agg((f-'value')||jsonb_build_object('state',case when f->>'id'=any(p_selected_ids) then 'confirmed' else 'declined' end))
      from jsonb_array_elements(proposed_facts) f) where id=v_session.id returning * into v_session;
  return jsonb_build_object('ok',true,'verified',true,'status','completed','revision',v_session.revision,
    'canonicalOwner','settings.setup.business_brief','selectedIds',to_jsonb(p_selected_ids),'railRecorded',true,
    'receipt',jsonb_build_object('action','solo_setup.owner_saved','canonicalOwner','Paige Brief','selectedCount',coalesce(array_length(p_selected_ids,1),0),'verifiedAt',clock_timestamp(),'railRecorded',true));
end $$;
revoke all on function public.confirm_paige_intentful_interview_facts(uuid,integer,text[]) from public, anon;
grant execute on function public.confirm_paige_intentful_interview_facts(uuid,integer,text[]) to authenticated;

-- Discussion Needed extends the Action Bus and stores only canonical locators.
insert into public.paige_action_kinds(slug,label,description,default_from_department,default_to_department,executor,
  requires_approval,approval_type,draft_subagent_slug,default_autonomy_lane,default_priority)
values('owner.discussion_needed','Discussion needed','A canonical owner decision is needed before useful work can continue.',
  'owner_ops','owner_ops','record_only',false,'other',null,'confirm','normal')
on conflict(slug) do update set enabled=true;

create unique index if not exists paige_discussion_topic_open
  on public.paige_actions(tenant_id,(payload->>'topic_key'))
  where action_kind='owner.discussion_needed' and status in ('filed','assigned','blocked');

create or replace function public.get_business_mission_discussion(p_mission_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid:=public.current_user_tenant_id(); v_actor uuid:=auth.uid(); v_mission record;
  v_missing jsonb; v_topic text; v_action public.paige_actions%rowtype;
begin
  if v_actor is null or v_tenant is null or not (public.solo_setup_access_scope()='owner_full') then return null; end if;
  select m.id,m.title,m.revision,b.missing_information into v_mission
    from public.business_missions m join public.business_mission_briefs b on b.id=m.current_brief_id
    where m.id=p_mission_id and m.tenant_id=v_tenant and m.state not in ('completed','stopped');
  if not found then return null; end if;
  v_missing:=coalesce(to_jsonb(v_mission.missing_information),'[]'::jsonb);
  if jsonb_typeof(v_missing)<>'array' or jsonb_array_length(v_missing)=0 then
    update public.paige_actions set status='done',resolved_at=clock_timestamp(),result=jsonb_build_object('reason','canonical_source_resolved')
      where tenant_id=v_tenant and action_kind='owner.discussion_needed' and payload->>'source_id'=p_mission_id::text
        and status in ('filed','assigned','blocked');
    return null;
  end if;
  v_topic:='business_mission:'||p_mission_id::text||':missing_information';
  if exists(select 1 from public.paige_actions where tenant_id=v_tenant and action_kind='owner.discussion_needed'
    and payload->>'topic_key'=v_topic and status='dismissed' and result->>'suppressed'='true') then return null; end if;
  select * into v_action from public.paige_actions where tenant_id=v_tenant and action_kind='owner.discussion_needed'
    and payload->>'topic_key'=v_topic and status in ('filed','assigned','blocked') order by filed_at desc limit 1 for update;
  if v_action.id is null then
    insert into public.paige_actions(tenant_id,action_kind,from_department,to_department,title,summary,payload,status,priority,autonomy_lane,created_by,created_by_agent,due_at)
    values(v_tenant,'owner.discussion_needed','owner_ops','owner_ops','Decision needed for '||left(v_mission.title,180),
      'Missing information is preventing a complete strategic plan.',
      jsonb_build_object('topic_key',v_topic,'surface','business_game_plan','reason_code','missing_context','source_kind','business_mission','source_id',p_mission_id),
      'blocked','normal','confirm',v_actor,'paige',clock_timestamp()) returning * into v_action;
  end if;
  if v_action.due_at is not null and v_action.due_at>clock_timestamp() then return null; end if;
  return jsonb_build_object('id',v_action.id,'title',v_action.title,'reason','Missing information is preventing a complete strategic plan.',
    'decision',v_missing->>0,'sourceRevision',v_mission.revision,'surface','business_game_plan');
end $$;
revoke all on function public.get_business_mission_discussion(uuid) from public, anon;
grant execute on function public.get_business_mission_discussion(uuid) to authenticated;

create or replace function public.respond_to_business_mission_discussion(p_action_id uuid,p_response text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid:=public.current_user_tenant_id(); v_actor uuid:=auth.uid(); v_action public.paige_actions%rowtype;
begin
  if v_actor is null or v_tenant is null or not (public.solo_setup_access_scope()='owner_full')
    then raise exception 'DISCUSSION_OWNER_REQUIRED' using errcode='42501'; end if;
  if p_response not in ('talk_now','later','dont_ask_again') then raise exception 'DISCUSSION_RESPONSE_INVALID' using errcode='22023'; end if;
  select * into v_action from public.paige_actions where id=p_action_id and tenant_id=v_tenant
    and action_kind='owner.discussion_needed' and status in ('filed','assigned','blocked') for update;
  if not found then raise exception 'DISCUSSION_NOT_FOUND' using errcode='P0002'; end if;
  if p_response='later' then
    update public.paige_actions set due_at=clock_timestamp()+interval '7 days',decision_rationale='Owner chose Later.',updated_at=clock_timestamp() where id=v_action.id;
  elsif p_response='dont_ask_again' then
    update public.paige_actions set status='dismissed',resolved_at=clock_timestamp(),decision_rationale='Owner chose Don''t ask again for this topic.',
      result=jsonb_build_object('suppressed',true,'topic_key',v_action.payload->>'topic_key'),updated_at=clock_timestamp() where id=v_action.id;
  else
    update public.paige_actions set decision_rationale='Owner chose Talk now.',updated_at=clock_timestamp() where id=v_action.id;
  end if;
  insert into public.audit_logs(user_id,entity,action,entity_id,data)
    values(v_actor,'paige_action','discussion_'||p_response,v_action.id,jsonb_build_object('tenant_id',v_tenant,'topic_key',v_action.payload->>'topic_key'));
  return jsonb_build_object('ok',true,'actionId',v_action.id,'response',p_response,'sourceId',v_action.payload->>'source_id');
end $$;
revoke all on function public.respond_to_business_mission_discussion(uuid,text) from public, anon;
grant execute on function public.respond_to_business_mission_discussion(uuid,text) to authenticated;

comment on table public.paige_intentful_interview_sessions is
  'Thread-bound workflow state for the optional text Business Working Interview. Not Mind, Memory, canonical business truth, or a transcript store.';
comment on function public.confirm_paige_intentful_interview_facts(uuid,integer,text[]) is
  'Owner-confirmed selective recap writer. Accepts proposal ids only, reuses canonical Setup save, verifies readback, and never accepts replacement values.';

commit;
