-- Setup is the tenant legal-sender source of truth for TrustHub/A2P.
-- Full registration numbers are vaulted; browser-readable records expose only last four.
-- The platform primary profile remains a separate operator-owned resource.

begin;

alter table public.tenant_legal_profile
  add column if not exists website_url text,
  add column if not exists business_identity text,
  add column if not exists business_industry text,
  add column if not exists business_regions_of_operation text[] not null default array['USA_AND_CANADA']::text[],
  add column if not exists business_registration_identifier text,
  add column if not exists business_registration_number_secret_ref text,
  add column if not exists business_registration_number_last_4 text,
  add column if not exists registered_street text,
  add column if not exists registered_street_secondary text,
  add column if not exists registered_city text,
  add column if not exists registered_region text,
  add column if not exists registered_postal_code text,
  add column if not exists registered_iso_country text,
  add column if not exists authorized_representative_user_id uuid references auth.users(id) on delete set null,
  add column if not exists authorized_representative_first_name text,
  add column if not exists authorized_representative_last_name text,
  add column if not exists authorized_representative_email text,
  add column if not exists authorized_representative_phone text,
  add column if not exists authorized_representative_business_title text,
  add column if not exists authorized_representative_job_position text;

alter table public.tenant_a2p_registrations
  add column if not exists customer_profile_sid text,
  add column if not exists trust_product_sid text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenant_legal_profile_business_identity_chk') then
    alter table public.tenant_legal_profile add constraint tenant_legal_profile_business_identity_chk
      check (business_identity is null or business_identity in ('direct_customer','isv_reseller_or_partner'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenant_legal_profile_registration_last4_chk') then
    alter table public.tenant_legal_profile add constraint tenant_legal_profile_registration_last4_chk
      check (business_registration_number_last_4 is null or business_registration_number_last_4 ~ '^[0-9]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenant_legal_profile_country_chk') then
    alter table public.tenant_legal_profile add constraint tenant_legal_profile_country_chk
      check (registered_iso_country is null or registered_iso_country ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenant_a2p_customer_profile_sid_chk') then
    alter table public.tenant_a2p_registrations add constraint tenant_a2p_customer_profile_sid_chk
      check (customer_profile_sid is null or customer_profile_sid ~ '^BU[0-9a-fA-F]{32}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenant_a2p_trust_product_sid_chk') then
    alter table public.tenant_a2p_registrations add constraint tenant_a2p_trust_product_sid_chk
      check (trust_product_sid is null or trust_product_sid ~ '^BU[0-9a-fA-F]{32}$');
  end if;
end $$;

create or replace function public.get_solo_setup_identity()
returns table (
  tenant_id uuid,
  tenant_name text,
  business_brief jsonb,
  pending_proposal jsonb,
  primary_business_email text,
  can_edit boolean,
  business_registration_number_last_4 text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base record;
  v_legal public.tenant_legal_profile%rowtype;
  v_identity jsonb := '{}'::jsonb;
begin
  select * into v_base from public.get_solo_business_brief() limit 1;
  if not found then return; end if;

  select * into v_legal
  from public.tenant_legal_profile lp
  where lp.tenant_id = v_base.tenant_id;

  if found then
    v_identity := jsonb_strip_nulls(jsonb_build_object(
      'legalName', nullif(v_legal.legal_business_name, ''),
      'dbaName', nullif(v_legal.dba_name, ''),
      'website', nullif(v_legal.website_url, ''),
      'address', nullif(v_legal.registered_address, ''),
      'phone', nullif(v_legal.support_phone, ''),
      'industry', nullif(v_legal.business_industry, ''),
      'entityType', nullif(v_legal.entity_type, ''),
      'stateOfFormation', nullif(v_legal.state_of_formation, ''),
      'businessRegistrationIdentifier', nullif(v_legal.business_registration_identifier, ''),
      'regionsOfOperation', nullif(array_to_string(v_legal.business_regions_of_operation, ','), ''),
      'registeredStreet', nullif(v_legal.registered_street, ''),
      'registeredStreetSecondary', nullif(v_legal.registered_street_secondary, ''),
      'registeredCity', nullif(v_legal.registered_city, ''),
      'registeredRegion', nullif(v_legal.registered_region, ''),
      'registeredPostalCode', nullif(v_legal.registered_postal_code, ''),
      'registeredIsoCountry', nullif(v_legal.registered_iso_country, ''),
      'authorizedRepresentativeUserId', v_legal.authorized_representative_user_id,
      'authorizedRepresentativePhone', nullif(v_legal.authorized_representative_phone, ''),
      'authorizedRepresentativeJobPosition', nullif(v_legal.authorized_representative_job_position, '')
    ));
  end if;

  return query select
    v_base.tenant_id,
    v_base.tenant_name,
    coalesce(v_base.business_brief, '{}'::jsonb) || v_identity,
    v_base.pending_proposal,
    v_base.primary_business_email,
    v_base.can_edit,
    v_legal.business_registration_number_last_4;
end;
$$;

revoke all on function public.get_solo_setup_identity() from public, anon;
grant execute on function public.get_solo_setup_identity() to authenticated;

create or replace function public.save_solo_setup_identity(
  _brief jsonb,
  _expected_updated_at text default null,
  _proposal_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_tid uuid := public.current_user_tenant_id();
  v_saved jsonb;
  v_legal_name text;
  v_registration_raw text := nullif(btrim(coalesce(_brief ->> 'businessRegistrationNumber', '')), '');
  v_registration_digits text;
  v_registration_identifier text := upper(nullif(btrim(coalesce(_brief ->> 'businessRegistrationIdentifier', '')), ''));
  v_secret_ref text;
  v_secret_id uuid;
  v_last4 text;
  v_rep uuid;
  v_rep_first text;
  v_rep_last text;
  v_rep_email text;
  v_rep_title text;
  v_full_name text;
  v_regions text[];
  v_address text;
begin
  if auth.uid() is null or v_tid is null then
    raise exception 'active workspace not resolved' using errcode = '42501';
  end if;
  if _brief is null or jsonb_typeof(_brief) <> 'object' then
    raise exception 'business brief must be an object' using errcode = '22023';
  end if;

  -- The existing owner-confirmed brief seam remains the one owner of general
  -- operating context. The full registration number is removed before that call,
  -- so it can never land in tenants.brand or Paige prompt context.
  v_saved := public.save_solo_business_brief(
    _brief - 'businessRegistrationNumber',
    _expected_updated_at,
    _proposal_id
  );

  v_legal_name := nullif(btrim(coalesce(_brief ->> 'legalName', '')), '');
  if v_legal_name is null then
    -- Setup can still save a non-regulatory business brief without a legal name.
    -- It does not create or overwrite the carrier/legal record with a public name.
    select business_registration_number_last_4 into v_last4
    from public.tenant_legal_profile where tenant_id = v_tid;
    return jsonb_build_object('business_brief', v_saved, 'businessRegistrationNumberLast4', v_last4);
  end if;

  if v_registration_identifier is not null and v_registration_identifier not in ('EIN','DUNS','CBN','CN','ACN','CIN','VAT','VATRN','RN','OTHER') then
    raise exception 'unsupported business registration identifier' using errcode = '22023';
  end if;
  if v_registration_raw is not null then
    v_registration_digits := regexp_replace(v_registration_raw, '[^0-9]', '', 'g');
    if coalesce(v_registration_identifier, 'EIN') = 'EIN' and v_registration_digits !~ '^[0-9]{9}$' then
      raise exception 'an EIN must contain exactly 9 digits' using errcode = '22023';
    end if;
    if char_length(v_registration_digits) < 4 or char_length(v_registration_digits) > 32 then
      raise exception 'business registration number is invalid' using errcode = '22023';
    end if;
    v_last4 := right(v_registration_digits, 4);
    v_secret_ref := 'tenant-a2p-registration-number-' || v_tid::text;
    select id into v_secret_id from vault.secrets where name = v_secret_ref;
    if v_secret_id is null then
      perform vault.create_secret(v_registration_digits, v_secret_ref, 'Tenant legal registration number for TrustHub/A2P');
    else
      perform vault.update_secret(v_secret_id, v_registration_digits, v_secret_ref, 'Tenant legal registration number for TrustHub/A2P');
    end if;
  else
    select business_registration_number_secret_ref, business_registration_number_last_4
      into v_secret_ref, v_last4
      from public.tenant_legal_profile where tenant_id = v_tid;
  end if;

  if nullif(btrim(coalesce(_brief ->> 'authorizedRepresentativeUserId', '')), '') is not null then
    begin
      v_rep := (_brief ->> 'authorizedRepresentativeUserId')::uuid;
    exception when invalid_text_representation then
      raise exception 'authorized representative id is invalid' using errcode = '22023';
    end;
    if not exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = v_tid and tm.user_id = v_rep and tm.status = 'active'
    ) then
      raise exception 'authorized representative must be an active Team member' using errcode = '42501';
    end if;
    if not (coalesce(_brief -> 'representativeUserIds', '[]'::jsonb) ? v_rep::text) then
      raise exception 'authorized representative must also be a confirmed business representative' using errcode = '22023';
    end if;
    select p.first_name, p.last_name, p.full_name, u.email,
           coalesce(tm.role::text, case when tm.is_owner then 'owner' end)
      into v_rep_first, v_rep_last, v_full_name, v_rep_email, v_rep_title
      from public.tenant_members tm
      join auth.users u on u.id = tm.user_id
      left join public.profiles p on p.user_id = tm.user_id
      where tm.tenant_id = v_tid and tm.user_id = v_rep and tm.status = 'active'
      order by tm.is_owner desc limit 1;
    if nullif(v_rep_first, '') is null and nullif(v_full_name, '') is not null then
      v_rep_first := split_part(btrim(v_full_name), ' ', 1);
      v_rep_last := nullif(btrim(substr(btrim(v_full_name), char_length(v_rep_first) + 1)), '');
    end if;
  end if;

  v_regions := string_to_array(nullif(btrim(coalesce(_brief ->> 'regionsOfOperation', '')), ''), ',');
  if v_regions is null then v_regions := array['USA_AND_CANADA']::text[]; end if;
  if exists (
    select 1 from unnest(v_regions) region
    where btrim(region) not in ('AFRICA','ASIA','EUROPE','LATIN_AMERICA','USA_AND_CANADA')
  ) then
    raise exception 'unsupported business region of operation' using errcode = '22023';
  end if;
  select array_agg(btrim(region)) into v_regions from unnest(v_regions) region;

  v_address := nullif(btrim(concat_ws(', ',
    nullif(_brief ->> 'registeredStreet', ''),
    nullif(_brief ->> 'registeredStreetSecondary', ''),
    nullif(_brief ->> 'registeredCity', ''),
    nullif(concat_ws(' ', nullif(_brief ->> 'registeredRegion', ''), nullif(_brief ->> 'registeredPostalCode', '')), ''),
    nullif(_brief ->> 'registeredIsoCountry', '')
  )), '');
  if v_address is null then v_address := nullif(btrim(coalesce(_brief ->> 'address', '')), ''); end if;

  insert into public.tenant_legal_profile (
    tenant_id, legal_business_name, dba_name, entity_type, state_of_formation,
    registered_address, registered_street, registered_street_secondary, registered_city,
    registered_region, registered_postal_code, registered_iso_country,
    support_phone, website_url, business_identity, business_industry,
    business_regions_of_operation, business_registration_identifier,
    business_registration_number_secret_ref, business_registration_number_last_4,
    authorized_representative_user_id, authorized_representative_first_name,
    authorized_representative_last_name, authorized_representative_email,
    authorized_representative_phone, authorized_representative_business_title,
    authorized_representative_job_position
  ) values (
    v_tid, v_legal_name, nullif(btrim(_brief ->> 'dbaName'), ''),
    nullif(btrim(_brief ->> 'entityType'), ''), nullif(btrim(_brief ->> 'stateOfFormation'), ''),
    v_address, nullif(btrim(_brief ->> 'registeredStreet'), ''),
    nullif(btrim(_brief ->> 'registeredStreetSecondary'), ''), nullif(btrim(_brief ->> 'registeredCity'), ''),
    upper(nullif(btrim(_brief ->> 'registeredRegion'), '')), nullif(btrim(_brief ->> 'registeredPostalCode'), ''),
    upper(nullif(btrim(_brief ->> 'registeredIsoCountry'), '')),
    nullif(btrim(_brief ->> 'phone'), ''), nullif(btrim(_brief ->> 'website'), ''),
    'direct_customer', nullif(btrim(_brief ->> 'industry'), ''), v_regions,
    coalesce(v_registration_identifier, case when v_registration_raw is not null then 'EIN' end),
    v_secret_ref, v_last4, v_rep, nullif(v_rep_first, ''), nullif(v_rep_last, ''),
    nullif(v_rep_email, ''), nullif(btrim(_brief ->> 'authorizedRepresentativePhone'), ''),
    nullif(v_rep_title, ''), nullif(btrim(_brief ->> 'authorizedRepresentativeJobPosition'), '')
  )
  on conflict (tenant_id) do update set
    legal_business_name = excluded.legal_business_name,
    dba_name = excluded.dba_name,
    entity_type = excluded.entity_type,
    state_of_formation = excluded.state_of_formation,
    registered_address = excluded.registered_address,
    registered_street = excluded.registered_street,
    registered_street_secondary = excluded.registered_street_secondary,
    registered_city = excluded.registered_city,
    registered_region = excluded.registered_region,
    registered_postal_code = excluded.registered_postal_code,
    registered_iso_country = excluded.registered_iso_country,
    support_phone = excluded.support_phone,
    website_url = excluded.website_url,
    business_identity = excluded.business_identity,
    business_industry = excluded.business_industry,
    business_regions_of_operation = excluded.business_regions_of_operation,
    business_registration_identifier = coalesce(excluded.business_registration_identifier, tenant_legal_profile.business_registration_identifier),
    business_registration_number_secret_ref = coalesce(excluded.business_registration_number_secret_ref, tenant_legal_profile.business_registration_number_secret_ref),
    business_registration_number_last_4 = coalesce(excluded.business_registration_number_last_4, tenant_legal_profile.business_registration_number_last_4),
    authorized_representative_user_id = excluded.authorized_representative_user_id,
    authorized_representative_first_name = excluded.authorized_representative_first_name,
    authorized_representative_last_name = excluded.authorized_representative_last_name,
    authorized_representative_email = excluded.authorized_representative_email,
    authorized_representative_phone = excluded.authorized_representative_phone,
    authorized_representative_business_title = excluded.authorized_representative_business_title,
    authorized_representative_job_position = excluded.authorized_representative_job_position,
    updated_at = now();

  insert into public.paige_audit_log(actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload)
  values (auth.uid(), 'authorized_owner', 'solo_setup.legal_identity_saved', 'tenant_legal_profile', v_tid, v_tid,
    jsonb_build_object(
      'registration_number_present', v_secret_ref is not null,
      'registration_identifier', coalesce(v_registration_identifier, 'EIN'),
      'authorized_representative_present', v_rep is not null
    ));

  return jsonb_build_object(
    'business_brief', v_saved,
    'businessRegistrationNumberLast4', v_last4
  );
end;
$$;

revoke all on function public.save_solo_setup_identity(jsonb,text,uuid) from public, anon;
grant execute on function public.save_solo_setup_identity(jsonb,text,uuid) to authenticated;

create or replace function public.read_tenant_business_registration_number(_tenant_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare v_ref text; v_secret text;
begin
  select business_registration_number_secret_ref into v_ref
  from public.tenant_legal_profile where tenant_id = _tenant_id;
  if v_ref is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = v_ref limit 1;
  return v_secret;
end;
$$;

revoke all on function public.read_tenant_business_registration_number(uuid) from public, anon, authenticated;
grant execute on function public.read_tenant_business_registration_number(uuid) to service_role;

-- Extend the existing direct-caller guard. The new TrustHub resource SIDs are
-- provider-owned exactly like brand/campaign/messaging-service SIDs.
create or replace function public.a2p_registration_guard_submission_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare v_governed boolean;
begin
  v_governed := current_user in ('postgres', 'supabase_admin', 'service_role');
  if v_governed then return new; end if;

  if tg_op = 'INSERT' then
    if new.submitted_at is not null or new.approved_at is not null
       or coalesce(new.status, 'pending') is distinct from 'pending'
       or coalesce(new.brand_status, 'pending') is distinct from 'pending'
       or coalesce(new.campaign_status, 'pending') is distinct from 'pending'
       or new.customer_profile_sid is not null or new.trust_product_sid is not null
       or new.brand_sid is not null or new.campaign_sid is not null
       or new.messaging_service_sid is not null then
      raise exception 'submission state is server-owned: a registration cannot be created already submitted, approved or carrier-linked'
        using errcode = '42501', hint = 'SUBMISSION_STATE_PROTECTED';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id or new.created_at is distinct from old.created_at
     or new.tenant_id is distinct from old.tenant_id then
    raise exception 'a registration''s identity, owner and creation time are not client-writable'
      using errcode = '42501', hint = 'IDENTITY_PROTECTED';
  end if;

  if new.submitted_at is distinct from old.submitted_at
     or new.approved_at is distinct from old.approved_at
     or new.status is distinct from old.status
     or new.brand_status is distinct from old.brand_status
     or new.campaign_status is distinct from old.campaign_status
     or new.customer_profile_sid is distinct from old.customer_profile_sid
     or new.trust_product_sid is distinct from old.trust_product_sid
     or new.brand_sid is distinct from old.brand_sid
     or new.campaign_sid is distinct from old.campaign_sid
     or new.messaging_service_sid is distinct from old.messaging_service_sid then
    raise exception 'submission state is server-owned and cannot be set from a direct client write'
      using errcode = '42501', hint = 'SUBMISSION_STATE_PROTECTED';
  end if;

  if public.a2p_registration_is_immutable(old)
     and (new.use_case is distinct from old.use_case
       or new.campaign_description is distinct from old.campaign_description
       or new.sample_messages is distinct from old.sample_messages
       or new.optin_flow is distinct from old.optin_flow
       or new.optin_message is distinct from old.optin_message
       or new.optout_message is distinct from old.optout_message
       or new.help_message is distinct from old.help_message) then
    raise exception 'this registration has left preparation and its copy cannot be edited from a direct client write'
      using errcode = '42501', hint = 'REGISTRATION_IMMUTABLE';
  end if;
  return new;
end;
$$;

comment on function public.a2p_registration_guard_submission_state() is
  'a2p_submission_state_is_server_owned: direct callers cannot rewrite provider-owned A2P state, '
  'including Customer Profile and Trust Product SIDs; identity is frozen at every stage and draft copy '
  'is frozen after preparation.';

comment on function public.save_solo_setup_identity(jsonb,text,uuid) is
  'Atomic owner/admin Setup save: general brief stays in tenants.brand, legal sender facts synchronize to tenant_legal_profile, and full registration numbers go only to Vault.';
comment on function public.get_solo_setup_identity() is
  'Tenant-scoped Setup read that overlays the canonical legal sender identity and exposes only the registration-number last four.';
comment on function public.read_tenant_business_registration_number(uuid) is
  'Service-role-only TrustHub bridge. Returns a vaulted tenant registration number for a server-resolved tenant; never granted to browser roles.';

commit;
