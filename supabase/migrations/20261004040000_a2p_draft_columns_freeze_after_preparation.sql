-- =============================================================================
-- The draft columns freeze once a registration leaves preparation.
--
-- 20261004030000 made the eight SUBMISSION-owned columns server-owned: a direct
-- caller can no longer set submitted_at, approved_at, status, brand_status,
-- campaign_status, or any provider SID. That closed the forgery path.
--
-- It left the other half open, and said so in writing: its own header lists
-- use_case, campaign_description, sample_messages, optin_flow, optin_message,
-- optout_message and help_message as "deliberately still editable by a tenant
-- admin or coach" — UNCONDITIONALLY. The UPDATE branch never consults
-- a2p_registration_is_immutable(old).
--
-- THE HOLE THAT LEAVES. A registration reaches status='approved' with a
-- brand_sid, which is exactly what the future service-role submission path will
-- produce. A tenant admin then sends a direct
--     PATCH /rest/v1/tenant_a2p_registrations?tenant_id=eq.<their own>
--     {"sample_messages": [...], "optout_message": "..."}
-- `authenticated` holds the table grant, the row-scoped update policy admits it
-- because the row is theirs, and the guard sees no change in any of its eight
-- columns — so it is ALLOWED. The carrier-approved copy of record then silently
-- diverges from what was actually filed, while the tab tells the owner "It has
-- moved past preparation, so its copy is locked" — a sentence that was only ever
-- true of the RPC path.
--
-- The RPC has always refused this (REGISTRATION_IMMUTABLE, and it re-checks in
-- the WHERE of its DO UPDATE). The direct path is the one that never did. Since
-- 030000 is the change that decided IN WRITING which columns a direct caller may
-- move, the omission belongs to it and is corrected here.
--
-- WHY A NEW FILE. 20261004030000 is already recorded on the preview branch.
-- Supabase preview pushes only NEW migration files, so editing a recorded one
-- leaves the preview database on the old version behind a green badge — measured
-- twice on this branch. Never again: this is a forward migration.
--
-- The predicate is the SAME `a2p_registration_is_immutable` the RPC uses, so the
-- two paths cannot drift into different opinions about what "left preparation"
-- means (§57 — one record, one answer).
-- =============================================================================

create or replace function public.a2p_registration_guard_submission_state()
returns trigger
language plpgsql
-- INVOKER, not DEFINER, and this is the entire mechanism rather than a detail:
-- DEFINER resets current_user to the function's owner, so every caller would read
-- as governed and the guard would allow everything. Two earlier revisions were
-- toothless for exactly that reason (one DEFINER, one allow-listing session_user,
-- which stays postgres/authenticator under PostgREST). Do not change this word.
security invoker
set search_path = public
as $$
declare
  v_governed boolean;
begin
  -- current_user, never session_user. Under PostgREST session_user remains the
  -- connection role while current_user is the role the request actually runs as.
  v_governed := current_user in ('postgres', 'supabase_admin', 'service_role');
  if v_governed then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.submitted_at is not null
       or new.approved_at is not null
       or coalesce(new.status, 'pending')          is distinct from 'pending'
       or coalesce(new.brand_status, 'pending')    is distinct from 'pending'
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

  -- ── submission-owned columns: unchanged from 030000 ──────────────────────
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

  -- ── NEW: the draft columns freeze once the row has left preparation ──────
  -- Keyed on OLD, so the question is "has this registration already left
  -- preparation", never "is this write trying to move it" — that second question
  -- is the block above. A row still pending stays freely editable, which is the
  -- whole point of a draft.
  if public.a2p_registration_is_immutable(old)
     and (new.use_case             is distinct from old.use_case
       or new.campaign_description is distinct from old.campaign_description
       or new.sample_messages      is distinct from old.sample_messages
       or new.optin_flow           is distinct from old.optin_flow
       or new.optin_message        is distinct from old.optin_message
       or new.optout_message       is distinct from old.optout_message
       or new.help_message         is distinct from old.help_message) then
    raise exception
      'this registration has left preparation and its copy cannot be edited from a direct client write'
      using errcode = '42501', hint = 'REGISTRATION_IMMUTABLE';
  end if;

  return new;
end;
$$;

comment on function public.a2p_registration_guard_submission_state() is
  'Fails closed for every direct caller on the eight submission-owned columns of '
  'tenant_a2p_registrations, and additionally freezes the seven draft columns once '
  'a2p_registration_is_immutable(old) — the same predicate the save RPC enforces — so a '
  'carrier-filed registration''s copy of record cannot diverge from what was filed. Only '
  'server-side authority (a SECURITY DEFINER seam running as the table owner, or '
  'service_role) may move any of them. A pending draft stays freely editable.';

-- The trigger itself is unchanged and already attached by 20261004030000;
-- `create or replace function` re-points it with no DDL on the table. Re-asserting
-- it here would be a no-op at best and a chance to get the ordering wrong at worst.
