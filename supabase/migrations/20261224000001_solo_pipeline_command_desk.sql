-- Solo Pipeline Command Desk: durable creation, editing, movement and outcomes.
-- Pipelines and stages remain tenant-defined. Stage labels never invent business outcomes.

create table if not exists public.pipeline_deal_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  deal_id uuid not null references public.deals(id) on delete cascade,
  outcome_type text not null check (outcome_type in ('won','lost','not_fit','closed_without_decision','reopened')),
  reason text,
  notes text,
  outcome_date date not null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_through text not null default 'owner' check (created_through in ('owner','team_member','paige','approved_automation')),
  created_at timestamptz not null default now()
);
create index if not exists pipeline_deal_outcomes_deal_idx on public.pipeline_deal_outcomes(deal_id,created_at desc);
create index if not exists pipeline_deal_outcomes_tenant_pipeline_idx on public.pipeline_deal_outcomes(tenant_id,pipeline_id,created_at desc);
alter table public.pipeline_deal_outcomes enable row level security;
revoke all on public.pipeline_deal_outcomes from public,anon,authenticated;
grant all on public.pipeline_deal_outcomes to service_role;

alter function public.configure_tenant_pipeline_core_identity(uuid,jsonb,text,text) rename to configure_tenant_pipeline_core_identity_pre_command_desk;
revoke all on function public.configure_tenant_pipeline_core_identity_pre_command_desk(uuid,jsonb,text,text) from public,anon,authenticated;

-- Active stage automations can produce external side effects. This bounded MVP
-- fails closed until the UI can bind a preview to an immutable rule revision.
-- The table lock prevents a rule from being inserted or activated between this
-- check and the stage-change trigger in the same transaction.
create or replace function public.assert_pipeline_automation_not_active(
  _tenant_id uuid, _pipeline_id uuid, _from_stage_id uuid, _to_stage_id uuid
) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  lock table public.stage_automation_rules in share mode;
  if exists(
    select 1 from public.stage_automation_rules r
    where r.tenant_id=_tenant_id and r.pipeline_id=_pipeline_id
      and r.to_stage_id=_to_stage_id
      and (r.from_stage_id=_from_stage_id or r.from_stage_id is null)
      and r.is_active
  ) then
    raise exception 'PIPELINE_AUTOMATION_BINDING_REQUIRED' using errcode='22023';
  end if;
end$$;
revoke all on function public.assert_pipeline_automation_not_active(uuid,uuid,uuid,uuid) from public,anon,authenticated;
create or replace function public.configure_tenant_pipeline_core_identity(
  _tenant_id uuid,_command jsonb,_idempotency_key text,_actor_kind text default 'human'
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  _caller uuid:=auth.uid(); _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id());
  _action text:=replace(coalesce(_command->>'type',''),'-','_');
  _hash text:=md5(coalesce(_command,'{}'::jsonb)::text);
  _cached public.pipeline_command_results%rowtype; _pipeline public.pipelines%rowtype;
  _deal public.deals%rowtype; _from_stage public.pipeline_stages%rowtype; _stage public.pipeline_stages%rowtype;
  _result jsonb; _id uuid; _outcome text; _reason text; _outcome_date date; _through text;
