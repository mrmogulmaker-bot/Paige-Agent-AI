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
 *   - THROWN → deliberately `capability_outcome_unknown`, not `failed`. §13/§39 correction
 *     (both S1 review passes, 2026-09-05): an earlier draft claimed the `deal_activities`
 *     insert "throws after a successful move" — that is FALSE. That insert goes through
 *     `recordWrite`→`checkedWrite` (`_shared/checked-write.ts`), which swallows its error and
 *     returns false, NEVER throwing (`result` is still set to success). So the ONLY in-branch
 *     throw is `if (merr) throw merr` (index.ts ~9805, BEFORE the activity insert), plus a
 *     pre-handler `JSON.parse`/`createClient` throw in the shared dispatch `try`. `unknown` is
 *     still the honest mapping: a thrown UPDATE/transport error cannot be PROVEN at the JS
 *     layer to have NOT applied (a transport throw can land after the row committed but before
 *     the response arrived), so we never assert "nothing was left half-done." Mapping a throw
 *     to `failed` is the exact §947-forbidden false-"nothing changed" and is rejected here.
 *
 * FAMILY GROWTH (S1 review m4): the Set may later add deal_create / pipeline_create / …, but
 * the blanket rules below (`success:false → refused`, `throw → unknown`) are verified for
 * deal_move_stage's control flow ONLY. Each new member MUST re-verify that its `success:false`
 * returns before any write, and that no throw path can follow a committed effect — or branch
 * per-capability (as `comms-capability-outcome.ts` does with per-code signal maps) — first.
 *
 * OTHER PRODUCER, out of S1 scope (§37, review m2): `paige-mcp` also exposes `move_deal_stage`
 * (`paige-mcp/index.ts:490`), which moves the deal and records to `paige_audit_log` (via
 * `audit(...)`, :515), NOT to `record_capability_run` — so an MCP-driven move does not appear
 * on the capability Rail. That is a deliberate S1 boundary (S1 = the Paige conversation
 * executor), disclosed here and tracked as a follow-up, mirroring how `capability-record.ts`
 * names its own uncovered producers.
 *
 * DISPLAY COPY, follow-up (review m3): the Rail projection `_workspace_event_display`
 * (`migration 20261220000000`) has no `deal_move_stage` case, so a recorded run renders under
 * the generic ELSE ("Completed a step for you"). Honest but generic; a specific label needs a
 * Rail-projection migration and is filed as a follow-up rather than pulled into this code-only
 * slice (§0.3 — Rail schema/projection is consumed, not altered, here).
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

  // A thrown UPDATE/transport error is not PROVABLY non-applied at the JS layer (a transport
  // throw can land after the row committed), so we never assert "nothing changed" on a throw
  // (§947 governing rule) — NOT `failed`. The activity-log insert cannot throw (it goes through
  // checkedWrite), so the in-branch throw is only `throw merr`; see the header for the full
  // corrected rationale.
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
