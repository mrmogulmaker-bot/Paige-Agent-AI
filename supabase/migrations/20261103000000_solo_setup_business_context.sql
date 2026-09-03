-- Canonical Solo Settings -> Setup business-context expansion.
-- Setup owns these records. They are intentionally not connected to PAIGE,
-- Mind, Spine, Rail, Team authority, Billing, or the legacy knowledge importer.

begin;

create table public.tenant_setup_business_context_meta (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  revision bigint not null default 0,
  primary_email_provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(primary_email_provenance)='object'),
  primary_email_snapshot text check (primary_email_snapshot is null or char_length(primary_email_snapshot)<=254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table public.tenant_setup_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_type text not null check (source_type in ('link','document','catalog','note')),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  category text not null check (category in ('business','owners','coaches','consultants','representatives','offers')),
  source_url text check (source_url is null or (char_length(source_url) <= 2048 and source_url ~* '^https://[^[:space:]]+$')),
  reference text check (reference is null or char_length(reference) <= 1000),
  notes text check (notes is null or char_length(notes) <= 4000),
  review_status text not null default 'needs_review' check (review_status in ('ready','needs_review')),
  setup_provenance jsonb not null default '{"source":"owner_confirmed","confidence":"confirmed"}'::jsonb,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id)
);
create index tenant_setup_knowledge_sources_tenant_idx on public.tenant_setup_knowledge_sources(tenant_id,updated_at desc);

create table public.tenant_setup_paige_profiles (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile)='object' and pg_column_size(profile) <= 32768),
  setup_provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(setup_provenance)='object'),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_setup_voice_examples (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel text not null check (channel in ('general','website','email','social','sales','support')),
  example_kind text not null check (example_kind in ('sounds_like','avoid')),
  example_text text not null check (char_length(btrim(example_text)) between 1 and 8000),
  note text check (note is null or char_length(note) <= 1000),
  setup_provenance jsonb not null default '{"source":"owner_confirmed","confidence":"confirmed"}'::jsonb,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id)
);
create index tenant_setup_voice_examples_tenant_idx on public.tenant_setup_voice_examples(tenant_id,updated_at desc);

alter table public.tenant_setup_business_context_meta enable row level security;
alter table public.tenant_setup_knowledge_sources enable row level security;
alter table public.tenant_setup_paige_profiles enable row level security;
alter table public.tenant_setup_voice_examples enable row level security;
revoke all on table public.tenant_setup_business_context_meta from public,anon,authenticated;
revoke all on table public.tenant_setup_knowledge_sources from public,anon,authenticated;
revoke all on table public.tenant_setup_paige_profiles from public,anon,authenticated;
revoke all on table public.tenant_setup_voice_examples from public,anon,authenticated;

create or replace function public.solo_setup_assert_canonical_tenant()
returns uuid language plpgsql stable security definer set search_path=public as $$
declare v_tid uuid := public.current_user_tenant_id();
begin
  if auth.uid() is null or v_tid is null or not public.solo_setup_can_read() then
    raise exception 'Solo Setup requires an authenticated workspace member' using errcode='42501';
  end if;
  if not exists(select 1 from public.tenants t where t.id=v_tid and t.account_type::text='standalone' and t.parent_tenant_id is null) then
    raise exception 'This Setup contract is available only to a top-level Solo workspace' using errcode='42501';
  end if;
  return v_tid;
end $$;
revoke all on function public.solo_setup_assert_canonical_tenant() from public,anon,authenticated;

