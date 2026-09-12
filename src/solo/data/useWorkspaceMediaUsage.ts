// useWorkspaceMediaUsage — the Solo-side read of "how much Vibe Media has THIS
// workspace used this month, what does its plan include, and what remains?"
//
// It reads ONE server-owned seam, get_workspace_media_usage() (auth.uid()-keyed,
// no argument, the workspace derived server-side — the useWorkspaceAiUsage
// precedent, line for line), and decides nothing. The allowance, the balance,
// the categories, and the notice inputs are all the server's answers.
//
// WHAT THIS IS NOT. It is not the meter — the ledger (paige_media_credit_entries)
// is the meter, and only the service-role RPCs move it. This hook only reads.
// It is also not an enforcement input: enforcement lives at the paige-media
// submit/approve boundary (hold-before-dispatch), not on a Billing screen.
//
// Tenant-switch discipline (#86): reset to `loading` on workspace change; drop
// a late answer for a workspace we have left.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "@/solo/settings-contract";

export type MediaUsageState = "ok" | "no_workspace" | "owner_only" | "not_applicable";

export interface WorkspaceMediaUsage {
  tenantId: string | null;
  usageState: MediaUsageState;
  month: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  allowanceMonthly: number | null;
  includedRemaining: number | null;
  purchasedRemaining: number | null;
  totalRemaining: number | null;
  holdsOpen: number | null;
  imageCredits: number | null;
  imageEditCredits: number | null;
  videoCredits: number | null;
  otherCredits: number | null;
  jobsMonth: number | null;
  spendEstimateUsd: number | null;
  spendActualUsd: number | null;
}

export const NO_WORKSPACE_MEDIA_USAGE: WorkspaceMediaUsage = {
  tenantId: null,
  usageState: "no_workspace",
  month: null, periodStart: null, periodEnd: null,
  allowanceMonthly: null, includedRemaining: null, purchasedRemaining: null,
  totalRemaining: null, holdsOpen: null,
  imageCredits: null, imageEditCredits: null, videoCredits: null, otherCredits: null,
  jobsMonth: null, spendEstimateUsd: null, spendActualUsd: null,
};

function asText(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function asCount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function asState(v: unknown): MediaUsageState {
  return v === "ok" || v === "owner_only" || v === "not_applicable" ? v : "no_workspace";
}

/** Pure, tested: the RPC row → the shape the surface consumes. */
export function readMediaUsageRow(row: Record<string, unknown> | null): WorkspaceMediaUsage | null {
  if (!row) return null;
  const usageState = asState(row.usage_state);
  const ok = usageState === "ok";
  return {
    tenantId: asText(row.tenant_id),
    usageState,
    month: ok ? asText(row.month) : null,
    periodStart: ok ? asText(row.period_start) : null,
    periodEnd: ok ? asText(row.period_end) : null,
    allowanceMonthly: ok ? asCount(row.allowance_monthly) : null,
    includedRemaining: ok ? asCount(row.included_remaining) : null,
    purchasedRemaining: ok ? asCount(row.purchased_remaining) : null,
    totalRemaining: ok ? asCount(row.total_remaining) : null,
    holdsOpen: ok ? asCount(row.holds_open) : null,
    imageCredits: ok ? asCount(row.image_credits) : null,
    imageEditCredits: ok ? asCount(row.image_edit_credits) : null,
    videoCredits: ok ? asCount(row.video_credits) : null,
    otherCredits: ok ? asCount(row.other_credits) : null,
    jobsMonth: ok ? asCount(row.jobs_month) : null,
    spendEstimateUsd: ok ? asCount(row.spend_estimate_usd) : null,
    spendActualUsd: ok ? asCount(row.spend_actual_usd) : null,
  };
}

export function useWorkspaceMediaUsage() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<WorkspaceMediaUsage | null>(null);

  const load = useCallback(async () => {
    const token = gate.current.begin();
    setLoading(true);
    setError(null);
    setUsage(null);
    if (tenantLoading) return;
    if (!activeTenantId) {
      if (!gate.current.isCurrent(token)) return;
      setUsage(NO_WORKSPACE_MEDIA_USAGE);
      setLoading(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: rpcErr } = await supabase.rpc("get_workspace_media_usage" as any);
    if (!gate.current.isCurrent(token)) return;
    if (rpcErr) {
      setError("Your workspace's Vibe Media usage could not be read.");
      setLoading(false);
      return;
    }
    const parsed = readMediaUsageRow((Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null);
    if (!parsed) {
      setError("Your workspace's Vibe Media usage could not be read.");
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
