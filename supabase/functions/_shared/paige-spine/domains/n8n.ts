import type { SpineCapability } from "../contracts.ts";
import { N8N_API_STATES, N8N_MCP_STATES, N8N_OAUTH_STATES } from "./n8nReadiness.ts";
/** Live workspace record projection, not client Rail history. Counts/dates are validated by the domain parser. */
export const N8N_CONNECTION_READINESS = {
  key: "integrations.n8n_readiness", domain: "integrations", owner: "solo-integrations",
  humanSurface: "/solo/:account/settings/integrations",
  evidence: {
    signalKinds: ["integrations.n8n_readiness"], adapter: "public.get_n8n_spine_readiness", audience: "owner_internal",
    freshness: "Current connection records at read time; explicit last successful provider checks may be old or absent",
    staleAfterDays: 1, projectionWindowDays: 1, sourceSystem: "solo_integrations", sourceActorTypes: ["system"],
    classification: "operational", lifecycle: "current", safeSummary: "Independent n8n API health and MCP authorization readiness.",
    referencePrefix: "n8n_readiness:", factValues: { api_state: N8N_API_STATES, mcp_state: N8N_MCP_STATES, oauth_readiness: N8N_OAUTH_STATES },
  },
  action: { classification: "read", executor: "public.get_n8n_spine_readiness", idempotency: "Read-only projection; no provider calls, events or credential changes", riskPolicyKey: "read_only", approvalAuthority: "none" },
  chatBinding: "PARTIAL", mindBinding: "PARTIAL", sharedPrimitiveChange: "NONE", maturity: "PARTIAL",
} as const satisfies SpineCapability;
