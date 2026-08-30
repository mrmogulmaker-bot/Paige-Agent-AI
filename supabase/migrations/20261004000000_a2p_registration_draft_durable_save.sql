-- =============================================================================
-- A durable, server-authorized home for a PREPARED A2P registration draft.
--
-- THE GAP. `comms-a2p-draft` generates a registration draft and returns it in the
-- HTTP response. Across its 309 lines it performs two reads (`user_roles`,
-- `tenants`) and no insert or upsert — so the draft died with the response. The one
-- action the Communications surface is meant to support did not survive the call.
--
-- WHY THIS ADDS NO STORAGE. `tenant_a2p_registrations` already owns exactly the
-- campaign fields a draft holds (use_case, campaign_description, sample_messages,
-- optin_flow) and already carries UNIQUE (tenant_id). The tenant's legal identity
-- already lives on `tenant_legal_profile.legal_business_name` and is READ here,
-- never copied (§18 one home). Provenance goes to the existing `paige_audit_log`.
-- No new table, no new column, no parallel registration/approval/outcome store.
--
-- WHY NOT THE RAIL. `record_rail_event` is contact-keyed: it hard-requires
-- `p_contact_id` to resolve to a client in the caller's tenant
-- ("contact not in tenant", 42501) and writes to `paige_client_events`. An A2P
-- registration is a TENANT-level artifact with no contact, so filing it there would
-- mean inventing a synthetic contact or a new kind on a client feed — which is the
-- parallel-store drift this slice is required to avoid. The Rail is not used.
--
-- PREPARED IS NOT SUBMITTED, and that is enforced rather than intended. This path
-- writes status='pending' and NEVER touches submitted_at, approved_at, brand_sid,
-- campaign_sid, messaging_service_sid, brand_status or campaign_status. The shipped
-- resolver maps (status not approved, submitted_at is null) -> 'prepared', so a save
-- through here cannot render as submitted or approved. Only the separate submission
-- path may set submitted_at, and a row that already carries one is refused outright.
--
-- §59 — THE GRANT IS NEVER THE GUARD. This is SECURITY DEFINER, so it bypasses RLS;
-- every caller-scope rule below is enforced IN THE BODY, and anon holds no EXECUTE.
-- =============================================================================

