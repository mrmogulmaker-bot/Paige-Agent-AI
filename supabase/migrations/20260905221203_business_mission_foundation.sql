-- Phase 2: private, owner-side Business Mission foundation.
-- Explicitly excludes Rail, workers, Promise, Client Engagement, portal, and execution authority.

create table public.business_missions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  request_source text not null check (request_source in ('owner_ui','paige_chat')),
  request_thread_id uuid references public.paige_chat_threads(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 180),
  lifecycle_state text not null default 'proposed' check (lifecycle_state in ('proposed','active','blocked','paused','completed','stopped')),
  state_reason text check (state_reason is null or char_length(state_reason)<=1200),
  next_action text check (next_action is null or char_length(next_action)<=1200),
  closure_outcome text check (closure_outcome is null or closure_outcome in ('achieved','partly_achieved','blocked','stopped')),
  outcome_summary text check (outcome_summary is null or char_length(outcome_summary)<=4000),
  outcome_unknowns text check (outcome_unknowns is null or char_length(outcome_unknowns)<=4000),
  revision integer not null default 1 check (revision>0),
  paused_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id),
  check ((lifecycle_state in ('completed','stopped') and closed_at is not null and closure_outcome is not null and outcome_summary is not null)
    or (lifecycle_state not in ('completed','stopped') and closed_at is null and closure_outcome is null and outcome_summary is null and outcome_unknowns is null)),
  check ((lifecycle_state='paused' and paused_at is not null) or lifecycle_state<>'paused')
);
create index business_missions_portfolio_idx on public.business_missions(tenant_id,lifecycle_state,updated_at desc);

create or replace function public.business_mission_text_array_valid(p_values text[],p_max_count integer,p_max_length integer)
returns boolean language sql immutable set search_path='' as $$
  select p_values is not null and cardinality(p_values)<=p_max_count
    and not exists(select 1 from unnest(p_values) v where v is null or btrim(v)='' or char_length(v)>p_max_length)
$$;

create table public.business_mission_brief_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  mission_id uuid not null,
  version integer not null check (version>0),
  desired_outcome text not null check (char_length(btrim(desired_outcome)) between 3 and 2000),
  deadline_on date,
  baseline text not null check (char_length(btrim(baseline)) between 1 and 4000),
  strategy text not null check (char_length(btrim(strategy)) between 1 and 6000),
  constraints text[] not null default '{}' check (public.business_mission_text_array_valid(constraints,30,600)),
  success_definition text not null check (char_length(btrim(success_definition)) between 1 and 3000),
  owner_authority text not null check (char_length(btrim(owner_authority)) between 1 and 3000),
  assumptions text[] not null default '{}' check (public.business_mission_text_array_valid(assumptions,30,600)),
  missing_information text[] not null default '{}' check (public.business_mission_text_array_valid(missing_information,30,600)),
  revision_reason text not null check (char_length(btrim(revision_reason)) between 1 and 1200),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id,mission_id,version),
  foreign key (tenant_id,mission_id) references public.business_missions(tenant_id,id) on delete cascade
);
create index business_mission_brief_latest_idx on public.business_mission_brief_versions(tenant_id,mission_id,version desc);

create table public.business_mission_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  operation text not null check (operation in ('create','revise','transition')),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{32}$'),
  mission_id uuid,
  result jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id,actor_user_id,request_key),
  foreign key (tenant_id,mission_id) references public.business_missions(tenant_id,id) on delete cascade
);
create index business_mission_receipts_mission_idx on public.business_mission_mutation_receipts(tenant_id,mission_id,created_at desc);

create or replace function public.prevent_business_mission_brief_mutation() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'MISSION_BRIEF_IMMUTABLE' using errcode='55000'; end $$;
create trigger business_mission_brief_immutable before update or delete on public.business_mission_brief_versions
for each row execute function public.prevent_business_mission_brief_mutation();

