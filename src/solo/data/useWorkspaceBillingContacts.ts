// useWorkspaceBillingContacts — Billing Foundation A: the Owner's read of this workspace's
// DESIGNATED billing contacts (primary billing contact · billing delegate) and the two acts that
// change them (owner rulings 2026-09-02, R18–R27). These are FUNCTIONAL billing designations: they
// never create, change, transfer, imply or record ownership, equity, or co-owner status.
//
// Three server seams, all auth.uid()-keyed, all Owner-only, all tenant-pinned by the strict
// resolver: get_workspace_billing_contacts(), platform_billing_contact_designate(user, kind),
// platform_billing_contact_revoke(id). Nothing here decides eligibility — the server (and its
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

/** Functional billing designations only — never an ownership record (R27). */
export type BillingContactDesignation = "primary_contact" | "delegate";

export interface WorkspaceBillingContact {
  id: string;
  userId: string;
  designation: BillingContactDesignation;
  role: string | null;
  displayName: string | null;
  emailVerified: boolean;
  /** primary_contact: still a verified, current Owner (eligibility, not ownership) · delegate: still a verified active Admin. */
  stillEligible: boolean;
  designatedAt: string;
  designatedBy: string | null;
}

export type BillingContactRefusal =
  | "no_active_workspace"
  | "billing_not_applicable"
  | "billing_workspace_owner_only"
  | "billing_contact_top_level_solo_only"
  | "billing_contact_not_member"
  | "billing_contact_primary_requires_owner"
  | "billing_contact_delegate_requires_admin"
  | "billing_contact_email_unverified"
  | "billing_contact_already_designated"
  | "billing_contact_not_found"
  | "billing_primary_contact_required_while_subscribed"
  | "billing_contact_bad_designation"
  | "billing_contact_bad_user"
  | "billing_contact_immutable"
  | "workspace_changed"
  | "network";

export type BillingContactActResult = { ok: true } | { ok: false; reason: BillingContactRefusal };

/** Owner-facing copy per refusal — what happened, never a guess about who is allowed. */
export const BILLING_CONTACT_REFUSAL_COPY: Record<BillingContactRefusal, string> = {
  no_active_workspace: "No workspace is selected.",
  billing_not_applicable: "Billing contacts are not applicable to this account type yet.",
  billing_workspace_owner_only: "Only a workspace owner can choose the billing contacts.",
  billing_contact_top_level_solo_only: "Billing contacts are not applicable to this account type yet.",
  billing_contact_not_member: "That person is not an active member of this workspace.",
  billing_contact_primary_requires_owner: "The primary billing contact must be a current workspace owner. This designation does not change who owns the workspace.",
  billing_contact_delegate_requires_admin: "A billing delegate must be a current Admin of this workspace.",
  billing_contact_email_unverified: "That person's email address is not verified yet, so billing notices cannot be sent to it.",
  billing_contact_already_designated: "That person already receives billing notices for this workspace.",
  billing_contact_not_found: "That designation no longer exists.",
  billing_primary_contact_required_while_subscribed: "A subscribed workspace must keep a primary billing contact. Designate another one first.",
  billing_contact_bad_designation: "That designation type is not recognised.",
  billing_contact_bad_user: "No person was selected.",
  billing_contact_immutable: "A designation cannot be changed, only revoked.",
  workspace_changed: "You switched workspaces while this was saving, so nothing was changed.",
  network: "Could not reach the platform. Try again.",
};

const KNOWN: ReadonlySet<string> = new Set(Object.keys(BILLING_CONTACT_REFUSAL_COPY));

/** Pure, tested: a PostgREST error carries the RAISE message; anything else is `network`. */
export function refusalFromError(error: unknown): BillingContactRefusal {
  const msg = String((error as { message?: string })?.message ?? "").trim();
  return msg && KNOWN.has(msg) ? (msg as BillingContactRefusal) : "network";
}

function asDesignation(v: unknown): BillingContactDesignation {
  return v === "primary_contact" ? "primary_contact" : "delegate";
}

function toContact(row: Record<string, unknown>): WorkspaceBillingContact | null {
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

export function useWorkspaceBillingContacts() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;
  const [loading, setLoading] = useState(true);
  const [refusal, setRefusal] = useState<BillingContactRefusal | null>(null);
  const [contacts, setContacts] = useState<WorkspaceBillingContact[] | null>(null);
  const [lastAct, setLastAct] = useState<BillingContactActResult | null>(null);

  const load = useCallback(async () => {
    const token = gate.current.begin();
    // Reset FIRST: another workspace's recipients must never be on screen for this one.
    setLoading(true);
    setRefusal(null);
    setContacts(null);
    setLastAct(null);
    if (tenantLoading) return;
    if (!activeTenantId) {
      if (!gate.current.isCurrent(token)) return;
      setRefusal("no_active_workspace");
      setLoading(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.rpc("get_workspace_billing_contacts" as any);
    if (!gate.current.isCurrent(token)) return; // a late answer for a workspace we have left
    if (error) {
      // A refusal is a state of its own (R8): "owner only" is never shown as "no recipients".
      setRefusal(refusalFromError(error));
      setLoading(false);
      return;
    }
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    setContacts(rows.map(toContact).filter((r): r is WorkspaceBillingContact => r !== null));
    setLoading(false);
  }, [activeTenantId, tenantLoading]);

  useEffect(() => {
    void load();
    const g = gate.current;
    return () => g.clear();
  }, [load]);

  const act = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<BillingContactActResult> => {
      const captured = tenantRef.current;
      // The act does NOT touch the read epoch: an act during an in-flight read must never orphan it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.rpc(fn as any, args as any);
      if (tenantRef.current !== captured) return { ok: false, reason: "workspace_changed" };
      const result: BillingContactActResult = error ? { ok: false, reason: refusalFromError(error) } : { ok: true };
      if (result.ok) await load(); // re-read the server's list; never patch it locally
      // The act's outcome belongs to the workspace it was made in; load() reset it, so set it after.
      if (tenantRef.current === captured) setLastAct(result);
      return result;
    },
    [load],
  );

  /** Owner act: designate a verified Owner as primary billing contact, or a current Admin as billing delegate. */
  const designate = useCallback(
    (userId: string, designation: BillingContactDesignation) =>
      act("platform_billing_contact_designate", { p_user_id: userId, p_designation: designation }),
    [act],
  );
  /** Owner act: revoke a live designation. */
  const revoke = useCallback(
    (recipientId: string) => act("platform_billing_contact_revoke", { p_contact_id: recipientId }),
    [act],
  );

  return { loading: loading || tenantLoading, refusal, contacts, lastAct, refresh: load, designate, revoke };
}