create or replace function public.tenant_a2p_registration_save_draft(
  p_use_case             text,
  p_campaign_description text,
  p_sample_messages      jsonb default '[]'::jsonb,
  p_optin_flow           text  default null,
  p_tenant_id            uuid  default null   -- SERVICE-ROLE CALLERS ONLY; ignored for JWT callers
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_is_service boolean;
  v_tenant     uuid;
  v_legal      text;
  v_existing   record;
  v_samples    jsonb;
  v_count      int;
  v_id         uuid;
  v_use        text := nullif(btrim(coalesce(p_use_case,'')), '');
  v_desc       text := nullif(btrim(coalesce(p_campaign_description,'')), '');
  v_optin      text := nullif(btrim(coalesce(p_optin_flow,'')), '');
begin
  -- ── caller kind ───────────────────────────────────────────────────────────
  -- A NULL auth.uid() is either the trusted service role or an unauthenticated
  -- caller; they are NOT the same and must not be collapsed. anon also holds no
  -- EXECUTE, but that grant is a second line, never the first (§59).
  v_is_service := (v_uid is null and coalesce(auth.role(), '') = 'service_role');
  if v_uid is null and not v_is_service then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_uid is not null then
    -- ── JWT caller: the tenant is SERVER-DERIVED. A body p_tenant_id is ignored,
    --    exactly as comms-a2p-draft already documents, so naming another tenant
    --    can never redirect the write (§9).
    v_tenant := public.current_user_tenant_id();
    if v_tenant is null then
      raise exception 'no tenant resolved for this account' using errcode = '42501';
    end if;
    -- Capability: the same authority comms-a2p-draft enforces. `has_any_role` reads
    -- the tenant-agnostic user_roles table, which is safe ONLY because the tenant
    -- above is derived from the caller's own session and never supplied (§53 trap).
    if not (public.is_platform_owner()
            or public.has_any_role(v_uid, array['admin','coach'])) then
      raise exception 'admin or coach access required to prepare a registration'
        using errcode = '42501';
    end if;
  else
    -- ── service-role caller (Paige headless, §10): must name the tenant.
    if p_tenant_id is null then
      raise exception 'p_tenant_id is required for a service-role caller' using errcode = '22023';
    end if;
    if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
      raise exception 'unknown tenant' using errcode = '42501';
    end if;
    v_tenant := p_tenant_id;
  end if;

  -- ── legal identity is READ, never copied ──────────────────────────────────
  select nullif(btrim(lp.legal_business_name), '') into v_legal
    from public.tenant_legal_profile lp where lp.tenant_id = v_tenant;
  if v_legal is null then
    raise exception 'a legal business name is required before a registration can be prepared'
      using errcode = '23514';
  end if;

  -- ── validation ────────────────────────────────────────────────────────────
  if v_use is null then
    raise exception 'a use case is required' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_sample_messages, '[]'::jsonb)) <> 'array' then
    raise exception 'sample_messages must be a JSON array' using errcode = '22023';
  end if;
  -- Keep only non-blank strings, cap the length and the count. Carriers require at
  -- least two real samples, which is the same bar comms-a2p-draft applies before it
  -- will call a generated draft usable.
  select coalesce(jsonb_agg(left(btrim(m), 1024) order by ord), '[]'::jsonb)
    into v_samples
    from (select value #>> '{}' as m, ordinality as ord
            from jsonb_array_elements(coalesce(p_sample_messages,'[]'::jsonb)) with ordinality) s
   where nullif(btrim(s.m), '') is not null
     and s.ord <= 10;
  v_count := jsonb_array_length(v_samples);
  if v_count < 2 then
    raise exception 'at least two sample messages are required' using errcode = '23514';
  end if;

  -- ── never overwrite a registration that has left preparation ──────────────
  select id, status, submitted_at into v_existing
    from public.tenant_a2p_registrations where tenant_id = v_tenant;
  if found and (v_existing.submitted_at is not null
                or v_existing.status in ('submitted','in_review','approved')) then
    raise exception 'this registration has already been submitted and cannot be edited as a draft'
      using errcode = '42501';
  end if;

  -- ── the write. Campaign fields only; every provider- and submission-owned
  --    column is deliberately absent from both the INSERT and the UPDATE.
  insert into public.tenant_a2p_registrations
    (tenant_id, use_case, campaign_description, sample_messages, optin_flow, status)
  values (v_tenant, v_use, v_desc, v_samples, v_optin, 'pending')
  on conflict (tenant_id) do update
    set use_case             = excluded.use_case,
        campaign_description = excluded.campaign_description,
        sample_messages      = excluded.sample_messages,
        optin_flow           = excluded.optin_flow,
        status               = 'pending',
        updated_at           = now()
  returning id into v_id;

  -- ── provenance on the EXISTING audit seam. Shape only — never the draft text,
  --    never a sample message, never a provider payload or credential.
  insert into public.paige_audit_log (tenant_id, actor_user_id, actor_role, action, target_type, target_id, payload)
  values (v_tenant, v_uid,
          case when v_is_service then 'service_role' else 'tenant_staff' end,
          'a2p.draft.saved', 'tenant_a2p_registrations', v_id,
          jsonb_build_object('sample_count', v_count,
                             'has_description', (v_desc is not null),
                             'has_optin_flow', (v_optin is not null),
                             'resulting_state', 'prepared'));

  return jsonb_build_object('ok', true, 'registration_id', v_id, 'a2p', 'prepared', 'sample_count', v_count);
end;
$$;

comment on function public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid) is
  'Durably save a PREPARED A2P registration draft. Tenant is server-derived for JWT callers; '
  'a body tenant_id is honoured only for service-role callers. Never sets submitted_at/approved_at '
  'or any provider SID, so the canonical resolver reports it as prepared and never as submitted.';

revoke all on function public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid) from public, anon;
grant execute on function public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid)
  to authenticated, service_role;
