#!/usr/bin/env node
/**
 * shadow-var-lint — a Tailwind arbitrary shadow built from a `var()` MUST carry the `shadow:`
 * data-type hint, or it silently emits no box-shadow at all.
 *
 * THE DEFECT, AND WHY A GUARD RATHER THAN A NOTE. Tailwind 3 cannot infer the type of a bare
 * `var()` inside `shadow-[…]`. It guesses COLOUR, so
 *
 *     shadow-[var(--pg-lift-1)]     compiles to   { --tw-shadow-color: var(--pg-lift-1) }
 *
 * which recolours a shadow that was never declared. `getComputedStyle(el).boxShadow` comes back
 * `none`. Nothing errors, nothing warns, the class is right there in the markup, and the element
 * renders flat. The correct form names the type:
 *
 *     shadow-[shadow:var(--pg-lift-1)]   compiles to   { box-shadow: … }
 *
 * HOW IT WAS FOUND, TWICE. `SlotSurfaceBody.tsx` already carries a long note about hitting this
 * on the raised plates — it was diagnosed, fixed at that one site, and written up. It was NOT
 * swept. On 2026-08-24 the owner reported live that *"the buttons do not have the texture and
 * coloring it's supposed to have"*, and a Chromium measurement of the spine's window controls
 * returned `boxShadow: "none"` against a class list that plainly declares a lift. The sweep then
 * found 59 occurrences across 34 files — every plate, card, control lift, rim and inset in the
 * operator console, and the Studio besides.
 *
 * That is the whole argument for this file. A defect that is invisible to `tsc`, to `eslint`, to
 * every jsdom test, and to reading the source is exactly the kind that has to be caught
 * mechanically — a note in one file's header could not stop it spreading to thirty-three others.
 */
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
/** `shadow-[…var(…)…]` at any variant prefix, without the `shadow:` hint. */
const BAD = /(?:^|[\s"'`:])(?:[a-z-]+:)*shadow-\[(?!shadow:)(?:[^[\]]|\[[^[\]]*\])*?var\(/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

const files = walk(ROOT);
const hits = [];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (BAD.test(line)) hits.push(`${f}:${i + 1}\n      ${line.trim().slice(0, 140)}`);
  });
}

if (hits.length) {
  console.error(
    `✗ shadow-var-lint: ${hits.length} arbitrary shadow(s) built from var() without the ` +
      `\`shadow:\` hint. Tailwind types these as --tw-shadow-color and emits NO box-shadow.\n`,
  );
  for (const h of hits) console.error(`  ${h}`);
  console.error(`\n  Fix: shadow-[var(--x)]  ->  shadow-[shadow:var(--x)]`);
  process.exit(1);
}

// Report scope, not just absence: a guard that enumerates has to say what it did not look at.
console.log(
  `✓ shadow-var-lint: ${files.length} file(s) under ${ROOT}/ checked; every arbitrary var() ` +
    `shadow carries the \`shadow:\` hint. (Inline style={{ boxShadow }} is outside this check — ` +
    `it is plain CSS and does not go through Tailwind's type inference.)`,
);