-- All mutation entry points lock the caller's workspace-selection row before
-- resolving tenant context. The lock also covers nested legacy Setup RPCs.
create or replace function public.solo_setup_lock_expected_tenant(_expected_tenant_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_tid uuid;
begin
  if auth.uid() is null or _expected_tenant_id is null then
    raise exception 'An authenticated expected workspace is required' using errcode='42501';
  end if;
  perform 1 from public.profiles where user_id=auth.uid() for update;
  if not found then raise exception 'Workspace selection is unavailable' using errcode='42501'; end if;
  v_tid := public.solo_setup_assert_canonical_tenant();
  if v_tid is distinct from _expected_tenant_id then
    raise exception 'The active workspace changed. Reload Setup before continuing.' using errcode='40001',hint='SETUP_TENANT_CHANGED';
  end if;
  return v_tid;
end $$;
revoke all on function public.solo_setup_lock_expected_tenant(uuid) from public,anon,authenticated;

create or replace function public.get_solo_business_context()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_tid uuid := public.solo_setup_assert_canonical_tenant();
  v_base jsonb;
  v_managed_local text;
  v_managed_domain text;
begin
  v_base := public.get_solo_setup_context();
  select i.local_part into v_managed_local from public.tenant_email_identities i where i.tenant_id=v_tid;
  select coalesce(nullif(shared_domain,''),'mail.paigeagent.ai') into v_managed_domain from public.platform_email_settings limit 1;
  v_managed_domain := coalesce(v_managed_domain,'mail.paigeagent.ai');
  return v_base || jsonb_build_object(
    'contextRevision',coalesce((select revision from public.tenant_setup_business_context_meta where tenant_id=v_tid),0),
    'primaryEmailProvenance',coalesce(nullif((select primary_email_provenance from public.tenant_setup_business_context_meta where tenant_id=v_tid
      and primary_email_snapshot is not distinct from nullif(lower(btrim(coalesce(v_base->>'primaryBusinessEmail',''))),'')),'{}'::jsonb),
      case when nullif(v_base->>'primaryBusinessEmail','') is null then '{"source":"needs_confirmation","confidence":"unknown"}'::jsonb
      else '{"source":"connection_sourced","confidence":"observed"}'::jsonb end),
    'knowledgeSources',coalesce((select jsonb_agg(jsonb_build_object(
      'id',k.id,'sourceType',k.source_type,'title',k.title,'category',k.category,
      'sourceUrl',coalesce(k.source_url,''),'reference',coalesce(k.reference,''),'notes',coalesce(k.notes,''),
      'reviewStatus',k.review_status,'provenance',k.setup_provenance,'updatedAt',k.updated_at
    ) order by k.updated_at desc) from public.tenant_setup_knowledge_sources k where k.tenant_id=v_tid),'[]'::jsonb),
    'paigeProfile',coalesce((select p.profile || jsonb_build_object('provenance',p.setup_provenance) from public.tenant_setup_paige_profiles p where p.tenant_id=v_tid),'{}'::jsonb),
    'voiceExamples',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'channel',e.channel,'kind',e.example_kind,'example',e.example_text,'note',coalesce(e.note,''),
      'provenance',e.setup_provenance,'updatedAt',e.updated_at
    ) order by e.updated_at desc) from public.tenant_setup_voice_examples e where e.tenant_id=v_tid),'[]'::jsonb),
    'managedEmail',jsonb_build_object(
      'localPart',coalesce(v_managed_local,''),
      'domain',v_managed_domain,
      'address',case when v_managed_local is null then '' else v_managed_local||'@'||v_managed_domain end,
      'registrationAvailable',false
    )
  );
end $$;
revoke all on function public.get_solo_business_context() from public,anon;
grant execute on function public.get_solo_business_context() to authenticated;

create or replace function public.search_solo_setup_naics(_query text, _limit integer default 20)
returns table(code text,title text)
language plpgsql stable security definer set search_path=public as $$
declare v_query text := btrim(coalesce(_query,''));
begin
  perform public.solo_setup_assert_canonical_tenant();
  if char_length(v_query)<2 then return; end if;
  return query
    select n.code,n.title
    from public.naics_2022_official_reference n
    where n.code ilike v_query || '%' or n.title ilike '%' || v_query || '%'
    order by case when n.code ilike v_query || '%' then 0 else 1 end,n.code
    limit least(greatest(coalesce(_limit,20),1),50);
end $$;
revoke all on function public.search_solo_setup_naics(text,integer) from public,anon;
grant execute on function public.search_solo_setup_naics(text,integer) to authenticated;
comment on function public.search_solo_setup_naics(text,integer) is
  'Searches the platform NAICS reference for Solo Setup. Results are reference assistance, not legal classification advice.';

