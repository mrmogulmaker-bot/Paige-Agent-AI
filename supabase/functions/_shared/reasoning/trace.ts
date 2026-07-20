// _shared/reasoning/trace.ts — §34 Layer 4: phase-4 observability + the phase-5 learning seam.
//
//   • reasoningOnTrace(ctx) — the onTrace hook for runReasoning. Each iteration becomes ONE
//     paige_llm_trace row TAGGED provider="reasoning-engine" — the reasoning LOOP itself, distinct from
//     the raw LLM-call rows the judge/generate plugs write via callModel. So the flight recorder shows
//     both "the reasoning" and "the calls it made" (§34 L1 = the substrate L4 measures against). Without
//     this, the reasoning engine reasons in the dark.
//   • captureToMemory (re-exported) — phase 5. The EXISTING §26/§34-L6 honest-capture primitive is the
//     one home for remembering what worked (voyage-3 only, §2 finance-clean, tenant-scoped, honest —
//     only a genuine produced artifact is remembered). A reasoning caller that ships a real artifact on
//     SHIP calls it directly with the artifact's real Modality/Tier/ModelResult — no second memory path
//     and no leaky reasoning-shaped wrapper fighting the forge's types (§18 one home).
import { traceLLMCall, type TraceCtx } from "../llm-trace.ts";
import type { ReasoningVerdict } from "./engine.ts";

// Phase-5 learning-capture seam: use the built primitive with its real types. Re-exported here so the
// _shared/reasoning/ module is the one-stop L4 surface (discoverable), not a rival memory path.
export { captureToMemory, type CaptureParams } from "../prompt-forge.ts";

/**
 * Build an `onTrace` for runReasoning that records each reasoning step as a paige_llm_trace row. Tagged
 * provider="reasoning-engine" / modality="reasoning" so it reads as a loop meta-event, not a fabricated
 * LLM call — the judge's/generator's actual LLM calls trace themselves separately (via callModel), and a
 * reader filters the two apart or reassembles the tree by task_id. Best-effort/detached: traceLLMCall
 * never throws, so this can never break the reasoning loop (§13).
 */
export function reasoningOnTrace(ctx: TraceCtx) {
  return (phase: string, row: { iteration: number; verdict: ReasoningVerdict | null; spentUsd: number }): void => {
    const v = row.verdict;
    traceLLMCall({
      ...ctx,
      provider: "reasoning-engine",
      model: "runReasoning",
      job_kind: ctx.job_kind ?? `reason:${phase}`,
      modality: "reasoning",
      // Honest status: no verdict → the evaluator degraded/errored; needsConfig → an honest
      // not-configured degrade; otherwise the step produced a real verdict.
      status: !v ? "error" : v.needsConfig ? "needs_config" : "success",
      cost_estimate_usd: typeof row.spentUsd === "number" ? row.spentUsd : null,
      // The reasoning OUTPUT of this step — the verdict + findings (scrubbed + truncated by the writer).
      output: v
        ? { verdict: v.verdict, capped: v.capped, lowConfidence: v.lowConfidence, refinedInstruction: v.refinedInstruction, findings: v.findings }
        : null,
      metadata: { caller_function: ctx.agent_id, attempt: row.iteration },
    });
  };
}
