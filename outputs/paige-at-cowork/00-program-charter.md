# PAIGE-at-Cowork-Level — Program Charter & Flow-by-Flow Governance

**Owner:** Antonio · **Agent:** dedicated CC session · **Branch:** `claude/paige-cowork-handoff-rpf6dw`
**Opened:** 2026-09-05 · **Target MVP:** 2026-10-03 (Week 4) · **Status:** Phase 1 (Grounding), in progress

> **Read this charter at the START of every program session** (before the five substrate reports,
> before any slice). It is the program's one home (§18) for scope, the mandatory Flow-by-Flow rule,
> and the per-phase gate map. It reloads the discipline that a context reset would otherwise drop
> (§46 / lessons-learned "doctrine stated in chat evaporates").

---

## 0. MANDATORY RULE — Flow-by-Flow governs EVERY phase (owner-directed 2026-09-05, LOCKED)

**Owner directive, verbatim (2026-09-05):** *"I need to make sure that there's a mandatory rule in
place that you use the flow-by-flow skills throughout every phase of this process."*

**The rule.** Every phase of this program — Grounding, Planning, Execution (each weekly slice),
Verification, Ship, Post-deploy, Records close-out, and Retrospective — is executed **through the
`flow-by-flow` skill (v2.0.1)** as the orchestrator, and **`flow-prototype` (v2.0.1)** for any major
UI/UX wave (the Week-3 Trust Compass card). This is not a one-time invocation at kickoff; it binds
each phase and each slice. Root-law backing: **§69** (Flow-by-Flow mandatory on every software task)
+ §1/§14 (crew, never solo) + §5/§39 (independent review) + §32 (verification legs) + §70 (usability
gate). Skill install integrity confirmed at kickoff: **Gate 5 PASS** — both skills present, same
version (v2.0.1), flow-prototype reachable for the approval wave.

**What "used" means (the self-catch, mirroring §69).** Naming the skill and then working the way I was
going to work anyway does NOT satisfy this rule. Each phase must actually: read the routed references
that apply, return the **pre-edit packet** before the first edit (selected mode/depth, affected
actor-goal flows, changed-file boundary, states covered, Regression impact map, failing-first plan,
applicable gates), prove **flow coverage** (not file completion), honor the two owner gates as
modulated by §4/§69 pre-launch override (build through and merge on verified; the material boundaries
still stop me), and report evidence separated by class (§13). **Trigger:** if I am about to edit or
call a phase done and have NOT run its flow-by-flow route + gates, I am already in violation — stop
and run them first.

**Durability.** This charter is tracked in the branch (verified: `outputs/` is not gitignored). On the
first program PR it is ALSO recorded in `docs/brain/decision-log.md` and the master doc
(§BRAIN.3 / §0 same-commit) so the whole fleet inherits the rule, not just this session.

---

## 1. Scope (one paragraph)

Wire PAIGE **into** four existing Command Center surfaces (Business Game Plan · Systems Check · Mind ·
Trust Compass) so she operates at the observable Cowork level across six flows: **F01** multi-hour
orchestration (dispatch → background job → honest next-turn report from Rail) · **F02** tenant-scoped
persistent memory (L8 fabric) · **F03** parallel specialist dispatch + reconciliation (Chief of Staff
over `delegate_to_subagent`) · **F04** Trust Compass posture (5 postures × 5 dimensions, **derived**
from Systems Check + Spine + Rail + Mind + Game Plan — never its own truth) · **F05** named-agent +
non-contact-tied Rail attribution · **F06** Mind cites Rail as provenance. **CC owns the BACKEND**
(contracts, derivation, RPC/edge seams, tenant scope/RLS, verification) and has **ZERO input on
design** (§00) — CC hands Claude Design evidence, never a verdict.

## 2. Non-scope — do NOT touch (§0.3)

