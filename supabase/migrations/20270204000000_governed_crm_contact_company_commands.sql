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

-- An invoice and its optional deal must belong to the same tenant. The historical single-column
-- FK cannot express this invariant and its ON DELETE SET NULL could otherwise detach a foreign
-- tenant's invoice. Validation intentionally fails closed if legacy corruption already exists.
do $$
begin
  if not exists(select 1 from pg_catalog.pg_constraint where conname='deals_tenant_id_id_crm_key' and conrelid='public.deals'::pg_catalog.regclass) then
    alter table public.deals add constraint deals_tenant_id_id_crm_key unique (tenant_id,id);
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint where conname='paige_invoices_tenant_deal_crm_fk' and conrelid='public.paige_invoices'::pg_catalog.regclass) then
    alter table public.paige_invoices add constraint paige_invoices_tenant_deal_crm_fk
      foreign key (tenant_id,deal_id) references public.deals(tenant_id,id) on delete no action not valid;
  end if;
end$$;
alter table public.paige_invoices validate constraint paige_invoices_tenant_deal_crm_fk;

-- One tag invariant for single-record and preview-bound bulk contact commands.
create or replace function public.crm_tags_are_valid(_tags jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  if pg_catalog.jsonb_typeof(_tags) is distinct from 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(_tags)>50 then return false; end if;
  return not exists(
    select 1 from pg_catalog.jsonb_array_elements(_tags) tag
     where pg_catalog.jsonb_typeof(tag) is distinct from 'string'
        or pg_catalog.length(tag #>> '{}')>80
        or pg_catalog.btrim(tag #>> '{}')=''
  );
end$$;
revoke all on function public.crm_tags_are_valid(jsonb) from public,anon,authenticated,service_role;

-- One current-record authorization rule for both mutation and durable replay. Owners/admins
-- retain tenant-wide CRM access; coaches are limited to their assigned contacts, related
-- companies, and tasks they or their assigned contacts own. Deals remain admin-only because the
-- canonical Pipeline command core requires tenant-admin authority.
create or replace function public.crm_actor_can_access_record(
  _tenant_id uuid,_actor_id uuid,_record_kind text,_record_id uuid
) returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_role text;
begin
  if _tenant_id is null or _actor_id is null or _record_id is null then return false; end if;
  select tm.role into v_role from public.tenant_members tm
   where tm.tenant_id=_tenant_id and tm.user_id=_actor_id and tm.status='active' and tm.role in ('owner','admin','coach');
  if v_role in ('owner','admin') then return true; end if;
  if v_role is distinct from 'coach' then return false; end if;
  if _record_kind='contact' then
    return exists(select 1 from public.clients c where c.id=_record_id and c.tenant_id=_tenant_id and c.assigned_coach_user_id=_actor_id);
  elsif _record_kind='company' then
    return exists(select 1 from public.businesses b join public.clients c on c.tenant_id=b.tenant_id
      and (c.primary_business_id=b.id or c.linked_user_id=b.owner_user_id)
      where b.id=_record_id and b.tenant_id=_tenant_id and c.assigned_coach_user_id=_actor_id);
  elsif _record_kind='task' then
    return exists(select 1 from public.tasks t where t.id=_record_id and t.tenant_id=_tenant_id and (
      t.user_id=_actor_id or exists(select 1 from public.clients c where c.tenant_id=_tenant_id
        and c.linked_user_id=t.user_id and c.assigned_coach_user_id=_actor_id)));
  end if;
  return false;
end$$;
revoke all on function public.crm_actor_can_access_record(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.execute_crm_command_reversible(
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
  v_reported_action text;
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
  v_company_owner uuid;
  v_created record;
begin
  -- Only the verified server action door can reach this executor. Tenant and actor are
  -- resolved there from the caller JWT, then re-bound to an active role again here.
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then
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
  perform 1 from public.tenants tenant_row where tenant_row.id=v_tenant and tenant_row.status in ('trial','active','past_due') for update;
  if not found then raise exception 'CRM_TENANT_SUSPENDED' using errcode='42501'; end if;

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

  v_reported_action := case when v_action = 'deal.update' and _command->>'receipt_action' in ('deal.assign_owner','deal.assign_contact') then _command->>'receipt_action' else v_action end;

  if v_action not in (
    'contact.create','contact.update','contact.archive','contact.restore',
    'contact.link_company','contact.unlink_company',
    'company.create','company.update','company.archive','company.restore',
    'task.create','task.update','task.assign','task.reschedule','task.complete','task.reopen','task.cancel',
    'activity.log','deal.create','deal.update','deal.move','deal.close','deal.reopen'
  ) then
    raise exception 'CRM_ACTION_UNAVAILABLE' using errcode = '0A000';
  end if;
  if v_action in ('contact.create','contact.update') and v_patch ? 'tags'
    and not public.crm_tags_are_valid(v_patch->'tags') then
    raise exception 'CRM_TAGS_INVALID' using errcode='22023';
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
          if (_command ? 'owner_user_id' and coalesce(_command->>'receipt_action','')<>'deal.assign_owner')
            or (_command ? 'contact_id' and coalesce(_command->>'receipt_action','')<>'deal.assign_contact') then
            raise exception 'CRM_DEAL_ASSIGNMENT_ACTION_REQUIRED' using errcode='42501';
          end if;
          if not (_command ? 'title' or _command ? 'value_cents' or _command ? 'currency'
            or _command ? 'expected_close_date' or _command ? 'offer_type' or _command ? 'tags' or _command ? 'notes'
            or (_command ? 'owner_user_id' and _command->>'receipt_action'='deal.assign_owner')
            or (_command ? 'contact_id' and _command->>'receipt_action'='deal.assign_contact')) then
            raise exception 'CRM_DEAL_PATCH_REQUIRED' using errcode='22023';
          end if;
          v_pipeline_result:=public.configure_tenant_pipeline_core_identity(v_tenant,
            jsonb_strip_nulls(jsonb_build_object(
              'type','update-deal','dealId',_command->>'deal_id','expectedVersion',_command->'expected_version',
              'title',_command->>'title','valueCents',_command->'value_cents','currency',_command->>'currency',
              'expectedCloseDate',_command->>'expected_close_date','offerType',_command->>'offer_type',
              'tags',_command->'tags','notes',_command->>'notes'
            ))
            || case when _command ? 'contact_id' then jsonb_build_object('clientId',_command->'contact_id') else '{}'::jsonb end
            || case when _command ? 'owner_user_id' then jsonb_build_object('ownerUserId',_command->'owner_user_id') else '{}'::jsonb end,
            _idempotency_key,'paige');
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
    v_capability:=case v_reported_action when 'deal.create' then 'deal_create' when 'deal.update' then 'crm_update_deal' when 'deal.assign_owner' then 'crm_assign_deal_owner' when 'deal.assign_contact' then 'crm_assign_deal_contact' when 'deal.close' then 'crm_close_deal' when 'deal.reopen' then 'crm_reopen_deal' else 'deal_move_stage' end;

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
      p_channel := 'api'
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
    v_can_touch_contact := public.crm_actor_can_access_record(v_tenant,v_actor,'contact',v_contact.id);
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
      if v_contact.merged_into_contact_id is not null then
        raise exception 'CRM_CONTACT_MERGED' using errcode = '42501';
      end if;
      update public.clients c set status = 'active', updated_at = clock_timestamp()
       where c.id = v_contact.id returning * into v_contact;
    elsif v_action in ('contact.link_company','contact.unlink_company') then
      if v_action = 'contact.link_company' then
        if coalesce(_command->>'company_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'CRM_BUSINESS_NOT_FOUND' using errcode = 'P0002';
        end if;
        select * into v_business from public.businesses b
         where b.id = (_command->>'company_id')::uuid and b.tenant_id = v_tenant and b.is_active is true
         for update;
        if not found then raise exception 'CRM_BUSINESS_NOT_FOUND' using errcode = 'P0002'; end if;
      end if;
      update public.clients c
         set primary_business_id = case when v_action = 'contact.link_company' then v_business.id else null end,
             updated_at = clock_timestamp()
       where c.id = v_contact.id returning * into v_contact;
    end if;
    v_capability := case v_action when 'contact.update' then 'crm_update_contact' when 'contact.archive' then 'crm_archive_contact' when 'contact.restore' then 'crm_restore_contact' when 'contact.link_company' then 'crm_link_contact_company' else 'crm_unlink_contact_company' end;

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
      if not public.crm_actor_can_access_record(v_tenant,v_actor,'contact',v_contact.id) then
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
    if not public.crm_actor_can_access_record(v_tenant,v_actor,'task',v_task.id) then raise exception 'CRM_FORBIDDEN' using errcode = '42501'; end if;
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
      v_capability := case v_action when 'task.update' then 'crm_update_task' when 'task.reschedule' then 'crm_reschedule_task' when 'task.complete' then 'crm_complete_task' when 'task.reopen' then 'crm_reopen_task' else 'crm_update_task' end;
    elsif v_action = 'task.reschedule' then
      if not (v_patch ? 'due_date') then raise exception 'CRM_DUE_DATE_REQUIRED' using errcode='22023'; end if;
      update public.tasks t set due_date=nullif(v_patch->>'due_date','')::timestamptz,updated_at=clock_timestamp()
       where t.id=v_task.id returning * into v_task;
      v_capability := case v_action when 'task.update' then 'crm_update_task' when 'task.reschedule' then 'crm_reschedule_task' when 'task.complete' then 'crm_complete_task' when 'task.reopen' then 'crm_reopen_task' else 'crm_update_task' end;
    elsif v_action = 'task.complete' then
      update public.tasks t set status='completed',updated_at=clock_timestamp() where t.id=v_task.id returning * into v_task;
      v_capability := case v_action when 'task.update' then 'crm_update_task' when 'task.reschedule' then 'crm_reschedule_task' when 'task.complete' then 'crm_complete_task' when 'task.reopen' then 'crm_reopen_task' else 'crm_update_task' end;
    elsif v_action = 'task.reopen' then
      update public.tasks t set status='pending',updated_at=clock_timestamp() where t.id=v_task.id returning * into v_task;
      v_capability := 'crm_reopen_task';
    elsif v_action = 'task.cancel' then
      update public.tasks t set status='cancelled',updated_at=clock_timestamp() where t.id=v_task.id returning * into v_task;
      v_capability := 'crm_cancel_task';
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
      v_capability := 'crm_assign_task';
    end if;

  elsif v_action = 'activity.log' then
    if coalesce(_command->>'contact_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'CRM_CONTACT_NOT_FOUND' using errcode='P0002';
    end if;
    select * into v_contact from public.clients c where c.id=(_command->>'contact_id')::uuid and c.tenant_id=v_tenant for update;
    if not found then raise exception 'CRM_CONTACT_NOT_FOUND' using errcode='P0002'; end if;
    if not public.crm_actor_can_access_record(v_tenant,v_actor,'contact',v_contact.id) then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
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
      'body',v_note.body,'status','logged','external_effect',false,'created_at',v_note.created_at
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
    if not public.crm_actor_can_access_record(v_tenant,v_actor,'contact',v_contact.id) then
      raise exception 'CRM_FORBIDDEN' using errcode = '42501';
    end if;
    if jsonb_typeof(v_patch) <> 'object' or coalesce(btrim(v_patch->>'legal_name'),'') = '' then
      raise exception 'CRM_PATCH_INVALID' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_unknown from jsonb_object_keys(v_patch) k
     where k not in ('legal_name','entity_type','dba','website','business_email','business_phone','naics','revenue_band','state_of_formation');
    if coalesce(array_length(v_unknown, 1), 0) > 0 then
      raise exception 'CRM_PATCH_FIELDS_INVALID:%', array_to_string(v_unknown, ',') using errcode = '22023';
    end if;
    v_company_owner:=v_contact.linked_user_id;
    if v_company_owner is null then
      select t.owner_user_id into v_company_owner from public.tenants t where t.id=v_tenant
        and exists(select 1 from public.tenant_members tm where tm.tenant_id=t.id and tm.user_id=t.owner_user_id and tm.status='active' and tm.role='owner');
      if v_company_owner is null then raise exception 'CRM_COMPANY_OWNER_SETUP_REQUIRED' using errcode='42501'; end if;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('business-primary:'||v_tenant::text||':'||v_company_owner::text,0));
    insert into public.businesses(
      tenant_id, owner_user_id, legal_name, entity_type, dba, website, business_email, business_phone,
      naics, revenue_band, state_of_formation, is_active, is_primary, updated_at
    ) values (
      v_tenant, v_company_owner, btrim(v_patch->>'legal_name'), nullif(v_patch->>'entity_type','')::public.entity_type, nullif(btrim(v_patch->>'dba'),''),
      nullif(btrim(v_patch->>'website'),''), nullif(btrim(v_patch->>'business_email'),''),
      nullif(btrim(v_patch->>'business_phone'),''), nullif(btrim(v_patch->>'naics'),''),
      nullif(btrim(v_patch->>'revenue_band'),''), nullif(btrim(v_patch->>'state_of_formation'),''),
      true, not exists(select 1 from public.businesses b where b.tenant_id = v_tenant and b.owner_user_id = v_company_owner and b.is_primary), clock_timestamp()
    ) returning * into v_business;
    if v_contact.primary_business_id is null then
      update public.clients set primary_business_id = v_business.id, updated_at = clock_timestamp()
       where id = v_contact.id returning * into v_contact;
    end if;
    v_capability := 'crm_create_company';

  elsif v_action like 'company.%' then
    if coalesce(_command->>'company_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'CRM_BUSINESS_NOT_FOUND' using errcode = 'P0002';
    end if;
    select * into v_business from public.businesses b
     where b.id = (_command->>'company_id')::uuid and b.tenant_id = v_tenant
     for update;
    if not found then raise exception 'CRM_BUSINESS_NOT_FOUND' using errcode = 'P0002'; end if;
    if not public.crm_actor_can_access_record(v_tenant,v_actor,'company',v_business.id) then raise exception 'CRM_FORBIDDEN' using errcode = '42501'; end if;
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
      if not v_is_admin then raise exception 'CRM_FORBIDDEN' using errcode = '42501'; end if;
      -- Archiving changes company availability only. Relationship and primary-state changes remain
      -- explicit link/unlink operations so restore can be genuinely reversible.
      update public.businesses b set is_active = false, updated_at = clock_timestamp()
       where b.id = v_business.id returning * into v_business;
    elsif v_action = 'company.restore' then
      if not v_is_admin then raise exception 'CRM_FORBIDDEN' using errcode = '42501'; end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('business-primary:'||v_tenant::text||':'||v_business.owner_user_id::text,0));
      -- Restoring an archived primary after another active primary appeared must not create two.
      -- Keep the already-active primary stable and truthfully restore this row as secondary; changing
      -- the other company would be an unapproved collateral mutation.
      update public.businesses b set
        is_active = true,
        is_primary = case when b.is_primary and exists(
          select 1 from public.businesses sibling
           where sibling.tenant_id=v_tenant and sibling.owner_user_id=b.owner_user_id
             and sibling.id<>b.id and sibling.is_active and sibling.is_primary
        ) then false else b.is_primary end,
        updated_at = clock_timestamp()
       where b.id = v_business.id returning * into v_business;
    end if;
    v_capability := case v_action when 'company.update' then 'crm_update_company' when 'company.archive' then 'crm_archive_company' else 'crm_restore_company' end;
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
      'action',v_reported_action,
      'record_kind',case when v_reported_action like 'contact.%' then 'contact' when v_reported_action like 'company.%' then 'company' when v_reported_action like 'task.%' then 'task' when v_reported_action like 'deal.%' then 'deal' else 'activity' end,
      'record_id',v_readback->>'id',
      'client_ref',v_readback->>'client_ref',
      'idempotency_key',_idempotency_key
    )
  );

  v_result := jsonb_build_object(
    'ok',true,
    'action',v_reported_action,
    'outcome','succeeded',
    'readback',v_readback,
    'receipt_recorded',true,
    'correlation_id',v_run_id,
    'replayed',false
  );

  insert into public.crm_command_results(tenant_id,idempotency_key,command_hash,actor_user_id,action,result)
  values(v_tenant,_idempotency_key,v_hash,v_actor,v_reported_action,v_result);

  return v_result;
end
$$;

revoke all on function public.execute_crm_command_reversible(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.execute_crm_command_reversible(uuid,uuid,jsonb,text) to service_role;

comment on function public.execute_crm_command_reversible(uuid,uuid,jsonb,text) is
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
  if _actor_kind='paige' and coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'PIPELINE_GOVERNED_EXECUTOR_REQUIRED' using errcode='42501'; end if;
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

-- Completion slice: exact, expiring previews for merge, hard-delete, deal/task delete,
-- and bulk contact updates. This is a domain precondition store, NOT an approval store.
-- Approval remains exclusively paige_pending_confirmations.
alter table public.clients
  add column if not exists merged_into_contact_id uuid references public.clients(id) on delete set null,
  add column if not exists merged_at timestamptz;

create table if not exists public.crm_command_previews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid not null,
  preview_key text not null,
  command_hash text not null,
  action text not null,
  target_snapshot jsonb not null,
  preview jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '15 minutes'),
  consumed_at timestamptz,
  result jsonb,
  unique(tenant_id,actor_user_id,preview_key)
);
alter table public.crm_command_previews enable row level security;
revoke all on public.crm_command_previews from public,anon,authenticated;
grant select,insert,update on public.crm_command_previews to service_role;

-- One transaction-ordering key for every autonomy writer and CRM executor. The trigger covers
-- canonical RPC writes and any trusted service/migration write so an absent policy row cannot race
-- an INSERT to off while an executor assumes the default confirm lane.
create or replace function public.lock_tenant_tool_autonomy_write()
returns trigger language plpgsql set search_path='' as $$
declare old_key text; new_key text;
begin
  if tg_op in ('UPDATE','DELETE') then old_key:='tool-autonomy:'||old.tenant_id::text||':'||old.tool_key; end if;
  if tg_op in ('INSERT','UPDATE') then new_key:='tool-autonomy:'||new.tenant_id::text||':'||new.tool_key; end if;
  if tg_op='UPDATE' and old_key is distinct from new_key then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(old_key,new_key),0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(greatest(old_key,new_key),0));
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(new_key,old_key),0));
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end$$;
revoke all on function public.lock_tenant_tool_autonomy_write() from public,anon,authenticated;
drop trigger if exists tenant_tool_autonomy_serialize_writes on public.tenant_tool_autonomy;
create trigger tenant_tool_autonomy_serialize_writes before insert or update or delete on public.tenant_tool_autonomy
for each row execute function public.lock_tenant_tool_autonomy_write();

