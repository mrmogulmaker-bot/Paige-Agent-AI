-- Paige Runtime Harness — Layer C · C5 slice 2 FIX-FORWARD: harden the companion-mint approval seam.
--
-- WHY THIS EXISTS (owner directive, 2026-09-13). The shipped slice-2 migration (20270303000000) put held
-- Layer-C acts in front of a human, but an external Codex review (layered defense, §39) — run AFTER merge —
-- found real defects in it that the internal §39 peer + §5 compliance missed. This migration fixes all of the
-- DB-side ones in ONE focused slice (the two edge files were NOT touched by any finding, so no edge change):
--
--   (1) §70 READABLE APPROVAL. The mint wrote draft_content='{}' and no summary, so ApprovalRow.tsx rendered
--       "(no summary)" — the owner faced a HIGH-RISK approval with NO description of the action or the record.
--       Fix: derive a clear, human-readable description from IMMUTABLE server-side data (the ledger's own
--       capability_key + detail.snapshot_args, plus the event subject's client name) into summary + draft_content.
--   (2) §13/§70 LEDGER-PROVEN APPROVAL (no client-writable bypass). The direct-approve guard trusted
--       metadata.act_outcome — a browser-editable field. A same-tenant admin (the weak approvals RLS admits a
--       same-tenant admin write) could set status='approved' + a forged metadata.act_outcome in one UPDATE and
--       mark the inbox approved while the ledger act never ran. Fix: the guard now (a) refuses ANY JWT caller
--       (auth.uid() NOT NULL) from flipping a paige_orchestration row to approved — the ONLY sanctioned approver
--       is the SERVICE-ROLE Layer-C executor/reconciler (execute-approval writes the approval with the service
--       role, auth.uid() NULL, verified) — and (b) proves the state from the CANONICAL paige_act_executions
--       ledger (outcome IN executed|failed), never the client-writable JSON.
--   (3) §13 RECONCILER TRUTH. The reconciler PERFORMed the monotonic RPC (discarding its return) then stamped
--       the companion with the REQUESTED _new. A concurrent human resume that persisted 'executed' between the
--       scan and the RPC would be recorded 'failed' on the companion. Fix: CAPTURE the RPC's returned row and
--       stamp the companion from its ACTUAL outcome.
--   (4) BACKFILL. The mint fires only on new insert/update; a held act that reached approval_pending BEFORE the
--       mint existed has no companion and the monotonic RPC will not re-fire the trigger. Fix: an idempotent
--       INSERT..SELECT backfill for those orphans, with the same readable content + metadata.
--
-- (Findings 5 (recovery-doc correction) and 6 (Visible-Flow-Impact + UI-delivery evidence) are docs — see the
--  PR + docs/evidence/ui-delivery/. Finding 5 is the master §4.0 recovery-note correction, made in THIS diff.
--  The §4.0 Shipped-Delivery-Log row and the decision-log/brain entries are NOT in this diff — they land in the
--  closeout once the merge SHA and the persisted-apply proof exist (§0/§13: no pre-merge entry with a guessed SHA).)
--
-- APPROACH (§18/§12 — extend, do not fork). The four objects already exist (20270303000000); this migration
-- CREATE OR REPLACEs the three functions in place (the triggers call them by name — unchanged trigger defs),
-- adds ONE pure helper for the readable description (the single home for both the trigger and the backfill),
-- and runs the one-time idempotent backfill. Additive + order-independent: it alters no existing table and
-- creates no new table/column/index — so the forward-cleanup recovery is a DROP of exactly these objects
-- (see the PR recovery note; a git revert does NOT reverse applied SQL).
--
-- RLS NOTE (§13, honest scope). Finding #2's fix is the guard above, which is SUFFICIENT to prevent a browser
-- caller from setting a paige_orchestration approval to approved: it fires on EVERY update path (it is a
-- BEFORE UPDATE trigger, not RLS-dependent) and refuses any JWT caller outright. The orchestration mint always
-- writes a NON-NULL tenant_id, so the existing RESTRICTIVE `tenant_isolation` policy already blocks a
-- cross-tenant admin write for these rows. The broader table-wide approvals-RLS weakness (the permissive write
-- policy gates on the tenant-agnostic has_any_role, and NULL-tenant rows are writable by any global admin —
-- the §59 global-role trap, touching every approval consumer + a §37 sweep) is the SEPARATE owner-decided
-- follow-up and is deliberately NOT rewritten here (the ledger cross-check is defense in depth, not a
-- substitute for that correct RLS — owner's words).

-- ── (0) The readable-description builder — ONE home for the mint AND the backfill (§18). ──────────────────
-- Pure text function of immutable inputs (no table access → NOT security definer). Turns the ledger's own
-- capability_key ('crm.advance_journey_stage') + snapshot_args ('{"stage_slug":"engaged"}') + an optional
-- subject label (the client name) into the draft_content ApprovalRow.tsx already renders (subject/preview/body).
create or replace function public.paige_orchestration_approval_content(
  _capability text, _args jsonb, _subject_label text
) returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  _last    text;
  _label   text;
  _args_txt text;
  -- coalesce in the true branch too: a SQL-NULL _args has jsonb_typeof(coalesce(_args,'{}'))='object' but
  -- would otherwise return the raw NULL, storing draft_content.args=null instead of '{}' (§39 P3 nit).
  _args_obj jsonb := case when jsonb_typeof(coalesce(_args, '{}'::jsonb)) = 'object' then coalesce(_args, '{}'::jsonb) else '{}'::jsonb end;
begin
  -- last dotted segment of the capability key, humanized ('crm.advance_journey_stage' -> 'Advance Journey Stage')
  _last := reverse(split_part(reverse(coalesce(_capability, '')), '.', 1));
  if coalesce(_last, '') = '' then _last := 'action'; end if;
  _label := initcap(replace(_last, '_', ' '));
  -- compact, human args ('{"stage_slug":"engaged"}' -> 'stage slug: engaged'); ordered for a stable render
  select string_agg(replace(k, '_', ' ') || ': ' || v, ', ' order by k)
    into _args_txt
    from jsonb_each_text(_args_obj) as e(k, v);
  return jsonb_build_object(
    -- §70 (Codex P1): fold the governed args INTO the subject — hence into summary, since both
    -- ApprovalRow.tsx and ApprovalsInbox.tsx render ONLY `a.summary ?? <draft_content fallback>` and never
    -- surface preview/body separately. Args left only in preview/body are invisible, so every stage-advance
    -- would read identically ("Advance Journey Stage for Jane Client") and the operator could approve without
    -- seeing WHICH stage. Appending them here makes the target visible in the one field the inbox shows.
    'subject', _label
      || case when coalesce(_subject_label, '') <> '' then ' for ' || _subject_label else '' end
      || case when coalesce(_args_txt, '') <> '' then ' (' || _args_txt || ')' else '' end,
    'preview', coalesce(_args_txt, ''),
    'body',
      'Paige needs your approval to run "' || _label || '"'
      || case when coalesce(_subject_label, '') <> '' then ' for ' || _subject_label else '' end
      || case when coalesce(_args_txt, '') <> '' then ' (' || _args_txt || ')' else '' end
      || '. Approving runs the action; declining cancels it.',
    'capability', coalesce(_capability, ''),
    'args', _args_obj
  );
end $$;

comment on function public.paige_orchestration_approval_content(text, jsonb, text) is
  'C5 s2 fix-forward: builds the human-readable draft_content (subject/preview/body) for a Layer-C companion '
  'approval from the immutable ledger capability_key + snapshot_args + an optional subject (client) label. '
  'Pure/immutable; the ONE home shared by the mint trigger and the backfill so the two never drift.';

-- ── (1)+(2 mint side): the mint now writes a READABLE description (finding #1). ───────────────────────────
create or replace function public.paige_mint_orchestration_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _subject_label text;
  _draft         jsonb;
begin
  if tg_op = 'UPDATE' and old.outcome = 'approval_pending' then
    return new;
  end if;

  -- Resolve a human subject label (the client, when the event subject is a client). Read-only; it lands in
  -- draft_content ONLY (never contact_id), so the "clients read own-record approvals" RLS never exposes this
  -- operator-review artifact into the client portal (§9 — contact_id stays NULL, deliberately).
  select case when ev.subject_table = 'clients'
              then nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
              else null end
    into _subject_label
    from public.paige_native_events ev
    left join public.clients c on ev.subject_table = 'clients' and c.id = ev.subject_id
   where ev.id = new.event_id;

  _draft := public.paige_orchestration_approval_content(new.capability_key, new.detail->'snapshot_args', _subject_label);

  insert into public.paige_pending_approvals (
    type, draft_content, summary, category, contact_id, conversation_id, tenant_id,
    source, status, risk_level, submitted_by_user_id, metadata
  ) values (
    'other',
    _draft,
    _draft->>'subject',                              -- §70: the owner sees WHAT action (+ record) they approve
    new.capability_key,
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
  'C5 s2 (fix-forward): mints the companion paige_pending_approvals row for a held Layer-C act atomically in '
  'the monotonic RPC transaction. Now writes a readable summary + draft_content (via '
  'paige_orchestration_approval_content) so the owner sees the action + record (§70). source=paige_orchestration; '
  'contact_id NULL (§9); keyed on metadata.event_id+act_id; idempotent via paige_ppa_orchestration_act_uk.';

-- ── (2) direct-approve guard: LEDGER-proven, no client-writable bypass (finding #2). ──────────────────────
create or replace function public.paige_guard_orchestration_direct_approve()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _resolved boolean;
begin
  if coalesce(new.source, '') <> 'paige_orchestration' then return new; end if;
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
  'C5 s2 (fix-forward): a source=paige_orchestration approval may reach status=approved ONLY when written by '
  'the service-role Layer-C executor/reconciler (auth.uid() NULL) AND the canonical paige_act_executions '
  'ledger row for (event_id, act_id) is terminal (executed|failed). Refuses any JWT caller and never trusts the '
  'browser-editable metadata.act_outcome (§13/§70). No-op for non-orchestration rows.';

-- ── (3) reconciler: stamp the companion from the RPC's ACTUAL returned outcome (finding #3). ──────────────
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
  _row        public.paige_act_executions;   -- capture the monotonic RPC's returned row (finding #3)
  _actual     text;
  _advanced   integer := 0;
begin
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
       and ae.updated_at < now() - interval '10 minutes'
       and ev.subject_table = 'clients'
       and ae.correlation_ref is not null
     order by ae.updated_at asc
     limit 50
  loop
    select t.id into _landed_id
      from public.paige_journey_stage_transitions t
     where t.contact_id = _rec.subject_id
       and t.source_event = _rec.correlation_ref
     limit 1;

    if _landed_id is not null then
      _new := 'executed';
    elsif _rec.created_at < now() - interval '24 hours' then
      _new := 'failed';
    else
      continue;
    end if;

    -- Advance via the sanctioned monotonic RPC and CAPTURE its returned row. A concurrent human resume may have
    -- driven this act terminal between the scan above and here; the monotonic RPC then returns the ALREADY-
    -- PERSISTED outcome (it refuses to move a final row) rather than _new. We stamp the companion from that
    -- ACTUAL outcome, never the stale requested _new (§13 — the inbox must never report 'failed' for an act the
    -- ledger recorded 'executed').
    _row := public.paige_record_act_execution(
      _rec.event_id, _rec.automation_id, _rec.act_id, _rec.act_position, _rec.tenant_id,
      'native', _rec.capability_key, 'confirm', _new::public.paige_act_outcome,
      case when _new = 'failed' then 'reconcile_exhausted' else null end,
      _rec.idempotency_key, _rec.correlation_ref, null,
      coalesce(_rec.detail, '{}'::jsonb)
        || jsonb_build_object('reconciled_via', 'durable_orchestration_sweep', 'prior_outcome', _rec.outcome),
      case when _new = 'failed' then 'ambiguous_never_confirmed_by_correlation' else null end,
      null, now()
    );
    _actual := coalesce(_row.outcome::text, _new);
    _advanced := _advanced + 1;

    -- Keep the companion truthful (§70) with the ACTUAL persisted outcome. Only stamp when the act resolved to
    -- executed|failed (what the guard admits and what the reconciler produces); if a concurrent decline made it
    -- 'cancelled', the human's reject/skip already moved the companion off 'pending', so the guarded update
    -- below matches nothing — no stale/forbidden stamp.
    if _actual in ('executed', 'failed') then
      update public.paige_pending_approvals
         set status      = 'approved',
             reviewed_at = now(),
             metadata    = coalesce(metadata, '{}'::jsonb)
                           || jsonb_build_object('act_outcome', _actual, 'executed', _actual = 'executed',
                                                 'execute_note', 'resolved by durable reconciler')
       where source = 'paige_orchestration'
         and (metadata->>'event_id')::uuid = _rec.event_id
         and (metadata->>'act_id')::uuid   = _rec.act_id
         and status = 'pending';
    end if;
  end loop;

  return _advanced;
end $$;

comment on function public.paige_reconcile_orchestration_acts() is
  'C5 s2 (fix-forward): durable reconciler for orphaned NATIVE Layer-C acts (ambiguous/accepted_for_execution) '
  'on an already-done event. Mirrors native-adapter reconcileByCorrelation: a stamped transition -> executed; '
  '>24h with none -> failed. Advances ONLY via the monotonic RPC and stamps the companion from the RPC''s ACTUAL '
  'returned outcome (never the stale requested value). Cron/service-role only.';

-- ── (4) idempotent backfill: companions for held acts that predate the mint (finding #4). ────────────────
-- A held act that reached approval_pending BEFORE the mint existed has no companion, and the monotonic RPC will
-- not re-fire the AFTER-UPDATE trigger (approval_pending is monotonic-final). Mint one now for each orphan, with
-- the SAME readable content + metadata as the live mint. Idempotent: NOT EXISTS + ON CONFLICT DO NOTHING.
insert into public.paige_pending_approvals (
  type, draft_content, summary, category, contact_id, conversation_id, tenant_id,
  source, status, risk_level, submitted_by_user_id, metadata
)
select
  'other',
  ct.content,
  ct.content->>'subject',
  ae.capability_key,
  null, null, ae.tenant_id,
  'paige_orchestration', 'pending',
  case when (ae.detail->>'risk') = 'high' then 'high' else 'medium' end,
  null,
  jsonb_build_object(
    'source',            'paige_orchestration',
    'event_id',          ae.event_id,
    'act_id',            ae.act_id,
    'act_execution_id',  ae.id,
    'automation_id',     ae.automation_id,
    'capability_id',     ae.capability_key,
    'snapshot_args',     ae.detail->'snapshot_args',
    'backfilled',        true
  )
from public.paige_act_executions ae
left join public.paige_native_events ev on ev.id = ae.event_id
left join public.clients c on ev.subject_table = 'clients' and c.id = ev.subject_id
cross join lateral (
  select public.paige_orchestration_approval_content(
    ae.capability_key, ae.detail->'snapshot_args',
    case when ev.subject_table = 'clients'
         then nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
         else null end) as content
) ct
where ae.outcome = 'approval_pending'
  and not exists (
    select 1 from public.paige_pending_approvals pa
     where pa.source = 'paige_orchestration'
       and (pa.metadata->>'event_id') = ae.event_id::text
       and (pa.metadata->>'act_id')   = ae.act_id::text)
on conflict ((metadata->>'event_id'), (metadata->>'act_id')) where source = 'paige_orchestration'
do nothing;

-- ── (4b) repair companions minted BEFORE this fix-forward (Codex P2 — the production-window rows). ────────
-- Slice-1's mint (20270303000000) wrote draft_content='{}' with NO summary, so any orchestration companion
-- created between that deploy and this one still renders "(no summary)". The INSERT backfill above SKIPS them
-- (NOT EXISTS is false — a companion row already exists), so without this UPDATE the exact rows this readability
-- repair targets stay unreadable. Recompute the readable content from the immutable ledger for those legacy rows.
-- Idempotent + narrow: only rows whose summary is still empty are touched (a repaired row has a non-empty
-- summary, so a re-run is a no-op), and only source='paige_orchestration' rows whose ledger act still exists.
update public.paige_pending_approvals ppa
   set draft_content = ct.content,
       summary       = ct.content->>'subject'
  from public.paige_act_executions ae
  left join public.paige_native_events ev on ev.id = ae.event_id
  left join public.clients c on ev.subject_table = 'clients' and c.id = ev.subject_id
  cross join lateral (
    select public.paige_orchestration_approval_content(
      ae.capability_key, ae.detail->'snapshot_args',
      case when ev.subject_table = 'clients'
           then nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
           else null end) as content
  ) ct
 where ppa.source = 'paige_orchestration'
   and (ppa.metadata->>'event_id') = ae.event_id::text
   and (ppa.metadata->>'act_id')   = ae.act_id::text
   and coalesce(ppa.summary, '') = '';
