# Paige Agent AI — Harness Upgrade: Phase 1 Current‑State Reconciliation

**Date:** 2026‑09‑12 · **Base:** fresh `main` `a22d4b9` · **Branch:** `claude/paige-os-integration-82ywpq`
**Workstream:** upgrade the one shared Runtime Harness so its three operating layers become explicit,
enforceable, testable, and visible — using existing canonical homes, never a second source of truth.

## What this document is, and is not

This is a **reconciliation record** that cites and feeds the existing canonical homes. It is **not** a
second Master, Brain, Spine, Ledger, Rail, Memory, registry, or "Mission Control." The authoritative
records remain:

- `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §3 (the Runtime Harness decision) and §4 (Shipped Delivery Log)
- `docs/brain/paige-brain-wiring-standard.md` (the six‑part capability checklist + coverage ledger)
- `docs/brain/paige-spine-and-rail-state.md`, `docs/architecture/paige-spine-tool-migration-map.md`
- `docs/binding-ledger/` (Surface Binding Ledger), `docs/integration-registry/` (Integration Registry)
- `docs/brain/paige-memory-contract.md`, `docs/doctrine/governed-execution-seam.md`,
  `docs/doctrine/one-approval-gate.md`, `docs/doctrine/command-center-four-surfaces.md`
- The Experience Quality Layer: `docs/doctrine/paige-ui-delivery-standard.md` + the `paige-ui-design`
  skill + `scripts/ci/ui-delivery-evidence.mjs` + `docs/evidence/ui-delivery/TEMPLATE.md`

Where a finding re‑grounds a canonical home (e.g. a stale Spine count), the fix lands in that home in
the implementing PR; this doc records the delta, it does not replace the home.

## Evidence boundary (§13)

- The reconciliation was produced by a five‑specialist read‑only crew plus a first‑hand guard run.
- **No production catalog access this session** (`mcp__Supabase__*` returned permission errors; `edge-live`/
  `db-live` tags absent from this clone). Every "deployed/reachable" claim therefore rests on documented
  closeouts (Master §4, decision log), **not** observed prod state, and is marked accordingly.
- **The CI governance guards were run first‑hand** on `main a22d4b9`; those results are verified here.

---

## VERIFIED FINDING 1 — `main` fails three governance guards, and they do not block merges

Run first‑hand on `a22d4b9` (true exit codes):

| Guard | Result | What it caught |
|---|---|---|
| `lint:chat-tool-registry` | **FAIL (1)** | `social_post`, `social_accounts`, `social_analytics` have no canonical Spine capability declaration; `integrations_list` must enter Chat via its adapter; 8 tools over the frozen baseline of 94 |
| `lint:action-risk` | **FAIL (1)** | `social_post` and `improvement_propose` are **unclassified writes** ("an action with no classification cannot run, on purpose") |
| `lint:views` | **FAIL (1)** | a public view is missing `security_invoker=true` (§9/§30 tenant‑isolation guard) |
| `lint:release-governance` | errored | `ajv` not installed in this sandbox — a **local tooling gap, not a content failure**; excluded from the finding |

GREEN: `tool-catalogue`, `governed-execution`, `approval-gate`, `action-authority`, `binding-ledger`,
`integration-registry`, `definer-fns`.

**Interpretation.** These reds shipped via the recent Social/Conversations work **past guards that caught
them** — which means the guards are advisory, not required branch‑protection checks (`OPS.md` names only
`ci / verify`, `lint`, `audit` as intended‑required). This is precisely the "enforcement, not
self‑attestation" hole this upgrade exists to close.

**Handling (boundary‑safe).** The unclassified writes and the missing view‑invoker live in the
Social/Conversations workstreams (other owners). They are **not fixed here** (§ do‑not‑absorb‑workstreams /
§58). They are filed to the PAIGE Attention Register and flagged to the owner; Phase 3 makes the guards
blocking so this class cannot recur.

## VERIFIED FINDING 2 — the canonical Runtime‑Harness docs are stale (§13/§BRAIN drift)

The guards report **26 Spine capabilities / 102 inline tools** on `main`; `paige-spine-and-rail-state.md`
still says 17 and `paige-spine-tool-migration-map.md` still says 105/1. The recent Social/Integrations
commits added tools + migrations **without the §BRAIN.3 same‑commit update**. Re‑grounding those two homes
to current `main` is part of this workstream (minimal, additive edits to the canonical homes).

## CORRECTION (§13) — LLM spend is metered, not unmetered

A prior report of mine characterized Paige's spend as "observable but unmetered." That was wrong, and is
corrected here. Spend **is** metered into `platform_usage_events` (hourly cron verified 102/102 on prod,
~22.8M tokens; `decision-log.md:928‑942`). Writing to `platform_metered_events` was an owner ruling that
that table is the wrong home. The real gaps are: **budget enforcement** coded + merged (router‑budget at
three chokepoints) but **PROOF OWED** (no production gate hit observed; fires only once `tenant_id` is
resolved), and **billable UNAVAILABLE** (Stripe metered‑item attach missing).

---

## Reconciliation — Runtime Capability Layer

Truth labels: LIVE / PARTIAL / UNAVAILABLE / PROOF OWED / UNVERIFIED. "Home" = the canonical record each
gap extends.

| # | Function | Location | Truth | Biggest gap / next gate | Home |
|---|---|---|---|---|---|
| 1 | Identity & scope | `current_user_tenant_id()`, `src/lib/tier/tierFeatures.ts`, `_shared/owner-context.ts`, `paige-mcp` tier gate | PARTIAL | §59 global‑role trap recurs where reachable (escalation pop = 0 today); `table:`‑only tools rest on RLS, per‑tool UNVERIFIED. Gate: tenant‑scoped role predicate everywhere + per‑tool RLS proof | `config-registry.md`/`roles-permissions.md` |
| 2 | Context assembly | `_shared/owner-context.ts` (§52), `paige-context-router`, `_shared/session-memory.ts` + `paige_prompt_memory` (voyage‑3) | PARTIAL | "distributed composers"; one governed freshness‑aware assembler is PROPOSED only (`paige-context-assembly-contract.md`, #1094, docs‑only). A tenant's general question reaches no Spine evidence (loads only in a client‑scoped turn). Gate: move the contract to a callable seam | Master resp.#1; context‑assembly contract |
| 3 | Capability manifest | `_shared/paige-spine/registry.ts` (26 caps, import‑time `validateSpineRegistry`), `contracts.ts`, `resolveEvidence.ts` | PARTIAL | The derived tenant‑safe "verified capability manifest" Master specifies does **not** exist; Self‑Knowledge/Migration Advisor UNAVAILABLE. Docs stale (17/1 vs 26). Gate: re‑ground the counts; manifest adapter | `spine-and-rail-state.md`, migration‑map, Master §3 |
| 4 | Skills & specialist roles | `_shared/skill-interpreter*.ts`, `skill-runner`, `skill-forge`, `paige_skills.allowed_tools` | PARTIAL (skills) / UNAVAILABLE (specialist activation) | Runtime skill‑version eligibility loop not enforced; no VP/specialist is an activated governed worker (roster = doctrine). Gate: runtime‑eligibility proof per skill | `paige-skills-inventory.md`, `paige-c-suite-roster.md` |
| 5 | Planning & orchestration | inline agentic loop in `paige-ai-chat`, `paige-action-worker`, `plan_*`/`action_*` tools | PARTIAL | No governed multi‑step planner distinct from the chat loop; `delegate_to_subagent` is **Keep‑unavailable** (service‑role, outside the approval gate). Gate: extend the durable‑job contract to governed multi‑step delegation | `paige-durable-job-contract.md` |
| 6 | Tool / action execution | inline `paige-ai-chat` (102 tools) + `_shared/action-risk.ts` (62 classified) + `paige-mcp`; shared seam `_shared/paige-spine/governedExecution.ts` (38KB, **unadopted**) | **PARTIAL, with live drift** | Nothing adopts the shared seam; 8 new tools unclassified/unregistered (Finding 1); `paige-mcp` refuses all mutations and carries no autonomy resolution. Gate: classify+register the 8 tools, re‑freeze baseline, re‑ground migration‑map | migration‑map, `governed-execution-seam.md` |
| 7 | Approval / autonomy policy | one gate: `paige_pending_confirmations` + server fingerprint; `_shared/action-risk.ts`; `resolve_tool_autonomy`/`trust_effective_rung`; RE‑2 substrate migrations | PARTIAL / UNVERIFIED at runtime | The gate is the one authoritative path (enforced inline); the Solo Trust Compass dial is **render‑only/non‑authoritative**, runtime clamp UNVERIFIED; RE‑2 adoption UNVERIFIED; `paige-mcp` has zero autonomy resolution. Gate: runtime‑enforcement proof + seam adoption | `autonomy-architecture.md` §10, `one-approval-gate.md` |
| 8 | Connection & secret mgmt | `integration-capability-registry.json`, `tenant_mcp_connections`, Vault via `read_channel_secret` (DEFINER) | PARTIAL | Only 2 registry entries LIVE; most providers PARTIAL/PROOF_OWED/UNAVAILABLE; comms charge leg `charge_wired:false`; "no provider is autonomous." Gate: per‑provider OAuth + receipts; M1 spend control for money‑moving providers | Integration Registry (in‑commit per provider PR) |
| 9 | Durable jobs & recovery | `paige-action-worker`, cron workers, claim primitives `claim_due_weekly_summaries` (`FOR UPDATE SKIP LOCKED`, migration `20270106000000`), correlation `20270107000000` | PARTIAL (first adopter LIVE for claim semantics; receipts PROOF OWED) | No uniform idempotent‑claim/retry/recovery/visible‑state contract across all jobs; receipt contract is slice‑1. Gate: second adopter + a correlated receipt from a real run | `paige-durable-job-contract.md`, `paige-receipt-rail-contract.md` |

### Runtime data/continuity + cost

| # | Function | Location | Truth | Biggest gap / next gate | Home |
|---|---|---|---|---|---|
| 10 | Canonical readback | `_shared/business-mission-tenant-brain.ts` (write→scoped re‑read→match→Rail‑only‑on‑match); Campaign Brief lane | PARTIAL (LIVE for Mission + Campaign Brief) | Universal enforcement across all mutating paths owed; authenticated owner browser proof owed. Gate: authenticated Solo‑owner drive of the lifecycle | Master resp.#6; per‑domain RPC |
| 11 | Receipts & Rail | `record_capability_run` (`20261212000000`), `_shared/capability-record.ts` (`redactDetail`), `get_solo_rail_activity` | PARTIAL | Owner‑visible Rail **is reachable at Solo** (Compass/Team/Systems‑Check) — correcting an earlier blanket UNAVAILABLE — but **0 `capability_run` rows on prod**, only 11 of ~54 caps wired, and `#746` collapses a denied read to "nothing yet" on 2 of 4 consumers. Gate: close #746; land the first real receipt | `paige-receipt-rail-contract.md` |
| 12 | Brain / Mind / Memory boundaries | Memory: `record_/get_/forget_paige_memory` over `paige_owner_memory`+`client_memory`; Mind: Spine registry + `resolveEvidence.ts` | PARTIAL | Memory store+seam LIVE; **confirmed‑only runtime projection UNAVAILABLE**; chat auto‑write DEFERRED; Mind authenticated‑evidence flow = NO everywhere. Gate: build the confirmed‑only projection; Mind SCR‑1/2/3 (not yet raised) | `paige-memory-contract.md`, mind‑integration‑matrix |
| 13 | Model routing & cost | `_shared/model-router.ts`, `_shared/llm-trace.ts`→`paige_llm_trace`, `_shared/router-budget/mod.ts` (3 chokepoints), meter `20261033000000`+`20261038000000` | PARTIAL | Routing + trace + metering LIVE; **budget enforcement PROOF OWED** (no prod gate hit; only fires once `tenant_id` resolved — pre‑identity calls ungated, UNVERIFIED which sites); **billable UNAVAILABLE** (Stripe attach missing). Gate: observe/force one prod gate hit | `paige-router-budget-contract.md`, `platform_usage_events` |

