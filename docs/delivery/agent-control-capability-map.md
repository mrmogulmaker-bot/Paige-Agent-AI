# Agent-Control Capability Map — PROPOSED / NOT BUILT

**Status:** PROPOSED. **Owner-accepted 2026-09-13** as a grounding proposal — **nothing is built, no capability is claimed, no code exists.** This is a read-only seam map for a *future* agent-control experience (Paige's owner watching + governing the work Paige and her bounded agents do: status, history, approve/decline, resume/readback, and — where a truthful backend exists — pause/retry/cancel).

**Build sequencing (owner directive 2026-09-13):** do **NOT** implement agent-control backend code now, and do **NOT** coordinate edits against the CRM/Pipeline command surface (**PR #1234**). **Wait until #1234 is merged and its canonical `crm-command` surface is established; then re-ground on fresh `main` and build the monitor backend from the real seams.** The visual prototype proceeds separately and now, through the design agent (§00) — it must render Pause/Retry/Cancel and any unsupported state as explicitly unavailable or absent, never as functioning controls.

Every seam below is grounded to a file (read-only pass, 2026-09-13). Where no seam exists it is said plainly (§13).

---

## 1. Canonical seam to REUSE (never fork it)

The **Layer C approve → resume → readback fabric** is the strongest true seam and is already shipped on `main` (the corrected executor merged via #1235). A future monitor backend REUSES it:

- **Per-act ledger** `public.paige_act_executions` — migration `20270126000000_paige_act_execution_ledger.sql`. Status = the `outcome` column typed by domain `public.paige_act_outcome`. Monotonic-advance RPC `paige_record_act_execution` (settled rows un-clobberable); tenant-SELECT RLS; **no direct client write** (service-role drainer only).
- **Sanctioned approve transition** `paige_approve_act_execution` — `20270202000000_paige_approve_act_execution.sql` (the sole `approval_pending → accepted_for_execution` path; atomic, idempotent, service-role only).
- **Companion approvals inbox** — `20270303000000_paige_orchestration_companion_minting.sql`: a held act mints a `paige_pending_approvals` row (`source='paige_orchestration'`, `status='pending'`) in the SAME transaction (idempotent via partial unique index on `metadata.event_id + act_id`); a `rejected`/`skipped` decision settles the held act to `cancelled` (guarded to `approval_pending` only); a `*/5` **reconciler cron** (`paige_reconcile_orchestration_acts`) sweeps stuck/stale acts to a terminal outcome.
- **The one approve door** `supabase/functions/execute-approval/index.ts` (UI `ApprovalRow` + Paige share it); Layer-C branch keys off `metadata.source === 'paige_orchestration'` and consumes the approval only for a terminal `executed|failed`.
- **The executor** `supabase/functions/_shared/paige-orchestration/approve-executor.ts`: `executeApprovedLayerCAct` — FRESH path (gate → approve → dispatch → advance) and **RESUME path** (`RESUMABLE_OUTCOMES = approval_pending | accepted_for_execution | ambiguous`; readback-first adoption, gated re-dispatch, ambiguous → reconcile-only, never blind re-fire). `governedGate` re-resolves availability through the canonical Capability Gateway over an immutable snapshot. `advanceLedger` files the capability receipt (`recordCapabilityRun`) + owner **Rail** (`emitAutomationRail`) only on a *confirmed* outcome (a ledger-write failure returns the prior state, never the adapter's hoped-for result — §13/§32).
- **Status fragments that already exist** (per store, reusable): `list_actions` RPC (`20260711140000_action_bus.sql`); `paige_approval_queue_v` view (read today by `src/hooks/usePendingApprovals.ts` → `src/pages/admin/ApprovalsInbox.tsx` / `src/components/paige/ApprovalRow.tsx`); `paige_workflow_runs` tenant read; `tasks` (`task_status`); capability receipts (`record_capability_run`, `_shared/capability-record.ts`); the `src/components/paige/LiveActionFeed.tsx` desk.

## 2. State vocabulary (the real, owner-visible outcomes today)

- **Governed act — `paige_act_executions.outcome` (13):** `condition_not_matched · held_by_lane · approval_pending · refused_authority · refused_budget · refused_trust_compass · refused_consent · accepted_for_execution · retrying · executed · failed · ambiguous · cancelled`. Settled = all except `{accepted_for_execution, retrying, ambiguous}`.
- **Action bus — `paige_actions.status` CHECK (12):** `filed · assigned · drafting · drafted · pending_approval · approved · executing · done · dismissed · failed · blocked · expired` (terminal-by-decision is `dismissed`; there is **no** `cancelled`).
- **Workflow run — CHECK (4):** `queued · running · completed · failed` (`paige_workflow_runs`, `20260627192025...`; carries `retry_count`).
- **Task — `task_status` enum (4):** `pending · in_progress · completed · cancelled` (`20251009234919...`). `plan_items` is a separate planning table with a free-text `status` (`open/in_progress/done/cancelled/blocked`) and `linked_action_id` → `paige_actions`.
- **Capability receipt (6):** `capability_succeeded · capability_failed · capability_refused · capability_unreachable · capability_outcome_unknown · capability_completed_unrecorded`.

## 3. Per-control verdict — what a monitor may TRUTHFULLY offer (§13)

| Control | Verdict | Basis |
|---|---|---|
| **Status / "active work + state"** | **PARTIAL — reuse per-store readbacks; no unified query** | Real readbacks exist (bus/approvals/workflows/tasks/ledger + receipts/Rail), but there is **no single cross-store "all active agent work + real state" query**, and **no surface reads the Layer-C ledger today**. A monitor backend would add a unified read over these, not a new store. |
| **Resume / readback** | **REUSE — genuinely shipped (NATIVE only)** | `executeApprovedLayerCAct` RESUME + reconciler cron + native-adapter readback + receipts/Rail. **Honest limit:** NATIVE acts only — an n8n-sourced held act is `not_supported_in_slice` and never fired. |
| **Cancel** | **PARTIAL — decline-a-pending only** | Reject/skip a *pending* companion approval → held act `cancelled` (guarded to `approval_pending` only); `advance_action → 'dismissed'` on a bus action; cancel a task/plan_item. **Missing:** cannot cancel an `accepted_for_execution/retrying/ambiguous` in-flight act; `paige_actions` has no `cancelled`; workflow runs have no cancel status or RPC. |
| **Retry** | **PARTIAL — automatic only** | Resume-on-re-approval, the reconciler cron, and `paige_workflow_runs.retry_count` + the `dispatch-queued-workflow-runs` sweeper. **Missing:** the `retrying` outcome is defined but written by **no code path today**; there is no owner-invokable "retry now" RPC/action. |
| **Pause** | **UNAVAILABLE — needs new backend** | No pause state on any in-flight record. `paige_automations.state='paused'` disarms a *process definition*, not a running act; `held_by_lane` records "lane off/paused" at decision time only. Pausing an accepted/in-flight act is not representable and no engine gate would honor one. A pause control would need a new ledger state + engine gate. |

## 4. Risks / approval lanes

- Autonomy lanes are `auto | confirm | off` (CHECK-constrained text on `paige_action_kinds.default_autonomy_lane`, `paige_actions.autonomy_lane`, `paige_act_executions.effective_lane` — not a named pg enum).
- A `confirm`-lane or high-risk-clamped act routes to the companion inbox; the owner approves via the one door; the executor **re-resolves** availability + governed-execution over an immutable snapshot at execution time (a stale approval cannot widen scope).
- **Safe monitor lanes:** read status/history (fully safe), approve/decline a pending act (existing door), resume via re-approval (idempotent).
- **Unsafe-to-imply lanes:** pause / cancel-in-flight / retry-now — no truthful backend; must never be drawn as live controls.

## 5. Collision boundary — the #1234 gate

- **PR #1234** (`feat(crm): complete governed Paige operational access`, draft, actively updated) is **HIGH collision** for any agent-control *backend* slice: it edits the exact four shared seams the monitor backend leans on — `supabase/functions/paige-ai-chat/index.ts` (chat tool registration), `supabase/functions/_shared/action-risk.ts` (the auto→confirm clamp engine), the Capability Gateway (`_shared/paige-capability-gateway/gateway.ts` — the executor re-resolves availability through it), and the spine registry (`_shared/paige-spine/registry.ts`). It also introduces a canonical `crm-command` command surface + a large migration.
- **Directive:** the agent-control backend does **NOT** build or coordinate against #1234 now. It **waits for #1234 to merge and its canonical command surface to establish**, then **re-grounds on fresh `main`** and builds the monitor backend from the then-real seams.
- **#1235** (orchestration fix-forward) is **MERGED** — the corrected approve-executor is in `main`; no collision.
- #585 (approval attribution) and #917 (solo orchestration) are stale drafts with table/name overlap only. **No open PR owns pause/retry/cancel of in-flight work** — that seam is unclaimed.

## 6. What Claude Design owns for the monitor UI (§00 — not CC's)

CC has zero input on the interface. Claude Design defines: the surface placement (Chat side panel vs work-detail view vs workspace) and visual language; how each real state is represented and how the owner reads "what Paige is doing / why blocked / what came back / what needs me"; **how a `PARTIAL`/`UNAVAILABLE` control is presented** — Pause has no backend, so it is shown as explicitly unavailable or absent, never a live control; the human-readable labels for the raw enum vocabulary (the owner never sees `accepted_for_execution`); and all copy, motion, accessibility, and the empty/first-use/working/approval-needed/failure-retry/completed/tenant-switch states across desktop + narrow viewports. The visual prototype proceeds now via the design agent (`npx impeccable update` → the `flow-prototype` workflow); this backend map is the seam-truth reference it maps every element against.

## 7. Net

A monitor can honestly ship **status + history + resume-readback + approve/decline** on the existing Layer-C fabric once built; **cancel/retry are PARTIAL** (decline-a-pending / automatic only); **pause is UNAVAILABLE** and must not be drawn as live. **Nothing here is built or claimed.** The build is gated behind #1234 merging + a fresh re-ground.
