#!/usr/bin/env node
/**
 * legacy-mark-lint — the regression guard for the retired orbital PaigeMark.
 *
 * Owner-ruled 2026-09-06: the orbital PaigeMark (gold orb + orbital ring + companion spark) is
 * RETIRED and prohibited from active use; the Command Mark is the platform identity. The component
 * was deleted and every runtime use migrated to PaigeCommandMark. This guard stops the old mark from
 * creeping back — via a re-created component, an import, a JSX tag, an inline reproduction (its
 * distinctive gradient stops), or its orbital-only animation classes.
 *
 * It deliberately does NOT ban the general gold palette (#F0C86A / #D4A752 are used pervasively as
 * brand gold), the reused halo keyframe (`paige-halo-pulse`, now driving the Studio cutscene aurora),
 * or the current mark (`PaigeCommandMark`). It targets only signals unique to the retired orbital mark.
 *
 * Scope: active shippable/copyable source — src/**, public/**, and EVERY root HTML entry point the
 * production build ships (index.html + the other rollup inputs: privacy/sms-terms/auth per
 * vite.config.ts, and any future one — derived by scanning root *.html, not hardcoded). Archival docs
 * (docs/**) are allowed to record history. Any single line may opt out with an inline
 * `legacy-mark-exempt: <reason>` marker (for a genuinely archival or meta reference, e.g. this file,
 * or a doctrine section that must name it).
 *
 * Matching is BOTH per-line (precise line numbers, EXEMPT-aware) AND across a newline-collapsed view
 * of the non-exempt lines, so a multi-attribute tag split over several lines (e.g. an `<ellipse>` whose
 * `transform="rotate(...)"` sits on a later line) cannot slip a re-drawn orbital ring past the guard.
 *
 * Run: `node scripts/ci/legacy-mark-lint.mjs`  ·  self-test: add `--self-test`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXEMPT = /legacy-mark-exempt:/;

/**
 * Signals unique to the RETIRED orbital mark. Each: [label, regex, hint, crossLine?].
 * `crossLine` marks a MULTI-ATTRIBUTE tag rule whose match can legitimately span physical lines
 * (its `[^>]*` / `\s*` already cross newlines); those get the extra full-text pass in scanText.
 * The single-token rules (hex, class, import, JSX tag, component decl) can only occur on one line,
 * so they need no cross-line pass.
 */
