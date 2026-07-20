// scripts/eval-smoke.mjs — headless smoke test for the PURE logic of §34 Layer 2 (Quality/Evals):
// supabase/functions/_shared/eval/scorers.ts (deterministic scorers) + gate.ts (aggregate math).
//
// WHY THIS EXISTS: scorers.ts / gate.ts import the Deno model-router chain, so they can't be
// plain-Node imported. The pure, LLM-free logic (the deterministic scorers + aggregateScores) is
// copied VERBATIM below and asserted. Keep this in sync with scorers.ts + gate.ts.
//
// Run:  node scripts/eval-smoke.mjs
// Exit: 0 = all pure logic holds; non-zero = a mismatch (fix before shipping).

// ─── VERBATIM from scorers.ts: helpers + DETERMINISTIC_SCORERS ─────────────────────────────────────
function outputString(v) {
  if (typeof v === "string") return v;
  try { return JSON.stringify(v ?? ""); } catch { return String(v ?? ""); }
}
function asObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function readMetric(output, keys) {
  const o = asObject(output);
  if (!o) return null;
  const meta = asObject(o.metadata) ?? {};
  for (const k of keys) {
    const v = o[k] ?? meta[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}
const DEFAULT_LATENCY_MS = 30_000;
const DEFAULT_COST_USD = 0.5;

function det(scorer, score, rationale) {
  if (score === null) {
    return { scorer, scorerKind: "deterministic", score: null, passed: null, status: "needs_config", rationale };
  }
  return { scorer, scorerKind: "deterministic", score, passed: score === 1, status: "scored", rationale };
}

const DETERMINISTIC_SCORERS = {
  exact_match(input) {
    if (input.expected === undefined) return det("exact_match", null, "no expected value supplied");
    const a = typeof input.output === "string" ? input.output : outputString(input.output);
    const b = typeof input.expected === "string" ? input.expected : outputString(input.expected);
    return det("exact_match", a === b ? 1 : 0);
  },
  contains(input) {
    if (typeof input.expected !== "string" || input.expected.length === 0) {
      return det("contains", null, "no expected substring supplied");
    }
    return det("contains", outputString(input.output).includes(input.expected) ? 1 : 0);
  },
  json_valid(input) {
    if (asObject(input.output) || Array.isArray(input.output)) return det("json_valid", 1);
    if (typeof input.output === "string") {
      try { JSON.parse(input.output); return det("json_valid", 1); } catch { return det("json_valid", 0); }
    }
    return det("json_valid", 0);
  },
  regex_match(input) {
    const pattern = typeof input.rubric === "string" ? input.rubric.trim() : "";
    if (!pattern) return det("regex_match", null, "no regex pattern supplied (rubric)");
    let re;
    try { re = new RegExp(pattern); } catch { return det("regex_match", null, "invalid regex pattern"); }
    return det("regex_match", re.test(outputString(input.output)) ? 1 : 0);
  },
  latency_threshold(input) {
    const ms = readMetric(input.output, ["latencyMs", "latency_ms", "latency"]);
    if (ms === null) return det("latency_threshold", null, "no latency metric on output/metadata");
    const threshold = typeof input.expected === "number" ? input.expected : DEFAULT_LATENCY_MS;
    return det("latency_threshold", ms <= threshold ? 1 : 0, `latency ${ms}ms vs ${threshold}ms`);
  },
  cost_threshold(input) {
    const usd = readMetric(input.output, ["costUsd", "cost_estimate_usd", "cost"]);
    if (usd === null) return det("cost_threshold", null, "no cost metric on output/metadata");
    const threshold = typeof input.expected === "number" ? input.expected : DEFAULT_COST_USD;
    return det("cost_threshold", usd <= threshold ? 1 : 0, `cost $${usd} vs $${threshold}`);
  },
  non_degraded(input) {
    const o = asObject(input.output);
    if (!o || typeof o.degraded !== "boolean") return det("non_degraded", null, "no boolean `degraded` on output");
    return det("non_degraded", o.degraded === false ? 1 : 0);
  },
  anchors_used(input) {
    const o = asObject(input.output);
    const n = o?.anchorsUsed;
    if (typeof n !== "number" || !Number.isFinite(n)) return det("anchors_used", null, "no numeric `anchorsUsed` on output");
    return det("anchors_used", n > 0 ? 1 : 0);
  },
  structural_valid(input) {
    const o = asObject(input.output);
    const okShape = !!o
      && Array.isArray(o.decomposition)
      && typeof o.approach === "string"
      && Array.isArray(o.risks)
      && Array.isArray(o.successCriteria);
    return det("structural_valid", okShape ? 1 : 0);
  },
};

// ─── VERBATIM from gate.ts: round4 + aggregateScores ───────────────────────────────────────────────
function round4(n) { return Math.round(n * 10000) / 10000; }
function aggregateScores(results) {
  const real = results.filter((r) => r.score !== null && r.score !== undefined);
  const scoredCount = real.length;
  const degradedCount = results.length - scoredCount;
  const aggregateScore = scoredCount === 0
    ? null
    : round4(real.reduce((s, r) => s + r.score, 0) / scoredCount);
  const passedCount = real.filter((r) => r.passed === true).length;
  const passRate = scoredCount === 0 ? null : round4(passedCount / scoredCount);
  const costUsd = round4(results.reduce((s, r) => s + (typeof r.costUsd === "number" ? r.costUsd : 0), 0));
  return { scoredCount, degradedCount, aggregateScore, passRate, degraded: scoredCount === 0, costUsd };
}

// ─── test harness (mirrors scripts/reasoning-review-smoke.mjs ok/fail style) ──────────────────────
let passed = 0;
let failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log("✓ " + label); }
  else { failed++; console.error("✗ " + label); }
}

