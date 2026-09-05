# Phase 2 — Flow Map & Implementation Slices (Paige conversation experience)

**Program:** PAIGE-at-Cowork-Level · **Phase:** 2 (Planning) · **Flow-by-Flow route:** foundation
decomposition (`00_Flow_Map`) + `references/delivery.md` controls · **Date:** 2026-09-05 · **Base:** `main`
@ `8bae3775` (post-#948/#947/#949/#955). Grounded in Phase-1 reports 01–06 + CC live-prod verification +
the released #947 pattern + the Spine registry. **Every capability below cites a REAL released or
explicitly-planned contract; nothing is filled with a fake capability, action history, specialist, or
"Paige handled it."**

---

## 0. Ownership frame (owner ruling 2026-09-05)

**I OWN:** the PAIGE conversation experience + the integration plan that lets Paige USE already-governed,
source-backed capabilities.

**I CONSUME via explicit contract, never rebuild inside chat:** durable Mind/Memory storage & contracts ·
MCP dispatch governance / tool-risk enforcement · Rail schema · Spine readiness reconciliation ·
agent-registry naming/placement · A2P/Zapier/n8n/Communications provider work · Command Center UI.

**Governing contracts (REAL, on `main`):**
| Contract | What it governs | State |
|---|---|---|
| `_shared/paige-spine/registry.ts` `PAIGE_SPINE_CAPABILITIES` | the one list of source-backed capabilities: `evidence` (observe), `action` (execute, w/ classification·approvalAuthority·riskPolicyKey·chatTool·idempotency), `outcome` (kinds·projector·railVisibility) | LIVE |
| `_shared/paige-spine/governedExecution.ts` `decideGovernedExecution` | the one pathway a capability runs through; consumes `autonomyLane` (`auto\|confirm\|off`), clamps `auto`+`high`→`confirm` | LIVE |
| `resolve_tool_autonomy(uuid,text)` + `trust_effective_rung()` | per-tool lane, clamped by the Trust Compass ceiling (§67/§68) | LIVE |
| `_shared/capability-record.ts` `recordCapabilityRun` (#947) + `record_capability_run` RPC | the one home for HOW an outcome is written (6 outcomes), **at the executor, never a central hook** | LIVE (RATIFIED) |
| confirm/approval seam — `paige_pending_confirmations` (`recordConfirmation`/`claimConfirmation`) + `paige_pending_approvals` | human "ask-first" gate before a consequential act | LIVE |
| `get_solo_rail_activity(int)` (DEFINER lens) | how completed outcomes read back to the owner | LIVE |
| `docs/doctrine/paige-ui-delivery-standard.md` + `paige-ui-design` skill + `ui-delivery-evidence.yml` (#955) | mandatory process for any visible Paige interface change | LIVE — BINDS Phase 3 |
| Memory contract (Mind/Memory recovery agent) | governed workspace/client/conversation/agent memory | **PLANNED — handoff (§6.A)** |
| MCP dispatch governance / tool-risk | non-chat caller governance | **PLANNED — handoff (§6.B)** |
| agent registry (canonical specialist identities/placement, #921 lineage) | named-specialist identity | **PLANNED — handoff (§6.C)** |
| account-switch revalidation `revalidateAuthority` (PR #591) | fail-closed on mid-turn tenant change | **PLANNED — PR #591 (open/draft)** |

**Decisions applied:** F02 → consume the Memory contract (do not build a chat-side memory path); interim
resume rides the already-LIVE `paige_operating_memory()` continuity. F05 → ratify + reuse
`capability-record.ts`; no second log/schema/silent-writer. F03 → adapter on stable internal capability/
role identifiers only; **no named-specialist routing until the registry is current + merged.**

---

## 1. Flow Map — the seven owner-required capability dimensions

Actor: **Solo owner** in the **one** Paige conversation; Paige is the acting agent. Each flow is one
actor-goal unit with a source contract and a truth label.

| ID | Flow (actor goal) | Source contract | Truth |
|---|---|---|---|
| **P1 OBSERVE** | Owner asks; Paige states a source-backed fact with citation + freshness, or refuses honestly | Spine `evidence` adapters (`pipeline.deal_stage_evidence`, `business_context.readiness`, `team.authority`, `social.presence`, `n8n.connection…`) | LIVE (partial bindings) |
| **P2 REMEMBER** | Owner returns later; Paige resumes without restating context | **interim:** `paige_operating_memory()` continuity (LIVE, tenant-scoped) · **target:** governed Memory contract | PARTIAL / PLANNED |
| **P3 PREPARE** | Paige drafts a deliverable with NO side effect, for review | existing draft seams (`content-draft`, extraction proposals) | LIVE |
| **P4 EXECUTE-AUTO** | Paige performs a consequential action at `auto`, records the outcome | Spine `action` (mutate/external_effect) → `decideGovernedExecution` → executor → `capability-record.ts` | LIVE for wired capabilities |
| **P5 ASK-FIRST** | Action at `confirm`/above-ceiling → human approves before it runs | `resolve_tool_autonomy` + ceiling clamp + `paige_pending_confirmations`/`_approvals` | LIVE |
| **P6 REPORT** | Paige tells the owner the honest state of an action: done/refused/failed/unreachable/uncertain/**completed-unrecorded** | `capability-record.ts` 6 outcomes + `get_solo_rail_activity` read | LIVE |
| **P7 RETURN** | Outcome flows to Rail, Spine, Mind, Business Game Plan | Rail: `record_capability_run`→`paige_workspace_events` (LIVE) · Spine evidence refresh (LIVE) · Mind provenance (PLANNED, F06) · BGP "next move" (consume; BGP owned elsewhere) | PARTIAL / PLANNED |

### Dependency order (what unblocks what)
```
LIVE-NOW spine  ──► P1 OBSERVE ─┐
capability-record(#947) ───────┼► P4 EXECUTE-AUTO ─► P6 REPORT ─► P7 RETURN(Rail leg LIVE)
confirm/approval seam ─────────┼► P5 ASK-FIRST ────┘
draft seams ───────────────────► P3 PREPARE
paige_operating_memory (LIVE) ─► P2 REMEMBER (interim)  ──►  Memory contract (PLANNED) ─► P2 REMEMBER (target)
agent registry (PLANNED) ─────────────────────────────────► named-specialist attribution on P4/P6/P7
PR #591 revalidateAuthority (PLANNED) ────────────────────► account-switch safety across ALL flows
Mind provenance (PLANNED, F06) ───────────────────────────► P7 Mind leg
```
**Build order:** P6/P4 outcome-honesty and P1 observe-with-citation are the live core → then P5 ask-first
tightening → then P2/P7/F03 as their contracts land. Account-switch safety (P#591) is a cross-cutting
prerequisite that gates the `auto` lane for tenant-scoped actions.

---

## 2. Cross-cutting behavior (every flow answers these — real contracts only)

| Behavior | Rule | Source contract |
|---|---|---|
| **Account switching** | resolve authority per turn; on mid-turn tenant change, **fail closed** before model egress / tool execution — refuse, do not act under stale scope | PR #591 `revalidateAuthority` — **PLANNED (open/draft)**; until merged, the `auto` lane for tenant-scoped consequential actions is held to `confirm` (honest degrade), not shipped unguarded |
| **Stale response** | a returned tool result under a since-changed tenant is discarded, not narrated | PR #591 (same) |
| **Retry** | a retried act is idempotent only if the caller passes a stable `runId`; otherwise it writes a second honest row (never silently dedup) | `record_capability_run` `_run_id` (LIVE; documented non-idempotent by default) |
| **Abandonment** | a turn that ends before an outcome is written surfaces as `capability_outcome_unknown`, never as success | `capability-record.ts` outcome vocabulary (LIVE) |
| **Provider failure** | classified at the executor into `failed` / `unreachable` / `outcome_unknown` / `completed_unrecorded` — never "Paige handled it" | `comms-capability-outcome.ts` pattern (LIVE, the template) |
| **Tenant isolation** | every read/write scoped by `current_user_tenant_id()`; DEFINER lenses only; `record_capability_run` enforces active-member in-body | RLS + `get_solo_rail_activity` + `record_capability_run` (LIVE) |

---

## 3. What the owner sees (one conversation — no second inbox, no fake agent chat)

Paige reports every outcome **in the transcript she is already in** (§20/§21). Completed/failed/uncertain
states are the honest sentences from the `_workspace_event_display` projection (#947). Ambient status
(what landed) surfaces in the existing Rail / Command Center surfaces **owned elsewhere** — I consume the
`get_solo_rail_activity` read, I do not build a second surface. No per-specialist chat tab (§0.2). Any
visible change to the conversation surface runs the #955 UI-delivery standard.

---

## 4. Implementation slices (dependency-ordered, each ≤20-mutation-audit)

Each slice names its source contract state, the §18 four-question answer, the failing-first target, and
the DoD. UI-touching slices additionally run the #955 standard (paige-ui-design skill + flow-prototype +
`docs/evidence/ui-delivery/*.md`).

### S1 — Paige-chat consequential actions record an honest outcome (P4/P6) · deps LIVE
Wire each **Paige-chat-owned** consequential action that today writes no `capability_run` (starting with
`deal_move_stage` / `pipeline_attach`) to `_shared/capability-record.ts` **at its executor**, with an
outcome classifier in the `comms-capability-outcome.ts` shape. §18: (1) searched `paige-ai-chat` tool
switch + `_shared/capability-record.ts` + `mcp-outcome.ts`; (2) sibling = the comms/n8n/zapier executors
already wired; (3) no new home — reuse the released helper; (4) no new type-picker. Failing-first:
mutation-audit the classifier (each outcome) + assert the write fires at the executor with the right
`capability_key`. DoD: §32.a/b, §37 (the tool's callers), §39 peer-gate, §58, §50. **First unblocked
slice — see §5.** Scope check: this is consuming the ratified writer, not rebuilding Rail schema.

### S2 — Observe-with-citation hardening (P1) · deps LIVE (partial)
Ensure every Spine `evidence` capability Paige reads in chat renders **citation + freshness + honest
refusal** (found/found-nothing/could-not-check — never collapse, per lesson 0c). §18: extend the existing
Spine evidence read path in `paige-ai-chat`; no new surface. Failing-first: the three-outcome distinction +
staleness boundary per capability. DoD as S1.

### S3 — Ask-first correctness (P5) · deps LIVE
Confirm every mutate/external_effect Spine action resolves autonomy through `resolve_tool_autonomy` +
ceiling clamp BEFORE execution, and that the human-approval flag is bound to a real approval (not a
model-emitted `confirm:true`) for high-impact acts. §18: extend the existing gate; do not fork. NOTE the
Phase-1 finding (report 01 / decision-log): the enforced human gate on some paths is prompt-level — this
slice hardens the binding for consequential acts. **Coordinate with MCP-governance handoff (§6.B)** — the
tool-risk enforcement authority is not mine; I consume its verdict.

### S4 — Report honesty end-to-end (P6/P7 Rail leg) · deps LIVE
Every consequential action's outcome is narrated to the owner from the real `capability_run` row (via the
`get_solo_rail_activity` read), including `capability_completed_unrecorded`. No "Paige handled it" without a
row. Failing-first: assert the narrated sentence matches the recorded outcome; negative-control that a
missing row yields an honest "uncertain," never success.

### S5 — Account-switch safety across flows (cross-cutting) · deps PLANNED (PR #591)
Consume `revalidateAuthority` at model egress + tool execution. **BLOCKED until #591 merges.** Until then,
S1's `auto` lane for tenant-scoped consequential actions is held to `confirm` (honest degrade). Handoff:
track #591; port its seam, don't reimplement.

### S6 — Memory consumption contract (P2 target) · deps PLANNED (§6.A)
Once the Mind/Memory recovery agent publishes the governed Memory contract, wire Paige-chat consumption:
source, scope (tenant/client/conversation), freshness, correction, refusal. **BLOCKED — handoff §6.A.**
Interim P2 keeps the LIVE `paige_operating_memory()` continuity (no new build).

### S7 — Named-specialist attribution (P4/P6/P7 identity) · deps PLANNED (§6.C)
When the agent registry is current+merged, pass `_agent_slug` on `capability_record` writes so outcomes
name the specialist. **BLOCKED — do not invent a slug that resolves to nothing (report 03/#947).** Plan an
adapter around stable internal capability/role identifiers now; ship named routing only post-registry.

### S8 — Mind provenance return (P7 Mind leg / F06) · deps PLANNED
Mind cites the Rail row behind a claim (`rail_provenance_refs`); unsourced claims flagged. Depends on the
Mind contract (§6.A) + Rail read (LIVE). **BLOCKED — handoff §6.A.**

---

## 5. First unblocked slice to build now

**S1** — all dependencies are LIVE (`capability-record.ts`, `record_capability_run`, the executor sites).
It is squarely in-lane (a Paige-chat consequential action producing an honest outcome — F05 mandate), it
reuses the ratified pattern (no new writer/schema), and it is bounded + mutation-auditable. Target the
first silent Paige-chat-owned action (`deal_move_stage`), verify it is still silent on current `main`
before building, classify its outcomes at the executor, prove the classifier with a mutation audit, and
carry the S5 honest degrade (hold `auto`→`confirm` for tenant-scoped acts until #591). It touches no
visible interface, so the #955 UI standard does not gate it (record the reason).

---

## 6. Handoffs (dependencies I consume, do not build)

### 6.A — Mind/Memory recovery agent → the governed Memory contract Paige chat needs
Paige chat needs, per scope: **source** (which store), **scope** (workspace/client/conversation/agent,
tenant-keyed by `current_user_tenant_id()`, never request body), **freshness** (staleness boundary like the
Spine evidence `staleAfterDays`), **correction** (how a superseded fact is marked), **refusal** (found /
found-nothing / could-not-check, distinct — lesson 0c). Until delivered, P2 uses the live
`paige_operating_memory()` continuity only.

### 6.B — MCP dispatch governance / tool-risk enforcement
Paige chat consumes the autonomy verdict (`resolve_tool_autonomy` + ceiling) and the risk classification;
it does not own the enforcement. Handoff: the authoritative "may this run at this lane" decision must be a
server verdict, not a model-emitted flag, for consequential acts (report 01 finding).

### 6.C — Agent registry (canonical specialist identities/placement)
Paige chat needs the approved specialist identities + a stable slug per capability/role to attribute
outcomes. Until current+merged (#921 lineage, at its stop-point), attribution stays capability-keyed;
`_agent_slug` is left null rather than fabricated.

---

## 7. Exit gate (Phase 2)
- [x] Flow Map (P1–P7) with source contracts + truth labels.
- [x] Dependency graph + build order.
- [x] Cross-cutting behavior matrix (switch/stale/retry/abandonment/provider-failure/tenant-isolation) on real contracts.
- [x] Slices sized ≤20-mutation-audit, each with §18 gate + DoD + UI-standard applicability.
- [x] Handoffs for the three not-owned dependencies.
- [x] First unblocked slice identified (S1).
- [ ] Cowork one review pass (per handoff §2.4) — offered.
