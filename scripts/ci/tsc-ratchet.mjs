#!/usr/bin/env node
/**
 * tsc-ratchet — make "a new type error fails the PR" real, without blocking on the
 * pre-existing baseline.
 *
 * The repo carries a known set of pre-existing `tsc --noEmit` errors (enumerated in
 * scripts/ci/tsc-baseline.txt as `<count>\t<signature>`). Fixing them all is its own hygiene
 * task; until then a plain `tsc` gate would be red on every PR and everyone would learn to
 * ignore it — the exact failure a gate is meant to prevent. So this runs tsc, normalizes each
 * error to a line/column-independent SIGNATURE (`<file>: error TSxxxx: <message>`), and compares
 * the MULTISET (signature → count) against the committed baseline:
 *   - current count of a signature > baseline count  → that many NEW instances → FAIL (exit 1)
 *   - current count < baseline count                 → some FIXED → print a note (ratchet down)
 * Counting (not a plain set) matters: two DISTINCT errors that normalize to the same signature
 * (same file, same TS code, same message — e.g. a second `.catch` on a `PromiseLike<void>`)
 * would otherwise hide behind one baseline entry. With counts, the 2nd instance is caught.
 *
 * Line/col are stripped so an unrelated edit that shifts line numbers doesn't read as new.
 * Driving the baseline to zero (tracked hygiene task) turns this into a plain zero-tolerance gate.
 * The baseline file itself is guarded in ci.yml (it may only shrink), so a PR can't whitelist a
 * new error by appending to it.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, "tsc-baseline.txt");

/** Strip the `(line,col)` position so the signature is stable across unrelated line shifts. */
function toSignature(line) {
  return line.replace(/\((\d+),(\d+)\)/, "").trim();
}

/** Count occurrences of each signature into a Map. */
function tally(signatures) {
  const m = new Map();
  for (const s of signatures) m.set(s, (m.get(s) ?? 0) + 1);
  return m;
}

function runTsc() {
  try {
    execSync("npx tsc --noEmit -p tsconfig.app.json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return ""; // exit 0 → no errors at all
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`; // tsc reports errors on stdout and exits non-zero
  }
}

// Baseline lines are `<count>\t<signature>`.
const baseline = new Map();
if (existsSync(BASELINE_PATH)) {
  for (const raw of readFileSync(BASELINE_PATH, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    const tab = raw.indexOf("\t");
    if (tab === -1) continue;
    const count = parseInt(raw.slice(0, tab), 10);
    const sig = raw.slice(tab + 1).trim();
    if (sig && Number.isFinite(count)) baseline.set(sig, count);
  }
}

const output = runTsc();
const current = tally(
  output.split("\n").filter((l) => l.includes("error TS")).map(toSignature).filter(Boolean),
);

const added = [];
const fixed = [];
for (const [sig, curCount] of current) {
  const baseCount = baseline.get(sig) ?? 0;
  if (curCount > baseCount) added.push({ sig, n: curCount - baseCount });
}
for (const [sig, baseCount] of baseline) {
  const curCount = current.get(sig) ?? 0;
  if (curCount < baseCount) fixed.push({ sig, n: baseCount - curCount });
}

if (fixed.length) {
  const total = fixed.reduce((a, f) => a + f.n, 0);
  console.log(`ℹ️  ${total} baseline type error(s) now FIXED — ratchet scripts/ci/tsc-baseline.txt down:`);
  for (const f of fixed) console.log(`   -${f.n} ${f.sig.slice(0, 150)}`);
}

if (added.length) {
  const total = added.reduce((a, f) => a + f.n, 0);
  console.error(`\n❌ ${total} NEW type error(s) beyond the baseline:`);
  for (const a of added) console.error(`   +${a.n} ${a.sig}`);
  console.error(`\nFix them, or (only if genuinely pre-existing) regenerate scripts/ci/tsc-baseline.txt.`);
  process.exit(1);
}

const baseTotal = [...baseline.values()].reduce((a, n) => a + n, 0);
const curTotal = [...current.values()].reduce((a, n) => a + n, 0);
console.log(`✅ tsc ratchet: no new type errors (baseline ${baseTotal}, current ${curTotal}).`);