create or replace function public.crm_contact_dependency_snapshot(_contact_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  d record; n bigint; items jsonb:='{}'::jsonb; total bigint:=0; supported bigint:=0;
  k text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then
    raise exception 'CRM_INTERNAL_EXECUTOR_REQUIRED' using errcode='42501';
  end if;
  for d in
    select ns.nspname schema_name, rel.relname table_name, att.attname column_name
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class rel on rel.oid=con.conrelid
    join pg_catalog.pg_namespace ns on ns.oid=rel.relnamespace
    join pg_catalog.pg_attribute att on att.attrelid=con.conrelid and att.attnum=con.conkey[1]
    where con.contype='f' and con.confrelid='public.clients'::pg_catalog.regclass
      and pg_catalog.array_length(con.conkey,1)=1 and ns.nspname='public'
    order by rel.relname,att.attname
  loop
    execute pg_catalog.format('select count(*) from %I.%I where %I=$1',d.schema_name,d.table_name,d.column_name)
      into n using _contact_id;
    k:=d.table_name||'.'||d.column_name;
    items:=items||pg_catalog.jsonb_build_object(k,n);
    total:=total+n;
    if k in ('deals.contact_client_id','client_notes.contact_id') then supported:=supported+n; end if;
  end loop;
  return pg_catalog.jsonb_build_object('total',total,'supported',supported,'unsupported',total-supported,'by_reference',items);
end$$;
revoke all on function public.crm_contact_dependency_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.crm_contact_dependency_snapshot(uuid) to service_role;

create or replace function public.preview_crm_command(
  _tenant_id uuid,_actor_id uuid,_command jsonb,_preview_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a text:=nullif(pg_catalog.btrim(_command->>'action'),''); h text;
  cached public.crm_command_previews%rowtype; c1 public.clients%rowtype; c2 public.clients%rowtype;
  t public.tasks%rowtype; d public.deals%rowtype; snap jsonb; outp jsonb; deps jsonb;
  ids uuid[]; requested int; eligible int; refused int; patch jsonb:=coalesce(_command->'patch','{}'::jsonb);
  unknown text[]; conflict_rows jsonb; unresolved int; active_tenant uuid; actor_role text; capability text; autonomy_mode text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then raise exception 'CRM_INTERNAL_EXECUTOR_REQUIRED' using errcode='42501'; end if;
  if _tenant_id is null or _actor_id is null or coalesce(pg_catalog.btrim(_preview_key),'')='' or pg_catalog.length(_preview_key)>200
    or pg_catalog.jsonb_typeof(_command)<>'object' then raise exception 'CRM_PREVIEW_INVALID' using errcode='22023'; end if;
  perform 1 from public.tenants tenant_row where tenant_row.id=_tenant_id and tenant_row.status in ('trial','active','past_due') for update;
  if not found then raise exception 'CRM_TENANT_SUSPENDED' using errcode='42501'; end if;
  select profile_row.active_tenant_id into active_tenant from public.profiles profile_row where profile_row.user_id=_actor_id for update;
  if not found or active_tenant is distinct from _tenant_id then raise exception 'CRM_ACTIVE_ACCOUNT_CHANGED' using errcode='42501'; end if;
  select tm.role into actor_role from public.tenant_members tm
    where tm.tenant_id=_tenant_id and tm.user_id=_actor_id and tm.status='active' and tm.role in ('owner','admin') for update;
  if not found then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
  if a not in ('contact.merge','contact.hard_delete','task.delete','deal.delete','contact.bulk_update') then raise exception 'CRM_PREVIEW_UNAVAILABLE' using errcode='0A000'; end if;
  capability:=case a when 'contact.merge' then 'crm_merge_contacts' when 'contact.hard_delete' then 'crm_hard_delete_contact'
    when 'contact.bulk_update' then 'crm_bulk_update_contacts' when 'task.delete' then 'crm_delete_task' when 'deal.delete' then 'crm_delete_deal' end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tool-autonomy:'||_tenant_id::text||':'||capability,0));
  select ta.mode into autonomy_mode from public.tenant_tool_autonomy ta where ta.tenant_id=_tenant_id and ta.tool_key=capability;
  if coalesce(autonomy_mode,'confirm')='off' then raise exception 'CRM_AUTONOMY_REFUSED' using errcode='42501'; end if;
  h:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(_command::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm-preview:'||_tenant_id::text||':'||_actor_id::text||':'||_preview_key,0));
  select * into cached from public.crm_command_previews where tenant_id=_tenant_id and actor_user_id=_actor_id and preview_key=_preview_key for update;
  if found then
    if cached.command_hash<>h then raise exception 'CRM_PREVIEW_IDEMPOTENCY_REUSE' using errcode='22023'; end if;
    if cached.consumed_at is not null and cached.result is not null then
      return cached.result||pg_catalog.jsonb_build_object('replayed',true);
    end if;
    if cached.expires_at<=pg_catalog.now() then
      -- The advisory lock makes replacement single-writer. An expired, unexecuted preview is not an
      -- approval and may be replaced under the same stable retry key after every target/version check
      -- below runs again. A cached result above remains immutable and replayable.
      delete from public.crm_command_previews where id=cached.id;
    elsif cached.consumed_at is not null then
      raise exception 'CRM_PREVIEW_EXPIRED' using errcode='22023';
    else
      return cached.preview||pg_catalog.jsonb_build_object('preview_id',cached.id,'replayed',true,'expires_at',cached.expires_at);
    end if;
  end if;

  if a in ('contact.merge','contact.hard_delete') then
    if coalesce(_command->>'contact_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'CRM_CONTACT_NOT_FOUND' using errcode='P0002'; end if;
    select * into c1 from public.clients where id=(_command->>'contact_id')::uuid and tenant_id=_tenant_id for update;
    if not found then raise exception 'CRM_CONTACT_NOT_FOUND' using errcode='P0002'; end if;
    if coalesce(_command->>'expected_updated_at','')='' or c1.updated_at is distinct from (_command->>'expected_updated_at')::timestamptz
      then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
    deps:=public.crm_contact_dependency_snapshot(c1.id);
    if a='contact.hard_delete' then
      snap:=pg_catalog.jsonb_build_object('contact_id',c1.id,'updated_at',c1.updated_at,'dependency_snapshot',deps,'linked_user_id',c1.linked_user_id);
      outp:=pg_catalog.jsonb_build_object('action',a,'record_kind','contact','record_id',c1.id,'client_ref',c1.account_number,
        'eligible',c1.linked_user_id is null and (deps->>'total')::bigint=0,'dependency_counts',deps,
        'safe_refusal',case when c1.linked_user_id is not null then 'linked portal identity must be unlinked through its owning flow' when (deps->>'total')::bigint>0 then 'archive this contact or remove dependencies through their owning flows' else null end);
    else
      if coalesce(_command->>'loser_contact_id','') !~* '^[0-9a-f-]{36}$' or (_command->>'loser_contact_id')::uuid=c1.id then raise exception 'CRM_MERGE_TARGET_INVALID' using errcode='22023'; end if;
      select * into c2 from public.clients where id=(_command->>'loser_contact_id')::uuid and tenant_id=_tenant_id for update;
      if not found then raise exception 'CRM_CONTACT_NOT_FOUND' using errcode='P0002'; end if;
      if coalesce(_command->>'expected_loser_updated_at','')='' or c2.updated_at is distinct from (_command->>'expected_loser_updated_at')::timestamptz
        then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
      if c1.linked_user_id is null and c2.linked_user_id is not null and not (coalesce(_command->'resolutions','{}'::jsonb) ? 'linked_user_id') then
        raise exception 'CRM_MERGE_IDENTITY_RESOLUTION_REQUIRED' using errcode='22023';
      end if;
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('field',x.field,'survivor',x.sv,'loser',x.lv,'resolution',coalesce(_command->'resolutions'->>x.field,case when x.sv is null and x.lv is not null then 'loser' else 'survivor' end)) order by x.field),'[]'::jsonb)
        into conflict_rows
        from (values
          ('email',c1.email,c2.email),('phone',c1.phone,c2.phone),('entity_name',c1.entity_name,c2.entity_name),('title',c1.title,c2.title),
          ('linked_user_id',c1.linked_user_id::text,c2.linked_user_id::text),('primary_business_id',c1.primary_business_id::text,c2.primary_business_id::text),
          ('assigned_coach_user_id',c1.assigned_coach_user_id::text,c2.assigned_coach_user_id::text),('lead_owner_user_id',c1.lead_owner_user_id::text,c2.lead_owner_user_id::text)
        ) x(field,sv,lv) where x.sv is distinct from x.lv and (x.sv is not null or x.lv is not null);
      if pg_catalog.jsonb_typeof(coalesce(_command->'resolutions','{}'::jsonb))<>'object' then raise exception 'CRM_MERGE_RESOLUTIONS_INVALID' using errcode='22023'; end if;
      select count(*) into unresolved from pg_catalog.jsonb_each_text(coalesce(_command->'resolutions','{}'::jsonb)) r
       where r.value not in ('survivor','loser') or r.key not in ('email','phone','entity_name','title','linked_user_id','primary_business_id','assigned_coach_user_id','lead_owner_user_id');
      if unresolved>0 then raise exception 'CRM_MERGE_RESOLUTIONS_INVALID' using errcode='22023'; end if;
      deps:=public.crm_contact_dependency_snapshot(c2.id);
      snap:=pg_catalog.jsonb_build_object('survivor_contact_id',c1.id,'survivor_updated_at',c1.updated_at,'loser_contact_id',c2.id,'loser_updated_at',c2.updated_at,
        'dependency_snapshot',deps,'resolutions',coalesce(_command->'resolutions','{}'::jsonb));
      outp:=pg_catalog.jsonb_build_object('action',a,'record_kind','contact_merge','survivor',pg_catalog.jsonb_build_object('id',c1.id,'client_ref',c1.account_number),
        'loser',pg_catalog.jsonb_build_object('id',c2.id,'client_ref',c2.account_number),'conflicts',conflict_rows,'dependency_counts',deps,
        'eligible',(deps->>'unsupported')::bigint=0 and not (c1.linked_user_id is not null and c2.linked_user_id is not null and c1.linked_user_id<>c2.linked_user_id),
        'safe_refusal',case
          when (deps->>'unsupported')::bigint>0 then 'one or more dependencies belong to another domain and cannot be silently reassigned'
          when c1.linked_user_id is not null and c2.linked_user_id is not null and c1.linked_user_id<>c2.linked_user_id then 'two different portal identities cannot be merged into one contact'
          else null end);
    end if;
  elsif a='task.delete' then
    select * into t from public.tasks where id=(_command->>'task_id')::uuid and tenant_id=_tenant_id for update;
    if not found then raise exception 'CRM_TASK_NOT_FOUND' using errcode='P0002'; end if;
    if coalesce(t.updated_at,t.created_at) is distinct from (_command->>'expected_updated_at')::timestamptz then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
    snap:=pg_catalog.jsonb_build_object('task_id',t.id,'updated_at',coalesce(t.updated_at,t.created_at));
    outp:=pg_catalog.jsonb_build_object('action',a,'record_kind','task','record_id',t.id,'title',t.title,'affected_count',1,'eligible',true);
  elsif a='deal.delete' then
    select * into d from public.deals where id=(_command->>'deal_id')::uuid and tenant_id=_tenant_id for update;
    if not found then raise exception 'CRM_DEAL_NOT_FOUND' using errcode='P0002'; end if;
    if d.version<>coalesce((_command->>'expected_version')::bigint,0) then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
    if exists(select 1 from public.paige_invoices where deal_id=d.id and tenant_id is distinct from _tenant_id) then raise exception 'CRM_CROSS_TENANT_DEPENDENCY' using errcode='42501'; end if;
    deps:=pg_catalog.jsonb_build_object('tasks',(select count(*) from public.tasks where deal_id=d.id and tenant_id=_tenant_id),'invoices',(select count(*) from public.paige_invoices where deal_id=d.id and tenant_id=_tenant_id),'activities',(select count(*) from public.deal_activities where deal_id=d.id),'automation_events',(select count(*) from public.stage_automation_events where deal_id=d.id and tenant_id=_tenant_id),'move_approvals',(select count(*) from public.pipeline_move_approvals where deal_id=d.id and tenant_id=_tenant_id),'outcomes',(select count(*) from public.pipeline_deal_outcomes where deal_id=d.id and tenant_id=_tenant_id));
    snap:=pg_catalog.jsonb_build_object('deal_id',d.id,'version',d.version,'dependency_counts',deps);
    outp:=pg_catalog.jsonb_build_object('action',a,'record_kind','deal','record_id',d.id,'title',d.title,'dependency_counts',deps,'affected_count',1+(deps->>'tasks')::int+(deps->>'invoices')::int+(deps->>'activities')::int+(deps->>'automation_events')::int+(deps->>'move_approvals')::int+(deps->>'outcomes')::int,'deleted_dependency_count',(deps->>'activities')::int+(deps->>'automation_events')::int+(deps->>'move_approvals')::int+(deps->>'outcomes')::int,'detached_task_count',(deps->>'tasks')::int,'detached_invoice_count',(deps->>'invoices')::int,'eligible',true);
  else
    if pg_catalog.jsonb_typeof(_command->'target_ids')<>'array' or pg_catalog.jsonb_array_length(_command->'target_ids')=0 or pg_catalog.jsonb_array_length(_command->'target_ids')>200 then raise exception 'CRM_BULK_TARGETS_INVALID' using errcode='22023'; end if;
    select pg_catalog.array_agg(distinct x::uuid order by x::uuid) into ids from pg_catalog.jsonb_array_elements_text(_command->'target_ids') x where x ~* '^[0-9a-f-]{36}$';
    requested:=pg_catalog.jsonb_array_length(_command->'target_ids');
    select count(*) into eligible from public.clients where tenant_id=_tenant_id and id=any(coalesce(ids,array[]::uuid[]));
    refused:=requested-eligible;
    if pg_catalog.jsonb_typeof(patch)<>'object' or patch='{}'::jsonb then raise exception 'CRM_PATCH_INVALID' using errcode='22023'; end if;
    select pg_catalog.array_agg(k order by k) into unknown from pg_catalog.jsonb_object_keys(patch) k where k not in ('lifecycle_stage','tags','do_not_contact','assigned_coach_user_id');
    if coalesce(pg_catalog.array_length(unknown,1),0)>0 then raise exception 'CRM_PATCH_FIELDS_INVALID:%',pg_catalog.array_to_string(unknown,',') using errcode='22023'; end if;
    if patch ? 'lifecycle_stage' and coalesce(patch->>'lifecycle_stage','') not in ('new_lead','qualified','nurturing','hot_lead','negotiating','won','client_active','client_paused','client_churned','client_funded','client_alumni') then raise exception 'CRM_LIFECYCLE_INVALID' using errcode='22023'; end if;
    if patch ? 'tags' and not public.crm_tags_are_valid(patch->'tags') then raise exception 'CRM_TAGS_INVALID' using errcode='22023'; end if;
    if patch ? 'do_not_contact' and pg_catalog.jsonb_typeof(patch->'do_not_contact')<>'boolean' then raise exception 'CRM_DO_NOT_CONTACT_INVALID' using errcode='22023'; end if;
    if patch ? 'assigned_coach_user_id' and nullif(patch->>'assigned_coach_user_id','') is not null and (patch->>'assigned_coach_user_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or not exists(select 1 from public.tenant_members tm where tm.tenant_id=_tenant_id and tm.user_id=(patch->>'assigned_coach_user_id')::uuid and tm.status='active' and tm.role in ('owner','admin','coach'))) then raise exception 'CRM_ASSIGNEE_FORBIDDEN' using errcode='42501'; end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',c.id,'updated_at',c.updated_at) order by c.id),'[]'::jsonb) into snap from public.clients c where c.tenant_id=_tenant_id and c.id=any(coalesce(ids,array[]::uuid[]));
    snap:=pg_catalog.jsonb_build_object('targets',snap,'patch',patch);
    outp:=pg_catalog.jsonb_build_object('action',a,'record_kind','contact','requested_count',requested,'eligible_count',eligible,'refused_count',refused,'patch',patch,'eligible_targets',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',c.id,'client_ref',c.account_number,'updated_at',c.updated_at) order by c.id),'[]'::jsonb) from public.clients c where c.tenant_id=_tenant_id and c.id=any(coalesce(ids,array[]::uuid[]))),'eligible',eligible>0);
  end if;
  insert into public.crm_command_previews(tenant_id,actor_user_id,preview_key,command_hash,action,target_snapshot,preview)
  values(_tenant_id,_actor_id,_preview_key,h,a,snap,outp) returning * into cached;
  return outp||pg_catalog.jsonb_build_object('preview_id',cached.id,'replayed',false,'expires_at',cached.expires_at);
end$$;
revoke all on function public.preview_crm_command(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.preview_crm_command(uuid,uuid,jsonb,text) to service_role;

-- One canonical normalization for action aliases. Both execution and durable-result recovery hash
-- this payload, so a retry cannot drift from the command that actually committed.
create or replace function public.crm_effective_command(_command jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select case when _command->>'action' in ('deal.assign_owner','deal.assign_contact') then
    pg_catalog.jsonb_build_object(
      'action','deal.update','deal_id',_command->>'deal_id','expected_version',_command->'expected_version',
      'receipt_action',_command->>'action','approval_channel',_command->>'approval_channel'
    )
    || case when _command->>'action'='deal.assign_owner' then pg_catalog.jsonb_build_object('owner_user_id',_command->'owner_user_id') else '{}'::jsonb end
    || case when _command->>'action'='deal.assign_contact' then pg_catalog.jsonb_build_object('contact_id',_command->'contact_id') else '{}'::jsonb end
  else _command end
$$;
revoke all on function public.crm_effective_command(jsonb) from public,anon,authenticated,service_role;

-- Read-only lost-response recovery. This never executes a command: it revalidates trusted
-- tenant/account/membership authority and returns only an exact actor+tenant+payload match.
create or replace function public.read_crm_command_result(
  _tenant_id uuid,_actor_id uuid,_command jsonb,_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_active_tenant uuid; v_cached public.crm_command_results%rowtype; v_effective jsonb;
  v_operator_hash text; v_standing_hash text;
  v_actor_role text; v_record_kind text; v_record_id uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' or auth.uid() is not null then raise exception 'CRM_INTERNAL_EXECUTOR_REQUIRED' using errcode='42501'; end if;
  if _tenant_id is null or _actor_id is null or pg_catalog.jsonb_typeof(_command)<>'object' or coalesce(pg_catalog.btrim(_idempotency_key),'')='' or pg_catalog.length(_idempotency_key)>200 then raise exception 'CRM_COMMAND_INVALID' using errcode='22023'; end if;
  perform 1 from public.tenants tenant_row where tenant_row.id=_tenant_id and tenant_row.status in ('trial','active','past_due') for share;
  if not found then raise exception 'CRM_TENANT_SUSPENDED' using errcode='42501'; end if;
  select profile_row.active_tenant_id into v_active_tenant from public.profiles profile_row where profile_row.user_id=_actor_id for share;
  if not found or v_active_tenant is distinct from _tenant_id then raise exception 'CRM_ACTIVE_ACCOUNT_CHANGED' using errcode='42501'; end if;
  select tm.role into v_actor_role from public.tenant_members tm where tm.tenant_id=_tenant_id and tm.user_id=_actor_id and tm.status='active' and tm.role in ('owner','admin','coach') for share;
  if not found then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm-command:'||_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key,0));
  select * into v_cached from public.crm_command_results r where r.tenant_id=_tenant_id and r.actor_user_id=_actor_id and r.idempotency_key=_idempotency_key for share;
  if not found then return null; end if;
  v_effective:=public.crm_effective_command(_command||pg_catalog.jsonb_build_object('approval_channel','operator_card'));
  v_operator_hash:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_effective::text,'UTF8'),'sha256'),'hex');
  v_effective:=public.crm_effective_command(_command||pg_catalog.jsonb_build_object('approval_channel','standing_autonomy_setting'));
  v_standing_hash:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_effective::text,'UTF8'),'sha256'),'hex');
  if v_cached.command_hash not in (v_operator_hash,v_standing_hash) then raise exception 'CRM_IDEMPOTENCY_REUSE' using errcode='22023'; end if;
  if v_actor_role='coach' then
    if v_cached.action not in (
      'contact.create','contact.update','contact.archive','contact.restore','contact.link_company','contact.unlink_company',
      'company.create','company.update','company.restore',
      'task.create','task.update','task.reschedule','task.complete','task.reopen','task.cancel','activity.log'
    ) then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
    v_record_kind:=case
      when v_cached.action like 'contact.%' then 'contact'
      when v_cached.action like 'company.%' then 'company'
      when v_cached.action like 'task.%' then 'task'
      when v_cached.action='activity.log' then 'contact'
    end;
    if v_record_kind='contact' and v_cached.action='activity.log' then
      if coalesce(v_cached.result->'readback'->>'contact_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_record_id:=(v_cached.result->'readback'->>'contact_id')::uuid; end if;
    elsif coalesce(v_cached.result->'readback'->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_record_id:=(v_cached.result->'readback'->>'id')::uuid;
    end if;
    if not public.crm_actor_can_access_record(_tenant_id,_actor_id,v_record_kind,v_record_id) then
      raise exception 'CRM_FORBIDDEN' using errcode='42501';
    end if;
  end if;
  return v_cached.result||pg_catalog.jsonb_build_object('replayed',true);
end$$;
revoke all on function public.read_crm_command_result(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.read_crm_command_result(uuid,uuid,jsonb,text) to service_role;

create or replace function public.execute_crm_command(
  _tenant_id uuid,_actor_id uuid,_command jsonb,_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a text:=nullif(pg_catalog.btrim(_command->>'action'),''); p public.crm_command_previews%rowtype;
  c public.clients%rowtype; loser public.clients%rowtype; t public.tasks%rowtype; d public.deals%rowtype;
  deps jsonb; now_snap jsonb; v_result jsonb; readback jsonb; run_id uuid; changed int; target_count int;
  resolutions jsonb; owner_id uuid; field text; choice text; v_capability text;
  v_hash text; v_cached public.crm_command_results%rowtype; effective_command jsonb;
  v_active_tenant uuid; v_actor_role text; v_autonomy_mode text; v_approval_channel text:=nullif(_command->>'approval_channel','');
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' or auth.uid() is not null then raise exception 'CRM_INTERNAL_EXECUTOR_REQUIRED' using errcode='42501'; end if;
  if _tenant_id is null or _actor_id is null or a is null or coalesce(pg_catalog.btrim(_idempotency_key),'')='' or pg_catalog.length(_idempotency_key)>200 or pg_catalog.jsonb_typeof(_command)<>'object' then raise exception 'CRM_COMMAND_INVALID' using errcode='22023'; end if;
  perform 1 from public.tenants tenant_row where tenant_row.id=_tenant_id and tenant_row.status in ('trial','active','past_due') for update;
  if not found then raise exception 'CRM_TENANT_SUSPENDED' using errcode='42501'; end if;
  select profile_row.active_tenant_id into v_active_tenant from public.profiles profile_row where profile_row.user_id=_actor_id for update;
  if not found or v_active_tenant is distinct from _tenant_id then raise exception 'CRM_ACTIVE_ACCOUNT_CHANGED' using errcode='42501'; end if;
  select tm.role into v_actor_role from public.tenant_members tm
    where tm.tenant_id=_tenant_id and tm.user_id=_actor_id and tm.status='active' and tm.role in ('owner','admin','coach') for update;
  if not found then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
  effective_command:=public.crm_effective_command(_command);
  v_hash:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(effective_command::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm-command:'||_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key,0));
  select * into v_cached from public.crm_command_results r where r.tenant_id=_tenant_id and r.actor_user_id=_actor_id and r.idempotency_key=_idempotency_key for update;
  if found then
    if v_cached.command_hash<>v_hash then raise exception 'CRM_IDEMPOTENCY_REUSE' using errcode='22023'; end if;
    -- Reuse the one cached-result authorization path so service-side retries cannot bypass
    -- current record access after a coach reassignment.
    return public.read_crm_command_result(_tenant_id,_actor_id,_command,_idempotency_key);
  end if;
  v_capability:=case a
    when 'contact.create' then 'crm_create_contact' when 'contact.update' then 'crm_update_contact'
    when 'contact.archive' then 'crm_archive_contact' when 'contact.restore' then 'crm_restore_contact'
    when 'contact.link_company' then 'crm_link_contact_company' when 'contact.unlink_company' then 'crm_unlink_contact_company'
    when 'contact.assign_coach' then 'crm_assign_coach' when 'contact.assign_owner' then 'crm_assign_contact_owner'
    when 'contact.merge' then 'crm_merge_contacts' when 'contact.hard_delete' then 'crm_hard_delete_contact'
    when 'contact.bulk_update' then 'crm_bulk_update_contacts' when 'company.create' then 'crm_create_company'
    when 'company.update' then 'crm_update_company' when 'company.archive' then 'crm_archive_company'
    when 'company.restore' then 'crm_restore_company' when 'task.create' then 'crm_create_task'
    when 'task.update' then 'crm_update_task' when 'task.assign' then 'crm_assign_task'
    when 'task.reschedule' then 'crm_reschedule_task' when 'task.complete' then 'crm_complete_task'
    when 'task.reopen' then 'crm_reopen_task' when 'task.cancel' then 'crm_cancel_task'
    when 'task.delete' then 'crm_delete_task' when 'activity.log' then 'crm_log_activity'
    when 'deal.create' then 'deal_create' when 'deal.update' then 'crm_update_deal'
    when 'deal.assign_owner' then 'crm_assign_deal_owner' when 'deal.assign_contact' then 'crm_assign_deal_contact'
    when 'deal.move' then 'deal_move_stage' when 'deal.close' then 'crm_close_deal'
    when 'deal.reopen' then 'crm_reopen_deal' when 'deal.delete' then 'crm_delete_deal' else null end;
  if v_capability is null then raise exception 'CRM_ACTION_UNAVAILABLE' using errcode='0A000'; end if;
  if v_approval_channel is null or v_approval_channel not in ('operator_card','standing_autonomy_setting') then raise exception 'CRM_AUTHORITY_REQUIRED' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tool-autonomy:'||_tenant_id::text||':'||v_capability,0));
  select ta.mode into v_autonomy_mode from public.tenant_tool_autonomy ta where ta.tenant_id=_tenant_id and ta.tool_key=v_capability;
  v_autonomy_mode:=coalesce(v_autonomy_mode,'confirm');
  if v_autonomy_mode='off' or (v_autonomy_mode='confirm' and v_approval_channel<>'operator_card') then raise exception 'CRM_AUTONOMY_REFUSED' using errcode='42501'; end if;
  if a in ('contact.assign_coach','contact.assign_owner','contact.merge','contact.hard_delete','contact.bulk_update','task.assign','task.cancel','task.delete','deal.assign_owner','deal.assign_contact','deal.close','deal.reopen','deal.delete')
    and v_approval_channel<>'operator_card' then raise exception 'CRM_APPROVAL_REQUIRED' using errcode='42501'; end if;
  if a in ('contact.create','contact.update','contact.archive','contact.restore','contact.link_company','contact.unlink_company','company.create','company.update','company.archive','company.restore','task.create','task.update','task.assign','task.reschedule','task.complete','task.reopen','task.cancel','activity.log','deal.create','deal.update','deal.move','deal.close','deal.reopen') then
    return public.execute_crm_command_reversible(_tenant_id,_actor_id,_command,_idempotency_key);
  end if;
  if not exists(select 1 from public.tenant_members tm where tm.tenant_id=_tenant_id and tm.user_id=_actor_id and tm.status='active' and tm.role in ('owner','admin')) then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;

  if a in ('contact.assign_coach','contact.assign_owner') then
    select * into c from public.clients where id=(_command->>'contact_id')::uuid and tenant_id=_tenant_id for update;
    if not found then raise exception 'CRM_CONTACT_NOT_FOUND' using errcode='P0002'; end if;
    if c.updated_at is distinct from (_command->>'expected_updated_at')::timestamptz then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
    owner_id:=nullif(_command->>'owner_user_id','')::uuid;
    if owner_id is not null and not exists(select 1 from public.tenant_members tm where tm.tenant_id=_tenant_id and tm.user_id=owner_id and tm.status='active' and (a='contact.assign_owner' or tm.role in ('owner','admin','coach'))) then raise exception 'CRM_ASSIGNEE_FORBIDDEN' using errcode='42501'; end if;
    if a='contact.assign_coach' then update public.clients set assigned_coach_user_id=owner_id,updated_at=pg_catalog.clock_timestamp() where id=c.id returning * into c;
    else update public.clients set lead_owner_user_id=owner_id,updated_at=pg_catalog.clock_timestamp() where id=c.id returning * into c; end if;
    readback:=pg_catalog.jsonb_build_object('id',c.id,'client_ref',c.account_number,'assigned_coach_user_id',c.assigned_coach_user_id,'lead_owner_user_id',c.lead_owner_user_id,'updated_at',c.updated_at);
  elsif a in ('deal.assign_owner','deal.assign_contact') then
    return public.execute_crm_command_reversible(_tenant_id,_actor_id,effective_command,_idempotency_key);
  else
    if coalesce(_command->>'preview_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'CRM_PREVIEW_REQUIRED' using errcode='22023'; end if;
    select * into p from public.crm_command_previews where id=(_command->>'preview_id')::uuid and tenant_id=_tenant_id and actor_user_id=_actor_id and action=a and consumed_at is null and expires_at>pg_catalog.now() for update;
    if not found then raise exception 'CRM_PREVIEW_INVALID_OR_EXPIRED' using errcode='42501'; end if;
    update public.crm_command_previews set consumed_at=pg_catalog.clock_timestamp() where id=p.id;
    if a='task.delete' then
      select * into t from public.tasks where id=(p.target_snapshot->>'task_id')::uuid and tenant_id=_tenant_id for update;
      if not found or coalesce(t.updated_at,t.created_at) is distinct from (p.target_snapshot->>'updated_at')::timestamptz then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
      delete from public.tasks where id=t.id and tenant_id=_tenant_id;
      if exists(select 1 from public.tasks where id=t.id) then raise exception 'CRM_ABSENCE_READBACK_FAILED' using errcode='P0002'; end if;
      readback:=pg_catalog.jsonb_build_object('id',t.id,'absent',true,'deleted_count',1);
    elsif a='deal.delete' then
      select * into d from public.deals where id=(p.target_snapshot->>'deal_id')::uuid and tenant_id=_tenant_id for update;
      if not found or d.version<>(p.target_snapshot->>'version')::bigint then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
      if exists(select 1 from public.paige_invoices where deal_id=d.id and tenant_id is distinct from _tenant_id) then raise exception 'CRM_CROSS_TENANT_DEPENDENCY' using errcode='42501'; end if;
      deps:=pg_catalog.jsonb_build_object('tasks',(select count(*) from public.tasks where deal_id=d.id and tenant_id=_tenant_id),'invoices',(select count(*) from public.paige_invoices where deal_id=d.id and tenant_id=_tenant_id),'activities',(select count(*) from public.deal_activities where deal_id=d.id),'automation_events',(select count(*) from public.stage_automation_events where deal_id=d.id and tenant_id=_tenant_id),'move_approvals',(select count(*) from public.pipeline_move_approvals where deal_id=d.id and tenant_id=_tenant_id),'outcomes',(select count(*) from public.pipeline_deal_outcomes where deal_id=d.id and tenant_id=_tenant_id));
      if deps is distinct from p.target_snapshot->'dependency_counts' then raise exception 'CRM_DEPENDENCY_CONFLICT' using errcode='40001'; end if;
      update public.tasks set deal_id=null,updated_at=pg_catalog.clock_timestamp() where deal_id=d.id and tenant_id=_tenant_id;
      update public.paige_invoices set deal_id=null,updated_at=pg_catalog.clock_timestamp() where deal_id=d.id and tenant_id=_tenant_id;
      delete from public.deals where id=d.id and tenant_id=_tenant_id;
      if exists(select 1 from public.deals where id=d.id) then raise exception 'CRM_ABSENCE_READBACK_FAILED' using errcode='P0002'; end if;
      readback:=pg_catalog.jsonb_build_object('id',d.id,'absent',true,'deleted_count',1,'dependency_counts',deps);
    elsif a='contact.hard_delete' then
      select * into c from public.clients where id=(p.target_snapshot->>'contact_id')::uuid and tenant_id=_tenant_id for update;
      if not found or c.updated_at is distinct from (p.target_snapshot->>'updated_at')::timestamptz then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
      deps:=public.crm_contact_dependency_snapshot(c.id);
      if c.linked_user_id is not null or deps is distinct from p.target_snapshot->'dependency_snapshot' or (deps->>'total')::bigint<>0 then raise exception 'CRM_HARD_DELETE_UNSAFE' using errcode='42501'; end if;
      delete from public.clients where id=c.id and tenant_id=_tenant_id;
      if exists(select 1 from public.clients where id=c.id) then raise exception 'CRM_ABSENCE_READBACK_FAILED' using errcode='P0002'; end if;
      readback:=pg_catalog.jsonb_build_object('id',c.id,'client_ref',c.account_number,'absent',true,'deleted_count',1,'dependency_counts',deps);
    elsif a='contact.merge' then
      select * into c from public.clients where id=(p.target_snapshot->>'survivor_contact_id')::uuid and tenant_id=_tenant_id for update;
      select * into loser from public.clients where id=(p.target_snapshot->>'loser_contact_id')::uuid and tenant_id=_tenant_id for update;
      if c.id is null or loser.id is null or c.updated_at is distinct from (p.target_snapshot->>'survivor_updated_at')::timestamptz or loser.updated_at is distinct from (p.target_snapshot->>'loser_updated_at')::timestamptz then raise exception 'CRM_VERSION_CONFLICT' using errcode='40001'; end if;
      deps:=public.crm_contact_dependency_snapshot(loser.id);
      if deps is distinct from p.target_snapshot->'dependency_snapshot' then raise exception 'CRM_DEPENDENCY_CONFLICT' using errcode='40001'; end if;
      if (deps->>'unsupported')::bigint<>0 then raise exception 'CRM_MERGE_DEPENDENCIES_UNSUPPORTED' using errcode='42501'; end if;
      if c.linked_user_id is not null and loser.linked_user_id is not null and c.linked_user_id<>loser.linked_user_id then raise exception 'CRM_MERGE_IDENTITY_CONFLICT' using errcode='42501'; end if;
      resolutions:=p.target_snapshot->'resolutions';
      -- Release the losing row's unique portal identity before transferring it. The loaded row
      -- variable retains the exact preview-bound value used below; the whole transaction rolls back on failure.
      update public.clients set linked_user_id=null where id=loser.id;
      update public.clients set
        email=case when resolutions->>'email'='loser' or c.email is null then loser.email else c.email end,
        phone=case when resolutions->>'phone'='loser' or c.phone is null then loser.phone else c.phone end,
        entity_name=case when resolutions->>'entity_name'='loser' or c.entity_name is null then loser.entity_name else c.entity_name end,
        title=case when resolutions->>'title'='loser' or c.title is null then loser.title else c.title end,
        linked_user_id=case when resolutions->>'linked_user_id'='loser' or c.linked_user_id is null then loser.linked_user_id else c.linked_user_id end,
        primary_business_id=case when resolutions->>'primary_business_id'='loser' or c.primary_business_id is null then loser.primary_business_id else c.primary_business_id end,
        assigned_coach_user_id=case when resolutions->>'assigned_coach_user_id'='loser' or c.assigned_coach_user_id is null then loser.assigned_coach_user_id else c.assigned_coach_user_id end,
        lead_owner_user_id=case when resolutions->>'lead_owner_user_id'='loser' or c.lead_owner_user_id is null then loser.lead_owner_user_id else c.lead_owner_user_id end,
        tags=coalesce((select pg_catalog.array_agg(distinct x order by x) from pg_catalog.unnest(coalesce(c.tags,array[]::text[])||coalesce(loser.tags,array[]::text[])) x),array[]::text[]),
        updated_at=pg_catalog.clock_timestamp() where id=c.id returning * into c;
      update public.deals set contact_client_id=c.id,updated_at=pg_catalog.clock_timestamp() where contact_client_id=loser.id;
      update public.client_notes set contact_id=c.id,updated_at=pg_catalog.clock_timestamp() where contact_id=loser.id;
      update public.clients set status='archived',merged_into_contact_id=c.id,merged_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp() where id=loser.id returning * into loser;
      readback:=pg_catalog.jsonb_build_object('id',c.id,'client_ref',c.account_number,'merged_contact_id',loser.id,'loser_archived',loser.status='archived','dependency_counts',deps,'updated_at',c.updated_at);
    elsif a='contact.bulk_update' then
      if p.target_snapshot->'patch' ? 'tags' and not public.crm_tags_are_valid(p.target_snapshot->'patch'->'tags') then
        raise exception 'CRM_TAGS_INVALID' using errcode='22023';
      end if;
      select count(*) into target_count from pg_catalog.jsonb_array_elements(p.target_snapshot->'targets');
      select count(*) into changed from pg_catalog.jsonb_array_elements(p.target_snapshot->'targets') x
       left join public.clients target_client on target_client.id=(x->>'id')::uuid and target_client.tenant_id=_tenant_id
       where target_client.id is null or target_client.updated_at is distinct from (x->>'updated_at')::timestamptz;
      if changed>0 then raise exception 'CRM_BULK_TARGET_VERSION_CONFLICT:%',changed using errcode='40001'; end if;
      update public.clients target_client set
        lifecycle_stage=case when p.target_snapshot->'patch' ? 'lifecycle_stage' then p.target_snapshot->'patch'->>'lifecycle_stage' else target_client.lifecycle_stage end,
        tags=case when p.target_snapshot->'patch' ? 'tags' then array(select pg_catalog.jsonb_array_elements_text(p.target_snapshot->'patch'->'tags')) else target_client.tags end,
        do_not_contact=case when p.target_snapshot->'patch' ? 'do_not_contact' then (p.target_snapshot->'patch'->>'do_not_contact')::boolean else target_client.do_not_contact end,
        assigned_coach_user_id=case when p.target_snapshot->'patch' ? 'assigned_coach_user_id' then nullif(p.target_snapshot->'patch'->>'assigned_coach_user_id','')::uuid else target_client.assigned_coach_user_id end,
        updated_at=pg_catalog.clock_timestamp()
      where target_client.tenant_id=_tenant_id and target_client.id in (select (x->>'id')::uuid from pg_catalog.jsonb_array_elements(p.target_snapshot->'targets') x);
      get diagnostics changed=row_count;
      select pg_catalog.jsonb_build_object('updated_count',changed,'changed_since_preview_count',0,'refused_count',(p.preview->>'refused_count')::int,'records',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',target_client.id,'client_ref',target_client.account_number,'lifecycle_stage',target_client.lifecycle_stage,'tags',target_client.tags,'do_not_contact',target_client.do_not_contact,'assigned_coach_user_id',target_client.assigned_coach_user_id,'updated_at',target_client.updated_at) order by target_client.id),'[]'::jsonb)) into readback
       from public.clients target_client where target_client.tenant_id=_tenant_id and target_client.id in (select (x->>'id')::uuid from pg_catalog.jsonb_array_elements(p.target_snapshot->'targets') x);
    else raise exception 'CRM_ACTION_UNAVAILABLE' using errcode='0A000'; end if;
  end if;
  run_id:=(pg_catalog.substr(pg_catalog.md5(_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key),1,8)||'-'||pg_catalog.substr(pg_catalog.md5(_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key),9,4)||'-'||pg_catalog.substr(pg_catalog.md5(_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key),13,4)||'-'||pg_catalog.substr(pg_catalog.md5(_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key),17,4)||'-'||pg_catalog.substr(pg_catalog.md5(_tenant_id::text||':'||_actor_id::text||':'||_idempotency_key),21,12))::uuid;
  v_capability:=case a
    when 'contact.assign_coach' then 'crm_assign_coach' when 'contact.assign_owner' then 'crm_assign_contact_owner'
    when 'contact.merge' then 'crm_merge_contacts' when 'contact.hard_delete' then 'crm_hard_delete_contact'
    when 'contact.bulk_update' then 'crm_bulk_update_contacts' when 'task.delete' then 'crm_delete_task'
    when 'deal.assign_owner' then 'crm_assign_deal_owner' when 'deal.assign_contact' then 'crm_assign_deal_contact'
    when 'deal.delete' then 'crm_delete_deal' else null end;
  if v_capability is null then raise exception 'CRM_RECEIPT_CAPABILITY_MISSING' using errcode='XX000'; end if;
  perform public.record_capability_run(_tenant_id,_actor_id,v_capability,'capability_succeeded',run_id,null,null,null,null,
    pg_catalog.jsonb_build_object('action',a,'record_id',readback->>'id','idempotency_key',_idempotency_key,'preview_id',_command->>'preview_id'));
  v_result:=pg_catalog.jsonb_build_object('ok',true,'action',a,'outcome','succeeded','readback',readback,'receipt_recorded',true,'correlation_id',run_id,'replayed',false);
  update public.crm_command_previews cp set result=v_result where cp.id=p.id;
  insert into public.crm_command_results(tenant_id,idempotency_key,command_hash,actor_user_id,action,result)
  values(_tenant_id,_idempotency_key,v_hash,_actor_id,a,v_result);
  return v_result;
exception when unique_violation then
  select r.result into v_result from public.crm_command_results r where r.tenant_id=_tenant_id and r.actor_user_id=_actor_id and r.idempotency_key=_idempotency_key and r.command_hash=v_hash;
  if v_result is null then raise exception 'CRM_IDEMPOTENCY_REUSE' using errcode='22023'; end if;
  return v_result||pg_catalog.jsonb_build_object('replayed',true);
end$$;
revoke all on function public.execute_crm_command(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.execute_crm_command(uuid,uuid,jsonb,text) to service_role;
comment on function public.execute_crm_command(uuid,uuid,jsonb,text) is 'Canonical governed CRM command executor. Service-only, active-membership revalidated, version/idempotency bound, durable readback and receipt required.';

-- Keep every governed CRM action visible in the existing tenant autonomy catalogue.
-- This is a verbatim extension of the latest canonical function, never a second registry.
-- Keep tenant-owned Social connection mutations visible in the existing autonomy catalogue.
-- This re-declares the complete latest catalogue and adds only the three governed connection
-- actions. It does not expose publishing, create a parallel authority model, or make any action
-- autonomous: action-risk.ts classifies every connection mutation as high-risk.
CREATE OR REPLACE FUNCTION public.list_tool_autonomy(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  tool_key    text,
  label       text,
  category    text,
  mode        text,
  is_default  boolean,
  updated_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant_id IS NOT NULL AND _tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'AUTONOMY_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
  ELSE
    _tenant := _tenant_id;
  END IF;

  RETURN QUERY
  WITH catalog(tool_key, label, category) AS (
    VALUES
      -- ── previously listed (23) ──
      ('crm_update_contact',            'Update a contact', 'CRM'),
      ('crm_create_contact',            'Add a contact', 'CRM'),
      ('crm_delete_contact',            'Delete a contact', 'CRM'),
      ('crm_update_pipeline_stage',     'Move a client''s stage', 'Pipeline'),
      ('crm_assign_coach',              'Assign a coach', 'CRM'),
      ('crm_assign_contact',            'Assign a contact', 'CRM'),
      ('crm_create_task',               'Create a task', 'Tasks'),
      ('crm_log_activity',              'Log an activity', 'CRM'),
      ('crm_add_note',                  'Add a note to a client', 'CRM'),
      ('crm_file_document',             'File a document on a client', 'CRM'),
      ('pipeline_create',               'Create a pipeline', 'Pipeline'),
      ('pipeline_add_stage',            'Add a pipeline stage', 'Pipeline'),
      ('member_grant_role',             'Grant a staff role', 'Team'),
      ('member_revoke_role',            'Revoke a staff role', 'Team'),
      ('calendar_book_meeting',         'Book a meeting', 'Calendar'),
      ('program_enroll',                'Enroll a client in a program', 'Programs'),
      ('draft_marketing_content',       'Draft marketing content', 'Content'),
      ('generate_image',                'Generate an image', 'Content'),
      ('content_save',                  'Save marketing content', 'Content'),
      ('growth_page_save',              'Save a landing page draft', 'Studio'),
      ('growth_page_publish',           'Publish a landing page', 'Studio'),
      ('growth_funnel_build',           'Build a funnel', 'Studio'),
      ('growth_funnel_publish',         'Publish a funnel', 'Studio'),
      ('action_file',                   'File an action', 'Action bus'),
      ('action_advance',                'Advance an action', 'Action bus'),
      ('update_client_data',            'Save details to a client''s file', 'Client file'),
      ('delegate_to_subagent',          'Hand work to a specialist', 'Paige''s team'),
      ('forge_subagent',                'Create a new specialist', 'Paige''s team'),
      ('save_to_knowledge_base',        'Save something to your knowledge base', 'Knowledge'),
      ('update_business_profile',       'Update your business profile', 'Business'),
      ('deal_create',                   'Add a deal', 'Pipeline'),
      ('deal_move_stage',               'Move a deal''s stage', 'Pipeline'),
      ('document_generate',             'Generate a document', 'Content'),
      ('author_event_kind',             'Add an activity kind', 'Action bus'),
      ('n8n_run_workflow',              'Run an automation', 'Automations'),
      ('n8n_activate_workflow',         'Turn an automation on', 'Automations'),
      ('n8n_deactivate_workflow',       'Turn an automation off', 'Automations'),
      ('n8n_create_workflow',           'Create an automation', 'Automations'),
      ('n8n_update_workflow',           'Change an automation', 'Automations'),
      ('n8n_archive_workflow',          'Archive an automation', 'Automations'),
      ('n8n_delete_workflow',           'Delete an automation permanently', 'Automations'),
      ('zapier_run_action',             'Run a connected app action', 'Automations'),
      ('plan_set_reminder',             'Set a reminder', 'Planning'),
      ('plan_create',                   'Create a plan', 'Planning'),
      ('plan_add_milestone',            'Add a milestone', 'Planning'),
      ('plan_assign_task',              'Assign a task from a plan', 'Planning'),
      ('plan_update_item',              'Change a plan item', 'Planning'),
      ('plan_remove_item',              'Remove a plan item', 'Planning'),
      -- added by Phase 2: visible controls for governed Business Mission record changes
      ('mission_create',                 'Create a Business Mission', 'Planning'),
      ('mission_revise',                 'Revise a Business Mission brief', 'Planning'),
      ('mission_transition',             'Change a Business Mission state', 'Planning'),
      ('automation_draft',              'Set up a repeatable process', 'Automations'),
      ('automation_set_grant',          'Change how much Paige runs alone', 'Automations'),
      ('automation_set_state',          'Turn a process on or off', 'Automations'),
      ('marketplace_install',           'Install from the marketplace', 'Marketplace'),
      ('marketplace_uninstall',         'Remove a marketplace install', 'Marketplace'),
      ('propose_business_brief_update', 'Propose a business brief update', 'CRM'),
      ('pipeline_configure',            'Configure pipelines and stages', 'Pipeline'),
      -- added 2026-09-06: the two governed campaign-brief PLANNING writes (Slice 2)
      ('campaign_brief_create',         'Save a campaign brief', 'Campaigns'),
      ('campaign_brief_revise',         'Revise a campaign brief', 'Campaigns'),
      ('comms_buy_number',              'Buy a phone number (monthly charge)', 'Comms'),
      ('comms_set_primary_number',      'Change which number you send from', 'Comms'),
      ('comms_name_number',             'Rename a phone number', 'Comms'),
      ('comms_draft_registration',      'Draft your carrier registration', 'Comms'),
      -- ── added 2026-09-02: the Solo Team seam ──
      ('team_set_work_profile',         'Update a teammate''s work details', 'Team'),
      ('team_set_permission',           'Change what a teammate can access', 'Team'),
      ('team_invite_member',            'Invite someone to the team', 'Team'),
      ('team_invite_resend',            'Send a team invitation again', 'Team'),
      ('team_invite_revoke',            'Withdraw a team invitation', 'Team'),
      -- ── added 2026-09-05: the acts the inbound MCP door names (task #45) ──
      ('tenant_create',                     'Create a new workspace', 'Platform'),
      ('crm_append_contact_notes',          'Add notes to a client''s record', 'CRM'),
      ('crm_delete_task',                   'Delete a task', 'Tasks'),
      ('workflow_run',                      'Run a registered automation', 'Automations'),
      ('workflow_cancel_run',               'Stop an automation that is running', 'Automations'),
      ('workflow_register',                 'Register a new automation', 'Automations'),
      ('automation_rule_create',            'Create a stage automation rule', 'Automations'),
      ('automation_rule_update',            'Change a stage automation rule', 'Automations'),
      ('automation_rule_delete',            'Delete a stage automation rule permanently', 'Automations'),
      ('approval_decide',                   'Approve or reject something waiting for review', 'Approvals'),
      ('approval_create',                   'File something for review', 'Approvals'),
      ('readiness_approve_proposal',        'Approve a readiness item for a client', 'Approvals'),
      ('coach_update_profile',              'Change a coach''s details and availability', 'Team'),
      ('team_invite_mint',                  'Create a workspace invitation link', 'Team'),
      ('comms_upsert_email_template',       'Save a shared email template', 'Comms'),
      ('comms_send_email',                  'Send an email to a real person', 'Comms'),
      ('comms_send_bulk_email',             'Send an email to many people at once', 'Comms'),
      ('comms_add_email_domain',            'Add a sending domain', 'Comms'),
      ('comms_set_primary_email_domain',    'Change which domain you send email from', 'Comms'),
      ('billing_send_invoice',              'Send an invoice to a client', 'Billing'),
      ('skill_run',                         'Run a skill', 'Paige''s team'),
      ('subagent_create',                   'Propose a new specialist', 'Paige''s team'),
      ('subagent_approve_proposal',         'Put a proposed specialist live', 'Paige''s team'),
      ('business_verify',                   'Check a company against outside registries', 'Business'),
      ('agency_create_subaccount',          'Create a sub-account', 'Agency'),
      ('agency_enter_subaccount',           'Work inside a sub-account', 'Agency'),
      ('privacy_handle_request',            'Act on a data request from a person', 'Privacy'),
      ('tenant_set_status',                 'Suspend or restore a workspace', 'Platform'),
      ('tenant_set_features',               'Turn capabilities on or off for a workspace', 'Platform'),
      ('crm_update_lifecycle_stage',        'Move a client to another lifecycle stage', 'CRM'),
      ('crm_advance_journey_stage',         'Move a client along their journey', 'CRM'),
      ('crm_propose_contact_update',        'Propose a change to a client''s record', 'CRM'),
      ('crm_update_task',                   'Change a task', 'Tasks'),
      ('approval_claim',                    'Take ownership of something waiting for review', 'Approvals'),
      ('approval_comment',                  'Comment on something waiting for review', 'Approvals'),
      ('readiness_reject_proposal',         'Close a readiness item without approving it', 'Approvals'),
      ('billing_create_invoice',            'Draft an invoice', 'Billing'),
      ('comms_draft_email',                 'Draft an email', 'Comms'),
      ('platform_post_notification',        'Post an operator notice', 'Platform'),
      ('agency_exit_subaccount',            'Return to your own workspace', 'Agency'),
      ('business_create',                   'Add a business you own', 'Business'),
      ('business_update',                   'Update a business you own', 'Business'),
      ('update_social_accounts',            'Record the accounts you post from', 'Business'),
      ('ingest_client_memory',              'Remember something about a client', 'Client file'),
      ('ingest_credit_scores',              'Record reported score figures on a client''s file', 'Client file'),
      ('nav_pull_business_credit',           'Pull a paid NAV business credit report', 'Client file'),
      ('smartcredit_pull_snapshot',           'Pull a paid SmartCredit snapshot', 'Client file'),
      ('ingest_banking_snapshot',           'Record reported account figures on a client''s file', 'Client file'),
      ('ingest_confirm_proposal',           'Confirm a staged change to a client''s file', 'Client file'),
      ('ingest_reject_proposal',            'Discard a staged change to a client''s file', 'Client file'),
      ('client_log_progress',               'Add a progress note to your own record', 'Client file'),
      -- Added in the same branch, after the peer gate refused three reuses that merged different
      -- acts under one key: two global coach-role writes that are NOT the guarded roster grant, and
      -- the one send tool that also chooses which address the email appears to come from.
      ('coach_grant_role_globally',          'Grant the coach role across the platform', 'Team'),
      ('coach_revoke_role_globally',         'Remove the coach role across the platform', 'Team'),
      ('comms_send_email_choosing_the_sender', 'Send an email and choose the sending address', 'Comms'),
      -- ── added 2026-09-12: the action-risk classification repair (improvement loop + social) ──
      ('improvement_propose',               'Propose an improvement to Paige', 'Paige''s team'),
      ('improvement_decide',                'Approve or reject an improvement proposal', 'Paige''s team'),
      ('social_post',                       'Post to social media', 'Content'),
      -- Added with the tenant-owned Social connection lifecycle. These mutations remain high-risk
      -- in action-risk.ts, so no stored autonomy mode can bypass explicit confirmation.
      ('social_connection_start',           'Connect a Social identity', 'Automations'),
      ('social_account_select',             'Select a Social account', 'Automations'),
      ('social_connection_disconnect',      'Disconnect a Social identity', 'Automations'),
      -- Governed CRM/Pipeline operational surface. These are the same keys classified by
      -- action-risk.ts and emitted from the one shared CRM command catalogue.
      ('crm_archive_contact',                'Archive a contact', 'CRM'),
      ('crm_restore_contact',                'Restore a contact', 'CRM'),
      ('crm_link_contact_company',           'Link a contact to a company', 'CRM'),
      ('crm_unlink_contact_company',         'Unlink a contact from a company', 'CRM'),
      ('crm_assign_contact_owner',           'Change a contact owner', 'CRM'),
      ('crm_merge_contacts',                 'Merge contacts', 'CRM'),
      ('crm_hard_delete_contact',            'Delete a contact permanently', 'CRM'),
      ('crm_bulk_update_contacts',           'Update an exact set of contacts', 'CRM'),
      ('crm_create_company',                 'Add a company', 'CRM'),
      ('crm_update_company',                 'Update a company', 'CRM'),
      ('crm_archive_company',                'Archive a company', 'CRM'),
      ('crm_restore_company',                'Restore a company', 'CRM'),
      ('crm_update_deal',                    'Update a deal', 'Pipeline'),
      ('crm_assign_deal_owner',              'Change a deal owner', 'Pipeline'),
      ('crm_assign_deal_contact',            'Change a deal contact', 'Pipeline'),
      ('crm_close_deal',                     'Close a deal', 'Pipeline'),
      ('crm_reopen_deal',                    'Reopen a deal', 'Pipeline'),
      ('crm_delete_deal',                    'Delete a deal permanently', 'Pipeline'),
      ('crm_assign_task',                    'Assign a task', 'Tasks'),
      ('crm_reschedule_task',                'Reschedule a task', 'Tasks'),
      ('crm_complete_task',                  'Complete a task', 'Tasks'),
      ('crm_reopen_task',                    'Reopen a task', 'Tasks'),
      ('crm_cancel_task',                    'Cancel a task', 'Tasks')
  )
  SELECT
    c.tool_key,
    c.label,
    c.category,
    COALESCE(t.mode, 'confirm')       AS mode,
    (t.mode IS NULL)                  AS is_default,
    t.updated_at
  FROM catalog c
  LEFT JOIN public.tenant_tool_autonomy t
    ON t.tool_key = c.tool_key AND t.tenant_id = _tenant
  ORDER BY c.category, c.label;
END;
$$;

-- Re-asserted, as every one of the predecessors in this chain does. `CREATE OR REPLACE` preserves an
-- existing function's ACL, so this changes nothing on a database that already ran an earlier grant —
-- which is exactly why it is easy to drop, and why dropping it would leave the chain non-uniform on a
-- SECURITY DEFINER function whose `auth.uid() IS NULL` branch takes `_tenant_id` unguarded.
REVOKE ALL ON FUNCTION public.list_tool_autonomy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tool_autonomy(uuid) TO authenticated, service_role;
