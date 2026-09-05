# Phase 1 Synthesis & Exit Gate — PAIGE-at-Cowork-Level

**Date:** 2026-09-05 · **Base:** `b0af098` · **Method:** 5 read-only Explore scouts + CC live-prod
verification (Supabase MCP `xygzykjyynhzqytbqnzu`) + GitHub PR reads. Flow-by-Flow **Audit route, Deep**.
Reports: `01-grounding-runtime.md` · `02-grounding-memory.md` · `03-grounding-specialists.md` ·
`04-grounding-trustcompass.md` · `05-grounding-records.md`.

---

## Exit-gate checklist (handoff §1.3)
- [x] All five grounding reports exist in `outputs/paige-at-cowork/`.
- [x] Every claim cites `file:line` (scout) or is CC-verified against prod/GitHub (labelled).
- [x] The three brain guardrail lessons (fix-the-class · silent-success · force-push-past-divergence) reread;
      their symptoms are on the watch list (charter §3 + the per-slice DoD).
- [x] Zero blocking questions about **what exists on `main` today** (the open items are owner *rulings* about
      what to build, not unknowns about current state).

## The six flows — current readiness (CC-verified)
| Flow | Substrate state today | Biggest gap | Owner ruling needed? |
|---|---|---|---|
| **F01** runtime | 45s in-turn ceiling; a COMPLETE dispatch→poll loop exists but gated off + unscheduled; `paige_workflow_runs` live (0 rows, CHECK ok) | Activation + gate's 2 contracts (one couples to F04); next-turn honest read-back is net-new | Yes (reuse-gated vs new; job store) |
| **F02** memory | **Cross-session resume already works** via `paige_operating_memory()` + thread summaries (tenant-scoped, wired). `paige_owner_memory` tenant path unwired (0 tenant rows) | Depends what F02 *means* | **Yes — Interp A vs B** |
| **F03** specialists | Single-slug sequential only; no parallel, no reconciliation; `paige_agents` absent; `paige_subagents` 24 platform-default | Parallel dispatch + reconciliation (new); VP names gated on #921 | Yes (VP-named vs slug; disagree threshold) |
| **F04** trust compass | Ceiling/autonomy substrate live (`resolve_tool_autonomy`, `trust_effective_rung()`, `systems_check_snapshot`); NO posture RPC, NO card, NO capability→dimension map | The whole derivation layer + `resolve_trust_compass_posture` RPC; Accountability blocked on F05 | Yes (posture cardinality/unit) |
| **F05** records | Named-agent + capability_run **schema LIVE on prod, 0 rows use it**; ~47 actions silent; `authenticated` can't read `paige_client_events` (#746) | Wiring writers (couples to F03) + non-contact coverage | **Yes — ratify merged design** |
| **F06** mind | No Mind store; UI Mind doesn't read Rail; 1 chat spine domain cites `rail:` | Mind→Rail read contract + `rail_provenance_refs` + unsourced flag | No (follows F05) |

## Dependency graph (corrected with prod facts)
```
Agent-1 queue (#37/#36/#32/…)  ─┐
PR #576 + #591 (own paige-ai-chat) ─┤→ F01 runtime ─┐
                                    │                ├→ F04 Trust Compass Wave 1
F05 Rail writers (schema live) ─────┼→ F05 ──────────┘   (Accountability needs F05; consult seam shared w/ F01)
PR #921 (registry, owner-gated) ────┤→ F03 specialists
                                    └→ F02 memory (sequence WITH #591, not ahead)
F05 ───────────────────────────────────→ F06 Mind-cites-Rail + F04 Wave 2 (Accountability)
```
**Corrected sequence:** Runtime headroom (F01) → Memory (F02) + Specialists (F03) → Records writers (F05) →
Trust Compass Wave 1 (F04) → Mind adopts Rail (F06) + TC Wave 2. F04's `trust_compass_autonomy_consult`
contract is the SAME seam F01 needs to lift its gate — build it once (§18).

