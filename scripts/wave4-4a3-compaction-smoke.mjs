#!/usr/bin/env node
// Wave 4 · 4a.3 — headless smoke test for the compaction trigger logic (§32).
//
// A green tsc proves the token-estimate + shouldCompact helpers TYPE-CHECK; it proves nothing about
// whether they RUN correctly against real-ish transcripts. This exercises the pure logic in Node —
// no DB, no model — asserting: it never throws on messy input, the token trigger fires on a heavy
// tail below the count cadence, the cadence trigger fires on a light-but-long-running thread, short
// threads never compact, and the estimator degrades safely on null/non-string content.
//
// Run: node scripts/wave4-4a3-compaction-smoke.mjs   (exit 0 = pass, 1 = fail)
//
// It tests the SAME source the edge function imports — no hand-mirrored copy (§18) — by reading the
// real `_shared/token-estimate.ts`, stripping its (deliberately simple) type annotations, and running
// the resulting JS via a data-URL import. No Deno/tsx in this env, so this dependency-free strip is
// the honest option; if the helper ever grows syntax the strip can't handle, the import THROWS (loud
// fail), never silently tests a stale copy (§32).

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsPath = resolve(__dirname, "../supabase/functions/_shared/token-estimate.ts");

// Strip TypeScript type syntax to run the SAME logic in Node without a transpiler dep. The helper
// uses only simple annotations (`: string | null | undefined`, `: number`, param object types),
// which this narrow transform removes. If the helper ever grows syntax this can't strip, the test
// fails loudly (import throws) rather than silently testing a stale copy.
let src = readFileSync(tsPath, "utf8");
src = src
  // drop `: <type>` return + param annotations up to a delimiter, and interface-ish inline object types
  .replace(/:\s*ReadonlyArray<\{[^}]*\}>\s*\|\s*null\s*\|\s*undefined/g, "")
  .replace(/:\s*\{[^}]*\}/g, "")
  .replace(/:\s*string\s*\|\s*null\s*\|\s*undefined/g, "")
  .replace(/:\s*number\s*\|\s*null\s*\|\s*undefined/g, "")
  .replace(/:\s*string\b/g, "")
  .replace(/:\s*number\b/g, "")
  .replace(/:\s*boolean\b/g, "");

const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
const { estimateTokens, estimateTurnsTokens, shouldCompact, keepCountForFold, compactionPressurePct } = mod;

let failures = 0;
const check = (name, cond) => {
  if (!cond) { failures++; console.error(`  FAIL: ${name}`); }
  else { console.log(`  ok:   ${name}`); }
};

console.log("wave4-4a3 compaction smoke:");

// 1. Estimator never throws on messy input, degrades to 0.
check("estimateTokens('') === 0", estimateTokens("") === 0);
check("estimateTokens(null) === 0", estimateTokens(null) === 0);
check("estimateTokens(undefined) === 0", estimateTokens(undefined) === 0);
check("estimateTokens('abcd') === 1 (4 chars/4)", estimateTokens("abcd") === 1);
check("estimateTokens is monotonic", estimateTokens("x".repeat(400)) === 100);

// 2. estimateTurnsTokens tolerates null content / missing fields and adds envelope.
check("estimateTurnsTokens(null) === 0", estimateTurnsTokens(null) === 0);
check("estimateTurnsTokens([]) === 0", estimateTurnsTokens([]) === 0);
check(
  "estimateTurnsTokens skips null content but still counts envelope",
  estimateTurnsTokens([{ role: "user", content: null }, { role: "assistant" }]) === 8, // 0+4 + 0+4
);
const heavyTail = Array.from({ length: 6 }, () => ({ role: "user", content: "y".repeat(4000) }));
check("estimateTurnsTokens sums heavy tail (~6024)", estimateTurnsTokens(heavyTail) === 6 * (1000 + 4));

// 2b. compactionPressurePct (#12 ~80% pre-signal) — honest clamp, degrades on bad budget.
check("pressurePct(0,6000) === 0", compactionPressurePct(0, 6000) === 0);
check("pressurePct(3000,6000) === 50", compactionPressurePct(3000, 6000) === 50);
check("pressurePct(4800,6000) === 80 (the ~80% pre-signal boundary)", compactionPressurePct(4800, 6000) === 80);
check("pressurePct clamps to 100 when over budget", compactionPressurePct(9000, 6000) === 100);
check("pressurePct(x,0) === 0 (never divide by zero)", compactionPressurePct(1000, 0) === 0);
check("pressurePct(negative) === 0 (never negative)", compactionPressurePct(-50, 6000) === 0);

// 3. shouldCompact — short threads never compact.
check(
  "short thread (count <= keep) never compacts",
  shouldCompact({ messageCount: 12, tailTokens: 999999, keep: 12, every: 8, tailTokenBudget: 6000 }) === false,
);

// 4. TOKEN trigger fires on a heavy tail even when the count cadence does NOT.
check(
  "token trigger fires off-cadence when tail is heavy",
  shouldCompact({ messageCount: 13, tailTokens: 7000, keep: 12, every: 8, tailTokenBudget: 6000 }) === true,
);

// 5. CADENCE trigger fires on a light but long-running thread (backstop).
check(
  "cadence trigger fires on a light thread at the cadence multiple",
  shouldCompact({ messageCount: 16, tailTokens: 10, keep: 12, every: 8, tailTokenBudget: 6000 }) === true,
);

// 6. Neither trigger: past keep, light tail, off cadence → no compaction.
check(
  "no compaction when past keep but light tail and off cadence",
  shouldCompact({ messageCount: 13, tailTokens: 10, keep: 12, every: 8, tailTokenBudget: 6000 }) === false,
);