begin
  if _action not in ('create_deal','update_deal','move_deal','record_outcome','reopen_deal') then return public.configure_tenant_pipeline_core_identity_pre_command_desk(_tenant_id,_command,_idempotency_key,_actor_kind); end if;
  if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant=public.current_user_tenant_id()) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if _actor_kind not in ('human','paige') then raise exception 'PIPELINE_ACTOR_INVALID' using errcode='22023'; end if;
  if _actor_kind='paige' then raise exception 'PIPELINE_GOVERNED_EXECUTOR_REQUIRED' using errcode='42501'; end if;
  if _command is null or jsonb_typeof(_command)<>'object' or coalesce(btrim(_idempotency_key),'')='' or length(_idempotency_key)>200 then raise exception 'PIPELINE_COMMAND_INVALID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pipeline-command:'||_tenant::text||':'||_idempotency_key,0));
  select * into _cached from public.pipeline_command_results where tenant_id=_tenant and idempotency_key=_idempotency_key for update;
  if found then
    if _cached.command_hash is distinct from _hash or _cached.actor_user_id is distinct from _caller or _cached.actor_kind is distinct from _actor_kind then raise exception 'PIPELINE_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
    return _cached.result||jsonb_build_object('replayed',true);
  end if;
  _through:=case when _actor_kind='paige' then 'paige' when exists(select 1 from public.tenants t where t.id=_tenant and t.owner_user_id=_caller) then 'owner' else 'team_member' end;

  if _action='create_deal' then
    if coalesce(btrim(_command->>'title'),'')='' then raise exception 'PIPELINE_DEAL_TITLE_REQUIRED' using errcode='22023'; end if;
    select * into _pipeline from public.pipelines where id=(_command->>'pipelineId')::uuid and tenant_id=_tenant and lifecycle_status<>'archived' for update;
    if not found then raise exception 'PIPELINE_NOT_FOUND' using errcode='22023'; end if;
    select * into _stage from public.pipeline_stages where id=(_command->>'stageId')::uuid and tenant_id=_tenant and pipeline_id=_pipeline.id and archived_at is null for update;
    if not found or _stage.stage_type<>'open' then raise exception 'PIPELINE_OPEN_STAGE_REQUIRED' using errcode='22023'; end if;
    if nullif(_command->>'clientId','') is not null and not exists(select 1 from public.clients c where c.id=(_command->>'clientId')::uuid and c.tenant_id=_tenant) then raise exception 'PIPELINE_CLIENT_INVALID' using errcode='42501'; end if;
    insert into public.deals(title,pipeline_id,stage_id,contact_client_id,owner_user_id,status,source,tags,notes,created_by,tenant_id)
    values(btrim(_command->>'title'),_pipeline.id,_stage.id,nullif(_command->>'clientId','')::uuid,_caller,'open',case when _actor_kind='paige' then 'paige' else 'owner_entered' end,
      coalesce(array(select jsonb_array_elements_text(coalesce(_command->'tags','[]'::jsonb))),array[]::text[]),
      nullif(btrim(_command->>'notes'),''),_caller,_tenant) returning * into _deal;
    insert into public.deal_activities(deal_id,type,summary,actor_user_id,payload)
    values(_deal.id,'created','Deal created in '||_stage.label,_caller,jsonb_build_object('stage_id',_stage.id,'stage_label',_stage.label,'actor_kind',_actor_kind,'idempotency_key',_idempotency_key));
    _result:=jsonb_build_object('ok',true,'outcome','created','deal_id',_deal.id,'pipeline_id',_pipeline.id,'stage_id',_stage.id,'message','Deal created in '||_stage.label||'.');
  else
    select * into _deal from public.deals where id=(_command->>'dealId')::uuid and tenant_id=_tenant for update;
    if not found then raise exception 'PIPELINE_DEAL_NOT_FOUND' using errcode='22023'; end if;
    if _deal.version<>coalesce((_command->>'expectedVersion')::bigint,0) then return jsonb_build_object('ok',false,'outcome','PIPELINE_VERSION_CONFLICT','deal_id',_deal.id,'current_stage_id',_deal.stage_id,'current_version',_deal.version,'message','This deal changed somewhere else. Reload it before trying again.'); end if;
    if _action in ('move_deal','record_outcome') and coalesce(_deal.status,'open')<>'open' then raise exception 'PIPELINE_DEAL_ALREADY_CLOSED' using errcode='22023'; end if;
    if _action='reopen_deal' and coalesce(_deal.status,'open')='open' then raise exception 'PIPELINE_DEAL_ALREADY_OPEN' using errcode='22023'; end if;
    select * into _pipeline from public.pipelines where id=_deal.pipeline_id and tenant_id=_tenant and lifecycle_status<>'archived';
    if not found then raise exception 'PIPELINE_NOT_FOUND' using errcode='22023'; end if;

    if _action='update_deal' then
      if _command ? 'title' and coalesce(btrim(_command->>'title'),'')='' then raise exception 'PIPELINE_DEAL_TITLE_REQUIRED' using errcode='22023'; end if;
      update public.deals set
        title=case when _command ? 'title' then btrim(_command->>'title') else title end,
        tags=case when _command ? 'tags' then coalesce(array(select jsonb_array_elements_text(_command->'tags')),array[]::text[]) else tags end,
        notes=case when _command ? 'notes' then nullif(btrim(_command->>'notes'),'') else notes end,
        updated_at=now() where id=_deal.id returning * into _deal;
      insert into public.deal_activities(deal_id,type,summary,actor_user_id,payload) values(_deal.id,'updated','Deal details updated',_caller,jsonb_build_object('actor_kind',_actor_kind,'idempotency_key',_idempotency_key));
      _result:=jsonb_build_object('ok',true,'outcome','updated','deal_id',_deal.id,'version',_deal.version,'message','Deal details saved.');
    elsif _action='move_deal' then
      select * into _from_stage from public.pipeline_stages where id=_deal.stage_id and tenant_id=_tenant and pipeline_id=_deal.pipeline_id;
      select * into _stage from public.pipeline_stages where id=(_command->>'targetStageId')::uuid and tenant_id=_tenant and pipeline_id=_deal.pipeline_id and archived_at is null for update;
      if not found then raise exception 'PIPELINE_TARGET_INVALID' using errcode='22023'; end if;
      if _stage.id=_from_stage.id then raise exception 'PIPELINE_ALREADY_IN_STAGE' using errcode='22023'; end if;
      if _stage.stage_type in ('won','lost') then
        _result:=jsonb_build_object('ok',false,'outcome','outcome_required','deal_id',_deal.id,'target_stage_id',_stage.id,'suggested_outcome',_stage.stage_type,'message','Record the exact outcome before moving this deal into a closing stage.');
      elsif _stage.move_policy='approval' then
        _result:=jsonb_build_object('ok',false,'outcome','approval_required','deal_id',_deal.id,'current_stage_id',_deal.stage_id,'requested_stage_id',_stage.id,'message','This stage requires the existing PAIGE approval path. No separate Pipeline approval was created, and the deal stayed in '||_from_stage.label||'.');
      else
        perform public.assert_pipeline_automation_not_active(_tenant,_deal.pipeline_id,_deal.stage_id,_stage.id);
        update public.deals set stage_id=_stage.id,status='open',actual_close_date=null,lost_reason=null,updated_at=now() where id=_deal.id returning * into _deal;
        insert into public.deal_activities(deal_id,type,summary,actor_user_id,payload)
        values(_deal.id,'stage_changed','Moved from '||_from_stage.label||' to '||_stage.label,_caller,jsonb_build_object('from_stage_id',_from_stage.id,'from_stage_label',_from_stage.label,'to_stage_id',_stage.id,'to_stage_label',_stage.label,'actor_kind',_actor_kind,'reason',nullif(btrim(_command->>'reason'),''),'idempotency_key',_idempotency_key));
        _result:=jsonb_build_object('ok',true,'outcome','moved','deal_id',_deal.id,'from_stage_id',_from_stage.id,'to_stage_id',_stage.id,'version',_deal.version,'message','Deal moved to '||_stage.label||'.');
      end if;
    elsif _action='record_outcome' then
      _outcome:=_command->>'outcomeType';
      if _outcome not in ('won','lost','not_fit','closed_without_decision') then raise exception 'PIPELINE_OUTCOME_INVALID' using errcode='22023'; end if;
      _reason:=nullif(btrim(_command->>'reason'),'');
      if _outcome<>'won' and _reason is null then raise exception 'PIPELINE_OUTCOME_REASON_REQUIRED' using errcode='22023'; end if;
      _outcome_date:=coalesce(nullif(_command->>'outcomeDate','')::date,current_date);
      if _outcome_date>current_date then raise exception 'PIPELINE_OUTCOME_DATE_INVALID' using errcode='22023'; end if;
      if nullif(_command->>'targetStageId','') is not null then
        select * into _stage from public.pipeline_stages where id=(_command->>'targetStageId')::uuid and tenant_id=_tenant and pipeline_id=_deal.pipeline_id and archived_at is null for update;
        if not found then raise exception 'PIPELINE_TARGET_INVALID' using errcode='22023'; end if;
        if (_outcome='won' and _stage.stage_type<>'won') or (_outcome in ('lost','not_fit','closed_without_decision') and _stage.stage_type<>'lost') then raise exception 'PIPELINE_OUTCOME_STAGE_MISMATCH' using errcode='22023'; end if;
        if _stage.move_policy='approval' then raise exception 'PIPELINE_APPROVAL_REQUIRED' using errcode='42501'; end if;
        perform public.assert_pipeline_automation_not_active(_tenant,_deal.pipeline_id,_deal.stage_id,_stage.id);
      end if;
      insert into public.pipeline_deal_outcomes(tenant_id,pipeline_id,deal_id,outcome_type,reason,notes,outcome_date,recorded_by,created_through)
      values(_tenant,_deal.pipeline_id,_deal.id,_outcome,_reason,nullif(btrim(_command->>'notes'),''),_outcome_date,_caller,_through) returning id into _id;
      update public.deals set stage_id=coalesce(_stage.id,stage_id),status=case when _outcome='won' then 'won' else 'lost' end,
        actual_close_date=_outcome_date,lost_reason=case when _outcome='won' then null else _reason end,updated_at=now()
        where id=_deal.id returning * into _deal;
      insert into public.deal_activities(deal_id,type,summary,actor_user_id,payload)
      values(_deal.id,'outcome_recorded',case _outcome when 'won' then 'Marked won' when 'lost' then 'Marked lost' when 'not_fit' then 'Marked not a fit' else 'Closed without decision' end,_caller,
        jsonb_build_object('outcome_id',_id,'outcome_type',_outcome,'outcome_date',_outcome_date,'reason',_reason,'actor_kind',_actor_kind,'idempotency_key',_idempotency_key));
      _result:=jsonb_build_object('ok',true,'outcome','outcome_recorded','deal_id',_deal.id,'outcome_id',_id,'outcome_type',_outcome,'version',_deal.version,'message','Outcome recorded.');
    else
      select * into _stage from public.pipeline_stages where id=(_command->>'targetStageId')::uuid and tenant_id=_tenant and pipeline_id=_deal.pipeline_id and archived_at is null and stage_type='open' for update;
      if not found then raise exception 'PIPELINE_OPEN_STAGE_REQUIRED' using errcode='22023'; end if;
      if _stage.move_policy='approval' then raise exception 'PIPELINE_APPROVAL_REQUIRED' using errcode='42501'; end if;
      perform public.assert_pipeline_automation_not_active(_tenant,_deal.pipeline_id,_deal.stage_id,_stage.id);
      insert into public.pipeline_deal_outcomes(tenant_id,pipeline_id,deal_id,outcome_type,outcome_date,recorded_by,created_through)
      values(_tenant,_deal.pipeline_id,_deal.id,'reopened',current_date,_caller,_through) returning id into _id;
      update public.deals set stage_id=_stage.id,status='open',actual_close_date=null,lost_reason=null,updated_at=now() where id=_deal.id returning * into _deal;
      insert into public.deal_activities(deal_id,type,summary,actor_user_id,payload)
      values(_deal.id,'reopened','Reopened in '||_stage.label,_caller,jsonb_build_object('outcome_id',_id,'to_stage_id',_stage.id,'to_stage_label',_stage.label,'actor_kind',_actor_kind,'idempotency_key',_idempotency_key));
      _result:=jsonb_build_object('ok',true,'outcome','reopened','deal_id',_deal.id,'outcome_id',_id,'to_stage_id',_stage.id,'version',_deal.version,'message','Deal reopened in '||_stage.label||'.');
    end if;
  end if;

  if (_result->>'ok')::boolean and _result->>'deal_id' is not null then
    select * into _deal from public.deals where id=(_result->>'deal_id')::uuid;
    if _deal.contact_client_id is not null then
      perform public.record_rail_event(_deal.contact_client_id,'owner.crm_mutation','campaigns_pipeline',case when _actor_kind='paige' then 'paige_agent' else 'owner_staff' end,
        case when _action='record_outcome' then 'Deal outcome recorded' when _action='create_deal' then 'Deal created' when _action='update_deal' then 'Deal updated' when _action='reopen_deal' then 'Deal reopened' else 'Deal moved' end,
        _result->>'message',jsonb_build_object('deal_id',_deal.id,'pipeline_id',_deal.pipeline_id,'action',_action,'outcome',_result->>'outcome','idempotency_key',_idempotency_key),
        'deals',_deal.id,'owner_ops',null,now(),true,_tenant);
    end if;
  end if;
  insert into public.audit_logs(user_id,entity,action,entity_id,data)
  values(_caller,'pipeline_deal','pipeline.deal.'||_action,coalesce((_result->>'deal_id')::uuid,_deal.id),jsonb_build_object('tenant_id',_tenant,'actor_kind',_actor_kind,'idempotency_key',_idempotency_key,'outcome',_result->>'outcome'));
  insert into public.pipeline_command_results(tenant_id,idempotency_key,command_hash,actor_user_id,actor_kind,result)
  values(_tenant,_idempotency_key,_hash,_caller,_actor_kind,_result);
  return _result;
