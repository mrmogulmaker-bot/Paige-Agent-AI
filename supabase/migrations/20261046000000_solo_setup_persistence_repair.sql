-- Solo Settings -> Setup persistence repair (after the 20261020020000 legal identity contract).
--
-- This forward-only migration repairs the production enum/text failure that
-- rolled back every business-brief save, adds a tenant-owned business ownership
-- record that is deliberately separate from Team access, and exposes one
-- canonical read/write contract with server-enforced Owner/Admin boundaries.
-- The existing legal audit records registration_number_present as a boolean
-- only; no registration number, owner name, percentage, address, or contact
-- value is copied into audit payloads.

begin;

create table if not exists public.tenant_business_owners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_kind text not null check (owner_kind in ('individual','company','trust','other_legal_person')),
  legal_name text not null check (char_length(btrim(legal_name)) between 1 and 500),
  display_name text check (display_name is null or char_length(btrim(display_name)) <= 500),
  ownership_interest numeric(5,2) check (ownership_interest is null or (ownership_interest >= 0 and ownership_interest <= 100)),
  effective_date date,
  ownership_status text not null default 'active' check (ownership_status in ('active','former','pending','other')),
  representative_user_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  setup_provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(setup_provenance) = 'object')
);

create index if not exists tenant_business_owners_tenant_idx
  on public.tenant_business_owners(tenant_id);
create index if not exists tenant_business_owners_representative_idx
  on public.tenant_business_owners(representative_user_id)
  where representative_user_id is not null;

alter table public.tenant_business_owners enable row level security;
revoke all on table public.tenant_business_owners from public, anon, authenticated;

create table if not exists public.tenant_business_representatives (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'owner_confirmed'
    check (source in ('owner_confirmed','connection_sourced','needs_confirmation')),
  confidence text not null default 'confirmed'
    check (confidence in ('confirmed','observed','unknown')),
  confirmed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (tenant_id,user_id)
);

alter table public.tenant_business_representatives enable row level security;
revoke all on table public.tenant_business_representatives from public, anon, authenticated;

create table if not exists public.tenant_setup_private_context (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  private_brief jsonb not null default '{}'::jsonb check (jsonb_typeof(private_brief)='object'),
  setup_provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(setup_provenance)='object'),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tenant_setup_private_context enable row level security;
revoke all on table public.tenant_setup_private_context from public,anon,authenticated;

-- Move the former embedded Team references into a tenant-owned Setup relation.
-- The embedded copy is removed below so the shared PAIGE resolver cannot receive
-- private Team ids or protected legal/contact facts through tenants.brand.
insert into public.tenant_business_representatives(
  tenant_id,user_id,source,confidence,confirmed_at,created_by
)
select t.id, value::uuid,
  case when t.brand -> 'business_brief' -> 'provenance' -> 'representatives' ->> 'source'
       in ('owner_confirmed','connection_sourced','needs_confirmation')
    then t.brand -> 'business_brief' -> 'provenance' -> 'representatives' ->> 'source'
    else 'owner_confirmed' end,
  case when t.brand -> 'business_brief' -> 'provenance' -> 'representatives' ->> 'confidence'
       in ('confirmed','observed','unknown')
    then t.brand -> 'business_brief' -> 'provenance' -> 'representatives' ->> 'confidence'
    else 'confirmed' end,
  case when t.brand -> 'business_brief' -> 'provenance' -> 'representatives' ->> 'confirmedAt'
       ~ '^\d{4}-\d{2}-\d{2}T'
    then (t.brand -> 'business_brief' -> 'provenance' -> 'representatives' ->> 'confirmedAt')::timestamptz
    else null end,
  t.owner_user_id
from public.tenants t
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(t.brand -> 'business_brief' -> 'representativeUserIds')='array'
    then t.brand -> 'business_brief' -> 'representativeUserIds' else '[]'::jsonb end
) value
join public.tenant_members tm on tm.tenant_id=t.id and tm.user_id=value::uuid and tm.status='active'
on conflict(tenant_id,user_id) do nothing;

-- Preserve every private value before removing its embedded legacy copy.
-- Existing tenant_legal_profile values remain authoritative on read; this
-- private record is the lossless fallback for fields that were never moved.
insert into public.tenant_setup_private_context(
  tenant_id,private_brief,setup_provenance,created_by,updated_by
)
select t.id,private_values.values,private_provenance.values,t.owner_user_id,t.owner_user_id
from public.tenants t
cross join lateral (
  select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) as values
  from jsonb_each(coalesce(t.brand -> 'business_brief','{}'::jsonb)) e
  where e.key=any(array[
    'legalName','address','phone','entityType','stateOfFormation',
    'businessRegistrationIdentifier','regionsOfOperation','registeredStreet',
    'registeredStreetSecondary','registeredCity','registeredRegion',
    'registeredPostalCode','registeredIsoCountry','authorizedRepresentativePhone',
    'authorizedRepresentativeJobPosition','authorizedRepresentativeUserId'
  ]::text[])
) private_values
cross join lateral (
  select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) as values
  from jsonb_each(coalesce(t.brand -> 'business_brief' -> 'provenance','{}'::jsonb)) e
  where e.key=any(array[
    'legalName','address','phone','entityType','stateOfFormation',
    'businessRegistrationIdentifier','regionsOfOperation','registeredStreet',
    'registeredStreetSecondary','registeredCity','registeredRegion',
    'registeredPostalCode','registeredIsoCountry','authorizedRepresentativePhone',
    'authorizedRepresentativeJobPosition','authorizedRepresentative'
  ]::text[])
) private_provenance
where private_values.values<>'{}'::jsonb or private_provenance.values<>'{}'::jsonb
on conflict(tenant_id) do update set
  private_brief=tenant_setup_private_context.private_brief || excluded.private_brief,
  setup_provenance=tenant_setup_private_context.setup_provenance || excluded.setup_provenance,
  updated_at=now();

update public.tenants t
set brand = jsonb_set(
  coalesce(t.brand,'{}'::jsonb),
  '{business_brief}',
  jsonb_set(
    coalesce(t.brand -> 'business_brief','{}'::jsonb) - array[
      'legalName','address','phone','entityType','stateOfFormation',
      'businessRegistrationIdentifier','businessRegistrationNumber',
      'regionsOfOperation','registeredStreet','registeredStreetSecondary',
      'registeredCity','registeredRegion','registeredPostalCode','registeredIsoCountry',
      'authorizedRepresentativePhone','authorizedRepresentativeJobPosition',
      'authorizedRepresentativeUserId','representativeUserIds'
    ]::text[],
    '{provenance}',
    coalesce(t.brand -> 'business_brief' -> 'provenance','{}'::jsonb) - array[
      'legalName','address','phone','entityType','stateOfFormation',
      'businessRegistrationIdentifier','regionsOfOperation','registeredStreet',
      'registeredStreetSecondary','registeredCity','registeredRegion',
      'registeredPostalCode','registeredIsoCountry','authorizedRepresentativePhone',
      'authorizedRepresentativeJobPosition','authorizedRepresentative','representatives'
    ]::text[],
    true
  ),
  true
)
where t.brand ? 'business_brief';

alter table public.tenant_legal_profile
  add column if not exists setup_provenance jsonb not null default '{}'::jsonb;

alter table public.tenant_legal_profile
  drop constraint if exists tenant_legal_profile_registration_last4_chk;
