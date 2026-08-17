/**
 * useAgencyCommandCenter — the Agency Command Center HOME adapter (Slice A, adapter 3).
 *
 * A near-clone of `src/solo/data/useCommandCenter.ts`: a THIN composition over the
 * SAME production seams (§18 — never a re-query), reshaped for the agency home. It
 * ADDS the agency-aggregate tiles (roster + portfolio metrics) on top of the solo
 * approvals/attention/departments spine.
 *
 * §51 SCOPE SPINE (session-derived ONLY — never a client-supplied tenant_id):
 *   • usePendingApprovals({ scope:"all" }) — self-scopes by activeTenantId (God tier =
 *     no filter). This is the caller's OWN queue in EITHER mode; on a real act-as
 *     (agency_enter_subaccount) activeTenantId is repointed server-side, so the SAME
 *     hook then reads the child's queue. No parentage RPC, no cross-book read here.
 *   • usePracticeDashboard() / usePaigeDeptStatus() — own-book, RLS-scoped.
 *   • useAgencyRoster / useAgencyMetrics — the agency-aggregate tiles (empty/own in
 *     sub/acting mode); they own the parentage-RPC gating internally.
 *
 * §13 HONESTY: approvals / attention / departments / roster / portfolio-MRR are REAL.
 * The cross-book prospect PIPELINE and the cross-book TEAM-PULSE have NO parentage-gated
 * backend — reading them off the RLS own-book tables would be the #86 leak — so they are
 * surfaced as explicit Preview flags, never fabricated. approve/decline go through the
 * SAME server-gated seams the production ApprovalRow ships (execute-approval + RLS UPDATE).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { usePracticeDashboard, type PracticeAttention } from "@/hooks/usePracticeDashboard";
import { usePaigeDeptStatus, type DeptStatusRow } from "@/hooks/usePaigeDeptStatus";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  useAgencyRoster,
  isAgencyAggregate,
  type AgencyRosterData,
  type AgencyShellCtx,
} from "./useAgencyRoster";
import { useAgencyMetrics, type AgencyMetricsData } from "./useAgencyMetrics";

/** A single approval reshaped into the agency `ApprovalCard` prop shape. */
export interface CommandApproval {
  id: string;
  dept: string;
  title: string;
  preview: string;
  type: string | null;
  urgency: "today" | "week";
  aging: string;
}

/** Aggregates that have no parentage-gated backend yet — surfaced as Preview (§13). */
export interface AgencyCommandPreview {
  /** Cross-book prospect pipeline — no RPC; keep Preview. */
  pipeline: true;
  /** Cross-book Team-Pulse — reading it off own-book tables = #86 leak; keep Preview. */
  teamPulse: true;
}

export interface AgencyCommandCenterData {
  mode: "agency" | "own";
  approvals: CommandApproval[];
  metrics: AgencyMetricsData;
  roster: AgencyRosterData;
  attention: PracticeAttention | undefined;
  departments: DeptStatusRow[];
  greeting: { name: string; dateLabel: string; summary: string };
  counts: { approvals: number; subAccounts: number | null };
  preview: AgencyCommandPreview;
  loading: boolean;
  /** True only when there is genuinely nothing to show (fresh, empty book). */
  empty: boolean;
  approve: (id: string) => Promise<{ ok: boolean; error?: string }>;
  decline: (id: string) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => void;
}

