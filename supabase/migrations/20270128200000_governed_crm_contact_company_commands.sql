-- Canonical governed CRM/Pipeline command seam.
--
-- This is NOT another capability registry, approval store, or Rail. It is the domain-write seam
-- beneath the existing Capability Gateway / decideGovernedExecution path. Chat adoption is separate
-- and must call the authenticated CRM action door, which derives identity from the verified JWT.
-- Only that server door supplies tenant + actor to this service-only executor; it revalidates the bond.

create table if not exists public.crm_command_results (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  idempotency_key text not null,
  command_hash text not null,
  actor_user_id uuid not null,
  action text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, actor_user_id, idempotency_key)
);

alter table public.crm_command_results enable row level security;
revoke all on public.crm_command_results from public, anon, authenticated;
grant select, insert, update on public.crm_command_results to service_role;

create or replace function public.execute_crm_command(
  _tenant_id uuid,
  _actor_id uuid,
  _command jsonb,
  _idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := _actor_id;
  v_tenant uuid := _tenant_id;
  v_action text := nullif(btrim(_command->>'action'), '');
  v_hash text;
  v_cached public.crm_command_results%rowtype;
  v_contact public.clients%rowtype;
  v_business public.businesses%rowtype;
  v_task public.tasks%rowtype;
  v_note public.client_notes%rowtype;
  v_deal public.deals%rowtype;
  v_pipeline_result jsonb;
  v_old_sub text;
  v_old_approval_channel text;
  v_is_admin boolean := false;
  v_is_coach boolean := false;
  v_can_touch_contact boolean := false;
  v_expected timestamptz;
  v_patch jsonb := coalesce(_command->'patch', '{}'::jsonb);
  v_unknown text[];
  v_result jsonb;
  v_readback jsonb;
  v_capability text;
  v_run_id uuid;
  v_created record;
begin
  -- Only the verified server action door can reach this executor. Tenant and actor are
  -- resolved there from the caller JWT, then re-bound to an active role again here.
  if auth.role() is distinct from 'service_role' or auth.uid() is not null then
    raise exception 'CRM_INTERNAL_EXECUTOR_REQUIRED' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception 'CRM_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_tenant is null then
    raise exception 'CRM_TENANT_REQUIRED' using errcode = '42501';
  end if;
  if _command is null or jsonb_typeof(_command) <> 'object'
     or v_action is null
     or coalesce(btrim(_idempotency_key), '') = ''
     or length(_idempotency_key) > 200 then
    raise exception 'CRM_COMMAND_INVALID' using errcode = '22023';
  end if;

  select exists(
    select 1 from public.tenant_members tm
    where tm.tenant_id = v_tenant and tm.user_id = v_actor and tm.status = 'active'
      and tm.role in ('owner','admin')
  ) into v_is_admin;
  select exists(
    select 1 from public.tenant_members tm
    where tm.tenant_id = v_tenant and tm.user_id = v_actor and tm.status = 'active'
      and tm.role = 'coach'
  ) into v_is_coach;
  if not (v_is_admin or v_is_coach) then
    raise exception 'CRM_FORBIDDEN' using errcode = '42501';
  end if;

  -- The command table is only a tenant-bound replay/cache seam. It does not replace audit or Rail.
  v_hash := encode(extensions.digest(convert_to(_command::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('crm-command:' || v_tenant::text || ':' || v_actor::text || ':' || _idempotency_key, 0));
  select * into v_cached
    from public.crm_command_results
   where tenant_id = v_tenant and actor_user_id = v_actor and idempotency_key = _idempotency_key
   for update;
  if found then
    if v_cached.command_hash <> v_hash then
      raise exception 'CRM_IDEMPOTENCY_REUSE' using errcode = '22023';
    end if;
    return v_cached.result || jsonb_build_object('replayed', true);
  end if;

  if v_action not in (
    'contact.create','contact.update','contact.archive','contact.restore',
    'contact.link_company','contact.unlink_company',
    'company.create','company.update','company.archive','company.restore',
    'task.create','task.update','task.assign','task.reschedule','task.complete','task.reopen',
    'activity.log','deal.create','deal.update','deal.move','deal.close','deal.reopen'
  ) then
    raise exception 'CRM_ACTION_UNAVAILABLE' using errcode = '0A000';
  end if;

  if v_action like 'deal.%' then
    if coalesce(_command->>'approval_channel','') not in ('operator_card','standing_autonomy_setting') then
      raise exception 'CRM_DEAL_AUTHORITY_REQUIRED' using errcode='42501';
    end if;
    if v_action = 'deal.move' then
      if coalesce(_command->>'deal_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(_command->>'pipeline_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(_command->>'target_stage_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(_command->'expected_version') is distinct from 'number'
        or jsonb_typeof(_command->'expected_target_version') is distinct from 'number' then
        raise exception 'CRM_DEAL_MOVE_INVALID' using errcode='22023';
      end if;
      v_pipeline_result := public.execute_pipeline_deal_move_as_paige(
        v_tenant,v_actor,
        jsonb_build_object('type','move-deal','dealId',_command->>'deal_id','pipelineId',_command->>'pipeline_id',
          'targetStageId',_command->>'target_stage_id','expectedVersion',(_command->>'expected_version')::bigint,
          'expectedTargetVersion',(_command->>'expected_target_version')::bigint,'reason',nullif(btrim(_command->>'reason'),'')),
        _idempotency_key,_command->>'approval_channel'
      );
    else
      v_old_sub:=current_setting('request.jwt.claim.sub',true);
      v_old_approval_channel:=current_setting('app.crm_approval_channel',true);
      begin
        perform set_config('request.jwt.claim.sub',v_actor::text,true);
        perform set_config('app.crm_approval_channel',_command->>'approval_channel',true);
        if v_action='deal.create' then
          v_pipeline_result:=public.configure_tenant_pipeline_core_identity(v_tenant,jsonb_strip_nulls(jsonb_build_object(
            'type','create-deal','title',_command->>'title','pipelineId',_command->>'pipeline_id','stageId',_command->>'stage_id',
            'clientId',_command->>'contact_id','ownerUserId',_command->>'owner_user_id','valueCents',_command->'value_cents',
            'currency',_command->>'currency','expectedCloseDate',_command->>'expected_close_date','offerType',_command->>'offer_type',
            'tags',coalesce(_command->'tags','[]'::jsonb),'notes',_command->>'notes'
          )),_idempotency_key,'paige');
        elsif v_action='deal.update' then
          v_pipeline_result:=public.configure_tenant_pipeline_core_identity(v_tenant,jsonb_strip_nulls(jsonb_build_object(
            'type','update-deal','dealId',_command->>'deal_id','expectedVersion',_command->'expected_version',
            'title',_command->>'title','clientId',_command->>'contact_id','ownerUserId',_command->>'owner_user_id',
            'valueCents',_command->'value_cents','currency',_command->>'currency','expectedCloseDate',_command->>'expected_close_date',
            'offerType',_command->>'offer_type','tags',_command->'tags','notes',_command->>'notes'
          )),_idempotency_key,'paige');
        elsif v_action='deal.close' then
          v_pipeline_result:=public.configure_tenant_pipeline_core_identity(v_tenant,jsonb_strip_nulls(jsonb_build_object(
            'type','record-outcome','dealId',_command->>'deal_id','expectedVersion',_command->'expected_version',
            'outcomeType',_command->>'outcome_type','reason',_command->>'reason','notes',_command->>'notes',
            'outcomeDate',_command->>'outcome_date','targetStageId',_command->>'target_stage_id'
          )),_idempotency_key,'paige');
        else
          v_pipeline_result:=public.configure_tenant_pipeline_core_identity(v_tenant,jsonb_build_object(
            'type','reopen-deal','dealId',_command->>'deal_id','expectedVersion',_command->'expected_version',
            'targetStageId',_command->>'target_stage_id'
          ),_idempotency_key,'paige');
        end if;
        perform set_config('app.crm_approval_channel',coalesce(v_old_approval_channel,''),true);
        perform set_config('request.jwt.claim.sub',coalesce(v_old_sub,''),true);
      exception when others then
        perform set_config('app.crm_approval_channel',coalesce(v_old_approval_channel,''),true);
        perform set_config('request.jwt.claim.sub',coalesce(v_old_sub,''),true);
        raise;
      end;
    end if;
    if coalesce((v_pipeline_result->>'ok')::boolean,false) is not true then
      raise exception 'CRM_DEAL_NOT_EXECUTED:%',coalesce(v_pipeline_result->>'outcome','unknown') using errcode='P0001';
    end if;
    select * into v_deal from public.deals d where d.id=(v_pipeline_result->>'deal_id')::uuid and d.tenant_id=v_tenant;
    if not found then raise exception 'CRM_READBACK_FAILED' using errcode='P0002'; end if;
    v_readback:=jsonb_build_object(
      'id',v_deal.id,'title',v_deal.title,'pipeline_id',v_deal.pipeline_id,'stage_id',v_deal.stage_id,
      'contact_id',v_deal.contact_client_id,'owner_user_id',v_deal.owner_user_id,'status',v_deal.status,
      'value_cents',v_deal.value_cents,'currency',v_deal.currency,'expected_close_date',v_deal.expected_close_date,
      'actual_close_date',v_deal.actual_close_date,'lost_reason',v_deal.lost_reason,'offer_type',v_deal.offer_type,
      'tags',v_deal.tags,'notes',v_deal.notes,'version',v_deal.version,'updated_at',v_deal.updated_at
    );
    v_capability:=case when v_action='deal.create' then 'deal_create' when v_action='deal.update' then 'deal_update' else 'deal_move_stage' end;

  elsif v_action = 'contact.create' then
    if jsonb_typeof(v_patch) <> 'object' then
      raise exception 'CRM_PATCH_INVALID' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_unknown
      from jsonb_object_keys(v_patch) k
     where k not in ('first_name','last_name','email','phone','entity_name','entity_type','title','lifecycle_stage','source','tags','primary_offer','notes','do_not_contact','website','linkedin_url','street_address','city','state','zip_code','funding_goal','monthly_revenue');
    if coalesce(array_length(v_unknown, 1), 0) > 0 then
      raise exception 'CRM_PATCH_FIELDS_INVALID:%', array_to_string(v_unknown, ',') using errcode = '22023';
    end if;

    select * into v_created from public.create_contact_v2(
      p_first_name := v_patch->>'first_name',
      p_last_name := v_patch->>'last_name',
      p_email := v_patch->>'email',
      p_phone := v_patch->>'phone',
      p_entity_name := v_patch->>'entity_name',
      p_title := v_patch->>'title',
      p_lifecycle_stage := coalesce(nullif(v_patch->>'lifecycle_stage',''), 'new_lead'),
      p_source := coalesce(nullif(v_patch->>'source',''), 'paige'),
      p_tags := case when jsonb_typeof(v_patch->'tags') = 'array'
                     then array(select jsonb_array_elements_text(v_patch->'tags')) else '{}'::text[] end,
      p_primary_offer := v_patch->>'primary_offer',
      p_notes := v_patch->>'notes',
      p_assigned_coach_user_id := case when v_is_coach and not v_is_admin then v_actor else null end,
      p_tenant_id := v_tenant,
      p_created_by := v_actor,
      p_channel := 'paige'
    );
    if not coalesce(v_created.was_created, false) then
      raise exception 'CRM_CONTACT_ALREADY_EXISTS:%', v_created.contact_id using errcode = 'P0001';
    end if;
    select * into v_contact from public.clients c where c.id = v_created.contact_id and c.tenant_id = v_tenant;
    if not found then raise exception 'CRM_READBACK_FAILED' using errcode = 'P0002'; end if;
    update public.clients c set
      entity_type = case when v_patch ? 'entity_type' then nullif(btrim(v_patch->>'entity_type'),'') else c.entity_type end,
      do_not_contact = case when v_patch ? 'do_not_contact' then (v_patch->>'do_not_contact')::boolean else c.do_not_contact end,
      website = case when v_patch ? 'website' then nullif(btrim(v_patch->>'website'),'') else c.website end,
      linkedin_url = case when v_patch ? 'linkedin_url' then nullif(btrim(v_patch->>'linkedin_url'),'') else c.linkedin_url end,
      street_address = case when v_patch ? 'street_address' then nullif(btrim(v_patch->>'street_address'),'') else c.street_address end,
      city = case when v_patch ? 'city' then nullif(btrim(v_patch->>'city'),'') else c.city end,
      state = case when v_patch ? 'state' then nullif(btrim(v_patch->>'state'),'') else c.state end,
      zip_code = case when v_patch ? 'zip_code' then nullif(btrim(v_patch->>'zip_code'),'') else c.zip_code end,
      funding_goal = case when v_patch ? 'funding_goal' then (v_patch->>'funding_goal')::numeric else c.funding_goal end,
      monthly_revenue = case when v_patch ? 'monthly_revenue' then (v_patch->>'monthly_revenue')::numeric else c.monthly_revenue end,
      updated_at = clock_timestamp()
    where c.id = v_contact.id returning * into v_contact;
    v_capability := 'crm_create_contact';

  elsif v_action like 'contact.%' then
    if coalesce(_command->>'contact_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'CRM_CONTACT_NOT_FOUND' using errcode = 'P0002';
    end if;
    select * into v_contact from public.clients c
     where c.id = (_command->>'contact_id')::uuid and c.tenant_id = v_tenant
     for update;
    if not found then
      raise exception 'CRM_CONTACT_NOT_FOUND' using errcode = 'P0002';
    end if;
    v_can_touch_contact := v_is_admin or v_contact.assigned_coach_user_id = v_actor;
    if not v_can_touch_contact then
      raise exception 'CRM_FORBIDDEN' using errcode = '42501';
    end if;
    if coalesce(_command->>'expected_updated_at','') = '' then
      raise exception 'CRM_EXPECTED_VERSION_REQUIRED' using errcode = '22023';
    end if;
    begin v_expected := (_command->>'expected_updated_at')::timestamptz;
    exception when others then raise exception 'CRM_EXPECTED_VERSION_INVALID' using errcode = '22023'; end;
    if v_contact.updated_at is distinct from v_expected then
      raise exception 'CRM_VERSION_CONFLICT' using errcode = '40001';
    end if;

    if v_action = 'contact.update' then
      if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
        raise exception 'CRM_PATCH_INVALID' using errcode = '22023';
      end if;
      select array_agg(k order by k) into v_unknown
        from jsonb_object_keys(v_patch) k
       where k not in ('first_name','last_name','email','phone','entity_name','entity_type','title','lifecycle_stage','source','tags','primary_offer','current_notes','do_not_contact','website','linkedin_url','street_address','city','state','zip_code','funding_goal','monthly_revenue');
      if coalesce(array_length(v_unknown, 1), 0) > 0 then
        raise exception 'CRM_PATCH_FIELDS_INVALID:%', array_to_string(v_unknown, ',') using errcode = '22023';
      end if;
      if v_patch ? 'lifecycle_stage' and coalesce(v_patch->>'lifecycle_stage','') not in (
        'new_lead','qualified','nurturing','hot_lead','negotiating','won','client_active','client_paused','client_churned','client_funded','client_alumni'
      ) then raise exception 'CRM_LIFECYCLE_INVALID' using errcode = '22023'; end if;
      update public.clients c set
        first_name = case when v_patch ? 'first_name' then coalesce(nullif(btrim(v_patch->>'first_name'),''), c.first_name) else c.first_name end,
        last_name = case when v_patch ? 'last_name' then coalesce(nullif(btrim(v_patch->>'last_name'),''), c.last_name) else c.last_name end,
        email = case when v_patch ? 'email' then nullif(btrim(v_patch->>'email'),'') else c.email end,
        phone = case when v_patch ? 'phone' then nullif(btrim(v_patch->>'phone'),'') else c.phone end,
        entity_name = case when v_patch ? 'entity_name' then nullif(btrim(v_patch->>'entity_name'),'') else c.entity_name end,
        entity_type = case when v_patch ? 'entity_type' then nullif(btrim(v_patch->>'entity_type'),'') else c.entity_type end,
        title = case when v_patch ? 'title' then nullif(btrim(v_patch->>'title'),'') else c.title end,
        lifecycle_stage = case when v_patch ? 'lifecycle_stage' then v_patch->>'lifecycle_stage' else c.lifecycle_stage end,
        source = case when v_patch ? 'source' then nullif(btrim(v_patch->>'source'),'') else c.source end,
        tags = case when v_patch ? 'tags' and jsonb_typeof(v_patch->'tags') = 'array' then array(select jsonb_array_elements_text(v_patch->'tags')) else c.tags end,
        primary_offer = case when v_patch ? 'primary_offer' then nullif(btrim(v_patch->>'primary_offer'),'') else c.primary_offer end,
        current_notes = case when v_patch ? 'current_notes' then nullif(v_patch->>'current_notes','') else c.current_notes end,
        do_not_contact = case when v_patch ? 'do_not_contact' then (v_patch->>'do_not_contact')::boolean else c.do_not_contact end,
        website = case when v_patch ? 'website' then nullif(btrim(v_patch->>'website'),'') else c.website end,
        linkedin_url = case when v_patch ? 'linkedin_url' then nullif(btrim(v_patch->>'linkedin_url'),'') else c.linkedin_url end,
        street_address = case when v_patch ? 'street_address' then nullif(btrim(v_patch->>'street_address'),'') else c.street_address end,
        city = case when v_patch ? 'city' then nullif(btrim(v_patch->>'city'),'') else c.city end,
        state = case when v_patch ? 'state' then nullif(btrim(v_patch->>'state'),'') else c.state end,
        zip_code = case when v_patch ? 'zip_code' then nullif(btrim(v_patch->>'zip_code'),'') else c.zip_code end,
        funding_goal = case when v_patch ? 'funding_goal' then (v_patch->>'funding_goal')::numeric else c.funding_goal end,
        monthly_revenue = case when v_patch ? 'monthly_revenue' then (v_patch->>'monthly_revenue')::numeric else c.monthly_revenue end,
        updated_at = clock_timestamp()
      where c.id = v_contact.id
      returning * into v_contact;
    elsif v_action = 'contact.archive' then
      update public.clients c set status = 'archived', updated_at = clock_timestamp()
       where c.id = v_contact.id returning * into v_contact;
    elsif v_action = 'contact.restore' then
      update public.clients c set status = 'active', updated_at = clock_timestamp()
       where c.id = v_contact.id returning * into v_contact;
    elsif v_action in ('contact.link_company','contact.unlink_company') then
      if v_action = 'contact.link_company' then
        if coalesce(_command->>'company_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'CRM_BUSINESS_NOT_FOUND' using errcode = 'P0002';
        end if;
        select * into v_business from public.businesses b
         where b.id = (_command->>'company_id')::uuid and b.tenant_id = v_tenant;
        if not found then raise exception 'CRM_BUSINESS_NOT_FOUND' using errcode = 'P0002'; end if;
      end if;
      update public.clients c
         set primary_business_id = case when v_action = 'contact.link_company' then v_business.id else null end,
             updated_at = clock_timestamp()
       where c.id = v_contact.id returning * into v_contact;
    end if;
    v_capability := 'crm_update_contact';

  elsif v_action = 'task.create' then
    if jsonb_typeof(v_patch) <> 'object' or coalesce(btrim(v_patch->>'title'),'') = '' then
      raise exception 'CRM_PATCH_INVALID' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_unknown from jsonb_object_keys(v_patch) k
     where k not in ('title','description','assignee_user_id','contact_id','company_id','deal_id','due_date','track','metadata');
    if coalesce(array_length(v_unknown, 1), 0) > 0 then
      raise exception 'CRM_PATCH_FIELDS_INVALID:%', array_to_string(v_unknown, ',') using errcode = '22023';
    end if;
    if v_patch ? 'contact_id' then
      select * into v_contact from public.clients c
       where c.id = (v_patch->>'contact_id')::uuid and c.tenant_id = v_tenant;
      if not found then raise exception 'CRM_CONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
      if not (v_is_admin or v_contact.assigned_coach_user_id = v_actor) then
        raise exception 'CRM_FORBIDDEN' using errcode = '42501';
      end if;
    end if;
    if coalesce(v_patch->>'assignee_user_id','') = '' and v_contact.linked_user_id is not null then
      v_patch := v_patch || jsonb_build_object('assignee_user_id',v_contact.linked_user_id);
    end if;
    if coalesce(v_patch->>'assignee_user_id','') = '' then
      v_patch := v_patch || jsonb_build_object('assignee_user_id',v_actor);
    end if;
    if not (
      exists(select 1 from public.tenant_members tm where tm.tenant_id=v_tenant and tm.user_id=(v_patch->>'assignee_user_id')::uuid and tm.status='active')
      or exists(select 1 from public.clients c where c.tenant_id=v_tenant and c.linked_user_id=(v_patch->>'assignee_user_id')::uuid
        and (v_is_admin or c.assigned_coach_user_id=v_actor))
    ) then raise exception 'CRM_ASSIGNEE_FORBIDDEN' using errcode = '42501'; end if;
    if v_patch ? 'company_id' and not exists(select 1 from public.businesses b where b.id=(v_patch->>'company_id')::uuid and b.tenant_id=v_tenant) then
      raise exception 'CRM_BUSINESS_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_patch ? 'deal_id' and not exists(select 1 from public.deals d where d.id=(v_patch->>'deal_id')::uuid and d.tenant_id=v_tenant) then
      raise exception 'CRM_DEAL_NOT_FOUND' using errcode = 'P0002';
    end if;
    insert into public.tasks(tenant_id,user_id,title,description,biz_id,deal_id,due_date,track,status,metadata,updated_at)
    values(v_tenant,(v_patch->>'assignee_user_id')::uuid,btrim(v_patch->>'title'),nullif(btrim(v_patch->>'description'),''),
      nullif(v_patch->>'company_id','')::uuid,nullif(v_patch->>'deal_id','')::uuid,nullif(v_patch->>'due_date','')::timestamptz,
      nullif(btrim(v_patch->>'track'),''),'pending',case when jsonb_typeof(v_patch->'metadata')='object' then v_patch->'metadata' else null end,clock_timestamp())
    returning * into v_task;
    v_capability := 'crm_create_task';

  elsif v_action like 'task.%' then
    if coalesce(_command->>'task_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'CRM_TASK_NOT_FOUND' using errcode = 'P0002';
    end if;
    select * into v_task from public.tasks t where t.id=(_command->>'task_id')::uuid and t.tenant_id=v_tenant for update;
    if not found then raise exception 'CRM_TASK_NOT_FOUND' using errcode = 'P0002'; end if;
    if not (v_is_admin or v_task.user_id=v_actor or exists(
      select 1 from public.clients c where c.tenant_id=v_tenant and c.linked_user_id=v_task.user_id and c.assigned_coach_user_id=v_actor
    )) then raise exception 'CRM_FORBIDDEN' using errcode = '42501'; end if;
    if coalesce(_command->>'expected_updated_at','') = '' then raise exception 'CRM_EXPECTED_VERSION_REQUIRED' using errcode = '22023'; end if;
    begin v_expected := (_command->>'expected_updated_at')::timestamptz;
    exception when others then raise exception 'CRM_EXPECTED_VERSION_INVALID' using errcode = '22023'; end;
    if coalesce(v_task.updated_at,v_task.created_at) is distinct from v_expected then raise exception 'CRM_VERSION_CONFLICT' using errcode = '40001'; end if;

    if v_action = 'task.update' then
      if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then raise exception 'CRM_PATCH_INVALID' using errcode = '22023'; end if;
      select array_agg(k order by k) into v_unknown from jsonb_object_keys(v_patch) k where k not in ('title','description','track','metadata');
      if coalesce(array_length(v_unknown,1),0)>0 then raise exception 'CRM_PATCH_FIELDS_INVALID:%',array_to_string(v_unknown,',') using errcode='22023'; end if;
      if v_patch ? 'title' and coalesce(btrim(v_patch->>'title'),'')='' then raise exception 'CRM_TASK_TITLE_REQUIRED' using errcode='22023'; end if;
      update public.tasks t set
        title=case when v_patch ? 'title' then btrim(v_patch->>'title') else t.title end,
        description=case when v_patch ? 'description' then nullif(btrim(v_patch->>'description'),'') else t.description end,
        track=case when v_patch ? 'track' then nullif(btrim(v_patch->>'track'),'') else t.track end,
        metadata=case when v_patch ? 'metadata' and jsonb_typeof(v_patch->'metadata')='object' then v_patch->'metadata' else t.metadata end,
        updated_at=clock_timestamp() where t.id=v_task.id returning * into v_task;
      v_capability := 'crm_update_task';
    elsif v_action = 'task.reschedule' then
      if not (v_patch ? 'due_date') then raise exception 'CRM_DUE_DATE_REQUIRED' using errcode='22023'; end if;
      update public.tasks t set due_date=nullif(v_patch->>'due_date','')::timestamptz,updated_at=clock_timestamp()
       where t.id=v_task.id returning * into v_task;
      v_capability := 'crm_update_task';
    elsif v_action = 'task.complete' then
      update public.tasks t set status='completed',updated_at=clock_timestamp() where t.id=v_task.id returning * into v_task;
      v_capability := 'crm_update_task';
    elsif v_action = 'task.reopen' then
      update public.tasks t set status='pending',updated_at=clock_timestamp() where t.id=v_task.id returning * into v_task;
      v_capability := 'crm_update_task';
    elsif v_action = 'task.assign' then
      if not v_is_admin then raise exception 'CRM_ASSIGNMENT_APPROVAL_REQUIRED' using errcode='42501'; end if;
      if coalesce(v_patch->>'assignee_user_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'CRM_ASSIGNEE_FORBIDDEN' using errcode='42501';
      end if;
      if not (
        exists(select 1 from public.tenant_members tm where tm.tenant_id=v_tenant and tm.user_id=(v_patch->>'assignee_user_id')::uuid and tm.status='active')
        or exists(select 1 from public.clients c where c.tenant_id=v_tenant and c.linked_user_id=(v_patch->>'assignee_user_id')::uuid)
      ) then raise exception 'CRM_ASSIGNEE_FORBIDDEN' using errcode='42501'; end if;
      update public.tasks t set user_id=(v_patch->>'assignee_user_id')::uuid,updated_at=clock_timestamp()
       where t.id=v_task.id returning * into v_task;
      v_capability := 'plan_assign_task';
    end if;

  elsif v_action = 'activity.log' then
    if coalesce(_command->>'contact_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'CRM_CONTACT_NOT_FOUND' using errcode='P0002';
    end if;
    select * into v_contact from public.clients c where c.id=(_command->>'contact_id')::uuid and c.tenant_id=v_tenant for update;
    if not found then raise exception 'CRM_CONTACT_NOT_FOUND' using errcode='P0002'; end if;
    if not (v_is_admin or v_contact.assigned_coach_user_id=v_actor) then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
    if coalesce(v_patch->>'channel','') not in ('call','email','sms','meeting','note') then raise exception 'CRM_ACTIVITY_CHANNEL_INVALID' using errcode='22023'; end if;
    if coalesce(btrim(v_patch->>'subject'),'')='' and coalesce(btrim(v_patch->>'body'),'')='' then raise exception 'CRM_ACTIVITY_CONTENT_REQUIRED' using errcode='22023'; end if;
    insert into public.client_notes(contact_id,tenant_id,author_user_id,body,tags)
    values(
      v_contact.id,v_tenant,v_actor,
      concat_ws(E'
',nullif(btrim(v_patch->>'subject'),''),nullif(btrim(v_patch->>'body'),'')),
      array['activity',v_patch->>'channel']
    ) returning * into v_note;
    update public.clients c
       set last_contacted_at=clock_timestamp(),updated_at=clock_timestamp()
     where c.id=v_contact.id returning * into v_contact;
    v_readback:=jsonb_build_object(
      'id',v_note.id,'contact_id',v_contact.id,'client_ref',v_contact.account_number,
      'channel',v_patch->>'channel','storage','client_notes','subject',nullif(btrim(v_patch->>'subject'),''),
      'body',v_note.body,'status','logged','created_at',v_note.created_at
    );
    v_capability := 'crm_log_activity';
  elsif v_action = 'company.create' then
    if coalesce(_command->>'contact_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'CRM_CONTACT_NOT_FOUND' using errcode = 'P0002';
    end if;
    select * into v_contact from public.clients c
     where c.id = (_command->>'contact_id')::uuid and c.tenant_id = v_tenant
     for update;
    if not found then raise exception 'CRM_CONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
    if not (v_is_admin or v_contact.assigned_coach_user_id = v_actor) then
      raise exception 'CRM_FORBIDDEN' using errcode = '42501';
    end if;
    if v_contact.linked_user_id is null then
      raise exception 'CRM_COMPANY_OWNER_SETUP_REQUIRED' using errcode = 'P0001';
    end if;
    if jsonb_typeof(v_patch) <> 'object' or coalesce(btrim(v_patch->>'legal_name'),'') = '' then
      raise exception 'CRM_PATCH_INVALID' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_unknown from jsonb_object_keys(v_patch) k
     where k not in ('legal_name','entity_type','dba','website','business_email','business_phone','naics','revenue_band','state_of_formation');
    if coalesce(array_length(v_unknown, 1), 0) > 0 then
      raise exception 'CRM_PATCH_FIELDS_INVALID:%', array_to_string(v_unknown, ',') using errcode = '22023';
    end if;
    insert into public.businesses(
      tenant_id, owner_user_id, legal_name, entity_type, dba, website, business_email, business_phone,
      naics, revenue_band, state_of_formation, is_active, is_primary, updated_at
    ) values (
      v_tenant, v_contact.linked_user_id, btrim(v_patch->>'legal_name'), nullif(v_patch->>'entity_type','')::public.entity_type, nullif(btrim(v_patch->>'dba'),''),
      nullif(btrim(v_patch->>'website'),''), nullif(btrim(v_patch->>'business_email'),''),
      nullif(btrim(v_patch->>'business_phone'),''), nullif(btrim(v_patch->>'naics'),''),
      nullif(btrim(v_patch->>'revenue_band'),''), nullif(btrim(v_patch->>'state_of_formation'),''),
      true, not exists(select 1 from public.businesses b where b.tenant_id = v_tenant and b.owner_user_id = v_contact.linked_user_id and b.is_active), clock_timestamp()
    ) returning * into v_business;
    if v_contact.primary_business_id is null then
      update public.clients set primary_business_id = v_business.id, updated_at = clock_timestamp()
       where id = v_contact.id returning * into v_contact;
    end if;
    v_capability := 'business_create';

  elsif v_action like 'company.%' then
    if coalesce(_command->>'company_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'CRM_BUSINESS_NOT_FOUND' using errcode = 'P0002';
    end if;
    select * into v_business from public.businesses b
     where b.id = (_command->>'company_id')::uuid and b.tenant_id = v_tenant
     for update;
    if not found then raise exception 'CRM_BUSINESS_NOT_FOUND' using errcode = 'P0002'; end if;
    if not v_is_admin and not exists (
      select 1 from public.clients c
       where c.tenant_id = v_tenant and c.assigned_coach_user_id = v_actor
         and (c.primary_business_id = v_business.id or c.linked_user_id = v_business.owner_user_id)
    ) then raise exception 'CRM_FORBIDDEN' using errcode = '42501'; end if;
    if coalesce(_command->>'expected_updated_at','') = '' then
      raise exception 'CRM_EXPECTED_VERSION_REQUIRED' using errcode = '22023';
    end if;
    begin v_expected := (_command->>'expected_updated_at')::timestamptz;
    exception when others then raise exception 'CRM_EXPECTED_VERSION_INVALID' using errcode = '22023'; end;
    if coalesce(v_business.updated_at, v_business.created_at) is distinct from v_expected then
      raise exception 'CRM_VERSION_CONFLICT' using errcode = '40001';
    end if;
    if v_action = 'company.update' then
      if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
        raise exception 'CRM_PATCH_INVALID' using errcode = '22023';
      end if;
      select array_agg(k order by k) into v_unknown from jsonb_object_keys(v_patch) k
       where k not in ('legal_name','entity_type','dba','website','business_email','business_phone','naics','revenue_band','state_of_formation');
      if coalesce(array_length(v_unknown, 1), 0) > 0 then
        raise exception 'CRM_PATCH_FIELDS_INVALID:%', array_to_string(v_unknown, ',') using errcode = '22023';
      end if;
      update public.businesses b set
        legal_name = case when v_patch ? 'legal_name' then coalesce(nullif(btrim(v_patch->>'legal_name'),''), b.legal_name) else b.legal_name end,
        entity_type = case when v_patch ? 'entity_type' then nullif(v_patch->>'entity_type','')::public.entity_type else b.entity_type end,
        dba = case when v_patch ? 'dba' then nullif(btrim(v_patch->>'dba'),'') else b.dba end,
        website = case when v_patch ? 'website' then nullif(btrim(v_patch->>'website'),'') else b.website end,
        business_email = case when v_patch ? 'business_email' then nullif(btrim(v_patch->>'business_email'),'') else b.business_email end,
        business_phone = case when v_patch ? 'business_phone' then nullif(btrim(v_patch->>'business_phone'),'') else b.business_phone end,
        naics = case when v_patch ? 'naics' then nullif(btrim(v_patch->>'naics'),'') else b.naics end,
        revenue_band = case when v_patch ? 'revenue_band' then nullif(btrim(v_patch->>'revenue_band'),'') else b.revenue_band end,
        state_of_formation = case when v_patch ? 'state_of_formation' then nullif(btrim(v_patch->>'state_of_formation'),'') else b.state_of_formation end,
        updated_at = clock_timestamp()
      where b.id = v_business.id returning * into v_business;
    elsif v_action = 'company.archive' then
      update public.businesses b set is_active = false, is_primary = false, updated_at = clock_timestamp()
       where b.id = v_business.id returning * into v_business;
      update public.clients c set primary_business_id = null, updated_at = clock_timestamp()
       where c.tenant_id = v_tenant and c.primary_business_id = v_business.id;
    elsif v_action = 'company.restore' then
      update public.businesses b set is_active = true, updated_at = clock_timestamp()
       where b.id = v_business.id returning * into v_business;
    end if;
    v_capability := 'business_update';
  end if;

  if v_action like 'deal.%' then
    null; -- readback came from the canonical Pipeline executor above.
  elsif v_action like 'contact.%' then
    select jsonb_build_object(
      'id',c.id,'client_ref',c.account_number,'first_name',c.first_name,'last_name',c.last_name,
      'email',c.email,'phone',c.phone,'entity_name',c.entity_name,'entity_type',c.entity_type,'title',c.title,
      'lifecycle_stage',c.lifecycle_stage,'status',c.status,'tags',c.tags,
      'primary_business_id',c.primary_business_id,'do_not_contact',c.do_not_contact,'website',c.website,'linkedin_url',c.linkedin_url,
      'street_address',c.street_address,'city',c.city,'state',c.state,'zip_code',c.zip_code,
      'funding_goal',c.funding_goal,'monthly_revenue',c.monthly_revenue,'updated_at',c.updated_at
    ) into v_readback from public.clients c where c.id = v_contact.id and c.tenant_id = v_tenant;
  elsif v_action like 'company.%' then
    select jsonb_build_object(
      'id',b.id,'legal_name',b.legal_name,'entity_type',b.entity_type,'dba',b.dba,'website',b.website,
      'business_email',b.business_email,'business_phone',b.business_phone,'naics',b.naics,
      'revenue_band',b.revenue_band,'state_of_formation',b.state_of_formation,
      'is_active',b.is_active,'is_primary',b.is_primary,'updated_at',b.updated_at
    ) into v_readback from public.businesses b where b.id = v_business.id and b.tenant_id = v_tenant;
  elsif v_action like 'task.%' then
    select jsonb_build_object(
      'id',t.id,'title',t.title,'description',t.description,'status',t.status,'assignee_user_id',t.user_id,
      'company_id',t.biz_id,'deal_id',t.deal_id,'due_date',t.due_date,'track',t.track,
      'metadata',t.metadata,'updated_at',t.updated_at
    ) into v_readback from public.tasks t where t.id=v_task.id and t.tenant_id=v_tenant;
  end if;
  if v_readback is null then
    raise exception 'CRM_READBACK_FAILED' using errcode = 'P0002';
  end if;

  v_run_id := (
    substr(md5(v_tenant::text || ':' || v_actor::text || ':' || _idempotency_key),1,8) || '-' ||
    substr(md5(v_tenant::text || ':' || v_actor::text || ':' || _idempotency_key),9,4) || '-' ||
    substr(md5(v_tenant::text || ':' || v_actor::text || ':' || _idempotency_key),13,4) || '-' ||
    substr(md5(v_tenant::text || ':' || v_actor::text || ':' || _idempotency_key),17,4) || '-' ||
    substr(md5(v_tenant::text || ':' || v_actor::text || ':' || _idempotency_key),21,12)
  )::uuid;

  -- Receipt failure aborts the transaction. This command never reports an unrecorded success.
  perform public.record_capability_run(
    v_tenant, v_actor, v_capability, 'capability_succeeded', v_run_id,
    null, null, null, null,
    jsonb_build_object(
      'action',v_action,
      'record_kind',case when v_action like 'contact.%' then 'contact' when v_action like 'company.%' then 'company' when v_action like 'task.%' then 'task' when v_action like 'deal.%' then 'deal' else 'activity' end,
      'record_id',v_readback->>'id',
      'client_ref',v_readback->>'client_ref',
      'idempotency_key',_idempotency_key
    )
  );

  v_result := jsonb_build_object(
    'ok',true,
    'action',v_action,
    'outcome','succeeded',
    'readback',v_readback,
    'receipt_recorded',true,
    'correlation_id',v_run_id,
    'replayed',false
  );

  insert into public.crm_command_results(tenant_id,idempotency_key,command_hash,actor_user_id,action,result)
  values(v_tenant,_idempotency_key,v_hash,v_actor,v_action,v_result);

  return v_result;
end
$$;

revoke all on function public.execute_crm_command(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.execute_crm_command(uuid,uuid,jsonb,text) to service_role;

comment on function public.execute_crm_command(uuid,uuid,jsonb,text) is
  'Internal canonical governed CRM/Pipeline executor. Only the verified server action door may call it; that door derives tenant and actor from the JWT, and this function revalidates their active tenant role.';

-- Extend the ONE tenant Pipeline command core; do not create a parallel deal registry or write path.
-- Paige may enter this existing core only from the service-only CRM executor after its shared decision.
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
  _approval_channel text:=current_setting('app.crm_approval_channel',true);
begin
  if _action not in ('create_deal','update_deal','move_deal','record_outcome','reopen_deal') then return public.configure_tenant_pipeline_core_identity_pre_command_desk(_tenant_id,_command,_idempotency_key,_actor_kind); end if;
  if _caller is null or _tenant is null or not (public.is_platform_owner() or _tenant=public.current_user_tenant_id()) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if not (public.is_platform_owner() or public.is_tenant_admin(_tenant)) then raise exception 'PIPELINE_FORBIDDEN' using errcode='42501'; end if;
  if _actor_kind not in ('human','paige') then raise exception 'PIPELINE_ACTOR_INVALID' using errcode='22023'; end if;
  if _actor_kind='paige' and auth.role() is distinct from 'service_role' then raise exception 'PIPELINE_GOVERNED_EXECUTOR_REQUIRED' using errcode='42501'; end if;
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
    if nullif(_command->>'ownerUserId','') is not null and not exists(
      select 1 from public.tenant_members tm where tm.tenant_id=_tenant and tm.user_id=(_command->>'ownerUserId')::uuid and tm.status='active'
    ) then raise exception 'PIPELINE_OWNER_INVALID' using errcode='42501'; end if;
    if _command ? 'valueCents' and (jsonb_typeof(_command->'valueCents') is distinct from 'number'
      or (_command->>'valueCents')::numeric<0 or (_command->>'valueCents')::numeric<>trunc((_command->>'valueCents')::numeric))
    then raise exception 'PIPELINE_VALUE_INVALID' using errcode='22023'; end if;
    if _command ? 'currency' and coalesce(_command->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'PIPELINE_CURRENCY_INVALID' using errcode='22023'; end if;
    insert into public.deals(title,pipeline_id,stage_id,contact_client_id,owner_user_id,value_cents,currency,expected_close_date,offer_type,status,source,tags,notes,created_by,tenant_id)
    values(btrim(_command->>'title'),_pipeline.id,_stage.id,nullif(_command->>'clientId','')::uuid,coalesce(nullif(_command->>'ownerUserId','')::uuid,_caller),
      coalesce((_command->>'valueCents')::bigint,0),coalesce(nullif(_command->>'currency',''),'USD'),nullif(_command->>'expectedCloseDate','')::date,
      nullif(btrim(_command->>'offerType'),''),'open',case when _actor_kind='paige' then 'paige' else 'owner_entered' end,
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
      if nullif(_command->>'clientId','') is not null and not exists(select 1 from public.clients c where c.id=(_command->>'clientId')::uuid and c.tenant_id=_tenant) then raise exception 'PIPELINE_CLIENT_INVALID' using errcode='42501'; end if;
      if nullif(_command->>'ownerUserId','') is not null and not exists(
        select 1 from public.tenant_members tm where tm.tenant_id=_tenant and tm.user_id=(_command->>'ownerUserId')::uuid and tm.status='active'
      ) then raise exception 'PIPELINE_OWNER_INVALID' using errcode='42501'; end if;
      if _command ? 'valueCents' and (jsonb_typeof(_command->'valueCents') is distinct from 'number'
        or (_command->>'valueCents')::numeric<0 or (_command->>'valueCents')::numeric<>trunc((_command->>'valueCents')::numeric))
      then raise exception 'PIPELINE_VALUE_INVALID' using errcode='22023'; end if;
      if _command ? 'currency' and coalesce(_command->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'PIPELINE_CURRENCY_INVALID' using errcode='22023'; end if;
      update public.deals set
        title=case when _command ? 'title' then btrim(_command->>'title') else title end,
        contact_client_id=case when _command ? 'clientId' then nullif(_command->>'clientId','')::uuid else contact_client_id end,
        owner_user_id=case when _command ? 'ownerUserId' then nullif(_command->>'ownerUserId','')::uuid else owner_user_id end,
        value_cents=case when _command ? 'valueCents' then (_command->>'valueCents')::bigint else value_cents end,
        currency=case when _command ? 'currency' then _command->>'currency' else currency end,
        expected_close_date=case when _command ? 'expectedCloseDate' then nullif(_command->>'expectedCloseDate','')::date else expected_close_date end,
        offer_type=case when _command ? 'offerType' then nullif(btrim(_command->>'offerType'),'') else offer_type end,
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
        if _stage.move_policy='approval' and _approval_channel is distinct from 'operator_card' then raise exception 'PIPELINE_APPROVAL_REQUIRED' using errcode='42501'; end if;
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
      if _stage.move_policy='approval' and _approval_channel is distinct from 'operator_card' then raise exception 'PIPELINE_APPROVAL_REQUIRED' using errcode='42501'; end if;
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
revoke all on function public.configure_tenant_pipeline_core_identity(uuid,jsonb,text,text) from public,anon,authenticated,service_role;
