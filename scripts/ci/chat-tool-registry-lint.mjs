#!/usr/bin/env node
/**
 * chat-tool-registry-lint — a new Paige tool is REGISTERED by its domain, not hand-wired
 * into the Chat handler.
 *
 * THE OWNER RULING THIS ENFORCES (2026-09-01). Domains own their features; the shared Spine owns
 * governance; Chat is a consumer, not the integration dumping ground. Adopted with an explicit
 * amendment: "The Spine registry must be enforced in code and CI — not merely written down. A PR
 * must fail if it hard-wires a PAIGE tool/action into the Chat handler."
 *
 * WHY A RATCHET AND NOT A WALL. The same ruling says: adopt incrementally, new work follows the
 * rule immediately, existing couplings migrate one at a time, no big-bang refactor, no pausing
 * unrelated work. A wall would fail every PR touching a handler that already declares 100 tools
 * inline — which is not enforcement, it is a blocked repository. So the baseline is frozen at
 * what shipped the day the rule was adopted, and the list may only DESCEND.
 *
 *   · Adding a tool name that is not in the baseline → FAIL. Register it instead.
 *   · Removing one (a migration to the registry) → the baseline is stale; update it in the same
 *     PR. The guard says so and prints the exact line to delete.
 *
 * CANONICAL REGISTRY. Domain declarations live in the PAIGE Spine registry. This guard still
 * forbids new inline Chat coupling even when a tool name is registered: registration establishes
 * governance metadata, while the Chat-owner adapter is the consumer boundary. Existing inline
 * tools remain a descending migration baseline, never a template for new work.
 *
 *   node scripts/ci/chat-tool-registry-lint.mjs
 *   node scripts/ci/chat-tool-registry-lint.mjs --self-test
 */
import fs from "node:fs";
import { dirname, resolve } from "node:path";

const HANDLER = "supabase/functions/paige-ai-chat/index.ts";
const BASELINE = "scripts/ci/chat-tool-baseline.txt";
const REGISTRY = "supabase/functions/_shared/paige-spine/registry.ts";
/**
 * Follow the canonical registry domain imports without executing Deno or TypeScript modules.
 * Main CI intentionally runs Node 20, while the Spine contract validates the executable
 * registry under Node 24. This source lens keeps the direct Chat guard compatible with both
 * runners and fails closed if the registry no longer exposes inspectable domain declarations.
 */
