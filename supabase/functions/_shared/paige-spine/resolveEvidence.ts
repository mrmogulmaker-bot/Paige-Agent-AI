import type { SpineCapability, SpineFact, SpineSignal } from "./contracts.ts";
import { getSpineCapability } from "./registry.ts";

export type SpineEvidenceRpcClient = {
  rpc: (functionName: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};
export type SpineRequestScope = { isCurrent: () => boolean };
export type SpineEvidenceResult =
  | { readonly status: "available"; readonly signals: readonly SpineSignal[] }
  | { readonly status: "unavailable"; readonly reason: "capability_unavailable" | "resolver_unavailable" | "subject_required" | "scope_changed"; readonly signals: readonly [] };

const KEYS = ["signal_id", "kind", "tenant_id", "subject_type", "subject_ref", "occurred_at", "recorded_at", "source_system", "source_record_ref", "source_actor_type", "availability", "classification", "lifecycle", "safe_summary", "facts", "audience", "schema_version", "expires_at", "outcome_ref"] as const;
const KEY_SET = new Set<string>(KEYS);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function safeFacts(value: unknown, allowed: Readonly<Record<string, readonly SpineFact[]>>): SpineSignal["facts"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(allowed);
  if (Object.keys(input).length !== keys.length || Object.keys(input).some((key) => !(key in allowed))) return null;
  for (const key of keys) {
    const item = input[key];
    if (item !== null && !["boolean", "number", "string"].includes(typeof item)) return null;
    if (!allowed[key].some((candidate) => Object.is(candidate, item))) return null;
  }
  return input as SpineSignal["facts"];
}

function safeSignal(row: unknown, capability: SpineCapability, clientRef: string): SpineSignal | null {
  if (!row || typeof row !== "object" || Array.isArray(row) || !capability.evidence) return null;
  const input = row as Record<string, unknown>;
  const evidence = capability.evidence;
  if (Object.keys(input).length !== KEYS.length || Object.keys(input).some((key) => !KEY_SET.has(key))) return null;
  const facts = safeFacts(input.facts, evidence.factValues);
  const occurred = Date.parse(input.occurred_at as string);
  const recorded = Date.parse(input.recorded_at as string);
  const expires = Date.parse(input.expires_at as string);
  if (!facts || !nonempty(input.signal_id) || !UUID.test(input.signal_id) || !nonempty(input.tenant_id) || !UUID.test(input.tenant_id) ||
      !nonempty(input.kind) || !evidence.signalKinds.includes(input.kind) || input.subject_type !== "client" ||
      !nonempty(input.subject_ref) || input.subject_ref.toUpperCase() !== clientRef.toUpperCase() ||
      !Number.isFinite(occurred) || !Number.isFinite(recorded) || !Number.isFinite(expires) || recorded < occurred || expires <= occurred ||
      input.source_system !== evidence.sourceSystem || input.source_record_ref !== `${evidence.referencePrefix}${input.signal_id}` ||
      !evidence.sourceActorTypes.includes(input.source_actor_type as string) || !["available", "stale"].includes(input.availability as string) ||
      input.classification !== evidence.classification || input.lifecycle !== evidence.lifecycle || input.safe_summary !== evidence.safeSummary ||
      input.audience !== evidence.audience || !Number.isInteger(input.schema_version) || (input.schema_version as number) < 1 ||
      input.outcome_ref !== input.source_record_ref) return null;
  return { ...input, facts } as SpineSignal;
}

function scopeChanged(scope: SpineRequestScope | undefined): boolean {
  if (!scope) return true;
  try { return !scope.isCurrent(); } catch { return true; }
}

export async function resolveSpineEvidence(
  client: SpineEvidenceRpcClient,
  capabilityKey: string,
  input: { readonly clientRef: string; readonly limit?: number; readonly scope: SpineRequestScope },
): Promise<SpineEvidenceResult> {
  const capability = getSpineCapability(capabilityKey);
  if (!capability?.evidence) return { status: "unavailable", reason: "capability_unavailable", signals: [] };
  const clientRef = input.clientRef.trim();
  if (!clientRef) return { status: "unavailable", reason: "subject_required", signals: [] };
  if (scopeChanged(input.scope)) return { status: "unavailable", reason: "scope_changed", signals: [] };
  try {
    const { data, error } = await client.rpc(capability.evidence.adapter.replace(/^public\./, ""), {
      p_client_ref: clientRef,
      p_limit: Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50))),
    });
    if (scopeChanged(input.scope)) return { status: "unavailable", reason: "scope_changed", signals: [] };
    if (error || !Array.isArray(data)) return { status: "unavailable", reason: "resolver_unavailable", signals: [] };
    const signals = data.map((row) => safeSignal(row, capability, clientRef));
    if (signals.some((signal) => signal === null)) return { status: "unavailable", reason: "resolver_unavailable", signals: [] };
    if (new Set(signals.map((signal) => signal?.tenant_id)).size > 1) return { status: "unavailable", reason: "resolver_unavailable", signals: [] };
    return { status: "available", signals: signals as SpineSignal[] };
  } catch {
    return { status: "unavailable", reason: "resolver_unavailable", signals: [] };
  }
}
