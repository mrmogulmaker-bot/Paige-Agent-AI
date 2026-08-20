// =============================================================================
// Alerting — condition validation + evaluation (A2)
// =============================================================================
// The condition language is a VALIDATED SHAPE, not an expression parser. See
// docs/architecture/platform-alerting-substrate.md for why: a parser becomes a
// maintenance problem, while a validated triple is what lets Paige author a rule from
// chat (§10) and lets this evaluator reject a malformed rule instead of guessing at it.
//
//   leaf:  { signal, op, value, for_minutes? }
//   node:  { all_of: [...] } | { any_of: [...] }
//
// PURE by construction — no DB, no fetch, no clock. The caller supplies the resolved
// signal values and the timestamps. That is what makes this testable headlessly (§32),
// which matters because a wrong evaluation does not throw: it silently fires, or
// silently fails to fire, and nothing notices.
// =============================================================================

export type CompareOp = "gte" | "gt" | "lte" | "lt" | "eq" | "neq";

export interface ConditionLeaf {
  signal: string;
  op: CompareOp;
  value?: number | boolean | null;
  for_minutes?: number;
}

export interface ConditionAll {
  all_of: Condition[];
}
export interface ConditionAny {
  any_of: Condition[];
}
export type Condition = ConditionLeaf | ConditionAll | ConditionAny;

export function isAll(c: Condition): c is ConditionAll {
  return typeof c === "object" && c !== null && Array.isArray((c as ConditionAll).all_of);
}
export function isAny(c: Condition): c is ConditionAny {
  return typeof c === "object" && c !== null && Array.isArray((c as ConditionAny).any_of);
}
export function isLeaf(c: Condition): c is ConditionLeaf {
  return typeof c === "object" && c !== null && typeof (c as ConditionLeaf).signal === "string";
}

const OPS: ReadonlySet<string> = new Set(["gte", "gt", "lte", "lt", "eq", "neq"]);

/**
 * §13 — `present` / `absent` / `changed` are DELIBERATELY NOT in that set, and rules using them are
 * REJECTED rather than accepted-and-ignored.
 *
 * `changed` needs the previous reading, which this substrate does not keep. `present` / `absent` need
 * a signal that can legitimately have no reading — and none exists: a reader either produces a value
 * or is recorded unreadable, and a rule that depends on an unreadable signal is SKIPPED before it is
 * ever evaluated. So `present` would be trivially true for every readable signal and `absent` could
 * never be true at all.
 *
 * An op that is accepted at authoring time and can only ever produce a rule that silently never fires
 * is worse than a missing feature: the operator sees a saved rule and reasonably believes it is
 * watching something. They return the day a genuinely nullable signal does, together with it.
 */

export interface ValidationResult {
  ok: boolean;
  /** Human-readable, and recorded — a rule rejected for an unstated reason is a rule nobody can fix. */
  errors: string[];
  /** Every distinct signal key the condition depends on. */
  signals: string[];
  /** The largest `for_minutes` anywhere in the tree; 0 when none is set. */
  sustainMinutes: number;
}

/**
 * Validate a stored condition BEFORE evaluating it.
 *
 * Deliberately strict and deliberately non-throwing: a malformed rule is a data problem,
 * not a crash, and the evaluator must be able to skip one bad rule without taking the
 * whole sweep down with it (§32 — degrade visibly, never silently, and never wholesale).
 */
export function validateCondition(raw: unknown, depth = 0): ValidationResult {
  const errors: string[] = [];
  const signals = new Set<string>();
  let sustain = 0;

  // A rule nested this deep is a mistake, not a requirement; the guard also makes the
  // recursion total against a cyclic/hand-edited JSONB blob.
  if (depth > 8) {
    return { ok: false, errors: ["condition nested deeper than 8 levels"], signals: [], sustainMinutes: 0 };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["condition must be an object"], signals: [], sustainMinutes: 0 };
  }

  const c = raw as Condition;

  if (isAll(c) || isAny(c)) {
    const kids = isAll(c) ? c.all_of : c.any_of;
    const label = isAll(c) ? "all_of" : "any_of";
    if (kids.length === 0) {
      // An empty all_of is vacuously TRUE and would fire forever; an empty any_of is
      // vacuously false and would never fire. Both are certainly authoring mistakes.
      errors.push(`${label} is empty`);
    }
    for (const kid of kids) {
      const r = validateCondition(kid, depth + 1);
      errors.push(...r.errors);
      r.signals.forEach((s) => signals.add(s));
      sustain = Math.max(sustain, r.sustainMinutes);
    }
    return { ok: errors.length === 0, errors, signals: [...signals], sustainMinutes: sustain };
  }

  if (!isLeaf(c)) {
    return {
      ok: false,
      errors: ["condition is neither a leaf (signal/op) nor all_of/any_of"],
      signals: [],
      sustainMinutes: 0,
    };
  }

  if (!c.signal.trim()) errors.push("leaf has an empty signal key");
  if (!OPS.has(c.op)) errors.push(`unknown op "${String(c.op)}"`);
  else if (c.value === undefined || c.value === null) {
    errors.push(`op "${c.op}" on "${c.signal}" needs a value`);
  } else if (typeof c.value !== "number" && typeof c.value !== "boolean") {
    errors.push(`op "${c.op}" on "${c.signal}" needs a number or boolean value`);
  }
  if (c.for_minutes !== undefined) {
    if (typeof c.for_minutes !== "number" || !Number.isFinite(c.for_minutes) || c.for_minutes < 0) {
      errors.push(`for_minutes on "${c.signal}" must be a non-negative number`);
    } else {
      sustain = Math.max(sustain, c.for_minutes);
    }
  }
  if (c.signal.trim()) signals.add(c.signal);

  return { ok: errors.length === 0, errors, signals: [...signals], sustainMinutes: sustain };
}

