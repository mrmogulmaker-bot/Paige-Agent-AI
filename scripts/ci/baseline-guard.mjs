#!/usr/bin/env node
/**
 * baseline-guard — the tsc baseline (scripts/ci/tsc-baseline.txt) may only SHRINK.
 *
 * The tsc-ratchet trusts the baseline: any error signature present in it is treated as
 * pre-existing and won't fail a PR. So a PR could whitelist a genuinely-new error by appending
 * its signature to the baseline. This guard closes that: it compares the head baseline's
 * per-signature counts against the base ref's, and fails if ANY signature's count grew or a NEW
 * signature appeared. A reformat or a legitimate fix (counts drop / signatures removed) passes.
 *
 * The comparison is per-signature (not a line-diff and not a total-count): a total-count check
 * could be gamed by fixing one error while whitelisting another. If the base ref has no baseline
 * file at all (the PR that INTRODUCES the baseline — like Lane F Slice 1), the guard skips —
 * there's nothing to shrink from yet.
 *
 * Usage: BASE=<sha> node scripts/ci/baseline-guard.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.BASE;
if (!BASE) {
  console.log("baseline-guard: no BASE ref provided — skipping (not a PR context).");
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REL = "scripts/ci/tsc-baseline.txt";
const PATH = join(HERE, "tsc-baseline.txt");

/** Parse `<count>\t<signature>` lines into a Map(signature → count). */
function parse(text) {
  const m = new Map();
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const tab = raw.indexOf("\t");
    if (tab === -1) continue;
    const count = parseInt(raw.slice(0, tab), 10);
    const sig = raw.slice(tab + 1).trim();
    if (sig && Number.isFinite(count)) m.set(sig, count);
  }
  return m;
}

let baseText;
try {
  baseText = execSync(`git show ${BASE}:${REL}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  console.log(`baseline-guard: ${REL} does not exist at base ${BASE.slice(0, 12)} — this PR introduces it, skipping.`);
  process.exit(0);
}

const base = parse(baseText);
const head = parse(readFileSync(PATH, "utf8"));

const grew = [];
for (const [sig, count] of head) {
  const baseCount = base.get(sig) ?? 0;
  if (count > baseCount) grew.push({ sig, from: baseCount, to: count });
}

if (grew.length) {
  console.error(`❌ baseline-guard: ${grew.length} baseline entr(y/ies) GREW — the tsc baseline may only shrink.`);
  console.error(`   Fix the type error instead of whitelisting it in ${REL}:`);
  for (const g of grew) console.error(`   ${g.from}→${g.to}  ${g.sig.slice(0, 140)}`);
  process.exit(1);
}

console.log(`✅ baseline-guard: tsc baseline did not grow (base ${base.size} sigs → head ${head.size} sigs).`);