alter table public.tenant_legal_profile
  add constraint tenant_legal_profile_registration_last4_chk
  check (business_registration_number_last_4 is null or business_registration_number_last_4 ~ '^[A-Za-z0-9._/-]{4}$');

create or replace function public.solo_setup_can_read()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.current_user_tenant_id() is not null
    and exists (
      select 1 from public.tenants t
      left join public.tenant_members m
        on m.tenant_id = t.id and m.user_id = auth.uid() and m.status = 'active'
      where t.id = public.current_user_tenant_id()
        and (t.owner_user_id = auth.uid() or m.user_id is not null)
    )
$$;

revoke all on function public.solo_setup_can_read() from public, anon, authenticated;

create or replace function public.solo_setup_access_scope()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tid uuid := public.current_user_tenant_id();
  v_role text;
begin
  if auth.uid() is null or v_tid is null then return 'read_only'; end if;
  select case
    when t.owner_user_id = auth.uid() or m.is_owner or m.role::text = 'owner' then 'owner_full'
    when m.role::text = 'admin' then 'admin_operational'
    else 'read_only'
  end
  into v_role
  from public.tenants t
  left join public.tenant_members m
    on m.tenant_id = t.id and m.user_id = auth.uid() and m.status = 'active'
  where t.id = v_tid;
  return coalesce(v_role, 'read_only');
end;
$$;

revoke all on function public.solo_setup_access_scope() from public, anon, authenticated;

