// =============================================================================
// Alerting — rule WRITE input validation (A5)
// =============================================================================
// The authority on whether a rule may be stored. PURE by construction — no DB, no fetch,
// no clock — for the same reason `alert-conditions.ts` is pure: a wrong decision here does
// not throw, it silently stores a rule that can never fire, and the only thing watching the
// platform is the thing that just got misconfigured.
//
// §18 — this does NOT re-implement the condition language. It calls `validateCondition` from
// `alert-conditions.ts`, the SAME module the evaluator runs, so a rule can never be accepted
// in a shape the evaluator will later reject. That module is Deno and cannot be imported by
// the browser, which is precisely why validation lives server-side rather than in the form.
//
// The caller supplies the signal catalogue (it is a DB read, and this module does no I/O).
// =============================================================================

import { validateCondition } from "./alert-conditions.ts";

/** Mirrors the `paige_alert_rule` CHECK constraints, verified against live prod 2026-08-22.
 *  If a CHECK ever changes, this list is the twin that must move with it. */
export const SEVERITIES = ["info", "warning", "urgent"] as const;
export const AUTONOMY_LANES = ["auto", "confirm", "off"] as const;

/**
 * §16's ten departments plus the two §8 team names, matching the vocabulary already live in
 * `paige_action_kinds.default_from_department` / `default_to_department` (read from prod
 * 2026-08-22, not invented here). `department` has NO DB CHECK constraint, so this list is
 * the only thing stopping a typo from creating a rule that routes to a department that does
 * not exist — which matters the moment A6 puts firings on the action bus.
 */
export const DEPARTMENTS = [
  "client_experience",
  "executive_office",
  "finance",
  "legal_compliance",
  "marketing",
  "operations_pmo",
  "owner_ops",
  "people_talent",
  "product_curriculum",
  "sales",
  "technology_automation",
] as const;

/**
 * A3 delivers IN-APP ONLY. Accepting "email" here would store a rule whose operator
 * reasonably believes mail is going out when nothing sends it — the same "looks live, does
 * nothing" defect as a button that discards your work (§13/§36). External delivery is also
 * blocked on an owner decision (there is no operator address book, §45/§63), so it is not a
 * matter of wiring it up quietly later.
 *
 * NOTE (§13, verified): neither `alerting-evaluate` nor `alerting-deliver` reads `channels`
 * at all today — grep returns nothing. The column is purely declarative. This allowlist keeps
 * that declaration honest rather than letting it drift into a promise.
 */
