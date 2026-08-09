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
