-- =============================================================================
-- The prepared A2P draft keeps ALL of its reviewed copy, and the editor can
-- reopen it.
--
-- 20261004010000 made the prepared draft durable and stopped it dying with the
-- HTTP response. An independent review of that exact head found the flow still
-- broken for three of the seven fields a human actually reviews.
--
-- WHAT WAS STILL LOST
--
-- comms-a2p-draft generates seven fields. Four had a home on
-- tenant_a2p_registrations (use_case, campaign_description, sample_messages,
-- optin_flow). The other three — the opt-in confirmation reply, the STOP reply
-- and the HELP reply — had none, so the save simply did not carry them. They
-- are the carrier-facing compliance replies; losing them silently is the same
-- defect the durable save was written to end, just narrower.
--
-- WHY COLUMNS RATHER THAN THE EXISTING FOLD
--
-- A2PTab's submit path worked around the missing columns by concatenating the
-- three into optin_flow behind labels ("STOP reply: ..."). That kept the text
-- alive but destroyed its structure, so nothing could reliably read it back:
-- re-opening the editor would mean parsing prose that a tenant is free to edit,
-- and re-saving would fold the same text into itself again. The fold existed
-- only because there was nowhere to put these values. Giving them a home
-- removes the workaround instead of building on it (§18 — one home per fact).
--
-- SAFE TO DO NOW, MEASURED RATHER THAN ASSUMED. public.tenant_a2p_registrations
-- holds ZERO rows on production, so no stored value needs re-parsing and no
-- reader can observe a change in what optin_flow contains. The columns are
-- nullable and additive; every existing caller keeps working untouched (§37).
-- =============================================================================

alter table public.tenant_a2p_registrations
  add column if not exists optin_message  text,
  add column if not exists optout_message text,
  add column if not exists help_message   text;

comment on column public.tenant_a2p_registrations.optin_message is
  'The confirmation SMS sent right after a client opts in. Reviewed by a human, carrier-facing.';
comment on column public.tenant_a2p_registrations.optout_message is
  'The reply sent when a client texts STOP. Reviewed by a human, carrier-facing.';
comment on column public.tenant_a2p_registrations.help_message is
  'The reply sent when a client texts HELP. Reviewed by a human, carrier-facing.';

-- ── the save seam now carries all seven reviewed fields ─────────────────────
-- The caller-scope enforcement, the FOR UPDATE, the immutability re-check inside
-- the DO UPDATE, the stable hints and the shape-only audit payload stay exactly as
-- 20261004010000 shipped them. An earlier revision of this header claimed
-- "everything else is unchanged" while silently tightening the sample truncation
-- from 1024 to 320 characters; independent review caught it and the 1024 is restored.
--
-- The three new parameters do NOT simply copy optin_flow's preserve-on-absent rule.
-- Absent (null) preserves, but an EMPTY STRING clears, because these are the only
-- fields a human is likely to need to DELETE — a wrong number in a STOP reply, bad
-- wording in a HELP reply — and collapsing "cleared" into "absent" made them
-- permanently un-clearable while reporting success.
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
  -- btrim only. nullif here would erase the difference between absent and cleared
  -- before the merge below can read it.
  v_desc       text := case when p_campaign_description is null then null else btrim(p_campaign_description) end;
  v_optin      text := case when p_optin_flow is null then null else btrim(p_optin_flow) end;
  -- ABSENT (null) preserves what is stored. EMPTY STRING clears it. Collapsing the two
  -- made these columns permanently un-clearable: an owner who deleted a wrong STOP or
  -- HELP reply was told the copy saved and watched the deleted text come back on the next
  -- read. That is the same lie as a fabricated status, applied to carrier-facing
  -- compliance text a business may be legally required to correct. `left(..., 320)` matches
  -- what both edge producers already enforce, so a service-role caller cannot store more
  -- than a tenant can.
  v_optin_msg  text := case when p_optin_message  is null then null
                            else left(btrim(p_optin_message), 320) end;
  v_optout_msg text := case when p_optout_message is null then null
                            else left(btrim(p_optout_message), 320) end;
  v_help_msg   text := case when p_help_message   is null then null
                            else left(btrim(p_help_message), 320) end;
begin
  -- ── caller identity (§59 — the grant is never the guard) ─────────────────
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

  select * into v_existing
    from public.tenant_a2p_registrations where tenant_id = v_tenant
    for update;
  if found and public.a2p_registration_is_immutable(v_existing) then
    raise exception 'this registration has left preparation and cannot be edited as a draft'
      using errcode = '42501', hint = 'REGISTRATION_IMMUTABLE';
  end if;

  -- Resolve absent / cleared / replaced HERE, against the row we are holding a lock on,
  -- rather than in the DO UPDATE. Doing it through `excluded` cannot work: the INSERT's
  -- own VALUES are what `excluded` exposes, so normalising '' to NULL there erased the
  -- difference between "cleared" and "absent" before the conflict branch could read it —
  -- the exact bug this case was written to catch, reintroduced one layer down.
  -- The same rule for the two OLDER optional fields. They inherited preserve-on-absent
  -- from 20261004010000, which was invisible while nothing could reopen a draft; now that
  -- the editor rehydrates, leaving them un-clearable while the three replies clear would
  -- be a trap with no rule a person could learn. use_case is untouched: it is required,
  -- so there is no "cleared" state to express.
  v_desc  := case when p_campaign_description is null then v_existing.campaign_description
                  when v_desc  = '' then null else v_desc  end;
  v_optin := case when p_optin_flow is null then v_existing.optin_flow
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
        -- Already resolved above against the locked row: absent kept, '' cleared.
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

  -- Shape only. The three new fields are reported as booleans for the same reason
  -- the others are: the audit trail records that reviewed copy exists, never what
  -- it says.
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

comment on function public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid,text,text,text) is
  'Durably save a PREPARED A2P registration draft, including the three carrier-facing '
  'reply messages. Tenant is server-derived for JWT callers; a body tenant_id is honoured '
  'only for service-role callers. Never sets submitted_at/approved_at or any provider SID.';

-- The 5-argument signature is REPLACED, not left beside the new one. Two overloads
-- would make `rpc(...)` ambiguous for PostgREST and let a caller silently reach the
-- version that drops three fields — the exact defect being closed here.
drop function if exists public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid);

revoke all on function public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid,text,text,text) from public, anon;
grant execute on function public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid,text,text,text)
  to authenticated, service_role;