/** Resolved signal readings handed to the evaluator. `undefined` = could not be read. */
export type SignalValues = Record<string, number | boolean | undefined>;

/**
 * Evaluate a VALIDATED condition against resolved readings.
 *
 * Returns `undefined` — not false — when any leaf it depends on could not be read.
 * That distinction is the whole §13 point: "we looked and it was fine" and "we could not
 * look" are different facts, and collapsing the second into the first is how a monitoring
 * system reports green while blind.
 */
export function evaluateCondition(c: Condition, values: SignalValues, depth = 0): boolean | undefined {
  if (depth > 8) return undefined;

  if (isAll(c)) {
    let sawUnknown = false;
    for (const kid of c.all_of) {
      const r = evaluateCondition(kid, values, depth + 1);
      // A definite false short-circuits: the whole conjunction is false whatever the rest
      // reads, so an unreadable sibling cannot change the answer.
      if (r === false) return false;
      if (r === undefined) sawUnknown = true;
    }
    return sawUnknown ? undefined : true;
  }

  if (isAny(c)) {
    let sawUnknown = false;
    for (const kid of c.any_of) {
      const r = evaluateCondition(kid, values, depth + 1);
      // Mirror image: a definite true short-circuits a disjunction.
      if (r === true) return true;
      if (r === undefined) sawUnknown = true;
    }
    return sawUnknown ? undefined : false;
  }

  if (!isLeaf(c)) return undefined;

  const v = values[c.signal];
  if (v === undefined) return undefined;

  const target = c.value;
  switch (c.op) {
    case "eq":
      return v === target;
    case "neq":
      return v !== target;
    default:
      break;
  }

  // Ordered comparisons are numeric only. A boolean reading with `gte` is an authoring
  // error that validation cannot catch (the value type is legal in isolation), so it
  // resolves to "could not evaluate" rather than to a coerced 0/1 answer nobody intended.
  if (typeof v !== "number" || typeof target !== "number") return undefined;
  switch (c.op) {
    case "gte": return v >= target;
    case "gt":  return v > target;
    case "lte": return v <= target;
    case "lt":  return v < target;
    default:    return undefined;
  }
}

/**
 * Should this rule fire on THIS tick?
 *
 * Two things beyond "the condition is true":
 *
 * 1. SUSTAINED-FOR. `for_minutes` means the condition must have held continuously for
 *    that long. `metSince` is when the current unbroken episode began.
 * 2. EDGE-TRIGGERED PER EPISODE. Without this a rule fires on every tick for as long as
 *    the condition holds, which is how an alerting system teaches people to ignore it.
 *    A rule fires at most once per episode: only if the current episode began AFTER the
 *    last firing.
 */
export function shouldFire(args: {
  met: boolean | undefined;
  sustainMinutes: number;
  metSince: Date | null;
  lastFiredAt: Date | null;
  now: Date;
}): { fire: boolean; reason: string } {
  const { met, sustainMinutes, metSince, lastFiredAt, now } = args;

  if (met === undefined) return { fire: false, reason: "not_evaluated" };
  if (met === false) return { fire: false, reason: "condition_false" };
  if (!metSince) return { fire: false, reason: "episode_just_opened" };

  if (sustainMinutes > 0) {
    const heldMs = now.getTime() - metSince.getTime();
    if (heldMs < sustainMinutes * 60_000) {
      return { fire: false, reason: "sustain_not_met" };
    }
  }

  // Already fired for THIS episode — the condition never went false in between.
  if (lastFiredAt && lastFiredAt >= metSince) {
    return { fire: false, reason: "already_fired_this_episode" };
  }

  return { fire: true, reason: "fire" };
}
