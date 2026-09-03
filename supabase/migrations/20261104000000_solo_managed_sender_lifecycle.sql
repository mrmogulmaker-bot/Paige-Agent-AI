-- Owner-approved Solo managed-email lifecycle exception, 2026-09-03.
-- Generated with the CLI, sequenced after the existing future-dated Setup migration.
-- No existing records are rewritten. No provider, Team, billing or model action.
begin;

alter table public.tenant_setup_business_context_meta
  add column managed_email_local_part text;
comment on column public.tenant_setup_business_context_meta.managed_email_local_part is
  'Explicit Solo registration marker. The email identity registry remains authoritative; no browser table access.';

create or replace function public.check_solo_setup_managed_email(_local_part text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_tid uuid := public.solo_setup_assert_canonical_tenant();
  v_local text := lower(btrim(coalesce(_local_part,'')));
  v_domain text;
  v_reply_to text;
  v_taken boolean;
begin
  if public.solo_setup_access_scope()<>'owner_full' then
    raise exception 'Only the workspace Owner can register a Paige-managed email' using errcode='42501';
  end if;
  if v_local !~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$' or position('..' in v_local)>0 then
    raise exception 'Enter a valid local email name of 1-64 characters' using errcode='22023';
  end if;
  select coalesce(nullif(shared_domain,''),'mail.paigeagent.ai'),lower(default_reply_to)
    into v_domain,v_reply_to from public.platform_email_settings limit 1;
  v_domain := lower(coalesce(v_domain,'mail.paigeagent.ai'));
  -- The existing sanitizer appends -team to ALL platform-reserved names.
  -- Compare only that exact transformation: do not truncate valid longer names.
  select public.sanitize_email_local_part(v_local)=v_local||'-team'
    or v_local||'@'||v_domain=v_reply_to
    or exists(select 1 from public.tenant_email_identities i
      where lower(i.local_part)=v_local and i.tenant_id<>v_tid)
    or exists(select 1 from public.channel_connectors c where c.channel_type='email'
      and (lower(c.inbound_address)=v_local||'@'||v_domain or lower(c.from_address)=v_local||'@'||v_domain)
      and not coalesce(c.tenant_id=v_tid and c.provider='resend' and c.config->>'managed_default'='true',false))
    into v_taken;
  return jsonb_build_object('localPart',v_local,'domain',v_domain,
    'address',v_local||'@'||v_domain,'available',not coalesce(v_taken,false),
    'registrationAvailable',exists(select 1 from public.tenants t where t.id=v_tid
      and t.status::text in ('trial','active') and not coalesce((t.features->>'system_workspace')::boolean,false)
      and not exists(select 1 from public.tenant_email_identities i where i.tenant_id=v_tid and i.status<>'active')));
end $$;
revoke all on function public.check_solo_setup_managed_email(text) from public,anon;
grant execute on function public.check_solo_setup_managed_email(text) to authenticated;

create or replace function public.register_solo_setup_managed_email(_expected_tenant_id uuid,_local_part text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tid uuid;
  v_check jsonb;
  v_local text := lower(btrim(coalesce(_local_part,'')));
  v_connector uuid;
begin
  v_tid := public.solo_setup_lock_expected_tenant(_expected_tenant_id);
  if public.solo_setup_access_scope()<>'owner_full' then
    raise exception 'Only the workspace Owner can register a Paige-managed email' using errcode='42501';
  end if;
  -- Match Setup save's profile -> meta -> tenant order. Tenant lifecycle
  -- holds the tenant first, so the shared helper takes tenant before advisory.
  insert into public.tenant_setup_business_context_meta(tenant_id) values(v_tid)
    on conflict(tenant_id) do nothing;
  perform 1 from public.tenant_setup_business_context_meta where tenant_id=v_tid for update;
  perform 1 from public.tenants where id=v_tid for update;
  perform pg_advisory_xact_lock(hashtextextended('paige-managed-email:'||v_tid::text,0));
  perform 1 from public.tenant_email_identities where tenant_id=v_tid for update;
  if exists(select 1 from public.tenant_email_identities where tenant_id=v_tid and status<>'active') then
    raise exception 'The managed email identity is disabled. Review it in Connections.' using errcode='42501';
  end if;
  v_check := public.check_solo_setup_managed_email(v_local);
  if not coalesce((v_check->>'registrationAvailable')::boolean,false) then
    raise exception 'Managed email registration is unavailable for this workspace' using errcode='42501';
  end if;
  if not coalesce((v_check->>'available')::boolean,false) then
    raise exception 'This managed email is unavailable. Check another name.' using errcode='23505';
  end if;
  -- Existing registry uniqueness and global lower(inbound_address) uniqueness
  -- arbitrate racing claims. A failure rolls back registry, marker and connector.
  insert into public.tenant_email_identities(tenant_id,from_name,local_part,kind,status)
    select v_tid,coalesce(nullif(t.name,''),'Paige'),v_local,'shared','active'
      from public.tenants t where t.id=v_tid
  on conflict(tenant_id) do update set local_part=excluded.local_part,updated_at=now();
  -- Keep kind, custom_domain_id, reply_to and status on existing identities.
  -- resolve_tenant_sender still prefers verified custom domains, unchanged.
  update public.tenant_setup_business_context_meta
    set managed_email_local_part=v_local,updated_at=now(),updated_by=auth.uid()
    where tenant_id=v_tid;
  v_connector := public.provision_paige_managed_email_connector(v_tid);
  if v_connector is null or not exists(select 1 from public.channel_connectors c
    where c.id=v_connector and c.tenant_id=v_tid and c.active
      and lower(c.inbound_address)=v_check->>'address' and lower(c.from_address)=v_check->>'address') then
    raise exception 'The managed sender could not be synchronized. Retry.' using errcode='40001';
  end if;
  return v_check || jsonb_build_object('registered',true);
end $$;
revoke all on function public.register_solo_setup_managed_email(uuid,text) from public,anon;
grant execute on function public.register_solo_setup_managed_email(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION public.provision_paige_managed_email_connector(p_tenant_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant public.tenants%ROWTYPE;
  _shared_domain text;
  _local_part text;
  _address text;
  _reply_to text;
  _connector_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONNECTOR_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _tenant
    FROM public.tenants
   WHERE id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_CONNECTOR_TENANT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('paige-managed-email:' || p_tenant_id::text, 0));

  -- account_type + parent_tenant_id classify the topology, not inheritance:
  -- agency roots, sub-accounts (child workspaces), and solo standalones each own their sender.
  IF _tenant.status NOT IN ('trial'::public.tenant_status, 'active'::public.tenant_status)
     OR _tenant.account_type NOT IN ('agency', 'standalone', 'enterprise', 'sub_account')
     OR coalesce((_tenant.features ->> 'system_workspace')::boolean, false) THEN
    UPDATE public.channel_connectors
       SET active = false, status = 'disabled'
     WHERE tenant_id = p_tenant_id
       AND channel_type = 'email'
       AND provider = 'resend'
       AND config ->> 'managed_default' = 'true';
    RETURN NULL;
  END IF;

  SELECT coalesce(nullif(shared_domain, ''), 'mail.paigeagent.ai'),
         coalesce(nullif(default_reply_to, ''), 'support@paigeagent.ai')
    INTO _shared_domain, _reply_to
    FROM public.platform_email_settings
   LIMIT 1;

  _shared_domain := coalesce(_shared_domain, 'mail.paigeagent.ai');
  _reply_to := coalesce(_reply_to, 'support@paigeagent.ai');
  _local_part := public.sanitize_email_local_part(coalesce(nullif(_tenant.slug, ''), _tenant.name, 'client'));
  -- Only an explicitly opted-in top-level Solo uses the registry selection.
  -- All other tiers retain the existing slug-derived sender behavior.
  IF _tenant.account_type = 'standalone' AND _tenant.parent_tenant_id IS NULL
     AND EXISTS (SELECT 1 FROM public.tenant_setup_business_context_meta m
       WHERE m.tenant_id=p_tenant_id AND m.managed_email_local_part IS NOT NULL) THEN
    SELECT coalesce(i.local_part,_local_part) INTO _local_part
      FROM public.tenant_email_identities i WHERE i.tenant_id=p_tenant_id;
    IF _local_part IS NULL THEN
      RAISE EXCEPTION 'Registered managed identity is missing' USING ERRCODE='40001';
    END IF;
  END IF;
  _address := _local_part || '@' || _shared_domain;

  IF EXISTS (
    SELECT 1
      FROM public.channel_connectors c
     WHERE c.channel_type = 'email'
       AND lower(c.inbound_address) = lower(_address)
       AND NOT (
         c.tenant_id = p_tenant_id
         AND c.provider = 'resend'
         AND c.config ->> 'managed_default' = 'true'
       )
  ) THEN
    RAISE EXCEPTION 'PAIGE_MANAGED_EMAIL_ADDRESS_CONFLICT: %', _address
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.channel_connectors (
    tenant_id, channel_type, provider, inbound_address, inbound_domain,
    display_name, from_name, from_address, reply_to, status, active, config
  ) VALUES (
    p_tenant_id, 'email', 'resend', _address, NULL,
    'Paige email', coalesce(nullif(_tenant.name, ''), 'Paige'), _address, _reply_to,
    'active', true,
    jsonb_build_object(
      'managed_default', true,
      'source', 'tenant_domain_spine',
      'web_hostname', _tenant.slug || '.paigeagent.ai'
    )
  )
  ON CONFLICT (tenant_id)
    WHERE channel_type = 'email'
      AND provider = 'resend'
      AND config ->> 'managed_default' = 'true'
  DO UPDATE SET
    inbound_address = EXCLUDED.inbound_address,
    inbound_domain = NULL,
    display_name = EXCLUDED.display_name,
    from_name = EXCLUDED.from_name,
    from_address = EXCLUDED.from_address,
    reply_to = EXCLUDED.reply_to,
    status = 'active',
    active = true,
    config = coalesce(public.channel_connectors.config, '{}'::jsonb)
      || EXCLUDED.config
  RETURNING id INTO _connector_id;

  RETURN _connector_id;
END;
$function$;
revoke all on function public.provision_paige_managed_email_connector(uuid) from public,anon,authenticated;
grant execute on function public.provision_paige_managed_email_connector(uuid) to service_role;

create or replace function public.solo_setup_managed_email_registration_ready()
returns boolean language sql stable set search_path=public as $$ select true $$;
revoke all on function public.solo_setup_managed_email_registration_ready() from public,anon,authenticated;

commit;
