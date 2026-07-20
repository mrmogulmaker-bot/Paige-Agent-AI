# §34 Layer 4 — Reasoning Department: Phase-0 Grounding

**Owner:** Antonio Cook · **Prepared:** 2026-07-19 · **Status:** Phase 0 grounding — **NO L4 CODE** until
Cowork verifies L1 is live (owner directive 2026-07-19). This doc is the only artifact of L4 Phase 0.

**Authorization (§18/§34):** `docs/PAIGE-INTELLIGENCE-GROUNDING-REPORT.md` → "Layer 4 — Reasoning" =
**EXTEND** (not STRIP, not BUY). Confirmed build order **L1 → L4 → L2 → L5**. The decision is the §30
"reference the part that works" case: the bounded generate→critique→iterate loop already exists and is
correct (the visual-critique gate), so L4 **generalizes it** rather than cloning LangGraph.

---

## 1. What exists — the reusable skeleton (grep-verified)

The current machinery splits cleanly into two halves; the split is the whole reason this is EXTEND, not
NET-NEW.

**Half A — the caller-side loop** (`_shared/visual-critique-gate.ts:51-97`, `critiqueImageAndIterate`).
Task-**agnostic** and directly liftable:
- Iteration bound: `MAX = env STUDIO_CRITIQUE_MAX_ITERATIONS ?? 3` → `for (i < MAX)` (`:62,66`).
- Cost carry-forward: `let spent = 0` threaded into each eval + updated from the reply (`:63,74,81`).
- Four honest stop conditions: evaluator degraded (`!critique.ok`), `verdict==="SHIP" || capped`, no
  `refined_prompt` → don't spin, `regenerate` failed → keep last good (`:80-88`).
- Enhancement-never-fatal wrapper: the whole loop is in a `try/catch` that only logs — "a failure here
  must never break the generation the user asked for" (`:91-94`). This is the §13 contract for the engine.
- **Visual-specific bits to parameterize out:** the `{ url?: string }` constraint + `!image.url` viability
  check (`:51,67`), and the hardcoded `functions.invoke("studio-visual-critique", …)` evaluator (`:68-77`).

**Half B — the evaluator** (`studio-visual-critique/index.ts`), the "critique" step as an edge fn:
- Cap ceilings enforced (`MAX_ITERATIONS`/`COST_CAP_USD`, `:62-63`, `:246-262`): on cap → force
  `SHIP + capped:true`, log, return. (Agnostic pattern; currently lives inside the visual fn.)
- Honest degrade: `needs_config` when unconfigured; **fail-open to SHIP + `low_confidence:true`** on a
  thrown/unparseable critic — "a broken critic must not BLOCK a legitimate artifact," and it always logs.
- Visual-specific: render/base64, the vision RUBRIC prompt, the `studio_visual_critique_log` insert, the
  §9 JWT-vs-service-role tenant resolution.

**The seam between the halves is already a task-agnostic JSON contract** (`CritiqueResult`): `{ ok, verdict,
summary, refined_prompt, spent_usd, capped, low_confidence, needs_config }` — agnostic in everything except
`artifact_kind`/`image_url`.

## 2. The generalization seam (the L4 net-new)

Lift Half A into `_shared/reasoning/engine.ts` as a generic driver where `generate` and `evaluate` are
injected, and fold Half B's cap-enforcement into the driver so a non-edge caller gets caps for free:

```ts
export interface ReasoningVerdict {
  verdict: "SHIP" | "ITERATE" | "BLOCK";
  refinedInstruction?: string;   // generalizes refined_prompt
  costUsd?: number; capped?: boolean; lowConfidence?: boolean; needsConfig?: boolean;
  findings?: unknown;            // opaque passthrough to trace/UI
}
export async function runReasoning<A>(opts: {
  initial: A;
  generate: (instruction: string, prev: A) => Promise<A | null>;
  evaluate: (artifact: A, iteration: number, spentUsd: number) => Promise<ReasoningVerdict | null>;
  isViable?: (a: A) => boolean;          // replaces `!image.url`
  maxIterations?: number;                // default env, ?? 3
  costCapUsd?: number;                   // default env, ?? 2
  onTrace?: (phase: string, row: unknown) => void;  // L1 hook
}): Promise<{ artifact: A; verdict: ReasoningVerdict | null; iterations: number; spentUsd: number }>
```

The body is `critiqueImageAndIterate` with three substitutions (`image.url`→`isViable`, hardcoded invoke→
`evaluate`, add the dollar-cap `break`). Everything else copies verbatim. **Net-new is thin:** one file +
the `ReasoningVerdict` type + the `onTrace` hook (≈4–6 days per the report).

## 3. The 5-phase mapping

| Phase | In the gate today | L5 talent (`paige_subagents`) | L1 trace / L6 memory | State |
|---|---|---|---|---|
| 1. Strategic Pre-Reasoning | absent (forge does the nearest: template + brand-token + anti-pattern steering) | — | can seed with `recallSimilar` past wins | **net-new (thin)** |
| 2. Pre-Work Self-Reflection | absent (Reflexion is the model) | — | reflection note → L1 | **net-new** |
| 3. Multi-Specialist Review | single critic = the 1-specialist case | ~~plug point: `tool_invoke`~~ → **SHIPPED as fixed frontier lenses** (see decision note) | each specialist verdict → L1 with `parent_trace_id` | **SHIPPED** (`_shared/reasoning/review.ts`) |
| 4. Bounded Iteration | **fully built** (the gate loop + caps) | — | each iteration → L1 via `onTrace` | **built (the seed)** |
| 5. Learning Capture | absent | — | **`prompt-forge.captureToMemory` is the exact primitive** (honest-on-success, voyage-3/1024, explicit tenant_id); L1 = `traceLLMCall` | **built primitives, unwired** |

