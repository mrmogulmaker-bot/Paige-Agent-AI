// useWorkspaceBillingAuthority — Billing Foundation A: the Solo-side read of "may THIS person
// manage platform billing for THIS workspace, and is the workspace's billing account mapped?"
//
// It reads ONE server-owned seam, get_workspace_billing_authority() (auth.uid()-keyed, strict
// resolver, never a Stripe id), and exposes ONE act, openPortal(), which calls the
// platform-billing-portal function and opens the returned URL exactly once — and ONLY if the
// response names the workspace the click was made in (design v2 C9). Nothing here decides
// access; the server does. Nothing here is rendered yet (Foundation C mounts it).
//
// Tenant-switch discipline (the #86 / useMcpCapabilities lesson): every read is keyed on the
// active workspace, state resets to `loading` the instant it changes, and a response for a
// previous workspace is dropped by the request gate — so a prior workspace's authority never
// paints under the next one.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "@/solo/settings-contract";

export type BillingScope = "none" | "sub_account" | "agency" | "enterprise" | "top_level_solo";
export type BillingAccountState = "not_applicable" | "mapped" | "ambiguous" | "absent";
/** R19: whether a verified, current Owner is designated as the workspace's billing owner. */
export type BillingContactState = "not_applicable" | "none" | "designated" | "designated_needs_attention";

export interface WorkspaceBillingAuthority {
  tenantId: string | null;
  scope: BillingScope;
  role: string | null;
  canManageBilling: boolean;
  billingAccountState: BillingAccountState;
  /** R22: separate from manage on purpose. Owner-only in Foundation A. */
  canViewBilling: boolean;
  /** R22: this person holds a live billing-notice designation here. Confers nothing else. */
  receivesBillingNotices: boolean;
  billingContactState: BillingContactState;
  /** R19: a paid plan may not activate for this workspace until this is true. */
  paidActivationReady: boolean;
}

export const NO_WORKSPACE_AUTHORITY: WorkspaceBillingAuthority = {
  tenantId: null,
  scope: "none",
  role: null,
  canManageBilling: false,
  billingAccountState: "not_applicable",
  canViewBilling: false,
  receivesBillingNotices: false,
  billingContactState: "not_applicable",
  paidActivationReady: false,
};

export type PortalRefusal =
  | "not_enabled"
  | "no_active_workspace"
  | "not_applicable_scope"
  | "owner_only"
  | "billing_account_absent"
  | "billing_account_ambiguous"
  | "billing_account_unresolvable"
  | "needs_config"
  | "audit_failed"
  | "authority_unreadable"
  | "workspace_changed"
  | "network";

export type PortalResult = { ok: true } | { ok: false; reason: PortalRefusal };

/** Owner-facing copy per refusal. Facts about what happened, never a guess about the account. */
export const PORTAL_REFUSAL_COPY: Record<PortalRefusal, string> = {
  not_enabled: "Managing billing from here is not switched on yet.",
  no_active_workspace: "No workspace is selected, so there is no billing account to open.",
  not_applicable_scope: "Platform billing is not applicable to this account type yet.",
  owner_only: "Billing is managed by the workspace owner. Ask them, or ask PAIGE to send the request.",
  billing_account_absent: "This workspace has no billing account linked yet. Nothing about your access has changed.",
  billing_account_ambiguous: "This workspace's billing records need a platform review before the portal can open. Nothing about your access has changed.",
  billing_account_unresolvable: "The billing provider could not open this workspace's account. The platform has been notified.",
  needs_config: "Billing is not configured for this workspace on the platform side yet.",
  audit_failed: "The platform could not record this request, so the portal was not opened. Try again.",
  authority_unreadable: "Your billing permissions could not be read just now. Try again.",
  workspace_changed: "You switched workspaces while the portal was opening, so it was not opened.",
  network: "Could not reach the platform. Try again.",
};

const KNOWN: ReadonlySet<string> = new Set(Object.keys(PORTAL_REFUSAL_COPY));