/** "send_message" / "email-draft" → "Send message". Null → "Paige". */
function humanize(raw: string | null | undefined): string {
  if (!raw) return "Paige";
  const s = raw.replace(/[_-]+/g, " ").trim();
  if (!s) return "Paige";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** age_seconds → compact "just now" / "5m" / "3h" / "2d". */
function humanizeAge(seconds: number | null | undefined): string {
  const s = typeof seconds === "number" && seconds > 0 ? seconds : 0;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function firstToken(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function useAgencyCommandCenter(ctx: AgencyShellCtx): AgencyCommandCenterData {
  const aggregate = isAgencyAggregate(ctx);

  const { items, loading: approvalsLoading, refresh: refreshApprovals } =
    usePendingApprovals({ scope: "all" });
  const { attention, loading: dashLoading, refetch } = usePracticeDashboard();
  const { departments } = usePaigeDeptStatus();
  const { activeTenant } = useTenantContext();

  const roster = useAgencyRoster(ctx);
  const metrics = useAgencyMetrics(ctx);

  // Greeting first name from auth metadata (best effort, §15 — never a placeholder).
  const [authName, setAuthName] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!on) return;
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const full =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        "";
      setAuthName(full ? firstToken(full) : null);
    });
    return () => {
      on = false;
    };
  }, []);

  const approvals = useMemo<CommandApproval[]>(
    () =>
      items.map((r) => {
        const draft = (r.draft_content ?? {}) as Record<string, unknown>;
        const draftSubject = typeof draft.subject === "string" ? draft.subject : "";
        const draftBody =
          typeof draft.body === "string"
            ? draft.body
            : typeof draft.preview === "string"
              ? draft.preview
              : typeof r.draft_content === "string"
                ? (r.draft_content as string)
                : "";
        return {
          id: r.id,
          dept: humanize(r.category),
          title: r.summary || draftSubject || humanize(r.category),
          preview: draftBody,
          type: r.type ? humanize(r.type) : null,
          urgency:
            r.sla_state === "overdue" || r.sla_state === "due_soon" ? "today" : "week",
          aging: humanizeAge(r.age_seconds),
        };
      }),
    [items],
  );

  const at = attention ?? {};
  const attentionTotal =
    (at.at_risk_clients ?? 0) +
    (at.follow_ups_due ?? 0) +
    (at.upcoming_sessions_7d ?? 0) +
    (at.tasks_due ?? 0) +
    (at.onboarding_in_progress ?? 0);

  const loading = approvalsLoading || dashLoading || (aggregate && roster.loading);

  // Empty = nothing to show anywhere. In agency mode a non-empty roster is content,
  // so the roster count participates; in own mode it is always 0 (no roster).
  const empty =
    !loading &&
    attentionTotal === 0 &&
    approvals.length === 0 &&
    roster.rows.length === 0 &&
    (metrics.subCount ?? 0) === 0;

  const greeting = useMemo(() => {
    const name = authName || metrics.identity.name || activeTenant?.name || "there";
    const dateLabel = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const parts: string[] = [];
    if (approvals.length)
      parts.push(`${approvals.length} draft${approvals.length === 1 ? "" : "s"} waiting`);
    if (aggregate && typeof metrics.subCount === "number" && metrics.subCount > 0)
      parts.push(
        `${metrics.subCount} sub-account${metrics.subCount === 1 ? "" : "s"} in your book`,
      );
    if (at.at_risk_clients)
      parts.push(`${at.at_risk_clients} client${at.at_risk_clients === 1 ? "" : "s"} at risk`);
    if (at.follow_ups_due)
      parts.push(`${at.follow_ups_due} follow-up${at.follow_ups_due === 1 ? "" : "s"} due`);
    const summary = parts.length ? `${parts.join(" · ")}.` : "You're all caught up.";
    return { name, dateLabel, summary };
  }, [
    authName,
    metrics.identity.name,
    metrics.subCount,
    aggregate,
    activeTenant?.name,
    approvals.length,
    at.at_risk_clients,
    at.follow_ups_due,
  ]);

  const refresh = useCallback(() => {
    void refreshApprovals();
    refetch();
    roster.refresh();
    metrics.refresh();
  }, [refreshApprovals, refetch, roster, metrics]);

  const approve = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      // §10 callable seam — approve AND act (email/SMS sent; others acknowledged).
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
      // Reject-with-reason: the SAME RLS-protected UPDATE ApprovalRow/ApprovalDetail ship (§18).
      const { error } = await supabase
        .from("paige_pending_approvals")
        .update({
          status: "rejected",
          decision_rationale: "Dismissed from Command Center",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) return { ok: false, error: error.message };
      refresh();
      return { ok: true };
    },
    [refresh],
  );

  return {
    mode: aggregate ? "agency" : "own",
    approvals,
    metrics,
    roster,
    attention,
    departments,
    greeting,
    counts: { approvals: approvals.length, subAccounts: metrics.subCount },
    preview: { pipeline: true, teamPulse: true },
    loading,
    empty,
    approve,
    decline,
    refresh,
  };
}
