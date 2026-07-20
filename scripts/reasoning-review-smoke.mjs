// review-test.mjs — headless smoke test for the PURE logic of _shared/reasoning/review.ts.
//
// WHY THIS EXISTS: review.ts imports the Deno model-router chain, so it can't be plain-Node imported.
// The pure, LLM-free logic (parseVerdict + aggregate + reviewToVerdict) is copied VERBATIM below and
// asserted, mirroring scratchpad/reflect-test.mjs. Keep this in sync with review.ts.
//
// Run:  node scratchpad/review-test.mjs
// Exit: 0 = all pure logic holds; non-zero = a mismatch (fix before shipping).

// ─── VERBATIM from review.ts: parseVerdict ───────────────────────────────────────────────────────
function parseVerdict(raw) {
  if (!raw || typeof raw !== "string") return null;
  const fenced = raw.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
  if (!obj || typeof obj !== "object") return null;
  const o = obj;
  const arr = (v) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
  const verdict = typeof o.verdict === "string" ? o.verdict.trim().toUpperCase() : "";
  if (verdict !== "SHIP" && verdict !== "ITERATE" && verdict !== "BLOCK") return null;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  return { verdict, blockers: arr(o.blockers), improvements: arr(o.improvements), rationale };
}

// ─── VERBATIM from review.ts: aggregate ──────────────────────────────────────────────────────────
function aggregate(verdicts) {
  const live = verdicts.filter((v) => !v.degraded);
  let consensus = "SHIP";
  if (live.some((v) => v.verdict === "BLOCK")) consensus = "BLOCK";
  else if (live.some((v) => v.verdict === "ITERATE")) consensus = "ITERATE";

  const dedup = (pick) => {
    const seen = new Set();
    const out = [];
    for (const v of live) for (const raw of pick(v)) {
      const k = raw.trim();
      if (k && !seen.has(k)) { seen.add(k); out.push(k); }
    }
    return out;
  };
  const blockers = dedup((v) => v.blockers);
  const improvements = dedup((v) => v.improvements);

  let refinedInstruction = "";
  if (!(consensus === "SHIP" && blockers.length === 0)) {
    const parts = [];
    if (blockers.length) parts.push(`Resolve these blockers before shipping: ${blockers.join("; ")}.`);
    if (improvements.length) parts.push(`Then strengthen the draft: ${improvements.join("; ")}.`);
    refinedInstruction = parts.join(" ");
  }
  return { consensus, blockers, refinedInstruction };
}

// ─── VERBATIM from review.ts: reviewToVerdict ────────────────────────────────────────────────────
function reviewToVerdict(r) {
  if (r.degraded) return { verdict: "SHIP", lowConfidence: true, findings: r.verdicts };
  return { verdict: r.consensus, refinedInstruction: r.refinedInstruction, findings: r.verdicts };
}

// ─── test harness (mirrors scripts/studio-hero-smoke.mjs ok/fail style) ──────────────────────────
let passed = 0;
let failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log("✓ " + label); }
  else { failed++; console.error("✗ " + label); }
}
const lens = (id, verdict, blockers = [], improvements = [], degraded = false) =>
  ({ lens: id, verdict, blockers, improvements, rationale: "", degraded });

// ── parseVerdict ──
ok(parseVerdict('```json\n{"verdict":"SHIP","blockers":[],"improvements":[],"rationale":"good"}\n```')?.verdict === "SHIP",
  "parseVerdict: fenced JSON parses");
ok(parseVerdict('Here is my call: {"verdict":"ITERATE","blockers":["x"],"improvements":[],"rationale":"y"} done')?.verdict === "ITERATE",
  "parseVerdict: prose-wrapped JSON parses");
ok(parseVerdict('{"verdict":"BLOCK","blockers":["a","b"],"improvements":["c"],"rationale":"z"}')?.verdict === "BLOCK",
  "parseVerdict: bare JSON parses");
