/**
 * useSoloProposals — the "She proposed today" rail adapter (solo Paige › Chat rail).
 *
 * A THIN wrapper of the SAME production seam useCommandCenter composes —
 * `usePendingApprovals({ scope: "all" })` (the RLS-tenant-scoped
 * `paige_approval_queue_v`) — reshaped into the exact fields the chat rail already
 * renders from `DATA.approvals` ({ id, title, conf } + an Approve affordance), so the
 * rewire is a DROP-IN and the owner-locked design is untouched (§28).
 *
 * §9 / §51 TENANT ISOLATION: passes NO tenant_id — `usePendingApprovals` derives scope
 * from the session (its `activeTenantId` + the view's security_invoker RLS), so a
 * sub-account only ever sees its OWN proposals. Do not re-widen.
 *
 * §13 / §31 HONESTY: `conf` (the fixture's confidence percent) has NO real backend —
 * `paige_pending_approvals` stores no confidence/score (verified: zero metadata keys
 * across the table). So `conf` is Preview: this adapter returns `null`, never a
 * fabricated number. The rewire keeps the rail element but renders null honestly
 * (drop the "%", not invent a value).
 *
 * The approve/decline seams are the SAME server-gated paths ApprovalRow ships and
 * useCommandCenter reuses (§10 callable seam): the `execute-approval` edge function
 * approves-and-acts; decline is the RLS-protected reject UPDATE.
 */
import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";

/** One proposal reshaped into the chat rail's `DATA.approvals` shape (exact keys). */
export interface SoloProposal {
  id: string;
  title: string;
  /** Confidence percent — Preview (no backend); always null, never fabricated (§13). */
  conf: number | null;
}

export interface SoloProposalsData {
  /** Newest proposals awaiting the owner — drop-in for `DATA.approvals` (rail slices .slice(0,3)). */
  proposals: SoloProposal[];
  loading: boolean;
  /** True only when there is genuinely nothing proposed. */
  empty: boolean;
  /** Approve AND act — the shared `execute-approval` seam (§10). */
  approve: (id: string) => Promise<{ ok: boolean; error?: string }>;
  /** Reject-with-reason — the same RLS-protected UPDATE ApprovalRow ships. */
  decline: (id: string) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => void;
}

/** "email_draft" / "cs-draft" → "Email draft". Null → "Paige". */
function humanize(raw: string | null | undefined): string {
  if (!raw) return "Paige";
  const s = raw.replace(/[_-]+/g, " ").trim();
  if (!s) return "Paige";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function useSoloProposals(): SoloProposalsData {
  const { items, loading, refresh: refreshApprovals } = usePendingApprovals({ scope: "all" });

  const proposals = useMemo<SoloProposal[]>(
    () =>
      items.map((r) => {
        const draft = (r.draft_content ?? {}) as Record<string, unknown>;
        const draftSubject = typeof draft.subject === "string" ? draft.subject : "";
        return {
          id: r.id,
          title: r.summary || draftSubject || humanize(r.category),
          // §13: confidence has no real source — Preview, never invented.
          conf: null,
        };
      }),
    [items],
  );

  const refresh = useCallback(() => {
    void refreshApprovals();
  }, [refreshApprovals]);

  const approve = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const { data, error } = await supabase.functions.invoke("execute-approval", {
        body: { approval_id: id },
      });
      const res = data as { ok?: boolean; error?: string } | null;
      if (error || res?.ok === false) {
        return {
          ok: false,
          error: error?.message ?? res?.error ?? "Couldn't complete that action.",
        };
      }
      refresh();
      return { ok: true };
    },
    [refresh],
  );

  const decline = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const { error } = await supabase
        .from("paige_pending_approvals")
        .update({
          status: "rejected",
          decision_rationale: "Dismissed from the chat rail",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) return { ok: false, error: error.message };
      refresh();
      return { ok: true };
    },
    [refresh],
  );

  const empty = !loading && proposals.length === 0;

  return { proposals, loading, empty, approve, decline, refresh };
}
