# Paige Intelligence Infrastructure — Grounding Report (§34 Phase 0)

**Owner:** Antonio Cook · **Prepared:** 2026-07-19 · **Status:** Phase 0 grounding — NO CODE WRITTEN.
This report is the only artifact of Phase 0. No migration, no edge function, no §34 doctrine text is
written until Antonio confirms the strip-vs-extend decision **per department**.

**Method (§18 grounding-first, §13 honest):** every claim below is `git grep` / live-MCP verified with
file paths + line numbers. Where a vendor detail comes from training knowledge rather than a live fetch,
it is flagged. Where a performance claim can't be measured headless, it says "expected, not measured."

> **One-line verdict:** This is **not** a greenfield. Paige already has a partial intelligence spine —
> a real sub-agent registry, a prompt-forge, a semantic memory, a proto-orchestrator (the visual-critique
> gate), and a reasoning-trace UI. What's missing is the **connective tissue that makes it measurable and
> self-improving**: a dedicated trace store (L1), an eval harness (L2), and the feedback→weight loop (L6).
> Six of seven layers are **EXTEND**, one is **NET-NEW**. Zero are STRIP. Zero are BUY (forbidden by §34).

---

## Verification Proofs (gathered before any recommendation)

### Proof 1 — Doctrine section state (CLAUDE.md tail)
`grep -nE "^## (3[0-9])\." CLAUDE.md`:
- `## 30` STRIP-THEN-REBUILD · `## 31` never shortchange · `## 32` green-build≠working-render ·
  `## 33` the design agent has EYES (visual-critique loop).
- **§33 IS committed doctrine AND has a live runtime** (see Proof 4). **§34 is NOT present** (`grep -c "## 34\." CLAUDE.md` = 0) — correct; it is not written until Phase 0 is confirmed.

### Proof 2 — Migration audit (intelligence-related, repo = applied-on-merge via CI)
CI auto-applies migrations on merge to `main`, so a migration present on `main` is live. Intelligence-related:
- `20260718090000_studio_deliverable.sql` · `20260718100000_paige_prompt_template.sql` ·
  `20260718110000_paige_prompt_memory.sql` · `20260718120000_embedding_model_tag_columns.sql` ·
  `20260719120000_paige_prompt_template_landing_seeds.sql` · `20260719130001_match_prompt_memory.sql` ·
  `20260719140000_studio_visual_critique_log.sql`.
- Sub-agent registry migrations: `paige_subagents`, `paige_subagent_proposals`,
  `paige_subagent_invocations`, `paige_subagent_factory_quota` (from the June 2026 batch +
  `20260718060000_studio_design_agent_operating_core.sql`).
- **No** `paige_llm_trace`, **no** eval-dataset table, **no** A/B-experiment table exist (net-new gaps).

### Proof 3 — Model-router reality (the §34 "5-provider" claim, honestly)
`supabase/functions/_shared/` provider clients present: `claude.ts`, `openai.ts`, `groq.ts`,
`gemini-image.ts`, plus Featherless (OpenAI-compat) inside `model-router.ts`.
- **Two routers exist.** (a) TEXT: `routedChatCompletion`/`pickRoute` (`model-router.ts:48-95`) routes
  **only** `anthropic | featherless` today. (b) CAPABILITY/visual: `callModel` (`model-router.ts:184+`)
  integrates `openai.ts` (`:211`), `groq.ts` (`:212`), `gemini-image.ts` via `model-allowlist.ts` +
  `model-router-gates.ts`.
- **Honest read:** the 5-provider substrate is **half-built** — all five provider *clients* exist and the
  *capability* router uses them, but the *text/chat* router is still Anthropic + Featherless only. §34's
  "no single provider owns Paige" is a real direction with real code, **not yet fully true** for chat.

