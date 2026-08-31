-- =============================================================================
-- `tenant_id` joins the identity freeze. The reason it was left out was WRONG.
--
-- 20261004050000 froze `id` and `created_at` and deliberately omitted `tenant_id`,
-- with this justification written into its header, its function comment, AND
-- docs/brain/comms-capability-map.md:
--
--     "already covered by the update policy's WITH CHECK, which refuses a NULL
--      or foreign value. A second check would be redundant."
--
-- That is true of a tenant admin and FALSE of a platform operator. The policy's
-- WITH CHECK is
--
--     is_platform_owner() OR (tenant_id = current_user_tenant_id() AND has_any_role(...))
--
-- and the first branch SHORT-CIRCUITS TO TRUE without ever looking at tenant_id.
-- A platform operator over PostgREST runs as `authenticated`, so the trigger's
-- governed allow-list does not exempt them either — they are a direct caller by
-- this guard's own definition, which is exactly why 050000 freezes id and
-- created_at against them.
--
-- An independent review MEASURED all four cases rather than arguing them:
--     tenant admin  -> tenant_id = NULL            : refused by RLS
--     tenant admin  -> foreign tenant              : refused by RLS
--     PLATFORM OWNER -> tenant_id = NULL           : ALLOWED
--     PLATFORM OWNER -> foreign tenant             : ALLOWED
--
-- WHAT THAT COSTS. Reassigning a carrier-approved registration moves a live
-- `messaging_service_sid` — which `send-message` resolves BY tenant_id — onto a
-- different business. NULLing it makes the owning tenant read "Not registered
-- yet" and be invited into a paid re-draft over compliance copy that was already
-- reviewed and filed. Neither writes a paige_audit_log row, because no seam ran.
--
-- The tier matrix already claims this guard family binds "at every tier,
-- INCLUDING a platform operator using PostgREST". This makes that true of the
-- column the claim was least true of.
--
-- WHY THE GUARD AND NOT THE POLICY. Tightening the policy's owner branch would
-- change what an operator may do to every row and every column on this table, a
-- far wider blast radius than the one defect. The guard already draws the line
-- this needs — governed seam vs direct caller — so tenant_id joins the two
-- columns beside it and the operator keeps every legitimate read and write.
--
-- A NEW FILE: 20261004050000 is already recorded on the preview branch.
-- =============================================================================

create or replace function public.a2p_registration_guard_submission_state()
returns trigger
language plpgsql
-- INVOKER is the mechanism. DEFINER would resolve current_user to the owner,
-- every caller would read as governed, and the guard would allow everything.
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

  -- ── identity, at every stage and for every direct caller ────────────────
  -- `tenant_id` is here now, not delegated to the update policy: that policy's
  -- owner branch short-circuits before it reads the column, so delegation left
  -- the operator able to reassign or null it. Checked first so the hint names
  -- what was actually refused.
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.tenant_id is distinct from old.tenant_id then
    raise exception
      'a registration''s identity, owner and creation time are not client-writable'
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
  'Fails closed for every direct caller on tenant_a2p_registrations — a platform operator over '
  'PostgREST included, since they run as `authenticated` and are not in the governed allow-list. '
  'Identity (id, tenant_id, created_at) at all times; the eight submission-owned columns at all '
  'times; the seven draft columns once a2p_registration_is_immutable(old), the same predicate the '
  'save RPC enforces. `updated_at` is written by its own BEFORE trigger, which fires after this '
  'one, so it is deliberately not restated. Only server-side authority (a SECURITY DEFINER seam '
  'running as the table owner, or service_role) may move any of them. A pending draft stays '
  'freely editable.';