export function registeredChatToolsFromSources(registrySource, readDomainSource) {
  const imports = [...registrySource.matchAll(/from\s+["'](\.\/domains\/[^"']+\.ts)["']/g)].map((match) => match[1]);
  if (!imports.length) throw new Error("canonical Spine registry exposes no domain declaration imports");
  const tools = new Map();
  for (const imported of imports) {
    const source = readDomainSource(imported);
    const blocks = source.split(/(?=export\s+const\s+[A-Z0-9_]+\s*=)/g);
    for (const block of blocks) {
      const key = block.match(/\bkey:\s*["']([^"']+)["']/)?.[1];
      const chatTool = block.match(/\bchatTool:\s*["']([a-z0-9_]+)["']/)?.[1];
      if (key && chatTool) tools.set(chatTool, key);
    }
  }
  return tools;
}
/** A tool declaration is `name: "snake_case",` alone on its line inside the tools array. */
export function declaredTools(source) {
  return [...source.matchAll(/^\s*name: "([a-z0-9_]+)",\s*$/gm)].map((m) => m[1]);
}

export function compare(declared, baseline) {
  const base = new Set(baseline);
  const now = new Set(declared);
  return {
    added: [...now].filter((t) => !base.has(t)).sort(),
    removed: [...base].filter((t) => !now.has(t)).sort(),
  };
}

if (process.argv.includes("--self-test")) {
  const cases = [
    ["passes when the set is unchanged", ["a", "b"], ["a", "b"], { added: 0, removed: 0 }],
    ["FAILS on a hand-wired new tool", ["a", "b", "c"], ["a", "b"], { added: 1, removed: 0 }],
    ["reports a migration so the baseline can follow", ["a"], ["a", "b"], { added: 0, removed: 1 }],
    ["reports both at once", ["a", "c"], ["a", "b"], { added: 1, removed: 1 }],
    // The parser is the part that can silently pass everything, so it is tested directly.
    ["parses a real declaration", declaredTools('              name: "crm_create_contact",\n'), ["crm_create_contact"], { added: 0, removed: 0 }],
    ["ignores a name that is not a tool declaration", declaredTools('  const x = { name: "Bob", age: 1 };\n'), [], { added: 0, removed: 0 }],
  ];
  let bad = 0;
  for (const [label, declared, baseline, want] of cases) {
    const got = compare(declared, baseline);
    if (got.added.length === want.added && got.removed.length === want.removed) console.log(`  ok   ${label}`);
    else { console.log(`  FAIL ${label} — expected ${JSON.stringify(want)}, got added=${JSON.stringify(got.added)} removed=${JSON.stringify(got.removed)}`); bad++; }
  }
  const syntheticRegistry = 'import { EXAMPLE } from "./domains/example.ts";';
  const syntheticTools = registeredChatToolsFromSources(syntheticRegistry, () => 'export const EXAMPLE = { key: "example.write", action: { chatTool: "example_write" } };');
  if (syntheticTools.get("example_write") === "example.write") console.log("  ok   follows canonical registry domain imports without executing TypeScript");
  else { console.log("  FAIL canonical registry source lens did not resolve the declared Chat tool"); bad++; }
  console.log(bad ? `\n✗ chat-tool-registry-lint self-test: ${bad} failure(s).` : "\n✓ chat-tool-registry-lint self-test passed.");
  process.exit(bad ? 1 : 0);
}

for (const f of [HANDLER, BASELINE, REGISTRY]) {
  if (!fs.existsSync(f)) {
    console.log(`✗ chat-tool-registry-lint: ${f} is missing — that is a resolver failure, not a pass.`);
    process.exit(1);
  }
}
const declared = declaredTools(fs.readFileSync(HANDLER, "utf8"));
if (!declared.length) {
  console.log("✗ chat-tool-registry-lint: parsed ZERO tool declarations from the handler. The declaration shape changed and this guard is now blind — fix the parser, do not delete the check.");
  process.exit(1);
}
const baseline = fs.readFileSync(BASELINE, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const { added, removed } = compare(declared, baseline);
let registeredChatTools;
try {
  registeredChatTools = registeredChatToolsFromSources(
    fs.readFileSync(REGISTRY, "utf8"),
    (imported) => fs.readFileSync(resolve(dirname(REGISTRY), imported), "utf8"),
  );
} catch (error) {
  console.log(`✗ chat-tool-registry-lint: canonical Spine registry could not be inspected — ${error?.message ?? error}`);
  process.exit(1);
}

if (added.length) {
  console.log(`✗ chat-tool-registry-lint: ${added.length} tool(s) hand-wired into the Chat handler.\n`);
  for (const t of added) console.log(`  • ${t}`);
  console.log("\n  Owner ruling, 2026-09-01: domains own features, the Spine owns governance, Chat is a");
  console.log("  consumer. A new Paige tool is registered by its domain with safe evidence and action");
  console.log("  metadata; the Chat workstream completes the adapter and approval treatment.");
  for (const tool of added) {
    const capability = registeredChatTools.get(tool);
    console.log(capability
      ? "  " + tool + " is registered by " + capability + ", but must still enter Chat through its adapter."
      : "  " + tool + " has no canonical Spine capability declaration.");
  }
  console.log("  Read " + REGISTRY + ", docs/architecture/paige-spine-foundation.md, then use the Chat-owner adapter seam.");
  console.log("  This baseline may shrink as tools migrate. It must not grow.");
  process.exit(1);
}
if (removed.length) {
  console.log(`✗ chat-tool-registry-lint: ${removed.length} tool(s) left the handler — good, but the baseline is now stale.\n`);
  for (const t of removed) console.log(`  • delete this line from ${BASELINE}: ${t}`);
  console.log("\n  A migration and its baseline update belong in the same PR, or the next author inherits a lie.");
  process.exit(1);
}
console.log(`✓ chat-tool-registry-lint: ${declared.length} tool(s) inline, none added (baseline ${baseline.length}).`);
