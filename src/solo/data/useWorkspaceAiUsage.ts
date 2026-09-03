// useWorkspaceAiUsage — the Solo-side read of "how much AI has THIS workspace used this period,
// and how much does its plan include?"
//
// It reads ONE server-owned seam, get_workspace_ai_usage() (auth.uid()-keyed, no argument, the
// workspace derived server-side), and decides nothing. Owner-only, sub-account applicability and
// the period boundary are all the server's answers, carried through unchanged.
//
// WHAT THIS IS NOT. It is not a meter. The meter is `platform_usage_events`, which already runs
// (`meter_llm_usage()` on an hourly schedule); this hook only reads what that meter recorded. It
// is also not an enforcement input: nothing here can throttle, degrade, or bill. Enforcement, if
// it ever exists, belongs at the action-bus policy clamp (§67), not on a Billing screen.
//
// Tenant-switch discipline is the same as useWorkspaceBillingAuthority's, for the same reason
// (the #86 lesson): reset to `loading` the instant the workspace changes, and drop a late answer
// for a workspace we have left. A usage TOTAL painting under the wrong workspace would be a
// factual claim about the wrong account, which is worse than a blank.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "@/solo/settings-contract";

/** Why the server declined to state a total. Each is a fact about the request, not about spend. */
export type AiUsageState = "ok" | "not_applicable" | "no_workspace" | "owner_only";
/** Which real record supplied the period. There is no third option and no invented default. */
export type AiUsagePeriodSource = "subscription" | "calendar_month";

export interface WorkspaceAiUsage {
  tenantId: string | null;
  scope: "none" | "sub_account" | "top_level";
  canView: boolean;
  usageState: AiUsageState;
  /** From its own explicit record. `null` means unclassified — never "therefore promotional" (R13). */
  revenueClass: string | null;
  referencePlanSlug: string | null;
  /** `null` when the plan defines no allowance (a custom quote). NEVER rendered as zero included. */
  includedAiTokensMonth: number | null;
  /** Tokens per credit, from the plan. `null` with the allowance, never independently. */
  aiCreditTokenRatio: number | null;
  periodSource: AiUsagePeriodSource | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** `null` on every non-`ok` state. A refusal is not zero usage. */
  tokensUsed: number | null;
  eventsCounted: number | null;
  usageLastRecordedAt: string | null;
}

export const NO_WORKSPACE_AI_USAGE: WorkspaceAiUsage = {
  tenantId: null,
  scope: "none",
  canView: false,
  usageState: "no_workspace",
  revenueClass: null,
  referencePlanSlug: null,
  includedAiTokensMonth: null,
  aiCreditTokenRatio: null,
  periodSource: null,
  periodStart: null,
  periodEnd: null,
  tokensUsed: null,
  eventsCounted: null,
  usageLastRecordedAt: null,
};

function asUsageState(v: unknown): AiUsageState {
  return v === "ok" || v === "not_applicable" || v === "owner_only" ? v : "no_workspace";
}
function asPeriodSource(v: unknown): AiUsagePeriodSource | null {
  return v === "subscription" || v === "calendar_month" ? v : null;
}
function asScope(v: unknown): WorkspaceAiUsage["scope"] {
  return v === "sub_account" || v === "top_level" ? v : "none";
}
/**
 * A count is carried through ONLY when it is a real, finite number. Postgres returns `bigint` as a
 * STRING over PostgREST, so a naive `typeof === "number"` check would drop every total it was
 * written to read; and a non-numeric string must become `null` rather than `NaN`, because `NaN`
 * formats as "NaN tokens" on a screen about money.
 */
export function asCount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function asText(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** Pure, tested: the RPC row → the shape the surface consumes. */
export function readAiUsageRow(row: Record<string, unknown> | null): WorkspaceAiUsage | null {
  if (!row) return null;
  const usageState = asUsageState(row.usage_state);
  return {
    tenantId: asText(row.tenant_id),
    scope: asScope(row.scope),
    canView: row.can_view === true,
    usageState,
    revenueClass: asText(row.revenue_class),
    referencePlanSlug: asText(row.reference_plan_slug),
    includedAiTokensMonth: asCount(row.included_ai_tokens_month),
    aiCreditTokenRatio: asCount(row.ai_credit_token_ratio),
    periodSource: asPeriodSource(row.period_source),
    periodStart: asText(row.period_start),
    periodEnd: asText(row.period_end),
    // The server already returns NULL on every refusal; this re-states it locally so a future
    // server change cannot quietly turn a refusal into a "0 tokens used" claim on screen.
    tokensUsed: usageState === "ok" ? asCount(row.tokens_used) : null,
    eventsCounted: usageState === "ok" ? asCount(row.events_counted) : null,
    usageLastRecordedAt: asText(row.usage_last_recorded_at),
  };
}

export function useWorkspaceAiUsage() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<WorkspaceAiUsage | null>(null);

  const load = useCallback(async () => {
    const token = gate.current.begin();
    setLoading(true);
    setError(null);
    setUsage(null);
    if (tenantLoading) return;
    if (!activeTenantId) {
      if (!gate.current.isCurrent(token)) return;
      setUsage(NO_WORKSPACE_AI_USAGE);
      setLoading(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: rpcErr } = await supabase.rpc("get_workspace_ai_usage" as any);
    if (!gate.current.isCurrent(token)) return; // a late answer for a workspace we have left
    if (rpcErr) {
      setError("Your workspace's AI usage could not be read.");
      setLoading(false);
      return;
    }
    const parsed = readAiUsageRow((Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null);
    if (!parsed) {
      setError("Your workspace's AI usage could not be read.");
      setLoading(false);
      return;
    }
    setUsage(parsed);
    setLoading(false);
  }, [activeTenantId, tenantLoading]);

  useEffect(() => {
    void load();
    const g = gate.current;
    return () => g.clear();
  }, [load]);

  return { loading, error, usage, reload: load };
}