-- Replace the broken general save in place. Existing service callers keep the
-- same signature, while the server now preserves connection provenance unless
-- the owner explicitly adopts or overrides that fact.
create or replace function public.save_solo_business_brief(
  _brief jsonb,
  _expected_updated_at text default null,
  _proposal_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tid uuid := public.current_user_tenant_id();
  v_brand jsonb;
  v_current jsonb;
  v_canonical jsonb := '{}'::jsonb;
  v_safe_canonical jsonb := '{}'::jsonb;
  v_provenance jsonb := '{}'::jsonb;
  v_representatives jsonb := '[]'::jsonb;
  v_current_representatives jsonb := '[]'::jsonb;
  v_representative_provenance jsonb;
  v_decisions jsonb := coalesce(_brief -> 'sourceDecisions', '{}'::jsonb);
  v_key text;
  v_value text;
  v_current_value text;
  v_decision text;
  v_now timestamptz := clock_timestamp();
  v_role text;
  v_tenant_name text;
  v_access text := public.solo_setup_access_scope();
  v_rep_count integer;
  v_valid_rep_count integer;
  v_allowed_keys constant text[] := array[
    'legalName','publicName','dbaName','website','address','phone','industry','naicsCode','sicCode',
    'offers','deliveryModel','idealCustomer','customerSegments','serviceArea','currentPriority','goals90Day',
    'annualDirection','successDefinition','constraints','brandVoice','operatingPreferences','doNotAssume'
  ];
  v_admin_keys constant text[] := array[
    'offers','deliveryModel','idealCustomer','customerSegments','serviceArea','currentPriority','goals90Day',
    'annualDirection','successDefinition','constraints','brandVoice','operatingPreferences','doNotAssume'
  ];
begin
  if auth.uid() is null or v_tid is null then
    raise exception 'active workspace not resolved' using errcode = '42501';
  end if;
  if v_access not in ('owner_full','admin_operational') then
    raise exception 'not authorized to edit this business brief' using errcode = '42501';
  end if;
  if _brief is null or jsonb_typeof(_brief) <> 'object' or pg_column_size(_brief) > 65536 then
    raise exception 'business brief must be a JSON object no larger than 64 KB' using errcode = '22023';
  end if;
  if jsonb_typeof(v_decisions) <> 'object' then
    raise exception 'source decisions must be an object' using errcode = '22023';
  end if;

  select coalesce(brand, '{}'::jsonb), name into v_brand, v_tenant_name
  from public.tenants where id = v_tid for update;
  if not found then raise exception 'workspace not found' using errcode = 'P0002'; end if;

  v_current := coalesce(v_brand -> 'business_brief', '{}'::jsonb);
  select coalesce(jsonb_agg(r.user_id::text order by r.user_id::text),'[]'::jsonb)
  into v_current_representatives
  from public.tenant_business_representatives r where r.tenant_id=v_tid;
  select jsonb_build_object(
    'source',r.source,'confidence',r.confidence,'confirmedAt',r.confirmed_at
  ) into v_representative_provenance
  from public.tenant_business_representatives r
  where r.tenant_id=v_tid order by r.created_at limit 1;
  if nullif(v_current ->> 'updatedAt', '') is not null
     and (_expected_updated_at is null or nullif(v_current ->> 'updatedAt', '') is distinct from _expected_updated_at) then
    raise exception 'This brief changed in another session. Reload it before saving.'
      using errcode = '40001', hint = 'SETUP_CONFLICT';
  end if;

  if _proposal_id is not null
     and nullif(v_brand -> 'business_brief_proposal' ->> 'id', '') is distinct from _proposal_id::text then
    raise exception 'The Paige proposal is no longer current. Reload before applying it.'
      using errcode = '40001', hint = 'SETUP_CONFLICT';
  end if;

  foreach v_key in array v_allowed_keys loop
    if _brief ? v_key and jsonb_typeof(_brief -> v_key) not in ('string','null') then
      raise exception 'business brief field % must be text', v_key using errcode = '22023';
    end if;
    v_value := nullif(btrim(coalesce(_brief ->> v_key, '')), '');
    v_current_value := nullif(btrim(coalesce(v_current ->> v_key, '')), '');
    if v_value is not null and char_length(v_value) > 4000 then
      raise exception 'business brief field % is too long', v_key using errcode = '22001';
    end if;
    if v_access = 'admin_operational'
       and not v_key = any(v_admin_keys)
       and v_value is distinct from v_current_value then
      if not (
        v_key = 'publicName'
        and coalesce(nullif(v_current ->> 'legalName',''),nullif(v_current ->> 'publicName',''),nullif(v_current ->> 'dbaName','')) is null
        and v_value = v_tenant_name
      ) then
        raise exception 'only the workspace Owner can change legal identity or business ownership'
          using errcode = '42501', hint = 'SETUP_OWNER_REQUIRED';
      end if;
    end if;
    v_decision := nullif(v_decisions ->> v_key, '');
    if v_access = 'admin_operational'
       and v_decision is not null
       and not v_key = any(v_admin_keys) then
      raise exception 'only the workspace Owner can adopt or override protected identity facts'
        using errcode = '42501', hint = 'SETUP_OWNER_REQUIRED';
    end if;
    if v_current -> 'provenance' -> v_key ->> 'source' = 'connection_sourced'
       and v_value is distinct from v_current_value
       and v_decision is distinct from 'override' then
      raise exception 'connection-sourced field % requires an explicit override', v_key
        using errcode = '22023', hint = 'SETUP_SOURCE_DECISION_REQUIRED';
    end if;
    v_canonical := v_canonical || jsonb_build_object(v_key, coalesce(v_value, ''));
    if v_value is not null then
      if v_value is not distinct from v_current_value
         and v_decision is distinct from 'adopt'
         and v_current -> 'provenance' -> v_key is not null then
        v_provenance := v_provenance || jsonb_build_object(v_key, v_current -> 'provenance' -> v_key);
      else
        v_provenance := v_provenance || jsonb_build_object(v_key, jsonb_build_object(
          'source','owner_confirmed','confidence','confirmed','confirmedAt',v_now
        ));
      end if;
    end if;
  end loop;

  if coalesce(nullif(v_canonical ->> 'legalName',''), nullif(v_canonical ->> 'publicName',''), nullif(v_canonical ->> 'dbaName','')) is null then
    raise exception 'at least one business name is required' using errcode = '22023';
  end if;
  if nullif(v_canonical ->> 'website','') is not null and v_canonical ->> 'website' !~* '^https?://[^[:space:]]+$' then
    raise exception 'website must be a complete http or https URL' using errcode = '22023';
  end if;
  if nullif(v_canonical ->> 'naicsCode','') is not null and v_canonical ->> 'naicsCode' !~ '^[0-9]{2,6}$' then
    raise exception 'NAICS code must contain 2 to 6 digits' using errcode = '22023';
  end if;
  if nullif(v_canonical ->> 'sicCode','') is not null and v_canonical ->> 'sicCode' !~ '^[0-9]{4}$' then
    raise exception 'SIC code must contain exactly 4 digits' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(_brief -> 'representativeUserIds','[]'::jsonb)) <> 'array' then
    raise exception 'representativeUserIds must be an array' using errcode = '22023';
  end if;
  select count(distinct value), coalesce(jsonb_agg(distinct value order by value), '[]'::jsonb)
  into v_rep_count, v_representatives
  from jsonb_array_elements_text(coalesce(_brief -> 'representativeUserIds','[]'::jsonb)) value;
  if exists (select 1 from jsonb_array_elements_text(v_representatives) value
             where value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'business representative id is invalid' using errcode = '22023';
  end if;
  select count(distinct m.user_id) into v_valid_rep_count
  from public.tenant_members m
  join jsonb_array_elements_text(v_representatives) value on m.user_id = value::uuid
  where m.tenant_id = v_tid and m.status = 'active';
  if v_rep_count <> v_valid_rep_count then
    raise exception 'every business representative must be an active Team member' using errcode = '42501';
  end if;
  if v_access = 'admin_operational'
     and v_representatives is distinct from v_current_representatives then
    raise exception 'only the workspace Owner can change legal identity or business ownership'
      using errcode = '42501', hint = 'SETUP_OWNER_REQUIRED';
  end if;
  if jsonb_array_length(v_representatives) > 0 then
    if v_representatives = v_current_representatives
       and v_representative_provenance is not null then
      v_provenance := v_provenance || jsonb_build_object('representatives', v_representative_provenance);
    else
      v_provenance := v_provenance || jsonb_build_object('representatives', jsonb_build_object(
        'source','owner_confirmed','confidence','confirmed','confirmedAt',v_now
      ));
    end if;
  end if;

  v_canonical := v_canonical || jsonb_build_object(
    'representativeUserIds',v_representatives,
    'provenance',v_provenance,
    'updatedAt',v_now,
    'updatedBy',auth.uid()
  );
  if v_access = 'owner_full' then
    delete from public.tenant_business_representatives where tenant_id=v_tid;
    insert into public.tenant_business_representatives(
      tenant_id,user_id,source,confidence,confirmed_at,created_by
    )
    select v_tid,value::uuid,'owner_confirmed','confirmed',v_now,auth.uid()
    from jsonb_array_elements_text(v_representatives) value;
  end if;
  v_safe_canonical := v_canonical - array[
    'legalName','address','phone','entityType','stateOfFormation',
    'businessRegistrationIdentifier','businessRegistrationNumber',
    'regionsOfOperation','registeredStreet','registeredStreetSecondary',
    'registeredCity','registeredRegion','registeredPostalCode','registeredIsoCountry',
    'authorizedRepresentativePhone','authorizedRepresentativeJobPosition',
    'authorizedRepresentativeUserId','representativeUserIds'
  ]::text[];
  v_safe_canonical := jsonb_set(
    v_safe_canonical,'{provenance}',
    coalesce(v_safe_canonical -> 'provenance','{}'::jsonb) - array[
      'legalName','address','phone','entityType','stateOfFormation',
      'businessRegistrationIdentifier','regionsOfOperation','registeredStreet',
      'registeredStreetSecondary','registeredCity','registeredRegion',
      'registeredPostalCode','registeredIsoCountry','authorizedRepresentativePhone',
      'authorizedRepresentativeJobPosition','authorizedRepresentative','representatives'
    ]::text[],true
  );
  update public.tenants
    set name = coalesce(nullif(v_canonical ->> 'publicName',''), name),
      brand = (v_brand || jsonb_build_object('business_brief',v_safe_canonical))
              - case when _proposal_id is not null then 'business_brief_proposal' else '__keep_proposal__' end
  where id = v_tid;

  select coalesce(m.role::text, case when m.is_owner then 'owner' else 'member' end)
  into v_role
  from public.tenant_members m
  where m.tenant_id = v_tid and m.user_id = auth.uid() and m.status = 'active'
  order by m.is_owner desc limit 1;

  -- This is an internal audit entry, not a claim that the PAIGE Rail contract
  -- consumes Setup. Payloads contain counts only: no field values or private data.
  insert into public.paige_audit_log(actor_user_id,actor_role,action,target_type,target_id,tenant_id,payload)
  values (
    auth.uid(),coalesce(v_role,'authorized_owner'),
    case
      when v_access = 'admin_operational' then 'solo_setup.admin_operational_saved'
      when _proposal_id is null then 'solo_setup.owner_saved'
      else 'solo_setup.owner_approved_proposal'
    end,
    'solo_business_brief',v_tid,v_tid,
    jsonb_build_object(
      'field_count',(select count(*) from jsonb_each_text(v_canonical) where key = any(v_allowed_keys) and value <> ''),
      'representative_count',jsonb_array_length(v_representatives),
      'proposal_applied',_proposal_id is not null
    )
  );
  return v_canonical;
end;
$$;

revoke all on function public.save_solo_business_brief(jsonb,text,uuid) from public, anon, authenticated;

create or replace function public.get_solo_setup_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_identity record;
  v_owners jsonb;
  v_representatives jsonb := '[]'::jsonb;
  v_representative_provenance jsonb;
  v_legal_provenance jsonb := '{}'::jsonb;
  v_private_brief jsonb := '{}'::jsonb;
  v_private_provenance jsonb := '{}'::jsonb;
begin
  if not public.solo_setup_can_read() then return null; end if;
  select * into v_identity from public.get_solo_setup_identity() limit 1;
  if not found then return null; end if;
  select coalesce(lp.setup_provenance,'{}'::jsonb) into v_legal_provenance
  from public.tenant_legal_profile lp where lp.tenant_id=v_identity.tenant_id;
  select coalesce(pc.private_brief,'{}'::jsonb),coalesce(pc.setup_provenance,'{}'::jsonb)
  into v_private_brief,v_private_provenance
  from public.tenant_setup_private_context pc where pc.tenant_id=v_identity.tenant_id;
  if v_legal_provenance ? 'authorizedRepresentativeUserId' then
    v_legal_provenance := (v_legal_provenance - 'authorizedRepresentativeUserId')
      || jsonb_build_object('authorizedRepresentative',v_legal_provenance -> 'authorizedRepresentativeUserId');
  end if;
  select coalesce(jsonb_agg(r.user_id::text order by r.user_id::text),'[]'::jsonb)
  into v_representatives
  from public.tenant_business_representatives r where r.tenant_id=v_identity.tenant_id;
  select jsonb_build_object('source',r.source,'confidence',r.confidence,'confirmedAt',r.confirmed_at)
  into v_representative_provenance
  from public.tenant_business_representatives r
  where r.tenant_id=v_identity.tenant_id order by r.created_at limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',bo.id,
    'ownerKind',bo.owner_kind,
    'legalName',bo.legal_name,
    'displayName',coalesce(bo.display_name,''),
    'ownershipInterest',coalesce(bo.ownership_interest::text,''),
    'effectiveDate',coalesce(bo.effective_date::text,''),
    'status',bo.ownership_status,
    'representativeUserId',coalesce(bo.representative_user_id::text,''),
    'provenance',bo.setup_provenance
  ) order by bo.created_at,bo.id),'[]'::jsonb)
  into v_owners
  from public.tenant_business_owners bo
  where bo.tenant_id = v_identity.tenant_id;
  return jsonb_build_object(
    'tenantId',v_identity.tenant_id,
    'tenantName',v_identity.tenant_name,
    'brief',jsonb_set(
      coalesce(v_private_brief,'{}'::jsonb)
        || coalesce(v_identity.business_brief,'{}'::jsonb) || jsonb_build_object(
        'businessRegistrationNumberLast4',coalesce(v_identity.business_registration_number_last_4,''),
        'representativeUserIds',v_representatives
      ),
      '{provenance}',
      coalesce(v_private_provenance,'{}'::jsonb)
        || coalesce(v_identity.business_brief -> 'provenance','{}'::jsonb)
        || coalesce(v_legal_provenance,'{}'::jsonb)
        || case when v_representative_provenance is null then '{}'::jsonb
             else jsonb_build_object('representatives',v_representative_provenance) end,
      true
    ),
    'pendingProposal',v_identity.pending_proposal,
    'primaryBusinessEmail',v_identity.primary_business_email,
    'accessScope',public.solo_setup_access_scope(),
    'businessOwners',v_owners
  );
