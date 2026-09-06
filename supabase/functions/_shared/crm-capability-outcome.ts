import type { CapabilityOutcome } from "./capability-record.ts";

/**
 * WHICH of the six outcomes a Paige-chat CRM/scheduling write act landed in.
 *
 * `capability-record.ts` owns HOW a run is written; this file owns WHAT to write for the CRM
 * write-receipts the §39 Slice-1 verifier named (`crm_log_activity`, `calendar_book_meeting`,
 * `crm_create_task`) — actions that until now recorded ONLY to `paige_audit_log` and left no
 * capability-Rail row (F05 continuation). It is the sibling of `pipeline-capability-outcome.ts`
 * and `comms-capability-outcome.ts`, built on the SAME governing rule (#947): classify by what we
 * POSITIVELY KNOW; where we do not know, say so — an unrecognised/ambiguous state defaults to
 * `capability_outcome_unknown`, NEVER `capability_failed`/`capability_refused` ("nothing changed"
 * must be TRUE whenever claimed).
 *
 * ── The three shapes (paige-ai-chat/index.ts) ──
 * All three have the SAME control flow: build the row, dispatch a SINGLE external write, then
 * `if (error) throw error` and return `{ success: true, <id> }`. There is NO `success:false`
 * branch — a handler either succeeds or throws. So:
 *   - `crm_create_task`      → `.from("tasks").insert(...)`               → `{ success:true, task_id }`
 *   - `calendar_book_meeting`→ rpc `create_internal_booking`             → `{ success:true, booking_id }`
 *   - `crm_log_activity`     → `.from("communication_log").insert(...)`  → `{ success:true, log_id }`
 *
 *   - `{ success:true, ... }` → the row was written. `capability_succeeded`.
 *   - THROWN → honesty depends on WHERE the throw landed relative to the external write, so the
 *     caller passes `writeAttempted` (set TRUE immediately before the insert/RPC, §13/§39, mirroring
 *     the pipeline recorder):
 *       • `writeAttempted === true` → a post-write throw cannot be PROVEN at the JS layer to have
 *         NOT applied (a transport throw can land after the row committed) → `capability_outcome_unknown`.
 *       • `writeAttempted !== true` → a pre-write throw (the shared dispatch `try` opens with
 *         `JSON.parse(args)` + `createClient(...)`) attempted no external effect, so "nothing
 *         changed" is TRUE → `capability_failed`.
 *   - `{ success:false, ... }` → NONE of these three handlers emits this shape. If one ever does it
 *     is an UNEXPECTED state, so it is `capability_outcome_unknown` — NOT `capability_refused`
 *     (there is no refusal branch here to have made a "nothing changed" decision). This is the
 *     deliberate difference from `pipeline-capability-outcome.ts`, whose `deal_move_stage`
 *     genuinely returns `success:false` from pre-write guard branches.
 *
 * FAMILY GROWTH: a new member with a real `success:false` refusal branch (e.g. `deal_create`) must
 * branch per-capability first (as `comms-capability-outcome.ts` does) rather than reuse this
 * no-refusal mapping — the three receipts share this shape, which is why they ship together.
 *
 * OTHER PRODUCERS, out of scope (§37): the generic `paige_audit_log` trail (`auditWriteForTool`)
 * still records these acts too — this adds the capability-Rail row alongside it, it does not replace
 * the audit trail. `paige-mcp` does not expose these three, so there is no second producer to cover.
 */
export const CRM_WRITE_CAPABILITIES: ReadonlySet<string> = new Set([
  "crm_log_activity",
  "calendar_book_meeting",
  "crm_create_task",
]);

/**
 * The outcome to record, or `null` for "record nothing" (not a covered CRM write act).
 *
 * Pass EITHER `result` (the executor produced a tool result) OR `thrown` (it threw).
 */
export function classifyCrmRun(input: {
  capability: string;
  result?: unknown;
  thrown?: unknown;
  threw?: boolean;
  /**
   * Did the executor DISPATCH its external write before it threw? The caller sets this `true`
   * immediately before the insert/RPC. A post-write throw may have applied (`outcome_unknown`); a
   * pre-write throw provably did not (`failed`). Absent/false ⇒ pre-write.
   */
  writeAttempted?: boolean;
}): CapabilityOutcome | null {
  if (!CRM_WRITE_CAPABILITIES.has(input.capability)) return null;

  if (input.threw) {
    return input.writeAttempted ? "capability_outcome_unknown" : "capability_failed";
  }

  const r = (input.result && typeof input.result === "object")
    ? input.result as Record<string, unknown>
    : null;
  if (!r) return "capability_outcome_unknown";

  if (r.success === true) return "capability_succeeded";

  // These three handlers never return success:false; an unexpected one is not a refusal decision,
  // so record the honest "unknown", never a false "refused" (the difference from the pipeline map).
  return "capability_outcome_unknown";
}
