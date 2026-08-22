/**
 * Render a stored alert condition as a sentence an operator can read.
 *
 * §18 — ONE home. The evaluator's own vocabulary lives in
 * `supabase/functions/_shared/alert-conditions.ts`, which is Deno and cannot be imported
 * here; this is the browser-side READER of the same shape, and A5's authoring form reads
 * from it too rather than growing a second describer next to this one.
 *
 * §13 — a condition this describer does not recognise renders as "unreadable condition",
 * NEVER as an empty string or a plausible-looking guess. An operator who cannot tell a
 * malformed rule from a working one will trust a rule that never fires.
 */

const OP_SYMBOL: Record<string, string> = {
  gte: "≥",
  gt: ">",
  lte: "≤",
  lt: "<",
  eq: "=",
  neq: "≠",
};

type Unknown = Record<string, unknown>;

function isObj(v: unknown): v is Unknown {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function describeLeaf(c: Unknown, signalLabels: Record<string, string>): string {
  const signal = String(c.signal);
  const label = signalLabels[signal] ?? signal;
  const op = OP_SYMBOL[String(c.op)];
  if (!op) return `${label} — unreadable operator "${String(c.op)}"`;

  const value = c.value;
  const rendered =
    typeof value === "boolean" ? (value ? "true" : "false") : value === null || value === undefined ? "—" : String(value);

  const sustain =
    typeof c.for_minutes === "number" && c.for_minutes > 0 ? ` for ${c.for_minutes} min` : "";

  return `${label} ${op} ${rendered}${sustain}`;
}

export function describeCondition(
  condition: unknown,
  signalLabels: Record<string, string> = {},
  depth = 0,
): string {
  // Matches the evaluator's own recursion bound — a deeper tree is malformed, not deep.
  if (depth > 4) return "unreadable condition (nested too deeply)";
  if (!isObj(condition)) return "unreadable condition";

  if (Array.isArray(condition.all_of)) {
    const parts = condition.all_of.map((c) => describeCondition(c, signalLabels, depth + 1));
    if (parts.length === 0) return "unreadable condition (empty all_of)";
    return parts.length === 1 ? parts[0]! : parts.join(" AND ");
  }

  if (Array.isArray(condition.any_of)) {
    const parts = condition.any_of.map((c) => describeCondition(c, signalLabels, depth + 1));
    if (parts.length === 0) return "unreadable condition (empty any_of)";
    return parts.length === 1 ? parts[0]! : `(${parts.join(" OR ")})`;
  }

  if (typeof condition.signal === "string") return describeLeaf(condition, signalLabels);

  return "unreadable condition";
}

/** Delivery channels as stored on the rule. A3 delivers IN-APP only; anything else a rule
 *  declares is a stated intent, not a live channel — the surface labels it so (§13). */
export function describeChannels(channels: unknown): string[] {
  if (!Array.isArray(channels)) return [];
  return channels.filter((c): c is string => typeof c === "string");
}