export const CHANNELS = ["in_app"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type AutonomyLane = (typeof AUTONOMY_LANES)[number];

/** One row of the signal catalogue, as the caller read it from `paige_alert_signal`. */
export interface SignalCatalogueEntry {
  key: string;
  is_readable: boolean;
}

export interface RuleInput {
  name?: unknown;
  description?: unknown;
  condition?: unknown;
  department?: unknown;
  autonomy_lane?: unknown;
  channels?: unknown;
  severity?: unknown;
  is_active?: unknown;
}

/**
 * The shape that may be handed to the DB — every field already checked.
 *
 * CONTRACT TRAP, stated because the type alone does not say it: on a PARTIAL validation
 * (`{ partial: true }`) the caller may omit `name` and `condition`, and this object then carries
 * an empty `name` and an `undefined` `condition` — placeholders for "not supplied", NOT values to
 * write. A partial caller MUST copy only the fields the caller actually sent (which is what
 * `alerting-rule-write`'s update path does, keying off `field in supplied`). Spreading this whole
 * object into an UPDATE would blank the rule's name and violate the NOT NULL on `condition`.
 * On a full validation every field is real and spreading it is correct.
 */
export interface NormalizedRule {
  name: string;
  description: string | null;
  condition: unknown;
  department: string | null;
  autonomy_lane: AutonomyLane;
  channels: string[];
  severity: Severity;
  is_active: boolean;
}

export interface RuleValidation {
  ok: boolean;
  /** Human-readable and returned to the caller — a rejection nobody can act on is a dead end. */
  errors: string[];
  /** Present only when ok. */
  rule?: NormalizedRule;
}

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate and normalize a rule write.
 *
 * `catalogue` is every row of `paige_alert_signal`. A condition referencing a signal that is
 * absent, or present but `is_readable = false`, is REJECTED rather than stored:
 *
 *   the evaluator SKIPS a rule whose signal cannot be read, and deliberately does not advance
 *   `last_evaluated_at`, so such a rule sits in the list reporting "never evaluated" forever
 *   while the operator believes something is watching. Letting one be authored is the same
 *   class of defect as a control that looks live and does nothing (§13/§36). If the signal
 *   later gains a reader, the rule can be written then — which is honest, where a permanently
 *   inert rule is not.
 */
export function validateRuleInput(
  input: unknown,
  catalogue: SignalCatalogueEntry[],
  { partial = false }: { partial?: boolean } = {},
): RuleValidation {
  const errors: string[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["The rule payload must be an object."] };
  }
  const raw = input as RuleInput;

  // ── name ────────────────────────────────────────────────────────────────
  let name = "";
  if (raw.name === undefined && partial) {
    // left unchanged on a partial update
  } else if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
    errors.push("`name` is required and must be a non-empty string.");
  } else if (raw.name.trim().length > NAME_MAX) {
    errors.push(`\`name\` must be ${NAME_MAX} characters or fewer.`);
  } else {
    name = raw.name.trim();
  }

  // ── description ─────────────────────────────────────────────────────────
  let description: string | null = null;
  if (raw.description !== undefined && raw.description !== null) {
    if (typeof raw.description !== "string") {
      errors.push("`description`, when given, must be a string.");
    } else if (raw.description.length > DESCRIPTION_MAX) {
      errors.push(`\`description\` must be ${DESCRIPTION_MAX} characters or fewer.`);
    } else {
      description = raw.description.trim() || null;
    }
  }

  // ── condition ───────────────────────────────────────────────────────────
  let condition: unknown = undefined;
  if (raw.condition === undefined && partial) {
    // left unchanged
  } else {
    const verdict = validateCondition(raw.condition);
    if (!verdict.ok) {
      errors.push(...verdict.errors);
    } else {
      const known = new Map(catalogue.map((s) => [s.key, s.is_readable]));
      for (const key of verdict.signals) {
        if (!known.has(key)) {
          errors.push(`Unknown signal \`${key}\` — it is not in the signal catalogue.`);
        } else if (known.get(key) === false) {
          errors.push(
            `Signal \`${key}\` has no reader, so a rule bound to it could only ever report ` +
              `"never evaluated" — it would never fire and never pass. Pick a readable signal.`,
          );
        }
      }
      if (errors.length === 0) condition = raw.condition;
    }
  }

  // ── severity ────────────────────────────────────────────────────────────
  let severity: Severity = "warning"; // matches the column default
  if (raw.severity !== undefined) {
    if (typeof raw.severity !== "string" || !SEVERITIES.includes(raw.severity as Severity)) {
      errors.push(`\`severity\` must be one of: ${SEVERITIES.join(", ")}.`);
    } else {
      severity = raw.severity as Severity;
    }
  }

  // ── autonomy_lane ───────────────────────────────────────────────────────
  let autonomyLane: AutonomyLane = "confirm"; // matches the column default
  if (raw.autonomy_lane !== undefined) {
    if (
      typeof raw.autonomy_lane !== "string" ||
      !AUTONOMY_LANES.includes(raw.autonomy_lane as AutonomyLane)
    ) {
      errors.push(`\`autonomy_lane\` must be one of: ${AUTONOMY_LANES.join(", ")}.`);
    } else {
      autonomyLane = raw.autonomy_lane as AutonomyLane;
    }
  }

  // ── department ──────────────────────────────────────────────────────────
  let department: string | null = null;
  if (raw.department !== undefined && raw.department !== null) {
    if (
      typeof raw.department !== "string" ||
      !(DEPARTMENTS as readonly string[]).includes(raw.department)
    ) {
      errors.push(`\`department\`, when given, must be one of: ${DEPARTMENTS.join(", ")}.`);
    } else {
      department = raw.department;
    }
  }

  // ── channels ────────────────────────────────────────────────────────────
  let channels: string[] = ["in_app"];
  if (raw.channels !== undefined) {
    if (!Array.isArray(raw.channels)) {
      errors.push("`channels`, when given, must be an array.");
    } else {
      const bad = raw.channels.filter(
        (c) => typeof c !== "string" || !(CHANNELS as readonly string[]).includes(c),
      );
      if (bad.length > 0) {
        errors.push(
          `Only ${CHANNELS.join(", ")} delivery exists today. External delivery is not built — ` +
            `there is no operator address book, so who receives an alert off-platform is an ` +
            `owner decision, not a default. Rejected: ${JSON.stringify(bad)}.`,
        );
      } else {
        channels = raw.channels.length > 0 ? (raw.channels as string[]) : ["in_app"];
      }
    }
  }

  // ── is_active ───────────────────────────────────────────────────────────
  // The column defaults to FALSE and that is deliberate: a rule nobody has looked at yet
  // should not start firing on its own. A caller must opt in explicitly.
  let isActive = false;
  if (raw.is_active !== undefined) {
    if (typeof raw.is_active !== "boolean") {
      errors.push("`is_active`, when given, must be a boolean.");
    } else {
      isActive = raw.is_active;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    rule: {
      name,
      description,
      condition,
      department,
      autonomy_lane: autonomyLane,
      channels,
      severity,
      is_active: isActive,
    },
  };
}
