#!/usr/bin/env node
/**
 * tier-feature-lint.mjs — §60 structural tier-lock guard (owner-MANDATORY 2026-08-11).
 *
 * WHY: A feature's per-tier availability must be decided in ONE home
 * (`src/lib/tier/tierFeatures.ts`) and read through `hasFeature` /
 * `useTierFeatures` — never re-derived inside a render gate as an inline
 * `account_type === "agency"` compare or a hardcoded tenant-UUID compare. When
 * gates hardcode the tier, the SAME capability silently appears on one account
 * type and vanishes on another (§56/§60 — the customer-portal-invite leak this
 * whole PR fixes). This lint fails CI on any NEW such hardcode in a render gate.
 *
 * WHAT IT FLAGS (in the CODE part of a line, comments ignored):
 *   1. `account_type ===` / `account_type ==` / `account_type !==`
 *   2. a hardcoded tenant-UUID string compared with === / == / !==
 *      (e.g. `tenantId === "e7f1b157-...."`).
 *
 * NOT flagged (allowed):
 *   (a) the helper itself (`src/lib/tier/tierFeatures.ts`) and the canonical tier
 *       predicates (`src/lib/agency/accountCapabilities.ts`,
 *       `src/lib/agency/tierLabels.ts`) — these are the ONE home the rule points
 *       gates AT; and
 *   (b) any line carrying an inline `// tier-feature-exempt: <reason>` marker
 *       (reason REQUIRED) — for legitimate tier ROUTING sites (which surface /
 *       nav / home / journey / lens to show), which are NOT feature toggles. The
 *       marker may sit on the flagged line or on either of the two lines above it.
 *
 * Deliberately regex-based + dependency-free so it runs anywhere `node` runs.
 * `--self-test` runs the compliant + non-compliant fixtures.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const SRC_DIR = join(REPO_ROOT, "src");

/** Files that ARE the one home / canonical predicates — never flagged. */
const CANONICAL_FILES = new Set(
  [
    "src/lib/tier/tierFeatures.ts",
    "src/lib/agency/accountCapabilities.ts",
    "src/lib/agency/tierLabels.ts",
  ].map((p) => p.split("/").join(sep)),
);

const ACCOUNT_TYPE_CMP = /account_type\s*(?:!==|===|==)/;
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_CMP = new RegExp(
  `(?:!==|===|==)\\s*['"\\\`]${UUID}['"\\\`]|['"\\\`]${UUID}['"\\\`]\\s*(?:!==|===|==)`,
);
const EXEMPT_MARKER = /tier-feature-exempt\s*:\s*\S+/i;

/** Split a line into its code part (before the first `//`) and comment part. */
function splitLine(line) {
  const idx = line.indexOf("//");
  if (idx === -1) return { code: line, comment: "" };
  return { code: line.slice(0, idx), comment: line.slice(idx) };
}

/**
 * Find offending render-gate hardcodes in one file's text.
 * @returns {{line:number, snippet:string, kind:string}[]}
 */
export function findOffenders(text, relPath) {
  const normalized = relPath.split("/").join(sep);
  if (CANONICAL_FILES.has(normalized)) return [];

  const lines = text.split(/\r?\n/);
  const offenders = [];

  for (let i = 0; i < lines.length; i++) {
    const { code } = splitLine(lines[i]);
    const isAccountType = ACCOUNT_TYPE_CMP.test(code);
    const isUuid = UUID_CMP.test(code);
    if (!isAccountType && !isUuid) continue;

    // Exempt if the marker sits on this line's comment or up to two lines above.
    const window = [lines[i], lines[i - 1] ?? "", lines[i - 2] ?? ""].join("\n");
    if (EXEMPT_MARKER.test(window)) continue;

    offenders.push({
      line: i + 1,
      snippet: lines[i].trim().slice(0, 120),
      kind: isAccountType ? "account_type-compare" : "tenant-uuid-compare",
    });
  }
  return offenders;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === "__tests__") continue;
      out.push(...walk(abs));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(abs);
    }
  }
  return out;
}

function selfTest() {
  const dir = join(REPO_ROOT, "scripts", "fixtures", "tier-features");
  const failSrc = readFileSync(join(dir, "fail.tsx"), "utf8");
  const passSrc = readFileSync(join(dir, "pass.tsx"), "utf8");
  const failV = findOffenders(failSrc, "scripts/fixtures/tier-features/fail.tsx");
  const passV = findOffenders(passSrc, "scripts/fixtures/tier-features/pass.tsx");

  let ok = true;
  if (failV.length === 0) {
    ok = false;
    console.error("SELF-TEST FAIL: fail.tsx produced 0 offenders (expected >= 1).");
  } else {
    console.log(`SELF-TEST: fail.tsx correctly flagged ${failV.length} offender(s):`);
    for (const v of failV) console.log(`    line ${v.line} [${v.kind}]: ${v.snippet}`);
  }
  if (passV.length !== 0) {
    ok = false;
    console.error(`SELF-TEST FAIL: pass.tsx produced ${passV.length} offender(s) (expected 0):`);
    for (const v of passV) console.error(`    line ${v.line} [${v.kind}]: ${v.snippet}`);
  } else {
    console.log("SELF-TEST: pass.tsx correctly produced 0 offenders (helper-use + exempt markers).");
  }
  console.log(ok ? "SELF-TEST: PASS — linter behaves correctly." : "SELF-TEST: FAIL.");
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    process.exit(selfTest() ? 0 : 1);
  }

  let files;
  try {
    files = walk(SRC_DIR);
  } catch (e) {
    console.error(`[tier-feature-lint] cannot read ${SRC_DIR}: ${e.message}`);
    process.exit(1);
  }

  const offenders = [];
  for (const abs of files) {
    const rel = relative(REPO_ROOT, abs).split(sep).join("/");
    const text = readFileSync(abs, "utf8");
    for (const o of findOffenders(text, rel)) {
      offenders.push({ file: rel, ...o });
    }
  }

  if (offenders.length > 0) {
    console.error("");
    console.error("✗ tier-feature-lint FAILED — render gate(s) hardcode a tier instead of §60's one home:");
    for (const o of offenders) {
      console.error(`    • ${o.file}:${o.line}  [${o.kind}]  ${o.snippet}`);
    }
    console.error("");
    console.error("  A per-tier feature decision must live in src/lib/tier/tierFeatures.ts and be read");
    console.error("  through hasFeature()/useTierFeatures() (§60) — not hardcoded in a render gate.");
    console.error("  Fix one of:");
    console.error("    1) route the decision through useTierFeatures().has(<Feature>), or");
    console.error("    2) if this is legitimate tier ROUTING (which surface/nav/home to show, NOT a");
    console.error("       feature toggle), add `// tier-feature-exempt: <reason>` on the line (or the");
    console.error("       two lines above it). The reason is required.");
    console.error("");
    process.exit(1);
  }

  console.log(`✓ tier-feature-lint: ${files.length} src file(s) checked, no un-exempted tier hardcodes.`);
  process.exit(0);
}

// Run as CLI only when invoked directly (not when imported by a test).
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
