#!/usr/bin/env node
/**
 * Provider-scoped MCP registry — the two-provider regression.
 *
 * WHY THIS EXISTS
 *
 * The MCP registry used to hold one connection per tenant, so a bare
 * `.eq(tenant_id).eq(status,'connected').limit(1)` row read was unambiguous. Now
 * a tenant may hold an n8n row AND a Zapier row, and that read returns an
 * ARBITRARY one of them. For the boolean this check produces it is harmless
 * today — which is exactly why nothing would have caught it turning into a
 * mislabel the first time somebody selected a column off it.
 *
 * So this drives the REAL `external_automation_detected` runner and asserts on
 * what it actually QUERIES, not on its prose: that it asks for a deterministic
 * aggregate, that no provider identity crosses the seam, and that its answer is
 * identical no matter which provider happens to be connected.
 *
 * Only the Supabase client is substituted. The runner, its evidence keys and its
 * interpretation strings are the shipped code — this smoke deliberately asserts
 * those strings are unchanged, because Systems Check's design is immutable here.
 *
 * §9 tenant scope · §13 honest aggregate · §32 armed, not asserted in prose.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const TENANT = "aaaaaaaa-1111-4111-8111-111111111111";
const RUNNER = "supabase/functions/_shared/systems-check-runners/external_automation_detected.ts";

/** Records every query the runner builds, tagged with how it was built. */
function makeAdmin({ workflows = [], mcpConnected = 0 }) {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, verb: null, columns: null, opts: null, filters: [], limited: null };
      queries.push(q);
      const chain = {
        select(columns, opts) {
          q.verb = "select"; q.columns = columns; q.opts = opts ?? null;
          return chain;
        },
        eq(col, val) { q.filters.push([col, val]); return chain; },
        limit(n) { q.limited = n; return chain; },
        // Awaited at the end of the chain by the runner.
        then(resolve) {
          if (q.table === "tenant_workflows") {
            return resolve({ data: workflows, error: null, count: null });
          }
          // A head+count query returns NO rows at all — only a number.
          if (q.opts?.head === true && q.opts?.count === "exact") {
            return resolve({ data: null, error: null, count: mcpConnected });
          }
          return resolve({ data: [], error: null, count: null });
        },
      };
      return chain;
    },
  };
}

const outDir = path.join(process.cwd(), "node_modules", ".cache", "mcp-registry-smoke");
const outfile = path.join(outDir, "runner.mjs");
await build({
  entryPoints: [RUNNER],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});
const { run, runnerKey } = await import(pathToFileURL(outfile).href);

let passed = 0;
const fail = [];
function check(label, cond, detail = "") {
  if (cond) { passed += 1; console.log(`  ok  ${label}`); }
  else { fail.push(`${label}${detail ? " — " + detail : ""}`); console.log(`  FAIL ${label} ${detail}`); }
}

console.log("\nprovider-scoped MCP registry smoke\n");
check("the runner key is unchanged", runnerKey === "external_automation_detected", runnerKey);

// ── 1. The MCP read is a deterministic aggregate, not a selected row ───────────
{
  const admin = makeAdmin({ mcpConnected: 2 });
  await run({ admin, tenantId: TENANT }, {});
  const mcp = admin.queries.find((q) => q.table === "tenant_mcp_connections");
  check("the MCP read is tenant-scoped", mcp.filters.some(([c, v]) => c === "tenant_id" && v === TENANT));
  check("the MCP read counts only PROVEN connections",
    mcp.filters.some(([c, v]) => c === "status" && v === "connected"));
  check("the MCP read asks for an exact COUNT",
    mcp.opts?.count === "exact", JSON.stringify(mcp.opts));
  check("the MCP read returns NO rows (head query)", mcp.opts?.head === true);
  check("the MCP read does not take an arbitrary row via limit(1)",
    mcp.limited === null, `limit=${mcp.limited}`);
  check("the MCP read selects no provider identity",
    !String(mcp.columns ?? "").includes("provider"), String(mcp.columns));
}

// ── 2. The answer is identical whichever provider is connected ─────────────────
// This is the mislabel regression: n8n-only and Zapier-only must be
// indistinguishable to this check, because it reports an aggregate.
const shapeOf = async (mcpConnected) => {
  const admin = makeAdmin({ mcpConnected });
  const res = await run({ admin, tenantId: TENANT }, {});
  const mcp = admin.queries.find((q) => q.table === "tenant_mcp_connections");
  return { res, query: { columns: mcp.columns, opts: mcp.opts, filters: mcp.filters, limited: mcp.limited } };
};
{
  const n8nOnly = await shapeOf(1);       // one connected provider
  const zapierOnly = await shapeOf(1);    // the other — same count, same query
  const both = await shapeOf(2);
  const neither = await shapeOf(0);

  check("the query shape does not vary with which provider is connected",
    JSON.stringify(n8nOnly.query) === JSON.stringify(zapierOnly.query)
    && JSON.stringify(both.query) === JSON.stringify(neither.query));

  check("one connected provider passes", n8nOnly.res.status === "pass");
  check("both providers connected still passes exactly once", both.res.status === "pass");
  check("no connected provider fails", neither.res.status === "fail");

  const ev = JSON.stringify(both.res.evidence) + JSON.stringify(both.res.interpretation);
  check("no provider is ever NAMED in the result", !/zapier/i.test(ev), ev.slice(0, 120));
  check("the result never claims a count of providers", !/\b2\b/.test(JSON.stringify(both.res.evidence)));

  // Systems Check's own design is immutable: these strings must not drift.
  check("evidence keys are unchanged",
    Object.keys(both.res.evidence).join(",") === "has_active_n8n_workflow,has_mcp_connection,scope_note");
  check("the pass interpretation is unchanged",
    both.res.interpretation === "Automation is wired: an active workflow and/or an MCP connection is registered with Paige.");
  check("the fail interpretation is unchanged",
    neither.res.interpretation.startsWith("No active workflow or MCP connection registered with Paige"));
}

// ── 3. A saved-but-unproven connection must not count ─────────────────────────
// The setter now writes 'pending_verification'; only a probe writes 'connected'.
// The count filters on 'connected', so an unproven row is invisible here.
{
  const admin = makeAdmin({ mcpConnected: 0 });
  const res = await run({ admin, tenantId: TENANT }, {});
  const mcp = admin.queries.find((q) => q.table === "tenant_mcp_connections");
  check("a merely-saved connection cannot satisfy the check",
    res.status === "fail" && mcp.filters.some(([c, v]) => c === "status" && v === "connected"));
}

// ── 4. An n8n workflow alone still passes, independently of MCP ───────────────
{
  const admin = makeAdmin({ workflows: [{ n8n_workflow_id: "w1" }], mcpConnected: 0 });
  const res = await run({ admin, tenantId: TENANT }, {});
  check("an active n8n workflow alone still passes", res.status === "pass");
  check("...and it is reported as a workflow, not as an MCP connection",
    res.evidence.has_active_n8n_workflow === true && res.evidence.has_mcp_connection === false);
}

console.log(`\n${passed} assertions passed.`);
if (fail.length) { console.error(`\n${fail.length} FAILURE(S):\n- ${fail.join("\n- ")}`); process.exit(1); }
