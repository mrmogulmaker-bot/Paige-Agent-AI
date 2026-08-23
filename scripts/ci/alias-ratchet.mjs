#!/usr/bin/env node
/**
 * alias-ratchet — turn the operator console's compatibility bridge from debt into a schedule.
 *
 * WHY THIS EXISTS. The console was built on the app's shadcn tokens with CD's design mapped
 * onto them, so our values won every disagreement and the shipped surface was not the palette.
 * The fix installed CD's `--pg-*` system as the source of truth — but 78 already-ported
 * surfaces still use shadcn utility names (`bg-card`, `text-muted-foreground`), and ripping
 * those in one pass would leave every one of them unstyled. That is the go-dark failure wearing
 * a different hat.
 *
 * So the shadcn names survive as a BRIDGE, with the polarity inverted: they are DERIVED FROM
 * the pg values rather than the reverse, which means pg wins by construction. Same mechanism as
 * the original defect, opposite direction, and the direction was the whole defect.
 *
 * The condition on keeping it (owner, 2026-08-23): the count only ever descends. Each slice
 * migrates its surfaces onto pg tokens directly and drops the aliases it no longer needs. A
 * debt with a monotonic direction is a schedule, not debt — the same discipline as
 * `tsc-ratchet.mjs`, and deliberately the same shape so there is one pattern here, not two.
 *
 *   current > baseline  -> a new alias was added   -> FAIL
 *   current < baseline  -> aliases were dropped    -> print, and tell the author to commit it
 *   current === 0       -> the bridge is gone; delete this gate and its baseline
 *
 * The baseline file is guarded the same way `tsc-baseline.txt` is: it may only shrink, so a PR
 * cannot whitelist a new alias by editing the number upward.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, "alias-baseline.txt");
const CSS_PATH = join(HERE, "../../src/index.css");
const MARKER = "COMPATIBILITY BRIDGE";

/**
 * Count the alias declarations inside the bridge only.
 *
 * Deliberately NOT a grep for `--background:` across the file: the pg blocks above the bridge
 * legitimately declare tokens too, and a count that included them would drift for reasons that
 * have nothing to do with the debt. The bridge is bounded by its own marker comment, so the
 * gate measures exactly the thing it is scheduling.
 */
export function countAliases(css) {
  const at = css.indexOf(MARKER);
  if (at === -1) return { count: 0, blocks: 0 };
  const tail = css.slice(at);
  // The two theme blocks that follow the marker ARE the bridge.
  const blocks = [...tail.matchAll(/\[data-pg="(?:light|dark)"\]\s*\{([^}]*)\}/g)].slice(0, 2);
  let count = 0;
  for (const [, body] of blocks) {
    count += (body.match(/^\s*--[a-z0-9-]+\s*:/gm) ?? []).length;
  }
  return { count, blocks: blocks.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const css = readFileSync(CSS_PATH, "utf8");
  const { count, blocks } = countAliases(css);

  if (!existsSync(BASELINE_PATH)) {
    console.error(`alias-ratchet: no baseline at ${BASELINE_PATH}. Commit one containing ${count}.`);
    process.exit(1);
  }
  const baseline = parseInt(readFileSync(BASELINE_PATH, "utf8").trim(), 10);
  if (Number.isNaN(baseline)) {
    console.error("alias-ratchet: baseline is not a number.");
    process.exit(1);
  }

  if (count === 0) {
    console.log("✅ alias-ratchet: the compatibility bridge is EMPTY. Delete this gate, its baseline, and the bridge's marker comment — the port is finished.");
    process.exit(0);
  }
  if (blocks < 2) {
    console.error(`alias-ratchet: expected 2 bridge theme blocks, found ${blocks}. The marker or the block shape moved — fix the gate rather than the number, or it is measuring the wrong thing.`);
    process.exit(1);
  }
  if (count > baseline) {
    console.error(
      `❌ alias-ratchet: ${count} aliases, baseline ${baseline} — ${count - baseline} ADDED.\n` +
      `   The bridge only descends. A surface that needs a value should read the --pg-* token\n` +
      `   directly; adding a shadcn alias re-creates the mapping that caused the original defect.`,
    );
    process.exit(1);
  }
  if (count < baseline) {
    console.log(
      `✅ alias-ratchet: ${count} aliases, down from ${baseline} — ${baseline - count} dropped.\n` +
      `   Commit the new number to scripts/ci/alias-baseline.txt so the gate holds the ground.`,
    );
    process.exit(0);
  }
  console.log(`✅ alias-ratchet: ${count} aliases, baseline ${baseline} — unchanged.`);
}
