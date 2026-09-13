-- Paige Runtime Harness — Layer C · C5: the DEDICATED, guarded approve-transition for a held act.
--
-- WHY THIS EXISTS (owner directive: complete the event/safety fabric; the approval-executor is the one
-- remaining Layer-C build). A Layer-C act that a human must confirm lands at `approval_pending` in
-- `public.paige_act_executions` (engine.ts: a `confirm` effective lane, or a `high`-risk act clamped
-- auto→confirm). Today that row DEAD-ENDS: nothing advances it to execution on approval. C5 adds the
-- approval-executor; this migration is its one delicate piece.
--
-- THE C4 CONTRACT IS NOT WEAKENED. `approval_pending` is deliberately in the monotonic RPC's `_final`
-- set (migration 20270126000000) and in the C4 drift-guarded FINAL_OUTCOMES partition — so a re-drain of
-- a confirm-lane subscriber, which re-derives `approval_pending`, can never clobber an already-approved or
-- executed row. Naively removing `approval_pending` from `_final` would reopen exactly that clobber. So
-- instead of relaxing the partition, this adds a SINGLE sanctioned transition that the generic
-- `paige_record_act_execution` still refuses: `approval_pending → accepted_for_execution`. Once the row is
-- `accepted_for_execution` (an ADVANCEABLE state), the generic monotonic RPC drives the normal
-- accepted→executed|failed|ambiguous step. No `outcomes.ts` / `_final` / drift-guard change (they stay as
-- C4 locked them); this transition lives ONLY here.
--
-- CONCURRENCY IS SAFE (corrected reason, §39). An event whose acts are ALL held completes `done`
-- (approval_pending ∈ FINAL_OR_SETTLED → not in `reconcile_pending`), so nothing re-drives it. But a
-- MULTI-ACT event with a held act AND a sibling in an advanceable state (accepted/retrying/ambiguous) is
-- NOT `done`, and the sweeper DOES re-drive it — so this transition is NOT guaranteed to run with no
-- competing drain. It is safe anyway, for three reasons the engine already guarantees: (a) phase 4 skips
-- every native record and phase 5 is READ-CURRENT-FIRST — a re-derived `approval_pending` is never written
-- over an `accepted_for_execution`/`executed` row; (b) a confirm-lane act produces NO engine execute-plan,
-- so the drainer never double-dispatches this act; (c) the monotonic guard converges every writer on the
-- terminal outcome. The atomic guarded UPDATE below is the single-use redemption: a second call (this RPC
-- or any writer) finds outcome ≠ approval_pending and no-ops, returning the persisted row.
--
-- AUTHORITY (§9/§59). This function is SERVICE-ROLE ONLY (in-body `auth.uid() IS NULL` guard). It performs
-- a guarded STATE TRANSITION keyed on (event_id, act_id) — it is NOT the human-authority boundary and does
-- not gate on the passed approver (it records it for audit only). WHO MAY APPROVE is enforced UPSTREAM by
-- the `execute-approval` edge function's JWT checks (admin/coach + active member of the act's tenant, or
-- platform owner) BEFORE it calls this with a service-role client — exactly the pattern `execute-approval`
-- already uses for its comms send path (verify the JWT approver, then act via service role). Service role
-- already bypasses RLS, so a service-role-only transition adds no new human-reachable surface.

create or replace function public.paige_approve_act_execution(
  _event_id         uuid,
  _act_id           uuid,
  _approver_user_id uuid
) returns public.paige_act_executions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _row public.paige_act_executions;
begin
  -- Service-role only. The human-authority gate is the execute-approval JWT door (see header); a caller
  -- carrying a JWT is refused here so this can never be reached as an authenticated escalation path (§59).
  if auth.uid() is not null then
    raise exception 'ACT_APPROVE_FORBIDDEN: service role only' using errcode = '42501';
  end if;

  -- The single sanctioned transition, atomic + idempotent: advance ONLY from approval_pending. A row that
  -- has already moved (accepted_for_execution / executed / failed / cancelled) is left untouched.
  update public.paige_act_executions
     set outcome       = 'accepted_for_execution',
         detail        = coalesce(detail, '{}'::jsonb)
                           || jsonb_build_object('approved_by', _approver_user_id, 'approved_at', now()),
         dispatched_at = coalesce(dispatched_at, now())
   where event_id = _event_id
     and act_id   = _act_id
     and outcome  = 'approval_pending'
  returning * into _row;

  -- Idempotent no-op: the row was already past approval_pending (or does not exist). Hand back the
  -- persisted truth so the caller sees the real state and never blind re-dispatches.
  if _row.id is null then
    select * into _row from public.paige_act_executions
      where event_id = _event_id and act_id = _act_id;
  end if;

  return _row;
end $$;

revoke all on function public.paige_approve_act_execution(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.paige_approve_act_execution(uuid, uuid, uuid) to service_role;

comment on function public.paige_approve_act_execution(uuid, uuid, uuid) is
  'Layer C · C5 approval-executor: the SOLE sanctioned transition of a held act from approval_pending to '
  'accepted_for_execution. Service-role only; the human-authority gate is the execute-approval JWT door. '
  'Preserves the C4 monotonic guard (approval_pending stays final for the generic paige_record_act_execution '
  'so a re-drain cannot clobber); idempotent (a row past approval_pending is returned unchanged).';
