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
--
-- WHAT AN INDEPENDENT REVIEW CHANGED HERE. The first version of this function was
-- concurrency-unsafe and could destroy a live registration:
--
--   · The immutability check was a bare SELECT with no row lock, and the upsert's
--     DO UPDATE carried no WHERE. Two concurrent sessions were demonstrated
--     overwriting an APPROVED, carrier-linked registration, downgrading it
--     approved -> pending while leaving approved_at and brand_sid set, and the
--     audit row still recorded 'prepared'. The read now takes FOR UPDATE and the
--     DO UPDATE re-checks immutability in its own WHERE, so the guard is part of
--     the write rather than a hopeful precondition.
--   · Immutability was keyed on submitted_at/status alone. `comms-a2p-submit`
--     writes status='pending' with submitted_at=null today (its carrier calls are
--     stubs), so that guard could never fire against the real submit path and a
--     re-draft silently replaced copy a human had reviewed. It is now keyed on
--     ANY evidence the registration has left preparation, including a provider SID
--     and the per-leg brand/campaign statuses.
--   · An empty description or opt-in flow NULLed the stored value while reporting
--     success. Absent fields now preserve what is already there.
--   · Service-role detection read auth.role() only, which is null on a direct
--     service_role database session. It now matches the repository precedent
--     (_marketplace_is_service_role) exactly: the request claim OR a real
--     service_role session, so both legitimate callers are recognised.
--
-- Every refusal carries a STABLE hint so callers can branch on a code rather than
-- parse a sentence.
-- =============================================================================

-- Has this registration left preparation? Any one of these means a human or a
-- carrier has acted on it and a draft save must not touch it.
create or replace function public.a2p_registration_is_immutable(r public.tenant_a2p_registrations)
returns boolean
language sql
immutable
as $$
  select r.submitted_at is not null
      or r.approved_at is not null
      or r.status in ('submitted','in_review','approved','rejected','suspended')
      or r.brand_sid is not null
      or r.campaign_sid is not null
      or r.messaging_service_sid is not null
      or r.brand_status is distinct from 'pending'
      or r.campaign_status is distinct from 'pending';
$$;

comment on function public.a2p_registration_is_immutable(public.tenant_a2p_registrations) is
  'True when a registration has left preparation — submitted, approved, rejected, suspended, or '
  'carrier-linked by any provider SID or advanced per-leg status. A draft save must refuse these.';

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
  v_existing   public.tenant_a2p_registrations%rowtype;
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
  -- Byte-for-byte the repository precedent (_marketplace_is_service_role): the
  -- request claim OR a genuine service_role database session.
  --
  -- Stated precisely, because an earlier draft of this comment overclaimed: the
  -- claim ALONE is sufficient here. That is safe in the path this function is
  -- reached through — PostgREST populates request.jwt.claims from a JWT it has
  -- already verified, so a caller cannot assert `service_role` without holding a
  -- service_role key. The session_user arm is not a second factor; it covers the
  -- other legitimate caller, a direct service_role database session, where no
  -- request claim exists at all. Neither arm is a self-report the caller invented.
  v_is_service := (v_uid is null
                   and (coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
                        or session_user = 'service_role'));
  if v_uid is null and not v_is_service then
    raise exception 'authentication required' using errcode = '42501', hint = 'UNAUTHENTICATED';
  end if;

  if v_uid is not null then
    -- ── JWT caller: the tenant is SERVER-DERIVED. A body p_tenant_id is ignored,
    --    exactly as comms-a2p-draft already documents, so naming another tenant
    --    can never redirect the write (§9).
    v_tenant := public.current_user_tenant_id();
    if v_tenant is null then
      raise exception 'no tenant resolved for this account' using errcode = '42501', hint = 'NO_TENANT';
    end if;
    -- Capability: the same authority comms-a2p-draft enforces. `has_any_role` reads
    -- the tenant-agnostic user_roles table, which is safe ONLY because the tenant
    -- above is derived from the caller's own session and never supplied (§53 trap).
    if not (public.is_platform_owner()
            or public.has_any_role(v_uid, array['admin','coach'])) then
      raise exception 'admin or coach access required to prepare a registration'
        using errcode = '42501', hint = 'FORBIDDEN';
    end if;
  else
    -- ── service-role caller (Paige headless, §10): must name the tenant.
    if p_tenant_id is null then
      raise exception 'p_tenant_id is required for a service-role caller'
        using errcode = '22023', hint = 'TENANT_REQUIRED';
    end if;
    if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
      raise exception 'unknown tenant' using errcode = '42501', hint = 'UNKNOWN_TENANT';
    end if;
    v_tenant := p_tenant_id;
  end if;

  -- ── legal identity is READ, never copied ──────────────────────────────────
  select nullif(btrim(lp.legal_business_name), '') into v_legal
    from public.tenant_legal_profile lp where lp.tenant_id = v_tenant;
  if v_legal is null then
    -- The requirement is real: carriers register a legal entity, not a nickname.
    -- The caller gets a STABLE code so the surface can name the missing record and
    -- route the owner to the business profile that owns it, instead of failing mutely.
    raise exception 'a legal business name is required before a registration can be prepared'
      using errcode = '23514', hint = 'LEGAL_PROFILE_REQUIRED';
  end if;

  -- ── validation ────────────────────────────────────────────────────────────
  if v_use is null then
    raise exception 'a use case is required' using errcode = '23514', hint = 'USE_CASE_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_sample_messages, '[]'::jsonb)) <> 'array' then
    raise exception 'sample_messages must be a JSON array' using errcode = '22023', hint = 'SAMPLES_INVALID';
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
    raise exception 'at least two sample messages are required' using errcode = '23514', hint = 'SAMPLES_REQUIRED';
  end if;

  -- ── never overwrite a registration that has left preparation ──────────────
  -- FOR UPDATE: without it this read was a precondition another session could
  -- invalidate before the write landed, which is exactly how an approved,
  -- carrier-linked registration was demonstrated being downgraded to pending.
  select * into v_existing
    from public.tenant_a2p_registrations where tenant_id = v_tenant
    for update;
  if found and public.a2p_registration_is_immutable(v_existing) then
    raise exception 'this registration has left preparation and cannot be edited as a draft'
      using errcode = '42501', hint = 'REGISTRATION_IMMUTABLE';
  end if;

  -- ── the write. Campaign fields only; every provider- and submission-owned
  --    column is deliberately absent from both the INSERT and the UPDATE.
  -- The WHERE on DO UPDATE re-checks immutability AS PART OF THE WRITE, so a row
  -- that became immutable between the locking read and here is refused rather than
  -- clobbered. An absent description or opt-in flow PRESERVES the stored value —
  -- blanking a field while returning success was its own defect.
  insert into public.tenant_a2p_registrations
    (tenant_id, use_case, campaign_description, sample_messages, optin_flow, status)
  values (v_tenant, v_use, v_desc, v_samples, v_optin, 'pending')
  on conflict (tenant_id) do update
    set use_case             = coalesce(excluded.use_case, tenant_a2p_registrations.use_case),
        campaign_description = coalesce(excluded.campaign_description, tenant_a2p_registrations.campaign_description),
        sample_messages      = excluded.sample_messages,
        optin_flow           = coalesce(excluded.optin_flow, tenant_a2p_registrations.optin_flow),
        status               = 'pending',
        updated_at           = now()
    where not public.a2p_registration_is_immutable(tenant_a2p_registrations.*)
  returning id into v_id;

  if v_id is null then
    raise exception 'this registration has left preparation and cannot be edited as a draft'
      using errcode = '42501', hint = 'REGISTRATION_IMMUTABLE';
  end if;

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