Net-new: phases 1–2. Partially built: 3 (single→multi). Built + reusable: 4 (loop) and 5 (`captureToMemory`
/ `traceLLMCall` — L4 just calls them on a SHIP verdict).

### Phase-3 design decision (SHIPPED 2026-07-20) — fixed frontier lenses, NOT `tool_invoke`

The row above originally named `paige-orchestrator.searchSubagents`+`tool_invoke` as the phase-3 plug
point. **The shipped `review.ts` deliberately does NOT use `tool_invoke`, and a future session must not
"complete" it by wiring `tool_invoke` in.** Reason (§17): `paige-orchestrator.invokeSoft` defaults soft
agents to `job_kind="internal_first_draft"`, which is **open-model-eligible** — routing a *judgment*
through `tool_invoke` could produce an open-model verdict, exactly what §17's frontier-only-judge rule
forbids. `tool_invoke` also *dispatches* real edge/langgraph agents (cost + side effects + a
`paige_subagent_invocations` row), whereas a review must be a read-only opinion. So phase-3 = **N fixed
frontier reasoning lenses** (`CORE_PANEL`: correctness · completeness · risk), each one
`routedChatCompletion("plan", …)` (frontier-only by construction, like `vision-critique`), pure, no
registry call. Registered-agent discovery via the orchestrator's **read-only `tool_search`** to *inform
which lenses to instantiate* remains a possible future enhancement — but `tool_invoke` in the verdict
path is a rejected design, not a TODO.

## 4. §17/§34 constraints — inherited for free

- **Frontier-only judge, structurally.** The evaluator calls `callModel("vision-critique","frontier",…)`;
  in the ROUTE_TABLE `vision-critique` has a frontier cell and **no open-tier cell** — a judgment can never
  route to an open model. L4 defines its reasoning modality the same way (frontier-only row), and inherits
  the guarantee. `needs_config` is a returned flag, never a throw — the engine's degrade branch already
  handles it.
- **Zero vendor SDK.** The whole path is pure in-repo (Deno/TS + `@supabase/supabase-js` + first-party
  provider clients + in-repo `voyageEmbedOne`). There is **no LangGraph/CrewAI/LangChain import to reject** —
  §34's vendor gate is already satisfied; those are STUDY references only.

## 5. Bootstrap-safe refactor (behavior-preserving, §32)

1. Add `_shared/reasoning/engine.ts` (`runReasoning`) — touch nothing else yet.
2. Re-implement `critiqueImageAndIterate` as a **thin adapter over `runReasoning`**, keeping its exact
   signature + exports, so `paige-ai-chat`'s call site is a **byte-for-byte unchanged caller**. Map
   `isViable=(img)=>!!img.url`, `evaluate=invoke("studio-visual-critique")`+adapt `CritiqueResult`→
   `ReasoningVerdict`, `generate=regenerate`.
3. **Leave `studio-visual-critique` (the evaluator edge fn) untouched** — it stays the visual evaluator; the
   engine treats it as one injected `evaluate`. All live §33 caps, §9 resolution, fail-open logging, and
   `studio_visual_critique_log` rows keep working exactly as deployed.
4. **Wire L1 from day one:** thread `onTrace`→`traceLLMCall` so each iteration/phase writes a
   `paige_llm_trace` row with a shared `task_id` + `parent_trace_id` (the multi-agent tree L7 later reads).

Safe because the visual loop's observable behavior = (a) the four break conditions (preserved by copying)
+ (b) the edge fn's responses (untouched). The one gated live caller (`visualCritiqueEnabled()`, default-off)
sees no contract change.

## 6. The L4 PR shape (when code is unblocked)

- **Net-new:** `_shared/reasoning/engine.ts` (`runReasoning` + `ReasoningVerdict`).
- **Refactor (behavior-preserving):** `critiqueImageAndIterate` → adapter over `runReasoning`.
- **New reasoning callers (layered, opt-in):** Strategic Pre-Reasoning (phase 1) + Pre-Work Self-Reflection
  (phase 2) + Multi-Specialist fan-out (phase 3, **fixed frontier lenses — NOT the `tool_invoke` registry**;
  see the phase-3 decision note in §3). Phases 4–5 are lifts.
- **Hard gates:** §18 (this doc authorizes) · §31 (real reasoning traces to `paige_llm_trace`, no mocks) ·
  §13 (honest degrade, fail-open critic) · §14 (crew) · §34 (no vendor SDK — already clean) · §17
  (frontier-only judge modality).

## 7. Dependency gate (owner directive 2026-07-19) — CLEARED 2026-07-20

**~~L4 CODE HOLDS until Cowork verifies L1 is live.~~ CLEARED.** L1 is verified **live in prod** (2026-07-20):
a real chat `paige_llm_trace` row landed, and the one real defect (a `tenant_id` FK that silently dropped
non-`tenants` traces via the writer's swallowing catch) was fixed and merged (#146). The migration-apply
pipeline note below is **stale** — the 5 stranded 07-19 migrations were applied and the trace store is live.
L4 reasoning callers (phase-1+) now emit real `paige_llm_trace` rows, so the §31 real-data gate is satisfied.