end;
$$;

revoke all on function public.get_solo_setup_context() from public, anon;
grant execute on function public.get_solo_setup_context() to authenticated;

create or replace function public.save_solo_setup_context(
  _brief jsonb,
  _business_owners jsonb default '[]'::jsonb,
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
  v_access text := public.solo_setup_access_scope();
  v_item jsonb;
  v_id uuid;
  v_keep uuid[] := '{}'::uuid[];
  v_kind text;
  v_legal_name text;
  v_interest numeric(5,2);
  v_rep uuid;
  v_saved jsonb;
  v_admin_brief jsonb;
  v_tenant_name text;
  v_existing_context jsonb;
  v_key text;
  v_owner_only_keys constant text[] := array[
    'legalName','publicName','dbaName','website','address','phone','industry','naicsCode','sicCode',
    'entityType','stateOfFormation','businessRegistrationIdentifier','businessRegistrationNumber',
    'regionsOfOperation','registeredStreet','registeredStreetSecondary','registeredCity','registeredRegion',
    'registeredPostalCode','registeredIsoCountry','authorizedRepresentativePhone',
    'authorizedRepresentativeJobPosition','authorizedRepresentativeUserId'
  ];
  v_existing_owner public.tenant_business_owners%rowtype;
  v_owner_provenance jsonb;
  v_private_current jsonb := '{}'::jsonb;
  v_private_provenance jsonb := '{}'::jsonb;
  v_private_next jsonb := '{}'::jsonb;
  v_private_provenance_next jsonb := '{}'::jsonb;
  v_private_value text;
  v_private_old_value text;
  v_private_decision text;
  v_private_keys constant text[] := array['address','phone'];
begin
  if auth.uid() is null or v_tid is null or not public.solo_setup_can_read() then
    raise exception 'active workspace not resolved' using errcode = '42501';
  end if;
  if v_access not in ('owner_full','admin_operational') then
    raise exception 'not authorized to edit this business brief' using errcode = '42501';
  end if;
  if _business_owners is null or jsonb_typeof(_business_owners) <> 'array'
     or jsonb_array_length(_business_owners) > 50 or pg_column_size(_business_owners)>131072 then
    raise exception 'business owners must be an array of at most 50 records and 128 KB' using errcode = '22023';
  end if;

  if v_access = 'owner_full' then
    -- Existing legal/Vault code remains the single protected-storage boundary.
    perform public.save_solo_setup_identity(_brief,_expected_updated_at,_proposal_id);
    select coalesce(pc.private_brief,'{}'::jsonb),coalesce(pc.setup_provenance,'{}'::jsonb)
    into v_private_current,v_private_provenance
    from public.tenant_setup_private_context pc where pc.tenant_id=v_tid for update;
    v_private_current:=coalesce(v_private_current,'{}'::jsonb);
    v_private_provenance:=coalesce(v_private_provenance,'{}'::jsonb);
    v_private_next:=v_private_current;
    v_private_provenance_next:=v_private_provenance;
    foreach v_key in array v_private_keys loop
      v_private_value:=nullif(btrim(coalesce(_brief ->> v_key,'')),'');
      v_private_old_value:=nullif(btrim(coalesce(v_private_current ->> v_key,'')),'');
      v_private_decision:=nullif(_brief -> 'sourceDecisions' ->> v_key,'');
      if v_private_provenance -> v_key ->> 'source'='connection_sourced'
         and v_private_value is distinct from v_private_old_value
         and v_private_decision is distinct from 'override' then
        raise exception 'connection-sourced private field % requires an explicit override',v_key
          using errcode='22023',hint='SETUP_SOURCE_DECISION_REQUIRED';
      end if;
      if v_private_value is null then
        v_private_next:=v_private_next - v_key;
        v_private_provenance_next:=v_private_provenance_next - v_key;
      else
        v_private_next:=v_private_next || jsonb_build_object(v_key,v_private_value);
        if v_private_value is not distinct from v_private_old_value
           and v_private_decision is distinct from 'adopt'
           and v_private_provenance -> v_key is not null then
          null;
        else
          v_private_provenance_next:=v_private_provenance_next || jsonb_build_object(
            v_key,jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp())
          );
        end if;
      end if;
    end loop;
    if exists(select 1 from public.tenant_legal_profile lp where lp.tenant_id=v_tid) then
      v_private_next:=v_private_next - array[
        'legalName','entityType','stateOfFormation','businessRegistrationIdentifier',
        'regionsOfOperation','registeredStreet','registeredStreetSecondary','registeredCity',
        'registeredRegion','registeredPostalCode','registeredIsoCountry',
        'authorizedRepresentativePhone','authorizedRepresentativeJobPosition',
        'authorizedRepresentativeUserId'
      ]::text[];
      v_private_provenance_next:=v_private_provenance_next - array[
        'legalName','entityType','stateOfFormation','businessRegistrationIdentifier',
        'regionsOfOperation','registeredStreet','registeredStreetSecondary','registeredCity',
        'registeredRegion','registeredPostalCode','registeredIsoCountry',
        'authorizedRepresentativePhone','authorizedRepresentativeJobPosition',
        'authorizedRepresentative'
      ]::text[];
    end if;
    insert into public.tenant_setup_private_context(
      tenant_id,private_brief,setup_provenance,created_by,updated_by,updated_at
    ) values(v_tid,v_private_next,v_private_provenance_next,auth.uid(),auth.uid(),now())
    on conflict(tenant_id) do update set
      private_brief=excluded.private_brief,setup_provenance=excluded.setup_provenance,
      updated_by=auth.uid(),updated_at=now();
    if nullif(btrim(coalesce(_brief ->> 'regionsOfOperation','')),'') is null then
      update public.tenant_legal_profile
      set business_regions_of_operation = '{}'::text[], updated_at = now()
      where tenant_id = v_tid;
    end if;
    perform 1 from public.tenant_business_owners
      where tenant_id = v_tid order by id for update;
    for v_item in select value from jsonb_array_elements(_business_owners) loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'each business owner must be an object' using errcode = '22023';
      end if;
      v_kind := nullif(v_item ->> 'ownerKind','');
      v_legal_name := nullif(btrim(coalesce(v_item ->> 'legalName','')),'');
      if v_kind not in ('individual','company','trust','other_legal_person') or v_legal_name is null then
        raise exception 'each business owner needs a supported type and legal name' using errcode = '22023';
      end if;
      begin
        v_id := coalesce(nullif(v_item ->> 'id','')::uuid,gen_random_uuid());
        v_interest := nullif(v_item ->> 'ownershipInterest','')::numeric;
        v_rep := nullif(v_item ->> 'representativeUserId','')::uuid;
      exception when invalid_text_representation then
        raise exception 'business owner id, interest, or representative is invalid' using errcode = '22023';
      end;
      if v_interest is not null and (v_interest < 0 or v_interest > 100) then
        raise exception 'ownership interest must be between 0 and 100 when provided' using errcode = '22023';
      end if;
      if v_rep is not null and not exists (
        select 1 from public.tenant_members tm
        where tm.tenant_id = v_tid and tm.user_id = v_rep and tm.status = 'active'
      ) then
        raise exception 'every designated representative must be an active Team member' using errcode = '42501';
      end if;
      select * into v_existing_owner from public.tenant_business_owners
      where id=v_id and tenant_id=v_tid;
      if coalesce((v_item ->> 'deleteRequested')::boolean,false) then
        if not found then raise exception 'business owner record does not belong to this workspace' using errcode='42501'; end if;
        if exists(select 1 from jsonb_each(v_existing_owner.setup_provenance) p where p.value ->> 'source'='connection_sourced')
           and nullif(v_item ->> 'sourceDecision','') is distinct from 'override' then
          raise exception 'deleting connection-sourced business ownership requires an explicit override'
            using errcode='22023', hint='SETUP_SOURCE_DECISION_REQUIRED';
        end if;
        delete from public.tenant_business_owners where id=v_id and tenant_id=v_tid;
        continue;
      end if;
      if found
         and exists(select 1 from jsonb_each(v_existing_owner.setup_provenance) p where p.value ->> 'source'='connection_sourced')
         and (
           v_existing_owner.owner_kind is distinct from v_kind
           or v_existing_owner.legal_name is distinct from v_legal_name
           or v_existing_owner.display_name is distinct from nullif(btrim(v_item ->> 'displayName'),'')
           or v_existing_owner.ownership_interest is distinct from v_interest
           or v_existing_owner.effective_date is distinct from nullif(v_item ->> 'effectiveDate','')::date
           or v_existing_owner.ownership_status is distinct from coalesce(nullif(v_item ->> 'status',''),'active')
           or v_existing_owner.representative_user_id is distinct from v_rep
         )
         and nullif(v_item ->> 'sourceDecision','') is distinct from 'override' then
        raise exception 'connection-sourced business ownership requires an explicit override'
          using errcode='22023', hint='SETUP_SOURCE_DECISION_REQUIRED';
      end if;
      v_owner_provenance := jsonb_build_object(
        'ownerKind',jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp()),
        'legalName',jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp()),
        'status',jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp())
      );
      if nullif(btrim(v_item ->> 'displayName'),'') is not null then
        v_owner_provenance := v_owner_provenance || jsonb_build_object('displayName',jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp()));
      end if;
      if v_interest is not null then
        v_owner_provenance := v_owner_provenance || jsonb_build_object('ownershipInterest',jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp()));
      end if;
      if nullif(v_item ->> 'effectiveDate','') is not null then
        v_owner_provenance := v_owner_provenance || jsonb_build_object('effectiveDate',jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp()));
      end if;
      if v_rep is not null then
        v_owner_provenance := v_owner_provenance || jsonb_build_object('representativeUserId',jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp()));
      end if;
      insert into public.tenant_business_owners(
        id,tenant_id,owner_kind,legal_name,display_name,ownership_interest,effective_date,
        ownership_status,representative_user_id,created_by,updated_by,setup_provenance
      ) values (
        v_id,v_tid,v_kind,v_legal_name,nullif(btrim(v_item ->> 'displayName'),''),
        v_interest,nullif(v_item ->> 'effectiveDate','')::date,
        coalesce(nullif(v_item ->> 'status',''),'active'),v_rep,auth.uid(),auth.uid(),
        v_owner_provenance
      )
      on conflict(id) do update set
        owner_kind=excluded.owner_kind,
        legal_name=excluded.legal_name,
        display_name=excluded.display_name,
        ownership_interest=excluded.ownership_interest,
        effective_date=excluded.effective_date,
        ownership_status=excluded.ownership_status,
        representative_user_id=excluded.representative_user_id,
        setup_provenance=case
          when tenant_business_owners.owner_kind=excluded.owner_kind
           and tenant_business_owners.legal_name=excluded.legal_name
           and tenant_business_owners.display_name is not distinct from excluded.display_name
           and tenant_business_owners.ownership_interest is not distinct from excluded.ownership_interest
           and tenant_business_owners.effective_date is not distinct from excluded.effective_date
           and tenant_business_owners.ownership_status=excluded.ownership_status
           and tenant_business_owners.representative_user_id is not distinct from excluded.representative_user_id
          then case when nullif(v_item ->> 'sourceDecision','')='adopt' then excluded.setup_provenance else tenant_business_owners.setup_provenance end
          else excluded.setup_provenance end,
        updated_by=auth.uid(),
        updated_at=now()
      where tenant_business_owners.tenant_id = v_tid;
      if not found then
        raise exception 'business owner record does not belong to this workspace' using errcode = '42501';
      end if;
      v_keep := array_append(v_keep,v_id);
    end loop;
    if exists(
      select 1 from public.tenant_business_owners bo
      where bo.tenant_id=v_tid and not (bo.id=any(v_keep))
        and exists(select 1 from jsonb_each(bo.setup_provenance) p where p.value ->> 'source'='connection_sourced')
    ) then
      raise exception 'removing connection-sourced business ownership requires an explicit override'
        using errcode='22023', hint='SETUP_SOURCE_DECISION_REQUIRED';
    end if;
    delete from public.tenant_business_owners
    where tenant_id = v_tid and not (id = any(v_keep));
    insert into public.paige_audit_log(actor_user_id,actor_role,action,target_type,target_id,tenant_id,payload)
    values (
      auth.uid(),'owner','solo_setup.business_ownership_saved','tenant_business_ownership',v_tid,v_tid,
      jsonb_build_object('owner_record_count',coalesce(array_length(v_keep,1),0))
    );
  else
    v_existing_context := public.get_solo_setup_context();
    foreach v_key in array v_owner_only_keys loop
      if nullif(btrim(coalesce(_brief ->> v_key,'')),'')
         is distinct from nullif(btrim(coalesce(v_existing_context -> 'brief' ->> v_key,'')),'') then
        raise exception 'only the workspace Owner can change legal identity or business ownership'
          using errcode = '42501', hint = 'SETUP_OWNER_REQUIRED';
      end if;
    end loop;
    if coalesce(_brief -> 'representativeUserIds','[]'::jsonb)
         is distinct from coalesce(v_existing_context -> 'brief' -> 'representativeUserIds','[]'::jsonb) then
      raise exception 'only the workspace Owner can change legal identity or business ownership'
        using errcode = '42501', hint = 'SETUP_OWNER_REQUIRED';
    end if;
    if _business_owners is distinct from (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',bo.id,'ownerKind',bo.owner_kind,'legalName',bo.legal_name,
        'displayName',coalesce(bo.display_name,''),'ownershipInterest',coalesce(bo.ownership_interest::text,''),
        'effectiveDate',coalesce(bo.effective_date::text,''),'status',bo.ownership_status,
        'representativeUserId',coalesce(bo.representative_user_id::text,''),'provenance',bo.setup_provenance
      ) order by bo.created_at,bo.id),'[]'::jsonb)
      from public.tenant_business_owners bo where bo.tenant_id = v_tid
    ) then
      raise exception 'only the workspace Owner can change legal identity or business ownership'
        using errcode = '42501', hint = 'SETUP_OWNER_REQUIRED';
    end if;
    select coalesce(t.brand -> 'business_brief','{}'::jsonb), t.name
    into v_admin_brief, v_tenant_name
    from public.tenants t where t.id = v_tid;
    v_admin_brief := v_admin_brief || jsonb_build_object(
      'publicName',coalesce(nullif(v_admin_brief ->> 'publicName',''),v_tenant_name),
      'offers',coalesce(_brief ->> 'offers',''),
      'deliveryModel',coalesce(_brief ->> 'deliveryModel',''),
      'idealCustomer',coalesce(_brief ->> 'idealCustomer',''),
      'customerSegments',coalesce(_brief ->> 'customerSegments',''),
      'serviceArea',coalesce(_brief ->> 'serviceArea',''),
      'currentPriority',coalesce(_brief ->> 'currentPriority',''),
      'goals90Day',coalesce(_brief ->> 'goals90Day',''),
      'annualDirection',coalesce(_brief ->> 'annualDirection',''),
      'successDefinition',coalesce(_brief ->> 'successDefinition',''),
      'constraints',coalesce(_brief ->> 'constraints',''),
      'brandVoice',coalesce(_brief ->> 'brandVoice',''),
      'operatingPreferences',coalesce(_brief ->> 'operatingPreferences',''),
      'doNotAssume',coalesce(_brief ->> 'doNotAssume',''),
      'representativeUserIds',coalesce(v_existing_context -> 'brief' -> 'representativeUserIds','[]'::jsonb),
      'sourceDecisions',coalesce(_brief -> 'sourceDecisions','{}'::jsonb)
    );
    v_saved := public.save_solo_business_brief(v_admin_brief,_expected_updated_at,_proposal_id);
  end if;
  return public.get_solo_setup_context();