const RULES = [
  ["retired orbital gradient stop (#FCE7B6)", /#FCE7B6/i, "the retired PaigeMark orb highlight — use PaigeCommandMark / the gold tokens"],
  ["retired orbital gradient stop (#FFF4D8)", /#FFF4D8/i, "the retired PaigeMark spark highlight — use PaigeCommandMark / the gold tokens"],
  ["retired orbital-ring spin class (paige-orbit-spin)", /\bpaige-orbit-spin\b/, "the retired orbital mark's ring animation — remove it"],
  ["retired orbital orb-breathe class (paige-orb-breathe)", /\bpaige-orb-breathe\b/, "the retired orbital mark's orb animation — remove it"],
  ["retired orbital spark-drift class (paige-spark-drift)", /\bpaige-spark-drift\b/, "the retired orbital mark's spark animation — remove it"],
  ["retired PaigeMark JSX tag", /<PaigeMark[\s/>]/, "render <PaigeCommandMark /> instead"],
  ["import of the retired PaigeMark module", /(?:brand\/PaigeMark|\.\/PaigeMark)['"]/, "import { PaigeCommandMark } from \"@/components/brand/PaigeCommandMark\""],
  ["re-declared PaigeMark component", /\b(?:function|const)\s+PaigeMark\b/, "the orbital PaigeMark is retired — do not re-create it; use PaigeCommandMark"],
  ["re-drawn orbital ring (rotated stroked ellipse)", /<ellipse\b[^>]*\btransform\s*=\s*["']\s*rotate/i, "the retired orbital mark's tilted-ring geometry — do not re-draw it; use PaigeCommandMark", true],
];

const TEXT_EXT = /\.(tsx?|jsx?|css|scss|html|svg)$/i;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "coverage"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (TEXT_EXT.test(name)) yield p;
  }
}

/**
 * Scan one file's TEXT. Two disjoint passes, both honouring a `legacy-mark-exempt:` marker:
 *   1) per-line — the single-token rules (NOT `crossLine`), precise line numbers, a marker on the
 *      line opts that line out. `forEach` visits every line, so a real hit is never hidden behind an
 *      exempt one on another line.
 *   2) full-text — the `crossLine` (multi-attribute tag) rules, whose match can legitimately span
 *      lines (`[^>]*`/`\s*` already cross newlines). It iterates EVERY match (global regex), not just
 *      the first, so a real tag is caught even when an exempt tag precedes it (Codex #998 P2).
 *      Exemption is honoured at the TAG level: a marker on ANY physical line the matched tag occupies
 *      — from the match line through the line bearing its closing `>`, each checked IN FULL — skips
 *      THAT tag and scanning continues; a marker on a line the tag does not occupy does not.
 * Returns [{ line, label, hint }], line ≥ 1 (the tag's opening line for a cross-line match).
 */
function scanText(text) {
  const lines = text.split(/\r?\n/);
  const offenders = [];
  const lineOf = (idx) => text.slice(0, idx).split(/\r?\n/).length - 1; // 0-based physical line
  lines.forEach((line, i) => {
    if (EXEMPT.test(line)) return;
    for (const [label, re, hint, crossLine] of RULES) {
      if (crossLine) continue; // handled by the full-text pass below
      if (re.test(line)) offenders.push({ line: i + 1, label, hint });
    }
  });
  for (const [label, re, hint, crossLine] of RULES) {
    if (!crossLine) continue;
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m;
    while ((m = g.exec(text)) !== null) {
      if (m.index === g.lastIndex) g.lastIndex++; // defensive: never spin on a zero-width match
      const gt = text.indexOf(">", m.index);
      const tagEnd = gt === -1 ? text.length : gt + 1;
      // the physical lines this tag occupies, checked in full — a marker in a trailing comment on the
      // closing line counts; skip only THIS tag and keep scanning for a later, non-exempt one.
      if (lines.slice(lineOf(m.index), lineOf(tagEnd) + 1).some((l) => EXEMPT.test(l))) continue;
      offenders.push({ line: lineOf(m.index) + 1, label, hint });
    }
  }
  return offenders;
}

/**
 * Every root-level *.html is a production entry point (the vite build's rollup inputs — index.html
 * plus privacy/sms-terms/auth, and any future one). Derived by scanning root *.html so a new entry
 * point is covered automatically, never hardcoded to index.html alone.
 */
function rootHtmlEntryPoints() {
  const out = [];
  for (const name of readdirSync(ROOT)) {
    if (!/\.html$/i.test(name)) continue;
    const p = join(ROOT, name);
    try { if (statSync(p).isFile()) out.push(p); } catch { /* skip */ }
  }
  return out;
}

function scanFiles() {
  const targets = [];
  for (const p of walk(join(ROOT, "src"))) targets.push(p);
  // Also scan public/ — an orbital SVG asset dropped there ships just like source.
  try { for (const p of walk(join(ROOT, "public"))) targets.push(p); } catch { /* no public dir */ }
  // …and every root HTML entry point the build ships (not just index.html).
  for (const p of rootHtmlEntryPoints()) targets.push(p);
  const offenders = [];
  const selfPath = join(ROOT, "scripts", "ci", "legacy-mark-lint.mjs");
  for (const file of targets) {
    if (file === selfPath) continue; // this guard names the patterns on purpose
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const o of scanText(text)) offenders.push({ file: relative(ROOT, file), ...o });
  }
  return offenders;
}

function selfTest() {
  const fails = [];
  const shouldFire = [
    'background: radial-gradient(#FCE7B6, #d4a752);',
    'stop stopColor="#fff4d8"',
    'className={animated ? "paige-orbit-spin" : undefined}',
    'className="paige-orb-breathe"',
    'className="paige-spark-drift"',
    '<PaigeMark className="h-8 w-8" />',
    'import { PaigeMark } from "@/components/brand/PaigeMark";',
    'import { PaigeMark } from "./PaigeMark";',
    'export function PaigeMark({ className }) {',
    'const PaigeMark = () => null;',
    '<ellipse cx="16" cy="16" rx="14.5" ry="5.4" transform="rotate(-22 16 16)" stroke="var(--gold-bright)" />',
  ];
  const shouldNotFire = [
    'import { PaigeCommandMark } from "@/components/brand/PaigeCommandMark";',
    '<PaigeCommandMark className="h-8 w-8" />',
    'background: linear-gradient(#f5c266, #e9a83a);', // current gold, fine
    'border-color: #F0C86A;', // general brand gold, fine
    'className={cn("paige-halo-pulse")}', // reused by the cutscene aurora, fine
    'export function PaigeCommandMark({ className }) {',
    '<ellipse cx="24" cy="24" rx="18" ry="7.5" fill="none" />', // a plain (non-rotated) ellipse is not the orbital ring
    '// historical: the old PaigeMark orbital mark  legacy-mark-exempt: doctrine note',
  ];
  const fires = (s) => RULES.some(([, re]) => re.test(s));
  for (const s of shouldFire) if (!fires(s)) fails.push(`should FIRE but did not: ${s}`);
  for (const s of shouldNotFire) {
    if (EXEMPT.test(s)) continue;
    if (fires(s)) fails.push(`should NOT fire but did: ${s}`);
  }

  // Scan-level cases — the file-scan behaviour (cross-line reconstruction + tag-level EXEMPT), not
  // just the regexes. A rotated <ellipse> whose `transform` sits on a LATER line must still be caught,
  // and an exempt marker on ANY line of the tag (opening, transform, OR closing) must suppress it.
  const scanCases = [
    // a re-drawn orbital ring split across lines, token-coloured (no banned hex/class) — must FIRE
    ['<ellipse cx="16" cy="16" rx="14.5" ry="5.4"\n  transform="rotate(-22 16 16)"\n  stroke="var(--gold-bright)" fill="none" />', true],
    // exempt marker on the transform line — must NOT fire
    ['<ellipse cx="16" cy="16" rx="14.5" ry="5.4"\n  transform="rotate(-22 16 16)" /* legacy-mark-exempt: archival */\n  stroke="var(--gold)" />', false],
    // exempt marker in a TRAILING COMMENT on the closing line, after the transform (Codex #996 P2) — must NOT fire
    ['<ellipse cx="16" cy="16" rx="14.5" ry="5.4"\n  transform="rotate(-22 16 16)"\n  stroke="var(--gold)" />  <!-- legacy-mark-exempt: archival ring -->', false],
    // exempt marker on the OPENING line, before the transform — must NOT fire
    ['<ellipse cx="16" cy="16" data-note="legacy-mark-exempt: archival ring"\n  transform="rotate(-22 16 16)"\n  stroke="var(--gold)" />', false],
    // exempt marker on a SEPARATE line the tag does NOT occupy (after its closing />) — must FIRE
    // (an exemption must be ON the tag, matching the strict per-line model)
    ['<ellipse cx="16" cy="16"\n  transform="rotate(-22 16 16)"\n  stroke="var(--gold)" />\n<!-- legacy-mark-exempt: not on the tag -->', true],
    // TWO multi-line rings, exemption on the FIRST only — the second must still be caught (Codex #998 P2)
    ['<ellipse cx="1" cy="1"\n  transform="rotate(1)" />  <!-- legacy-mark-exempt: archival -->\n<ellipse cx="2" cy="2"\n  transform="rotate(2)" stroke="var(--gold)" />', true],
    // a plain (non-rotated) ellipse split across lines — must NOT fire
    ['<ellipse cx="24" cy="24" rx="18" ry="7.5"\n  fill="none" stroke="var(--border)" />', false],
    // a banned hex split onto its own line is still caught per-line — must FIRE
    ['background: radial-gradient(\n  #FCE7B6, #d4a752);', true],
  ];
  const scanFires = (t) => scanText(t).length > 0;
  for (const [t, want] of scanCases) {
    const got = scanFires(t);
    if (got !== want) fails.push(`scan case expected ${want ? "FIRE" : "no fire"} but got ${got ? "FIRE" : "no fire"}: ${JSON.stringify(t)}`);
  }

  if (fails.length) {
    console.error("legacy-mark-lint self-test: FAIL");
    for (const f of fails) console.error("  - " + f);
    process.exit(1);
  }
  console.log("legacy-mark-lint self-test: PASS (" + (shouldFire.length + shouldNotFire.length + scanCases.length) + " cases)");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const offenders = scanFiles();
  if (offenders.length) {
    console.error(`legacy-mark-lint: FAIL — the retired orbital PaigeMark must not be reintroduced (${offenders.length}):`);
    for (const o of offenders) {
      const loc = o.line ? `${o.file}:${o.line}` : `${o.file} (whole file)`;
      console.error(`  - ${loc}  ${o.label}\n      → ${o.hint}`);
    }
    console.error("\nThe Command Mark (PaigeCommandMark) is the current identity. Archival docs may use `legacy-mark-exempt: <reason>`.");
    process.exit(1);
  }
  console.log("legacy-mark-lint: PASS — no retired orbital PaigeMark in active source.");
}
