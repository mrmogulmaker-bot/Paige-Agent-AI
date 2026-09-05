#!/usr/bin/env node
/**
 * mcp-governed-door-lint — the no-bypass guard for the inbound MCP door.
 *
 * WHAT THIS GUARDS, AND WHY A TEST CANNOT.
 * `paige-mcp` registers its tools as 119 separate top-level `mcp.tool("<name>", …)` calls. Nothing
 * about that shape forces a new tool to be governed: a developer adds a 120th call, it dispatches,
 * and no test fails — because a test can only exercise the tools it knows about. The gap is
 * structural, so the guard has to be structural too.
 *
 * The rules below are deliberately mechanical. Each one failed to be true at some point in this
 * file's history, and each is cheap to re-break by accident:
 *
 *   R1  Every registered tool has exactly one entry in the capability policy.
 *   R2  Every policy entry names a registered tool. Drift runs both ways — a renamed tool leaves a
 *       stale entry behind, and a stale entry is worse than a missing one because it looks handled.
 *   R3  The registered count matches the count the policy declares it covers. Two comments in this
 *       repo said 117 while the real number was 119; a number written in prose rots silently, so it
 *       is asserted instead.
 *   R4  The single `tools/call` chokepoint still calls the governed adapter. If the call disappears,
 *       every tool is ungoverned and nothing else in CI notices.
 *   R5  No SECOND dispatch door. A new `server.tool`/`mcp.tool` registration on a different server
 *       instance, or a second handler branching on `tools/call`, bypasses the chokepoint entirely.
 *
 * Run: node scripts/ci/mcp-governed-door-lint.mjs
 * Self-test: node scripts/ci/mcp-governed-door-lint.mjs --self-test
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MCP = "supabase/functions/paige-mcp/index.ts";
const POLICY = "supabase/functions/_shared/paige-mcp/capability-policy.ts";

/** Tool names as REGISTERED. Anchored at column 0 so a name inside a comment or string cannot count. */
export function registeredTools(src) {
  return [...src.matchAll(/^mcp\.tool\("([a-z0-9_]+)"/gm)].map((m) => m[1]);
}

/** Tool names the policy declares. Keys are quoted at a fixed indent inside the one exported table. */
export function policyTools(src) {
  const start = src.indexOf("export const MCP_CAPABILITY_POLICY");
  if (start === -1) return [];
  const body = src.slice(start);
  const end = body.indexOf("\n};");
  return [...body.slice(0, end === -1 ? undefined : end).matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map((m) => m[1]);
}

/** A second door: any tool registration on something other than the one `mcp` instance, or a
 *  second place that branches on the tools/call method. */
export function secondDoors(src) {
  const found = [];
  for (const m of src.matchAll(/^(?!mcp\.tool\()[ \t]*([A-Za-z_$][\w$]*)\.tool\(\s*"/gm)) {
    found.push(`${m[1]}.tool( — a registration on an instance other than \`mcp\``);
  }
  const callBranches = [...src.matchAll(/"tools\/call"/g)].length;
  if (callBranches > EXPECTED_TOOLS_CALL_MENTIONS) {
    found.push(`"tools/call" appears ${callBranches}× (expected ${EXPECTED_TOOLS_CALL_MENTIONS}) — a new dispatch branch may bypass the chokepoint`);
  }
  return found;
}

/** The chokepoint mentions tools/call in the tier/scope gate, the Rail emitter, and the list filter.
 *  Raising this number is a deliberate act that must be reviewed, which is the point. */
const EXPECTED_TOOLS_CALL_MENTIONS = 4;

export function check(mcpSrc, policySrc) {
  const failures = [];
  const registered = registeredTools(mcpSrc);
  const policied = policyTools(policySrc);
  const rset = new Set(registered);
  const pset = new Set(policied);

  const unmapped = registered.filter((t) => !pset.has(t));
  if (unmapped.length) {
    failures.push(
      `R1 ${unmapped.length} registered tool(s) have NO capability-policy entry, so they would be ` +
      `denied at runtime and are invisible to governance review: ${unmapped.join(", ")}`,
    );
  }

  const stale = policied.filter((t) => !rset.has(t));
  if (stale.length) {
    failures.push(`R2 ${stale.length} policy entr(ies) name no registered tool (renamed or deleted): ${stale.join(", ")}`);
  }

  const declared = /MCP_TOOL_COUNT\s*=\s*(\d+)/.exec(policySrc);
  if (!declared) failures.push("R3 the policy does not declare MCP_TOOL_COUNT");
  else if (Number(declared[1]) !== registered.length) {
    failures.push(`R3 policy declares MCP_TOOL_COUNT=${declared[1]} but ${registered.length} tools are registered`);
  }

  if (!/governMcpToolCall\s*\(/.test(mcpSrc)) {
    failures.push("R4 the tools/call chokepoint no longer calls governMcpToolCall — every tool is ungoverned");
  }

  for (const d of secondDoors(mcpSrc)) failures.push(`R5 ${d}`);

  return { failures, registeredCount: registered.length, policiedCount: policied.length };
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────────
function selfTest() {
  const okMcp = `mcp.tool("alpha", {\nmcp.tool("beta", {\ngovernMcpToolCall(\n"tools/call"\n"tools/call"\n"tools/call"\n"tools/call"\n`;
  const okPolicy = `export const MCP_TOOL_COUNT = 2;\nexport const MCP_CAPABILITY_POLICY = {\n  alpha: {\n  beta: {\n};\n`;
  const cases = [
    ["clean tree passes", okMcp, okPolicy, 0],
    ["an unmapped tool fails", okMcp + `mcp.tool("gamma", {\n`, okPolicy, 2], // R1 + R3
    ["a stale policy entry fails", okMcp, `export const MCP_TOOL_COUNT = 2;\nexport const MCP_CAPABILITY_POLICY = {\n  alpha: {\n  beta: {\n  ghost: {\n};\n`, 1],
    ["a wrong declared count fails", okMcp, okPolicy.replace("= 2", "= 117"), 1],
    ["removing the adapter call fails", okMcp.replace("governMcpToolCall(\n", ""), okPolicy, 1],
    ["a second server instance fails", okMcp + `other.tool("sneaky", {\n`, okPolicy, 1],
    ["an extra tools/call branch fails", okMcp + `"tools/call"\n`, okPolicy, 1],
    ["a tool name inside a comment does not count", okMcp + `// mcp.tool("commented", {\n`, okPolicy, 0],
  ];
  let bad = 0;
  for (const [name, m, p, expected] of cases) {
    const got = check(m, p).failures.length;
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`${ok ? "  ok" : "FAIL"}  ${name} (expected ${expected} failure(s), got ${got})`);
  }
  if (bad) { console.error(`\n${bad} self-test case(s) failed.`); process.exit(1); }
  console.log(`\nmcp-governed-door-lint self-test: ${cases.length}/${cases.length} passed.`);
}

if (process.argv.includes("--self-test")) { selfTest(); }
else {
  const mcpSrc = readFileSync(resolve(process.cwd(), MCP), "utf8");
  const policySrc = readFileSync(resolve(process.cwd(), POLICY), "utf8");
  const { failures, registeredCount, policiedCount } = check(mcpSrc, policySrc);
  if (failures.length) {
    console.error(`\nmcp-governed-door-lint: ${failures.length} failure(s)\n`);
    for (const f of failures) console.error(`  • ${f}`);
    console.error("");
    process.exit(1);
  }
  console.log(`✅ mcp-governed-door-lint: ${registeredCount} registered tools, ${policiedCount} governed, one door, no bypass.`);
}
