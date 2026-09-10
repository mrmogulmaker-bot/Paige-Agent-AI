# Paige Durable Job Contract — PROPOSAL (owner sign-off pending)

> **Status:** PROPOSAL. Documentation only. This delivery changes no runtime code, no capability
> state, no customer release identity. It extends the Paige Runtime Harness doctrine in
> `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §3 ("Durable work" responsibility #5) the way
> `paige-memory-contract.md` extends the Memory responsibility — it owns no Spine, Rail, Brain,
> or registry facts and creates no new system of record.
>
> **Routing per Master §3:** written after reading Master §3 (Harness), `paige-brain-wiring-standard.md`,
> and `paige-spine-and-rail-state.md`. Collision-mapped against #917 (orchestration/tools),
> #729/#776 (Spine/Rail), #109 (action bus) at the end.

---

## 1. Problem (grounded current-state survey, 2026-09-10)

Master §3's current-state inventory calls durable work `PARTIAL`: "the action bus, scheduled
workers, claims, retries, alert evaluation, and several job records exist. They are not yet one
uniformly governed, owner-visible Harness job contract." The survey below grounds that verdict at
`main` `42a8d5aa`:

- **13+ separate run/job tables**, each with its own lifecycle: `paige_actions`,
  `paige_workflow_runs`, `paige_skill_runs`, `paige_systems_check_run`, `paige_authority_act_runs`,
  `research_runs`, `paige_readiness_scan_runs`, `paige_eval_run`, `business_verification_runs`,
  `security_canary_runs`, `team_handoff_queue`, `paige_customer_actions`, plus the comms
  scheduled-drain path.
- **6 scheduled edge functions** (`coaching-reminder-cron`, `plan-reminder-cron`,
  `weekly-summary-cron`, `affiliate-monthly-statement-cron`, `systems-check-run-scheduled`,
  `comms-scheduled-drain`) that select due work with plain filters — no atomic claim, no lease,
  no attempt counter, no `FOR UPDATE SKIP LOCKED`-style guard. Example: `coaching-reminder-cron`
  selects `reminder_sent = false` rows and sends; a concurrent fire or a retry after timeout
  double-sends. This is a live correctness gap, not a style issue.
- **20+ distinct status vocabularies** across those tables, with no shared definition of terminal
  states. Migration `20261213` ("a run that never finished is not the latest reading") is an
  ad-hoc repair of exactly the missing semantics — the system keeps growing local patches for one
  global absence.
- **Asymmetry between chat and schedule:** the governed execution seam
  (`_shared/paige-spine/governedExecution.ts`) already enforces structured single-use claim
  redemption on the chat path; the scheduled path has no equivalent, so the same action class can
  be claim-governed when a human triggers it and unguarded when a cron triggers it.

## 2. The contract (canonical semantics, adapter-projected)

**Two-layer rule.** The contract governs *machine execution attempts*, not business workflow.
`paige_actions.status` (filed → drafted → pending_approval → done …) is business state and stays
exactly as is. A business row *rides* the contract through its execution attempts; the contract
never replaces or renames business lifecycles.

**Canonical execution states.** Every substrate projects its native status onto exactly these:

| Canonical state | Meaning | Terminal? |
|---|---|---|
| `claimed` | A worker holds a live lease on this attempt | no |
| `succeeded` | Canonical write + verified readback done | yes |
| `failed` | Definitively failed within attempt ceiling; retryable only by owner-visible re-file | yes |
| `blocked` | Waiting on approval, provider, or dependency; names the waiter | no |
| `cancelled` | Owner/authority cancelled | yes |
| `expired` | Lease died without resolution | no — must reconcile |
| `outcome_unknown` | Effect may or may not have landed; **must reconcile before any retry** | no — must reconcile |

`outcome_unknown` is load-bearing doctrine (Master §3): an ambiguous provider outcome is never
silently retried. `expired` and `outcome_unknown` attempts reconcile first; only `claimed`,
`blocked`, and un-reconciled states are invisible to re-dispatch.

**Required mechanics — every substrate adapter must provide or adopt:**

1. **Idempotency key.** Deterministic per unit of work: `(substrate, row_id, intent)` — the same
   key can never produce two side effects.
2. **Atomic claim.** One statement: select due work `FOR UPDATE SKIP LOCKED` (or a
   `SECURITY DEFINER` RPC observing §59 caller-scope-in-body), stamp `claimed_at` + `lease_until`
   + `attempt++`. Claim and side-effect intent land in the same transaction.
3. **Lease + heartbeat.** `lease_until` bounds every claim. A dead worker's lease expires to
   `expired`, which routes to reconciliation, never blind retry.
4. **Attempt ceiling + backoff.** Max attempts and backoff are per-substrate configuration,
   recorded next to the run row, visible to the owner.
5. **Receipt/Rail correlation.** Every terminal or `outcome_unknown` transition records through
   the existing `record_capability_run` seam — the run row carries the receipt reference. No
   parallel evidence store.
6. **Spine authority per step.** The contract adds no authority of its own; every step still
   crosses server-resolved identity, scope, approval, and budget exactly as Master §3 requires.
   The contract makes the *scheduled* path cross the same seam the chat path already uses.
7. **Honest visible state.** The owner-visible projection exposes canonical state + attempt count
   + named waiter (`blocked`) + reconciliation duty (`expired`/`outcome_unknown`). "Done" is never
   claimed without verified readback.

## 3. Adapter-first rollout (no forced migration)

Existing tables keep their schemas and RLS. Each gains a small adapter module that (a) maps native
statuses to canonical states, (b) adds the missing claim mechanics where absent (lease columns or
a claim RPC per substrate — schema additions are per-substrate and minimal, committed same-beat
per §47).

1. **Seam module:** `supabase/functions/_shared/durable-job/` — canonical states, claim/lease
   helpers, reconciliation helpers. No tables of its own.
2. **First adopter:** `coaching-reminder-cron` — smallest surface, live duplicate-send risk,
   immediate verifiable win (idempotent sends provable by attempt ledger).
3. **Then:** remaining crons, then `paige_actions` execution steps (bridging business state to
   attempt state), then the systems-check family.
4. **New work rule:** from contract adoption forward, any new scheduled/durable work must use the
   seam — no new bespoke job substrate is created.

**Maturity gate.** The contract is `PROOF OWED` until: claim atomicity under concurrent fires,
lease expiry → reconciliation, attempt ceilings honored, `outcome_unknown` blocking retry, and
receipt correlation are each proven in the first adopter with authenticated evidence. Until then
nothing may claim the platform has "one job contract."

## 4. Collision assessment

- Extends Master §3 Harness responsibility #5 (durable work); owns no Brain/Spine/Rail/registry fact.
- #109 (action bus): `paige_actions` business lifecycle untouched; contract governs only its
  execution attempts.
- #917 (orchestration/tools): consumes the same seam; this doc preempts no orchestration decision.
- #729/#776 (Spine/Rail): receipts flow through the existing `record_capability_run` seam; no new
  evidence ledger.
- No competing canonical home is created; if approved, this doc is the durable-job contract's home
  in `docs/brain/`, linked from Master §3 routing.