end;
$$;

revoke all on function public.save_solo_setup_context(jsonb,jsonb,text,uuid) from public, anon;
grant execute on function public.save_solo_setup_context(jsonb,jsonb,text,uuid) to authenticated;

-- Close the historical PostgREST bypass. Browser roles may read only the two
-- public sender facts needed by A2P resume; private legal/contact/Vault columns
-- and every mutation go through bounded SECURITY DEFINER contracts.
revoke all on table public.tenant_legal_profile from authenticated;
grant select(tenant_id,legal_business_name,website_url) on public.tenant_legal_profile to authenticated;
drop policy if exists "Tenant members read own legal profile" on public.tenant_legal_profile;
drop policy if exists "Tenant owners/admins write own legal profile" on public.tenant_legal_profile;
create policy "Active tenant members read public sender identity"
on public.tenant_legal_profile for select to authenticated
using (
  exists(select 1 from public.tenants t where t.id=tenant_legal_profile.tenant_id and t.owner_user_id=auth.uid())
  or exists(select 1 from public.tenant_members tm where tm.tenant_id=tenant_legal_profile.tenant_id
    and tm.user_id=auth.uid() and tm.status='active')
  or public.is_platform_owner()
);

create or replace function public.get_tenant_legal_profile_owner(_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not (
    public.is_platform_owner()
    or exists(select 1 from public.tenants t where t.id=_tenant_id and t.owner_user_id=auth.uid())
    or exists(select 1 from public.tenant_members m where m.tenant_id=_tenant_id
      and m.user_id=auth.uid() and m.status='active' and (m.is_owner or m.role::text='owner'))
  ) then
    raise exception 'only the workspace Owner can read the legal profile' using errcode='42501';
  end if;
  return (
    select jsonb_build_object(
      'id',p.id,'tenant_id',p.tenant_id,'legal_business_name',p.legal_business_name,
      'dba_name',p.dba_name,'entity_type',p.entity_type,'state_of_formation',p.state_of_formation,
      'ein_last_4',p.ein_last_4,'registered_address',p.registered_address,
      'support_email',p.support_email,'support_phone',p.support_phone,
      'governing_law_state',p.governing_law_state,'signatory_name',p.signatory_name,
      'signatory_title',p.signatory_title,'white_label_ai_connect',p.white_label_ai_connect,
      'brand_display_name',p.brand_display_name,'brand_logo_url',p.brand_logo_url
    ) from public.tenant_legal_profile p where p.tenant_id=_tenant_id
  );
end;
$$;
revoke all on function public.get_tenant_legal_profile_owner(uuid) from public,anon;
grant execute on function public.get_tenant_legal_profile_owner(uuid) to authenticated;

create or replace function public.save_tenant_legal_profile_owner(_tenant_id uuid,_profile jsonb)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not (
    public.is_platform_owner()
    or exists(select 1 from public.tenants t where t.id=_tenant_id and t.owner_user_id=auth.uid())
    or exists(select 1 from public.tenant_members m where m.tenant_id=_tenant_id
      and m.user_id=auth.uid() and m.status='active' and (m.is_owner or m.role::text='owner'))
  ) then
    raise exception 'only the workspace Owner can change the legal profile' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(_profile ->> 'legal_business_name','')),'') is null then
    raise exception 'legal business name is required' using errcode='22023';
  end if;
  insert into public.tenant_legal_profile(
    tenant_id,legal_business_name,dba_name,entity_type,state_of_formation,ein_last_4,
    registered_address,support_email,support_phone,governing_law_state,signatory_name,
    signatory_title,white_label_ai_connect,brand_display_name,brand_logo_url
  ) values (
    _tenant_id,btrim(_profile ->> 'legal_business_name'),nullif(btrim(_profile ->> 'dba_name'),''),
    nullif(btrim(_profile ->> 'entity_type'),''),nullif(btrim(_profile ->> 'state_of_formation'),''),
    nullif(btrim(_profile ->> 'ein_last_4'),''),nullif(btrim(_profile ->> 'registered_address'),''),
    nullif(btrim(_profile ->> 'support_email'),''),nullif(btrim(_profile ->> 'support_phone'),''),
    nullif(btrim(_profile ->> 'governing_law_state'),''),nullif(btrim(_profile ->> 'signatory_name'),''),
    nullif(btrim(_profile ->> 'signatory_title'),''),
    coalesce((_profile ->> 'white_label_ai_connect')::boolean,true),
    nullif(btrim(_profile ->> 'brand_display_name'),''),nullif(btrim(_profile ->> 'brand_logo_url'),'')
  )
  on conflict(tenant_id) do update set
    legal_business_name=excluded.legal_business_name,dba_name=excluded.dba_name,
    entity_type=excluded.entity_type,state_of_formation=excluded.state_of_formation,
    ein_last_4=excluded.ein_last_4,registered_address=excluded.registered_address,
    support_email=excluded.support_email,support_phone=excluded.support_phone,
    governing_law_state=excluded.governing_law_state,signatory_name=excluded.signatory_name,
    signatory_title=excluded.signatory_title,white_label_ai_connect=excluded.white_label_ai_connect,
    brand_display_name=excluded.brand_display_name,brand_logo_url=excluded.brand_logo_url,
    updated_at=now();