create or replace function public.check_solo_setup_managed_email(_local_part text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_tid uuid := public.solo_setup_assert_canonical_tenant();
  v_local text := lower(btrim(coalesce(_local_part,'')));
  v_domain text;
  v_taken boolean;
begin
  if public.solo_setup_access_scope()<>'owner_full' then
    raise exception 'Only the workspace Owner can register a Paige-managed email' using errcode='42501';
  end if;
  if v_local !~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$' then
    raise exception 'Use 1-64 lowercase letters, numbers, periods, underscores, or hyphens' using errcode='22023';
  end if;
  select coalesce(nullif(shared_domain,''),'mail.paigeagent.ai') into v_domain from public.platform_email_settings limit 1;
  v_domain := coalesce(v_domain,'mail.paigeagent.ai');
  select v_local in ('team','support','postmaster','abuse','security','admin','no-reply','noreply')
    or exists(select 1 from public.tenant_email_identities i where lower(i.local_part)=v_local and i.tenant_id<>v_tid)
    or exists(select 1 from public.channel_connectors c where c.channel_type='email' and c.tenant_id<>v_tid
      and (lower(c.inbound_address)=v_local||'@'||lower(v_domain) or lower(c.from_address)=v_local||'@'||lower(v_domain)))
    into v_taken;
  return jsonb_build_object('localPart',v_local,'domain',v_domain,'address',v_local||'@'||v_domain,'available',not v_taken,'registrationAvailable',false);
end $$;
revoke all on function public.check_solo_setup_managed_email(text) from public,anon;
grant execute on function public.check_solo_setup_managed_email(text) to authenticated;

create or replace function public.register_solo_setup_managed_email(_expected_tenant_id uuid,_local_part text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tid uuid;
begin
  v_tid := public.solo_setup_lock_expected_tenant(_expected_tenant_id);
  if public.solo_setup_access_scope()<>'owner_full' then
    raise exception 'Only the workspace Owner can register a Paige-managed email' using errcode='42501';
  end if;
  -- The shared connector lifecycle still derives its address from the tenant
  -- slug, not this registry. Do not create a split inbound/outbound identity.
  -- Enabling registration requires a separately scoped Connections contract.
  raise exception 'Managed email registration is not available until sender synchronization is supported.'
    using errcode='0A000',hint='SETUP_MANAGED_EMAIL_REGISTRATION_UNAVAILABLE';
end $$;
revoke all on function public.register_solo_setup_managed_email(uuid,text) from public,anon;
grant execute on function public.register_solo_setup_managed_email(uuid,text) to authenticated;

create or replace function public.dismiss_solo_setup_context_proposal(_expected_tenant_id uuid,_proposal_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.solo_setup_lock_expected_tenant(_expected_tenant_id);
  if public.solo_setup_access_scope() not in ('owner_full','admin_operational') then
    raise exception 'This workspace is read-only for Setup' using errcode='42501';
  end if;
  return public.dismiss_solo_business_brief_proposal(_proposal_id);
end $$;
revoke all on function public.dismiss_solo_setup_context_proposal(uuid,uuid) from public,anon;
grant execute on function public.dismiss_solo_setup_context_proposal(uuid,uuid) to authenticated;

create or replace function public.save_solo_business_context(
  _expected_tenant_id uuid,
  _brief jsonb,
  _business_owners jsonb,
  _primary_business_email text,
  _knowledge_sources jsonb,
  _paige_profile jsonb,
  _voice_examples jsonb,
  _expected_primary_business_email text,
  _primary_business_email_decision text,
  _expected_updated_at text default null,
  _expected_context_revision bigint default 0,
  _proposal_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tid uuid;
  v_access text;
  v_meta public.tenant_setup_business_context_meta%rowtype;
  v_item jsonb;
  v_id uuid;
  v_keep uuid[] := '{}';
  v_profile jsonb := coalesce(_paige_profile,'{}'::jsonb);
  v_profile_provenance jsonb;
  v_profile_current public.tenant_setup_paige_profiles%rowtype;
  v_existing_knowledge public.tenant_setup_knowledge_sources%rowtype;
  v_existing_voice public.tenant_setup_voice_examples%rowtype;
  v_profile_next jsonb := '{}'::jsonb;
  v_key text;
  v_value text;
  v_profile_keys constant text[] := array['voiceCharacter','audienceRelationship','messageStructure','useMoreOften','avoid','channelDifferences','workingStyleBoundaries'];
  v_email text := nullif(lower(btrim(coalesce(_primary_business_email,''))), '');
  v_current_email text;
begin
  v_tid := public.solo_setup_lock_expected_tenant(_expected_tenant_id);
  v_access := public.solo_setup_access_scope();
  if v_access not in ('owner_full','admin_operational') then
    raise exception 'This workspace is read-only for Setup' using errcode='42501';
  end if;
  if v_access='admin_operational' and (_knowledge_sources is not null or _paige_profile is not null
      or _voice_examples is not null or _primary_business_email is not null or _primary_business_email_decision is not null) then
    raise exception 'Only the workspace Owner can change email, knowledge or Paige voice context' using errcode='42501';
  end if;
  if v_access='owner_full' and (_knowledge_sources is null or _paige_profile is null or _voice_examples is null) then
    raise exception 'Complete business context is required for an Owner save' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(_knowledge_sources,'[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(_voice_examples,'[]'::jsonb))<>'array'
    or jsonb_typeof(v_profile)<>'object' then
    raise exception 'Business context payload is invalid' using errcode='22023';
  end if;
  if jsonb_array_length(_knowledge_sources)>100 or jsonb_array_length(_voice_examples)>100
     or pg_column_size(_knowledge_sources)>1048576 or pg_column_size(_voice_examples)>1048576 then
    raise exception 'Business context contains too many sources or examples' using errcode='22001';
  end if;
  insert into public.tenant_setup_business_context_meta(tenant_id,updated_by) values(v_tid,auth.uid()) on conflict do nothing;
  select * into v_meta from public.tenant_setup_business_context_meta where tenant_id=v_tid for update;
  if v_meta.revision is distinct from coalesce(_expected_context_revision,0) then
    raise exception 'This business context changed in another session. Reload before saving.' using errcode='40001',hint='SETUP_CONFLICT';
  end if;

  -- Existing canonical save enforces the Owner/Admin field split, protected legal
  -- values, active-Team representatives, provenance decisions, and brief conflict.
  perform public.save_solo_setup_context(_brief,_business_owners,_expected_updated_at,_proposal_id);

  if v_access='owner_full' then
    if _primary_business_email is not null then
      if v_email is not null and (char_length(v_email)>254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
        raise exception 'Primary business email is invalid' using errcode='22023';
      end if;
      if _primary_business_email_decision is not null and _primary_business_email_decision not in ('adopt','override') then
        raise exception 'Primary business email decision is invalid' using errcode='22023';
      end if;
      select nullif(lower(btrim(coalesce(brand->>'support_email',''))),'') into v_current_email from public.tenants where id=v_tid for update;
      if v_current_email is distinct from nullif(lower(btrim(coalesce(_expected_primary_business_email,''))),'') then
        raise exception 'The business email changed. Reload before saving.' using errcode='40001',hint='SETUP_EMAIL_CONFLICT';
      end if;
      if v_email is distinct from v_current_email and v_current_email is not null
         and (v_meta.primary_email_snapshot is distinct from v_current_email
           or coalesce(v_meta.primary_email_provenance->>'source','connection_sourced')='connection_sourced')
         and _primary_business_email_decision is distinct from 'override' then
        raise exception 'Explicitly override the connected business email before replacing it.' using errcode='22023',hint='SETUP_EMAIL_OVERRIDE_REQUIRED';
      end if;
      if v_email is distinct from v_current_email or _primary_business_email_decision in ('adopt','override') then
        update public.tenants set brand=jsonb_set(coalesce(brand,'{}'::jsonb),'{support_email}',to_jsonb(coalesce(v_email,'')),true) where id=v_tid;
        update public.tenant_setup_business_context_meta set primary_email_snapshot=v_email,primary_email_provenance=case when v_email is null then '{}'::jsonb
          else jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp()) end where tenant_id=v_tid;
      end if;
    end if;

    v_keep := '{}';
    for v_item in select value from jsonb_array_elements(coalesce(_knowledge_sources,'[]'::jsonb)) loop
      begin v_id := nullif(v_item->>'id','')::uuid; exception when invalid_text_representation then raise exception 'Knowledge source id is invalid' using errcode='22023'; end;
      if v_id is null then v_id:=gen_random_uuid(); end if;
      if v_id=any(v_keep) then raise exception 'Duplicate knowledge source id' using errcode='22023'; end if;
      if v_item->>'sourceType' not in ('link','document','catalog','note')
        or v_item->>'category' not in ('business','owners','coaches','consultants','representatives','offers')
        or nullif(btrim(v_item->>'title'),'') is null then raise exception 'Knowledge source is invalid' using errcode='22023'; end if;
      if nullif(v_item->>'sourceUrl','') is not null and v_item->>'sourceUrl' !~* '^https://[^[:space:]]+$' then raise exception 'Knowledge links must use HTTPS' using errcode='22023'; end if;
      if v_item->>'sourceType'='link' and nullif(btrim(v_item->>'sourceUrl'),'') is null then
        raise exception 'Knowledge links require a complete HTTPS URL' using errcode='22023';
      end if;
      if nullif(btrim(v_item->>'sourceUrl'),'') is null
         and nullif(btrim(v_item->>'reference'),'') is null
         and nullif(btrim(v_item->>'notes'),'') is null then
        raise exception 'Knowledge sources require a link, reference, or note' using errcode='22023';
      end if;
      select * into v_existing_knowledge from public.tenant_setup_knowledge_sources
        where id=v_id and tenant_id=v_tid for update;
      if found and row(v_existing_knowledge.source_type,v_existing_knowledge.title,v_existing_knowledge.category,
          v_existing_knowledge.source_url,v_existing_knowledge.reference,v_existing_knowledge.notes,v_existing_knowledge.review_status)
        is not distinct from row(v_item->>'sourceType',btrim(v_item->>'title'),v_item->>'category',
          nullif(btrim(v_item->>'sourceUrl'),''),nullif(btrim(v_item->>'reference'),''),nullif(btrim(v_item->>'notes'),''),
          case when v_item->>'reviewStatus'='ready' then 'ready' else 'needs_review' end) then
        -- Unrelated saves are not new confirmations: retain provenance,
        -- confirmedAt, updated_at, and updated_by by leaving this row untouched.
        v_keep:=array_append(v_keep,v_id);
        continue;
      end if;
      insert into public.tenant_setup_knowledge_sources(id,tenant_id,source_type,title,category,source_url,reference,notes,review_status,setup_provenance,created_by,updated_by)
      values(v_id,v_tid,v_item->>'sourceType',btrim(v_item->>'title'),v_item->>'category',nullif(btrim(v_item->>'sourceUrl'),''),nullif(btrim(v_item->>'reference'),''),nullif(btrim(v_item->>'notes'),''),
        case when v_item->>'reviewStatus'='ready' then 'ready' else 'needs_review' end,
        jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp()),auth.uid(),auth.uid())
      on conflict(id) do update set source_type=excluded.source_type,title=excluded.title,category=excluded.category,source_url=excluded.source_url,
        reference=excluded.reference,notes=excluded.notes,review_status=excluded.review_status,setup_provenance=excluded.setup_provenance,updated_by=auth.uid(),updated_at=now()
      where tenant_setup_knowledge_sources.tenant_id=v_tid;
      if not found then raise exception 'Knowledge source belongs to another workspace' using errcode='42501'; end if;
      v_keep:=array_append(v_keep,v_id);
    end loop;
    delete from public.tenant_setup_knowledge_sources where tenant_id=v_tid and not(id=any(v_keep));

    if pg_column_size(v_profile)>32768 then raise exception 'Paige profile is too large' using errcode='22001'; end if;
    if exists(select 1 from jsonb_object_keys(v_profile) k where k<>'provenance' and not(k=any(v_profile_keys))) then
      raise exception 'Paige profile contains an unsupported field' using errcode='22023';
    end if;
    select * into v_profile_current from public.tenant_setup_paige_profiles where tenant_id=v_tid for update;
    v_profile_provenance := '{}'::jsonb;
    foreach v_key in array v_profile_keys loop
      if v_profile ? v_key and jsonb_typeof(v_profile->v_key)<>'string' then
        raise exception 'Paige profile fields must be text' using errcode='22023';
      end if;
      v_value := btrim(coalesce(v_profile->>v_key,''));
      if char_length(v_value)>4000 then raise exception 'Paige profile field is too long' using errcode='22001'; end if;
      v_profile_next := v_profile_next || jsonb_build_object(v_key,v_value);
      if v_value<>'' then
        v_profile_provenance := v_profile_provenance || jsonb_build_object(v_key,
          case when v_value is not distinct from v_profile_current.profile->>v_key and v_profile_current.setup_provenance ? v_key
            then v_profile_current.setup_provenance->v_key
            else jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp()) end);
      end if;
    end loop;
    insert into public.tenant_setup_paige_profiles(tenant_id,profile,setup_provenance,created_by,updated_by)
    values(v_tid,v_profile_next,v_profile_provenance,auth.uid(),auth.uid())
    on conflict(tenant_id) do update set profile=excluded.profile,setup_provenance=excluded.setup_provenance,updated_by=auth.uid(),updated_at=now();

    v_keep := '{}';
    for v_item in select value from jsonb_array_elements(coalesce(_voice_examples,'[]'::jsonb)) loop
      begin v_id := nullif(v_item->>'id','')::uuid; exception when invalid_text_representation then raise exception 'Voice example id is invalid' using errcode='22023'; end;
      if v_id is null then v_id:=gen_random_uuid(); end if;
      if v_id=any(v_keep) then raise exception 'Duplicate voice example id' using errcode='22023'; end if;
      if v_item->>'channel' not in ('general','website','email','social','sales','support')
        or v_item->>'kind' not in ('sounds_like','avoid') or nullif(btrim(v_item->>'example'),'') is null then raise exception 'Voice example is invalid' using errcode='22023'; end if;
      select * into v_existing_voice from public.tenant_setup_voice_examples
        where id=v_id and tenant_id=v_tid for update;
      if found and row(v_existing_voice.channel,v_existing_voice.example_kind,v_existing_voice.example_text,v_existing_voice.note)
        is not distinct from row(v_item->>'channel',v_item->>'kind',btrim(v_item->>'example'),nullif(btrim(v_item->>'note'),'')) then
        -- Preserve the original confirmation and update metadata on no-op saves.
        v_keep:=array_append(v_keep,v_id);
        continue;
      end if;
      insert into public.tenant_setup_voice_examples(id,tenant_id,channel,example_kind,example_text,note,setup_provenance,created_by,updated_by)
      values(v_id,v_tid,v_item->>'channel',v_item->>'kind',btrim(v_item->>'example'),nullif(btrim(v_item->>'note'),''),
        jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt',clock_timestamp()),auth.uid(),auth.uid())
      on conflict(id) do update set channel=excluded.channel,example_kind=excluded.example_kind,example_text=excluded.example_text,note=excluded.note,
        setup_provenance=excluded.setup_provenance,updated_by=auth.uid(),updated_at=now()
      where tenant_setup_voice_examples.tenant_id=v_tid;
      if not found then raise exception 'Voice example belongs to another workspace' using errcode='42501'; end if;
      v_keep:=array_append(v_keep,v_id);
    end loop;
    delete from public.tenant_setup_voice_examples where tenant_id=v_tid and not(id=any(v_keep));
  end if;

  update public.tenant_setup_business_context_meta set revision=revision+1,updated_at=now(),updated_by=auth.uid() where tenant_id=v_tid;
  return public.get_solo_business_context();
end $$;
revoke all on function public.save_solo_business_context(uuid,jsonb,jsonb,text,jsonb,jsonb,jsonb,text,text,text,bigint,uuid) from public,anon;
grant execute on function public.save_solo_business_context(uuid,jsonb,jsonb,text,jsonb,jsonb,jsonb,text,text,text,bigint,uuid) to authenticated;

comment on table public.tenant_setup_knowledge_sources is
  'Setup-owned tenant source registry. Links are stored, never fetched. No PAIGE, Mind, Spine, Rail, or network sharing integration.';
comment on table public.tenant_setup_paige_profiles is
  'Owner-confirmed Setup voice context. No runtime model consumption is implied or enabled by this table.';
comment on table public.tenant_setup_voice_examples is
  'Owner-confirmed Setup examples. These records do not enter PAIGE prompts until a separately governed adapter is approved.';
comment on function public.save_solo_business_context(uuid,jsonb,jsonb,text,jsonb,jsonb,jsonb,text,text,text,bigint,uuid) is
  'Atomic canonical Solo Setup save with stable-id upserts, tenant isolation, conflict detection, and owner-only supplemental context.';

commit;
