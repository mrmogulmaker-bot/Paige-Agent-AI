// @ts-nocheck
// The Approvals workspace — the Command Center destination for "what needs my yes"
// (the owner's decision #20 order, position ⑤). The sidebar's Live desk shows a
// capped slice of the same queue; this is the full lane: every draft Paige's team
// produced, awaiting the owner's approve-and-send or decline-with-reason.
//
// §18 one home: the queue ROW is the proven ApprovalRow (approve acts via the
// execute-approval seam — email/SMS drafts actually send; decline demands a reason
// so Paige learns). This workspace only supplies the destination surface: states
// (loading / empty / populated / workspace-scoped), the scroll owner, and the
// per-workspace re-key contract every Command Center panel honors.
import React from "react";
import { Inbox } from "lucide-react";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { useTenantContext } from "@/hooks/useTenantContext";
import { ApprovalRow } from "@/components/paige/ApprovalRow";

export function SoloApprovalsWorkspace({ accountContext, openPaige, workspaceId }) {
  const { activeTenantId } = useTenantContext();
  // The hook is workspace-scoped internally; the panel remount (key=tenantId) plus the
  // hook's own scope guard mean a switched workspace never shows another's queue.
  const { items, loading, error, refresh } = usePendingApprovals();
  const scoped = !workspaceId || !activeTenantId || workspaceId === activeTenantId;

  return (
    <div
      role="region"
      aria-label="Approvals queue"
      style={{ height: "100%", overflow: "auto", padding: "clamp(14px, 2.2vw, 30px)" }}
    >
      <header style={{ marginBottom: 14 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 800, color: "var(--pg-ink)" }}>
          <Inbox size={15} color="var(--pg-gold)" aria-hidden="true" />
          Approvals
        </h2>
        <p style={{ fontSize: 11.5, color: "var(--pg-muted)", marginTop: 3 }}>
          Drafts Paige's team produced — nothing sends until you say yes. Approving sends; declining asks for a reason so Paige learns.
        </p>
      </header>

      {!scoped || loading ? (
        <p role="status" aria-live="polite" style={{ fontSize: 12, color: "var(--pg-muted)", padding: "18px 0" }}>
          Loading the approvals queue…
        </p>
      ) : error ? (
        <div role="alert" style={{ fontSize: 12, color: "var(--pg-ink)", padding: "14px 0" }}>
          <p style={{ marginBottom: 8 }}>Couldn't load the approvals queue.</p>
          <button
            type="button"
            onClick={() => void refresh()}
            style={{ fontSize: 11.5, fontWeight: 700, color: "var(--pg-gold)", background: "none", border: 0, cursor: "pointer", padding: 0 }}
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--pg-muted)", padding: "18px 0", maxWidth: 420 }}>
          Nothing is waiting on you. When Paige or her team draft work that needs your yes, it lands here.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
          {items.map((a) => (
            <li key={a.id}>
              <ApprovalRow a={a} showDecline onResolved={refresh} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