end$$;
revoke all on function public.configure_tenant_pipeline_core_identity(uuid,jsonb,text,text) from public,anon,authenticated;

do $$ begin
  if to_regprocedure('public.get_pipeline_workspace_pre_command_desk(uuid)') is null then
    alter function public.get_pipeline_workspace(uuid) rename to get_pipeline_workspace_pre_command_desk;
  end if;
end$$;
revoke all on function public.get_pipeline_workspace_pre_command_desk(uuid) from public,anon,authenticated;

create or replace function public.get_pipeline_workspace(_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare _workspace jsonb; _deals jsonb; _automation_rules jsonb;
begin
  _workspace:=public.get_pipeline_workspace_pre_command_desk(_tenant_id);
  select coalesce(jsonb_agg(item||jsonb_build_object(
    'tags',coalesce(d.tags,array[]::text[]),'notes',d.notes,'created_at',d.created_at,
    'actual_close_date',d.actual_close_date,'lost_reason',d.lost_reason,
    'outcomes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'outcome_type',o.outcome_type,'reason',o.reason,'notes',o.notes,
      'outcome_date',o.outcome_date,'created_at',o.created_at,'created_through',o.created_through
    ) order by o.created_at desc) from public.pipeline_deal_outcomes o where o.tenant_id=_tenant_id and o.deal_id=d.id),'[]'::jsonb)
  ) order by d.updated_at desc),'[]'::jsonb) into _deals
  from jsonb_array_elements(coalesce(_workspace->'deals','[]'::jsonb)) item
  join public.deals d on d.id=(item->>'id')::uuid and d.tenant_id=_tenant_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'pipeline_id',r.pipeline_id,'from_stage_id',r.from_stage_id,'to_stage_id',r.to_stage_id,'compose_intent',r.compose_intent,'send_mode',r.send_mode,'is_active',r.is_active) order by r.updated_at desc),'[]'::jsonb) into _automation_rules from public.stage_automation_rules r where r.tenant_id=_tenant_id;
  return (_workspace-'deals')||jsonb_build_object('deals',_deals,'automation_rules',_automation_rules,'outcome_types',jsonb_build_array('won','lost','not_fit','closed_without_decision'));
