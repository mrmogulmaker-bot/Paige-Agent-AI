-- =============================================================================
-- Submission-owned state on tenant_a2p_registrations becomes server-owned, and
-- the draft save stops losing a concurrent first write.
--
-- A NEW forward migration, deliberately. 20261004020000 is already recorded on the
-- preview branch, and Supabase pushes only NEW migration files — editing it in
-- place produced a green badge over a database still running the old function.
-- Everything below therefore ships as its own version so preview actually applies
-- and proves it.
--
-- ── 1. WHY A GUARD AT ALL ───────────────────────────────────────────────────
--
-- Independent review demonstrated it: `tenant_a2p_registrations_update` is
-- row-scoped (own tenant AND admin/coach) with NO column restriction, so a tenant
-- admin can reach PostgREST directly and set submitted_at, a brand SID and
-- status='submitted' on a registration nothing was ever sent for. The surface then
-- renders "Submitted for review — you'll be notified the moment it's approved."
--
-- `tenant_a2p_registrations_insert` has the identical shape, so a row can also be
-- CREATED already carrying that state. Both paths are closed here.
--
-- That is the fabricated-status class the whole A2P slice exists to remove, and
-- until now the honesty of the surface rested on no shipped code path doing it
-- rather than on the database refusing. There is no governed carrier-submission
-- path yet, so every direct caller now fails closed for submission-owned state; a
-- real submission flow will move these fields through server-side authority.
--
-- ── 2. WHAT IS PROTECTED, GROUNDED FROM THE LIVE SCHEMA ─────────────────────
--
--   submitted_at · approved_at · status · brand_status · campaign_status ·
--   brand_sid · campaign_sid · messaging_service_sid
--
-- Draft-owned and deliberately still editable by a tenant admin or coach:
--   use_case · campaign_description · sample_messages · optin_flow ·
--   optin_message · optout_message · help_message
--
-- ── 3. WHY A TRIGGER RATHER THAN COLUMN PRIVILEGES ──────────────────────────
--
-- `REVOKE UPDATE (col)` is the tempting native answer and it does not work here:
-- the role already holds a TABLE-level UPDATE grant, which covers every column, so
-- a per-column revoke is silently ineffective unless the table grant is dropped and
-- an explicit allow-list re-granted. Rebuilding that list risks breaking a writer
-- nobody enumerated — `updated_at`, written by an invoker-side trigger, is exactly
-- the kind that gets missed. A trigger is unambiguous, raises a stable code, and
-- fails closed by ROLE, so a tenant-facing role added later is denied by default
-- rather than by somebody remembering to extend a grant list.
-- =============================================================================

create or replace function public.a2p_registration_guard_submission_state()
returns trigger
language plpgsql
-- SECURITY INVOKER, and that is the whole mechanism. A DEFINER trigger would run as its
-- OWNER, so current_user would read 'postgres' for every caller and the guard would allow
-- everything — which is exactly what happened in the first draft, caught by watching a
-- forged submitted_at sail through the proof. As INVOKER, current_user is the effective
-- role of whoever is writing: 'authenticated'/'anon' for a direct PostgREST client, and
-- the function owner when the write arrives inside the SECURITY DEFINER save seam.
security invoker
set search_path = public
as $$
declare
  v_governed boolean;
begin
  -- FAIL CLOSED BY ROLE. Allow-list, never a deny-list: only genuine server-side
  -- authority may move submission state. A SECURITY DEFINER seam runs as the table
  -- owner, so current_user is the owner there; PostgREST callers arrive as
  -- 'authenticated' or 'anon' and are refused. is_platform_owner() is deliberately
  -- NOT an exemption — an operator using PostgREST directly is still a direct
  -- caller, and the rule is that no direct path may fabricate submission state.
  -- current_user ONLY. session_user is the CONNECTION identity and stays 'authenticator'
  -- (or 'postgres' in a psql session) no matter which role PostgREST switches into, so
  -- including it made the guard toothless for every caller in a superuser session — the
  -- proof caught exactly that by watching a forged submitted_at succeed. current_user is
  -- the EFFECTIVE role: 'authenticated'/'anon' for a direct client, the function owner
  -- inside a SECURITY DEFINER seam, 'service_role' for the service key. That is precisely
  -- the distinction this guard needs to make.
  v_governed := current_user in ('postgres', 'supabase_admin', 'service_role');
  if v_governed then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A row may be BORN prepared and nothing else. Same defect as the update path:
    -- the insert policy constrains tenant and role, never columns.
    if new.submitted_at is not null
       or new.approved_at is not null
       or coalesce(new.status, 'pending') is distinct from 'pending'
       or coalesce(new.brand_status, 'pending') is distinct from 'pending'
       or coalesce(new.campaign_status, 'pending') is distinct from 'pending'
       or new.brand_sid is not null
       or new.campaign_sid is not null
       or new.messaging_service_sid is not null then
      raise exception
        'submission state is server-owned: a registration cannot be created already submitted, approved or carrier-linked'
        using errcode = '42501', hint = 'SUBMISSION_STATE_PROTECTED';
    end if;
    return new;
  end if;

  if new.submitted_at    is distinct from old.submitted_at
     or new.approved_at  is distinct from old.approved_at
     or new.status       is distinct from old.status
     or new.brand_status is distinct from old.brand_status
     or new.campaign_status is distinct from old.campaign_status
     or new.brand_sid    is distinct from old.brand_sid
     or new.campaign_sid is distinct from old.campaign_sid
     or new.messaging_service_sid is distinct from old.messaging_service_sid then
    raise exception
      'submission state is server-owned and cannot be set from a direct client write'
      using errcode = '42501', hint = 'SUBMISSION_STATE_PROTECTED';
  end if;

  return new;
end;
$$;

comment on function public.a2p_registration_guard_submission_state() is
  'Fails closed for every direct caller on the eight submission-owned columns of '
  'tenant_a2p_registrations. Only server-side authority (a SECURITY DEFINER seam running as '
  'the table owner, or service_role) may move them. Draft copy stays freely editable.';

drop trigger if exists trg_a2p_registration_guard_submission_state on public.tenant_a2p_registrations;
create trigger trg_a2p_registration_guard_submission_state
  before insert or update on public.tenant_a2p_registrations
  for each row execute function public.a2p_registration_guard_submission_state();

revoke all on function public.a2p_registration_guard_submission_state() from public, anon;

-- =============================================================================
-- 4. THE DRAFT SAVE STOPS LOSING A CONCURRENT FIRST WRITE
--
-- 20261004020000 moved the absent/cleared/replaced merge out of `excluded` and into
-- procedural code reading v_existing, and its comment claimed that ran "against the
-- row we are holding a lock on". True once a row exists — and false on the very
-- first save, because SELECT ... FOR UPDATE on ZERO rows takes no lock. Two
-- concurrent first saves therefore both resolve "absent" against an empty
-- v_existing, and the loser's ON CONFLICT DO UPDATE writes its NULLs over the
-- winner's committed values, reporting {"ok": true}. Demonstrated with two real
-- sessions by independent review.
--
-- A transaction-scoped advisory lock keyed on the tenant closes the gap: it exists
-- whether or not a row does, so the read below is authoritative in both cases.
-- Everything else in this function is carried over unchanged from 20261004020000,
-- except campaign_description, which becomes preserve-only (see below).
-- =============================================================================
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
    if not (public.is_platform_owner()
            or public.has_any_role(v_uid, array['admin','coach'])) then
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
