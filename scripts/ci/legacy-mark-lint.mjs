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
 * Scope: active shippable/copyable source (src/**, index.html). Archival docs (docs/**) are allowed
 * to record history. Any single line may opt out with an inline `legacy-mark-exempt: <reason>` marker
 * (for a genuinely archival or meta reference, e.g. this file, or a doctrine section that must name it).
 *
 * Run: `node scripts/ci/legacy-mark-lint.mjs`  ·  self-test: add `--self-test`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXEMPT = /legacy-mark-exempt:/;

/** Signals unique to the RETIRED orbital mark. Each: [label, regex, hint]. */
const RULES = [
  ["retired orbital gradient stop (#FCE7B6)", /#FCE7B6/i, "the retired PaigeMark orb highlight — use PaigeCommandMark / the gold tokens"],
  ["retired orbital gradient stop (#FFF4D8)", /#FFF4D8/i, "the retired PaigeMark spark highlight — use PaigeCommandMark / the gold tokens"],
  ["retired orbital-ring spin class (paige-orbit-spin)", /\bpaige-orbit-spin\b/, "the retired orbital mark's ring animation — remove it"],
  ["retired orbital orb-breathe class (paige-orb-breathe)", /\bpaige-orb-breathe\b/, "the retired orbital mark's orb animation — remove it"],
  ["retired orbital spark-drift class (paige-spark-drift)", /\bpaige-spark-drift\b/, "the retired orbital mark's spark animation — remove it"],
  ["retired PaigeMark JSX tag", /<PaigeMark[\s/>]/, "render <PaigeCommandMark /> instead"],
  ["import of the retired PaigeMark module", /(?:brand\/PaigeMark|\.\/PaigeMark)['"]/, "import { PaigeCommandMark } from \"@/components/brand/PaigeCommandMark\""],
  ["re-declared PaigeMark component", /\b(?:function|const)\s+PaigeMark\b/, "the orbital PaigeMark is retired — do not re-create it; use PaigeCommandMark"],
  ["re-drawn orbital ring (rotated stroked ellipse)", /<ellipse\b[^>]*\btransform\s*=\s*["']\s*rotate/i, "the retired orbital mark's tilted-ring geometry — do not re-draw it; use PaigeCommandMark"],
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

function scanFiles() {
  const targets = [];
  for (const p of walk(join(ROOT, "src"))) targets.push(p);
  // Also scan public/ — an orbital SVG asset dropped there ships just like source.
  try { for (const p of walk(join(ROOT, "public"))) targets.push(p); } catch { /* no public dir */ }
  targets.push(join(ROOT, "index.html"));
  const offenders = [];
  const selfPath = join(ROOT, "scripts", "ci", "legacy-mark-lint.mjs");
  for (const file of targets) {
    if (file === selfPath) continue; // this guard names the patterns on purpose
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (EXEMPT.test(line)) return;
      for (const [label, re, hint] of RULES) {
        if (re.test(line)) offenders.push({ file: relative(ROOT, file), line: i + 1, label, hint });
      }
    });
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
  if (fails.length) {
    console.error("legacy-mark-lint self-test: FAIL");
    for (const f of fails) console.error("  - " + f);
    process.exit(1);
  }
  console.log("legacy-mark-lint self-test: PASS (" + (shouldFire.length + shouldNotFire.length) + " cases)");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const offenders = scanFiles();
  if (offenders.length) {
    console.error(`legacy-mark-lint: FAIL — the retired orbital PaigeMark must not be reintroduced (${offenders.length}):`);
    for (const o of offenders) console.error(`  - ${o.file}:${o.line}  ${o.label}\n      → ${o.hint}`);
    console.error("\nThe Command Mark (PaigeCommandMark) is the current identity. Archival docs may use `legacy-mark-exempt: <reason>`.");
    process.exit(1);
  }
  console.log("legacy-mark-lint: PASS — no retired orbital PaigeMark in active source.");
}