// 7. Integration: a realistic heavy tail past keep triggers via tokens (mirrors the edge path).
const realisticTail = Array.from({ length: 13 }, (_, i) => ({
  role: i % 2 === 0 ? "user" : "assistant",
  content: "This is a fairly long working message about a client engagement. ".repeat(30),
}));
check(
  "realistic 13-turn heavy tail compacts (token path)",
  shouldCompact({
    messageCount: 25,
    tailTokens: estimateTurnsTokens(realisticTail),
    keep: 12, every: 8, tailTokenBudget: 6000,
  }) === true,
);

// 8. FULL-THREAD SIMULATION (§14 cost + §32 no-loss/no-dup) — mirror maybeRefreshSummary over a
//    200-turn run in BOTH regimes and BOTH fold strategies, in ONE harness, so the before/after is
//    real numbers from the same model (§13), not a claim.
//
//    Invariants asserted every fold AND at the end: `toFold` is a CONTIGUOUS prefix of the tail; the
//    summarized set is exactly {1..watermark} (no gap = no loss); no seq is ever folded twice (no
//    dup); at the end every seq is in the summary XOR the verbatim tail. Fold strategy:
//      • "old" — prior fixed keep-KEEP, no min-interval (reproduces the ~188/200 grind baseline).
//      • "new" — keepCountForFold (fold-to-target on the token path) + the MIN_COMPACTION_INTERVAL
//                watermark guard.
function simulate({ turns, tokensPerTurn, mode }) {
  const KEEP = 12, EVERY = 8, BUDGET = 6000, FLOOR = 5, MIN_INTERVAL = 4;
  const content = "z".repeat(tokensPerTurn * 4); // estimateTokens(content) === tokensPerTurn
  const perTurnTokens = estimateTokens(content);
  let watermark = 0;              // summary_through_seq
  let lastCompactedAtSeq = null;  // proxy for last_compacted_at: the max seq present at the last fold
  let modelCalls = 0, messageCount = 0, violations = 0;
  const summarized = new Set();
  const seqs = [];
  for (let seq = 1; seq <= turns; seq++) {
    seqs.push(seq);
    messageCount++;
    // maybeRefreshSummary, evaluated once per appended turn (worst case = the grind baseline).
    if (messageCount <= KEEP) continue;
    const tail = seqs.filter((s) => s > watermark);
    if (!tail.length) continue;
    if (mode === "new" && lastCompactedAtSeq !== null) {
      const since = tail.filter((s) => s > lastCompactedAtSeq).length;
      if (since < MIN_INTERVAL) continue; // GLOBAL min-interval guard
    }
    const tailTokens = tail.length * (perTurnTokens + 4);
    const triggeredByToken = tailTokens >= BUDGET;
    if (!shouldCompact({ messageCount, tailTokens, keep: KEEP, every: EVERY, tailTokenBudget: BUDGET })) continue;
    const keepCount = mode === "old"
      ? Math.min(KEEP, tail.length) // prior behavior: always keep KEEP most-recent
      : keepCountForFold({
          turnTokens: tail.map(() => perTurnTokens),
          keep: KEEP, floor: FLOOR, tailTokenBudget: BUDGET, triggeredByToken,
        });
    const foldCount = tail.length - keepCount;
    if (foldCount <= 0) continue;
    const toFold = tail.slice(0, foldCount);
    const cutoffSeq = toFold[toFold.length - 1];
    // no-dup: nothing in toFold was summarized before.
    for (const s of toFold) { if (summarized.has(s)) violations++; summarized.add(s); }
    // no-gap: summarized is exactly {1..cutoffSeq} (contiguous prefix).
    if (summarized.size !== cutoffSeq) violations++;
    modelCalls++;
    watermark = cutoffSeq;
    lastCompactedAtSeq = seq; // created_at "now" ≈ current max seq
  }
  // Final no-loss/XOR: every seq is summarized (s<=watermark) XOR verbatim (s>watermark).
  for (let s = 1; s <= turns; s++) {
    const inSummary = summarized.has(s);
    const inTail = s > watermark;
    if (inSummary === inTail) violations++;          // must be exactly one
    if (inSummary !== (s <= watermark)) violations++; // summary must equal {1..watermark}
  }
  return { modelCalls, violations };
}

const heavyOld = simulate({ turns: 200, tokensPerTurn: 500, mode: "old" });
const heavyNew = simulate({ turns: 200, tokensPerTurn: 500, mode: "new" });
const lightNew = simulate({ turns: 200, tokensPerTurn: 10, mode: "new" });

check("heavy run: no turn lost or duplicated (new)", heavyNew.violations === 0);
check("light run: no turn lost or duplicated (new)", lightNew.violations === 0);
check("baseline reproduced: old heavy grinds the summarizer (>=150/200)", heavyOld.modelCalls >= 150);
check("new heavy model-calls drop materially (< 60)", heavyNew.modelCalls < 60);
check("new heavy at most half the old grind", heavyNew.modelCalls <= heavyOld.modelCalls * 0.5);
check("new heavy near the light-thread rate (<= 2.5x light)", heavyNew.modelCalls <= lightNew.modelCalls * 2.5);

console.log(
  `\nmodel-call counts over 200 turns — heavy(old fixed keep-KEEP)=${heavyOld.modelCalls}` +
  ` · heavy(new fold-to-target)=${heavyNew.modelCalls} · light(new)=${lightNew.modelCalls}`,
);
console.log(failures === 0 ? `\nSMOKE_DONE fails=0` : `\nSMOKE_DONE fails=${failures}`);
process.exit(failures === 0 ? 0 : 1);
