// systems-check-runners/external_automation_detected.ts — Check #4 (runner_key: external_automation_detected).
//
// SEAM (reuse ONLY this): tenant_workflows (an active row) OR tenant_mcp_connections (status='connected').
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
      admin.from("tenant_mcp_connections").select("tenant_id").eq("tenant_id", tenantId).eq("status", "connected").limit(1),
    ]);
    throwOnDbError(wfRes.error, "tenant_workflows");
    throwOnDbError(mcpRes.error, "tenant_mcp_connections");

    const hasActiveWorkflow = (wfRes.data?.length ?? 0) > 0;
    const hasMcpConnection = (mcpRes.data?.length ?? 0) > 0;
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