## Reconciliation — Experience Quality Layer

Overall: **LIVE as a routing/attestation guardrail; UNVERIFIED as independent proof or as a blocking gate**
(the #955 standard; 42 evidence records in active use).

| # | Function | Truth | Biggest gap |
|---|---|---|---|
| 15 | Experience quality | PARTIAL | No Owner‑Intent "must‑not / must‑preserve" contract; **no protected‑seam declaration field**; CI validator **fires only on UI files** (backend/RPC/edge/entitlement/provider changes that break a visible flow are not routed); likely **advisory, not a required check**; one flat doctrine file with no composable module structure; monolithic evidence template not partitioned for composable skills — **◆ partly superseded; see "Implementation delta (Phase 2/3)" below** |

Delta to five composable skills (route back to the ONE doctrine; content mostly exists):
**A. Owner Intent Fidelity** — needs the must‑not / must‑preserve fields + a doctrine anchor.
**B. Visual & Immersive Quality** — needs a positive motion‑purpose field (only `REDUCED_MOTION` today).
**C. Interaction Geometry & Accessibility** — strongest; the 8 Solo‑viewport records + a11y fields exist.
**D. Protected Behavior Regression** — needs the protected‑seam declaration as a required, CI‑parsed field.
**E. Release Acceptance & Evidence** — strongest; 7 release fields + the attestation‑rejection engine exist.
Constraint: the pinned‑bundle hash guard (`ui-delivery-evidence.mjs`) hard‑codes `paige-ui-design/vendor/…` —
keep the vendored bundle under one owning skill or verification breaks. New fields must be
**backward‑compatible** so in‑flight UI PRs don't break.

## Reconciliation — Owner Operations & Learning Layer

| # | Function | Truth | Biggest gap |
|---|---|---|---|
| 14 | Evaluation & safe learning | PARTIAL (PROOF OWED) | PROPOSE‑only wall **holds** (no silent self‑modification); apply→verify→outcome tail **unbuilt**; proposals have **no surface** (chat‑only); `paige-evaluator`/`paige-heartbeat` **absent from `config.toml`** → crons 401'd (reachability bug). Gate: `verify_jwt=false` for the beats; a proposals surface on an existing home; define the apply/verify/record lane |
| 16 | Security, privacy, tenant isolation | PARTIAL | Approval fingerprint + Rail containment + CI classification are prod‑verified; open defects `#824` (record_rail_event writer global‑role trap), `#802` (Analytics readers collapse refusal→empty), lockfile drift (security‑audit audits `package-lock.json`, prod uses `bun.lockb`); **no owner‑visible security‑posture surface** |
| 17 | Release, monitoring, recovery | PARTIAL | Deploy pipelines real + loud‑failing; `premerge-migration-proof` **advisory not required**; **zero release records exist**; no automated rollback; monitoring operator‑scoped, external leg not built |
| + | Observability & owner control | PARTIAL & scattered | **No single owner‑visible operating view** — missions on Game Plan, cost in Billing, proposals in chat, release in the banner, monitoring operator‑only; several facets hollow (0 receipt rows, capacity‑only agent attribution, `#746`). Gate: unify on the four Command Center surfaces + Rail, never a new destination |

---

## Affected‑flow & collision assessment (pre‑edit gate)

**Actor/goal:** every build agent + the owner; make the Harness's three layers explicit/enforceable/
testable/visible without forking a source of truth or absorbing any feature workstream.

**Collision verdict per target file (from the scout + `git log`):**

- **SAFE:** `docs/doctrine/paige-ui-delivery-standard.md`, `docs/evidence/ui-delivery/TEMPLATE.md`,
  `.github/PULL_REQUEST_TEMPLATE/ui-delivery.md`, `.github/workflows/ui-delivery-evidence.yml`, and any
  **new** skill files under `.agents/skills/` + `.claude/skills/`.
- **CAUTION — blast radius:** `scripts/ci/ui-delivery-evidence.mjs` gates every open UI PR → new fields
  must be backward‑compatible (opt‑in / warn‑first), never hard‑required on all PRs at once.
- **CAUTION — coordinate:** `.agents/skills/paige-ui-design/**` vs the just‑landed #1130 design set; keep
  the `.claude/` and `.agents/` copies in sync.
- **HIGH collision:** `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` (~10 open PRs append; #907 "owns" it),
  `docs/brain/paige-brain-wiring-standard.md` (most actively rewritten), `CLAUDE.md` (five 2026‑09‑11 owner
  rulings pending insertion) → keep edits **minimal, additive, append‑only**; expect rebase at merge.

**Active workstreams — NOT absorbed:** Main Chat/Conversations Intelligence, chat transcript scroll
(reopened P0), Approvals/receipts/Rail (marathon core), Social Studio, Solo signup/paywall, Live
Conversation, Secure Browser, Client Portal, account choice, billing/entitlement. This workstream
**strengthens the shared Harness and enforcement around them**, touching none of their feature code.

**Protected‑seam declaration (§58):** this workstream edits **doctrine + skills + CI + evidence templates +
reconciliation docs only**. It does **not** change: tenant/workspace/client isolation, authentication/
account choice, entitlement/signup/paywall/billing, the approval/autonomy/authority rules, Spine tool
execution, canonical writes/readback, Rail/receipts/audit/Memory boundaries, chat transcript scroll/stream/
identity/pop‑out/hydration, Live Conversation state, Secure Browser/Vault credential boundaries, durable‑job
scheduling/retries/idempotency, responsive shell geometry, or secrets handling. Any change that would touch
one of these is out of scope and is routed to its owner. The pre‑existing guard reds in Finding 1 are
**not introduced by this workstream** and are declared so in the implementing PR's evidence.

## Sequenced plan (Phases 2–6)

1. **Phase 2+3 (core):** split the one UI‑delivery standard into five composable skills (adding the missing
   Owner‑Intent contract + protected‑seam declaration as **backward‑compatible** fields); route
   backend/RPC/edge/entitlement/provider changes that alter a visible flow into the evidence gate; add a
   safe session‑start routing check; verify branch protection and, if advisory, surface the exact
   Settings‑side change to make the gate blocking (cannot be set from code).
   **✓ Shipped `09ac5ef`/`974849e`/`9625a35`/`2456f02` — see "Implementation delta (Phase 2/3)" above.
   Remaining: the branch‑protection Settings step (owed as an owner action).**
2. **Phase 4:** authenticated test‑environment plan (dedicated non‑customer test tenant + live‑drive),
   stopping for any credential/provider/billing/production step.
3. **Phase 5+6:** owner‑visible operating view + the safe‑learning apply/verify/outcome tail (extending the
   four Command Center surfaces + Rail, never a new "Mission Control"), and the benchmarking practice.

Nothing merges, deploys, or touches a provider/credential/billing/production without explicit owner approval.

## Implementation delta (Phase 2/3) — appended 2026‑09‑12, supersedes the noted snapshot items

This reconciliation's current‑state table is a snapshot at base `a22d4b9`. The following Phase 2/3
commits on this branch have since changed the Experience‑Quality facts, so **row 15's two bolded
items and plan item 1 below are superseded where noted** (the row stays as the honest base snapshot
per §58 — marked, not rewritten):

- **Phase 2 (`09ac5ef`, review‑fixed `974849e`):** the one flat standard now routes to **five
  composable quality skills** (`paige-owner-intent-fidelity`, `-visual-immersive-quality`,
  `-interaction-geometry-accessibility`, `-protected-behavior-regression`, `-release-acceptance-evidence`),
  adding the missing **Owner‑Intent "must‑not / must‑preserve" contract** and the **protected‑seam
  declaration field** (`PROTECTED_SEAMS`) as backward‑compatible, recognized‑but‑optional evidence
  fields. → closes "no Owner‑Intent contract" and "no protected‑seam declaration field" in row 15.
- **Phase 3a (`9625a35`, reviewers clean):** the CI validator now **recognizes** the six optional
  five‑skill fields (validated only when present, never required) and **routes a DECLARED
  backend→visible change** (`Visible-Flow-Impact: yes|true` trailer on a `supabase/functions/**` or
  `supabase/migrations/**` change) into the same evidence gate. → supersedes "fires only on UI files".
- **Phase 3b (`2456f02`):** the session‑start routing card ships as a **versioned, per‑operator
  local opt‑in** (not an auto‑wired repo‑wide hook, because `.gitignore` treats `.claude/settings.json`
  + `.claude/hooks/` as never‑committed local state — reversing that is an owner call). → delivers plan
  item 1's "safe session‑start routing check" within the gitignore policy.

**Still open from row 15 / plan item 1 (not yet superseded):** whether `ui-delivery-evidence` is a
**required** branch‑protection check (still believed advisory; the Settings‑side change cannot be made
from code and is owed as an owner step — Phase 3 close). The optional fields are recognized but **not
yet required**; any cutover to required is a dated, announced step, never silent.

1. `main` fails `lint:chat-tool-registry` + `lint:action-risk` (unclassified writes `social_post`,
   `improvement_propose`; unregistered social tools) — Social/Conversations workstream.
2. `main` fails `lint:views` (a public view missing `security_invoker=true`) — §9 isolation.
3. `paige-evaluator` + `paige-heartbeat` absent from `supabase/config.toml` → cron beats 401'd — learning/
   proactive workstream.
4. Canonical Harness docs stale (26 caps / 102 tools vs documented 17/105) — re‑grounded by this workstream.

(#824, #802, #746 are already tracked.)

## Phase 4 — authenticated test environment (reconciled 2026‑09‑12)

§BRAIN: answered "do we have X?" from the record before designing anything. The authenticated-proof
approach Phase 4 asks for **already exists** — so this is reconciliation, not a second plan (§18).

| Piece | Where | State |
|---|---|---|
| Dedicated least‑privilege Solo test tenant + user spec (never owner PII; never send/spend/operator/cross‑tenant; empty + populated states) | `docs/delivery/solo-test-tenant-spec.md` | COMPLETE spec |
| One‑home headless Chromium launch/resolve + honest result (never fabricates success, never logs page‑derived data) | `scripts/live-drive/live-drive.mjs` | LIVE helper (§32.c) |
| Auth‑gated prod drive template (env‑only creds; self‑skips when prod/creds unavailable) | `scripts/live-drive/example-b-authed-prod.template.mjs` | LIVE template |
| ~40 surface drive scripts (sign‑in, mutation, readback, a11y, scroll, account‑choice, settings, connections, sales, catalog, comms…) | `scripts/live-drive/*.mjs` | LIVE |
| Credential contract (`LIVE_DRIVE_EMAIL`/`LIVE_DRIVE_PASSWORD`, env‑only, rotatable, burn‑if‑real) | spec §3 + `scripts/live-drive/README.md` | DEFINED |

The directive's repeatable flows (sign‑in / onboarding / approval / mutation / readback / receipt /
retry / failure / recovery / release smoke) map onto the existing drive scripts + `liveDrive` building
blocks; a new flow is a new `*.mjs` that calls `liveDrive` (one home, §18) — no new harness.

**The one thing owed is an OWNER action — the exact stop condition the directive names.**
`solo-test-tenant-spec.md` §7 states it: the owner (a) provisions the dedicated least‑privilege Solo
test tenant + user as specified, and (b) sets the two secret **names** (`LIVE_DRIVE_EMAIL` /
`LIVE_DRIVE_PASSWORD`) in the CI environment. Provisioning a real authenticated account + a CI secret
is a credential/account action — not code, and not something a headless agent can or should self‑serve.
Until then every auth‑gated drive self‑skips honestly (§13) and authenticated‑runtime rows stay
`UNVERIFIED` / `PROOF OWED`.

**Honest limit (§13):** this converts *tenant‑tier* claims only. Operator surfaces + Act‑as need
operator authority the account must never hold and stay owner‑verified by design.

**Phase 4 status:** DESIGN + IMPLEMENTATION of the approach = DONE (pre‑existing, reconciled here);
ACTIVATION = blocked on the owner step above — surfaced, not worked around. No second test‑env spec
created.

## Phase 5 — owner operations, observability & safe learning (reconciled 2026‑09‑12)

Phase 1 already diagnosed this layer (functions 13–17 above). Phase 5 reconciles that diagnosis against
the directive's ask, states which part is already satisfied, and bounds the gap — it does **not** build
a new surface blind (the owner‑visible VIEW is Claude Design's, §00) or absorb another lane's crons (§00
scope / standing order).

**Already satisfied — the load‑bearing governance requirement.** The directive's hard rule is *"the
system may recommend but must not silently rewrite skills, rules, budgets, or prompts."* That
**PROPOSE‑only wall HOLDS today** (function 14): there is no silent self‑modification path. The
improvement lifecycle the directive names — evidence → diagnosis → proposal → **owner decision** →
controlled implementation → verification → recorded outcome — is the existing doctrine stack, not new
law: §14/§15 (propose→confirm, never presume), §34/§26 (Paige owns her intelligence; learning is
gated), §67/§68 (autonomy is granted to a process and decays; nothing acts unattested), §13 (honest
outcome, never hoped‑for), §BRAIN (record the result). Phase 5 must **reuse** that stack, not fork it.

**Observability substrate that already exists** (so the owner view is wiring, not invention): the
`paige_llm_trace` store (L1), `paige_audit_log`, the action bus + `paige_action_kinds` (mission/approval
state), router metering → `platform_usage_events` (cost), Rail/receipts (`paige-receipt-rail-contract.md`),
the ReasoningPanel (L7 transparency), and the four Command Center surfaces
(`command-center-four-surfaces.md`).

**The bounded gap (not built here — why each is out of this slice):**
1. **The apply→verify→record TAIL of the learning loop is unbuilt** (function 14). Defining + building
   that lane is real backend work that belongs with the **learning/proactive workstream** — which also
   owns `paige-evaluator`/`paige-heartbeat` (the crons currently 401'd for want of `verify_jwt=false` in
   `config.toml`). Absorbing it here would cross into an active lane (§00 scope / standing order "do not
   absorb unrelated workstreams"). Surfaced, with the smallest safe next step: register the two beats in
   `config.toml` and define the apply/verify/record lane as its own Gate‑A slice.
2. **A proposals / owner‑ops VIEW** (proposals are chat‑only today; no owner‑visible security‑posture or
   release‑record surface — functions 14/16/17). Its **visual direction is Claude Design's** (§00); it
   must **extend the Command Center four surfaces + Rail, never a new "Mission Control."** That is a
   CD‑pack + Gate‑A dependency — CC wires the (already‑collected) data behind whatever CD draws; CC does
   not invent the surface.
3. **Release records + automated rollback** (function 17): zero release records exist;
   `premerge-migration-proof` is advisory. These are release‑governance items tracked under that policy,
   not this Experience‑Quality slice.

**Phase 5 status:** RECONCILED. The governance invariant (recommend, never silently rewrite) is
**already met**. The remaining build (learning apply/verify/record tail + an owner‑ops VIEW) is a bounded
follow‑on that needs a CD pack for the surface (§00) and coordination with the learning/proactive lane —
surfaced as a decision, not built blind.

## Phase 6 — competitive benchmarking without copying (practice, 2026‑09‑12)

A standing practice for benchmarking Paige against best‑in‑class, scoped to stay **inside §00**: CC
benchmarks the dimensions that are **correctness, capability, and governance** — never visual taste,
which is Claude Design's. "Study principles, never clone" (no competitor trade dress, UI kit, or
marketing copy is copied — already a §-bound rule in the UI standard).

**Dimensions CC benchmarks (engineering, mine):**
- **Conversational usefulness** — can a non‑technical owner reach the capability in ≤5 min without
  prompt‑engineering (§36), measured by the authenticated drives (Phase 4) once the test account exists.
- **Authority & isolation** — tenant/workspace/actor/role re‑resolved per step (§9/§51/§59); no IDOR.
- **Auditability** — every consequential act leaves a Rail/receipt; the owner can trace it (§ receipt‑rail).
- **Recovery & release discipline** — deploy is loud‑failing; migrations proven‑persisted (§32.a);
  rollback position named (§ release‑governance).
- **Observability & cost** — spend is traced + metered; budget enforcement provable (function 13).
- **Safe autonomy** — recommend‑not‑rewrite; authority decays and is attested (§67/§68).

**Dimension CC does NOT benchmark (Claude Design's, §00):** visual polish, motion, layout, hierarchy,
"Apple‑level" feel. CC records *measurements* a design decision might use (contrast ratios, whether a
face loaded, whether a control 404s — §00 "evidence handed over, never a review"); it renders no verdict.

**Method:** per surface/capability, state the best‑in‑class bar on each engineering dimension, measure
Paige against it with evidence (not impression), and file any gap as a tracked finding (Attention
Register) — never a silent rewrite and never a visual critique. **Honesty (§13):** competitor internals
are largely unobservable; benchmark against *well‑attested public behavior*, never claim "competitor X
does exactly Y" as fact.

**Phase 6 status:** PRACTICE RECORDED (§00‑clean). It is a repeatable rubric, not a one‑time report;
the first real pass runs against the authenticated drives once the Phase‑4 test account is provisioned.
