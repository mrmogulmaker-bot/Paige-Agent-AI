-- Public Presence -> PAIGE: current-tenant, owner-reviewed public facts only.
create or replace function public.get_public_presence_paige_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_context jsonb := public.get_solo_business_context();
  v_brief jsonb;
  v_provenance jsonb;
  v_facts jsonb := '{}'::jsonb;
  v_freshness jsonb := '{}'::jsonb;
  v_key text;
  v_value text;
  v_name_key text;
  v_allowed constant text[] := array['website','phone','address','serviceArea','industry','offers'];
begin
  if auth.uid() is null or v_context is null then
    raise exception 'active workspace not resolved' using errcode = '42501';
  end if;
  v_brief := coalesce(v_context -> 'brief', '{}'::jsonb);
  v_provenance := coalesce(v_brief -> 'provenance', '{}'::jsonb);
  foreach v_name_key in array array['publicName','dbaName','legalName'] loop
    if v_provenance -> v_name_key ->> 'source' = 'owner_confirmed'
       and v_provenance -> v_name_key ->> 'confidence' = 'confirmed'
       and nullif(btrim(v_brief ->> v_name_key), '') is not null then
      v_facts := v_facts || jsonb_build_object('public_business_name', btrim(v_brief ->> v_name_key));
      v_freshness := v_freshness || jsonb_build_object('public_business_name', coalesce(v_provenance -> v_name_key ->> 'confirmedAt', 'confirmation time unavailable'));
      exit;
    end if;
  end loop;
  foreach v_key in array v_allowed loop
    v_value := nullif(btrim(v_brief ->> v_key), '');
    if v_value is not null and v_provenance -> v_key ->> 'source' = 'owner_confirmed'
       and v_provenance -> v_key ->> 'confidence' = 'confirmed' then
      v_facts := v_facts || jsonb_build_object(v_key, v_value);
      v_freshness := v_freshness || jsonb_build_object(v_key, coalesce(v_provenance -> v_key ->> 'confirmedAt', 'confirmation time unavailable'));
    end if;
  end loop;
  if v_context -> 'primaryEmailProvenance' ->> 'source' = 'owner_confirmed'
     and v_context -> 'primaryEmailProvenance' ->> 'confidence' = 'confirmed'
     and nullif(btrim(v_context ->> 'primaryBusinessEmail'), '') is not null then
    v_facts := v_facts || jsonb_build_object('public_email', btrim(v_context ->> 'primaryBusinessEmail'));
    v_freshness := v_freshness || jsonb_build_object('public_email', coalesce(v_context -> 'primaryEmailProvenance' ->> 'confirmedAt', 'confirmation time unavailable'));
  end if;
  return jsonb_build_object(
    'tenantId', v_context ->> 'tenantId', 'canonicalFacts', v_facts, 'sourceFreshness', v_freshness,
    'completedSetupSteps',
      (case when v_facts ? 'public_business_name' and v_facts ? 'phone'
                  and (v_facts ? 'address' or v_facts ? 'serviceArea')
             then jsonb_build_array('confirm canonical public facts') else '[]'::jsonb end)
      || (case when v_facts ? 'website' then jsonb_build_array('verify website/domain facts') else '[]'::jsonb end),
    'missingSetupSteps',
      (case when not (v_facts ? 'public_business_name' and v_facts ? 'phone'
                       and (v_facts ? 'address' or v_facts ? 'serviceArea'))
             then jsonb_build_array('confirm canonical public facts') else '[]'::jsonb end)
      || (case when not (v_facts ? 'website') then jsonb_build_array('verify website/domain facts') else '[]'::jsonb end)
      || jsonb_build_array(
           'connect supported public venues',
           'compare provider facts with canonical facts',
           'set bounded provider authority',
           'maintain verified results and exceptions'
         ),
    'connectionStatus', jsonb_build_object('googleSearchConsole','UNAVAILABLE','googleBusinessProfile','UNAVAILABLE'),
    'effectiveAuthorityPolicy', jsonb_build_object('status','UNAVAILABLE','reason','No tenant-authorized Public Presence provider policy exists')
  );
end $$;
revoke all on function public.get_public_presence_paige_context() from public, anon;
grant execute on function public.get_public_presence_paige_context() to authenticated, service_role;
comment on function public.get_public_presence_paige_context() is
  'Server-resolved Public Presence context for PAIGE: owner-confirmed public facts plus honest unavailable provider and authority state. Excludes secrets, private documents, reviews, and uploads.';