ok(JSON.stringify(parseVerdict('{"verdict":"BLOCK","blockers":["a","b"],"improvements":["c"]}')?.blockers) === '["a","b"]',
  "parseVerdict: blockers array preserved");
ok(parseVerdict("") === null, "parseVerdict: empty → null");
ok(parseVerdict("total garbage no braces") === null, "parseVerdict: garbage → null");
ok(parseVerdict('{"verdict":"MAYBE","blockers":[]}') === null, "parseVerdict: invalid verdict value → null");
ok(parseVerdict('{"blockers":[]}') === null, "parseVerdict: missing verdict → null");
ok(parseVerdict('{"verdict":"ship","blockers":[],"improvements":[],"rationale":"r"}')?.verdict === "SHIP",
  "parseVerdict: lowercase verdict normalized to SHIP");

// ── aggregate consensus precedence ──
ok(aggregate([lens("a", "SHIP"), lens("b", "BLOCK"), lens("c", "ITERATE")]).consensus === "BLOCK",
  "aggregate: any BLOCK → BLOCK");
ok(aggregate([lens("a", "SHIP"), lens("b", "ITERATE"), lens("c", "SHIP")]).consensus === "ITERATE",
  "aggregate: no BLOCK but any ITERATE → ITERATE");
ok(aggregate([lens("a", "SHIP"), lens("b", "SHIP"), lens("c", "SHIP")]).consensus === "SHIP",
  "aggregate: all SHIP → SHIP");
ok(aggregate([lens("a", "BLOCK", [], [], true), lens("b", "ITERATE", [], [], true)]).consensus === "SHIP",
  "aggregate: all-degraded → SHIP (degraded verdicts don't count)");
ok(aggregate([]).consensus === "SHIP", "aggregate: empty → SHIP");

// ── aggregate blockers dedup union ──
{
  const r = aggregate([
    lens("a", "BLOCK", ["dup", "only-a"]),
    lens("b", "ITERATE", ["dup", "only-b"]),
  ]);
  ok(JSON.stringify(r.blockers) === '["dup","only-a","only-b"]', "aggregate: blockers dedup union across lenses");
}
{
  // a degraded lens's blockers are excluded from the union
  const r = aggregate([lens("a", "BLOCK", ["real"]), lens("b", "BLOCK", ["ghost"], [], true)]);
  ok(JSON.stringify(r.blockers) === '["real"]', "aggregate: degraded lens blockers excluded from union");
}

// ── aggregate refinedInstruction ──
ok(aggregate([lens("a", "SHIP")]).refinedInstruction === "", "aggregate: clean SHIP → empty refinedInstruction");
{
  const r = aggregate([lens("a", "ITERATE", ["fix headline"], ["tighten CTA"])]);
  ok(r.refinedInstruction.includes("fix headline") && r.refinedInstruction.includes("tighten CTA"),
    "aggregate: ITERATE synthesizes blockers + improvements into instruction");
}

// ── reviewToVerdict ──
{
  const degradedReview = { verdicts: [], consensus: "SHIP", blockers: [], refinedInstruction: "", lensesRun: 0, degraded: true };
  const v = reviewToVerdict(degradedReview);
  ok(v.verdict === "SHIP" && v.lowConfidence === true, "reviewToVerdict: fully-degraded review → {SHIP, lowConfidence:true}");
}
{
  const blockReview = { verdicts: [lens("a", "BLOCK", ["bad"])], consensus: "BLOCK", blockers: ["bad"], refinedInstruction: "Resolve these blockers before shipping: bad.", lensesRun: 1, degraded: false };
  const v = reviewToVerdict(blockReview);
  ok(v.verdict === "BLOCK" && !v.lowConfidence && v.refinedInstruction.includes("bad"),
    "reviewToVerdict: live BLOCK review → {BLOCK, refinedInstruction}");
}

// ─── report ───
if (failed === 0) console.log(`\nALL PASS: ${passed} passed, 0 failed`);
else console.error(`\nFAIL: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
