// useWorkspaceBillingStatus — the Billing Experience rebuild's ONE read (owner brief 2026-09-03):
// what this workspace RECEIVES from the PAIGE Platform, what is included, who handles billing,
// and what is owed. Wraps get_workspace_billing_status() (Slice A 20261109040000, corrected in
// Slice B 20261111050000 and Slice C 20261120000000).
//
// Same tenant-switch discipline as useWorkspaceBillingAuthority (the #86 lesson): every read is
// keyed on the active workspace, resets to `loading` the instant it changes, and a response for a
// previous workspace is dropped by the request gate.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "@/solo/settings-contract";

export type BillingStatusScope = "none" | "sub_account" | "agency" | "enterprise" | "top_level";
export type BillingAccessState =
  | "promotional" | "trial" | "paid" | "past_due" | "internal" | "no_plan" | "unknown";
export type BillingProviderState = "not_created" | "mapped" | "ambiguous";

export interface WorkspaceBillingStatus {
  tenantId: string | null;
  workspaceName: string | null;
  scope: BillingStatusScope;
  canView: boolean;
  canManage: boolean;
  accessState: BillingAccessState;
  revenueClass: string | null;
  planSlug: string | null;
  planName: string | null;
  amountDueCents: number | null;
  paymentMethodRequired: boolean;
  billedBy: string | null;
  providerState: BillingProviderState | null;
  paymentMethodConnected: boolean;
  seatsIncluded: number | null;
  seatsUsed: number | null;
  contactsIncluded: number | null;
  contactsUsed: number | null;
  smsIncluded: number | null;
  smsUsed: number | null;
  aiTokensIncluded: number | null;
  aiCreditTokenRatio: number | null;
  paidAddonsCount: number | null;
  primaryContactCount: number | null;
  delegateCount: number | null;
  primarySelectionNeeded: boolean;
  noticeDeliveryState: string | null;
  trialEndsAt: string | null;
}

export const NO_WORKSPACE_STATUS: WorkspaceBillingStatus = {
  tenantId: null, workspaceName: null, scope: "none", canView: false, canManage: false,
  accessState: "unknown", revenueClass: null, planSlug: null, planName: null,
  amountDueCents: null, paymentMethodRequired: false, billedBy: null, providerState: null,
  paymentMethodConnected: false,
  seatsIncluded: null, seatsUsed: null, contactsIncluded: null, contactsUsed: null,
  smsIncluded: null, smsUsed: null, aiTokensIncluded: null, aiCreditTokenRatio: null,
  paidAddonsCount: null, primaryContactCount: null, delegateCount: null,
  primarySelectionNeeded: false, noticeDeliveryState: null, trialEndsAt: null,
};

function asScope(v: unknown): BillingStatusScope {
  return v === "sub_account" || v === "agency" || v === "enterprise" || v === "top_level" ? v : "none";
}
function asAccessState(v: unknown): BillingAccessState {
  return v === "promotional" || v === "trial" || v === "paid" || v === "past_due"
    || v === "internal" || v === "no_plan" ? v : "unknown";
}
function asProviderState(v: unknown): BillingProviderState | null {
  return v === "not_created" || v === "mapped" || v === "ambiguous" ? v : null;
}
function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Pure, tested: turn the RPC's row into the typed status the screen consumes. */
export function parseWorkspaceBillingStatusRow(row: Record<string, unknown>): WorkspaceBillingStatus {
  return {
    tenantId: str(row.tenant_id),
    workspaceName: str(row.workspace_name),
    scope: asScope(row.scope),
    canView: row.can_view === true,
    canManage: row.can_manage === true,
    accessState: asAccessState(row.access_state),
    revenueClass: str(row.revenue_class),
    planSlug: str(row.plan_slug),
    planName: str(row.plan_name),
    amountDueCents: num(row.amount_due_cents),
    paymentMethodRequired: row.payment_method_required === true,
    billedBy: str(row.billed_by),
    providerState: asProviderState(row.provider_state),
    paymentMethodConnected: row.payment_method_connected === true,
    seatsIncluded: num(row.seats_included),
    seatsUsed: num(row.seats_used),
    contactsIncluded: num(row.contacts_included),
    contactsUsed: num(row.contacts_used),
    smsIncluded: num(row.sms_included),
    smsUsed: num(row.sms_used),
    aiTokensIncluded: num(row.ai_tokens_included),
    aiCreditTokenRatio: num(row.ai_credit_token_ratio),
    paidAddonsCount: num(row.paid_addons_count),
    primaryContactCount: num(row.primary_contact_count),
    delegateCount: num(row.delegate_count),
    primarySelectionNeeded: row.primary_selection_needed === true,
    noticeDeliveryState: str(row.notice_delivery_state),
    trialEndsAt: str(row.trial_ends_at),
  };
}

export function useWorkspaceBillingStatus() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const requestTenant = useRef<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkspaceBillingStatus | null>(null);

  const load = useCallback(async () => {
    const token = gate.current.begin();
    requestTenant.current = activeTenantId;
    setLoading(true);
    setError(null);
    setStatus(null);
    if (tenantLoading) return;
    if (!activeTenantId) {
      if (!gate.current.isCurrent(token)) return;
      setStatus(NO_WORKSPACE_STATUS);
      setLoading(false);
      return;
    }
    let response;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = await supabase.rpc("get_workspace_billing_status" as any);
    } catch {
      if (gate.current.isCurrent(token)) {
        setError("This workspace's billing status could not be read.");
        setLoading(false);
      }
      return;
    }
    const { data, error: rpcErr } = response;
    if (!gate.current.isCurrent(token)) return; // a late answer for a workspace we have left
    if (rpcErr) {
      setError("This workspace's billing status could not be read.");
      setLoading(false);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row || row.tenant_id !== activeTenantId) {
      setError("This workspace's billing status could not be read.");
      setLoading(false);
      return;
    }
    setStatus(parseWorkspaceBillingStatusRow(row));
    setLoading(false);
  }, [activeTenantId, tenantLoading]);

  useEffect(() => {
    void load();
    const g = gate.current;
    return () => g.clear();
  }, [load]);

  const visibleStatus = status?.tenantId && status.tenantId !== activeTenantId ? null : status;
  const sameWorkspace = requestTenant.current === activeTenantId;
  return { loading: loading || tenantLoading || !sameWorkspace || (status !== null && visibleStatus === null), error: sameWorkspace ? error : null, status: visibleStatus, refresh: load };
}