// A real-shaped StrategyPlan (from strategize.ts) — the kind of output these scorers grade.
const strat = { decomposition: ["a", "b"], approach: "do it", risks: ["r"], successCriteria: ["s"], anchorsUsed: 2, degraded: false };
const degradedStrat = { ...strat, degraded: true, anchorsUsed: 0 };

// ── deterministic scorers on real-shaped strategy objects ──
ok(DETERMINISTIC_SCORERS.non_degraded({ output: strat }).score === 1, "non_degraded: degraded=false → score 1");
ok(DETERMINISTIC_SCORERS.non_degraded({ output: degradedStrat }).score === 0, "non_degraded: degraded=true → score 0");
ok(DETERMINISTIC_SCORERS.anchors_used({ output: strat }).score === 1, "anchors_used: anchorsUsed>0 → score 1");
ok(DETERMINISTIC_SCORERS.anchors_used({ output: degradedStrat }).score === 0, "anchors_used: anchorsUsed=0 → score 0");
ok(DETERMINISTIC_SCORERS.structural_valid({ output: strat }).score === 1, "structural_valid: valid StrategyPlan shape → score 1");
ok(DETERMINISTIC_SCORERS.structural_valid({ output: { approach: "x" } }).score === 0, "structural_valid: malformed shape → score 0 (a real 0, not needs_config)");
{
  const r = DETERMINISTIC_SCORERS.non_degraded({ output: strat });
  ok(r.passed === true && r.status === "scored", "non_degraded: score 1 → passed:true, status:scored");
}

