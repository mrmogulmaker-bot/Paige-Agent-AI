import type { SpineSignal } from "./contracts.ts";
import { getSpineCapability } from "./registry.ts";

export type SpineEvidenceRpcClient = {
  rpc: (functionName: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type SpineEvidenceResult =
  | { readonly status: "available"; readonly signals: readonly Partial<SpineSignal>[] }
  | { readonly status: "unavailable"; readonly reason: "capability_unavailable" | "resolver_unavailable" | "subject_required"; readonly signals: readonly [] };

const SAFE_SIGNAL_KEYS = [
  "signal_id", "kind", "tenant_id", "subject_type", "subject_ref", "occurred_at",
  "recorded_at", "source_system", "source_record_ref", "source_actor_type",
  "availability", "classification", "lifecycle", "safe_summary", "facts",
  "audience", "schema_version", "expires_at", "outcome_ref",
] as const;

function safeSignal(row: unknown): Partial<SpineSignal> | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const input = row as Record<string, unknown>;
  if (input.facts && (typeof input.facts !== "object" || Array.isArray(input.facts))) return null;
  const output: Record<string, unknown> = {};
  for (const key of SAFE_SIGNAL_KEYS) if (key in input) output[key] = input[key];
  return output as Partial<SpineSignal>;
}

export async function resolveSpineEvidence(
  client: SpineEvidenceRpcClient,
  capabilityKey: string,
  input: { readonly clientRef: string; readonly limit?: number },
): Promise<SpineEvidenceResult> {
  const capability = getSpineCapability(capabilityKey);
  if (!capability?.evidence) return { status: "unavailable", reason: "capability_unavailable", signals: [] };
  const clientRef = input.clientRef.trim();
  if (!clientRef) return { status: "unavailable", reason: "subject_required", signals: [] };
  const rpcName = capability.evidence.adapter.replace(/^public\./, "");
  try {
    const { data, error } = await client.rpc(rpcName, {
      p_client_ref: clientRef,
      p_limit: Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50))),
    });
    if (error || !Array.isArray(data)) return { status: "unavailable", reason: "resolver_unavailable", signals: [] };
    const signals = data.map(safeSignal).filter((signal): signal is Partial<SpineSignal> => signal !== null);
    return { status: "available", signals };
  } catch {
    return { status: "unavailable", reason: "resolver_unavailable", signals: [] };
  }
}
