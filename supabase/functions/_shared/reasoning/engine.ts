// _shared/reasoning/engine.ts — §34 Layer 4 (Reasoning Department), Slice 1.
//
// The GENERAL, task-agnostic bounded reasoning loop. It is the proven visual-critique loop
// (_shared/visual-critique-gate.ts) lifted out of its visual specifics: instead of a hardcoded
// "screenshot → studio-visual-critique → regenerate", it takes an injected `generate` and `evaluate`
// so ANY task can run the same generate → evaluate → iterate cycle with the same caps and the same
// §13 honest-degrade guarantees. §30 "reference the part that works" — this generalizes a live, correct
// loop; it does NOT clone LangGraph. §34 — pure Deno/TS, no vendor SDK.
//
// The five §34-L4 phases (Strategic Pre-Reasoning → Pre-Work Self-Reflection → Multi-Specialist Review
// → Bounded Iteration → Learning Capture) layer ON TOP of this: this file is phase 4 (Bounded
// Iteration) generalized, with an `onTrace` hook so each pass writes an L1 trace and a SHIP verdict can
// drive Learning Capture. Slice 1 ships the engine + the visual-critique adapter (below, in the gate);
// the net-new reasoning callers (phases 1–3) are follow-on slices.
//
// HONEST-DEGRADE CONTRACT (§13, inherited from the gate): the whole loop is an ENHANCEMENT wrapped so a
// failure in it NEVER breaks the generation the caller asked for. Every stop condition keeps the last
// good artifact rather than throwing.

export interface ReasoningVerdict {
  /** The judge's call on the current artifact. */
  verdict: "SHIP" | "ITERATE" | "BLOCK";
  /** On ITERATE/BLOCK, the refined instruction to regenerate from. Empty/absent → stop (don't spin). */
  refinedInstruction?: string;
  /** RUNNING total USD spent through this evaluation (mirrors the gate's spent_usd). The engine uses it
   *  for the cost-cap break. A clearly-labeled ESTIMATE, never a bill (§13). */
  costUsd?: number;
  /** The evaluator hit its own iteration/cost ceiling and forced a stop. */
  capped?: boolean;
  /** The evaluator failed open (errored/unparseable) — kept the artifact, flagged low confidence. */
  lowConfidence?: boolean;
  /** The evaluator isn't configured — an honest degrade, not a verdict. Loop accepts what it has. */
  needsConfig?: boolean;
  /** Opaque passthrough for the UI/trace (e.g. the critic's blockers/should_fix/nits). */
  findings?: unknown;
}

export interface ReasoningResult<A> {
  artifact: A;
  /** The final verdict, or null if the loop never got a usable one (degraded on the first pass). */
  verdict: ReasoningVerdict | null;
  iterations: number;
  spentUsd: number;
}

export interface RunReasoningOpts<A> {
  /** The starting artifact. */
  initial: A;
  /** Regenerate from a refined instruction → the new artifact (or null on failure — loop keeps the last). */
  generate: (instruction: string, prev: A) => Promise<A | null>;
  /** Judge the current artifact → a verdict (or null to degrade/accept-what-we-have). */
  evaluate: (artifact: A, iteration: number, spentUsd: number) => Promise<ReasoningVerdict | null>;
  /** Is this artifact worth evaluating at all? Defaults to a truthiness check (replaces `!image.url`). */
  isViable?: (a: A) => boolean;
  /** Iteration ceiling. Default: env STUDIO_CRITIQUE_MAX_ITERATIONS ?? 3 (shared with the §33 caps). */
  maxIterations?: number;
  /** Dollar ceiling on the running spend. Default: env STUDIO_CRITIQUE_COST_CAP_USD ?? 2. <=0 disables. */
  costCapUsd?: number;
  /** Per-pass observability hook (§34 L1). New reasoning callers pass this to write a paige_llm_trace row
   *  per iteration; the visual-critique adapter leaves it unset (its evaluate is an edge fn that already
   *  traces itself, so wiring it here would double-count). Best-effort — must never throw. */
  onTrace?: (phase: string, row: { iteration: number; verdict: ReasoningVerdict | null; spentUsd: number }) => void;
}

/**
 * Run the bounded generate → evaluate → iterate loop. Behavior mirrors the proven visual-critique gate:
 * evaluate the artifact; on SHIP/capped/degrade/no-refinement stop and keep what we have; otherwise
 * regenerate from the refined instruction and go again, up to the iteration/cost caps. Never throws into
 * the caller (§13) — a loop failure returns the last good artifact.
 */
export async function runReasoning<A>(opts: RunReasoningOpts<A>): Promise<ReasoningResult<A>> {
  const isViable = opts.isViable ?? ((a: A) => !!a);
  const MAX = opts.maxIterations ?? Number(Deno.env.get("STUDIO_CRITIQUE_MAX_ITERATIONS") ?? "3");
  const COST_CAP = opts.costCapUsd ?? Number(Deno.env.get("STUDIO_CRITIQUE_COST_CAP_USD") ?? "2");

  let artifact = opts.initial;
  let verdict: ReasoningVerdict | null = null;
  let spent = 0;
  let iterations = 0;

  try {
    for (let iteration = 0; iteration < MAX; iteration++) {
      if (!isViable(artifact)) break;
      iterations = iteration + 1;

      verdict = await opts.evaluate(artifact, iteration, spent);
      try { opts.onTrace?.("evaluate", { iteration, verdict, spentUsd: spent }); } catch { /* trace never breaks the loop */ }

      if (!verdict || verdict.needsConfig) break;            // degrade — accept what we have (§13)
      if (typeof verdict.costUsd === "number") spent = verdict.costUsd;
      if (verdict.verdict === "SHIP" || verdict.capped) break;
      if (COST_CAP > 0 && spent >= COST_CAP) break;          // dollar cap (the evaluator enforces it too)

      const refined = (verdict.refinedInstruction ?? "").trim();
      if (!refined) break;                                    // ITERATE/BLOCK with no actionable step — stop

      const next = await opts.generate(refined, artifact);
      if (next == null || !isViable(next)) break;             // regenerate failed — keep the last good (§13)
      artifact = next;
    }
  } catch (e) {
    // ENHANCEMENT, never fatal (§13): a loop failure must not break the generation the caller asked for.
    console.error("[reasoning-engine] loop error (non-fatal):", e);
  }

  return { artifact, verdict, iterations, spentUsd: spent };
}
