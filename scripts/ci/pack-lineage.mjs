#!/usr/bin/env node
/**
 * pack-lineage — a ported surface is only ported if it was ported from v3.
 *
 * Owner ruling, 2026-08-23: *"strip the dead-pack files, don't mount them. And the general form —
 * check which pack a file cites before mounting it. A ported surface is only ported if it was
 * ported from v3."*
 *
 * WHY THIS IS A SCRIPT AND NOT A SENTENCE. The rule was nearly applied backwards. A handoff
 * counted ~370 KB of unmounted surface as one class and recommended mounting it; 232 KB of that
 * cites `Super Admin Shell.dc.html`, the pack ruled dead on 2026-08-22. Mounting it would have
 * installed the retired design through the fix meant to remove it. A rule that subtle does not
 * survive as prose.
 *
 * TWO AXES, AND BOTH ARE NEEDED — either alone gives the wrong answer:
 *
 *   PACK        which document a file's own header cites, matched across wrapped comment lines
 *               (a citation broken over two lines defeated the first attempt at this)
 *   REACHABLE   whether `OperatorEntry` / `App` can actually get to it, by walking imports
 *
 * The failure it guards is one cell of that grid: **UNREACHABLE + DEAD-PACK**. That is a port of
 * a replaced design sitting in the tree waiting to be mistaken for work worth mounting. Sixteen
 * such files were stripped on 2026-08-23; this keeps them gone.
 *
 * THE CELL IT DELIBERATELY DOES NOT FAIL — and this is the part a sentence gets wrong. Several
 * LIVE surfaces still cite the dead pack in their headers: they were ported from it, then reworked
 * onto the v3 tokens, geometry and rulings without their header being rewritten. Their citation is
 * stale, their content is not. Failing on them would demand a churn of seven file headers to prove
 * something the reachability axis already settles — they are mounted and they render the current
 * design. They are listed below as a known set, so nobody reads the rule naively and rips out a
 * working surface on the strength of a comment.
 *
 *   npm run lint:pack-lineage
 */
import fs from "node:fs";
import path from "node:path";

const SURFACES = "src/operator/surfaces";
const ENTRIES = ["src/operator/OperatorEntry.tsx", "src/App.tsx"];

/**
 * LIVE surfaces whose header cites the superseded pack. Ported from it, then reworked onto v3.
 * Shrinking this list is welcome; growing it means a dead-pack file got mounted, which is the
 * thing the ruling forbids — so an addition here needs a reason in the same commit.
 */
const STALE_CITATION_BUT_LIVE = new Set([
  "FleetConsole.tsx", "FleetHistorySurface.tsx", "FleetTeamPulseSurface.tsx",
  "FleetTenantsRail.tsx", "KnowledgeSurface.tsx",
  "TrustCompass.tsx", "OperatorPanel.tsx", "panelSpecs.ts",

  /**
   * ADDED 2026-08-24, and they are not new drift — the walk above was FLAT until this commit, so
   * every file in a subdirectory was invisible to the guard. These five are `panelSpecs.ts`'s own
   * content, split across files: the retired console's 78 leaves, transcribed from
   * `Super Admin Shell.dc.html` and reachable through the panel registry. They were mounted the
   * whole time; the check simply never looked in `specs/`.
   *
   * They leave as BUILD-ORDER Layer 2 proceeds — a view at a time, as its v3 builder lands and its
   * `panels:` key is replaced. Three are already gone that way (`fleet/systems-check`,
   * `campaigns/catalog`, `campaigns/sales`). This list shrinks; it must not grow.
   */
  "specs/fleetSpecs.ts", "specs/moneySpecs.ts", "specs/opsSpecs.ts",
  "specs/paigeSpecs.ts", "specs/platformSpecs.ts",
]);

/** Resolve an import specifier the way Vite's `@/` alias does. */
function resolveSpec(spec, from) {
  const base = spec.startsWith("@/") ? path.join("src", spec.slice(2))
    : spec.startsWith(".") ? path.join(path.dirname(from), spec)
    : null;
  if (!base) return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

/** Everything the console can actually reach, static imports and lazy() alike. */
function reachable() {
  const seen = new Set();
  const queue = [...ENTRIES];
  while (queue.length) {
    const f = queue.shift();
    if (!f || seen.has(f) || !fs.existsSync(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']/g)) {
      const r = resolveSpec(m[1] || m[2], f);
      if (r) queue.push(r);
    }
  }
  return seen;
}

/**
 * Which pack a file cites. Comment leaders are stripped and newlines collapsed FIRST, because
 * CD's own filename wraps across lines in several headers and a naive match reads
 * "…Super Admin Shell\n * v3.dc.html" as the dead pack — which inverts the verdict.
 */
function citedPack(file) {
  const flat = fs.readFileSync(file, "utf8").replace(/^\s*\*\s*/gm, "").replace(/\s+/g, " ");
  if (/Shell v3/.test(flat)) return "v3";
  if (/Super Admin Shell\.dc\.html|Shell\.dc\.html/.test(flat)) return "dead";
  return "none";
}

/**
 * RECURSIVE, and it has to be. This walk was flat until 2026-08-24, which meant a surface in a
 * subdirectory was invisible to the guard — it could cite the retired pack, or be reachable from
 * nothing, and the check would pass by never having looked at it. The Campaigns money spine
 * (`surfaces/campaigns/`) was the first group ported into one, and it landed as three files the
 * flat read skipped entirely. A guard that silently declines to inspect a file is worse than no
 * guard, because it reports a clean result.
 */
function walk(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

const live = reachable();
const rows = walk(SURFACES)
  .sort()
  .map((p) => ({
    f: path.relative(SURFACES, p),
    pack: citedPack(p),
    live: live.has(p),
    kb: Math.round(fs.statSync(p).size / 1024),
  }));

const orphaned = rows.filter((r) => !r.live && r.pack === "dead");
const staleLive = rows.filter((r) => r.live && r.pack === "dead");
const unexpectedStale = staleLive.filter((r) => !STALE_CITATION_BUT_LIVE.has(r.f));

for (const r of rows) {
  const mark = r.live ? "live" : "    ";
  console.log(`  ${mark}  ${r.pack.padEnd(4)} ${String(r.kb).padStart(3)}KB  ${r.f}`);
}
console.log("");

let bad = false;

if (orphaned.length) {
  bad = true;
  console.error("❌ pack-lineage: unreachable file(s) ported from the SUPERSEDED pack.");
  console.error("   A port of a design ruled dead, sitting where a later pass will mistake it for");
  console.error("   work worth mounting. Strip it (§30) — do not wire it to a v3 view.");
  for (const r of orphaned) console.error(`   ${r.f} (${r.kb}KB)`);
}

if (unexpectedStale.length) {
  bad = true;
  console.error("\n❌ pack-lineage: a dead-pack file is MOUNTED and not on the known-stale list.");
  console.error("   Either it was ported from the retired design and must not render, or it was");
  console.error("   reworked onto v3 and its header still says otherwise. Fix one or the other,");
  console.error("   and say which in the commit.");
  for (const r of unexpectedStale) console.error(`   ${r.f} (${r.kb}KB)`);
}

const gone = [...STALE_CITATION_BUT_LIVE].filter((f) => !rows.some((r) => r.f === f));
if (gone.length) {
  console.log(`ℹ️  known-stale entries no longer present (safe to drop from the list): ${gone.join(", ")}`);
}

if (bad) process.exit(1);
console.log(
  `✅ pack-lineage: ${rows.filter((r) => r.pack === "v3").length} v3 · ` +
  `${staleLive.length} live-with-stale-citation · 0 unreachable dead-pack files.`,
);