### Proof 4 — Edge-function audit (live, `list_edge_functions` on prod `xygzykjyynhzqytbqnzu`)
Intelligence-related functions and their **live versions**:
- `paige-orchestrator` **v30** · `paige-context-router` **v24** · `paige-ai-chat` **v89** ·
  `subagent-forge` **v17** · `subagent-{email-composer,market-research,financial-research,content-drafter}` v23 ·
  `skill-forge` v23 · `skill-runner` v24 ·
  `studio-visual-critique` **v1 (LIVE)** · `studio-learn-from-artifact` **v6** ·
  `embed-text` v23 · `ingest-rag-outcome` v22 · `backfill-memory-embeddings` v22 · `kb-search` v23.
- **§33's runtime landed:** `studio-visual-critique` v1 is ACTIVE in prod (created 2026-07-19). §33 is
  doctrine **and** code, not a draft.

### Proof 5 — Trace-store schema draft (`paige_llm_trace`) — Layer 1 net-new artifact
Refined to repo conventions (`extensions.` opclass, `current_user_tenant_id()`, service+tenant-read RLS,
cost labeled an estimate). This is a **draft for review**, not applied:
```sql
create table public.paige_llm_trace (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  task_id           text,                              -- correlates all traces for one task
  agent_id          text not null,                     -- which sub-agent made the call
  parent_trace_id   uuid references public.paige_llm_trace(id) on delete set null,  -- multi-agent tree
  model             text not null,
  provider          text not null,                     -- 'anthropic'|'openai'|'groq'|'featherless'|'gemini'
  job_kind          text,                              -- the router JobKind, for cost/quality slicing
  input             jsonb not null,
  output            jsonb,
  tokens_in         int,
  tokens_out        int,
  latency_ms        int,
  cost_estimate_usd numeric(10,6),                     -- ESTIMATE, never a billed figure (§13)
  error_class       text,                              -- null on success
  error_message     text,                              -- null on success
  doctrine_gate_hits jsonb,                            -- §17/§2/§3/§9 gate outcomes logged inline
  metadata          jsonb not null default '{}'::jsonb,-- NEVER a secret/API key
  created_at        timestamptz not null default now()
);
create index on public.paige_llm_trace (tenant_id, created_at desc);
create index on public.paige_llm_trace (task_id, created_at) where task_id is not null;
create index on public.paige_llm_trace (parent_trace_id) where parent_trace_id is not null;
alter table public.paige_llm_trace enable row level security;
create policy paige_llm_trace_service on public.paige_llm_trace
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy paige_llm_trace_tenant_read on public.paige_llm_trace
  for select to authenticated using (tenant_id = public.current_user_tenant_id());
```
**Validation (§13 honest):**
- **§9 RLS holds** — same proven pattern as `paige_prompt_memory` (service-role writes; tenant reads only
  its own rows via `current_user_tenant_id()`). Writes are service-role only, so a JWT caller can never
  plant a cross-tenant trace. ✅ (pattern-verified, not yet migration-tested)
- **Cost per row** — a single indexed insert to a normal (non-vector) table; well **< $0.0001**. The only
  real cost is storage volume at scale (see cost section). ✅ (reasoned)
- **Tree query < 100ms for ≤20 spans** — the `parent_trace_id` partial index makes a 20-row recursive/self
  join trivial. **Expected, not measured** (no live table to benchmark headless — this becomes a Phase-1
  proof, per §31 real-data gate).

### Proof 6 — Reference-vendor read-back (STUDY only; §34 forbids depending on any of them)
*From training knowledge, not a live fetch — treat specifics as directionally accurate, verify exact API
before copying (§13).*
- **Langfuse** → (1) nested **trace → span → generation** model; (2) **async, non-blocking** SDK ingest so
  logging never slows the call; (3) **scores attached to traces** (eval feeds observability); (4) **session**
  grouping of multi-turn; (5) trace-tree UI. *Steal for L1.*
