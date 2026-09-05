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
 *   - THROWN → the honest outcome depends on WHERE the throw happened relative to the external
 *     write, so the caller passes `writeAttempted` (§13/§39 + Codex P2, 2026-09-05):
 *       • `writeAttempted === true` (the `deals` UPDATE was dispatched and threw, or a transport
 *         error landed around it) → `capability_outcome_unknown`. A thrown UPDATE/transport error
 *         cannot be PROVEN at the JS layer to have NOT applied (a transport throw can land after
 *         the row committed but before the response arrived), so we never assert "nothing was
 *         left half-done." Mapping THIS case to `failed` is the §947-forbidden false-"nothing
 *         changed" and is rejected.
 *       • `writeAttempted !== true` (a PRE-WRITE throw — the shared dispatch `try` begins with
 *         `JSON.parse(tc.function.arguments)` then `createClient(...)`, and the handler's
 *         pre-UPDATE stage lookup now `throw`s its own query error) → `capability_failed`. No
 *         external effect was attempted, so "nothing changed" is TRUE. It must NOT be
 *         `capability_outcome_unknown`: that outcome's Rail copy ("was sent … may have taken
 *         effect … check before re-running") is a FALSE reassurance about an act that never
 *         dispatched (the exact Codex P2 defect this split fixes), and it must NOT be
 *         `capability_refused` (no guard decision was made — that is an operational failure).
 *     The `deal_activities` timeline insert still cannot throw (it goes through
 *     `recordWrite`→`checkedWrite`, `_shared/checked-write.ts`, which swallows and returns
 *     false), so it never affects this mapping.
 *
 * FAMILY GROWTH (S1 review m4 + Codex P2): the Set may later add deal_create / pipeline_create /
 * …, and the `writeAttempted` boundary is what makes that safe to generalize — each new member
 * MUST (a) set the caller's write-attempted flag immediately BEFORE its first external write, and
 * (b) `throw` (not swallow) any pre-UPDATE lookup error so it lands in the pre-write bucket. The
 * `success:false → refused` mapping stays verified for deal_move_stage's control flow ONLY (every
 * `success:false` branch returns before the UPDATE); a new member with a different shape branches
 * per-capability (as `comms-capability-outcome.ts` does) first.
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
  /**
   * Did the executor get as far as DISPATCHING the external write before it threw? The caller
   * sets this `true` immediately before its first mutating call (the `deals` UPDATE). It splits
   * a throw's honesty: a post-write throw may have applied (`outcome_unknown`); a pre-write throw
   * provably did not (`failed`). Absent/false ⇒ pre-write. See the header for the full rationale.
   */
  writeAttempted?: boolean;
}): CapabilityOutcome | null {
  if (!PIPELINE_WRITE_CAPABILITIES.has(input.capability)) return null;

  if (input.threw) {
    // Post-write throw: not PROVABLY non-applied (a transport throw can land after commit), so
    // never claim "nothing changed" — `capability_outcome_unknown` (§947 governing rule).
    // Pre-write throw (malformed-args JSON.parse, client construction, or a pre-UPDATE lookup
    // error the handler now re-throws): no external effect was attempted, so "nothing changed"
    // is TRUE — `capability_failed`, NEVER the false-reassurance `outcome_unknown` (Codex P2).
    return input.writeAttempted ? "capability_outcome_unknown" : "capability_failed";
  }

  const r = (input.result && typeof input.result === "object")
    ? input.result as Record<string, unknown>
    : null;
  if (!r) return "capability_outcome_unknown";

  if (r.success === true) return "capability_succeeded";

  // Every `success:false` branch of deal_move_stage returns BEFORE the UPDATE — a real refusal
  // where nothing external changed. The one former exception (an operational stage-lookup error
  // surfacing as `success:false`) is now THROWN at the handler and classified above as
  // `capability_failed`, so a false "refused" on an outage can no longer reach here (Codex P2).
  if (r.success === false) return "capability_refused";

  return "capability_outcome_unknown";
}
