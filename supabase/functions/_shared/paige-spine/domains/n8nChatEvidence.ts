import type { SpineEvidenceRpcClient, SpineRequestScope } from "../resolveEvidence.ts";
import { N8N_ACTION_WORDS, N8N_API_WORDS, N8N_MCP_WORDS, parseN8nSpineReadiness, type N8nSafeReadiness } from "./n8nReadiness.ts";
export type N8nChatEvidence = { readonly status: "available"; readonly readiness: N8nSafeReadiness } | { readonly status: "unavailable" } | { readonly status: "wrong_workspace" | "scope_changed" };
const isCurrent = (scope?: SpineRequestScope) => { try { return scope ? scope.isCurrent() : true; } catch { return false; } };
export async function loadN8nReadinessForChat(client: SpineEvidenceRpcClient, expectedTenantId: string | null, scope?: SpineRequestScope): Promise<N8nChatEvidence> {
  if (!expectedTenantId) return { status: "wrong_workspace" };
  if (!isCurrent(scope)) return { status: "scope_changed" };
  try {
    const { data, error } = await client.rpc("get_n8n_spine_readiness", {});
    if (!isCurrent(scope)) return { status: "scope_changed" };
    if (error) return { status: "unavailable" };
    if (data && typeof data === "object" && "tenant_id" in data && data.tenant_id !== expectedTenantId) return { status: "wrong_workspace" };
    const readiness = parseN8nSpineReadiness(data, expectedTenantId);
    return readiness ? { status: "available", readiness } : { status: "unavailable" };
  } catch { return isCurrent(scope) ? { status: "unavailable" } : { status: "scope_changed" }; }
}
const HEADER = "=== N8N CONNECTION READINESS — VERIFIED WORKSPACE SOURCE ===";
const FOOTER = "=== END N8N CONNECTION READINESS ===";
export function renderN8nReadinessForChat(evidence: N8nChatEvidence): string {
  if (evidence.status === "wrong_workspace" || evidence.status === "scope_changed") return "";
  if (evidence.status === "unavailable") return [HEADER, "Status: UNAVAILABLE. The connection state could not be checked. Do not claim nothing is wired, disconnected, or connected from this failed read.", FOOTER].join("\n");
  if (evidence.status !== "available") return "";
  const { api, mcp } = evidence.readiness;
  return [HEADER,
    `API connection: ${N8N_API_WORDS[api.state]}. Workflow count: ${api.workflowCount ?? "unavailable"}.`,
    `API last successful check: ${api.lastSuccessfulCheck ?? "not proven"}. Action needed: ${N8N_ACTION_WORDS[api.actionNeeded]}.`,
    `Paige tools (MCP): ${N8N_MCP_WORDS[mcp.state]}. OAuth readiness: ${mcp.oauthReadiness}.`,
    `Approved workflows: ${mcp.approvedWorkflowCount ?? "unavailable"}. Approved tools: ${mcp.approvedToolCount ?? "unavailable"}.`,
    `MCP last successful check: ${mcp.lastSuccessfulCheck ?? "not proven"}. Action needed: ${N8N_ACTION_WORDS[mcp.actionNeeded]}.`,
    "Source: current server-resolved connection records. Check timestamps describe historical successful checks, not a new provider check during this conversation. A missing check is unknown freshness.",
    "API visibility and MCP authorization are independent. Zero workflows is a real result, not evidence that nothing is wired. OAuth read/write consent is separate from permission for a particular action. Connection success never approves workflow execution, creation, editing, deletion, or activation; use the existing governed approval path for supported actions.",
    FOOTER].join("\n");
}
export async function buildN8nReadinessBlock(client: SpineEvidenceRpcClient, expectedTenantId: string | null, scope?: SpineRequestScope): Promise<string> {
  return renderN8nReadinessForChat(await loadN8nReadinessForChat(client, expectedTenantId, scope));
}