// ── a scorer that genuinely CANNOT evaluate → score:null, status:needs_config (NEVER a pass) ──
{
  const r = DETERMINISTIC_SCORERS.non_degraded({ output: {} });
  ok(r.score === null && r.passed === null && r.status === "needs_config",
    "non_degraded: no boolean degraded → {score:null, passed:null, needs_config} (not a pass)");
}
{
  const r = DETERMINISTIC_SCORERS.regex_match({ output: "abc", rubric: "" });
  ok(r.score === null && r.status === "needs_config", "regex_match: no pattern → needs_config (not a pass)");
}
{
  const r = DETERMINISTIC_SCORERS.exact_match({ output: "abc" });
  ok(r.score === null && r.status === "needs_config", "exact_match: no expected → needs_config (not a pass)");
}
{
  const r = DETERMINISTIC_SCORERS.anchors_used({ output: {} });
  ok(r.score === null && r.status === "needs_config", "anchors_used: no numeric anchorsUsed → needs_config (not a pass)");
}
{
  const r = DETERMINISTIC_SCORERS.latency_threshold({ output: {} });
  ok(r.score === null && r.status === "needs_config", "latency_threshold: no metric → needs_config (not a pass)");
}

// ── a few real deterministic hits ──
ok(DETERMINISTIC_SCORERS.exact_match({ output: "yes", expected: "yes" }).score === 1, "exact_match: equal → 1");
ok(DETERMINISTIC_SCORERS.exact_match({ output: "yes", expected: "no" }).score === 0, "exact_match: unequal → 0");
ok(DETERMINISTIC_SCORERS.contains({ output: "the quick fox", expected: "quick" }).score === 1, "contains: substring present → 1");
ok(DETERMINISTIC_SCORERS.regex_match({ output: "id-4821", rubric: "^id-\\d+$" }).score === 1, "regex_match: pattern matches → 1");
ok(DETERMINISTIC_SCORERS.latency_threshold({ output: { latencyMs: 1200 } }).score === 1, "latency_threshold: under default → 1");
ok(DETERMINISTIC_SCORERS.cost_threshold({ output: { costUsd: 0.02 } }).score === 1, "cost_threshold: under default → 1");
ok(DETERMINISTIC_SCORERS.json_valid({ output: '{"a":1}' }).score === 1, "json_valid: parseable string → 1");
ok(DETERMINISTIC_SCORERS.json_valid({ output: "not json" }).score === 0, "json_valid: unparseable string → 0");

// ── aggregate math: mean over NON-null only; NULL when nothing scored (never 0) ──
{
  const agg = aggregateScores([{ score: 1, passed: true }, { score: null, passed: null }, { score: 0, passed: false }]);
  ok(agg.aggregateScore === 0.5, "aggregate: [1, null, 0] → 0.5 (null EXCLUDED, not counted as 0)");
  ok(agg.scoredCount === 2 && agg.degradedCount === 1, "aggregate: [1, null, 0] → scoredCount 2, degradedCount 1");
  ok(agg.degraded === false, "aggregate: [1, null, 0] → degraded false (something scored)");
}
{
  const agg = aggregateScores([{ score: null, passed: null }, { score: null, passed: null }]);
  ok(agg.aggregateScore === null, "aggregate: [null, null] → NULL (never 0-coerced, §31)");
  ok(agg.scoredCount === 0 && agg.degraded === true, "aggregate: [null, null] → scoredCount 0, degraded true");
  ok(agg.passRate === null, "aggregate: [null, null] → passRate NULL (nothing scored)");
}
{
  const agg = aggregateScores([{ score: 1, passed: true }, { score: 0, passed: false }]);
  ok(agg.passRate === 0.5, "aggregate: [pass, fail] → passRate 0.5");
  ok(agg.aggregateScore === 0.5, "aggregate: [1, 0] → 0.5");
}
{
  const agg = aggregateScores([]);
  ok(agg.aggregateScore === null && agg.passRate === null && agg.degraded === true,
    "aggregate: [] → {null aggregate, null passRate, degraded true}");
}
{
  // costUsd sums only numeric costs; deterministic (no costUsd) contribute 0.
  const agg = aggregateScores([{ score: 1, passed: true, costUsd: 0.0012 }, { score: 1, passed: true }]);
  ok(agg.costUsd === 0.0012, "aggregate: costUsd sums judge costs, ignores deterministic");
}

// ─── report ───
if (failed === 0) console.log(`\nALL PASS: ${passed} passed, 0 failed`);
else console.error(`\nFAIL: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
