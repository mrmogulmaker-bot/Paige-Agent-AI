-- Solo Settings -> Setup business brief.
--
-- One tenant-owned document lives under tenants.brand.business_brief so the
-- existing brand authority remains the only owner/admin write gate. The callable
-- save seam validates every field, verifies representative ids against active
-- Team membership, records an attributable Paige rail audit, and exposes the
-- confirmed document through get_paige_persona_context without changing its
-- return signature. Email/provider configuration remains in Connections.

begin;

create or replace function public.get_solo_business_brief()
returns table (
  tenant_id uuid,
  tenant_name text,
  business_brief jsonb,
  pending_proposal jsonb,
  primary_business_email text,
  can_edit boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_tid uuid := public.current_user_tenant_id();
  v_legacy jsonb;
begin
  if auth.uid() is null or v_tid is null then
    return;
  end if;

  select * into v_tenant from public.tenants where id = v_tid;
  if not found then return; end if;

  v_legacy := jsonb_strip_nulls(jsonb_build_object(
    'legalName', nullif(v_tenant.brand ->> 'legal_entity_name', ''),
    'publicName', nullif(v_tenant.name, ''),
    'website', nullif(v_tenant.brand ->> 'website', ''),
    'address', nullif(v_tenant.brand ->> 'address', ''),
    'phone', coalesce(nullif(v_tenant.brand ->> 'phone', ''), nullif(v_tenant.brand ->> 'business_phone', '')),
    'industry', nullif(v_tenant.brand ->> 'industry', ''),
    'provenance', jsonb_build_object()
  ));

  return query select
    v_tenant.id,
    v_tenant.name,
    coalesce(v_tenant.brand -> 'business_brief', v_legacy),
    v_tenant.brand -> 'business_brief_proposal',
    nullif(v_tenant.brand ->> 'support_email', ''),
    public.can_manage_tenant_brand(v_tenant.id);
end;
$$;

revoke all on function public.get_solo_business_brief() from public, anon;
grant execute on function public.get_solo_business_brief() to authenticated;

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
  v_proposal jsonb;
  v_canonical jsonb := '{}'::jsonb;
  v_provenance jsonb := '{}'::jsonb;
  v_representatives jsonb := '[]'::jsonb;
  v_key text;
  v_value text;
  v_now timestamptz := clock_timestamp();
  v_role text;
  v_rep_count integer;
  v_valid_rep_count integer;
  v_allowed_keys constant text[] := array[
    'legalName','publicName','dbaName','website','address','phone','industry','naicsCode','sicCode',
    'offers','deliveryModel','idealCustomer','customerSegments','serviceArea','currentPriority','goals90Day',
    'annualDirection','successDefinition','constraints','brandVoice','operatingPreferences','doNotAssume'
  ];
begin
  if auth.uid() is null or v_tid is null then
    raise exception 'active workspace not resolved' using errcode = '42501';
  end if;
  if not public.can_manage_tenant_brand(v_tid) then
    raise exception 'not authorized to edit this business brief' using errcode = '42501';
  end if;
  if _brief is null or jsonb_typeof(_brief) <> 'object' or pg_column_size(_brief) > 65536 then
    raise exception 'business brief must be a JSON object no larger than 64 KB' using errcode = '22023';
  end if;

  select coalesce(brand, '{}'::jsonb) into v_brand
  from public.tenants where id = v_tid for update;
  if not found then raise exception 'workspace not found' using errcode = 'P0002'; end if;

  v_current := coalesce(v_brand -> 'business_brief', '{}'::jsonb);
  if _expected_updated_at is not null
     and nullif(v_current ->> 'updatedAt', '') is distinct from _expected_updated_at then
    raise exception 'This brief changed in another session. Reload it before saving.' using errcode = '40001';
  end if;

  if _proposal_id is not null then
    v_proposal := v_brand -> 'business_brief_proposal';
    if v_proposal is null or nullif(v_proposal ->> 'id', '') is distinct from _proposal_id::text then
      raise exception 'The Paige proposal is no longer current. Reload before applying it.' using errcode = '40001';
    end if;
  end if;

  foreach v_key in array v_allowed_keys loop
    if _brief ? v_key and jsonb_typeof(_brief -> v_key) not in ('string', 'null') then
      raise exception 'business brief field % must be text', v_key using errcode = '22023';
    end if;
    v_value := nullif(btrim(coalesce(_brief ->> v_key, '')), '');
    if v_value is not null and char_length(v_value) > 4000 then
      raise exception 'business brief field % is too long', v_key using errcode = '22001';
    end if;
    v_canonical := v_canonical || jsonb_build_object(v_key, coalesce(v_value, ''));
    if v_value is not null then
      v_provenance := v_provenance || jsonb_build_object(v_key, jsonb_build_object(
        'source', 'owner_confirmed', 'confidence', 'confirmed', 'confirmedAt', v_now
      ));
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

  if _brief ? 'representativeUserIds' then
    if jsonb_typeof(_brief -> 'representativeUserIds') <> 'array' then
      raise exception 'representativeUserIds must be an array' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(_brief -> 'representativeUserIds') value
      where value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
      raise exception 'business representative id is invalid' using errcode = '22023';
    end if;
    select count(distinct value), coalesce(jsonb_agg(distinct value order by value), '[]'::jsonb)
      into v_rep_count, v_representatives
      from jsonb_array_elements_text(_brief -> 'representativeUserIds') value;
    select count(distinct m.user_id) into v_valid_rep_count
      from public.tenant_members m
      join jsonb_array_elements_text(v_representatives) value on m.user_id = value::text::uuid
     where m.tenant_id = v_tid and m.status = 'active';
    if v_rep_count <> v_valid_rep_count then
      raise exception 'every business representative must be an active Team member' using errcode = '42501';
    end if;
  end if;

  if jsonb_array_length(v_representatives) > 0 then
    v_provenance := v_provenance || jsonb_build_object('representatives', jsonb_build_object(
      'source', 'owner_confirmed', 'confidence', 'confirmed', 'confirmedAt', v_now
    ));
  end if;
  v_canonical := v_canonical || jsonb_build_object(
    'representativeUserIds', v_representatives,
    'provenance', v_provenance,
    'updatedAt', v_now,
    'updatedBy', auth.uid()
  );

  update public.tenants
     set name = coalesce(nullif(v_canonical ->> 'publicName',''), name),
         brand = (v_brand || jsonb_build_object('business_brief', v_canonical))
                 - case when _proposal_id is not null then 'business_brief_proposal' else '__keep_proposal__' end
   where id = v_tid;

  select coalesce(m.role, case when m.is_owner then 'owner' else 'member' end)
    into v_role from public.tenant_members m
   where m.tenant_id = v_tid and m.user_id = auth.uid() and m.status = 'active'
   order by m.is_owner desc limit 1;

  insert into public.paige_audit_log(actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload)
  values (
    auth.uid(), coalesce(v_role, 'authorized_owner'),
    case when _proposal_id is null then 'solo_setup.owner_saved' else 'solo_setup.owner_approved_proposal' end,
    'solo_business_brief', v_tid, v_tid,
    jsonb_build_object(
      'field_count', (select count(*) from jsonb_each_text(v_canonical) where key = any(v_allowed_keys) and value <> ''),
      'representative_count', jsonb_array_length(v_representatives),
      'proposal_id', _proposal_id
    )
  );

  return v_canonical;
end;
$$;

revoke all on function public.save_solo_business_brief(jsonb,text,uuid) from public, anon;
grant execute on function public.save_solo_business_brief(jsonb,text,uuid) to authenticated;

create or replace function public.dismiss_solo_business_brief_proposal(_proposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tid uuid := public.current_user_tenant_id();
  v_brand jsonb;
begin
  if auth.uid() is null or v_tid is null or not public.can_manage_tenant_brand(v_tid) then
    raise exception 'not authorized to dismiss this proposal' using errcode = '42501';
  end if;
  select coalesce(brand, '{}'::jsonb) into v_brand from public.tenants where id = v_tid for update;
  if nullif(v_brand -> 'business_brief_proposal' ->> 'id', '') is distinct from _proposal_id::text then
    raise exception 'proposal is no longer current' using errcode = '40001';
  end if;
  update public.tenants set brand = v_brand - 'business_brief_proposal' where id = v_tid;
  insert into public.paige_audit_log(actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload)
  values (auth.uid(), 'authorized_owner', 'solo_setup.owner_dismissed_proposal', 'solo_business_brief', v_tid, v_tid, jsonb_build_object('proposal_id', _proposal_id));
  return true;
end;
$$;

revoke all on function public.dismiss_solo_business_brief_proposal(uuid) from public, anon;
grant execute on function public.dismiss_solo_business_brief_proposal(uuid) to authenticated;

create or replace function public.stage_solo_business_brief_proposal(
  _tenant_id uuid,
  _actor_user_id uuid,
  _patch jsonb,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_proposal jsonb;
  v_brand jsonb;
  v_key text;
  v_allowed_keys constant text[] := array[
    'legalName','publicName','dbaName','website','address','phone','industry','naicsCode','sicCode',
    'offers','deliveryModel','idealCustomer','customerSegments','serviceArea','currentPriority','goals90Day',
    'annualDirection','successDefinition','constraints','brandVoice','operatingPreferences','doNotAssume'
  ];
begin
  if _tenant_id is null or _actor_user_id is null or _patch is null or jsonb_typeof(_patch) <> 'object' then
    raise exception 'tenant, actor and proposal patch are required' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_object_keys(_patch)) then
    raise exception 'proposal patch must include at least one field' using errcode = '22023';
  end if;
  if pg_column_size(_patch) > 32768 or char_length(coalesce(_reason,'')) > 1000 then
    raise exception 'proposal is too large' using errcode = '22001';
  end if;
  if not exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = _tenant_id
      and tm.user_id = _actor_user_id
      and tm.status = 'active'
  ) then
    raise exception 'actor is not an active workspace member' using errcode = '42501';
  end if;
  for v_key in select jsonb_object_keys(_patch) loop
    if not v_key = any(v_allowed_keys) or jsonb_typeof(_patch -> v_key) <> 'string' then
      raise exception 'unsupported proposal field %', v_key using errcode = '22023';
    end if;
  end loop;
  select coalesce(brand, '{}'::jsonb) into v_brand from public.tenants where id = _tenant_id for update;
  if not found then raise exception 'workspace not found' using errcode = 'P0002'; end if;
  v_proposal := jsonb_build_object(
    'id', v_id,
    'patch', _patch,
    'reason', coalesce(nullif(btrim(_reason),''), 'Paige suggested an update based on the owner conversation.'),
    'proposedAt', v_now,
    'proposedBy', _actor_user_id
  );
  update public.tenants set brand = v_brand || jsonb_build_object('business_brief_proposal', v_proposal) where id = _tenant_id;
  insert into public.paige_audit_log(actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload)
  values (_actor_user_id, 'paige_on_behalf_of_owner', 'solo_setup.proposal_staged', 'solo_business_brief', _tenant_id, _tenant_id,
          jsonb_build_object('proposal_id', v_id, 'keys', (select jsonb_agg(key order by key) from jsonb_each(_patch))));
  return v_proposal;
end;
$$;

revoke all on function public.stage_solo_business_brief_proposal(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.stage_solo_business_brief_proposal(uuid,uuid,jsonb,text) to service_role;

-- Trust Compass visibility/control. The runtime gate defaults this action to
-- confirmation, and the operator must also be able to see it and turn it off.
-- This is the current catalogue body with one added, owner-facing CRM entry.
CREATE OR REPLACE FUNCTION public.list_tool_autonomy(
  _tenant_id uuid default null
)
returns table (
  tool_key text,
  label text,
  category text,
  mode text,
  is_default boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _tenant uuid;
begin
  if _caller is not null then
    _tenant := public.current_user_tenant_id();
    if _tenant_id is not null and _tenant_id <> _tenant and not public.is_platform_owner() then
      raise exception 'AUTONOMY_FORBIDDEN: tenant mismatch' using errcode = '42501';
    end if;
    if public.is_platform_owner() and _tenant_id is not null then _tenant := _tenant_id; end if;
  else
    _tenant := _tenant_id;
  end if;

  return query
  WITH catalog(tool_key, label, category) AS (
    values
      ('crm_update_contact',              'Update a contact',                 'CRM'),
      ('crm_create_contact',              'Add a contact',                    'CRM'),
      ('crm_delete_contact',              'Delete a contact',                 'CRM'),
      ('propose_business_brief_update',   'Propose a business brief update',  'CRM'),
      ('crm_update_pipeline_stage',       'Move a client''s stage',           'Pipeline'),
      ('crm_assign_coach',                'Assign a coach',                   'CRM'),
      ('crm_assign_contact',              'Assign a contact',                 'CRM'),
      ('crm_create_task',                 'Create a task',                    'Tasks'),
      ('crm_log_activity',                'Log an activity',                  'CRM'),
      ('pipeline_create',                 'Create a pipeline',                'Pipeline'),
      ('pipeline_add_stage',              'Add a pipeline stage',             'Pipeline'),
      ('member_grant_role',               'Grant a staff role',               'Team'),
      ('member_revoke_role',              'Revoke a staff role',              'Team'),
      ('calendar_book_meeting',           'Book a meeting',                   'Calendar'),
      ('program_enroll',                  'Enroll a client in a program',     'Programs'),
      ('draft_marketing_content',         'Draft marketing content',          'Content'),
      ('generate_image',                  'Generate an image',                'Content'),
      ('content_save',                    'Save marketing content',           'Content'),
      ('growth_page_save',                'Save a landing page draft',        'Studio'),
      ('growth_page_publish',             'Publish a landing page',           'Studio'),
      ('growth_funnel_build',             'Build a funnel',                   'Studio'),
      ('growth_funnel_publish',           'Publish a funnel',                 'Studio'),
      ('action_file',                     'File an action',                   'Action bus'),
      ('action_advance',                  'Advance an action',                'Action bus')
  )
  SELECT
    c.tool_key,
    c.label,
    c.category,
    coalesce(t.mode, 'confirm') as mode,
    (t.mode is null) as is_default,
    t.updated_at
  from catalog c
  left join public.tenant_tool_autonomy t
    on t.tool_key = c.tool_key and t.tenant_id = _tenant
  order by c.category, c.label;
end;
$$;

revoke all on function public.list_tool_autonomy(uuid) from public, anon;
grant execute on function public.list_tool_autonomy(uuid) to authenticated, service_role;

-- Mind/Paige reads the saved brief through the existing persona contract. The
-- return signature and all existing fields stay unchanged; only brand gains one
-- tenant-specific, owner-confirmed child document.
create or replace function public.get_paige_persona_context()
returns table(tenant_id uuid, tenant_name text, playbook_config jsonb, playbook_slug text, funding_enabled boolean, brand jsonb)
language plpgsql
stable security definer
set search_path = public
as $$
declare
  _tid uuid;
begin
  select c.tenant_id into _tid
  from public.clients c
  where c.linked_user_id = auth.uid()
  order by c.created_at asc
  limit 1;

  if _tid is null then _tid := public.current_user_tenant_id(); end if;
  if _tid is null then return; end if;

  return query
  select
    t.id,
    t.name,
    t.features -> 'playbook_config',
    nullif(t.features ->> 'playbook', ''),
    coalesce(
      exists (
        select 1 from public.marketplace_installs mi
        join public.marketplace_items it on it.id = mi.item_id
        where mi.tenant_id = t.id and mi.status = 'active' and it.is_finance = true
      ) or (t.features ->> 'finance_in_scope')::boolean,
      false
    ),
    (select to_jsonb(rb) from public.resolve_tenant_brand(_tid) rb)
      || jsonb_build_object('business_brief', t.brand -> 'business_brief')
  from public.tenants t
  where t.id = _tid;
end;
$$;

revoke all on function public.get_paige_persona_context() from public, anon;
grant execute on function public.get_paige_persona_context() to authenticated;

comment on function public.save_solo_business_brief(jsonb,text,uuid) is
  'Owner/admin-confirmed Solo Setup business brief save. Validates active Team representatives, preserves tenant isolation, and writes an attributable Paige audit rail event.';
comment on function public.stage_solo_business_brief_proposal(uuid,uuid,jsonb,text) is
  'Service-only Paige proposal seam. Stages a bounded business-brief patch; it never changes confirmed truth until an owner applies and saves it.';

commit;