- **Braintrust** → (1) `Eval(name, { data, task, scores })` **decorator**; (2) **experiment comparison**
  (new prompt vs baseline, hill-climb); (3) **playground** side-by-side prompt/model diff; (4) span tracing.
  *Steal the `Eval.run` shape for L2, adapted to doctrine-integrated scorers.*
- **LangSmith** → (1) **run tree** (parent/child); (2) **feedback API** (thumbs/edit → dataset); (3)
  **dataset+example versioning**; (4) **prompt hub** with commit history. *Steal feedback→dataset for L2/L6.*
- **PromptLayer** → (1) **prompt registry with versions + labels** (`prod`/`staging`); (2) **A/B release**
  by label; (3) request logging keyed to prompt version. *Steal versioning UX for L3.*
- **LangGraph** → (1) **state-machine graph** (nodes/edges/conditional edges); (2) **persistent
  checkpointer**; (3) **human-in-the-loop interrupts**; (4) **cyclic** graphs for reflection loops.
  *Steal the node/edge + checkpoint model for L4.*
- **CrewAI** → (1) `Agent(role, goal, backstory, tools)`; (2) `Task`; (3) `Crew(process=sequential|
  hierarchical)`; (4) delegation between agents. *Steal role/goal/backstory as columns for L5 (we already
  have `paige_subagents` — this is the schema to enrich).*
- **W&B Weave** → (1) `@weave.op` **trace decorator**; (2) **eval leaderboards**; (3) **feedback/reactions
  on individual calls**. *Steal reactions-on-calls for L6.*
- **Reflexion (paper, not a vendor)** → actor → evaluator → **self-reflection stored in episodic memory**
  → retry with the reflection in context. *This IS the L4 bounded-iteration pattern.*

---

## Layer 1 — Observability Department (the trace store)

**What exists today.**
- `paige_audit_log` — a general audit table; `model-router.ts:560-590` writes a **best-effort** audit row
  from the `callModel` capability path ("Best-effort audit into paige_audit_log … NEVER blocks the call").
- `model-router-gates.ts` computes doctrine gate outcomes; `_shared/claude.ts` is the Anthropic client
  (streaming + vision) but does **not** itself persist a trace.
- **Not present:** any `paige_llm_trace`; any capture of `tokens_in/out`, `latency_ms`, `parent_trace_id`,
  per-call `input/output` across all call sites. Direct `callClaude` and `routedChatCompletion` (text) call
  sites do **not** log a trace at all — only the `callModel` capability path writes the best-effort audit row.

**Quality assessment (§13 honest).** A **shim**, not a trace store. `paige_audit_log` is a governance/audit
log, not an LLM-observability store: no token/latency/cost columns purpose-built for LLM calls, no
parent/child span tree, and coverage is partial (one of several call paths). You cannot currently answer
"what did every LLM call in task X cost and how long did it take, across all sub-agents?" — the foundational
question of the whole §34 build.