## Cross-cutting findings (integrator)
1. **F01↔F04 are coupled by one seam.** F01's gated loop refuses without a `trust_compass_autonomy_consult`
   contract; F04's job is exactly that consult at `decideGovernedExecution`. Sequence so F04's posture consult
   is the contract F01 activates against — do not build two.
2. **F03↔F05 are coupled.** Named-agent Rail attribution (F05) needs each executor to know which specialist
   acted — which the F03 Chief-of-Staff dispatch is what produces. The reconciliation citations (F03) and the
   `actor_agent_slug` writes (F05) are the same "which agent did this" fact.
3. **F02 may be a proof task, not a build** — the working resume rides on a different substrate than the
   handoff names. This is the single highest-value owner ruling (could save a week).
4. **§13 corrections banked from prod (CC's check wins, §0):**
   - Brain `paige-spine-and-rail-state.md` says #925 "not yet applied to production" — **STALE; it IS applied.**
     Fix in the first program PR (§BRAIN.3).
   - Handoff assumed `paige_subagents.autonomy_lane`/`scope` columns — **neither exists.**
   - Scout feared `paige_workflow_runs` status CHECK mismatch — **prod CHECK already includes
     succeeded/cancelled; no mismatch.**
   - `trust_effective_rung` is **no-arg**, not `(uuid)`.
   - Handoff's ~180s in-turn ceiling is really **45s** (edge platform ceiling is separate, unconfirmed).

## CONSOLIDATED OWNER DECISIONS (needed to start Phase 2 build design)
Each has a CC recommendation; several are "ratify," a few are genuine forks.
1. **F02 scope — Interp A vs B.** *A:* F02 = "resume works" → largely done via `paige_operating_memory`; Phase-4
   proof + maybe a short-session summary write. *B:* F02 = tenant durable-facts in `paige_owner_memory` → real
   build (tenant composer + 4b writer). **Rec: confirm A as F02's MVP; schedule B as the tier-gated durable-facts
   upgrade.**
2. **F05 Rail design — ratify or override.** **Rec: RATIFY** the merged design (5-value `actor_type` +
   `actor_agent_slug`/`actor_agent_label` + `paige_workspace_events`); do NOT widen `actor_type`.
3. **F03 v1 identity — VP-named vs slug.** **Rec:** build parallel-dispatch + reconciliation on existing slugs
   now; treat VP names as an overlay gated on your review of **#921** (which is at its stop-point with 4 open
   decisions — those are a separate ask, below).
4. **F04 posture cardinality + unit.** Are "Not Ready" and "Paused" both `off` (or is one distinct)? Is posture
   resolved per-`capability_key`, per-department, or both? **Rec:** per-`capability_key` with a department
   roll-up for display; Not Ready = `off`+`not_ready` reason, Paused = `off`+`paused` reason (same lane,
   distinct reason).
5. **F01 executor — reuse the gated loop vs a narrower new path**, and which job store. **Rec:** reuse
   `dispatch-queued-workflow-runs` + `paige_workflow_runs`, supplying the budget + Trust-Compass-consult
   contracts (the latter shared with F04); add the cron.
6. **#921's 4 open decisions** (finance→MERIT; MASON vs generic Automation Agent; OATHEN/SCRIBE names; do named
   specialists become visible on Solo) — these gate F03's identity overlay. Separate from the mechanics.

## What is NOT blocked and can start immediately in Phase 2
Planning (Flow Map, dependency-ordered slices, §18 four-question gates) needs none of the rulings resolved to
begin — the rulings shape *slice content*, not whether planning proceeds. F01/F05 mechanics and F02-Interp-A are
buildable on current `main` state once the PR-collision reconcile (T1.2) and Agent-1 queue (T1.1) land.

## OWED (carried into later phases)
- §32.c authenticated live-drives (no browser/live creds this session) for every flow's runtime behavior.
- Prod env-secret presence for cheap-tier keys + the exact edge wall-clock (owner/CI).
- The §BRAIN.3 fix to `paige-spine-and-rail-state.md` (#925 applied).
