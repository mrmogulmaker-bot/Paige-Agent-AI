-- Complete tenant-owned Twilio A2P registration state.
-- Provider identifiers remain server-owned; browser reads use the safe RPC below.

begin;

alter table public.tenant_a2p_registrations
  add column if not exists registration_mode text not null default 'twilio_isv_embedded',
  add column if not exists brand_inquiry_id text,
  add column if not exists brand_bundle_sid text,
  add column if not exists campaign_inquiry_id text,
  add column if not exists campaign_bundle_sid text,
  add column if not exists selected_phone_number_id uuid references public.tenant_phone_numbers(id) on delete restrict,
  add column if not exists number_association_status text not null default 'not_started',
  add column if not exists number_registration_status text not null default 'not_started',
  add column if not exists a2p_event_sink_sid text,
  add column if not exists a2p_event_subscription_sid text,
  add column if not exists event_webhook_secret_hash text,
  add column if not exists provider_failure_code text,
  add column if not exists provider_failure_reason text,
  add column if not exists privacy_policy_url text,
  add column if not exists terms_and_conditions_url text,
  add column if not exists message_categories jsonb not null default '[]'::jsonb,
  add column if not exists opt_in_types jsonb not null default '[]'::jsonb,
  add column if not exists has_embedded_links boolean not null default false,
  add column if not exists has_embedded_phone boolean not null default false,
  add column if not exists direct_lending boolean not null default false,
  add column if not exists age_gated boolean not null default false,
  add column if not exists submission_phase text not null default 'prepared',
  add column if not exists operation_key uuid,
  add column if not exists operation_started_at timestamptz,
  add column if not exists provider_synced_at timestamptz,
  add column if not exists canceled_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='tenant_a2p_registration_mode_chk') then
    alter table public.tenant_a2p_registrations add constraint tenant_a2p_registration_mode_chk
      check (registration_mode='twilio_isv_embedded');
  end if;
  if not exists (select 1 from pg_constraint where conname='tenant_a2p_number_association_status_chk') then
    alter table public.tenant_a2p_registrations add constraint tenant_a2p_number_association_status_chk
      check (number_association_status in ('not_started','pending','associated','failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname='tenant_a2p_number_registration_status_chk') then
    alter table public.tenant_a2p_registrations add constraint tenant_a2p_number_registration_status_chk
      check (number_registration_status in ('not_started','pending','registered','failed','unregistered'));
  end if;
  if not exists (select 1 from pg_constraint where conname='tenant_a2p_submission_phase_chk') then
    alter table public.tenant_a2p_registrations add constraint tenant_a2p_submission_phase_chk
      check (submission_phase in ('prepared','brand_draft','brand_submitted','brand_approved','campaign_draft','campaign_submitted','approved','action_needed','failed','canceled'));
  end if;
  if not exists (select 1 from pg_constraint where conname='tenant_a2p_selected_number_same_tenant_fk') then
    alter table public.tenant_phone_numbers add constraint tenant_phone_numbers_id_tenant_unique unique (id, tenant_id);
    alter table public.tenant_a2p_registrations add constraint tenant_a2p_selected_number_same_tenant_fk
      foreign key (selected_phone_number_id, tenant_id)
      references public.tenant_phone_numbers(id, tenant_id) on delete restrict;
  end if;
end $$;

-- The provider worker uses this atomic claim before any paid/external create.
create or replace function public.claim_tenant_a2p_operation(
  _tenant_id uuid, _phase text, _operation_key uuid
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v public.tenant_a2p_registrations%rowtype;
begin
  if current_user not in ('postgres','supabase_admin','service_role') then
    raise exception 'service role required' using errcode='42501';
  end if;
  if _phase not in ('brand_draft','campaign_draft') then
    raise exception 'unsupported operation phase' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('a2p_registration:'||_tenant_id::text,0));
  select * into v from public.tenant_a2p_registrations where tenant_id=_tenant_id for update;
  if not found then raise exception 'registration draft required' using errcode='P0002'; end if;
  if v.operation_key is not null and v.operation_started_at > now()-interval '10 minutes' then
    return jsonb_build_object('claimed',false,'reason','operation_in_progress');
  end if;
  update public.tenant_a2p_registrations set operation_key=_operation_key,
    operation_started_at=now(), submission_phase=_phase, updated_at=now()
    where tenant_id=_tenant_id;
  return jsonb_build_object('claimed',true);
end $$;
revoke all on function public.claim_tenant_a2p_operation(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_tenant_a2p_operation(uuid,text,uuid) to service_role;

-- Only provider code can persist external state. Failure text is deliberately bounded.
create or replace function public.finish_tenant_a2p_operation(
  _tenant_id uuid, _operation_key uuid, _patch jsonb, _audit_action text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_actor uuid;
begin
  if current_user not in ('postgres','supabase_admin','service_role') then
    raise exception 'service role required' using errcode='42501';
  end if;
  if _patch is null or jsonb_typeof(_patch)<>'object' then raise exception 'patch must be an object' using errcode='22023'; end if;
  update public.tenant_a2p_registrations set
    brand_inquiry_id=coalesce(_patch->>'brand_inquiry_id',brand_inquiry_id),
    brand_bundle_sid=coalesce(_patch->>'brand_bundle_sid',brand_bundle_sid),
    customer_profile_sid=coalesce(_patch->>'customer_profile_sid',customer_profile_sid),
    trust_product_sid=coalesce(_patch->>'trust_product_sid',trust_product_sid),
    brand_sid=coalesce(_patch->>'brand_sid',brand_sid),
    brand_status=coalesce(_patch->>'brand_status',brand_status),
    campaign_inquiry_id=coalesce(_patch->>'campaign_inquiry_id',campaign_inquiry_id),
    campaign_bundle_sid=coalesce(_patch->>'campaign_bundle_sid',campaign_bundle_sid),
    campaign_sid=coalesce(_patch->>'campaign_sid',campaign_sid),
    campaign_status=coalesce(_patch->>'campaign_status',campaign_status),
    messaging_service_sid=coalesce(_patch->>'messaging_service_sid',messaging_service_sid),
    selected_phone_number_id=coalesce(nullif(_patch->>'selected_phone_number_id','')::uuid,selected_phone_number_id),
    number_association_status=coalesce(_patch->>'number_association_status',number_association_status),
    number_registration_status=coalesce(_patch->>'number_registration_status',number_registration_status),
    a2p_event_sink_sid=coalesce(_patch->>'a2p_event_sink_sid',a2p_event_sink_sid),
    a2p_event_subscription_sid=coalesce(_patch->>'a2p_event_subscription_sid',a2p_event_subscription_sid),
    event_webhook_secret_hash=coalesce(_patch->>'event_webhook_secret_hash',event_webhook_secret_hash),
    status=coalesce(_patch->>'status',status),
    submission_phase=coalesce(_patch->>'submission_phase',submission_phase),
    provider_failure_code=case when _patch ? 'provider_failure_code' then nullif(left(coalesce(_patch->>'provider_failure_code',''),80),'') else provider_failure_code end,
    provider_failure_reason=case when _patch ? 'provider_failure_reason' then nullif(left(coalesce(_patch->>'provider_failure_reason',''),500),'') else provider_failure_reason end,
    submitted_at=case when coalesce((_patch->>'mark_submitted')::boolean,false) then coalesce(submitted_at,now()) else submitted_at end,
    approved_at=case when coalesce((_patch->>'mark_approved')::boolean,false) then coalesce(approved_at,now()) else approved_at end,
    provider_synced_at=case when coalesce((_patch->>'mark_synced')::boolean,false) then now() else provider_synced_at end,
    canceled_at=case when coalesce((_patch->>'mark_canceled')::boolean,false) then now() else canceled_at end,
    operation_key=null, operation_started_at=null, updated_at=now()
  where tenant_id=_tenant_id and (operation_key=_operation_key or _operation_key is null)
  returning id into v_id;
  if v_id is null then raise exception 'operation ownership changed' using errcode='40001'; end if;
  begin v_actor:=nullif(_patch->>'actor_user_id','')::uuid; exception when others then v_actor:=null; end;
  insert into public.paige_audit_log(tenant_id,actor_user_id,actor_role,action,target_type,target_id,payload)
  values(_tenant_id,v_actor,'tenant_staff',left(_audit_action,120),'tenant_a2p_registrations',v_id,
    jsonb_strip_nulls(jsonb_build_object('phase',_patch->>'submission_phase','brand_status',_patch->>'brand_status',
      'campaign_status',_patch->>'campaign_status','number_association_status',_patch->>'number_association_status',
      'number_registration_status',_patch->>'number_registration_status',
      'outcome',case when _patch ? 'provider_failure_code' then 'failed' else 'accepted' end)));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.finish_tenant_a2p_operation(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_tenant_a2p_operation(uuid,uuid,jsonb,text) to service_role;

-- Safe browser/PAIGE projection: no provider ids, inquiry ids, raw payloads, or sealed facts.
create or replace function public.get_tenant_a2p_registration_status()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare v_tid uuid:=public.current_user_tenant_id(); v_reg record; v_legal record; v_number record; v_can boolean;
begin
  if auth.uid() is null or v_tid is null then raise exception 'active workspace not resolved' using errcode='42501'; end if;
  select public.is_tenant_admin_as(auth.uid(),v_tid) or public.is_platform_owner() into v_can;
  if not coalesce(v_can,false) then raise exception 'workspace owner or administrator required' using errcode='42501'; end if;
  select * into v_reg from public.tenant_a2p_registrations where tenant_id=v_tid;
  select * into v_legal from public.tenant_legal_profile where tenant_id=v_tid;
  select id,phone_number,friendly_name,is_primary,status,capabilities into v_number
    from public.tenant_phone_numbers where tenant_id=v_tid and status='active'
      and coalesce((capabilities->>'sms')::boolean,false)
    order by is_primary desc,created_at asc limit 1;
  return jsonb_build_object(
    'registration',case when v_reg.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'brand_status',v_reg.brand_status,'campaign_status',v_reg.campaign_status,'status',v_reg.status,
      'submission_phase',v_reg.submission_phase,'number_association_status',v_reg.number_association_status,
      'number_registration_status',v_reg.number_registration_status,
      'use_case',v_reg.use_case,'campaign_description',v_reg.campaign_description,'sample_messages',v_reg.sample_messages,
      'optin_flow',v_reg.optin_flow,'optin_message',v_reg.optin_message,'optout_message',v_reg.optout_message,
      'help_message',v_reg.help_message,'submitted_at',v_reg.submitted_at,'approved_at',v_reg.approved_at,
      'provider_synced_at',v_reg.provider_synced_at,'failure_code',v_reg.provider_failure_code,
      'failure_reason',v_reg.provider_failure_reason,'has_brand',v_reg.brand_sid is not null,
      'has_campaign',v_reg.campaign_sid is not null,'has_messaging_service',v_reg.messaging_service_sid is not null)) end,
    'eligible_number',case when v_number.id is null then null else jsonb_build_object(
      'id',v_number.id,'phone_number',v_number.phone_number,'label',v_number.friendly_name,'is_primary',v_number.is_primary) end,
    'profile',jsonb_build_object(
      'legal_business_name',v_legal.legal_business_name,'website_url',v_legal.website_url,
      'registration_number_saved',v_legal.business_registration_number_secret_ref is not null,
      'registered_address_complete',nullif(v_legal.registered_street,'') is not null and nullif(v_legal.registered_city,'') is not null and nullif(v_legal.registered_region,'') is not null and nullif(v_legal.registered_postal_code,'') is not null and nullif(v_legal.registered_iso_country,'') is not null,
      'business_identity_saved',nullif(v_legal.business_identity,'') is not null,
      'business_industry_saved',nullif(v_legal.business_industry,'') is not null,
      'regions_saved',coalesce(cardinality(v_legal.business_regions_of_operation),0)>0,
      'authorized_representative_complete',nullif(v_legal.authorized_representative_first_name,'') is not null and nullif(v_legal.authorized_representative_last_name,'') is not null and nullif(v_legal.authorized_representative_email,'') is not null and nullif(v_legal.authorized_representative_phone,'') is not null and nullif(v_legal.authorized_representative_business_title,'') is not null and nullif(v_legal.authorized_representative_job_position,'') is not null),
    'can_manage',true);
end $$;
revoke all on function public.get_tenant_a2p_registration_status() from public,anon;
grant execute on function public.get_tenant_a2p_registration_status() to authenticated;

comment on function public.get_tenant_a2p_registration_status() is
  'Active-workspace A2P projection. Omits all Twilio identifiers, inquiry tokens, raw payloads, and sealed business values.';



-- At-least-once Twilio events are reduced to a safe, idempotent status ledger.
create table if not exists public.tenant_a2p_provider_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_event_id text not null,
  event_type text not null,
  outcome text not null check (outcome in ('pending','approved','failed','informational')),
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id,provider_event_id)
);

create or replace function public.apply_tenant_a2p_number_event(
  _registration_id uuid, _event_id text, _event_type text, _status text,
  _failure_reason text, _occurred_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v public.tenant_a2p_registrations%rowtype; v_event uuid; v_outcome text;
begin
  if current_user not in ('postgres','supabase_admin','service_role') then
    raise exception 'service role required' using errcode='42501';
  end if;
  if _status not in ('pending','registered','failed') then
    raise exception 'unsupported number status' using errcode='22023';
  end if;
  select * into v from public.tenant_a2p_registrations where id=_registration_id for update;
  if not found then raise exception 'registration not found' using errcode='P0002'; end if;
  v_outcome:=case _status when 'registered' then 'approved' when 'failed' then 'failed' else 'pending' end;
  insert into public.tenant_a2p_provider_events(tenant_id,provider_event_id,event_type,outcome,occurred_at)
  values(v.tenant_id,left(_event_id,160),left(_event_type,160),v_outcome,_occurred_at)
  on conflict(tenant_id,provider_event_id) do nothing returning id into v_event;
  if v_event is null then return jsonb_build_object('applied',false,'duplicate',true); end if;
  update public.tenant_a2p_registrations set
    number_registration_status=_status,
    provider_failure_code=case when _status='failed' then 'NUMBER_REGISTRATION_FAILED' else null end,
    provider_failure_reason=case when _status='failed' then nullif(left(_failure_reason,500),'') else null end,
    provider_synced_at=now(),updated_at=now()
  where id=v.id and tenant_id=v.tenant_id;
  insert into public.paige_audit_log(tenant_id,actor_role,action,target_type,target_id,payload)
  values(v.tenant_id,'provider','a2p.number_registration.'||_status,'tenant_a2p_registrations',v.id,
    jsonb_build_object('number_registration_status',_status,'outcome',v_outcome));
  return jsonb_build_object('applied',true);
end $$;
revoke all on function public.apply_tenant_a2p_number_event(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_tenant_a2p_number_event(uuid,text,text,text,text,timestamptz) to service_role;

alter table public.tenant_a2p_provider_events enable row level security;
revoke all on public.tenant_a2p_provider_events from public,anon,authenticated;
grant select,insert,update,delete on public.tenant_a2p_provider_events to service_role;

-- Browser roles can read status and reviewed copy, never provider identifiers or inquiry handles.
revoke select on public.tenant_a2p_registrations from authenticated;
grant select (id,tenant_id,brand_status,campaign_status,use_case,campaign_description,sample_messages,optin_flow,status,submitted_at,approved_at,created_at,updated_at,optin_message,optout_message,help_message,registration_mode,number_association_status,number_registration_status,provider_failure_code,provider_failure_reason,privacy_policy_url,terms_and_conditions_url,message_categories,opt_in_types,has_embedded_links,has_embedded_phone,direct_lending,age_gated,submission_phase,provider_synced_at,canceled_at)
  on public.tenant_a2p_registrations to authenticated;

commit;