**Doctrine gap.** Partially satisfies §13 (some honesty via audit) and §9 (audit is tenant-stamped).
**Violates the spirit of §34** (the moat layer is a borrowed general table, not a purpose-built department)
and blocks §14 (you can't route "on real signal" without the signal). §16/§17 cost governance is currently
un-observable per call.

**Reference bar (STUDY).** Langfuse's trace→span→generation tree + async non-blocking ingest + scores-on-
traces. We need ~20%: one `paige_llm_trace` table, one `parent_trace_id` self-reference, non-blocking writes,
and a slice-by-`task_id` query. We do **not** need Langfuse's UI, multi-language SDKs, or hosted service.

**Recommendation: EXTEND cleanly** (add `paige_llm_trace` as a new dedicated table; keep `paige_audit_log`
for governance — do not overload it), then instrument the router call sites. This is the closest thing to a
"net-new" on the list, but it EXTENDS the existing router seam rather than replacing anything.

**Justification.** Nothing here is on a broken foundation (§30 → not STRIP). The router is a sound single
integration point (`model-router.ts`) where a trace write can be added once and cover most calls — that's an
EXTEND, not a NET-NEW rebuild. Overloading `paige_audit_log` would be the wrong move (it has a distinct
governance job); the clean seam is a sibling table. **Effort: L.** **Blockers:** none — this is the
substrate; it unblocks L2/L3/L6.

---

## Layer 2 — Quality Department (evals)

**What exists today.** **Nothing for LLM quality evals.** `git grep` for `eval|golden|judge|regression`
returns only unrelated hits: email templates, `security-canary-probe` (a data-leak canary, not an LLM
scorer), and `readiness-scan`. There is **no** eval dataset, **no** LLM-as-judge scorer, **no** golden set,
**no** regression alert on prompt change.

**Quality assessment (§13 honest).** **Net-new build.** This is the single true greenfield. Today prompt
quality is judged only by (a) the human (Antonio, live) and (b) the runtime visual-critique gate (§33, images/
pages only). There is no offline, repeatable, per-task-type scoring — so a prompt regression ships silently
until a human catches it.

**Doctrine gap.** **Violates §5/§13** (no systematic "is this correct/world-class?" check beyond the human)
and §25 (taste is caught live, not measured). §33 gives us runtime *visual* critique but not *text/logic*
evals or a regression gate.

**Reference bar (STUDY).** Braintrust `Eval(name, {data, task, scores})` + experiment comparison; W&B Weave
leaderboards; LangSmith dataset/example versioning. The 20%: a `paige_eval_dataset` + `paige_eval_run` pair,
a small set of scorers (deterministic where objective, one Claude-frontier judge where subjective, §17), and
a "did score regress vs last prompt version?" alert. `security-canary-probe` is a **precedent worth reusing**
for the scheduled-run + regression-alert plumbing (§18 — extend that pattern, don't reinvent the cron).

**Recommendation: NET-NEW BUILD** (inside Paige as the Quality Department).

**Justification.** Nothing to extend or strip — it doesn't exist. It **depends on L1** (evals score real
traced outputs, §31 real-data gate), so it sequences *after* Observability. The judge must route
Claude-frontier only (§17) — reuse `callModel(..., "frontier")` exactly like the visual critique does.
**Effort: M** (once L1 exists). **Blockers:** L1 must land first (no traces = nothing to score against).

---

## Layer 3 — Prompt Engineering Department (versioning + A/B)

**What exists today.**
- `paige_prompt_template` table (migration `20260718100000`) + landing seeds (`20260719120000`).
- `_shared/prompt-forge.ts:177` **READS** `paige_prompt_template` to forge generation prompts (§26).
- **Not present:** any code that **writes/versions** templates, runs A/B, or promotes winners. `git grep`
  for insert/update/version on the table returns nothing beyond the read at forge:177.

**Quality assessment (§13 honest).** **Table exists + one reader; no versioning runtime, no A/B, no
promotion.** Templates are effectively **seed-only, read-only** today. The forge fills a versioned template
with brand tokens — but "versioned" is a column, not a lifecycle: there's no experiment, no winner/loser,
no archive-with-analysis.

**Doctrine gap.** Partially satisfies §26 (forge reads DNA) but not its "A/B → promote winner → archive
loser" clause. Without L1+L2 there's no signal to pick a winner *by*.

**Reference bar (STUDY).** PromptLayer versioning + label-based A/B release; Braintrust playground diff. The
20%: a `version` + `status(active|candidate|archived)` lifecycle on `paige_prompt_template`, a router that
serves `active` but shadow-runs `candidate`, and a promotion decision fed by L2 eval scores.

**Recommendation: EXTEND cleanly** (the table + forge reader are a sound foundation; add the version
lifecycle + A/B selection on top).

**Justification.** The foundation is correct (§30 → not STRIP; the forge already reads it cleanly). This is
the textbook "extend an existing surface" (§18) — add lifecycle columns + a selection function, don't build a
second template home. **Depends on L1 (which version was used per call) + L2 (which version scored better).**
**Effort: M.** **Blockers:** L1 + L2 first, or A/B has no winner signal.

---

## Layer 4 — Reasoning Department (§33 orchestrator runtime)

**What exists today.**
- `_shared/visual-critique-gate.ts` — a real **generate → critique → iterate (bounded)** loop with an
  iteration cap and cost cap (the §33 machinery). This is a **proto-orchestrator** for one task type (visuals).
- `studio-visual-critique` edge fn **v1 LIVE**; `paige-orchestrator` **v30**; `paige-context-router` **v24**.
- §33 is **committed doctrine** (CLAUDE.md `## 33`) with a live runtime.
- **Not present:** a *general* 5-layer stack (Strategic Pre-Reasoning ×7 → Pre-Work Self-Reflection →
  Multi-Specialist Review → Bounded Iteration → Learning Capture) that any task can run through. The
  visual-critique gate is task-specific; there is no `_shared/reasoning/*` general engine.

**Quality assessment (§13 honest).** **A working proto for one task type; not yet a general reasoning
engine.** The bounded-iteration + cost-cap + honest-degrade patterns are already proven in
`visual-critique-gate.ts` — that's the seed to generalize, not a blank page. **§33 landed as runtime for
visuals; the general L4 engine is the extension.**

**Doctrine gap.** Satisfies §33 for visuals; partially satisfies §5 (adversarial pass) via the critique.
**Does not yet satisfy** the general §14 "Paige never works solo — a standing orchestrated stack for every
job." This is **the bootstrap tension**: Layer 4 *is* §33's general runtime home.

**Reference bar (STUDY).** LangGraph node/edge state machine + checkpointer + HITL interrupts; Reflexion's
actor→evaluator→reflection-memory→retry. The 20%: a small typed state-machine that sequences the 5 phases,
persists each phase's output (to L1 traces), caps iterations, and writes a learning row (L6) on success —
generalized from the visual-critique gate we already run.

**Recommendation: EXTEND cleanly** (generalize `visual-critique-gate.ts` into a task-agnostic reasoning
engine; the pattern is proven, the extension is "make it not visual-specific").

**Justification.** We have a live, correct, bounded loop (§30 → definitely not STRIP — this is the "reference
the part that works" case). Building a from-scratch LangGraph clone would ignore the proven twin. EXTEND: lift
the gate's iterate/cap/degrade skeleton into `_shared/reasoning/`, parameterize the phases. **Effort: L.**
**Blockers:** benefits enormously from L1 (each phase should trace); can start in parallel with L1 but should
write to L1 once it exists.

---

## Layer 5 — Talent Department (multi-agent crew registry)

**What exists today.** A **real registry**, not ad-hoc:
- Tables: `paige_subagents` (the registry), `paige_subagent_proposals` (propose→approve),
  `paige_subagent_invocations` (call log), `paige_subagent_factory_quota` (rate limit).
- `subagent-forge` edge fn **v17**: proposes (`:185`), on approval **inserts into `paige_subagents`**
  (`:224-227`), logs invocations. ~12 subagent-* edge fns exist (email-composer, market-research,
  financial-research, content-drafter, …).

**Quality assessment (§13 honest).** **The soundest layer of the seven — a genuine forge + registry +
proposal/approval + invocation log already ship.** The gaps vs the §34 target: (a) the 10 named *review-crew*
roles (designer, verifier, compliance officer, devil's advocate, doctrine sentinel, foundation checker,
world-class benchmarker, marketplace analyst, alternative-direction proposer, read-back verifier) are invoked
**ad-hoc via Workflow/Task subagents today**, not registered as first-class rows; (b) no per-agent *eval*
score (depends on L2); (c) no explicit *version* column lifecycle on `paige_subagents`.

**Doctrine gap.** Strongly satisfies §14/§8 (forge + registry + invocation). Partial on §5 (the review crew
isn't yet a registered, versioned, evaluable set — it's convened by hand each time).

**Reference bar (STUDY).** CrewAI role/goal/backstory + hierarchical process. The 20%: enrich `paige_subagents`
with `role/goal/backstory/version` + register the 10 review roles as rows so they're callable/evaluable —
**extend the table we already have** (§18).

**Recommendation: EXTEND cleanly.**

**Justification.** A real registry exists and is correct (§30 → not STRIP; §18 → don't build a second one).
The work is small and additive: register the standing review crew + add version/eval hooks. **Effort: S**
(register roles) **→ M** (wire per-agent eval, which needs L2). **Blockers:** per-agent scoring needs L2;
role registration needs nothing and can ship early/cheaply.

---

## Layer 6 — Learning Department (RLHF-lite retrieval weighting)

**What exists today.**
- `paige_prompt_memory` (vector memory, §26) + `match_prompt_memory` RPC (`20260719130001`) for retrieval +
  `_shared/voyage.ts` (voyage-3 @ 1024, the one embedding space) + `embedding_model_tag_columns` (auditable
  space) + `studio-learn-from-artifact` edge fn **v6** (captures a memory on genuine success).
- `paige_prompt_memory` has a `tenant_rating` column (1–5 tenant feedback) already.

**Quality assessment (§13 honest).** **Memory + retrieval are real; the reaction→weight loop is not.**
`git grep` on `studio-learn-from-artifact` for `approved|rejected|edited|weight` returns **nothing** — it
stores successes and can be retrieved by cosine similarity, but a tenant's approve/reject/edit does **not**
currently re-weight future retrieval. `tenant_rating` exists as a column but nothing consumes it to change
ranking. So: **retrieval by similarity, yes; preference-weighted retrieval that diverges per tenant over 90
days, not yet.**

**Doctrine gap.** Satisfies §26 (semantic memory) + §9 (tenant-scoped, never cross-tenant) + §7 (tenant-
authored). **Does not yet satisfy** the §34/§15 "learns from reactions" clause — the loop is open.

**Reference bar (STUDY).** W&B Weave feedback/reactions-on-calls; LangSmith feedback→dataset. The 20%: consume
the existing `tenant_rating` + a new reaction capture (approved/rejected/edited) as a **retrieval weight**
(rank = similarity × learned preference), plus §9-safe anonymized cross-tenant pattern extraction. No new
embedding space (voyage-only, §17).

**Recommendation: EXTEND cleanly** (memory/retrieval/embedding foundation is sound; add the reaction capture
+ weight into the ranking).

**Justification.** The vector foundation is correct and §17-clean (§30 → not STRIP; §18 → the one embedding
space already exists). The extension is a ranking function + reaction capture — additive. **Depends on L1**
(reactions correlate to traced generations). **Effort: M.** **Blockers:** L1 for correlation; §9 privacy
design for any cross-tenant pattern (must be anonymized-patterns-only).

---

## Layer 7 — Transparency Department (tenant-facing reasoning UI)

**What exists today.**
- `src/components/admin/studio/chat/ReasoningPanel.tsx` — **LIVE**: renders Claude's native `thinking` trace
  (collapsed-by-default, live "Thought for Ns" timer, expand to monospace trace), motion-safe, token-only,
  no-gold. Wired into `StudioChat.tsx`.
- `src/components/dashboard/PaigeStepTrace.tsx` — a step-trace display on the dashboard side.

**Quality assessment (§13 honest).** **A real reasoning-trace panel already ships — this is NOT net-new.**
What it lacks vs the §34 target: (a) **no confidence score**, (b) **no "retry with this note" affordance**,
(c) **no expandable per-sub-agent contribution breakdown** (it shows Paige's single thinking stream, not the
crew's individual contributions), (d) it's **Studio-only** (+ a separate dashboard trace) — not generalized
to the client Portal.

**Doctrine gap.** Satisfies §13 (reasoning shown verbatim, dead-ends included) + §11 (token-only, motion-
safe). Partial on the §34 transparency target (no confidence, no retry-with-note, no crew breakdown, not in
Portal).

**Reference bar (STUDY).** Perplexity sources panel (provenance + expand); Claude.ai extended-thinking display
(which `ReasoningPanel` already mirrors). The 20%: add a confidence field (fed by L2), a "retry with this
note" callback (feeds L4 a steering note), and a crew-contribution list (fed by L1's `parent_trace_id` tree).

**Recommendation: EXTEND cleanly** (a working panel exists; add confidence + retry + crew-breakdown + Portal
generalization).

**Justification.** §30 → not STRIP (the panel is good and on-brand); §18 → extend it, don't build a second
reasoning UI. But it's **the most downstream layer** — confidence needs L2, crew-breakdown needs L1's trace
tree — so it should sequence **last**. **Effort: M.** **Blockers:** L1 (trace tree for crew breakdown) + L2
(confidence signal).

---

## Summary Table

| # | Department | Recommendation | Effort | Blockers | Build order |
|---|------------|----------------|--------|----------|-------------|
| 1 | Observability (trace store) | **EXTEND** (new `paige_llm_trace`, keep `paige_audit_log`) | L | none | **1st** |
| 2 | Quality (evals) | **NET-NEW BUILD** | M | needs L1 | **3rd** |
| 3 | Prompt Eng (versioning/A-B) | **EXTEND** (`paige_prompt_template` lifecycle) | M | needs L1+L2 | Wave 2 |
| 4 | Reasoning (§33 general engine) | **EXTEND** (generalize `visual-critique-gate.ts`) | L | benefits from L1 | **2nd** |
| 5 | Talent (crew registry) | **EXTEND** (`paige_subagents` +roles/version) | S→M | per-agent eval needs L2 | **4th (S part)** |
| 6 | Learning (reaction→weight) | **EXTEND** (add weight to retrieval) | M | needs L1 | Wave 2 |
| 7 | Transparency (reasoning UI) | **EXTEND** (`ReasoningPanel` +confidence/retry/crew) | M | needs L1+L2 | Wave 3 |

**Zero STRIP. Zero BUY (forbidden §34). One NET-NEW (L2). Six EXTEND.**

## Recommended Build Order (this wave: 3–4 departments)

1. **Layer 1 — Observability (`paige_llm_trace`).** The substrate. Nothing measurable — no evals, no A/B, no
   learning — exists without it. Build first.
2. **Layer 4 — Reasoning (generalize the visual-critique gate).** The moat and the §33 general runtime home.
   Proto already proven; instrument it to write L1 traces as it's generalized.
3. **Layer 2 — Evals (net-new).** Now that outputs are traced, score them and gate regressions. Reuse the
   `security-canary-probe` scheduled-run + alert plumbing.
4. **Layer 5 (S slice) — register the standing review crew** into `paige_subagents`. Cheap, additive, makes
   §5/§14 crews first-class and evaluable once L2 lands.

**Defer to Wave 2/3:** L3 A/B (needs L1+L2 to pick winners), L6 reaction-weighting (needs L1 correlation +
§9 privacy design), L7 confidence/retry/crew-breakdown UI (needs L1 tree + L2 confidence). All three are
EXTENDs of surfaces that already exist — low risk, just downstream.

## Real Cost Estimate

**Engineering (upfront, this wave):** L1 ~ L (≈4–6 focused build-days incl. instrumenting call sites +
Phase-1 real-trace proof) · L4 ~ L (≈4–6 days generalizing the gate) · L2 ~ M (≈3–4 days) · L5-S ~ S (≈1 day
to register roles). Wave-1 total ≈ **12–17 build-days**.

**Ongoing infra (honest):**
- Trace store: ~1 row per LLM call. At, say, 50k calls/mo, ~50k rows/mo — trivial storage (JSONB in/out is
  the bulk; consider truncating large inputs). **Effectively $0 marginal on existing Supabase compute**;
  storage grows linearly — add a retention/rollup job at scale (log the cap, §24).
- pgvector (L6): already in use (`paige_prompt_memory`); no new cost.
- Eval LLM cost (L2): the only real new spend — each eval run calls a Claude-frontier judge. Bounded by how
  often evals run (on prompt change + nightly). Est. **$5–30/mo** depending on dataset size/frequency; capped
  like the visual-critique cost cap.

**Vendor TCO comparison (for the record — doctrine still says BUILD):** Langfuse Cloud ~$50–500/mo, Braintrust
~$249+/mo, LangSmith ~$39+/seat/mo, PromptLayer ~$50+/mo, W&B ~$50+/seat/mo. A realistic bundle ≈ **$400–
1,200/mo → $24K–72K over 5 years**, plus integration eng time that is *not* smaller than building the 20% we
need — **and** every one puts Paige's moat-critical trace/eval/learning data inside a third party (the §34
violation the math is here to refute, not enable). Build wins on both cost *and* sovereignty.

## Risk Register

| Risk | Mitigation |
|------|-----------|
| **Bootstrap tension** — L4 IS §33's general runtime, but §33 today is visual-only; building L4 "first" risks re-instrumenting once L1 lands. | Build **L1 first**; build L4 to write L1 traces from day one. Accept L4 as an *extension of the proven visual-critique gate*, not a from-scratch engine. |
| **Doctrine drift** — a future engineer shortcuts a layer with a vendor buy. | §34 vendor-substrate gate in every PR (reject any Langfuse/Braintrust/etc. import); the §34 doctrine text (added in Phase 1) reloads every session. |
| **Trace-store bloat** — JSONB in/out at scale. | Truncate/redact large inputs; retention + rollup job; log the cap (§24). Never store secrets in `metadata` (schema comment enforces intent). |
| **Eval cost runaway (L2)** — judge calls on every change. | Cost cap + iteration cap exactly like `visual-critique-gate.ts`; batch nightly; frontier-only judge but bounded frequency. |
| **§9 leak in L6 cross-tenant learning.** | Cross-tenant patterns are **anonymized-patterns-only**, never tenant-scoped rows; per-tenant memory stays tenant-scoped (proven `paige_prompt_memory` RLS). Counsel-gate the pattern-extraction design before build. |
| **Operational overhead** — 7 internal "departments" to monitor. | The trace store (L1) *is* the monitoring substrate; L2 evals + regression alerts are the automated watch. Don't add human dashboards this wave — data first, dashboards when there's data. |
| **Perf claims unproven headless** (trace-tree <100ms, RLS). | Make them Phase-1 real-data proofs (§31): paste a real trace-tree query timing + a real cross-tenant RLS denial before calling L1 done. |

## The One Question I Need You to Answer Before Phase 1

**Sequencing decision — confirm "L1 Observability first," or override to "L4 Reasoning first"?**

My recommendation is **L1 first** (trace store), because *every other measurable layer depends on it* — evals
score traced outputs, A/B picks winners by traced scores, learning weights by traced reactions. Building L4
(the moat/reasoning engine) first is defensible since its proto already works, but it would then be
re-instrumented to write traces once L1 lands. I recommend **L1 → L4 → L2 → L5(S)**.

Everything else in the summary table I'm confident on (six EXTEND, one NET-NEW, zero STRIP, zero BUY). The
only genuinely ambiguous call is this first-brick ordering, and it's your call because it trades "substrate
first, moat second" against "moat first, re-instrument later."

---

**STOP.** No Phase-1 code (migration, edge function, or §34 doctrine text) is written until you confirm the
per-department decisions above — in particular the L1-vs-L4 first-brick ordering. On your confirm, Phase 1
opens as **one PR per department**, each citing its section here, each with the §18/§30/§31/§13/§14/§34 hard
gates and real-data proofs.