end;
$$;
revoke all on function public.save_tenant_legal_profile_owner(uuid,jsonb) from public,anon;
grant execute on function public.save_tenant_legal_profile_owner(uuid,jsonb) to authenticated;

-- Browser callers must use the permission-aware context seam; this prevents an
-- Admin from bypassing the Owner-only legal and ownership boundary.
revoke execute on function public.save_solo_setup_identity(jsonb,text,uuid) from authenticated;

comment on table public.tenant_business_owners is
  'Tenant business ownership facts only. These records never create Team members, invitations, roles, or workspace authority.';
comment on function public.get_solo_setup_context() is
  'Canonical tenant-scoped Setup read with permission scope, masked legal identity, and business ownership records.';
comment on function public.save_solo_setup_context(jsonb,jsonb,text,uuid) is
  'Canonical durable Setup save. Owner may change legal identity and business ownership; Admin is limited to operational brief fields. Audit entries are not PAIGE Rail integration.';

-- Replace the U.S.-only legal save. Registration values retain validated
-- jurisdictional characters inside Vault and never enter brand, audit, or readback.
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
  v_registration_raw text := nullif(btrim(coalesce(_brief ->> 'businessRegistrationNumber','')),'');
  v_registration_identifier text := upper(nullif(btrim(coalesce(_brief ->> 'businessRegistrationIdentifier','')),''));
  v_secret_ref text;
  v_secret_id uuid;
  v_last4 text;
  v_rep uuid;
  v_regions text[] := '{}'::text[];
  v_current public.tenant_legal_profile%rowtype;
  v_had_legal boolean := false;
  v_has_legal_input boolean := false;
  v_current_json jsonb := '{}'::jsonb;
  v_provenance jsonb := '{}'::jsonb;
  v_decisions jsonb := coalesce(_brief -> 'sourceDecisions','{}'::jsonb);
  v_key text;
  v_provenance_key text;
  v_new text;
  v_old text;
  v_decision text;
  v_now timestamptz := clock_timestamp();
  v_legal_keys constant text[] := array[
    'legalName','dbaName','website','address','phone','industry',
    'entityType','stateOfFormation','businessRegistrationIdentifier','regionsOfOperation',
    'registeredStreet','registeredStreetSecondary','registeredCity','registeredRegion',
    'registeredPostalCode','registeredIsoCountry','authorizedRepresentativePhone',
    'authorizedRepresentativeJobPosition','authorizedRepresentativeUserId'
  ];