alter table public.business_missions enable row level security;
alter table public.business_mission_brief_versions enable row level security;
alter table public.business_mission_mutation_receipts enable row level security;
revoke all on public.business_missions,public.business_mission_brief_versions,public.business_mission_mutation_receipts from public,anon,authenticated;
grant all on public.business_missions,public.business_mission_brief_versions,public.business_mission_mutation_receipts to service_role;

create or replace function public.business_mission_owner_context() returns table(actor_id uuid,tenant_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare a uuid:=auth.uid(); t uuid;
begin
  if a is null then raise exception 'MISSION_UNAUTHENTICATED' using errcode='42501'; end if;
  t:=public.current_user_tenant_id();
  if t is null or not exists(select 1 from public.tenants x
    where x.id=t and x.account_type='standalone' and x.parent_tenant_id is null and public.is_tenant_owner(a,t))
    then raise exception 'MISSION_OWNER_REQUIRED' using errcode='42501'; end if;
  return query select a,t;
end $$;
revoke all on function public.business_mission_owner_context() from public,anon,authenticated;

create or replace function public.create_business_mission(p_request_key uuid,p_title text,p_desired_outcome text,p_deadline_on date,p_baseline text,p_strategy text,
  p_constraints text[] default '{}',p_success_definition text default '',p_owner_authority text default '',p_assumptions text[] default '{}',
  p_missing_information text[] default '{}',p_next_action text default null,p_request_source text default 'owner_ui',p_request_thread_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid;t uuid;m public.business_missions%rowtype;h text;j jsonb;r public.business_mission_mutation_receipts%rowtype;answer jsonb;
begin
  select c.actor_id,c.tenant_id into a,t from public.business_mission_owner_context() c;
  if p_request_key is null then raise exception 'MISSION_REQUEST_KEY_REQUIRED' using errcode='22023'; end if;
  if p_request_source not in ('owner_ui','paige_chat') then raise exception 'MISSION_BAD_SOURCE' using errcode='22023'; end if;
  if (p_request_source='owner_ui' and p_request_thread_id is not null) or (p_request_source='paige_chat' and p_request_thread_id is null) then raise exception 'MISSION_SOURCE_CONTEXT_INVALID' using errcode='22023'; end if;
  if p_request_thread_id is not null and not exists(select 1 from public.paige_chat_threads ct where ct.id=p_request_thread_id and ct.tenant_id=t and ct.caller_user_id=a and ct.lens='coach' and ct.contact_id is null) then raise exception 'MISSION_THREAD_CONTEXT_INVALID' using errcode='42501'; end if;
  if p_deadline_on is not null and p_deadline_on<current_date then raise exception 'MISSION_DEADLINE_IN_PAST' using errcode='22023'; end if;
  j:=jsonb_build_object('title',btrim(coalesce(p_title,'')),'desired_outcome',btrim(coalesce(p_desired_outcome,'')),'deadline_on',p_deadline_on,
    'baseline',btrim(coalesce(p_baseline,'')),'strategy',btrim(coalesce(p_strategy,'')),'constraints',coalesce(p_constraints,'{}'),
    'success_definition',btrim(coalesce(p_success_definition,'')),'owner_authority',btrim(coalesce(p_owner_authority,'')),
    'assumptions',coalesce(p_assumptions,'{}'),'missing_information',coalesce(p_missing_information,'{}'),'next_action',nullif(btrim(coalesce(p_next_action,'')),''),
    'request_source',p_request_source,'request_thread_id',p_request_thread_id);h:=md5(j::text);
  insert into public.business_mission_mutation_receipts(tenant_id,actor_user_id,request_key,operation,payload_hash) values(t,a,p_request_key,'create',h) on conflict do nothing;
  if not found then
    select * into r from public.business_mission_mutation_receipts x where x.tenant_id=t and x.actor_user_id=a and x.request_key=p_request_key for update;
    if r.operation<>'create' or r.payload_hash<>h then raise exception 'MISSION_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    if r.result is null then raise exception 'MISSION_REQUEST_INCOMPLETE' using errcode='40001'; end if;
    return r.result||jsonb_build_object('replayed',true);
  end if;

  insert into public.business_missions(tenant_id,requested_by,request_source,request_thread_id,title,next_action)
    values(t,a,p_request_source,p_request_thread_id,btrim(p_title),nullif(btrim(coalesce(p_next_action,'')),'')) returning * into m;
  insert into public.business_mission_brief_versions(tenant_id,mission_id,version,desired_outcome,deadline_on,baseline,strategy,constraints,success_definition,
    owner_authority,assumptions,missing_information,revision_reason,created_by)
    values(t,m.id,1,btrim(p_desired_outcome),p_deadline_on,btrim(p_baseline),btrim(p_strategy),coalesce(p_constraints,'{}'),btrim(p_success_definition),
    btrim(p_owner_authority),coalesce(p_assumptions,'{}'),coalesce(p_missing_information,'{}'),'Initial mission brief',a);
  answer:=jsonb_build_object('ok',true,'mission_id',m.id,'revision',1,'state','proposed','replayed',false);
  update public.business_mission_mutation_receipts set mission_id=m.id,result=answer where tenant_id=t and actor_user_id=a and request_key=p_request_key;
  insert into public.paige_audit_log(tenant_id,actor_user_id,actor_role,action,target_type,target_id,payload) values(t,a,'owner','business_mission.created','business_mission',m.id,jsonb_build_object('revision',1,'state','proposed','request_source',p_request_source));
  return answer;
end $$;

create or replace function public.revise_business_mission_brief(p_mission_id uuid,p_expected_revision integer,p_request_key uuid,p_desired_outcome text,p_deadline_on date,
  p_baseline text,p_strategy text,p_constraints text[],p_success_definition text,p_owner_authority text,p_assumptions text[],p_missing_information text[],
  p_revision_reason text,p_title text default null,p_next_action text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid;t uuid;m public.business_missions%rowtype;h text;j jsonb;n integer;r public.business_mission_mutation_receipts%rowtype;answer jsonb;
begin
  select c.actor_id,c.tenant_id into a,t from public.business_mission_owner_context() c;
  if p_request_key is null then raise exception 'MISSION_REQUEST_KEY_REQUIRED' using errcode='22023'; end if;
  if p_expected_revision is null or p_expected_revision<1 then raise exception 'MISSION_EXPECTED_REVISION_REQUIRED' using errcode='22023'; end if;
  if p_deadline_on is not null and p_deadline_on<current_date then raise exception 'MISSION_DEADLINE_IN_PAST' using errcode='22023'; end if;
  j:=jsonb_build_object('mission_id',p_mission_id,'expected_revision',p_expected_revision,'desired_outcome',btrim(coalesce(p_desired_outcome,'')),'deadline_on',p_deadline_on,'baseline',btrim(coalesce(p_baseline,'')),
    'strategy',btrim(coalesce(p_strategy,'')),'constraints',coalesce(p_constraints,'{}'),'success_definition',btrim(coalesce(p_success_definition,'')),
    'owner_authority',btrim(coalesce(p_owner_authority,'')),'assumptions',coalesce(p_assumptions,'{}'),'missing_information',coalesce(p_missing_information,'{}'),
    'revision_reason',btrim(coalesce(p_revision_reason,'')),'title',nullif(btrim(coalesce(p_title,'')),''),'next_action',nullif(btrim(coalesce(p_next_action,'')),''));h:=md5(j::text);
  insert into public.business_mission_mutation_receipts(tenant_id,actor_user_id,request_key,operation,payload_hash) values(t,a,p_request_key,'revise',h) on conflict do nothing;
  if not found then
    select * into r from public.business_mission_mutation_receipts x where x.tenant_id=t and x.actor_user_id=a and x.request_key=p_request_key for update;
    if r.operation<>'revise' or r.payload_hash<>h then raise exception 'MISSION_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    if r.result is null then raise exception 'MISSION_REQUEST_INCOMPLETE' using errcode='40001'; end if;
    return r.result||jsonb_build_object('replayed',true);
  end if;
  select * into m from public.business_missions x where x.tenant_id=t and x.id=p_mission_id for update;
  if not found then raise exception 'MISSION_NOT_FOUND' using errcode='P0002'; end if;
  if m.revision is distinct from p_expected_revision then raise exception 'MISSION_REVISION_CONFLICT' using errcode='40001'; end if;
  if m.lifecycle_state in ('completed','stopped') then raise exception 'MISSION_CLOSED' using errcode='22023'; end if;n:=m.revision+1;
  insert into public.business_mission_brief_versions(tenant_id,mission_id,version,desired_outcome,deadline_on,baseline,strategy,constraints,success_definition,
    owner_authority,assumptions,missing_information,revision_reason,created_by)
    values(t,p_mission_id,n,btrim(p_desired_outcome),p_deadline_on,btrim(p_baseline),btrim(p_strategy),coalesce(p_constraints,'{}'),btrim(p_success_definition),
    btrim(p_owner_authority),coalesce(p_assumptions,'{}'),coalesce(p_missing_information,'{}'),btrim(p_revision_reason),a);
  update public.business_missions set title=coalesce(nullif(btrim(coalesce(p_title,'')),''),title),next_action=coalesce(nullif(btrim(coalesce(p_next_action,'')),''),next_action),revision=n,updated_at=now() where tenant_id=t and id=p_mission_id;
  answer:=jsonb_build_object('ok',true,'mission_id',p_mission_id,'revision',n,'state',m.lifecycle_state,'replayed',false);
  update public.business_mission_mutation_receipts set mission_id=p_mission_id,result=answer where tenant_id=t and actor_user_id=a and request_key=p_request_key;
  insert into public.paige_audit_log(tenant_id,actor_user_id,actor_role,action,target_type,target_id,payload) values(t,a,'owner','business_mission.brief_revised','business_mission',p_mission_id,jsonb_build_object('revision',n,'previous_revision',m.revision));
  return answer;
end $$;

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
  if not ((m.lifecycle_state='proposed' and p_to_state in ('active','stopped')) or (m.lifecycle_state='active' and p_to_state in ('blocked','paused','completed','stopped'))
    or (m.lifecycle_state='blocked' and p_to_state in ('active','paused','completed','stopped')) or (m.lifecycle_state='paused' and p_to_state in ('active','completed','stopped')))
    then raise exception 'MISSION_INVALID_TRANSITION' using errcode='22023';end if;
  if p_to_state in ('completed','stopped') and (p_closure_outcome is null or nullif(btrim(coalesce(p_outcome_summary,'')),'') is null)
    then raise exception 'MISSION_OUTCOME_REQUIRED' using errcode='22023';end if;
  if p_to_state='completed' and p_closure_outcome not in ('achieved','partly_achieved','blocked') then raise exception 'MISSION_BAD_OUTCOME' using errcode='22023';end if;
  if p_to_state='stopped' and p_closure_outcome<>'stopped' then raise exception 'MISSION_BAD_OUTCOME' using errcode='22023';end if;n:=m.revision+1;
  update public.business_missions set lifecycle_state=p_to_state,state_reason=nullif(btrim(coalesce(p_reason,'')),''),revision=n,
    paused_at=case when p_to_state='paused' then now() else null end,closed_at=case when p_to_state in ('completed','stopped') then now() else null end,
    closure_outcome=case when p_to_state in ('completed','stopped') then p_closure_outcome else null end,
    outcome_summary=case when p_to_state in ('completed','stopped') then btrim(p_outcome_summary) else null end,
    outcome_unknowns=case when p_to_state in ('completed','stopped') then nullif(btrim(coalesce(p_outcome_unknowns,'')),'') else null end,updated_at=now()
    where tenant_id=t and id=p_mission_id;
  answer:=jsonb_build_object('ok',true,'mission_id',p_mission_id,'revision',n,'state',p_to_state,'replayed',false);
  update public.business_mission_mutation_receipts set mission_id=p_mission_id,result=answer where tenant_id=t and actor_user_id=a and request_key=p_request_key;
  insert into public.paige_audit_log(tenant_id,actor_user_id,actor_role,action,target_type,target_id,payload) values(t,a,'owner','business_mission.transitioned','business_mission',p_mission_id,jsonb_build_object('from_state',m.lifecycle_state,'to_state',p_to_state,'revision',n,'closure_outcome',p_closure_outcome));
  return answer;
end $$;

create or replace function public.list_business_missions(p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid;t uuid;r jsonb;begin select c.actor_id,c.tenant_id into a,t from public.business_mission_owner_context() c;
  select coalesce(jsonb_agg(x order by (x->>'updated_at')::timestamptz desc),'[]'::jsonb) into r from(select jsonb_build_object('id',m.id,'title',m.title,'state',m.lifecycle_state,
    'state_reason',m.state_reason,'next_action',m.next_action,'revision',m.revision,'created_at',m.created_at,'updated_at',m.updated_at,'deadline_on',b.deadline_on,
    'desired_outcome',b.desired_outcome,'success_definition',b.success_definition,'brief_version',b.version,'closure_outcome',m.closure_outcome,'outcome_summary',m.outcome_summary) x
    from public.business_missions m join lateral(select v.* from public.business_mission_brief_versions v where v.tenant_id=m.tenant_id and v.mission_id=m.id order by v.version desc limit 1)b on true
    where m.tenant_id=t order by m.updated_at desc limit greatest(1,least(coalesce(p_limit,50),100)))q;
  return jsonb_build_object('missions',r,'resolved_tenant_id',t);end $$;

create or replace function public.get_business_mission(p_mission_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid;t uuid;r jsonb;begin select c.actor_id,c.tenant_id into a,t from public.business_mission_owner_context() c;
  select jsonb_build_object('mission',jsonb_build_object('id',m.id,'title',m.title,'state',m.lifecycle_state,'state_reason',m.state_reason,'next_action',m.next_action,'revision',m.revision,'created_at',m.created_at,'updated_at',m.updated_at,'closure_outcome',m.closure_outcome,'outcome_summary',m.outcome_summary,'outcome_unknowns',m.outcome_unknowns,'request_source',m.request_source,'request_thread_id',m.request_thread_id),
    'brief',to_jsonb(b)-'tenant_id'-'mission_id'-'created_by') into r
    from public.business_missions m join lateral(select v.* from public.business_mission_brief_versions v where v.tenant_id=m.tenant_id and v.mission_id=m.id order by v.version desc limit 1)b on true
    where m.tenant_id=t and m.id=p_mission_id;if r is null then raise exception 'MISSION_NOT_FOUND' using errcode='P0002';end if;return r;end $$;

revoke all on function public.business_mission_text_array_valid(text[],integer,integer) from public,anon,authenticated;
revoke all on function public.prevent_business_mission_brief_mutation() from public,anon,authenticated;
revoke all on function public.create_business_mission(uuid,text,text,date,text,text,text[],text,text,text[],text[],text,text,uuid) from public,anon;
revoke all on function public.revise_business_mission_brief(uuid,integer,uuid,text,date,text,text,text[],text,text,text[],text[],text,text,text) from public,anon;
revoke all on function public.transition_business_mission(uuid,integer,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.list_business_missions(integer) from public,anon;
revoke all on function public.get_business_mission(uuid) from public,anon;
grant execute on function public.create_business_mission(uuid,text,text,date,text,text,text[],text,text,text[],text[],text,text,uuid) to authenticated;
grant execute on function public.revise_business_mission_brief(uuid,integer,uuid,text,date,text,text,text[],text,text,text[],text[],text,text,text) to authenticated;
grant execute on function public.transition_business_mission(uuid,integer,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.list_business_missions(integer) to authenticated;
grant execute on function public.get_business_mission(uuid) to authenticated;

comment on table public.business_missions is 'Owner-private, tenant-owned Business Mission identity and lifecycle. No client visibility or execution authority.';
comment on table public.business_mission_brief_versions is 'Immutable Mission Brief revisions: what was known and intended at that time.';
comment on table public.business_mission_mutation_receipts is 'Atomic owner-scoped idempotency receipts for replay-safe Mission writes.';