function asScope(v: unknown): BillingScope {
  return v === "sub_account" || v === "agency" || v === "enterprise" || v === "top_level_solo" ? v : "none";
}
function asState(v: unknown): BillingAccountState {
  return v === "mapped" || v === "ambiguous" || v === "absent" ? v : "not_applicable";
}
function asContact(v: unknown): BillingContactState {
  return v === "none" || v === "designated" || v === "designated_needs_attention" ? v : "not_applicable";
}

/** Pure, tested: turn the function's response into a decision the hook can act on. */
export function decidePortalOpen(
  capturedTenantId: string | null,
  response: { data: unknown; error: unknown },
): { open: string } | { refuse: PortalRefusal } {
  if (response.error) {
    const msg = String((response.error as { message?: string })?.message ?? "");
    const code = msg && KNOWN.has(msg) ? (msg as PortalRefusal) : null;
    return { refuse: code ?? "network" };
  }
  const data = (response.data ?? {}) as { url?: unknown; tenant_id?: unknown; error?: unknown };
  if (typeof data.error === "string") return { refuse: KNOWN.has(data.error) ? (data.error as PortalRefusal) : "network" };
  if (typeof data.url !== "string" || typeof data.tenant_id !== "string") return { refuse: "network" };
  if (!capturedTenantId || data.tenant_id !== capturedTenantId) return { refuse: "workspace_changed" };
  return { open: data.url };
}

export function useWorkspaceBillingAuthority() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authority, setAuthority] = useState<WorkspaceBillingAuthority | null>(null);
  const [lastPortal, setLastPortal] = useState<PortalResult | null>(null);

  const load = useCallback(async () => {
    const token = gate.current.begin();
    // Reset FIRST: the previous workspace's answer must never be on screen for the next one.
    setLoading(true);
    setError(null);
    setAuthority(null);
    setLastPortal(null);
    if (tenantLoading) return;
    if (!activeTenantId) {
      if (!gate.current.isCurrent(token)) return;
      setAuthority(NO_WORKSPACE_AUTHORITY);
      setLoading(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: rpcErr } = await supabase.rpc("get_workspace_billing_authority" as any);
    if (!gate.current.isCurrent(token)) return; // a late answer for a workspace we have left
    if (rpcErr) {
      setError("Your billing permissions could not be read.");
      setLoading(false);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) {
      setError("Your billing permissions could not be read.");
      setLoading(false);
      return;
    }
    setAuthority({
      tenantId: typeof row.tenant_id === "string" ? row.tenant_id : null,
      scope: asScope(row.scope),
      role: typeof row.role === "string" ? row.role : null,
      canManageBilling: row.can_manage_billing === true,
      billingAccountState: asState(row.billing_account_state),
      canViewBilling: row.can_view_billing === true,
      receivesBillingNotices: row.receives_billing_notices === true,
      billingContactState: asContact(row.billing_contact_state),
      paidActivationReady: row.paid_activation_ready === true,
    });
    setLoading(false);
  }, [activeTenantId, tenantLoading]);

  useEffect(() => {
    void load();
    const g = gate.current;
    return () => g.clear();
  }, [load]);

  /** Opens the hosted portal for the workspace the click was made in, or explains why not. */
  const openPortal = useCallback(async (): Promise<PortalResult> => {
    const captured = activeTenantId;
    const token = gate.current.begin();
    // No body: the server derives the workspace and the actor from the token alone.
    const response = await supabase.functions.invoke("platform-billing-portal");
    const decision = decidePortalOpen(captured, response);
    // A response that arrives after the workspace changed is discarded, whatever it says.
    const result: PortalResult = !gate.current.isCurrent(token)
      ? { ok: false, reason: "workspace_changed" }
      : "open" in decision
        ? { ok: true }
        : { ok: false, reason: decision.refuse };
    if (result.ok && "open" in decision) {
      window.open(decision.open, "_blank", "noopener");
    }
    if (gate.current.isCurrent(token)) setLastPortal(result);
    return result;
  }, [activeTenantId]);

  return { loading: loading || tenantLoading, error, authority, lastPortal, refresh: load, openPortal };
}