begin
  if auth.uid() is null or v_tid is null or public.solo_setup_access_scope() <> 'owner_full' then
    raise exception 'only the workspace Owner can change legal identity' using errcode='42501', hint='SETUP_OWNER_REQUIRED';
  end if;
  if _brief is null or jsonb_typeof(_brief) <> 'object' then
    raise exception 'business brief must be an object' using errcode='22023';
  end if;

  select * into v_current from public.tenant_legal_profile where tenant_id=v_tid for update;
  v_had_legal := found;
  if found then
    v_secret_ref := v_current.business_registration_number_secret_ref;
    v_last4 := v_current.business_registration_number_last_4;
    v_provenance := coalesce(v_current.setup_provenance,'{}'::jsonb);
    v_current_json := jsonb_build_object(
      'legalName',coalesce(v_current.legal_business_name,''),
      'dbaName',coalesce(v_current.dba_name,''),
      'website',coalesce(v_current.website_url,''),
      'address',coalesce(v_current.registered_address,''),
      'phone',coalesce(v_current.support_phone,''),
      'industry',coalesce(v_current.business_industry,''),
      'entityType',coalesce(v_current.entity_type,''),
      'stateOfFormation',coalesce(v_current.state_of_formation,''),
      'businessRegistrationIdentifier',coalesce(v_current.business_registration_identifier,''),
      'regionsOfOperation',coalesce(array_to_string(v_current.business_regions_of_operation,','),''),
      'registeredStreet',coalesce(v_current.registered_street,''),
      'registeredStreetSecondary',coalesce(v_current.registered_street_secondary,''),
      'registeredCity',coalesce(v_current.registered_city,''),
      'registeredRegion',coalesce(v_current.registered_region,''),
      'registeredPostalCode',coalesce(v_current.registered_postal_code,''),
      'registeredIsoCountry',coalesce(v_current.registered_iso_country,''),
      'authorizedRepresentativePhone',coalesce(v_current.authorized_representative_phone,''),
      'authorizedRepresentativeJobPosition',coalesce(v_current.authorized_representative_job_position,''),
      'authorizedRepresentativeUserId',coalesce(v_current.authorized_representative_user_id::text,'')
    );
  end if;

  v_has_legal_input := exists(
    select 1 from jsonb_each_text(_brief) e
    where e.key=any(array[
      'legalName','entityType','stateOfFormation','businessRegistrationIdentifier','businessRegistrationNumber',
      'regionsOfOperation','registeredStreet','registeredStreetSecondary','registeredCity',
      'registeredRegion','registeredPostalCode','registeredIsoCountry',
      'authorizedRepresentativePhone','authorizedRepresentativeJobPosition',
      'authorizedRepresentativeUserId'
    ]::text[])
      and nullif(btrim(e.value),'') is not null
  );
  if v_registration_raw is null and v_secret_ref is not null then
    if v_registration_identifier is not null
       and v_registration_identifier is distinct from v_current.business_registration_identifier then
      raise exception 'enter a new registration number before changing its identifier type' using errcode='22023';
    end if;
    v_registration_identifier := v_current.business_registration_identifier;
  end if;

  if v_registration_raw is not null then
    if v_registration_identifier is null then
      raise exception 'choose the registration identifier before entering its value' using errcode='22023';
    end if;
    if v_registration_identifier not in ('EIN','DUNS','CBN','CN','ACN','CIN','VAT','VATRN','RN','OTHER') then
      raise exception 'unsupported business registration identifier' using errcode='22023';
    end if;
    if v_registration_raw !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,63}$' then
      raise exception 'business registration number contains unsupported characters' using errcode='22023';
    end if;
    if v_registration_identifier='EIN' and regexp_replace(v_registration_raw,'[^0-9]','','g') !~ '^[0-9]{9}$' then
      raise exception 'an EIN must contain exactly 9 digits' using errcode='22023';
    end if;
    v_last4 := right(regexp_replace(v_registration_raw,'[[:space:]]','','g'),4);
    v_secret_ref := 'tenant-a2p-registration-number-' || v_tid::text;
    select id into v_secret_id from vault.secrets where name=v_secret_ref;
    if v_secret_id is null then
      perform vault.create_secret(v_registration_raw,v_secret_ref,'Tenant legal registration number for TrustHub/A2P');
    else
      perform vault.update_secret(v_secret_id,v_registration_raw,v_secret_ref,'Tenant legal registration number for TrustHub/A2P');
    end if;
  end if;

  if v_registration_identifier is not null and v_registration_identifier not in ('EIN','DUNS','CBN','CN','ACN','CIN','VAT','VATRN','RN','OTHER') then
    raise exception 'unsupported business registration identifier' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(_brief ->> 'authorizedRepresentativeUserId','')),'') is not null then
    begin v_rep := (_brief ->> 'authorizedRepresentativeUserId')::uuid;
    exception when invalid_text_representation then raise exception 'authorized representative id is invalid' using errcode='22023'; end;
    if not exists(select 1 from public.tenant_members tm where tm.tenant_id=v_tid and tm.user_id=v_rep and tm.status='active') then
      raise exception 'authorized representative must be an active Team member' using errcode='42501';
    end if;
    if not (coalesce(_brief -> 'representativeUserIds','[]'::jsonb) ? v_rep::text) then
      raise exception 'authorized representative must also be a confirmed business representative' using errcode='22023';
    end if;
  end if;
  if nullif(btrim(coalesce(_brief ->> 'registeredIsoCountry','')),'') is not null
     and upper(btrim(_brief ->> 'registeredIsoCountry')) !~ '^[A-Z]{2}$' then
    raise exception 'registered country must be a two-letter ISO code' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(_brief ->> 'regionsOfOperation','')),'') is not null then
    select coalesce(array_agg(btrim(value)),'{}'::text[]) into v_regions
    from unnest(string_to_array(_brief ->> 'regionsOfOperation',',')) value
    where nullif(btrim(value),'') is not null;
    if exists(select 1 from unnest(v_regions) value where char_length(value)>120) then
      raise exception 'a region of operation is too long' using errcode='22001';
    end if;
  end if;

  foreach v_key in array v_legal_keys loop
    v_provenance_key := case when v_key='authorizedRepresentativeUserId'
      then 'authorizedRepresentative' else v_key end;
    v_new := coalesce(_brief ->> v_key,'');
    v_old := coalesce(v_current_json ->> v_key,'');
    v_decision := nullif(v_decisions ->> v_key,'');
    if v_provenance -> v_provenance_key ->> 'source'='connection_sourced'
       and v_new is distinct from v_old and v_decision is distinct from 'override' then
      raise exception 'connection-sourced legal field % requires an explicit override',v_key
        using errcode='22023', hint='SETUP_SOURCE_DECISION_REQUIRED';
    end if;
    if nullif(v_new,'') is null then
      v_provenance := v_provenance - v_provenance_key;
    elsif v_new is not distinct from v_old and v_decision is distinct from 'adopt' and v_provenance -> v_provenance_key is not null then
      null;
    else
      v_provenance := v_provenance || jsonb_build_object(v_provenance_key,jsonb_build_object(
        'source','owner_confirmed','confidence','confirmed','confirmedAt',v_now
      ));
    end if;
  end loop;

  v_saved := public.save_solo_business_brief(_brief - 'businessRegistrationNumber',_expected_updated_at,_proposal_id);

  if not v_had_legal and not v_has_legal_input then
    return jsonb_build_object('business_brief',v_saved,'businessRegistrationNumberLast4',null);
  end if;
  if nullif(btrim(coalesce(_brief ->> 'legalName','')),'') is null then
    raise exception 'legal business name is required to create or update legal sender identity'
      using errcode='22023', hint='SETUP_LEGAL_NAME_REQUIRED';
  end if;

  insert into public.tenant_legal_profile(
    tenant_id,legal_business_name,dba_name,entity_type,state_of_formation,registered_address,
    registered_street,registered_street_secondary,registered_city,registered_region,registered_postal_code,
    registered_iso_country,support_phone,website_url,business_identity,business_industry,
    business_regions_of_operation,business_registration_identifier,business_registration_number_secret_ref,
    business_registration_number_last_4,authorized_representative_user_id,
    authorized_representative_phone,authorized_representative_job_position,setup_provenance
  ) values (
    v_tid,nullif(btrim(_brief ->> 'legalName'),''),nullif(btrim(_brief ->> 'dbaName'),''),
    nullif(btrim(_brief ->> 'entityType'),''),nullif(btrim(_brief ->> 'stateOfFormation'),''),
    nullif(btrim(_brief ->> 'address'),''),nullif(btrim(_brief ->> 'registeredStreet'),''),
    nullif(btrim(_brief ->> 'registeredStreetSecondary'),''),nullif(btrim(_brief ->> 'registeredCity'),''),
    nullif(btrim(_brief ->> 'registeredRegion'),''),nullif(btrim(_brief ->> 'registeredPostalCode'),''),
    upper(nullif(btrim(_brief ->> 'registeredIsoCountry'),'')),nullif(btrim(_brief ->> 'phone'),''),
    nullif(btrim(_brief ->> 'website'),''),'direct_customer',nullif(btrim(_brief ->> 'industry'),''),v_regions,
    v_registration_identifier,v_secret_ref,v_last4,v_rep,nullif(btrim(_brief ->> 'authorizedRepresentativePhone'),''),
    nullif(btrim(_brief ->> 'authorizedRepresentativeJobPosition'),''),v_provenance
  ) on conflict(tenant_id) do update set
    legal_business_name=excluded.legal_business_name,dba_name=excluded.dba_name,entity_type=excluded.entity_type,
    state_of_formation=excluded.state_of_formation,registered_address=excluded.registered_address,
    registered_street=excluded.registered_street,registered_street_secondary=excluded.registered_street_secondary,
    registered_city=excluded.registered_city,registered_region=excluded.registered_region,
    registered_postal_code=excluded.registered_postal_code,registered_iso_country=excluded.registered_iso_country,
    support_phone=excluded.support_phone,website_url=excluded.website_url,business_identity=excluded.business_identity,
    business_industry=excluded.business_industry,business_regions_of_operation=excluded.business_regions_of_operation,
    business_registration_identifier=excluded.business_registration_identifier,
    business_registration_number_secret_ref=excluded.business_registration_number_secret_ref,
    business_registration_number_last_4=excluded.business_registration_number_last_4,
    authorized_representative_user_id=excluded.authorized_representative_user_id,
    authorized_representative_phone=excluded.authorized_representative_phone,
    authorized_representative_job_position=excluded.authorized_representative_job_position,
    setup_provenance=excluded.setup_provenance,updated_at=now();

  insert into public.paige_audit_log(actor_user_id,actor_role,action,target_type,target_id,tenant_id,payload)
  values(auth.uid(),'owner','solo_setup.legal_identity_saved','tenant_legal_profile',v_tid,v_tid,
    jsonb_build_object('registration_number_present',v_secret_ref is not null,'authorized_representative_present',v_rep is not null));
  return jsonb_build_object('business_brief',v_saved,'businessRegistrationNumberLast4',v_last4);
end;
$$;

revoke all on function public.save_solo_setup_identity(jsonb,text,uuid) from public, anon, authenticated;

commit;
