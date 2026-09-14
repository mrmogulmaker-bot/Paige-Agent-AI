// Connected MCP Capability Gateway — shared types (Phase S, server/schema-first).
//
// The gateway is PROVIDER-AGNOSTIC by construction: everything is keyed by an immutable
// connection_id and a provider_key STRING (a descriptor row, never a 2-value enum). It reuses
// the hardened provider-agnostic core in `../mcp-client.ts` (session lifecycle, tools/list,
// tools/call, fingerprint pins, SSRF guard) and adds only the connection-keyed orchestration.
//
// It does NOT import the n8n|zapier-typed `../mcp-outcome.ts` wrapper — depending on that 2-value
// `McpProvider` union is exactly the special-casing this gateway exists to remove.

import type { McpAuth, McpToolFingerprint } from "../mcp-client.ts";

/** The closed effect vocabulary a tool may declare. Model-safe (never provider prose). */
export type CapabilityEffect = "read" | "create" | "update" | "send" | "delete";

/** A resolved connection, as the runner/intake need it. Secrets arrive already decrypted from
 *  the service-role RPC `get_mcp_connection_secret`; they never reach a model or a browser. */
export type GatewayConnection = {
  connectionId: string;
  tenantId: string;
  providerKey: string;
  serverUrl: string;
  auth: McpAuth;
  transport: string;
  grantedScopes: string[];
};

/** The sanitized, MODEL-SAFE view of one capability. Carries identity + effect shape only —
 *  never the provider's raw description or input schema (those stay inside mcp-client.ts). */
export type SafeCapability = {
  name: string;
  effects: CapabilityEffect[];
  app: string;
  actionType: string;
  /** Whether this connection has an approval pinned for this tool (an operator decision fact). */
  approved: boolean;
};

/** What the model may reason over about a connection. Counts + sanitized capabilities +
 *  operator-approved labels; nothing a provider wrote free-hand. */
export type CapabilitySummary = {
  connectionId: string;
  providerKey: string;
  /** A human label supplied by the operator/registry, NOT provider free-text. */
  label: string;
  toolCount: number;
  approvedCount: number;
  capabilities: SafeCapability[];
  /** Freshness: when the catalog was last observed, never presented as "verified now". */
  observedAt: string | null;
};

/** Read-only intake result. Intake performs discovery only — never a mutating tools/call. */
export type IntakeResult = {
  ok: boolean;
  /** Maps to mcp_connections.health via the probe RPC. */
  health: "healthy" | "needs_attention" | "checking" | "unknown";
  status: "connected" | "error" | "pending_verification";
  tools: McpToolFingerprint[];
  /** A closed error code (never raw provider text). */
  errorCode: string | null;
};

/** Runner outcomes. `read_observed`/`prepared` never touch an external effect; `executed` is a
 *  real tools/call (Phase S proves it only against an in-process fake — never a live provider). */
export type RunnerOutcome =
  | "read_observed"
  | "prepared"
  | "executed"
  | "refused"
  | "provider_unavailable"
  | "outcome_unknown";

export type RunnerResult = {
  outcome: RunnerOutcome;
  runId: string;
  /** Refusal/why code — closed vocabulary, never provider prose. */
  code: string | null;
};
