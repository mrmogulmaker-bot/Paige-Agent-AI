// _shared/systems-check-runners/_business-context-readiness.ts — the ONE way any Systems Check
// runner reads business-context status (§18). Wraps public.get_business_context_readiness, the
// Spine-owned contract Setup, Systems Check, and PAIGE all now share, so this fix lands in exactly
// one place rather than being re-derived per runner.
//
// The service-role admin client has no JWT identity, so the RPC's service-role path is used
// deliberately: it honors the explicit _tenant_id argument only because auth.uid() is null for this
// caller (§59) — the same trusted-service-role convention every other runner already follows for its
// own direct table reads.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { throwOnDbError } from "./_kit.ts";

export type BusinessContextFieldStatus =
  | "owner_confirmed"
  | "connection_sourced"
  | "needs_confirmation"
  | "invalid_format"
  | "unavailable";

export type BusinessContextField = "website" | "business_phone" | "industry" | "primary_business_email";

export type BusinessContextReadiness = Record<BusinessContextField, {
  status: BusinessContextFieldStatus;
  source: string | null;
  as_of: string | null;
  reason: string | null;
}>;

/** True only for the one state that means "Setup has a confirmed value for this field". */
export function isConfirmed(status: BusinessContextFieldStatus): boolean {
  return status === "owner_confirmed";
}

const ALL_FIELDS: BusinessContextField[] = ["website", "business_phone", "industry", "primary_business_email"];

/** Every runner's ctx.tenantId is typed `string | null` (the core guards a null tenantId before
 *  dispatch, but the type doesn't know that). A null here would only mean the guard was somehow
 *  bypassed — so it degrades exactly like the SQL function's own "workspace not resolved" path,
 *  never a thrown error, and never a call to the RPC with a tenant it doesn't have (§13). */
export async function readBusinessContextReadiness(
  admin: SupabaseClient,
  tenantId: string | null,
): Promise<BusinessContextReadiness> {
  if (!tenantId) {
    const out = {} as BusinessContextReadiness;
    for (const f of ALL_FIELDS) out[f] = { status: "unavailable", source: null, as_of: null, reason: "workspace not resolved" };
    return out;
  }
  const { data, error } = await admin.rpc("get_business_context_readiness", { _tenant_id: tenantId });
  throwOnDbError(error, "get_business_context_readiness");
  const rows = (data ?? []) as Array<{
    field_key: BusinessContextField;
    status: BusinessContextFieldStatus;
    source: string | null;
    as_of: string | null;
    reason: string | null;
  }>;
  const out = {} as BusinessContextReadiness;
  for (const r of rows) out[r.field_key] = { status: r.status, source: r.source, as_of: r.as_of, reason: r.reason };
  return out;
}
