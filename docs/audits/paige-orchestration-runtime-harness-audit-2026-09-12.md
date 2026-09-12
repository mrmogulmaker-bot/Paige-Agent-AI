# Paige Orchestration / Runtime Harness — Full Current-State Audit

**Read-only architecture audit. No product code, config, migration, provider call, branch, PR, or
merge was performed.** Every capability claim below was verified against source on current `main`,
the repository's own CI guards, git history, and GitHub PR/check state — never from memory or from
doctrine prose alone. Runtime/production-state claims that require a live drive, an authenticated
session, or a database query are labelled `UNVERIFIED` because this session deliberately did not use
credentials or invoke a provider (including the Supabase MCP against prod).

- **Repo:** `mrmogulmaker-bot/Paige-Agent-AI`
- **Audited `main` SHA:** `bb4828bab3b018e56c160f514d254dbd23864f5d` (2026-09-12 15:13:47 -0400) — the designated
  branch `claude/blissful-einstein-pbnraa` is byte-identical to `origin/main` (0 ahead / 0 behind).
- **Head commit:** #1145 "Main Paige Operational Chat — capability truth + honest contact vertical + `contact.created` event"
- **Truth labels:** `LIVE` (callable + governed + verified) · `PARTIAL` (real substrate, incomplete
  or unproven end-to-end) · `UNAVAILABLE` (not built / not callable) · `PROOF OWED` (built, but the
  named proof class is outstanding) · `UNVERIFIED` (a runtime claim this audit could not prove from here).

---

## 1. Executive truth summary

**What the Harness is today.** Paige is *one* user-facing orchestrator (`paige-ai-chat`, a 13,749-line
edge function) with a genuinely impressive, honestly-built set of *constituent* governance systems:
a server-side action-risk policy with a fail-closed runtime backstop, a stored-argument confirmation
gate, a Spine capability registry, a per-tenant daily model-budget ceiling, a durable-job semantics
library with a live cron action-worker, owner-facing Rail read resolvers, a cron evaluation loop that
files improvement proposals, a seeded C-suite/specialist roster with a working `delegate_to_subagent`
path, and a first honest capability-manifest composer. The doctrine's own one-line verdict is correct
and I confirm it: **the architecture is approved; the centralized end-to-end Harness is `PARTIAL` and
distributed — it is not `LIVE` merely because the parts exist.**

**What it genuinely does today (verified in code).** A tenant/actor is resolved server-side from the
JWT; the model is routed behind a provider-neutral contract with a real per-tenant daily spend ceiling
that blocks reasoning/sensitive calls at 100%; ~100 tools are dispatched inline in the chat handler;
every mutating tool is classified once by `_shared/action-risk.ts` and gated by a stored-argument
confirmation minted server-side; executed tools land a `paige_audit_log` row and (for 13 of them) a
per-client Rail event that an owner-facing resolver can now read; the Client-team action bus
(`paige_actions`) has real producers and a `*/2` cron worker that drains it into sub-agent drafts; a
daily `paige-evaluator` cron scans specialist-invocation health and files improvement *proposals* the
owner decides on.

**What is still only architecture or partial wiring.** There is **no single governed execution path**:
`paige-ai-chat` uses its own inline autonomy gate, `paige-mcp` uses a different seam
(`decideGovernedExecution`), and sub-agents/jobs use neither. The Spine registers **13 read/evidence +
a few action capabilities** but Chat still reaches every department through ~100 hand-wired tools — the
registry is a declaration layer, not the runtime router. Metering (`platform_metered_events`) is
**absent from every edge function** — spend is observable and estimated, never billed, and no plan
carries an AI allowance. The §67 **automation layer does not fire** (no trigger emits; 4 seeded rows).
The **experience→evaluation→approved-change loop cannot apply** (the evaluator proposes; the apply lane
is unbuilt). Approval is model-asserted on 5 of 6 chat surfaces. The **capability manifest covers 3 of
~100 tools.** Live Conversation audio and Secure Browser remain `PROOF OWED`/`UNAVAILABLE`.

**Top five gaps between current state and a reliable Paige operating system:**
1. **No unified governed path.** Three separate authority seams (chat inline / MCP `governedExecution`
   / ungoverned sub-agent+job paths). "One Harness" is not enforced by one contract.
