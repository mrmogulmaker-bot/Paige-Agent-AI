#!/usr/bin/env node
/**
 * pg-token-parity — the console's design system must MATCH Claude Design's pack, not resemble it.
 *
 * WHY THIS EXISTS. The operator console shipped once with the pack's design MAPPED ONTO the app's
 * shadcn tokens rather than installed. Every name looked right; every value was ours. The owner
 * caught it from a live screenshot — "these are not even our colors" — because nothing in CI could
 * see it. A typecheck, a lint, and a render harness all pass on a surface painted in the wrong
 * palette: the names are correct, the geometry is correct, and the colour is wrong.
 *
 * So this compares VALUES, not names. It reads every `--pg-*` declaration out of the committed pack
 * and asserts `src/index.css` declares the same token with the same value, in both themes.
 *
 * DIRECTION IS DELIBERATE, and it is the whole design of the check:
 *
 *   pack token missing from ours          -> FAIL. The system is not installed.
 *   pack token present with a DIFFERENT   -> FAIL. This is the original defect, exactly.
 *     value
 *   token WE define that the pack does    -> report, never fail. The `--pg-t-*` type ladder is an
 *     not                                    owner-ruled addition on top of the pack; a guard that
 *                                            forbade extension would block the rulings it exists
 *                                            to protect.
 *
 * The pack is the FLOOR, never the ceiling. `src/operator/CLAUDE.md` is explicit that improving on
 * the pack is wanted — proposed, not shipped silently. This guard does not police that; it polices
 * the one thing the owner has already been burned by, which is our values quietly winning.
 *
 * Whitespace inside a value is normalised (`a,b` vs `a, b` is the same shadow), because a
 * formatter should not be able to fail this and a reformat is not a design change.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
// Paths are overridable ONLY so the negative controls can run against temp copies without
// touching the real files (and without racing a concurrent edit). CI passes neither.
const PACK = process.env.PG_PARITY_PACK || join(ROOT, "docs/design-references/cd-packs/super-admin-shell-v3/PAIGE Super Admin Shell v3.dc.html");
const CSS = process.env.PG_PARITY_CSS || join(ROOT, "src/index.css");

for (const [label, p] of [["pack", PACK], ["css", CSS]]) {
  if (!existsSync(p)) {
    console.error(`❌ pg-token-parity: ${label} not found at ${p}`);
    process.exit(1);
  }
}

/** token -> Set of distinct declared values (dark + light collapse into the set). */
function declarations(text) {
  const out = new Map();
  for (const m of text.matchAll(/(--pg-[a-z0-9-]+)\s*:\s*([^;}\n]+)/g)) {
    // Normalise ONLY the separators, never the values. `a, b` and `a,b` are the same font stack
    // and the same shadow list, so space around a comma is collapsed. Space WITHIN a value
    // (`0 1px 2px`) is load-bearing and is only run-collapsed, never removed — stripping it
    // would make genuinely different lengths compare equal, which is the opposite failure.
    const value = m[2]
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ",")
      .trim().toLowerCase().replace(/;$/, "");
    if (!out.has(m[1])) out.set(m[1], new Set());
    out.get(m[1]).add(value);
  }
  return out;
}

const pack = declarations(readFileSync(PACK, "utf8"));
const ours = declarations(readFileSync(CSS, "utf8"));

const missing = [];
const wrong = [];
for (const [token, packValues] of pack) {
  const ourValues = ours.get(token);
  if (!ourValues) { missing.push(token); continue; }
  const p = [...packValues].sort();
  const o = [...ourValues].sort();
  if (p.join("|") !== o.join("|")) wrong.push({ token, pack: p, ours: o });
}

if (missing.length || wrong.length) {
  console.error(`❌ pg-token-parity: the console does not match Claude Design's pack.`);
  if (missing.length) {
    console.error(`\n   ${missing.length} token(s) the pack DEFINES and we do not — the system is not fully installed:`);
    for (const t of missing) console.error(`   ${t}`);
  }
  if (wrong.length) {
    console.error(`\n   ${wrong.length} token(s) present with a DIFFERENT VALUE. This is the mapping defect:`);
    for (const w of wrong) {
      console.error(`   ${w.token}`);
      console.error(`      pack: ${w.pack.join("  |  ")}`);
      console.error(`      ours: ${w.ours.join("  |  ")}`);
    }
  }
  console.error(`\n   Install the pack's value. Do not adjust the pack to match ours, and do not alias\n   a --pg-* token to an app token — that aliasing is what caused this.`);
  process.exit(1);
}

const extra = [...ours.keys()].filter((t) => !pack.has(t));
console.log(`✅ pg-token-parity: all ${pack.size} pack tokens present with matching values, both themes.`);
if (extra.length) console.log(`   ${extra.length} token(s) we define beyond the pack (allowed — deliberate extension): ${extra.join(", ")}`);
