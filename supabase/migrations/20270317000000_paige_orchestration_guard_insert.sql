-- Paige Runtime Harness — Layer C · C5 slice 2 follow-up (#15): extend the orchestration direct-approve
-- guard to the INSERT path.
--
-- WHY THIS EXISTS (owner directive, 2026-09-13). The fix-forward guard (20270306000000) closed the
-- direct-approve UPDATE bypass for a source='paige_orchestration' row: a JWT/browser caller can no longer
-- flip an orchestration companion to status='approved', and even the service-role path must prove the
-- canonical paige_act_executions ledger is terminal. But that guard is a BEFORE UPDATE trigger only, so an
-- INSERT that CREATES an orchestration row ALREADY at status='approved' slips past it entirely. The owner
-- ruled this INSERT protection into #15: "authenticated callers must be blocked from both creating an
-- already-approved orchestration record and transitioning one to approved outside execute-approval."
--
-- NARROW SCOPE (§13 — do NOT overclaim). This closes the orchestration INSERT approve path, matching the
-- existing UPDATE gate. It does NOT make the database globally reject every direct approval write: a
-- NON-orchestration approval (source <> 'paige_orchestration') is untouched by this guard on BOTH INSERT
-- and UPDATE (it fast-returns), and the broader table-wide approvals-RLS weakness (the permissive write
-- policy gates on the tenant-agnostic has_any_role; a NULL-tenant row is writable by any global admin — the
-- §59 global-role trap) is the SEPARATE, owner-decided next Orchestration security slice, deliberately NOT
-- rewritten here. This guard is the orchestration-specific defense in depth behind execute-approval, not a
-- substitute for that correct RLS.
--
-- §37 PRODUCER INVENTORY (INSERT-contract tightening — the guard fires ONLY when
-- source='paige_orchestration' AND status='approved' on INSERT). Every INSERT producer of
-- paige_pending_approvals writes status='pending' and a non-orchestration source: src/lib/approvals.ts
-- (createApproval, status pending), paige-mcp/index.ts (:990 source=mcp pending; :837 requires_approval
-- pending), subagent-forge/index.ts (:363 pending), and the mint/backfill in 20270303000000 /
-- 20270306000000 (status pending). The ONLY writer of source='paige_orchestration' is the DB mint trigger
-- paige_mint_orchestration_approval, which always inserts status='pending'. So NO legitimate producer
-- inserts an orchestration row at status='approved' — this branch cannot 4xx a real caller.
--
-- APPROACH (§18/§12 — extend in place, do not fork). CREATE OR REPLACE the SAME guard function
-- (paige_guard_orchestration_direct_approve), made tg_op-aware: a new INSERT branch is added, and the
-- existing 20270306000000 UPDATE logic is preserved BYTE-FOR-BYTE under `if tg_op = 'UPDATE'` (it
-- references OLD, which is NULL on INSERT, so it must be UPDATE-guarded). The guard TRIGGER is re-created
-- from BEFORE UPDATE to BEFORE INSERT OR UPDATE. Additive: alters no table, creates no new table/column/
-- index/function. Forward-cleanup (recovery) is: CREATE OR REPLACE the function back to its 20270306000000
-- body (drop the tg_op branch) and restore the trigger to BEFORE UPDATE — a git revert does not reverse
-- applied SQL.

create or replace function public.paige_guard_orchestration_direct_approve()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _resolved boolean;
begin
  -- ── INSERT branch (#15): block CREATING a source='paige_orchestration' row already at status='approved'. ──
  -- A JWT/browser caller may NEVER create an already-approved orchestration record (the create twin of the
  -- UPDATE bypass). The service role has no legitimate reason to insert one either — the mint always writes
  -- status='pending' — so, mirroring the UPDATE gate's defense in depth (§13/§70), a service-role INSERT of an
  -- approved orchestration row is admitted ONLY if the canonical paige_act_executions ledger for (event_id,
  -- act_id) is already terminal (executed|failed). Non-orchestration and non-approved inserts fast-return.
  if tg_op = 'INSERT' then
    if coalesce(new.source, '') = 'paige_orchestration' and new.status = 'approved' then
      if auth.uid() is not null then
        raise exception
          'ORCH_APPROVAL_MUST_EXECUTE: a paige_orchestration approval cannot be CREATED already-approved by a '
          'direct write — it is driven only by the Layer-C approval-executor (execute-approval), which mints it '
          'pending and drives the held act before approving'
          using errcode = '42501';
      end if;
      -- service-role: prove the state from the CANONICAL LEDGER (never a client-supplied field).
      select exists (
        select 1 from public.paige_act_executions ae
         where ae.event_id = nullif(new.metadata->>'event_id', '')::uuid
           and ae.act_id   = nullif(new.metadata->>'act_id', '')::uuid
           and ae.outcome in ('executed', 'failed')
      ) into _resolved;
      if not coalesce(_resolved, false) then
        raise exception
          'ORCH_APPROVAL_LEDGER_NOT_RESOLVED: a paige_orchestration approval cannot be created approved while '
          'the held Layer-C act has not reached a terminal ledger outcome (executed|failed)'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- ── UPDATE branch: the 20270306000000 logic, unchanged. ──────────────────────────────────────────────────
  -- Pin the classification (Codex re-review P1): a STORED paige_orchestration approval can never be reclassified
  -- by an UPDATE. Without this, a caller could launder the row to another source — either in the SAME statement
  -- as status='approved' (so a new.source-based gate would skip the check) or in a source-only UPDATE first —
  -- and then flip it approved while the held act is still approval_pending. Refuse any source rewrite of an
  -- orchestration row, for ANY caller (the executor/reconciler never change source, so this never blocks them).
  if coalesce(old.source, '') = 'paige_orchestration' and new.source is distinct from old.source then
    raise exception
      'ORCH_APPROVAL_SOURCE_IMMUTABLE: a paige_orchestration approval''s source cannot be rewritten — doing so '
      'would launder the row past the executor-only approve gate'
      using errcode = '42501';
  end if;
  -- Gate on the STORED source (old.source), NEVER the mutable new.source: a combined UPDATE cannot flip source
  -- in the same statement to dodge the check, and (with the pin above) a source-only update cannot pre-launder it.
  if coalesce(old.source, '') <> 'paige_orchestration' then return new; end if;
  -- Pin the ledger COORDINATES (Codex re-review P1): metadata.event_id/act_id (+act_execution_id) bind this
  -- companion to its held act and are the keys BOTH this cross-check AND execute-approval resolve
  -- (execute-approval/index.ts reads metadata.event_id/act_id). They live in a browser-writable jsonb column and
  -- the broadened trigger permits a metadata-ONLY update (status unchanged, so the approve-gate below never
  -- fires). Without this, a same-tenant admin could repoint a pending companion at an ALREADY-terminal act, then
  -- drive execute-approval to stamp it approved off that unrelated terminal result while the real held act stays
  -- approval_pending. Refuse any change to the coordinates. Legitimate writers (execute-approval, reconciler)
  -- SPREAD the existing metadata, so they preserve these keys and never trip this.
  if coalesce(new.metadata->>'event_id', '')        is distinct from coalesce(old.metadata->>'event_id', '')
    or coalesce(new.metadata->>'act_id', '')          is distinct from coalesce(old.metadata->>'act_id', '')
    or coalesce(new.metadata->>'act_execution_id', '') is distinct from coalesce(old.metadata->>'act_execution_id', '')
  then
    raise exception
      'ORCH_APPROVAL_COORDS_IMMUTABLE: a paige_orchestration approval''s ledger coordinates '
      '(metadata.event_id/act_id/act_execution_id) cannot be rewritten — repointing them would drive '
      'execute-approval to approve off an unrelated act while the real held act stays approval_pending'
      using errcode = '42501';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    -- (a) The ONLY sanctioned approver is the SERVICE-ROLE Layer-C executor/reconciler (auth.uid() IS NULL):
    --     execute-approval stamps the approval with the service-role client (verified). A JWT/browser caller may
    --     NEVER flip a paige_orchestration approval to approved — this closes the client-writable bypass where a
    --     same-tenant admin sets status='approved' + a forged metadata.act_outcome directly (the permissive
    --     approvals RLS admits a same-tenant admin write; tenant_isolation only blocks CROSS-tenant writes).
    if auth.uid() is not null then
      raise exception
        'ORCH_APPROVAL_MUST_EXECUTE: a paige_orchestration approval is driven only by the Layer-C '
        'approval-executor (execute-approval), never a direct or bulk status write'
        using errcode = '42501';
    end if;
    -- (b) Defense in depth (§13/§70): prove the state from the CANONICAL LEDGER, never browser-editable JSON.
    --     The held act must have reached a resolved-terminal outcome — executed | failed, exactly what the
    --     executor and the reconciler produce when they stamp approved. metadata.act_outcome is NOT the signal.
    select exists (
      select 1 from public.paige_act_executions ae
       where ae.event_id = nullif(new.metadata->>'event_id', '')::uuid
         and ae.act_id   = nullif(new.metadata->>'act_id', '')::uuid
         and ae.outcome in ('executed', 'failed')
    ) into _resolved;
    if not coalesce(_resolved, false) then
      raise exception
        'ORCH_APPROVAL_LEDGER_NOT_RESOLVED: the held Layer-C act has not reached a terminal ledger outcome; '
        'the inbox cannot be marked approved until execute-approval drives the act to executed or failed'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

comment on function public.paige_guard_orchestration_direct_approve() is
  'C5 s2 (#15): a source=paige_orchestration approval may reach status=approved — whether CREATED (INSERT) or '
  'TRANSITIONED (UPDATE) — ONLY when written by the service-role Layer-C executor/reconciler (auth.uid() NULL) '
  'AND the canonical paige_act_executions ledger row for (event_id, act_id) is terminal (executed|failed). '
  'Refuses any JWT caller on both paths; on UPDATE also pins source + ledger coordinates immutable so the row '
  'can neither be reclassified nor repointed to dodge the gate. NARROW: no-op for non-orchestration rows on '
  'both INSERT and UPDATE — it does NOT globally block every direct approval write.';

-- Broaden the guard trigger from BEFORE UPDATE to BEFORE INSERT OR UPDATE so the new INSERT branch fires on the
-- create path too. The function fast-returns for non-orchestration rows and for non-approved inserts, so the
-- wider event scope is cheap and adds no behavior for legitimate producers (§58 — coverage-only).
drop trigger if exists trg_paige_guard_orchestration_direct_approve on public.paige_pending_approvals;
create trigger trg_paige_guard_orchestration_direct_approve
  before insert or update on public.paige_pending_approvals
  for each row
  execute function public.paige_guard_orchestration_direct_approve();
