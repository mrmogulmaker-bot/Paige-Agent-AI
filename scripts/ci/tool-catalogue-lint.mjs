#!/usr/bin/env node
/**
 * tool-catalogue-lint — every tool the runtime GOVERNS must be one the operator can SEE.
 *
 * THE GAP THIS GUARDS, measured 2026-08-24. `paige-ai-chat`'s `MUTATING_TOOLS` is the runtime
 * autonomy gate: 46 tools that write, create or change state, each defaulting to `confirm` so
 * Paige proposes before she acts. `list_tool_autonomy()` is the catalogue the operator's
 * Capabilities surface renders — and it carries 23. **The other 23 are governed and invisible.**
 * They cannot be flipped to autopilot, and — the half that matters — they cannot be turned OFF.
 * Among them: `n8n_delete_workflow` (permanent, by its own description), `marketplace_install`,
 * `forge_subagent`, `update_business_profile`, and the whole `plan_*` family.
 *
 * It is drift, not a decision. The Studio migration says so in its own header: it re-declared the
 * catalogue "from a copy" and the copy predated those tools. CD saw a slice of it and wrote
 * "Four automation tools are gated at runtime but missing"; the task ledger recorded five. The
 * real number is 23, which is what happens to a hand-maintained list that has no check.
 *
 * SO THIS IS A RATCHET, NOT A WALL. Failing outright would block every unrelated PR on a
 * pre-existing gap, so the known 23 are the baseline: the guard fails when the gap GROWS — a new
 * governed tool added with no catalogue row — and tells you to lower the baseline when it
 * shrinks. Same shape as `scripts/ci/tsc-ratchet.mjs`, for the same reason.
 *
 *   node scripts/ci/tool-catalogue-lint.mjs
 */
import fs from "node:fs";

/**
 * The baseline is a COUNT plus the exact keys, because a count alone can stay flat while the
 * membership churns — one tool quietly dropped from the catalogue and another added would net to
 * zero and pass. Listing them makes any swap visible.
 */
// THE BASELINE IS NOW EMPTY, AND THAT IS THE POINT.
//
// This list used to name 23 tools that the runtime gated but the catalogue never offered — the
// operator could not see them and, more to the point, could not turn them off. Migration
// 20261020000000 completed the catalogue, so the gap is CLOSED and the ratchet's job changes from
// "hold it from growing" to "hold it AT zero".
//
// Do NOT re-populate this to get a new tool past the guard. A tool in MUTATING_TOOLS with no
// catalogue row is governed invisibly; the fix is a migration that adds the row, not an entry here.
const KNOWN_UNGOVERNED = [];

const CHAT = "supabase/functions/paige-ai-chat/index.ts";

function runtimeTools() {
  const src = fs.readFileSync(CHAT, "utf8");
  const marker = "const MUTATING_TOOLS = new Set<string>([";
  const at = src.indexOf(marker);
  if (at < 0) {
    console.error(`✗ tool-catalogue-lint: could not find MUTATING_TOOLS in ${CHAT}.`);
    console.error("  The gate was renamed or moved. Update this guard rather than deleting it —");
    console.error("  a guard that cannot find its subject must fail loudly, never pass quietly.");
    process.exit(1);
  }
  const open = src.indexOf("[", at);
  const close = src.indexOf("]);", open);
  return new Set([...src.slice(open, close).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
}

/**
 * The catalogue lives in the LATEST migration that redeclares `list_tool_autonomy` — the RPC is
 * `CREATE OR REPLACE`d with its whole body each time, so the newest declaration is what prod runs.
 */
function catalogueTools() {
  const files = fs
    .readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let latest = null;
  for (const f of files) {
    const sql = fs.readFileSync(`supabase/migrations/${f}`, "utf8");
    if (sql.includes("FUNCTION public.list_tool_autonomy")) latest = { f, sql };
  }
  if (!latest) {
    console.error("✗ tool-catalogue-lint: no migration declares list_tool_autonomy.");
    process.exit(1);
  }
  const from = latest.sql.indexOf("WITH catalog(tool_key");
  const to = latest.sql.indexOf("SELECT", from);
  if (from < 0 || to < 0) {
    console.error(`✗ tool-catalogue-lint: could not read the catalogue in ${latest.f}.`);
    process.exit(1);
  }
  return {
    file: latest.f,
    keys: new Set([...latest.sql.slice(from, to).matchAll(/\('([a-z0-9_]+)',/g)].map((m) => m[1])),
  };
}

const runtime = runtimeTools();
const cat = catalogueTools();
const ungoverned = [...runtime].filter((k) => !cat.keys.has(k)).sort();
const known = new Set(KNOWN_UNGOVERNED);
const isNew = ungoverned.filter((k) => !known.has(k));
const fixed = KNOWN_UNGOVERNED.filter((k) => cat.keys.has(k));

if (isNew.length) {
  console.error(
    `✗ tool-catalogue-lint: ${isNew.length} newly governed tool(s) the operator cannot see or turn off:`,
  );
  for (const k of isNew) console.error(`    ${k}`);
  console.error(
    `\n  Every tool in MUTATING_TOOLS is gated at runtime. One with no row in list_tool_autonomy` +
      `\n  is governed INVISIBLY — the operator cannot flip it to autopilot and, more to the point,` +
      `\n  cannot turn it off. Add it to the catalogue in a new migration that CREATE OR REPLACEs` +
      `\n  list_tool_autonomy (${cat.file} is the current one), with an operator-facing label and a` +
      `\n  category from the existing set. Do not add it to this guard's baseline to get past it.`,
  );
  process.exit(1);
}

if (fixed.length) {
  console.error(
    `✗ tool-catalogue-lint: ${fixed.length} tool(s) are now in the catalogue but still listed as` +
      ` a known gap here:`,
  );
  for (const k of fixed) console.error(`    ${k}`);
  console.error("\n  Good news — remove them from KNOWN_UNGOVERNED so the ratchet holds the gain.");
  process.exit(1);
}

console.log(
  `✓ tool-catalogue-lint: ${runtime.size} runtime-gated tool(s) · ${cat.keys.size} in the catalogue` +
    ` · ${ungoverned.length} governed-but-invisible (baseline, not grown).`,
);
if (ungoverned.length) {
  console.log(
    `  Those ${ungoverned.length} are real: the operator cannot turn them off. Closing the gap is` +
      ` the catalogue-completion task, and this guard stops it widening in the meantime.`,
  );
}
