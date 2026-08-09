// Cheap, deterministic token estimator (§18 one home; §32 crash-prone-logic → headless-smoke-tested).
//
// Compaction needs to know when a thread's verbatim tail "approaches token limits" so it can fold
// older turns BEFORE the model context overflows — not only on a fixed turn-count cadence. A real
// tokenizer (tiktoken/anthropic) is a heavy dep on the Deno edge hot path for a decision that only
// needs to be roughly right, so we reuse the repo's established heuristic: ~4 characters per token
// (already used in kb-ingest-core.ts `Math.ceil(content.length / 4)`). Centralized here so the
// compaction trigger and its smoke test import ONE implementation (§18), never a second copy.
//
// This is an ESTIMATE (§13 honesty): it is intentionally conservative-high (whitespace and short
// tokens make real token counts ≤ chars/4 for English prose), so compaction fires a little EARLY
// rather than a little late — the safe direction for avoiding a context overflow.

/** Rough token count for a single string. Returns 0 for empty/nullish input; never throws. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  // Normalize to a string defensively — a non-string slipping through must not crash the hot path.
  const s = typeof text === "string" ? text : String(text);
  if (s.length === 0) return 0;
  return Math.ceil(s.length / 4);
}

/** Rough token count across an ordered list of chat turns (role + content). */
export function estimateTurnsTokens(
  turns: ReadonlyArray<{ role?: string | null; content?: string | null }> | null | undefined,
): number {
  if (!turns || turns.length === 0) return 0;
  let total = 0;
  for (const t of turns) {
    // A few tokens of per-message envelope (role marker, delimiters) mirror real chat framing.
    total += estimateTokens(t?.content) + 4;
  }
  return total;
}

/**
 * The compaction decision, isolated as a pure function so it is unit/smoke-testable without a DB
 * or a model. Returns true when the thread should fold older turns into its rolling summary.
 *
 * Two independent triggers, whichever fires first (§ "approaches token limits" AND a bounded cadence):
 *   • TOKEN trigger  — the verbatim tail (turns not yet summarized) is estimated to exceed
 *     `tailTokenBudget`, i.e. the live context is getting heavy regardless of turn count. This is the
 *     "approaching token limits" trigger the slice brief names.
 *   • CADENCE trigger — the existing count heuristic (past a KEEP floor, every EVERY messages), kept
 *     as a backstop so even short-but-long-running threads compact on a predictable rhythm.
 */
export function shouldCompact(params: {
  messageCount: number;
  tailTokens: number;
  keep: number;
  every: number;
  tailTokenBudget: number;
}): boolean {
  const { messageCount, tailTokens, keep, every, tailTokenBudget } = params;
  if (messageCount <= keep) return false; // never compact a short thread — nothing has scrolled off yet
  const tokenTrigger = tailTokens >= tailTokenBudget;
  const cadenceTrigger = every > 0 && messageCount % every === 0;
  return tokenTrigger || cadenceTrigger;
}

/**
 * How many of the most-recent tail turns to keep VERBATIM when a fold is triggered — isolated as a
 * pure function so it is unit/smoke-testable without a DB or a model (§32).
 *
 * The bug this fixes (§14 cost): the TOKEN trigger fires on a token budget, but a fixed keep-count
 * fold reduces the tail by turns, not tokens — so on a heavy thread the kept tail can stay OVER the
 * budget and re-trip the trigger on nearly every subsequent turn, calling the paid summarizer each
 * time. So on a token-triggered fold we keep only as many NEWEST turns as fit under
 * `tailTokenBudget * hysteresis` (default 0.5 — the freshly-folded tail sits well under budget and
 * won't immediately re-trip), never fewer than `floor` turns (conversational continuity: a single
 * huge recent turn can't force the whole tail into the summary) and never more than `keep`.
 *
 * The CADENCE trigger (`triggeredByToken === false`) keeps the established `keep` most-recent turns
 * unchanged — that path already folds a sane batch on a predictable rhythm.
 *
 * `turnTokens` are per-turn estimates ordered oldest→newest (the same order as the tail rows). The
 * count returned is how many newest turns to keep; the caller folds the contiguous older prefix and
 * advances the watermark to the last folded seq — so every turn is EITHER summarized XOR verbatim,
 * never dropped, never double-counted.
 */
export function keepCountForFold(params: {
  turnTokens: ReadonlyArray<number>;
  keep: number;
  floor: number;
  tailTokenBudget: number;
  triggeredByToken: boolean;
  hysteresis?: number;
}): number {
  const { turnTokens, keep, floor, tailTokenBudget, triggeredByToken } = params;
  const n = turnTokens.length;
  if (n <= 0) return 0;
  const boundedKeep = Math.min(Math.max(0, keep), n);
  // Cadence path — unchanged: keep the established `keep` most-recent turns.
  if (!triggeredByToken) return boundedKeep;
  const hysteresis = params.hysteresis ?? 0.5;
  const target = Math.max(0, tailTokenBudget * hysteresis);
  const minKeep = Math.min(Math.max(0, floor), n);
  // Accumulate newest→oldest; keep turns while they fit under target, but never fewer than `floor`
  // (even if those floor turns exceed target) and never more than `keep`. The `+ 4` envelope per
  // kept turn mirrors estimateTurnsTokens, so the comparison is apples-to-apples with the trigger.
  let acc = 0;
  let kept = 0;
  for (let i = n - 1; i >= 0; i--) {
    const withEnvelope = acc + Math.max(0, turnTokens[i] ?? 0) + 4;
    if (kept >= minKeep && withEnvelope > target) break;
    acc = withEnvelope;
    kept++;
    if (kept >= boundedKeep) break;
  }
  if (kept < minKeep) kept = minKeep;
  return Math.min(kept, boundedKeep);
}
