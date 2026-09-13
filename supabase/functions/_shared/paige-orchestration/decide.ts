// Paige Runtime Harness — Layer C: the pure decision core of the connector-neutral act engine.
//
// PURE by construction (no I/O, no env, no clock) so the governance decisions are unit-provable without a
// live provider, a database, or a tenant. The event→act engine (engine.ts, which does the DB I/O) composes
// these with `decideGovernedExecution` (the one governed pathway) and the ActionAdapter registry.
//
// This file owns three connector-neutral, domain-neutral concerns:
//   1. CONDITION EVALUATION — closes the dispatcher's `TODO F3`: a subscriber whose conditions do not match
//      the event MUST NOT run. Empty/absent conditions match (an unconditional automation).
//   2. LANE → non-execute outcome — an effective lane of `off` holds the act; `confirm` sends it to approval.
//   3. REFUSAL → outcome — maps a GovernedRefusalCode to the exact refused_* outcome the owner requires.
//
// The outcome vocabulary mirrors the SQL domain `paige_act_outcome` (20270126000000). One definition per
// side; widening is one edit each. Nothing here is n8n- or Telegram-specific.

/** The exact per-act outcome vocabulary — mirrors the SQL domain `public.paige_act_outcome`. */
export type ActOutcome =
  | "condition_not_matched"
  | "held_by_lane"
  | "approval_pending"
  | "refused_authority"
  | "refused_budget"
  | "refused_trust_compass"
  | "refused_consent"
  | "accepted_for_execution"
  | "retrying"
  | "executed"
  | "failed"
  | "ambiguous"
  | "cancelled";

/**
 * A single condition on a §67 process record (`paige_automations.conditions`, a jsonb array). This is the
 * FIRST evaluator, so it defines the connector-neutral shape: each condition names a dotted `field` read
 * from the event's facts and an operator. Unknown/malformed conditions fail SAFE — they do NOT match, so a
 * process never fires on conditions the engine could not understand (fail-closed for an execute path).
 */
export type ConditionOp = "eq" | "ne" | "exists" | "not_exists" | "in" | "not_in" | "contains" | "gt" | "lt";
export type AutomationCondition = {
  field: string;
  op: ConditionOp;
  value?: unknown;
};

/** The facts a condition is evaluated against: the event's minimal payload + its subject coordinates. */
export type EventFacts = {
  event_key: string;
  subject_table: string;
  subject_id: string;
  payload: Record<string, unknown>;
};

export type ConditionVerdict =
  | { matched: true }
  | { matched: false; reason: string };

/** Read a dotted path (`a.b.c`) from the event facts. `event_key`/`subject_table`/`subject_id` are addressable
 *  at the top level; everything else resolves against `payload`. Returns undefined if any hop is absent. */
function readField(facts: EventFacts, field: string): unknown {
  if (field === "event_key") return facts.event_key;
  if (field === "subject_table") return facts.subject_table;
  if (field === "subject_id") return facts.subject_id;
  const path = field.startsWith("payload.") ? field.slice("payload.".length) : field;
  let cur: unknown = facts.payload;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function isCondition(x: unknown): x is AutomationCondition {
  if (x == null || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return typeof c.field === "string" && c.field.length > 0 && typeof c.op === "string";
}

function evalOne(cond: AutomationCondition, facts: EventFacts): boolean {
  const actual = readField(facts, cond.field);
  switch (cond.op) {
    case "exists":     return actual !== undefined && actual !== null;
    case "not_exists": return actual === undefined || actual === null;
    case "eq":         return actual === cond.value;
    case "ne":         return actual !== cond.value;
    case "in":         return Array.isArray(cond.value) && cond.value.includes(actual as never);
    case "not_in":     return Array.isArray(cond.value) && !cond.value.includes(actual as never);
    case "contains":
      if (typeof actual === "string" && typeof cond.value === "string") return actual.includes(cond.value);
      if (Array.isArray(actual)) return (actual as unknown[]).includes(cond.value as never);
      return false;
    case "gt":         return typeof actual === "number" && typeof cond.value === "number" && actual > cond.value;
    case "lt":         return typeof actual === "number" && typeof cond.value === "number" && actual < cond.value;
    default:           return false; // unreachable given the type, but fail-safe if a bad op slips through
  }
}

/**
 * Evaluate an automation's `conditions` (raw jsonb) against the event. ALL conditions must hold (AND).
 * - Empty array / null / undefined → matched (an unconditional automation).
 * - A non-array, or any element that is not a well-formed condition → NOT matched, with a reason
 *   (fail-safe: a process never fires on conditions the engine cannot understand).
 */
export function evaluateConditions(conditionsRaw: unknown, facts: EventFacts): ConditionVerdict {
  if (conditionsRaw == null) return { matched: true };
  if (!Array.isArray(conditionsRaw)) {
    return { matched: false, reason: "conditions is not an array; failing safe (not matched)" };
  }
  if (conditionsRaw.length === 0) return { matched: true };
  for (const raw of conditionsRaw) {
    if (!isCondition(raw)) {
      return { matched: false, reason: "malformed condition element; failing safe (not matched)" };
    }
    if (!evalOne(raw, facts)) {
      return { matched: false, reason: `condition not satisfied: ${raw.field} ${raw.op}` };
    }
  }
  return { matched: true };
}

/**
 * The non-execute outcome implied by an effective autonomy lane. Only `auto` proceeds to a governed
 * execute decision; `off` holds the act, `confirm` routes it to approval. An unrecognized lane fails
 * SAFE to held_by_lane (never silently executes) — the governed seam also refuses an unrecognized lane,
 * but the engine must not even attempt an execute for one.
 */
export function laneNonExecuteOutcome(effectiveLane: string): ActOutcome | null {
  switch (effectiveLane) {
    case "auto":    return null;            // proceed to decideGovernedExecution
    case "confirm": return "approval_pending";
    case "off":     return "held_by_lane";
    default:        return "held_by_lane";  // fail safe
  }
}

/**
 * Map a GovernedRefusalCode (from decideGovernedExecution) to the exact refused_* outcome. Codes are kept as
 * string literals rather than importing the union so this stays dependency-light and unit-testable.
 *
 * HONESTLY (§13) about what the seam emits TODAY: of the literals below, only `autonomy_off` is currently a
 * real `GovernedRefusalCode`. The budget / consent / trust-decay literals are FORWARD-LOOKING — placeholders
 * for gates not yet wired into the seam (a budget cap, a consent/quiet-hours check, §68 authority decay) —
 * so they map now to the right bucket for when those land. Every OTHER real refusal code the seam can emit
 * today (identity, tenancy, access, capability-availability, effect, outcome-channel, approval-claim) is
 * UNMAPPED and falls to `refused_authority` — the safe default: an unbucketed refusal is an authority
 * refusal, never a success. TOTALITY (every real code maps to some `refused_*`) is asserted against the
 * seam's `GOVERNED_REFUSAL_CODES` in `paige-orchestration-decide.test.ts`.
 */
export function refusalToOutcome(code: string): Extract<ActOutcome,
  "refused_authority" | "refused_budget" | "refused_trust_compass" | "refused_consent"> {
  switch (code) {
    case "budget_exceeded":
    case "over_budget":
    case "budget_cap_exceeded":
      return "refused_budget";
    case "trust_ceiling":
    case "trust_ceiling_exceeded":
    case "authority_decayed":
    case "autonomy_off":            // an off lane clamped by the ceiling reads as a trust-compass refusal
      return "refused_trust_compass";
    case "consent_required":
    case "quiet_hours":
    case "communication_limit":
      return "refused_consent";
    default:
      return "refused_authority";
  }
}
