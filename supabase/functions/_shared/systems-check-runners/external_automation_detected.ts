// systems-check-runners/external_automation_detected.ts — Check #4 (runner_key: external_automation_detected).
//
// SEAM (reuse ONLY this): tenant_workflows (an active row) OR a COUNT of tenant_mcp_connections
//   rows with status='connected' across every provider — an aggregate, never a selected row.
// HONEST SCOPE (§13/§38): this detects automation Paige can SEE — the n8n workflow registry and the
//   tenant's MCP connection. It does NOT and cannot enumerate every third-party automation vendor a tenant
//   might use (Zapier accounts we don't hold, private cron, etc.); the evidence says so plainly so a 'fail'
//   is never mis-read as "the tenant has no automation anywhere," only "none is registered with Paige."
//
// §51 tenant-scoped; §32 fail-loud.

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "./_kit.ts";

export const runnerKey = "external_automation_detected";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const [wfRes, mcpRes] = await Promise.all([
      admin.from("tenant_workflows").select("n8n_workflow_id").eq("tenant_id", tenantId).eq("active", true).limit(1),
      // DETERMINISTIC AGGREGATE. The MCP registry is provider-scoped, so a tenant may
      // hold an n8n row and a Zapier row at once. A `.limit(1)` row read would return
      // an arbitrary one of them: harmless for a boolean today, but it is a
      // nondeterministic selection sitting one refactor away from mislabelling one
      // provider as the other. This check only ever needed "does ANY provider have a
      // proven connection", so it asks for exactly that — a count, with no row, no
      // provider name, no URL, no token state and no tool schema crossing the seam.
      admin.from("tenant_mcp_connections")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("status", "connected"),
    ]);
    throwOnDbError(wfRes.error, "tenant_workflows");
    throwOnDbError(mcpRes.error, "tenant_mcp_connections");

    const hasActiveWorkflow = (wfRes.data?.length ?? 0) > 0;
    // `connected` is now written only by a real probe, never by merely saving
    // credentials, so this aggregate got stricter without changing its meaning.
    const hasMcpConnection = (mcpRes.count ?? 0) > 0;
    const pass = hasActiveWorkflow || hasMcpConnection;

    return {
      status: pass ? "pass" : "fail",
      evidence: {
        has_active_n8n_workflow: hasActiveWorkflow,
        has_mcp_connection: hasMcpConnection,
        scope_note: "n8n workflow registry + MCP connection only — not an exhaustive third-party automation scan",
      },
      interpretation: pass
        ? "Automation is wired: an active workflow and/or an MCP connection is registered with Paige."
        : "No active workflow or MCP connection registered with Paige — no automation is detected in the surfaces Paige can see (this does not preclude tooling Paige has no visibility into).",
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
