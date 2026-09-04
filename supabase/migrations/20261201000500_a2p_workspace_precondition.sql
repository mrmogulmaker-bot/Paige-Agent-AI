-- Preserve the existing draft save contract and add a stale-workspace precondition.
create or replace function public.tenant_a2p_registration_save_draft(
  p_use_case             text,
  p_campaign_description text,
  p_sample_messages      jsonb default '[]'::jsonb,
  p_optin_flow           text  default null,
  p_tenant_id            uuid  default null,
  p_optin_message        text  default null,
  p_optout_message       text  default null,
  p_help_message         text  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_is_service boolean;
  v_tenant     uuid;
  v_legal      text;
  v_existing   public.tenant_a2p_registrations%rowtype;
  v_samples    jsonb;
  v_count      int;
  v_id         uuid;
  v_use        text := nullif(btrim(coalesce(p_use_case,'')), '');
  v_desc       text := case when p_campaign_description is null then null else btrim(p_campaign_description) end;
  v_optin      text := case when p_optin_flow is null then null else btrim(p_optin_flow) end;
  v_optin_msg  text := case when p_optin_message  is null then null else left(btrim(p_optin_message), 320) end;
  v_optout_msg text := case when p_optout_message is null then null else left(btrim(p_optout_message), 320) end;
  v_help_msg   text := case when p_help_message   is null then null else left(btrim(p_help_message), 320) end;
begin
  v_is_service := (v_uid is null
                   and (coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
                        or session_user = 'service_role'));
  if v_uid is null and not v_is_service then
    raise exception 'authentication required' using errcode = '42501', hint = 'UNAUTHENTICATED';
  end if;

  if v_uid is not null then
    v_tenant := public.current_user_tenant_id();
    if v_tenant is null then
      raise exception 'no tenant resolved for this account' using errcode = '42501', hint = 'NO_TENANT';
    end if;
    -- The expected workspace is a precondition, never a tenant selector. A handler
    -- that started in A must not save its result into B after the user switches.
    if p_tenant_id is not null and p_tenant_id <> v_tenant then
      raise exception 'workspace changed while preparing registration'
        using errcode = '42501', hint = 'WORKSPACE_CHANGED';
    end if;
    if not (public.is_platform_owner()
            or public.has_any_role(v_uid, array['admin','coach'])
            or public.is_tenant_admin_as(v_uid, v_tenant)) then
      raise exception 'admin or coach access required to prepare a registration'
        using errcode = '42501', hint = 'FORBIDDEN';
    end if;
  else
    if p_tenant_id is null then
      raise exception 'p_tenant_id is required for a service-role caller'
        using errcode = '22023', hint = 'TENANT_REQUIRED';
    end if;
    if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
      raise exception 'unknown tenant' using errcode = '42501', hint = 'UNKNOWN_TENANT';
    end if;
    v_tenant := p_tenant_id;
  end if;

  select nullif(btrim(lp.legal_business_name), '') into v_legal
    from public.tenant_legal_profile lp where lp.tenant_id = v_tenant;
  if v_legal is null then
    raise exception 'a legal business name is required before a registration can be prepared'
      using errcode = '23514', hint = 'LEGAL_PROFILE_REQUIRED';
  end if;

  if v_use is null then
    raise exception 'a use case is required' using errcode = '23514', hint = 'USE_CASE_REQUIRED';
  end if;

  if jsonb_typeof(coalesce(p_sample_messages,'[]'::jsonb)) <> 'array' then
    raise exception 'sample_messages must be a JSON array' using errcode = '22023', hint = 'SAMPLES_INVALID';
  end if;
  select coalesce(jsonb_agg(to_jsonb(left(btrim(s.m), 1024)) order by s.ord), '[]'::jsonb)
    into v_samples
    from (select value #>> '{}' as m, ordinality as ord
            from jsonb_array_elements(coalesce(p_sample_messages,'[]'::jsonb)) with ordinality) s
   where nullif(btrim(s.m), '') is not null
     and s.ord <= 10;
  v_count := jsonb_array_length(v_samples);
  if v_count < 1 then
    raise exception 'at least one sample message is required' using errcode = '23514', hint = 'SAMPLES_REQUIRED';
  end if;

  -- Serialise concurrent saves for THIS tenant. Unlike FOR UPDATE, an advisory lock
  -- exists whether or not the row does, so the read below is authoritative on a first
  -- save too. Transaction-scoped: released on commit or rollback, never leaked.
  perform pg_advisory_xact_lock(hashtextextended('a2p_registration:' || v_tenant::text, 0));

  select * into v_existing
    from public.tenant_a2p_registrations where tenant_id = v_tenant
    for update;
  if found and public.a2p_registration_is_immutable(v_existing) then
    raise exception 'this registration has left preparation and cannot be edited as a draft'
      using errcode = '42501', hint = 'REGISTRATION_IMMUTABLE';
  end if;

  -- absent => keep, '' => clear, text => replace. campaign_description is PRESERVE-ONLY:
  -- every producer requires it (comms-a2p-submit refuses an empty one outright), so a
  -- database that accepted a clear would disagree with the only paths that reach it.
  v_desc       := case when v_desc is null or v_desc = '' then v_existing.campaign_description
                       else v_desc end;
  v_optin      := case when p_optin_flow is null then v_existing.optin_flow
                       when v_optin = '' then null else v_optin end;
  v_optin_msg  := case when p_optin_message  is null then v_existing.optin_message
                       when v_optin_msg  = '' then null else v_optin_msg  end;
  v_optout_msg := case when p_optout_message is null then v_existing.optout_message
                       when v_optout_msg = '' then null else v_optout_msg end;
  v_help_msg   := case when p_help_message   is null then v_existing.help_message
                       when v_help_msg   = '' then null else v_help_msg   end;

  insert into public.tenant_a2p_registrations
    (tenant_id, use_case, campaign_description, sample_messages, optin_flow,
     optin_message, optout_message, help_message, status)
  values (v_tenant, v_use, v_desc, v_samples, v_optin,
          v_optin_msg, v_optout_msg, v_help_msg, 'pending')
  on conflict (tenant_id) do update
    set use_case             = coalesce(excluded.use_case, tenant_a2p_registrations.use_case),
        campaign_description = excluded.campaign_description,
        sample_messages      = excluded.sample_messages,
        optin_flow           = excluded.optin_flow,
        optin_message        = excluded.optin_message,
        optout_message       = excluded.optout_message,
        help_message         = excluded.help_message,
        status               = 'pending',
        updated_at           = now()
    where not public.a2p_registration_is_immutable(tenant_a2p_registrations.*)
  returning id into v_id;

  if v_id is null then
    raise exception 'this registration has left preparation and cannot be edited as a draft'
      using errcode = '42501', hint = 'REGISTRATION_IMMUTABLE';
  end if;

  insert into public.paige_audit_log (tenant_id, actor_user_id, actor_role, action, target_type, target_id, payload)
  values (v_tenant, v_uid,
          case when v_is_service then 'service_role' else 'tenant_staff' end,
          'a2p.draft.saved', 'tenant_a2p_registrations', v_id,
          jsonb_build_object('sample_count', v_count,
                             'has_description', (v_desc is not null),
                             'has_optin_flow', (v_optin is not null),
                             'has_optin_message', (v_optin_msg is not null),
                             'has_optout_message', (v_optout_msg is not null),
                             'has_help_message', (v_help_msg is not null),
                             'resulting_state', 'prepared'));

  return jsonb_build_object('ok', true, 'registration_id', v_id, 'a2p', 'prepared', 'sample_count', v_count);
end;
$$;

revoke all on function public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid,text,text,text) from public, anon;
grant execute on function public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid,text,text,text)
  to authenticated, service_role;


-- Never reassign a captured workspace after the save waited for a lock.
create or replace function public.set_tenant_a2p_registration_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if auth.uid() is not null then
    v_tenant := public.current_user_tenant_id();
    if v_tenant is null then
      raise exception 'no tenant resolved for this account'
        using errcode = '42501', hint = 'NO_TENANT';
    end if;
    if new.tenant_id is not null and new.tenant_id <> v_tenant then
      raise exception 'workspace changed while preparing registration'
        using errcode = '42501', hint = 'WORKSPACE_CHANGED';
    end if;
    new.tenant_id := v_tenant;
  end if;
  return new;
end;
$$;
revoke all on function public.set_tenant_a2p_registration_tenant() from public, anon, authenticated;

-- Ordinary Solo owners use the same scoped read path as the draft/save surface.
-- This grants SELECT only; provider state and direct writes remain protected.
drop policy if exists a2p_active_workspace_owner_read on public.tenant_a2p_registrations;
create policy a2p_active_workspace_owner_read on public.tenant_a2p_registrations
for select to authenticated
using (tenant_id = public.current_user_tenant_id() and public.is_current_user_tenant_admin());
