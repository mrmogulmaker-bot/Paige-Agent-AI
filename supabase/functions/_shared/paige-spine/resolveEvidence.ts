import type { SpineCapability, SpineSignal } from "./contracts.ts";
import { getSpineCapability } from "./registry.ts";

export type SpineEvidenceRpcClient = {
  rpc: (functionName: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type SpineRequestScope = {
  /** Opaque caller-owned generation check. No tenant identifier is sent to the server. */
  isCurrent: () => boolean;
};

export type SpineEvidenceResult =
  | { readonly status: "available"; readonly signals: readonly SpineSignal[] }
  | { readonly status: "unavailable"; readonly reason: "capability_unavailable" | "resolver_unavailable" | "subject_required" | "scope_changed"; readonly signals: readonly [] };

const SAFE_SIGNAL_KEYS = [
  "signal_id", "kind", "tenant_id", "subject_type", "subject_ref", "occurred_at",
  "recorded_at", "source_system", "source_record_ref", "source_actor_type",
  "availability", "classification", "lifecycle", "safe_summary", "facts",
  "audience", "schema_version", "expires_at", "outcome_ref",
] as const;
const SAFE_SIGNAL_KEY_SET = new Set<string>(SAFE_SIGNAL_KEYS);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function safeFacts(value: unknown, factKeys: readonly string[]): SpineSignal["facts"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const allowed = new Set(factKeys);
  if (Object.keys(input).some((key) => !allowed.has(key))) return null;
  for (const item of Object.values(input)) {
    if (item !== null && !["boolean", "number", "string"].includes(typeof item)) return null;
  }
  return input as SpineSignal["facts"];
}

function safeSignal(row: unknown, capability: SpineCapability, clientRef: string): SpineSignal | null {
  if (!row || typeof row !== "object" || Array.isArray(row) || !capability.evidence) return null;
  const input = row as Record<string, unknown>;
  if (Object.keys(input).length !== SAFE_SIGNAL_KEYS.length || Object.keys(input).some((key) => !SAFE_SIGNAL_KEY_SET.has(key))) return null;
  const facts = safeFacts(input.facts, capability.evidence.factKeys);
  if (!facts || !nonempty(input.signal_id) || !UUID.test(input.signal_id) ||
      !nonempty(input.tenant_id) || !UUID.test(input.tenant_id) ||
      !nonempty(input.kind) || !capability.evidence.signalKinds.includes(input.kind) ||
      input.subject_type !== "client" || !nonempty(input.subject_ref) || input.subject_ref.toUpperCase() !== clientRef.toUpperCase() ||
      !nonempty(input.occurred_at) || !nonempty(input.recorded_at) || !nonempty(input.expires_at) ||
      !nonempty(input.source_system) || !nonempty(input.source_record_ref) || !nonempty(input.source_actor_type) ||
      !["available", "stale"].includes(input.availability as string) || !nonempty(input.classification) ||
      !nonempty(input.lifecycle) || !nonempty(input.safe_summary) || input.audience !== capability.evidence.audience ||
      !Number.isInteger(input.schema_version) || (input.schema_version as number) < 1 || !nonempty(input.outcome_ref)) return null;
  return { ...input, facts } as SpineSignal;
}

function scopeChanged(scope?: SpineRequestScope): boolean {
  try { return scope ? !scope.isCurrent() : false; } catch { return true; }
}

export async function resolveSpineEvidence(
  client: SpineEvidenceRpcClient,
  capabilityKey: string,
  input: { readonly clientRef: string; readonly limit?: number; readonly scope?: SpineRequestScope },
): Promise<SpineEvidenceResult> {
  const capability = getSpineCapability(capabilityKey);
  if (!capability?.evidence) return { status: "unavailable", reason: "capability_unavailable", signals: [] };
  const clientRef = input.clientRef.trim();
  if (!clientRef) return { status: "unavailable", reason: "subject_required", signals: [] };
  if (scopeChanged(input.scope)) return { status: "unavailable", reason: "scope_changed", signals: [] };
  const rpcName = capability.evidence.adapter.replace(/^public\./, "");
  try {
    const { data, error } = await client.rpc(rpcName, {
      p_client_ref: clientRef,
      p_limit: Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50))),
    });
    if (scopeChanged(input.scope)) return { status: "unavailable", reason: "scope_changed", signals: [] };
    if (error || !Array.isArray(data)) return { status: "unavailable", reason: "resolver_unavailable", signals: [] };
    const signals = data.map((row) => safeSignal(row, capability, clientRef));
    if (signals.some((signal) => signal === null)) return { status: "unavailable", reason: "resolver_unavailable", signals: [] };
    const tenantIds = new Set(signals.map((signal) => signal?.tenant_id));
    if (tenantIds.size > 1) return { status: "unavailable", reason: "resolver_unavailable", signals: [] };
    return { status: "available", signals: signals as SpineSignal[] };
  } catch {
    return { status: "unavailable", reason: "resolver_unavailable", signals: [] };
  }
}
