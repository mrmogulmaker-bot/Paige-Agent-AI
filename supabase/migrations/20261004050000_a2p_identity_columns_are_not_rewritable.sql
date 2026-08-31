-- =============================================================================
-- The filed registration's IDENTITY cannot be rewritten either.
--
-- 20261004040000 froze the seven draft columns once a registration has left
-- preparation, on top of 030000's eight submission-owned columns. That is 15 of
-- the table's 19 columns. The remaining four — id, tenant_id, created_at,
-- updated_at — were in neither list, and 040000's own header claims the copy of
-- record "cannot diverge from what was filed".
--
-- An independent review PROVED two of them writable, by executing it: as
-- `authenticated`, on a row at status='approved' with a brand_sid,
--
--     update public.tenant_a2p_registrations
--        set id = '3333...', created_at = '1999-01-01' where tenant_id = <own>;
--     UPDATE 1
--
-- succeeded. Rewriting `id` ORPHANS the paige_audit_log.target_id link that
-- 20261004010000 exists to create — on the exact row the header says cannot be
-- altered. Rewriting created_at backdates the filed record.
--
-- The other two need no clause here and are deliberately left alone:
--   • tenant_id  — already covered by the update policy's WITH CHECK, which
--     refuses a NULL or foreign value. A second check would be redundant, and a
--     redundant guard reads as protection that is actually somewhere else.
--   • updated_at — machine-written by trg_tenant_a2p_registrations_updated_at,
--     which fires AFTER this guard (BEFORE triggers run in name order, and
--     `trg_a2p_...` sorts first). Freezing it would fight our own trigger.
--
-- SCOPE: id and created_at are frozen for a direct caller at ALL times, not only
-- past preparation. There is no legitimate reason for a client to renumber a row
-- or restate when it was created, at any stage — unlike the draft columns, whose
-- whole purpose is to be edited while pending. Governed callers are unaffected.
--
-- A NEW FILE. 20261004040000 is already recorded on the preview branch, and
-- Supabase preview pushes only NEW migration files — editing a recorded one
-- leaves the preview database on the old version behind a green badge.
-- =============================================================================

create or replace function public.a2p_registration_guard_submission_state()
returns trigger
language plpgsql
-- INVOKER is the entire mechanism: DEFINER would reset current_user to the
-- function's owner, every caller would read as governed, and the guard would
-- allow everything. Two earlier revisions were toothless for exactly that
-- reason. Do not change this word.
security invoker
set search_path = public
as $$
declare
  v_governed boolean;
begin
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

  -- ── NEW: identity is never client-rewritable, at any stage ───────────────
  -- Checked FIRST, so renumbering a row cannot be masked by whichever other
  -- clause happens to fire, and so the hint names what was actually refused.
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception
      'a registration''s identity and creation time are not client-writable'
      using errcode = '42501', hint = 'IDENTITY_PROTECTED';
  end if;

  -- ── submission-owned columns (030000) ───────────────────────────────────
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

  -- ── draft columns freeze once preparation is over (040000) ──────────────
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
  'Fails closed for every direct caller on tenant_a2p_registrations: identity (id, created_at) at '
  'all times; the eight submission-owned columns at all times; and the seven draft columns once '
  'a2p_registration_is_immutable(old) — the same predicate the save RPC enforces. tenant_id is '
  'covered by the update policy''s WITH CHECK and updated_at by its own BEFORE trigger, so neither '
  'is restated here. Only server-side authority (a SECURITY DEFINER seam running as the table '
  'owner, or service_role) may move any of them. A pending draft stays freely editable.';