2. **Governance guards are RED on `main` and were overridden.** `lint:action-risk` and
   `lint:chat-tool-registry` both fail at `bb4828b`; PR #1145 merged with the `verify` and
   `database-contract` CI jobs failing. Two shipped chat tools (`social_post`, `improvement_propose`)
   **refuse at runtime** — the fail-closed backstop working, and a shipped-but-inert capability.
3. **Spend is unmetered and autonomy cannot fire.** No `platform_metered_events` writes anywhere; the
   §67 process layer emits no triggers. Unattended action + billing are both unbuilt.
4. **Owner-visible truth is partial.** Rail readers exist but consumption is not universal; the
   capability manifest models 3 capabilities; there is no single job/receipt control plane.
5. **The improvement loop is one-directional.** It proposes but cannot apply a versioned skill/prompt/
   route/policy under approval; specialist activation is gated behind the (incomplete) Harness
   completion gate.

**Most important recommendation for the next improvement.** Make the **one governed execution path
real** (Phase 1 below) — route chat mutations, MCP, sub-agents, and jobs through a single
`decideGovernedExecution` contract — and, as an immediate hygiene precondition (Phase 0), restore the
two red guards to green so the drift-detection that the whole doctrine leans on is a real gate again.
This is the doctrine's own named "central Harness completion gate," and it is the prerequisite for
safely activating specialists, autonomy, and metering.

---

## 2. Current-state architecture map

Verified at `bb4828b`. "Evidence" cites the exact file/guard/migration I read or ran.

