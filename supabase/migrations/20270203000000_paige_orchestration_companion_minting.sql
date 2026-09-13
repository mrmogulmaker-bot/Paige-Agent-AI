-- Paige Runtime Harness — Layer C · C5 slice 2: COMPANION-MINTING a held act into the approvals inbox.
--
-- WHY THIS EXISTS (owner directive, 2026-09-13). C5 slice 1 shipped the approval-EXECUTOR: on a human's
-- approval it drives a held act (`paige_act_executions.outcome = 'approval_pending'`) to execution. But
-- nothing put that held act in front of a human to approve. A held Layer-C act sat in the ledger with NO
-- companion row in the EXISTING approvals inbox (`public.paige_pending_approvals`), so the owner could not
-- see or approve it. Slice 2 mints that companion row — REUSING the existing inbox schema, authority model,
-- inbox contract, approval claim, Rail/receipt and tenant resolution. NO second approval system, NO UI change
-- (§00: Claude Code has zero input on the frontend; this is the backend seam only).
--
-- ATOMIC WITH THE TRANSITION (owner: "mint companion-minting atomically with the approval_pending transition").
-- The mint is a DB TRIGGER on `paige_act_executions`, firing in the SAME transaction as the write that lands
-- `outcome = 'approval_pending'` (the engine's confirm-lane / high-risk-clamped path, via the monotonic RPC
-- `paige_record_act_execution`). Held act and inbox row commit together or not at all — a held act can never
-- exist without its inbox companion, and a rolled-back hold leaves no orphan approval.
--
-- MINT PRECEDENT (§18/§12 — mirror, do not fork). `public.advance_action` already mints a
-- `paige_pending_approvals` companion for the OLDER action-bus (migration 20260720212213): it inserts
-- (type, category, draft_content, contact_id, conversation_id, tenant_id, source, risk_level,
-- submitted_by_user_id, metadata) and keys the companion on `metadata.action_id`. This trigger mirrors that
-- column list exactly; the ONLY differences are (a) source = 'paige_orchestration' (a NEW, un-CHECKed source
-- value — distinct from advance_action's 'paige_action_bus' so the two worlds never collide), and (b) the
-- companion is keyed on `metadata.event_id` + `metadata.act_id` (NOT `action_id`) — deliberately, so the
-- existing `trg_ppa_sync_action` AFTER-UPDATE trigger (which reads `metadata->>'action_id'` and no-ops when it
-- is NULL, migration 20260711024632:168-170) never fires against an orchestration row. The orchestration
-- world's own status-sync is `paige_sync_orchestration_act_on_decision` below.
--
-- COLUMN CHOICES (grounded against the live schema, §13):
--   * type = 'other'          — a native held act has no better fit in the type CHECK enum; 'other' is valid
--                               in the original CHECK and every widening since (migration 20260627192025:207).
--   * draft_content = '{}'    — NOT NULL with no default; a held act carries no human draft (the reviewer sees
--                               the capability + snapshot args, not a message body). Honest empty object.
--   * category = capability   — the ledger's own capability_key snapshot (dotted action-kind). `category` has
--                               no CHECK, and the send-recipient guard (migration 20260825000000) bites ONLY
--                               when category IN ('email','sms') — ours never is, so contact_id = NULL is safe.
--   * risk_level              — engine writes detail.risk = an ActionRisk ('ordinary' | 'high' | ...). The
--                               risk_level CHECK is {low,medium,high,blocker}|NULL, and 'ordinary' is NOT in
--                               it, so MAP: 'high' → 'high', everything else → 'medium'. Never pass raw.
--   * contact_id = NULL       — DELIBERATE §9 decision. Setting it to the event subject would make the held-act
--                               approval readable by that client under the "Clients can read approvals on their
--                               own record" RLS policy — leaking an internal operator-side held action into the
--                               client portal. The approval is an OPERATOR review artifact; contact_id stays
--                               NULL. execute-approval resolves the real subject from the event anyway.
--   * submitted_by_user_id NULL — the held act was proposed by Paige autonomously; there is no submitting human
--                               (auth.uid() is NULL inside the service-role RPC's txn). Honest NULL.
--   * metadata                — carries the Layer-C join keys execute-approval reads (source/event_id/act_id),
--                               plus act_execution_id / automation_id / capability_id / snapshot_args for the
--                               inbox and audit. execute-approval keys its Layer-C branch off metadata.source +
--                               metadata.event_id + metadata.act_id (NOT the top-level source column).
--
-- IDEMPOTENCY (owner test: duplicate/retry). `paige_pending_approvals` has no natural unique key for this, so
-- this migration ADDS a PARTIAL UNIQUE INDEX on (metadata->>'event_id', metadata->>'act_id') WHERE
-- source = 'paige_orchestration', and the trigger INSERTs with ON CONFLICT DO NOTHING. A re-drain that
-- re-derives approval_pending (the monotonic RPC's ON CONFLICT re-write is an UPDATE with NEW.outcome still
-- 'approval_pending') never double-mints. The ledger's own UNIQUE(event_id, act_id) already serialises the
-- ledger write; this index serialises the companion.
--
-- §37 PRODUCER/CONSUMER INVENTORY (verified before ship):
--   PRODUCER of the mint: the monotonic RPC `paige_record_act_execution` writing outcome='approval_pending'
--     (engine confirm-lane path). No other writer sets approval_pending (C4 keeps it monotonic-final).
--   CONSUMERS of the minted row: (1) the approvals inbox reads (usePendingApprovals — RLS tenant-scoped,
--     admin/coach); (2) execute-approval's Layer-C branch (reads metadata.source/event_id/act_id); (3)
--     trg_ppa_sync_action AFTER UPDATE OF status — SAFE no-op (no metadata.action_id); (4) apply_approval_policy
--     BEFORE INSERT (fills category-if-null/sla_due_at/visible_to_roles) — runs fine on our row; (5)
--     trg_notify_approval_insert AFTER INSERT (admin notification) — DESIRED, surfaces the held act; (6)
--     paige_sync_orchestration_act_on_decision (NEW, below) — the orchestration status-sync.

-- ── (1) Idempotency: one companion approval per (event, act) for the orchestration world. ────────────────
create unique index if not exists paige_ppa_orchestration_act_uk
  on public.paige_pending_approvals ((metadata->>'event_id'), (metadata->>'act_id'))
  where source = 'paige_orchestration';

comment on index public.paige_ppa_orchestration_act_uk is
  'C5 slice 2: idempotency for the Layer-C companion approval — one paige_pending_approvals row per '
  '(metadata.event_id, metadata.act_id) among source=''paige_orchestration'' rows. Backs the mint trigger''s '
  'ON CONFLICT DO NOTHING so a re-drain that re-derives approval_pending never double-mints.';

-- ── (2) The mint: AFTER INSERT OR UPDATE on the ledger, WHEN a row is at approval_pending. ────────────────
create or replace function public.paige_mint_orchestration_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Fires only for a held act (WHEN clause guarantees NEW.outcome = 'approval_pending'). On UPDATE, skip when
  -- the row was ALREADY at approval_pending (a monotonic-RPC re-write of an unchanged hold) — the mint already
  -- happened; the ON CONFLICT below is the true guarantee, this is just avoiding a redundant insert attempt.
  if tg_op = 'UPDATE' and old.outcome = 'approval_pending' then
    return new;
  end if;

  insert into public.paige_pending_approvals (
    type, draft_content, category, contact_id, conversation_id, tenant_id,
    source, status, risk_level, submitted_by_user_id, metadata
  ) values (
    'other',
    '{}'::jsonb,
    new.capability_key,                              -- dotted action-kind; no CHECK on category
    null,                                            -- §9: NULL so the held act never leaks into the client portal
    null,
    new.tenant_id,                                   -- AUTHORITATIVE tenant from the ledger row
    'paige_orchestration',
    'pending',
    case when (new.detail->>'risk') = 'high' then 'high' else 'medium' end,
    null,                                            -- proposed by Paige autonomously; no submitting human
    jsonb_build_object(
      'source',            'paige_orchestration',
      'event_id',          new.event_id,
      'act_id',            new.act_id,
      'act_execution_id',  new.id,
      'automation_id',     new.automation_id,
      'capability_id',     new.capability_key,
      'snapshot_args',     new.detail->'snapshot_args'
    )
  )
  on conflict ((metadata->>'event_id'), (metadata->>'act_id')) where source = 'paige_orchestration'
  do nothing;

  return new;
end $$;

comment on function public.paige_mint_orchestration_approval() is
  'C5 slice 2: mints the companion paige_pending_approvals row for a held Layer-C act, atomically in the '
  'monotonic RPC''s transaction when the ledger row lands outcome=approval_pending. Mirrors advance_action''s '
  'companion-mint column list; source=paige_orchestration; keyed on metadata.event_id+act_id (never action_id, '
  'so trg_ppa_sync_action no-ops). Idempotent via paige_ppa_orchestration_act_uk + ON CONFLICT DO NOTHING.';

drop trigger if exists trg_paige_mint_orchestration_approval on public.paige_act_executions;
create trigger trg_paige_mint_orchestration_approval
  after insert or update on public.paige_act_executions
  for each row
  when (new.outcome = 'approval_pending')
  execute function public.paige_mint_orchestration_approval();

-- ── (3) Cancellation-sync: an inbox decision (reject/skip) settles the held ledger act. ───────────────────
-- When the owner REJECTS or SKIPS the companion approval, the held act must not linger at approval_pending
-- forever. This AFTER-UPDATE-OF-status trigger settles the ledger act to 'cancelled' (a valid FINAL outcome,
-- outcomes.ts) so the held act is closed and no later approval can drive it. Scoped to orchestration rows only
-- (source = 'paige_orchestration'); a guarded UPDATE advances ONLY a still-held act (outcome = approval_pending)
-- so it can never clobber an act that was already approved-and-executed (the monotonic contract in SQL form).
create or replace function public.paige_sync_orchestration_act_on_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _event_id uuid := (new.metadata->>'event_id')::uuid;
  _act_id   uuid := (new.metadata->>'act_id')::uuid;
begin
  -- Only orchestration rows; only a real status change into a decline state.
  if coalesce(new.source, '') <> 'paige_orchestration' then return new; end if;
  if _event_id is null or _act_id is null then return new; end if;
  if new.status = old.status then return new; end if;

  if new.status in ('rejected', 'skipped') then
    update public.paige_act_executions
       set outcome    = 'cancelled',
           refusal_code = coalesce(refusal_code, 'approval_' || new.status),
           settled_at = now(),
           detail     = coalesce(detail, '{}'::jsonb)
                        || jsonb_build_object('cancelled_via', 'approval_' || new.status, 'cancelled_at', now())
     where event_id = _event_id
       and act_id   = _act_id
       and outcome  = 'approval_pending';   -- guarded: never clobber an already-advanced act
  end if;

  return new;
end $$;

comment on function public.paige_sync_orchestration_act_on_decision() is
  'C5 slice 2: when a source=paige_orchestration approval is rejected/skipped in the inbox, settle the held '
  'Layer-C act (paige_act_executions) to outcome=cancelled. Guarded to advance ONLY a still-held '
  '(approval_pending) row, so an already-approved/executed act is never clobbered. Keys on metadata.event_id+'
  'act_id; no-op for non-orchestration rows.';

drop trigger if exists trg_paige_sync_orchestration_act_on_decision on public.paige_pending_approvals;
create trigger trg_paige_sync_orchestration_act_on_decision
  after update of status on public.paige_pending_approvals
  for each row
  execute function public.paige_sync_orchestration_act_on_decision();

-- ── (4) Direct-approve guard: an orchestration approval may reach status='approved' ONLY via the executor. ─
-- The ONE sanctioned approve path for a Layer-C held act is execute-approval → the approval-executor →
-- paige_approve_act_execution → dispatch → the executor stamps the approval 'approved' with a durable ledger
-- outcome. But the inbox has SECONDARY decision paths (bulk-approve, direct status writes) that stamp
-- status='approved' WITHOUT running the executor — which would mark the held act approved in the inbox while
-- the ledger act never executes (a silent no-op approval; §13/§70 — the owner clicks approve and nothing runs).
-- This BEFORE-UPDATE guard blocks a source=paige_orchestration row going pending→approved UNLESS the executor
-- set metadata.act_outcome (its post-execution stamp). A fast no-op for every non-orchestration row.
create or replace function public.paige_guard_orchestration_direct_approve()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.source, '') <> 'paige_orchestration' then return new; end if;
  if new.status = 'approved' and old.status <> 'approved'
     and (new.metadata->>'act_outcome') is null then
    raise exception
      'ORCH_APPROVAL_MUST_EXECUTE: a paige_orchestration approval is driven only by the Layer-C '
      'approval-executor (execute-approval), which stamps metadata.act_outcome; direct/bulk approve is refused'
      using errcode = '42501';
  end if;
  return new;
end $$;

comment on function public.paige_guard_orchestration_direct_approve() is
  'C5 slice 2: refuses a source=paige_orchestration approval transitioning to status=approved unless the '
  'Layer-C approval-executor stamped metadata.act_outcome. Blocks bulk/direct approve paths that would mark '
  'the inbox row approved while the held ledger act never executed (§13/§70). No-op for non-orchestration rows.';

drop trigger if exists trg_paige_guard_orchestration_direct_approve on public.paige_pending_approvals;
create trigger trg_paige_guard_orchestration_direct_approve
  before update of status on public.paige_pending_approvals
  for each row
  execute function public.paige_guard_orchestration_direct_approve();

-- ── (5) Durable ambiguous-state reconciler (owner follow-up b). ────────────────────────────────────────
-- THE GAP (grounded 2026-09-13). The existing native-event SWEEPER (`paige-native-event-sweeper`, pg_cron
-- */5) re-drives an EVENT only while it is reclaimable (paige_native_events.processing_state IN
-- ('pending','claimed')); phase 5 then reconciles any advanceable native ledger row of that event BY
-- CORRELATION. But an event whose ONLY act is a held (confirm-lane) act completes processing_state='done' at
-- first drain (approval_pending ∈ the drainer's FINAL set → reconcile_pending empty → the event is completed
-- 'done'). When the approval-executor LATER drives that held act to `ambiguous` (an unconfirmable dispatch)
-- or leaves it `accepted_for_execution` (a redeemed-but-unadvanced write blip), the event is ALREADY 'done',
-- so the sweeper never re-drives it and the orphaned advanceable ledger row would loop unresolved forever —
-- exactly the "silent loop" this reconciler exists to end.
--
-- WHAT IT DOES. A pg_cron */5 job scans NATIVE ledger rows stuck advanceable (ambiguous /
-- accepted_for_execution) and STALE (updated_at older than 2 sweeper cycles, so never a live in-flight row),
-- and reconciles each by THE SAME correlation signal the native adapter uses — a
-- paige_journey_stage_transitions row stamped (contact_id = the event subject, source_event = the act's
-- correlation_ref). This is a deliberate SQL MIRROR of native-adapter.ts `reconcileByCorrelation` (the ONE
-- journey-stage correlation query, §18 documented): a landed transition proves OUR write committed (set_journey_stage
-- stamps the transition in the SAME txn as the effect), so:
--   * transition FOUND                         → advance the ledger to `executed` (record the truth; §P3 late/blip confirm).
--   * transition ABSENT and row older than 24h → advance to `failed` (reconcile_exhausted): with no stamped
--                                                 transition after a day the effect provably never committed;
--                                                 a visible terminal, never a silent forever-ambiguous row.
--   * transition ABSENT but within 24h         → leave advanceable; a later tick re-checks (no write → no churn).
-- Every advance goes through the SANCTIONED monotonic RPC `paige_record_act_execution` (never a raw UPDATE) —
-- it converges/idempotent and its guard refuses to move a row that has since gone terminal, so a rare overlap
-- with a human re-approval is harmless. NATIVE journey-stage only (n8n is C3+ and does not reconcile this way;
-- a future native executor with a different correlation table EXTENDS this function — the §18 seam is here).
-- On a terminal advance it also stamps the companion approval truthful (status=approved + metadata.act_outcome),
-- so the inbox stops showing a pending approval for an act that has resolved (§70) — guarded by, and satisfying,
-- the direct-approve guard above.
create or replace function public.paige_reconcile_orchestration_acts()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _rec        record;
  _landed_id  uuid;
  _new        text;
  _advanced   integer := 0;
begin
  -- Cron / service-role context only (auth.uid() is NULL under pg_cron). Refuse a JWT caller so this is never
  -- reachable as an authenticated surface (§59). It performs NO per-user authority decision and fires NO new
  -- effect — it only records the already-known correlation truth of an orphaned act.
  if auth.uid() is not null then
    raise exception 'RECONCILE_FORBIDDEN: service role / cron only' using errcode = '42501';
  end if;

  for _rec in
    select ae.id, ae.event_id, ae.automation_id, ae.act_id, ae.act_position, ae.tenant_id,
           ae.capability_key, ae.idempotency_key, ae.correlation_ref, ae.outcome, ae.detail, ae.created_at,
           ev.subject_id
      from public.paige_act_executions ae
      join public.paige_native_events ev on ev.id = ae.event_id
     where ae.adapter_kind = 'native'
       and ae.outcome in ('ambiguous', 'accepted_for_execution')
       and ae.updated_at < now() - interval '10 minutes'   -- past 2 sweeper cycles → never a live in-flight row
       and ev.subject_table = 'clients'                     -- the one native journey pattern reconciles on clients
       and ae.correlation_ref is not null
     order by ae.updated_at asc
     limit 50                                               -- bounded; the next */5 tick takes any remainder
  loop
    -- MIRROR of native-adapter.ts reconcileByCorrelation — the ONE journey correlation query. (No tenant_id on
    -- paige_journey_stage_transitions; scope is via contact_id → clients, and the correlation_ref is a per-act
    -- unguessable ref, so the (contact_id, source_event) match is the confirmation signal.)
    select t.id into _landed_id
      from public.paige_journey_stage_transitions t
     where t.contact_id = _rec.subject_id
       and t.source_event = _rec.correlation_ref
     limit 1;

    if _landed_id is not null then
      _new := 'executed';                                    -- the effect landed → record the truth
    elsif _rec.created_at < now() - interval '24 hours' then
      _new := 'failed';                                      -- >24h with no stamped transition → never committed
    else
      continue;                                              -- unconfirmed, not yet past the deadline → wait
    end if;

    -- Advance via the sanctioned monotonic RPC. _dispatched_at = NULL preserves the original (the RPC
    -- coalesces); _settled_at = now() (terminal). _detail is MERGED with the row's existing detail (the RPC
    -- OVERWRITES detail, so merge here to preserve snapshot_args et al.).
    perform public.paige_record_act_execution(
      _rec.event_id, _rec.automation_id, _rec.act_id, _rec.act_position, _rec.tenant_id,
      'native', _rec.capability_key, 'confirm', _new::public.paige_act_outcome,
      case when _new = 'failed' then 'reconcile_exhausted' else null end,
      _rec.idempotency_key, _rec.correlation_ref, null,
      coalesce(_rec.detail, '{}'::jsonb)
        || jsonb_build_object('reconciled_via', 'durable_orchestration_sweep', 'prior_outcome', _rec.outcome),
      case when _new = 'failed' then 'ambiguous_never_confirmed_by_correlation' else null end,
      null, now()
    );
    _advanced := _advanced + 1;

    -- Keep the companion approval truthful (§70): a still-pending orchestration approval for this (event, act)
    -- is stamped approved with the act outcome, so the inbox no longer shows it awaiting a decision. The
    -- act_outcome stamp satisfies the direct-approve guard (piece 4). Best-effort; a missing companion is fine.
    update public.paige_pending_approvals
       set status      = 'approved',
           reviewed_at = now(),
           metadata    = coalesce(metadata, '{}'::jsonb)
                         || jsonb_build_object('act_outcome', _new, 'executed', _new = 'executed',
                                               'execute_note', 'resolved by durable reconciler')
     where source = 'paige_orchestration'
       and (metadata->>'event_id')::uuid = _rec.event_id
       and (metadata->>'act_id')::uuid   = _rec.act_id
       and status = 'pending';
  end loop;

  return _advanced;
end $$;

revoke all on function public.paige_reconcile_orchestration_acts() from public, anon, authenticated;
grant execute on function public.paige_reconcile_orchestration_acts() to service_role;

comment on function public.paige_reconcile_orchestration_acts() is
  'C5 slice 2 (owner follow-up b): durable reconciler for orphaned NATIVE Layer-C acts left advanceable '
  '(ambiguous / accepted_for_execution) on an event that already completed done — which the native-event '
  'sweeper cannot re-drive. Mirrors native-adapter reconcileByCorrelation (journey-stage only): a stamped '
  'transition advances the ledger to executed; >24h with none advances to failed (reconcile_exhausted). '
  'Advances only via the monotonic RPC; cron/service-role only. Also stamps the companion approval truthful.';

-- pg_cron */5 (owner §64 cloud-first; no laptop dependency). Distinct jobname from paige-native-event-sweeper;
-- cron.schedule upserts by jobname, so a re-run of this migration re-points it in place.
select cron.schedule(
  'paige-orchestration-act-reconciler',
  '*/5 * * * *',
  $cron$ select public.paige_reconcile_orchestration_acts(); $cron$
);