Cowork's records dirs (`outputs/records-2026-09-04/*`, `-2026-09-05/*`); Agent 1's spawned queue
(#37/#36/#32/#41/#42/#43/#44 — consume results, never repeat); Slot 4's Communications executor-site
pattern (consume); Slot 5's Solo Campaigns/Social (`492c066`); Twilio metered pass-through billing
(separate slice); the four Command Center surfaces themselves and the tenant CC UI (dependencies, not
this build — no invented Trust Compass UI card).

## 3. Absolute rails (non-negotiable)

Tenant isolation MMA/MCC (connection · workflow · data · agent · activity · UI); §38 discrete
line-item metering for every real-money external action; no fabricated metrics/activity/provider
state; no credentials/raw payloads/internal reasoning in chat/Mind/Spine/Rail; §50 trademark grep on
every diff; §9/§51/§53 tenant/operator seam + tier matrix; §59 DEFINER caller-scope-in-body.

---

## 4. Per-phase Flow-by-Flow gate map

| Phase | Flow-by-Flow mode / route | Depth | Gates that bind |
|---|---|---|---|
| **1. Grounding** | Existing Project / Audit (`references/audit.md`) — reverse-map the five substrates | Deep (crew of scouts + CC integrator) | §13 file:line citations; CC verifies prod facts itself (§0/§BRAIN.2) |
| **2. Planning** | Foundation decomposition — `00_Flow_Map.md` (F01–F06), dependency graph, ≤20-mutation slice sizing; `references/delivery.md` | Deep | §18 four-question gate per new surface/RPC/table; Cowork one review pass before build |
| **3. Execution (per weekly slice)** | `references/build.md` per-flow loop — re-read seams → failing-first test → build every state → verify Regression map → capture proof | Deep (R2/R3 floors: contracts, persistence, RLS, payments) | §32.a/.b/.c · §37 producer inventory (8 caller classes × tier) · §39 peer-gate · §58 anti-regression · §50 grep. **flow-prototype approval gate before the Week-3 Trust Compass UI** |
| **4. Verification (per slice)** | `references/verification.md` gates, proportional | per risk | The handoff's 4 gates (§18 · §32 dual-leg · §37 · §39) + the 13-item Definition of Done |
| **5. Ship (per slice)** | §4 merge-on-verified — green CI + peer-gate SHIP + DoD → merge → deploy | — | Stop only for destructive migration / credential rotation / live-customer mutation |
| **6. Post-deploy scan (per slice)** | `references/build.md` operations proof + §32.c | per risk | §32.a persisted-apply confirm; §32.c authenticated drive (or explicitly OWED, §32 capability-conditional) |
| **7. Records close-out (per slice + weekly)** | Update durable truth | — | §BRAIN.3 brain + §0 master doc + §66 tier-matrix, all same-commit |
| **8. Retrospective (Week 4)** | Review + lessons | — | New lessons → `docs/brain/lessons-learned.md` |

## 5. Flow dependency order (from the handoff)

Runtime headroom (F01) → Memory (F02) + Specialists (F03, needs PR #921) → Records Wave (F05, needs
owner ruling on `paige_client_events.actor_type` widen vs. new `paige_workspace_events`) → Trust
Compass Wave 1 (F04, needs F05 ≥ Wave 1 + flow-prototype approval) → Mind adopts Rail (F06) + Trust
Compass Wave 2 Accountability refinement (needs F05 named-agent rows).

## 6. Open blockers (live)

1. **`docs/doctrine/sdlc.md` / "§63 SDLC" absent on main** — on main §63 = Owner's-real-accounts,
   §64 = Cloud-first. Executing against the handoff's INLINED gates (§4.1–4.4) + 13-item DoD (§4.5) +
   real CLAUDE.md §32/§37/§39/§58/§70. Cowork to reconcile the numbering.
2. **Cowork records not in repo** — `outputs/records-2026-09-*` (incl. coordination-log Entry #9) not
   committed here; executing from the handoff + in-repo grounding; their concepts are covered by
   existing brain lessons. Need them committed/linked or confirmation the handoff supersedes.
3. **Phase-3 deps:** Agent 1's queue must land before Week-1 T1.1; PRs #591/#576/#4 reconcile (T1.2);
   PR #921 gates F03; F05 needs the actor_type owner ruling.

---

*This charter is LIVING for phase status; §0 (the mandatory Flow-by-Flow rule) is LOCKED by owner
directive 2026-09-05 and changes only by owner ruling.*