| Layer | Current implementation | Truth label | Evidence | Missing / risk |
|---|---|---|---|---|
| **Paige chat entry** | `supabase/functions/paige-ai-chat/index.ts` (13,749 lines); one owner-facing orchestrator; siblings `broker-paige-chat`, `paige-public-chat` | `PARTIAL` | Read handler; §6 os-arch table row "Paige workspace and chat = PARTIAL" | Context assembly distributed; scroll-ownership P0 reopened (per Master §4) |
| **Context assembly / actor+tenant** | Server-resolved from JWT (`getActorTier`, `current_user_tenant_id()`, `resolve_tool_autonomy`); `paige_operating_memory()` composes open work | `PARTIAL` | `signals.ts` header "resolved server-side from the verified JWT (never the body)"; Master §4 M1 | No single context contract across all surfaces |
| **Authority / approval** | `_shared/action-risk.ts` (fail-closed classify + runtime `unclassifiedWriteReason` backstop); stored-argument confirmation via `paige_pending_confirmations`; rendered card on `PaigeAIChat` only | `PARTIAL` | Read `action-risk.ts` in full; handler lines 8010–8018, 8020+ | 5/6 chat surfaces model-asserted; MCP carries no consent |
| **Paige Spine (registry)** | `_shared/paige-spine/registry.ts` → **13** registered capabilities across 8 domains | `PARTIAL` | Counted domain `key:` declarations (13); registry validates + throws on invalid | Registration ≠ routing; Chat still dispatches ~100 inline tools |
| **Spine governed execution seam** | `_shared/paige-spine/governedExecution.ts` `decideGovernedExecution()` | `PARTIAL` | grep: imported ONLY by `paige-mcp` (`capability-policy.ts`, `governed-adapter.ts`) | Chat/sub-agents/jobs do **not** use it — no unified path |
| **Tools (chat)** | ~100 hand-wired tool definitions + dispatch inline in the handler; baseline frozen 2026-09-01 | `PARTIAL` | `scripts/ci/chat-tool-baseline.txt` (~92 tools) + 10 new = ~102; `lint:chat-tool-registry` **FAILS** (exit 1) | Ratchet violated; 10 tools past baseline; 2 refuse at runtime |
| **Skills** | `paige_skills` (112 seeded S2 recipes per §6) + generic interpreter `_shared/skill-interpreter*.ts`; `skill-runner`, `skill-forge` edge fns; `skill_run` MCP tool | `PARTIAL` | os-arch §6 row "Skills catalogue and runner = PARTIAL … small bespoke execution set"; `paige_skill_runs` attribution | Inventory ≠ callable; chat runtime skill execution is minimal |
| **Specialists / C-suite / delegation** | Seeded roster (`20260711280000`, `20270108000000` csuite mount, `20270109000000`); 13 `subagent-*` edge fns; `paige-orchestrator` (683 ln); `delegate_to_subagent` (`high`) + `list_subagents` + `forge_subagent` wired in chat | `PARTIAL` | Read function line counts; handler dispatch (l.7692, 6536); os-arch §6 "paige_subagents = PARTIAL" | Sub-agent execution runs "outside this gate" (ungoverned); no enforced budget/authority per worker |
| **Model routing** | `_shared/model-router.ts` provider-neutral (`callModel`), allowlist, fallback, `paige_llm_trace` | `PARTIAL` | Read router head; `_shared/model-allowlist.ts`, `model-router-gates.ts` | Universal provider coverage + correlated quality gates owed |
| **Budget enforcement** | `_shared/router-budget/mod.ts` — per-tenant daily USD ceiling (default $50, config-as-data `admin_app_settings`), soft@80% / hard@100%, blocks reasoning+sensitive, from `SUM(cost_estimate_usd)` | `PARTIAL` (real, estimate-based) | Read `router-budget/mod.ts` (#1100/#1102, 2026-09-10); router l.200–240 `BudgetExceeded` throw | Estimate-based (not metered); **fails open** on accrual read error; per-day not per-task |
| **Metering / billing of AI spend** | — | `UNAVAILABLE` | grep: `platform_metered_events` has **zero references** in `supabase/functions/` | No billable usage; no plan allowance; #572 unmerged |
| **Durable jobs** | `_shared/durable-job/mod.ts` (canonical states, lease/idempotency math, receipt correlation; owns no table); `paige-action-worker` `*/2` cron drains `paige_actions` via `claim_filed_actions` (SKIP LOCKED, 10-min self-heal) | `PARTIAL` | Read `durable-job/mod.ts`; `paige-action-worker/index.ts` header | Not one uniform owner-visible job contract; per-substrate schemas |
| **Action Bus / events / cron** | `paige_actions` producers (`handle-inbound-email`); `paige-native-event-dispatch`; cron fns (`coaching-reminder-cron`, `plan-reminder-cron`, `weekly-summary-cron`, `paige-heartbeat`) | `PARTIAL` | grep producers; migration cron jobs | §67 automation triggers (`paige_automations`) **emit nothing** (4 seeded, not 80) |
| **Rail / receipts** | Read resolvers `get_solo_rail_activity`, `get_client_rail`(+`_for_chat`), `get_platform_rail`; `_record_workspace_rail_event` + receipt correlation (`20270107000000`); `paige_audit_log` seam at single dispatch point (C1) | `PARTIAL` | migrations `20261043/44/49`, `20270107`; `lint:rail-grants` **PASSES** | Consumption not universal; universal redacted detailed-receipt contract not proven live |
| **Memory / Mind** | `paige_operating_memory()` (composed, not stored); voyage-3 embeddings (`_shared/voyage.ts`); `match_paige_memory`/`match_rag_documents`/`match_prompt_memory` (vector-path fixed, `20261029000000`); `client_memory` tenant-isolated (`20261030000000`) | `PARTIAL` substrate; `UNAVAILABLE` confirmed-Memory projection | `lint:vector-path` **PASSES** (9 fns resolve); Master §4 M1/M2a/M2b | No confirmed-only durable-Memory runtime projection |
| **Evaluation / learning** | `paige-evaluator` (daily `cron.job`, `20270114000000`) scans `paige_subagent_invocations` → files improvement proposals; `paige-eval`; chat `improvement_list`/`improvement_decide` | `PARTIAL` (propose-only) | Read `paige-evaluator` header; migration cron guard | Apply lane (versioned skill/prompt/route/policy) unbuilt; nothing publishes automatically (by design) |
| **Provider adapters** | Anthropic/Featherless/etc. behind router; `NeedsConfigError` fail-closed; STT/TTS routers; Plaid/Twilio/n8n/Zapier seams | `PARTIAL` | `model-router.ts` l.450–533; `_shared/stt-router.ts`, `tts-router.ts` | Coverage mixed; Live audio + Secure Browser provider proof owed |
| **Tenant isolation** | RLS + `SECURITY DEFINER` in-body scope (§59); guards `lint:definer-fns`, `lint:views`, `lint:rail-grants`, `lint:tier-features` | `PARTIAL`→strong | CI guards present in `ci.yml`; rail-grant + vector-path pass | `operator_rls_coverage` reported FAILING in prod (Master §4) — `UNVERIFIED` here |
| **Capability manifest / self-knowledge** | `_shared/paige-capability-status/{resolver,signals}.ts` (#1145) composes maturity×tier×connection×lane×evidence → one honest availability; `capability_status` chat tool (read) | `PARTIAL` (3 capabilities) | Read both files; signals models `crm.search_contacts`, `crm.create_contact`, `integrations.list` only | Covers 3 of ~100 tools; Migration Advisor `UNAVAILABLE` |
| **Owner controls (visible surfaces)** | Rail readers, `action_list`, improvement list/decide, autonomy resolver (`resolve_automation_autonomy`), Trust Compass dial | `PARTIAL` | os-arch §6 "Trust Compass = PARTIAL … dial/numbers non-authoritative fixtures" | No unified mission/job/cost/receipt owner console |
| **Experience-quality enforcement** | 5 composable skills (`.agents/skills/paige-*`) routed by `paige-ui-design`; `ui-delivery-evidence` CI validator; PR template; doctrine `paige-ui-delivery-standard.md` | `PARTIAL` (process/CI, not runtime) | `git show --stat 92c4baf` (#1146): skills + CI + docs only, **zero runtime code** | Enforced by convention + CI, not by the runtime; `ui-delivery-evidence` not yet a required branch check |

---

## 3. Request-to-result flow map

The canonical intended path (Master §3): `request → context assembly → identity/tenant → capability/
authority → approval/budget/autonomy → tool or specialist → canonical write → readback → receipt/Rail →
truthful response`. Actual behaviour by request class:

**A. Read-only request** — `LIVE`.
`chat → JWT-resolved actor/tenant → model route (budget ceiling checked) → read tool dispatched inline
→ result → response`. No approval. This is the most complete path. Budget block can interrupt reasoning/
sensitive reads if the daily ceiling is hit (fails open if accrual unreadable).

**B. Draft / propose** — `LIVE` for the draft; the *proposal* of an action is `ordinary`/exempt and
returns a request for the owner. `draft_marketing_content`, `document_generate`, `propose_action`,
`forge_subagent` (proposes a specialist) all produce artefacts/requests without side effects.

**C. Approved native-platform write** — `PARTIAL`.
`tool call → unclassifiedWrite backstop → MUTATING check → mint pending confirmation → needs_confirm →
(owner turn) → atomic consume of a pre-turn, unspent, unexpired row → execute STORED args → canonical
write → paige_audit_log (+ per-client Rail for 13 tools) → response`. **Gaps:** the rendered approval
card that proves a *human* said yes exists only on `PaigeAIChat`; the other 5 surfaces accept the
model's `confirm:true` word. `owner_only` acts (`automation_set_grant/state`) refuse down every channel.

**D. External / provider action** — `PARTIAL`, `high`-gated.
Classified `high` (n8n/zapier/comms/calendar/publish/send). Same confirmation path; provider adapters
fail closed (`NeedsConfigError`). Live audio and Secure Browser external effects are `PROOF OWED`/
`UNAVAILABLE`.

**E. Background / durable job** — `PARTIAL`.
`producer (e.g. inbound email) → paige_actions(filed) → paige-action-worker */2 cron → claim_filed_actions
(atomic, self-healing) → sub-agent draft → advance_action → status`. Real and autonomous for the
action-bus substrate. **Missing:** one uniform owner-visible job contract; the §67 *automation* trigger
layer emits nothing, so scheduled/process-driven autonomy does not start.

**F. Specialist delegation** — `PARTIAL`, and the **most important governance seam gap**.
`delegate_to_subagent (high, confirmed) → paige-orchestrator / subagent-* fn (service role)`. Per the
action-risk reason itself: *"Runs as service role against the orchestrator, so whatever the specialist
then does is outside this gate."* Delegation is authorised once; the specialist's downstream actions are
**not** re-resolved through the Spine. This is the single clearest bypass of the "re-resolve authority
at every step" contract.

**G. Failure / retry / cancellation** — `PARTIAL`.
`durable-job/mod.ts` encodes the right semantics (`expired`→reconcile, `outcome_unknown`→never blind
retry, idempotency window). Adopted by the comms drainer + action worker; not universal. A declined
approval CANCELS the proposal (R2). Cancellation/retry visibility to the owner is incomplete.

**H. Unavailable / denied** — `LIVE` (fail-closed).
Strong: unclassified writes refuse; MCP mutations refuse (`approval_required`); tier/connection/evidence
gaps degrade to honest `not_for_tier`/`needs_setup`/`planned`/`unavailable` in the capability resolver;
`NeedsConfigError` for missing providers. Fail-closed behaviour is a genuine strength of this codebase.

**Inconsistent/missing stages:** the "one governed path" is three paths (chat inline / MCP
`governedExecution` / ungoverned specialist+job). Receipts are `paige_audit_log` + partial Rail, not a
universal correlated receipt. Readback-before-success is proven for Mission/Campaign-Brief flows, not
universally.

---

## 4. Gap register

Ranked by (customer impact × platform safety × delivery leverage × dependency order), most-actionable
first. Each names exact evidence, the smallest coherent complete fix, what must NOT be absorbed, and the
canonical record to update *after* real delivery.

### G1 — Red governance guards on `main`; two shipped tools refuse at runtime *(safety + honesty, do first)*
- **Evidence:** `node scripts/ci/action-risk-lint.mjs` → exit 1 (`social_post`, `improvement_propose`
  unclassified writes); `node scripts/ci/chat-tool-registry-lint.mjs` → exit 1 (10 tools past the frozen
  baseline). PR #1145 check-runs: `verify` = **failure**, `database-contract` = **failure**. Handler
  l.8010–8018 refuses both tools at dispatch (`post`/`propose` match `MUTATION_VERB`).
- **Impact:** `social_post` and `improvement_propose` are declared, offered tools (defs at l.5914 /
  l.5866) that **cannot run** — Paige tells the operator "I can't do this one." Social posting and
  in-chat improvement proposals are inert. The guards that exist precisely to catch Spine/action-risk
  drift are non-blocking in practice.
- **Smallest complete fix:** classify `social_post` (`high` — reaches outside + public) and
  `improvement_propose` (`ordinary`, or `NON_MUTATING_EXEMPT` with a reason if it only stages a
  proposal) in `action-risk.ts`; and either register the 10 new tools' Spine adapters or deliberately,
  with a recorded reason, update `chat-tool-baseline.txt`. Re-run both guards to green.
- **Do not absorb:** do not "fix" by making the guards non-blocking; that removes the drift detection.
- **Update after delivery:** none needed beyond the baseline file's own comment convention.

### G2 — No unified governed execution path *(the doctrine's own completion gate)*
- **Evidence:** `decideGovernedExecution` imported only by `paige-mcp`; `paige-ai-chat` uses its inline
  action-risk + `paige_pending_confirmations` gate; sub-agents/jobs use neither. Spine registry = 13
  capabilities but Chat dispatches ~100 inline tools.
- **Impact:** "one Harness / re-resolve authority at every step" is aspirational, not enforced. The
  specialist path (F) executes outside the gate.
- **Smallest complete fix:** choose ONE canonical authority contract and route all three consumers
  (chat, MCP, sub-agent/job dispatch) through it — most cheaply by having sub-agent execution and the
  chat gate both call `decideGovernedExecution`, and re-resolving authority inside `paige-orchestrator`
  before a specialist acts.
- **Do not absorb:** do not create a *fourth* seam or a new registry (PR #921's `paige-agent-registry`
  is explicitly a competing home — Master §3 forbids treating it as doctrine).
- **Update after delivery:** Master §3 inventory row "Spine authority and registered-tool path"; os-arch §6.

### G3 — Spend is unmetered; the §67 autonomy layer cannot fire *(delivery leverage + revenue safety)*
- **Evidence:** zero `platform_metered_events` references in `supabase/functions/`; §67/Chat-delivery-map
  "triggers do not EMIT yet (4 seeded, not 80)"; `resolve_automation_autonomy` exists but nothing arms.
- **Impact:** no billable AI usage, no plan allowance enforcement; unattended process automation is dark.
  Budget ceiling (#1100) guards runaway spend on *estimates* but is not billing.
- **Smallest complete fix (two dependent slices):** (a) M1 — carry the `paige_llm_trace` cost into a
  metered ledger (#572); (b) wire `paige_automations` trigger emission into the action bus, clamped by
  `resolve_automation_autonomy` (min of grant / act floor / Trust-Compass ceiling).
- **Do not absorb:** metering must reconcile to actuals eventually, but the first slice may stay
  estimate-based if labelled honestly.
- **Owner decision needed:** whether AI usage is billed in Beta, and the default per-plan ceiling.

### G4 — Owner-visible truth is partial *(customer trust; §36/§70)*
- **Evidence:** Rail readers exist (`get_solo_rail_activity`, `get_client_rail`, `get_platform_rail`) but
  consumption is not universal; capability manifest models 3 capabilities; no single job/receipt console.
- **Impact:** Paige cannot fully answer "what can you do / what did you just do / where's the receipt"
  across her real surface.
- **Smallest complete fix:** extend `paige-capability-status/signals.ts` from 3 to the full classified
  tool set (the resolver core already scales); wire the Rail readers + `record_capability_run`/receipt
  correlation into one owner-visible activity/receipt surface.
- **Do not absorb:** do not build a second capability registry — the manifest is a *derived projection*
  (Master §3 precedence table), not a new source.
- **Update after delivery:** Master §3 self-knowledge contract; Surface Binding Ledger.

### G5 — Improvement loop cannot apply; specialists not activated *(future leverage, lowest urgency)*
- **Evidence:** `paige-evaluator` proposes only; apply lane "per-kind follow-up work" unbuilt; os-arch §6
  first cohort (Operating Strategy, Research, Cost Advisor, Skills Steward) still `PARTIAL/UNAVAILABLE`.
- **Impact:** Paige learns nothing durably; the "team" is real substrate but not governed/activated.
- **Smallest complete fix:** build the owner-approved versioned apply lane for ONE kind (e.g. prompt),
  then activate the first read/draft/propose-only cohort behind G2's unified path.
- **Do not absorb:** no automatic publish; no cross-tenant learning (Master §3 hard rules).
- **Dependency:** blocked on G2 (unified path) per the doctrine's completion gate.

---

## 5. Recommended phased improvement plan

Dependency-ordered, not by excitement. Each phase is a **complete, coherent** slice (not a "minimal
harness"). No phase depends on inter-agent coordination. Gate A = the owner decision required *before*
implementation begins.

### Phase 0 — Restore the guards; un-brick the two dead tools *(hygiene precondition, hours)*
- **Outcome:** `lint:action-risk` and `lint:chat-tool-registry` green on `main`; `social_post` and
  `improvement_propose` either run (classified) or are honestly removed; the ratchet baseline reflects a
  deliberate decision.
- **In scope:** `action-risk.ts` classifications; `chat-tool-baseline.txt` (or Spine adapters for the 10
  tools); re-run guards.
- **Out of scope:** any new capability; any Spine routing change.
- **Proof:** both guards exit 0; a driven chat call to `social_post` no longer returns the refusal string.
- **Stop conditions:** a tool that *should* refuse (genuinely unbuilt) stays refused with an honest reason.
- **Gate A decision:** *"Is `social_post` a Beta-scope capability (classify + finish it) or not (remove
  the tool def)?"*

### Phase 1 — One governed execution path *(the Harness completion gate; the recommended first Gate A phase)*
- **Outcome:** chat mutations, MCP, and sub-agent/job execution all cross a single authority contract
  (`decideGovernedExecution`), with authority re-resolved before a specialist acts.
- **In scope:** adopt one seam in `paige-ai-chat`'s gate; re-resolve in `paige-orchestrator` before
  sub-agent action; document the one contract.
- **Out of scope:** metering, autonomy firing, new specialists, new registries (PR #921 stays out).
- **Proof:** a `BEGIN..ROLLBACK` + unit proof that a specialist action refuses when its re-resolved
  authority is insufficient, on every entry surface; §39 peer-gate on the diff.
- **Stop conditions:** if unifying would make a legitimate caller (MCP service-role, agency act-as) fail,
  widen with recorded rationale (§37 producer inventory) rather than loosen the gate.
- **Gate A decision:** *"Approve unifying the three authority seams into `decideGovernedExecution` as the
  single Harness contract, accepting that some currently-inline chat gating is refactored behind it?"*

### Phase 2 — Owner-visible truth: full capability manifest + one receipt/Rail surface
- **Outcome:** the capability manifest covers the full classified tool set; one owner-visible activity/
  receipt/job surface consumes the existing Rail readers + receipt correlation.
- **In scope:** extend `signals.ts`; wire Rail resolvers + `record_capability_run` into one surface (CD
  owns the visual; CC owns the seams — §00).
- **Out of scope:** metering; the Migration Advisor half.
- **Proof:** authenticated drive showing "what can you do / what did you just do / where's the receipt"
  answered from server-resolved tenant truth.
- **Gate A decision:** *"Approve the owner activity/receipt surface scope and its CD pack."*

### Phase 3 — Metering + autonomy firing *(cross-cutting, revenue-sensitive)*
- **Outcome:** `paige_llm_trace` cost flows to a metered ledger; `paige_automations` triggers emit into
  the action bus under the `resolve_automation_autonomy` clamp.
- **In scope:** #572 metering step; trigger emission; the ceiling/floor/grant `min` at fire time.
- **Out of scope:** invoice reconciliation; raising the Trust-Compass ceiling.
- **Proof:** a metered row per real call; a seeded process that fires only within its clamp; the "dark"
  reason surfaced when it cannot.
- **Gate A decision:** *"Is AI usage billed/allowance-enforced in Beta, and may processes fire
  unattended within the owner-set ceiling?"*

### Phase 4 — Improvement apply-lane + first specialist cohort *(after Phase 1)*
- **Outcome:** an owner-approved versioned apply lane for one improvement kind; the first
  read/draft/propose-only specialist cohort activated behind the unified path.
- **Proof:** an owner-approved proposal produces a versioned change with a receipt; no automatic publish;
  no cross-tenant learning.
- **Gate A decision:** *"Approve the first apply-lane kind and the first specialist cohort scope."*

---

## 6. Truth-drift report

Where code, `main`, PRs, and the canonical records disagree. Authoritative source today is **live code at
`bb4828b`** for every runtime claim (Master §0: "CC's live-code check wins"). I do **not** reconcile these
here — that is follow-up work under the owner's direction.

| # | Discrepancy | Authoritative source today | Smallest safe reconciliation |
|---|---|---|---|
| D1 | **CI is red on `main`** (`verify`, `database-contract` failed on #1145) yet the merge shipped; `lint:action-risk` + `lint:chat-tool-registry` fail locally. No canonical record states main's guards are red. | Code/CI (guards fail) | Phase 0; then record in decision-log that the guards were overridden under the pre-launch stance, or fix to green. |
| D2 | **Spine registry = 13 capabilities**, but Master §4 "tool migration state" (dated 2026-09-02, `e3592089`) says **"1 registered capability."** | Code (13) | Note the count is a dated point-in-time measurement; refresh the migration-state section. |
| D3 | **Budget enforcement exists** (`router-budget`, #1100/#1102, 2026-09-10) but Master §3 inventory (dated 2026-09-08) still says *"Estimates are not budget enforcement."* | Code (enforcement is real, estimate-based) | Update the inventory row; keep the honest "estimate-based, fails open" caveat. |
| D4 | **Rail read resolvers landed** (`get_solo_rail_activity`/`get_client_rail`/`get_platform_rail`, migrations `20261043–49`) but Master §4 (2026-09-02) says *"per-client Rail production read is denied (#746)"* and PR #776 ("owner can read their own Rail") is still open/draft. | Code (resolvers exist + `lint:rail-grants` passes) | Confirm authenticated read works (owed); refresh §4; close/supersede #776 if superseded. |
| D5 | **Capability manifest exists** (#1145, 3 capabilities) but Master §3 says the manifest adapter is *"UNAVAILABLE."* | Code (a PARTIAL 3-capability composer exists) | Update the precedence table row to `PARTIAL` for the manifest; keep Migration Advisor `UNAVAILABLE`. |
| D6 | **`social_post` / `improvement_propose` refuse at runtime** — no record states these shipped tools are inert. | Code (backstop refuses) | Phase 0; record the inert state until classified. |
| D7 | **`platform_metered_events` unused** — matches CLAUDE.md §67 ("zero rows"), but Master §3 self-knowledge precedence table lists "metered-event records" as a manifest source. | Code (no writes/reads) | Note the source is not yet populated; #572 is the fix. |
| D8 | **PR #921** proposes a `paige-agent-registry.md` competing canonical home; **#729/#776** (Spine/Rail) and **#572** (metering) are open drafts describing systems partly superseded by merged migrations. | `main` (merged work) | Rebase/close the drafts against current `main`; do not adopt #921 as doctrine (Master §3 already rules this). |
| D9 | Doctrine occasionally reads as "the guards keep us honest," but they are overridden under the pre-launch merge-on-verified stance. | Both true; unstated tension | Record the explicit policy: which guards are hard gates vs. advisory pre-launch. |

**Open PRs touching orchestration (state at audit time):** #1148 (Solo Beta security, open non-draft),
#1044 (text-chat Skills, draft), #921 (agent registry design, draft — *competing home*), #917
(tenant-owned orchestration, draft), #729/#776 (Spine/Rail, draft), #644 (Mind Rail resolver, draft),
#591 (knowledge isolation, draft), #576 (chat runtime, draft), #572 (metering, draft), #585 (approval
attribution, draft), #579 (Flow-by-Flow skills, draft). Most are stale drafts predating the merged
migrations that supersede parts of them.

---

## 7. Evidence appendix

**Audit baseline:** `origin/main` @ `bb4828bab3b018e56c160f514d254dbd23864f5d` (2026-09-12 15:13:47 -0400);
working branch `claude/blissful-einstein-pbnraa` = identical (0/0).

**Guards run at `bb4828b` (Node v22):**
- `scripts/ci/action-risk-lint.mjs` → **exit 1** (`improvement_propose`, `social_post` unclassified).
- `scripts/ci/chat-tool-registry-lint.mjs` → **exit 1** (10 tools past baseline).
- `scripts/ci/rail-browser-grant-lint.mjs` → **exit 0** (no browser role on raw Rail).
- `scripts/ci/vector-search-path-lint.mjs` → **exit 0** (9 similarity fns resolve).
- `scripts/ci/paige-spine-registry-lint.mjs` → **could not run here** (`typescript` devDep not installed
  in this environment) — Spine count derived by reading `registry.ts` + domain files instead.

**CI check-runs on PR #1145 (produced current `main`):** `verify` = **failure**, `database-contract` =
**failure**, `lint`/`contract`/`audit`/`Validate UI delivery evidence` = success, Vercel Preview = success,
Supabase Preview = skipped.

**Source read (not exhaustive):** `paige-ai-chat/index.ts` (13,749 ln — action-risk imports l.10, gate
l.7163–8400, tool defs l.5866/5914/6003, delegation l.6536/7692); `_shared/action-risk.ts` (full);
`_shared/router-budget/mod.ts` (full); `_shared/paige-spine/registry.ts` + `domains/*` (13 keys);
`_shared/paige-spine/governedExecution.ts` (exports; importers); `_shared/model-router.ts` (l.200–533);
`_shared/paige-capability-status/{resolver,signals}.ts` (full); `_shared/durable-job/mod.ts` (header);
`paige-action-worker/index.ts` (header); `paige-evaluator/index.ts` (header); migrations
`20261043/44/49`, `20270107`, `20270114`, `20260711280000`, `20270108/09`; `.github/workflows/ci.yml`.

**Docs read:** `CLAUDE.md` (§00–§70); `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §3 Runtime Harness (l.172–630),
§4 chat/Spine (l.1458–1627); `docs/doctrine/paige-os-architecture.md` §6 agentization table; `docs/brain/
decision-log.md` (recency); `supabase/functions/CLAUDE.md`. Skimmed via headers: c-suite roster,
skills-inventory, binding-ledger, integration-registry.

**Verification limits (honest):**
- **No authenticated live drive, no production DB query, no provider call** — per the read-only mandate.
  All runtime/prod-state claims (e.g. `operator_rls_coverage` FAILING, whether a Solo owner sees Rail
  reads, whether budget blocks fire live) are `UNVERIFIED` from here and rely on code + the repo's own
  evidence records.
- **The `paige-spine-registry-lint` guard could not execute** in this environment (missing `typescript`
  devDep); the 13-capability count is from reading source, not from the guard.
- Line counts and greps reflect `bb4828b` only; open PRs were read at their listed heads, not merged.

**Separation of evidence classes:** VERIFIED-from-code = the architecture map, guard results, Spine count,
budget seam, metering absence, dead-tool refusal, Rail-reader presence, action-bus/cron, capability
manifest scope, Harness-upgrade scope. `PROOF OWED` = authenticated approval on 5 surfaces, universal
receipt, Live audio. `UNVERIFIED` = all production runtime state. `UNAVAILABLE` = metering, §67 firing,
end-to-end Migration Advisor, Secure Browser capability, improvement apply-lane.
