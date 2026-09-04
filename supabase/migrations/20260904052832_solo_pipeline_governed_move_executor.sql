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
  perform 1 from public.pipelines where id=_deal.pipeline_id and tenant_id=_tenant_id;
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
