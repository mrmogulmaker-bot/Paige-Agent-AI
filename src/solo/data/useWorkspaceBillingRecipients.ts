// useWorkspaceBillingRecipients — Billing Foundation A: the Owner's read of WHO receives this
// workspace's billing notices, and the two acts that change it (owner ruling 2026-09-02, R18–R26).
//
// Three server seams, all auth.uid()-keyed, all Owner-only, all tenant-pinned by the strict
// resolver: get_workspace_billing_recipients(), platform_billing_recipient_designate(user, kind),
// platform_billing_recipient_revoke(id). Nothing here decides eligibility — the server (and its
// trigger) does; this hook only carries the answer and the refusal copy. Nothing is rendered yet
// (Foundation C mounts it). No delivery exists anywhere in Foundation A.
//
// Tenant-switch discipline is the same as useWorkspaceBillingAuthority: every read is keyed on the
// active workspace, state resets on switch, late answers are dropped, and an act whose response
// lands after a switch is reported as workspace_changed and never reloads the other workspace.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "@/solo/settings-contract";

export type RecipientDesignation = "billing_owner" | "billing_delegate";

export interface WorkspaceBillingRecipient {
  id: string;
  userId: string;
  designation: RecipientDesignation;
  role: string | null;
  displayName: string | null;
  emailVerified: boolean;
  /** billing_owner: still a verified current Owner · delegate: still a verified active Admin. */
  stillEligible: boolean;
  designatedAt: string;
  designatedBy: string | null;
}

export type RecipientRefusal =
  | "no_active_workspace"
  | "billing_not_applicable"
  | "billing_owner_only"
  | "billing_recipient_top_level_solo_only"
  | "billing_recipient_not_member"
  | "billing_recipient_not_owner"
  | "billing_recipient_not_admin"
  | "billing_recipient_email_unverified"
  | "billing_recipient_already_designated"
  | "billing_recipient_not_found"
  | "billing_owner_required_while_subscribed"
  | "billing_recipient_bad_designation"
  | "billing_recipient_bad_user"
  | "billing_recipient_immutable"
  | "workspace_changed"
  | "network";

export type RecipientActResult = { ok: true } | { ok: false; reason: RecipientRefusal };

/** Owner-facing copy per refusal — what happened, never a guess about who is allowed. */
export const RECIPIENT_REFUSAL_COPY: Record<RecipientRefusal, string> = {
  no_active_workspace: "No workspace is selected.",
  billing_not_applicable: "Billing contacts are not applicable to this account type yet.",
  billing_owner_only: "Only the workspace owner can choose who receives billing notices.",
  billing_recipient_top_level_solo_only: "Billing contacts are not applicable to this account type yet.",
  billing_recipient_not_member: "That person is not an active member of this workspace.",
  billing_recipient_not_owner: "Only a workspace owner can be the billing owner.",
  billing_recipient_not_admin: "Only a current Admin can be a billing-notice delegate.",
  billing_recipient_email_unverified: "That person's email address is not verified yet, so billing notices cannot be sent to it.",
  billing_recipient_already_designated: "That person already receives billing notices for this workspace.",
  billing_recipient_not_found: "That designation no longer exists.",
  billing_owner_required_while_subscribed: "A subscribed workspace must keep at least one billing owner. Designate another owner first.",
  billing_recipient_bad_designation: "That designation type is not recognised.",
  billing_recipient_bad_user: "No person was selected.",
  billing_recipient_immutable: "A designation cannot be changed, only revoked.",
  workspace_changed: "You switched workspaces while this was saving, so nothing was changed.",
  network: "Could not reach the platform. Try again.",
};

const KNOWN: ReadonlySet<string> = new Set(Object.keys(RECIPIENT_REFUSAL_COPY));

/** Pure, tested: a PostgREST error carries the RAISE message; anything else is `network`. */
export function refusalFromError(error: unknown): RecipientRefusal {
  const msg = String((error as { message?: string })?.message ?? "").trim();
  return msg && KNOWN.has(msg) ? (msg as RecipientRefusal) : "network";
}

function asDesignation(v: unknown): RecipientDesignation {
  return v === "billing_owner" ? "billing_owner" : "billing_delegate";
}

function toRecipient(row: Record<string, unknown>): WorkspaceBillingRecipient | null {
  if (typeof row.id !== "string" || typeof row.user_id !== "string") return null;
  return {
    id: row.id,
    userId: row.user_id,
    designation: asDesignation(row.designation),
    role: typeof row.role === "string" ? row.role : null,
    displayName: typeof row.display_name === "string" && row.display_name ? row.display_name : null,
    emailVerified: row.email_verified === true,
    stillEligible: row.still_eligible === true,
    designatedAt: typeof row.designated_at === "string" ? row.designated_at : "",
    designatedBy: typeof row.designated_by === "string" ? row.designated_by : null,
  };
}

export function useWorkspaceBillingRecipients() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;
  const [loading, setLoading] = useState(true);
  const [refusal, setRefusal] = useState<RecipientRefusal | null>(null);
  const [recipients, setRecipients] = useState<WorkspaceBillingRecipient[] | null>(null);
  const [lastAct, setLastAct] = useState<RecipientActResult | null>(null);

  const load = useCallback(async () => {
    const token = gate.current.begin();
    // Reset FIRST: another workspace's recipients must never be on screen for this one.
    setLoading(true);
    setRefusal(null);
    setRecipients(null);
    setLastAct(null);
    if (tenantLoading) return;
    if (!activeTenantId) {
      if (!gate.current.isCurrent(token)) return;
      setRefusal("no_active_workspace");
      setLoading(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.rpc("get_workspace_billing_recipients" as any);
    if (!gate.current.isCurrent(token)) return; // a late answer for a workspace we have left
    if (error) {
      // A refusal is a state of its own (R8): "owner only" is never shown as "no recipients".
      setRefusal(refusalFromError(error));
      setLoading(false);
      return;
    }
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    setRecipients(rows.map(toRecipient).filter((r): r is WorkspaceBillingRecipient => r !== null));
    setLoading(false);
  }, [activeTenantId, tenantLoading]);

  useEffect(() => {
    void load();
    const g = gate.current;
    return () => g.clear();
  }, [load]);

  const act = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<RecipientActResult> => {
      const captured = tenantRef.current;
      const token = gate.current.begin();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.rpc(fn as any, args as any);
      if (!gate.current.isCurrent(token)) return { ok: false, reason: "workspace_changed" };
      const result: RecipientActResult = error ? { ok: false, reason: refusalFromError(error) } : { ok: true };
      if (result.ok) await load(); // re-read the server's list; never patch it locally
      // The act's outcome belongs to the workspace it was made in; load() reset it, so set it after.
      if (tenantRef.current === captured) setLastAct(result);
      return result;
    },
    [load],
  );

  /** Owner act: designate a verified Owner as billing owner, or a current Admin as delegate. */
  const designate = useCallback(
    (userId: string, designation: RecipientDesignation) =>
      act("platform_billing_recipient_designate", { p_user_id: userId, p_designation: designation }),
    [act],
  );
  /** Owner act: revoke a live designation. */
  const revoke = useCallback(
    (recipientId: string) => act("platform_billing_recipient_revoke", { p_recipient_id: recipientId }),
    [act],
  );

  return { loading: loading || tenantLoading, refusal, recipients, lastAct, refresh: load, designate, revoke };
}
