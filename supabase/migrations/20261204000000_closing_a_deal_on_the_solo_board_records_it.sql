-- Closing a deal on the Solo board recorded nothing but the stage.
--
-- THREE paths move a deal into a won stage. Two stamp the close; the one /solo and /business
-- actually use did not:
--
--   PAIGE `deal_move_stage`  paige-ai-chat/index.ts:9673   -- sets status AND actual_close_date
--   legacy /admin board      PipelineAdmin.tsx:112-114     -- sets both
--   the GOVERNED board       this function, move_deal       -- set NEITHER
--
-- Period revenue is `ps.stage_type='won' AND d.actual_close_date IS NOT NULL AND
-- d.actual_close_date >= since_date` (20260713152601:40, and the same predicate at
-- 20260713110000:70-73). So a deal closed on the Solo board never counted, and never would have.
-- The all-time sums carry no date predicate, so the symptom was not a uniform zero — it was a
-- divergence: period revenue $0 while all-time value counted the very same deals.
--
-- WHY THIS LANDS BEFORE the Solo closing-stage control (#26). That work lets a tenant create a
-- won stage and then deletes the revenue check's caveat. Shipped in the other order it would be
-- strictly worse than today: the check flips to pass, the warning disappears, the owner drags a
-- deal to Won, and revenue still reads zero with nothing on screen explaining why. The §39
-- adversarial pass called that fatal on the #26 plan, and it was right.
--
-- ─── WHAT THIS MIGRATION IS, MECHANICALLY ────────────────────────────────────────────────────
--
-- A re-creation of `configure_tenant_pipeline_core_identity` carrying the body forward verbatim
-- with ONE statement changed. The body was written as `configure_tenant_pipeline` in
-- 20260831224500 (L99-264) and has since been RENAMED, never re-created:
--
--   human : configure_tenant_pipeline            (20260901144648:223, folder routing)
--        -> configure_tenant_pipeline_pre_folders (renamed 20260901144648:221)
--        -> configure_tenant_pipeline_core_identity  <- THE BODY (renamed 20260901045935:184)
--   paige : configure_tenant_pipeline_as_paige -> _as_paige_pre_folders -> the same core
--
-- Both actors converge here, so one edit serves the board and PAIGE (§18). Targeting the bare
-- name `configure_tenant_pipeline` would instead overwrite the folders wrapper and delete its
-- routing.
--
-- The body below was extracted programmatically from 20260831224500 L99-264 and diffed against
-- the source: exactly two lines differ — the function name, and the `update public.deals`.
-- That statement is the ONLY write to `public.deals` in all 166 lines.
--
-- NO GRANT STATEMENTS, DELIBERATELY. 20260831224500:265-266 granted EXECUTE to `authenticated`
-- on the old bare name; 20260901045935:185 then REVOKED all on the core name from
-- public/anon/authenticated, because the core trusts a caller-supplied `_actor_kind` and the
-- wrappers exist to derive it instead. Carrying those grant lines onto the core name would let
-- any tenant admin call it directly and label their own writes 'paige' in the audit trail (§9).
-- `create or replace` preserves the existing ACL; `drop`+`create` would NOT, and would default
-- EXECUTE to PUBLIC. This uses replace.
--
-- THE RULE, and all three existing implementations agree on it: derive from the TARGET stage's
-- `stage_type` — won -> 'won', lost -> 'lost', anything else -> 'open'; stamp `current_date`
-- when the deal is closed and NULL when it is not. The clear-on-reopen half is as load-bearing
-- as the stamp: without it a deal dragged back out of Won keeps its close date and keeps
-- counting as period revenue while sitting in an open stage. `_stage.stage_type` is already in
-- scope from the target-stage select. `current_date` rather than a client-supplied date, so the
-- close is recorded when it actually happened.
--
-- ─── WHAT THIS DOES NOT FIX, STATED SO IT IS NOT MISTAKEN FOR DONE (§13) ─────────────────────
--
-- A stage whose `move_policy='approval'` still cannot complete a move BY ANY PATH.
-- `pipeline_move_approvals` is write-only across the whole repo: the INSERT in the branch below
-- is its only writer, nothing ever sets `status` to approved/rejected/cancelled or fills
-- `resolved_at`, and its only two readers are the dependency counts that BLOCK archiving. So
-- every held request is permanent, and it permanently blocks archiving that stage and its
-- pipeline. That is a missing feature, not a regression from this change, and it is filed
-- separately — but a tenant on an approval-policy stage gets no benefit from this migration.
--
-- Also unstamped, and out of scope here: `growth-process-submission/index.ts:467` advances an
-- existing deal's `stage_id` with no stamp and no constraint on the target's `stage_type`.
--
-- §37 consumers of the two columns this now writes: the tier-dashboard metrics
-- (20260713110000, 20260713152601), the `contact_deal_rollup` view, `subagent-sales-pipeline`
-- (filters `.neq("status","won")` — it will correctly stop chasing closed deals), and
-- `useAnalyticsEvidence`. None of them regress: every one of them was reading a deal the Solo
-- board had mis-recorded as still open.
--
-- §32: a BEGIN..ROLLBACK proof is the pre-merge smoke test only. The persisted-apply
-- confirmation on prod is owed after merge.

create or replace function public.configure_tenant_pipeline_core_identity(
  _tenant_id uuid,
  _command jsonb,
  _idempotency_key text,
  _actor_kind text default 'human'
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  _caller uuid:=auth.uid();
  _tenant uuid:=coalesce(_tenant_id,public.current_user_tenant_id());
  _action text:=replace(coalesce(_command->>'type',''),'-','_');
  _hash text:=md5(coalesce(_command,'{}'::jsonb)::text);
  _cached public.pipeline_command_results%rowtype;
  _pipeline public.pipelines%rowtype;
  _stage public.pipeline_stages%rowtype;
  _deal public.deals%rowtype;
  _from_stage public.pipeline_stages%rowtype;
  _result jsonb;
  _id uuid;
  _ordered uuid[];
  _proposed_stage jsonb;
  _stage_index int:=0;
  _expected bigint;
  _dependencies jsonb;
  _deal_count int:=0; _route_count int:=0; _automation_count int:=0; _approval_count int:=0; _history_count int:=0;
begin
  if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant=public.current_user_tenant_id()) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if _actor_kind not in ('human','paige') then raise exception 'PIPELINE_ACTOR_INVALID' using errcode='22023'; end if;
  if coalesce(btrim(_idempotency_key),'')='' then raise exception 'PIPELINE_IDEMPOTENCY_REQUIRED' using errcode='22023'; end if;

  select * into _cached from public.pipeline_command_results where tenant_id=_tenant and idempotency_key=_idempotency_key;
  if found then
    if _cached.command_hash<>_hash then raise exception 'PIPELINE_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
    return _cached.result;
  end if;

  if _action='create_pipeline' then
    if coalesce(btrim(_command->>'name'),'')='' then raise exception 'PIPELINE_NAME_REQUIRED' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended('pipeline-default:'||_tenant::text,0));
    insert into public.pipelines(name,description,is_default,created_by,tenant_id,lifecycle_status)
    values(btrim(_command->>'name'),nullif(btrim(_command->>'description'),''),not exists(select 1 from public.pipelines where tenant_id=_tenant),_caller,_tenant,'draft') returning id into _id;
    if _command ? 'stages' and jsonb_typeof(_command->'stages')<>'array' then raise exception 'PIPELINE_STAGES_INVALID' using errcode='22023'; end if;
    for _proposed_stage in select * from jsonb_array_elements(coalesce(_command->'stages','[]'::jsonb)) loop
      if coalesce(btrim(_proposed_stage->>'label'),'')='' then raise exception 'PIPELINE_STAGE_NAME_REQUIRED' using errcode='22023'; end if;
      _stage_index:=_stage_index+1;
      insert into public.pipeline_stages(pipeline_id,label,description,order_index,stage_type,tenant_id,move_policy)
      values(_id,btrim(_proposed_stage->>'label'),nullif(btrim(_proposed_stage->>'description'),''),_stage_index,'open',_tenant,case when _proposed_stage->>'movePolicy'='approval' then 'approval' else 'direct' end);
    end loop;
    _result:=jsonb_build_object('ok',true,'outcome','created','pipeline_id',_id,'stage_count',_stage_index,'message',case when _stage_index=0 then 'Blank pipeline created as a draft. Add at least one named stage before activation.' else 'Editable pipeline proposal saved as a draft. Review every stage before activation.' end);
  elsif _action in ('update_pipeline','activate_pipeline','archive_pipeline','restore_pipeline','delete_pipeline') then
    select * into _pipeline from public.pipelines where id=(_command->>'pipelineId')::uuid and tenant_id=_tenant for update;
    if not found then raise exception 'PIPELINE_NOT_FOUND' using errcode='22023'; end if;
    _expected:=coalesce((_command->>'expectedVersion')::bigint,0);
    if _pipeline.version<>_expected then raise exception 'PIPELINE_VERSION_CONFLICT' using errcode='40001'; end if;
    if _action='update_pipeline' then
      if coalesce(btrim(_command->>'name'),'')='' then raise exception 'PIPELINE_NAME_REQUIRED' using errcode='22023'; end if;
      update public.pipelines set name=btrim(_command->>'name'),description=nullif(btrim(_command->>'description'),''),updated_at=now() where id=_pipeline.id;
      _result:=jsonb_build_object('ok',true,'outcome','updated','pipeline_id',_pipeline.id,'message','Pipeline details saved.');
    elsif _action='activate_pipeline' then
      if coalesce(btrim(_pipeline.name),'')='' or not exists(select 1 from public.pipeline_stages where pipeline_id=_pipeline.id and archived_at is null and btrim(label)<>'') then raise exception 'PIPELINE_ACTIVATION_INVALID' using errcode='22023'; end if;
      update public.pipelines set lifecycle_status='active',updated_at=now() where id=_pipeline.id;
      _result:=jsonb_build_object('ok',true,'outcome','activated','pipeline_id',_pipeline.id,'message','Pipeline activated.');
    elsif _action='restore_pipeline' then
      update public.pipelines set lifecycle_status='draft',updated_at=now() where id=_pipeline.id;
      _result:=jsonb_build_object('ok',true,'outcome','restored','pipeline_id',_pipeline.id,'message','Pipeline restored as a draft.');
    else
      select count(*) into _deal_count from public.deals where pipeline_id=_pipeline.id;
      select count(*) into _route_count from public.growth_forms where tenant_id=_tenant and pipeline_id=_pipeline.id;
      select count(*) into _automation_count from public.stage_automation_rules where tenant_id=_tenant and pipeline_id=_pipeline.id;
      select count(*) into _approval_count from public.pipeline_move_approvals where tenant_id=_tenant and deal_id in (select id from public.deals where pipeline_id=_pipeline.id);
      select count(*) into _history_count from public.deal_activities where deal_id in (select id from public.deals where pipeline_id=_pipeline.id);
      _dependencies:=jsonb_build_object('deals',_deal_count,'routes',_route_count,'approvals',_approval_count,'automations',_automation_count,'history',_history_count);
      if _deal_count+_route_count+_approval_count+_automation_count+_history_count>0 then
        _result:=jsonb_build_object('ok',false,'outcome','PIPELINE_DEPENDENCIES_UNRESOLVED','pipeline_id',_pipeline.id,'dependencies',_dependencies,'message','This pipeline still has dependent deals, routes, approvals, automations, or retained history. Resolve the listed dependencies before archiving or deleting it.');
      elsif _action='archive_pipeline' then
        update public.pipelines set lifecycle_status='archived',updated_at=now() where id=_pipeline.id;
        _result:=jsonb_build_object('ok',true,'outcome','archived','pipeline_id',_pipeline.id,'dependencies',_dependencies,'message','Pipeline archived.');
      else
        delete from public.pipelines where id=_pipeline.id;
        _result:=jsonb_build_object('ok',true,'outcome','deleted','pipeline_id',_pipeline.id,'dependencies',_dependencies,'message','Empty pipeline deleted.');
      end if;
    end if;
  elsif _action in ('create_stage','update_stage','archive_stage','restore_stage','delete_stage') then
    if _action='create_stage' then
      select * into _pipeline from public.pipelines where id=(_command->>'pipelineId')::uuid and tenant_id=_tenant for update;
      if not found then raise exception 'PIPELINE_NOT_FOUND' using errcode='22023'; end if;
      if _pipeline.version<>coalesce((_command->>'expectedVersion')::bigint,0) then raise exception 'PIPELINE_VERSION_CONFLICT' using errcode='40001'; end if;
      if coalesce(btrim(_command->>'label'),'')='' then raise exception 'PIPELINE_STAGE_NAME_REQUIRED' using errcode='22023'; end if;
      perform pg_advisory_xact_lock(hashtextextended('pipeline-stage-order:'||_pipeline.id::text,0));
      insert into public.pipeline_stages(pipeline_id,label,description,order_index,stage_type,tenant_id,move_policy)
      values(_pipeline.id,btrim(_command->>'label'),nullif(btrim(_command->>'description'),''),(select coalesce(max(order_index),0)+1 from public.pipeline_stages where pipeline_id=_pipeline.id),'open',_tenant,case when _command->>'movePolicy'='approval' then 'approval' else 'direct' end) returning id into _id;
      update public.pipelines set updated_at=now() where id=_pipeline.id;
      _result:=jsonb_build_object('ok',true,'outcome','stage_created','stage_id',_id,'message','Stage added.');
    else
      select * into _stage from public.pipeline_stages where id=(_command->>'stageId')::uuid and tenant_id=_tenant for update;
      if not found then raise exception 'PIPELINE_STAGE_NOT_FOUND' using errcode='22023'; end if;
      if _stage.version<>coalesce((_command->>'expectedVersion')::bigint,0) then raise exception 'PIPELINE_VERSION_CONFLICT' using errcode='40001'; end if;
      if _action='update_stage' then
        if coalesce(btrim(_command->>'label'),'')='' then raise exception 'PIPELINE_STAGE_NAME_REQUIRED' using errcode='22023'; end if;
        update public.pipeline_stages set label=btrim(_command->>'label'),description=nullif(btrim(_command->>'description'),''),move_policy=case when _command->>'movePolicy'='approval' then 'approval' else 'direct' end,updated_at=now() where id=_stage.id;
        _result:=jsonb_build_object('ok',true,'outcome','stage_updated','stage_id',_stage.id,'message','Stage saved.');
      elsif _action='restore_stage' then
        update public.pipeline_stages set archived_at=null,archived_by=null,updated_at=now() where id=_stage.id;
        _result:=jsonb_build_object('ok',true,'outcome','stage_restored','stage_id',_stage.id,'message','Stage restored.');
      else
        select count(*) into _deal_count from public.deals where stage_id=_stage.id;
        select count(*) into _route_count from public.growth_forms where tenant_id=_tenant and stage_id=_stage.id;
        select count(*) into _automation_count from public.stage_automation_rules where tenant_id=_tenant and (from_stage_id=_stage.id or to_stage_id=_stage.id);
        select count(*) into _approval_count from public.pipeline_move_approvals where tenant_id=_tenant and (from_stage_id=_stage.id or to_stage_id=_stage.id);
        select count(*) into _history_count from public.deal_activities where payload->>'stage_id'=_stage.id::text or payload->>'from_stage_id'=_stage.id::text or payload->>'to_stage_id'=_stage.id::text;
        _dependencies:=jsonb_build_object('deals',_deal_count,'routes',_route_count,'approvals',_approval_count,'automations',_automation_count,'history',_history_count);
        if _deal_count+_route_count+_approval_count+_automation_count+_history_count>0 then
          _result:=jsonb_build_object('ok',false,'outcome','PIPELINE_DEPENDENCIES_UNRESOLVED','stage_id',_stage.id,'dependencies',_dependencies,'message','This stage still has dependent deals, routes, approvals, automations, or retained history. Resolve the listed dependencies before archiving or deleting it.');
        elsif _action='archive_stage' then
          update public.pipeline_stages set archived_at=now(),archived_by=_caller,updated_at=now() where id=_stage.id;
          _result:=jsonb_build_object('ok',true,'outcome','stage_archived','stage_id',_stage.id,'dependencies',_dependencies,'message','Stage archived.');
        else
          delete from public.pipeline_stages where id=_stage.id;
          _result:=jsonb_build_object('ok',true,'outcome','stage_deleted','stage_id',_stage.id,'dependencies',_dependencies,'message','Empty stage deleted.');
        end if;
      end if;
    end if;
  elsif _action='reorder_stages' then
    select * into _pipeline from public.pipelines where id=(_command->>'pipelineId')::uuid and tenant_id=_tenant for update;
    if not found then raise exception 'PIPELINE_NOT_FOUND' using errcode='22023'; end if;
    if _pipeline.version<>coalesce((_command->>'expectedVersion')::bigint,0) then raise exception 'PIPELINE_VERSION_CONFLICT' using errcode='40001'; end if;
    select array_agg(value::uuid order by ordinality) into _ordered from jsonb_array_elements_text(coalesce(_command->'orderedIds','[]'::jsonb)) with ordinality;
    if coalesce(array_length(_ordered,1),0)<>(select count(*) from public.pipeline_stages where pipeline_id=_pipeline.id and archived_at is null) or exists(select 1 from unnest(_ordered) id left join public.pipeline_stages s on s.id=id and s.pipeline_id=_pipeline.id and s.archived_at is null where s.id is null) then raise exception 'PIPELINE_STAGE_ORDER_INVALID' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended('pipeline-stage-order:'||_pipeline.id::text,0));
    for _deal_count in 1..array_length(_ordered,1) loop update public.pipeline_stages set order_index=_deal_count,updated_at=now() where id=_ordered[_deal_count]; end loop;
    update public.pipelines set updated_at=now() where id=_pipeline.id;
    _result:=jsonb_build_object('ok',true,'outcome','stages_reordered','pipeline_id',_pipeline.id,'message','Stage order saved.');
  elsif _action='move_deal' then
    select * into _deal from public.deals where id=(_command->>'dealId')::uuid and tenant_id=_tenant for update;
    if not found then raise exception 'PIPELINE_DEAL_NOT_FOUND' using errcode='22023'; end if;
    if _deal.version<>coalesce((_command->>'expectedVersion')::bigint,0) then
      return jsonb_build_object('ok',false,'outcome','PIPELINE_VERSION_CONFLICT','deal_id',_deal.id,'current_stage_id',_deal.stage_id,'current_version',_deal.version,'message','This deal changed somewhere else. Its current durable stage and version were returned; review them before making a new move.');
    end if;
    select * into _from_stage from public.pipeline_stages where id=_deal.stage_id;
    select * into _stage from public.pipeline_stages where id=(_command->>'targetStageId')::uuid and tenant_id=_tenant and pipeline_id=_deal.pipeline_id and archived_at is null;
    if not found then raise exception 'PIPELINE_TARGET_INVALID' using errcode='22023'; end if;
    if _stage.move_policy='approval' then
      insert into public.pipeline_move_approvals(tenant_id,deal_id,from_stage_id,to_stage_id,requested_by,actor_kind,reason,idempotency_key)
      values(_tenant,_deal.id,_deal.stage_id,_stage.id,_caller,_actor_kind,nullif(btrim(_command->>'reason'),''),_idempotency_key) returning id into _id;
      _result:=jsonb_build_object('ok',true,'outcome','held','approval_id',_id,'deal_id',_deal.id,'current_stage_id',_deal.stage_id,'requested_stage_id',_stage.id,'message','Approval is required. The deal stayed in '||_from_stage.label||' and a held request was recorded for '||_stage.label||'.');
    else
      update public.deals set stage_id=_stage.id,
             status=case _stage.stage_type when 'won' then 'won' when 'lost' then 'lost' else 'open' end,
             actual_close_date=case when _stage.stage_type in ('won','lost') then current_date else null end,
             updated_at=now() where id=_deal.id;
      insert into public.deal_activities(deal_id,type,summary,actor_user_id,payload)
      values(_deal.id,'stage_changed','Moved from '||_from_stage.label||' to '||_stage.label,_caller,jsonb_build_object('from_stage_id',_from_stage.id,'from_stage_label',_from_stage.label,'to_stage_id',_stage.id,'to_stage_label',_stage.label,'actor_kind',_actor_kind,'reason',nullif(btrim(_command->>'reason'),''),'idempotency_key',_idempotency_key));
      if _deal.contact_client_id is not null then
        begin
          perform public.record_rail_event(_deal.contact_client_id,'owner.crm_mutation','campaigns_pipeline',case when _actor_kind='paige' then 'paige_agent' else 'owner_staff' end,'Deal moved','Moved from '||_from_stage.label||' to '||_stage.label,jsonb_build_object('deal_id',_deal.id,'from_stage_id',_from_stage.id,'from_stage_label',_from_stage.label,'to_stage_id',_stage.id,'to_stage_label',_stage.label,'actor_kind',_actor_kind,'policy_result','allowed'),'deals',_deal.id,'owner_ops',null,now(),true,_tenant);
        exception when others then raise warning 'pipeline rail emit failed for deal %: %',_deal.id,sqlerrm; end;
      end if;
      _result:=jsonb_build_object('ok',true,'outcome','moved','deal_id',_deal.id,'from_stage_id',_from_stage.id,'to_stage_id',_stage.id,'message','Deal moved to '||_stage.label||'.');
    end if;
  else
    raise exception 'PIPELINE_ACTION_INVALID' using errcode='22023';
  end if;

  insert into public.audit_logs(user_id,entity,action,entity_id,data)
  values(_caller,'pipeline','pipeline.configure',coalesce((_result->>'pipeline_id')::uuid,(_result->>'stage_id')::uuid,(_result->>'deal_id')::uuid),jsonb_build_object('tenant_id',_tenant,'actor_kind',_actor_kind,'command',_action,'idempotency_key',_idempotency_key,'outcome',_result->>'outcome'));
  insert into public.pipeline_command_results(tenant_id,idempotency_key,command_hash,actor_user_id,actor_kind,result) values(_tenant,_idempotency_key,_hash,_caller,_actor_kind,_result);
  return _result;
end$$;