end$$;
revoke all on function public.get_pipeline_workspace(uuid) from public,anon;
grant execute on function public.get_pipeline_workspace(uuid) to authenticated,service_role;
comment on table public.pipeline_deal_outcomes is 'Tenant-bound durable Pipeline decisions. Stage names never define outcome identity.';
comment on function public.configure_tenant_pipeline_core_identity(uuid,jsonb,text,text) is 'Canonical Pipeline core extension for owner deal writes. PAIGE deal writes require their governed executor; no second approval queue is created.';


-- Preserve the canonical PAIGE executor and force closing moves through an explicit outcome contract.
-- Private domain executor. Only the Chat server passes its canonical gate outcome;
-- tool/model arguments and browser callers never grant approval here.
-- Existing held requests are historical evidence and are deliberately untouched.
create or replace function public.execute_pipeline_deal_move_as_paige(
  _tenant_id uuid, _requested_by uuid, _command jsonb,
  _idempotency_key text, _approval_channel text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  _old_sub text:=current_setting('request.jwt.claim.sub',true);
  _deal public.deals%rowtype;
  _target public.pipeline_stages%rowtype;
  _source public.pipeline_stages%rowtype;
  _cached public.pipeline_command_results%rowtype;
  _result jsonb;
  _hash text;
  _reason text;
  _active_tenant uuid;
  _mode text;
  _rail_sub text;
  _rail_claims text;
begin
  if auth.role() is distinct from 'service_role' or _tenant_id is null or _requested_by is null then
    raise exception 'PIPELINE_FORBIDDEN' using errcode='42501';
  end if;
  if _approval_channel is null or _approval_channel not in ('operator_card','model_asserted','standing_autonomy_setting') then
    raise exception 'PIPELINE_AUTHORITY_REQUIRED' using errcode='42501';
  end if;
  perform set_config('request.jwt.claim.sub',_requested_by::text,true);
  -- Do not turn the canonical resolver's fallback membership into consent to act
  -- in a workspace the operator has not selected. Serialize a concurrent switch.
  select p.active_tenant_id into _active_tenant from public.profiles p
    where p.user_id=_requested_by for update;
  if not found or _active_tenant is distinct from _tenant_id then
    raise exception 'PIPELINE_ACTIVE_WORKSPACE_CHANGED' using errcode='42501';
  end if;
  if public.current_user_tenant_id() is distinct from _tenant_id or not coalesce(public.is_tenant_admin(_tenant_id),false) then
    raise exception 'PIPELINE_FORBIDDEN' using errcode='42501';
  end if;
  if _command is null or jsonb_typeof(_command)<>'object' or _command->>'type' is distinct from 'move-deal'
    or coalesce(_command->>'dealId','')='' or coalesce(_command->>'targetStageId','')=''
    or coalesce(_command->>'pipelineId','')=''
    or jsonb_typeof(_command->'expectedVersion') is distinct from 'number'
    or jsonb_typeof(_command->'expectedTargetVersion') is distinct from 'number'
    or (_command->>'expectedVersion')::numeric<1 or (_command->>'expectedTargetVersion')::numeric<1
    or (_command->>'expectedVersion')::numeric<>trunc((_command->>'expectedVersion')::numeric)
    or (_command->>'expectedTargetVersion')::numeric<>trunc((_command->>'expectedTargetVersion')::numeric)
    or coalesce(btrim(_idempotency_key),'')='' or length(_idempotency_key)>200 then
    raise exception 'PIPELINE_MOVE_INVALID' using errcode='22023';
  end if;
  _hash:=encode(sha256(convert_to(_command::text||':'||_requested_by::text||':'||_approval_channel,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('pipeline-command:'||_tenant_id::text||':'||_idempotency_key,0));
  select * into _cached from public.pipeline_command_results where tenant_id=_tenant_id and idempotency_key=_idempotency_key;
  if found then
    if _cached.command_hash is distinct from _hash or _cached.actor_user_id is distinct from _requested_by or _cached.actor_kind<>'paige' then
      raise exception 'PIPELINE_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    perform set_config('request.jwt.claim.sub',coalesce(_old_sub,''),true);
    return _cached.result||jsonb_build_object('replayed',true);
  end if;
  select * into _deal from public.deals where id=(_command->>'dealId')::uuid and tenant_id=_tenant_id for update;
  if not found or _deal.pipeline_id is distinct from (_command->>'pipelineId')::uuid then
    raise exception 'PIPELINE_MOVE_UNAVAILABLE' using errcode='42501';
  end if;
  -- Serialize against target policy/name/archive changes before checking its version.
  select * into _target from public.pipeline_stages where id=(_command->>'targetStageId')::uuid
    and tenant_id=_tenant_id and pipeline_id=_deal.pipeline_id for update;
  if not found or _target.archived_at is not null then
    raise exception 'PIPELINE_MOVE_UNAVAILABLE' using errcode='42501';
  end if;
  if _deal.version<>(_command->>'expectedVersion')::bigint or _target.version<>(_command->>'expectedTargetVersion')::bigint then
    raise exception 'PIPELINE_VERSION_CONFLICT' using errcode='40001';
  end if;
  perform 1 from public.pipelines where id=_deal.pipeline_id and tenant_id=_tenant_id and lifecycle_status<>'archived';
  if not found then
    raise exception 'PIPELINE_MOVE_UNAVAILABLE' using errcode='42501';
  end if;
  if _target.move_policy not in ('direct','approval') or _target.move_policy is null
    or (_target.move_policy='approval' and _approval_channel<>'operator_card') then
    raise exception 'PIPELINE_OPERATOR_APPROVAL_REQUIRED' using errcode='42501';
  end if;
  select * into _source from public.pipeline_stages where id=_deal.stage_id and tenant_id=_tenant_id and pipeline_id=_deal.pipeline_id;
  if not found then raise exception 'PIPELINE_MOVE_UNAVAILABLE' using errcode='42501'; end if;
  if _source.id=_target.id then
    raise exception 'PIPELINE_ALREADY_IN_STAGE' using errcode='22023';
  end if;
  if _target.stage_type in ('won','lost') then
    raise exception 'PIPELINE_OUTCOME_REQUIRED' using errcode='22023';
  end if;
  perform public.assert_pipeline_automation_not_active(_tenant_id,_deal.pipeline_id,_deal.stage_id,_target.id);
  -- Re-read current authority after row-lock waits; an earlier gate/cache is not
  -- permission to execute after the owner switches this capability off.
  _mode:=public.resolve_tool_autonomy(_tenant_id,'deal_move_stage');
  if _mode is null or _mode not in ('auto','confirm')
    or (_mode='confirm' and _approval_channel='standing_autonomy_setting') then
    raise exception 'PIPELINE_AUTONOMY_REFUSED' using errcode='42501';
  end if;
  _reason:=left(nullif(btrim(_command->>'reason'),''),500);
  -- Preserve tenant-owned semantics. A stage name/type is not permission to change
  -- status, close date, payments, clients, or the pipeline itself.
  update public.deals set stage_id=_target.id,updated_at=now() where id=_deal.id returning * into _deal;
  insert into public.deal_activities(deal_id,type,summary,actor_user_id,payload)
  values(_deal.id,'stage_changed','Moved from '||_source.label||' to '||_target.label,_requested_by,
    jsonb_build_object('from_stage_id',_source.id,'from_stage_label',_source.label,'to_stage_id',_target.id,
      'to_stage_label',_target.label,'actor_kind','paige','reason',_reason,'idempotency_key',_idempotency_key,
      'approval_channel',_approval_channel));
  if _deal.contact_client_id is not null then
    -- Pipeline authorization above precedes Rail's established service path.
    -- Clear both subject forms: auth.uid() falls back to the claims JSON.
    _rail_sub:=current_setting('request.jwt.claim.sub',true);
    _rail_claims:=current_setting('request.jwt.claims',true);
    begin
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims',(coalesce(nullif(_rail_claims,'')::jsonb,'{}'::jsonb)-'sub')::text,true);
    if auth.uid() is not null or auth.role() is distinct from 'service_role' then
      raise exception 'PIPELINE_RAIL_SERVICE_REQUIRED' using errcode='42501';
    end if;
    -- Durable client Rail failure rolls the move back; never swallow it as success.
    -- Rail independently checks this exact client belongs to this tenant.
    perform public.record_rail_event(_deal.contact_client_id,'owner.crm_mutation','campaigns_pipeline','paige_agent',
      'Deal moved','Moved from '||_source.label||' to '||_target.label,
      jsonb_build_object('deal_id',_deal.id,'from_stage_id',_source.id,'from_stage_label',_source.label,
        'to_stage_id',_target.id,'to_stage_label',_target.label,'actor_kind','paige','policy_result','allowed',
        'requested_by',_requested_by,'approval_channel',_approval_channel,'idempotency_key',_idempotency_key),
      'deals',_deal.id,'owner_ops',null,now(),true,_tenant_id);
    perform set_config('request.jwt.claims',coalesce(_rail_claims,''),true);
    perform set_config('request.jwt.claim.sub',coalesce(_rail_sub,''),true);
    exception when others then
      perform set_config('request.jwt.claims',coalesce(_rail_claims,''),true);
      perform set_config('request.jwt.claim.sub',coalesce(_rail_sub,''),true);
      raise;
    end;
  end if;
  _result:=jsonb_build_object('ok',true,'outcome','moved','deal_id',_deal.id,'pipeline_id',_deal.pipeline_id,
    'from_stage_id',_source.id,'to_stage_id',_target.id,'version',_deal.version,'actor_kind','paige',
    'requested_by',_requested_by,'message','Deal moved to '||_target.label||'.');
  insert into public.audit_logs(user_id,entity,action,entity_id,data)
  values(_requested_by,'pipeline','pipeline.move',_deal.id,jsonb_build_object('tenant_id',_tenant_id,
    'actor_kind','paige','approval_channel',_approval_channel,'idempotency_key',_idempotency_key,'outcome','moved'));
  insert into public.pipeline_command_results(tenant_id,idempotency_key,command_hash,actor_user_id,actor_kind,result)
  values(_tenant_id,_idempotency_key,_hash,_requested_by,'paige',_result);
  perform set_config('request.jwt.claim.sub',coalesce(_old_sub,''),true);
  return _result;
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(_old_sub,''),true);
  raise;
end$$;
revoke all on function public.execute_pipeline_deal_move_as_paige(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.execute_pipeline_deal_move_as_paige(uuid,uuid,jsonb,text,text) to service_role;
