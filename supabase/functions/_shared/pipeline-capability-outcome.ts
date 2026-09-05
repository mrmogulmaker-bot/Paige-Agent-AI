import type { CapabilityOutcome } from "./capability-record.ts";

/**
 * WHICH of the six outcomes a Pipeline write act landed in.
 *
 * `capability-record.ts` owns HOW a run is written; this file owns WHAT to write for the
 * Paige-chat Pipeline acts, because only the `paige-ai-chat` executor holds their result
 * shape. It is the sibling of `comms-capability-outcome.ts` and is built on the SAME
 * governing rule (#947): classify by what we POSITIVELY KNOW, and where we do not know,
 * say so. An UNRECOGNISED or ambiguous state defaults to `capability_outcome_unknown`,
 * NEVER to `capability_failed`/`capability_refused` — "nothing changed" must be TRUE
 * whenever it is claimed.
 *
 * ── deal_move_stage's shape (paige-ai-chat/index.ts:9753-9788) ──
 *
 *   - `{ success: true, ... }`  → the deal's stage was updated. `capability_succeeded`.
 *   - `{ success: false, error }` → every false branch returns BEFORE the UPDATE runs
 *     (no workspace in context · stage not in workspace · deal not in workspace), so
 *     nothing external changed. `capability_refused` — "refused before it ran, so nothing
 *     changed" is true of all three.
 *   - THROWN → deliberately `capability_outcome_unknown`, not `failed`. The handler throws
 *     on `merr` (the UPDATE errored — atomic, so probably no change) AND from the
 *     `deal_activities` insert that runs AFTER a successful move — where the deal WAS
 *     moved. The classifier cannot tell those apart, so it must not assert "nothing was
 *     left half-done." "May or may not have taken effect. Check before running it again"
 *     is the only honest read.
 *
 * The set is a Set so the Pipeline family (deal_create, pipeline_create, …) can adopt the
 * same classifier once each is wired; deal_move_stage is the first, per the Phase-2 plan.
 */
export const PIPELINE_WRITE_CAPABILITIES: ReadonlySet<string> = new Set([
  "deal_move_stage",
]);

/**
 * The outcome to record, or `null` for "record nothing" (not a pipeline write act).
 *
 * Pass EITHER `result` (the executor produced a tool result) OR `thrown` (it threw).
 */
export function classifyPipelineRun(input: {
  capability: string;
  result?: unknown;
  thrown?: unknown;
  threw?: boolean;
}): CapabilityOutcome | null {
  if (!PIPELINE_WRITE_CAPABILITIES.has(input.capability)) return null;

  // A throw is ambiguous — it can occur AFTER the deal already moved (the activity-log
  // insert), so we cannot assert nothing changed (§947 governing rule).
  if (input.threw) return "capability_outcome_unknown";

  const r = (input.result && typeof input.result === "object")
    ? input.result as Record<string, unknown>
    : null;
  if (!r) return "capability_outcome_unknown";

  if (r.success === true) return "capability_succeeded";

  // Every `success:false` branch of deal_move_stage returns before the UPDATE — a real
  // refusal where nothing external changed.
  if (r.success === false) return "capability_refused";

  return "capability_outcome_unknown";
}
