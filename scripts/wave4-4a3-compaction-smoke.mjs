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
  .replace(/export function/g, "export function")
  // drop `: <type>` return + param annotations up to a delimiter, and interface-ish inline object types
  .replace(/:\s*ReadonlyArray<\{[^}]*\}>\s*\|\s*null\s*\|\s*undefined/g, "")
  .replace(/:\s*\{[^}]*\}/g, "")
  .replace(/:\s*string\s*\|\s*null\s*\|\s*undefined/g, "")
  .replace(/:\s*number\s*\|\s*null\s*\|\s*undefined/g, "")
  .replace(/:\s*string\b/g, "")
  .replace(/:\s*number\b/g, "")
  .replace(/:\s*boolean\b/g, "");

const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
const { estimateTokens, estimateTurnsTokens, shouldCompact } = mod;

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

console.log(failures === 0 ? `\nPROOF_DONE fails=0` : `\nPROOF_DONE fails=${failures}`);
process.exit(failures === 0 ? 0 : 1);
