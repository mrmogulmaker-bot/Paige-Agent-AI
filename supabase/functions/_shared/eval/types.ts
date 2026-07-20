// _shared/eval/types.ts — §34 Layer 2 (Quality/Evals) shared vocabulary.
//
// The internal "Evals" department (NOT Braintrust): the shapes a scorer returns and a run produces.
//
// HONESTY (§31): a score of `null` is an HONEST "could not score" (missing rubric/config, a broken
// judge) — it is NEVER a fabricated pass. `passed` is `null` when there is no real score. The
// aggregate is a mean over REAL scores only and is `null` when nothing scored — never 0-coerced
// (null ≠ zero, mirrors paige_llm_trace cost).
//
// §17: the llm_judge scorer routes through the model router's "plan" (Claude reasoning) tier — a
// design/quality JUDGMENT is FRONTIER-ONLY and can never run on an open model.

/** One scorer's verdict on one case. score/passed are null when the scorer genuinely could not evaluate. */
export interface ScoreResult {
  /** Scorer name, e.g. "exact_match" | "rubric_judge". */
  scorer: string;
  scorerKind: "deterministic" | "llm_judge";
  /** NULL = honest could-not-score, NEVER a fabricated pass (§31). Otherwise typically 0..1. */
  score: number | null;
  /** NULL when there is no real score. */
  passed: boolean | null;
  status: "scored" | "needs_config" | "low_confidence" | "error";
  rationale?: string;
  /** Concrete model id when scorerKind === "llm_judge" (§17 auditable). */
  judgeModel?: string | null;
  /** Clearly-labeled ESTIMATE for this scorer call (judge only); undefined for deterministic. */
  costUsd?: number;
}

/** The result of one eval RUN over a set of cases with a set of scorers. */
export interface EvalResult {
  runId: string;
  target: { kind: string; ref: string; version?: string };
  /** Cases considered. */
  caseCount: number;
  /** Results that produced a REAL (non-null) score. */
  scoredCount: number;
  /** Results that could NOT score (needs_config/low_confidence/error). */
  degradedCount: number;
  /** Mean over REAL scores only; NULL when nothing scored (never 0-coerced, §31). */
  aggregateScore: number | null;
  /** Fraction passed over the scored cases; NULL when nothing scored. */
  passRate: number | null;
  results: ScoreResult[];
  /** Clearly-labeled ESTIMATE — sum of the scorer calls' costs. */
  costUsd: number;
  /** True when NOTHING produced a real score — the run added no real judgment (§13/§31). */
  degraded: boolean;
  /** True when aggregateScore fell vs the prev_run baseline (only set when a baseline was given). */
  regressedVsPrev?: boolean;
}
