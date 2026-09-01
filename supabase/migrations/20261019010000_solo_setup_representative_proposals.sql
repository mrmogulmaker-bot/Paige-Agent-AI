-- Let Paige stage an owner-reviewable designation of existing active Team
-- members as business representatives. This changes neither Team membership nor
-- roles, and the owner still applies and saves the proposal in Solo Setup.

begin;

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
  v_rep_count integer := 0;
  v_valid_rep_count integer := 0;
  v_allowed_keys constant text[] := array[
    'legalName','publicName','dbaName','website','address','phone','industry','naicsCode','sicCode',
    'offers','deliveryModel','idealCustomer','customerSegments','serviceArea','currentPriority','goals90Day',
    'annualDirection','successDefinition','constraints','brandVoice','operatingPreferences','doNotAssume',
    'representativeUserIds'
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
    if not v_key = any(v_allowed_keys) then
      raise exception 'unsupported proposal field %', v_key using errcode = '22023';
    end if;
    if v_key = 'representativeUserIds' then
      if jsonb_typeof(_patch -> v_key) <> 'array' then
        raise exception 'representativeUserIds must be an array' using errcode = '22023';
      end if;
    elsif jsonb_typeof(_patch -> v_key) <> 'string' then
      raise exception 'unsupported proposal field %', v_key using errcode = '22023';
    end if;
  end loop;

  if _patch ? 'representativeUserIds' then
    if jsonb_array_length(_patch -> 'representativeUserIds') > 50 then
      raise exception 'too many proposed business representatives' using errcode = '22001';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(_patch -> 'representativeUserIds') value
      where value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
      raise exception 'proposed business representative id is invalid' using errcode = '22023';
    end if;
    select count(distinct value) into v_rep_count
    from jsonb_array_elements_text(_patch -> 'representativeUserIds') value;

    select count(distinct tm.user_id) into v_valid_rep_count
    from public.tenant_members tm
    join jsonb_array_elements_text(_patch -> 'representativeUserIds') value
      on tm.user_id = value::text::uuid
    where tm.tenant_id = _tenant_id
      and tm.status = 'active';

    if v_rep_count <> v_valid_rep_count then
      raise exception 'every proposed business representative must be an active Team member' using errcode = '42501';
    end if;
  end if;

  select coalesce(brand, '{}'::jsonb) into v_brand
  from public.tenants
  where id = _tenant_id
  for update;
  if not found then raise exception 'workspace not found' using errcode = 'P0002'; end if;

  v_proposal := jsonb_build_object(
    'id', v_id,
    'patch', _patch,
    'reason', coalesce(nullif(btrim(_reason),''), 'Paige suggested an update based on the owner conversation.'),
    'proposedAt', v_now,
    'proposedBy', _actor_user_id
  );
  update public.tenants
  set brand = v_brand || jsonb_build_object('business_brief_proposal', v_proposal)
  where id = _tenant_id;

  insert into public.paige_audit_log(actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload)
  values (
    _actor_user_id,
    'paige_on_behalf_of_owner',
    'solo_setup.proposal_staged',
    'solo_business_brief',
    _tenant_id,
    _tenant_id,
    jsonb_build_object('proposal_id', v_id, 'keys', (select jsonb_agg(key order by key) from jsonb_each(_patch)))
  );
  return v_proposal;
end;
$$;

revoke all on function public.stage_solo_business_brief_proposal(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.stage_solo_business_brief_proposal(uuid,uuid,jsonb,text) to service_role;

comment on function public.stage_solo_business_brief_proposal(uuid,uuid,jsonb,text) is
  'Service-only Paige proposal seam. Stages bounded text and active-Team representative suggestions; confirmed business truth changes only when an owner applies and saves in Setup.';

commit;
