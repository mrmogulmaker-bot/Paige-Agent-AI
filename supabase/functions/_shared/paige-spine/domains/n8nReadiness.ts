/** Workspace current-state evidence. Never a Rail event or action permission. */
export const N8N_API_STATES = ["not_connected", "api_health_failed", "api_connected_zero", "api_connected", "api_saved"] as const;
export const N8N_MCP_STATES = ["mcp_not_configured", "oauth_needed", "mcp_disabled", "consent_in_progress", "cancelled", "refused", "failed", "expired", "token_expired", "provider_unavailable", "connected_no_approved_tools", "connected_approved_tools"] as const;
export const N8N_OAUTH_STATES = ["ready", "authorized", "authorization_needed", "consent_in_progress", "unavailable", "expired"] as const;
export const N8N_API_ACTIONS = ["none", "connect_api", "reconnect_api", "check_api", "retry_check"] as const;
export const N8N_MCP_ACTIONS = ["none", "approve_named_workflows", "complete_or_cancel_consent", "retry_check", "connect_oauth", "reconnect_oauth"] as const;
export type N8nSafeReadiness = {
  readonly api: { readonly state: typeof N8N_API_STATES[number]; readonly workflowCount: number | null; readonly lastSuccessfulCheck: string | null; readonly actionNeeded: typeof N8N_API_ACTIONS[number] };
  readonly mcp: { readonly state: typeof N8N_MCP_STATES[number]; readonly oauthReadiness: typeof N8N_OAUTH_STATES[number]; readonly approvedWorkflowCount: number | null; readonly approvedToolCount: number | null; readonly lastSuccessfulCheck: string | null; readonly actionNeeded: typeof N8N_MCP_ACTIONS[number] };
};
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const member = <T extends string>(v: unknown, allowed: readonly T[]): v is T => typeof v === "string" && allowed.includes(v as T);
const count = (v: unknown): v is number | null => v === null || typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const date = (v: unknown): string | null | undefined => {
  if (v === null) return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return undefined;
  const parsed = Date.parse(v); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
};
/** Bind first, then project only named fields. Tenant IDs never enter the safe result. */
export function parseN8nSpineReadiness(value: unknown, expectedTenantId: string | null): N8nSafeReadiness | null {
  const r = record(value);
  if (!expectedTenantId || !r || r.tenant_id !== expectedTenantId) return null;
  const a = record(r.api), m = record(r.mcp);
  if (!a || !m || !member(a.state, N8N_API_STATES) || !member(m.state, N8N_MCP_STATES) || !member(m.oauth_readiness, N8N_OAUTH_STATES) || !member(a.action_needed, N8N_API_ACTIONS) || !member(m.action_needed, N8N_MCP_ACTIONS)) return null;
  if (!count(a.workflow_count) || !count(m.approved_workflow_count) || !count(m.approved_tool_count)) return null;
  const apiDate = date(a.last_successful_check), mcpDate = date(m.last_successful_check);
  if (apiDate === undefined || mcpDate === undefined) return null;
  // A stored count is not proof about an unverified replacement configuration.
  const verifiedApi = a.state === "api_connected" || a.state === "api_connected_zero";
  if (a.state === "api_connected_zero" && a.workflow_count !== 0) return null;
  return {
    api: { state: a.state, workflowCount: verifiedApi ? a.workflow_count : null, lastSuccessfulCheck: apiDate, actionNeeded: a.action_needed },
    mcp: { state: m.state, oauthReadiness: m.oauth_readiness, approvedWorkflowCount: m.approved_workflow_count, approvedToolCount: m.approved_tool_count, lastSuccessfulCheck: mcpDate, actionNeeded: m.action_needed },
  };
}
export const N8N_API_WORDS: Record<N8nSafeReadiness["api"]["state"], string> = {
  not_connected: "Not connected", api_health_failed: "Saved connection; health check failed", api_connected_zero: "Connected; zero workflows", api_connected: "Connected", api_saved: "Saved connection; current configuration not verified",
};
export const N8N_MCP_WORDS: Record<N8nSafeReadiness["mcp"]["state"], string> = {
  mcp_not_configured: "MCP not configured", oauth_needed: "OAuth authorization needed", mcp_disabled: "MCP disabled", consent_in_progress: "OAuth consent in progress", cancelled: "Authorization cancelled", refused: "Authorization refused", failed: "Authorization failed", expired: "Authorization attempt expired", token_expired: "Authorization expired", provider_unavailable: "Provider unavailable", connected_no_approved_tools: "Connected; no approved workflows or tools", connected_approved_tools: "Connected; explicitly approved read tools available",
};
export const N8N_ACTION_WORDS: Record<N8nSafeReadiness["api"]["actionNeeded"] | N8nSafeReadiness["mcp"]["actionNeeded"], string> = {
  none: "No connection action needed", connect_api: "Connect the optional API connection", reconnect_api: "Check the API key or its access in n8n, then reconnect", check_api: "Validate the saved API connection", retry_check: "Retry the connection check", approve_named_workflows: "Review named workflows for read access", complete_or_cancel_consent: "Complete or cancel OAuth consent", connect_oauth: "Connect n8n with OAuth", reconnect_oauth: "Reconnect n8n authorization",
};
