import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, Bot, ChevronRight, Clock3, RefreshCw, X,
} from "lucide-react";
import { useSystemsCheck, type SystemsCheckFinding } from "@/hooks/useSystemsCheck";
import { resolveTenantAccountContext, type TenantAccountContext } from "@/components/tenant-shell/tenantShellRoutes";
import { useCommandCenter, type CommandApproval } from "./data/useCommandCenter";
import { useSoloActivityFeed, departmentLabel, elapsedLabel } from "./data/useSoloActivityFeed";
import "./solo-systems-check-workspace.css";

interface Props {
  accountContext?: TenantAccountContext | null;
  openPaige?: () => void;
  /**
   * The active workspace, forwarded by `CommandHub`. Never sent to the server — the Rail resolver
   * takes no tenant argument — it exists only so a switch is noticed by the feed's request guard.
   * `CommandHub` ALSO re-keys this whole subtree on the same value, which is the primary mechanism:
   * a switch unmounts and remounts, so no prior-workspace row, filter, pending read or loading
   * state can survive it. This prop is the second layer, not the first.
   */
  workspaceId?: string | null;
}

/** How many rail lines the compact panel carries. Deliberately small; the feed reads 25. */
const RAIL_PANEL_ROWS = 4;

const label = (value: string | null | undefined) =>
  (value || "Other").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const isUnavailable = (finding: SystemsCheckFinding) => finding.status === "skip" || finding.status === "error";
const isResolved = (finding: SystemsCheckFinding) => Boolean(finding.resolved_at);
type EvidenceFilter = "all" | "attention" | "confirmed" | "unavailable" | "resolved";
type EvidenceState = Exclude<EvidenceFilter, "all">;

const evidenceFilter = (finding: SystemsCheckFinding): EvidenceState => {
  if (isResolved(finding)) return "resolved";
  if (finding.status === "pass") return "confirmed";
  if (isUnavailable(finding)) return "unavailable";
  return "attention";
};

const evidenceStateLabel = (state: EvidenceState) => state === "confirmed"
  ? "Confirmed"
  : state === "attention"
    ? "Needs attention"
    : state === "unavailable"
      ? "Unavailable"
      : "Resolved";

const draftedFixText = (fix: SystemsCheckFinding["paige_drafted_fix"]): string | null => {
  if (!fix) return null;
  if (typeof fix === "string") return fix.trim() || null;
  for (const key of ["content", "summary", "remediation", "plan", "guidance", "text", "body"]) {
    const value = fix[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const PRESENTATION_SAFE_EVIDENCE = new Set([
  "provider", "state", "has_email_identity", "has_primary_phone", "has_a2p_registration",
  "has_business_phone", "customer_count", "has_name", "has_website", "has_industry", "has_about",
  "has_active_n8n_workflow", "has_mcp_connection", "scope_note", "payment_methods_declared", "count",
  "processor_agnostic", "payment_processor_declared", "has_revenue_classification", "integrity_ok",
  "revenue_class", "custom_pipeline_count", "has_stages", "social_handle_count", "declared_capture_only",
  "has_published_growth_page", "has_declared_website",
]);

const evidenceValue = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
    return value.map(String).join(", ");
  }
  return null;
};

const projectEvidence = (evidence: SystemsCheckFinding["evidence"]) => {
  if (!evidence) return { rows: [] as Array<[string, string]>, hasSuppressed: false };
  const rows = Object.entries(evidence).flatMap(([key, value]) => {
    if (!PRESENTATION_SAFE_EVIDENCE.has(key)) return [];
    const rendered = evidenceValue(value);
    return rendered === null ? [] : [[key, rendered] as [string, string]];
  });
  return { rows, hasSuppressed: rows.length < Object.keys(evidence).length };
};

const signalPositions = [
  { path: "M350 190 C280 145 210 92 105 82", x: 102, y: 82, textX: 128, textY: 76, anchor: "start" as const },
  { path: "M350 190 C433 140 506 88 600 92", x: 603, y: 92, textX: 577, textY: 86, anchor: "end" as const },
  { path: "M350 190 C281 240 218 292 112 302", x: 109, y: 302, textX: 135, textY: 296, anchor: "start" as const },
  { path: "M350 190 C425 242 495 298 602 292", x: 605, y: 292, textX: 579, textY: 286, anchor: "end" as const },
];

function Proof({ children, tone = "partial" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`sc-proof sc-proof--${tone}`}>{children}</span>;
}

/**
 * "Recent activity" — the tenant-wide Rail, made reachable from the Solo Command Center.
 *
 * WHY THIS EXISTS. The Rail's tenant-wide strip (`PaigeRailFeed`) ships inside `PaigeWorkspace`,
 * which `TenantCommandCenterShell` renders ONLY when the Solo workspace is absent — and the Solo
 * shell always supplies it. So that strip is an Agency / sub-account / admin surface, and the
 * tenant-wide rail was dark for every Solo tenant. This mounts the SAME already-deployed read the
 * Trust Compass and Team Activity panels use (`useSoloActivityFeed` → `get_solo_rail_activity`);
 * it is not a second Rail source, and it does not duplicate or re-derive a single event.
 *
 * SAFE FIELDS BY CONSTRUCTION, not by filtering here. `get_solo_rail_activity` returns eleven
 * display columns and `toActivityItem` narrows those to `{id,title,summary,byPaige,departmentSlug,
 * occurredAt}`. There is no payload, ref_table, ref_id, actor_user_id, tenant_id, contact_id or
 * email in the shape at all, so none can reach this markup. `id` is a React key and is never
 * rendered. The feed's `error` string is deliberately NOT rendered either — `status` alone drives
 * the copy — so no server text, SQLSTATE or function name can surface on a tenant screen.
 *
 * FIVE ANSWERS, KEPT APART (§13). Reading `items.length` alone would answer five questions with
 * one sentence: still loading, refused, failed, genuinely empty, and populated. Three of those are
 * not "nothing happened", and two of them would be confident false statements about Paige's work.
 * A refusal therefore never renders as an empty state — it says so, and says so out loud.
 */
function RailActivityPanel({ activity }: { activity: ReturnType<typeof useSoloActivityFeed> }) {
  const rows = activity.items.slice(0, RAIL_PANEL_ROWS);
  const state = activity.status === "ready" && rows.length ? "live" : activity.status;

  return (
    <section className="sc-side-panel">
      <div className="sc-section-heading">
        <div><span className="sc-kicker">Workspace rail</span><h2>Recent activity</h2></div>
        {state === "live" && <Proof tone="live">LIVE READ</Proof>}
        {state === "loading" && <Proof tone="scanning">READING</Proof>}
        {state === "ready" && <Proof tone="empty">NONE YET</Proof>}
        {(state === "forbidden" || state === "unavailable") && <Proof tone="unavailable">UNAVAILABLE</Proof>}
      </div>

      {state === "loading" && (
        <p className="sc-muted" role="status" aria-live="polite">Reading this workspace&rsquo;s recent activity&hellip;</p>
      )}

      {state === "forbidden" && (
        <p className="sc-muted" role="alert">
          This workspace&rsquo;s recent activity is not available to you here, so this is not a record of nothing happening.
        </p>
      )}

      {state === "unavailable" && (
        <p className="sc-muted" role="alert">
          This workspace&rsquo;s recent activity could not be loaded, so this is not a record of nothing happening.
        </p>
      )}

      {state === "ready" && (
        <p className="sc-muted">Nothing has been recorded on this workspace&rsquo;s rail yet.</p>
      )}

      {state === "live" && rows.map((item) => (
        <article className="sc-approval" key={item.id}>
          <span>{departmentLabel(item.departmentSlug)} · {item.byPaige ? "PAIGE" : "Person"} · {elapsedLabel(item.occurredAt)}</span>
          <h3>{item.title}</h3>
          {item.summary && <p>{item.summary}</p>}
        </article>
      ))}
    </section>
  );
}

export function SoloSystemsCheckWorkspace({ accountContext, openPaige, workspaceId }: Props) {
  const command = useCommandCenter();
  const activity = useSoloActivityFeed(workspaceId);
  const systems = useSystemsCheck("tenant");
  const resolvedAccount = resolveTenantAccountContext(accountContext);
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const [selected, setSelected] = useState<SystemsCheckFinding | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [proposal, setProposal] = useState(false);
  const [decision, setDecision] = useState<{ item: CommandApproval; action: "approve" | "decline" } | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const restoreFindingFocus = useRef(false);
  const proposalReturnFocus = useRef<HTMLElement | null>(null);
  const decisionReturnFocus = useRef<HTMLElement | null>(null);
  const scrollOwnerRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const proposalRef = useRef<HTMLElement | null>(null);
  const decisionRef = useRef<HTMLElement | null>(null);
  const decisionBusyRef = useRef(false);

  const currentFindings = useMemo(
    () => systems.findings.filter((finding) => !systems.run || finding.run_id === systems.run.id),
    [systems.findings, systems.run],
  );
  const visibleFindings = filter === "all"
    ? currentFindings
    : currentFindings.filter((finding) => evidenceFilter(finding) === filter);
  const unavailableFindings = currentFindings.filter((finding) => evidenceFilter(finding) === "unavailable");
  const attentionFindings = currentFindings.filter((finding) => evidenceFilter(finding) === "attention");
  const confirmedFindings = currentFindings.filter((finding) => evidenceFilter(finding) === "confirmed");
  const resolvedFindings = currentFindings.filter((finding) => evidenceFilter(finding) === "resolved");
  const domainGroups = useMemo(() => {
    const groups = new Map<string, SystemsCheckFinding[]>();
    currentFindings.forEach((finding) => {
      const domain = finding.domain || "other";
      groups.set(domain, [...(groups.get(domain) ?? []), finding]);
    });
    return [...groups.entries()]
      .map(([domain, findings]) => {
        const state: EvidenceState = findings.some((finding) => evidenceFilter(finding) === "attention")
          ? "attention"
          : findings.some((finding) => evidenceFilter(finding) === "unavailable")
            ? "unavailable"
            : findings.some((finding) => evidenceFilter(finding) === "confirmed")
              ? "confirmed"
              : "resolved";
        return { domain, findings, state };
      })
      .sort((a, b) => {
        const rank = { attention: 0, unavailable: 1, confirmed: 2, resolved: 3 };
        return rank[a.state] - rank[b.state] || a.domain.localeCompare(b.domain);
      });
  }, [currentFindings]);
  const completedAt = systems.run?.completed_at ? new Date(systems.run.completed_at) : null;
  const hasCompletedRun = !!completedAt && !Number.isNaN(completedAt.getTime());
  const isPartial = !!systems.run && (
    !hasCompletedRun ||
    currentFindings.some((finding) => finding.status === "skip" || finding.status === "error") ||
    (systems.run.check_count ?? currentFindings.length) > currentFindings.length
  );
  const hasCompleteEvidence = currentFindings.length > 0 && !isPartial;
  const isStale = hasCompletedRun && Date.now() - completedAt.getTime() > 24 * 60 * 60 * 1000;
  const selectedEvidence = projectEvidence(selected?.evidence ?? null);

  useEffect(() => {
    setFilter("all");
    setSelected(null);
    setExpanded(false);
    setProposal(false);
    setDecision(null);
    setDecisionBusy(false);
    decisionBusyRef.current = false;
    setDecisionMessage("");
    restoreFindingFocus.current = false;
    returnFocus.current = null;
  }, [command.accountEpoch]);

  const closeFinding = () => {
    setProposal(false);
    setSelected(null);
    setExpanded(false);
    restoreFindingFocus.current = true;
  };

  const closeProposal = () => {
    setProposal(false);
    proposalReturnFocus.current?.focus();
  };

  const closeDecision = () => {
    if (decisionBusy) return;
    setDecision(null);
    decisionReturnFocus.current?.focus();
  };

  useEffect(() => {
    if (selected) drawerRef.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
  }, [selected]);

  useEffect(() => {
    if (proposal) proposalRef.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
  }, [proposal]);

  useEffect(() => {
    if (decision) decisionRef.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
  }, [decision]);

  useLayoutEffect(() => {
    if (scrollOwnerRef.current) scrollOwnerRef.current.inert = Boolean(selected || proposal || decision);
    if (drawerRef.current) drawerRef.current.inert = proposal;
    if (!selected && !proposal && !decision && restoreFindingFocus.current) {
      restoreFindingFocus.current = false;
      const target = returnFocus.current;
      if (target?.isConnected) target.focus();
    }
  }, [decision, proposal, selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (proposal) closeProposal();
        else if (decision) closeDecision();
        else if (selected) closeFinding();
        return;
      }
      if (event.key !== "Tab") return;
      const container = proposal ? proposalRef.current : decision ? decisionRef.current : selected ? drawerRef.current : null;
      if (!container) return;
      const focusable = [...container.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const refresh = () => {
    command.refresh();
    systems.refresh();
    // The Rail panel refreshes with the rest of the screen. Without this line "Refresh current
    // data" leaves it on whatever it last read until its own 15s poll or a window-focus event —
    // so a person who just watched a read fail, or who expects a just-recorded event, presses
    // Refresh and the one panel they were looking at does not move. Found by review on #877.
    activity.refresh();
  };

  const openFinding = (finding: SystemsCheckFinding, trigger: HTMLElement) => {
    returnFocus.current = trigger;
    setSelected(finding);
    setExpanded(false);
  };

  const openDecision = (item: CommandApproval, action: "approve" | "decline", trigger: HTMLElement) => {
    decisionReturnFocus.current = trigger;
    setDecisionMessage("");
    setDecision({ item, action });
  };

  const runDecision = async () => {
    if (!decision || decisionBusyRef.current) return;
    decisionBusyRef.current = true;
    setDecisionBusy(true);
    setDecisionMessage(`${decision.action === "approve" ? "Approving" : "Dismissing"} ${decision.item.title}…`);
    const result = decision.action === "approve"
      ? await command.approve(decision.item.id)
      : await command.decline(decision.item.id);
    decisionBusyRef.current = false;
    setDecisionBusy(false);
    if (!result.ok) {
      setDecisionMessage(result.error || "The decision could not be saved. Try again.");
      return;
    }
    setDecisionMessage(`${decision.item.title} was ${decision.action === "approve" ? "approved" : "dismissed"}.`);
    setDecision(null);
    decisionReturnFocus.current?.focus();
  };

  const isReading = systems.loading || command.loading || systems.scanPending;
  const status = systems.isError
    ? { title: "Systems Check is unavailable", detail: "No account status is being inferred. Retry the current data read.", tone: "unavailable", pill: "Unavailable" }
    : systems.loading || command.loading || systems.scanPending
      ? { title: "Reading operating signals…", detail: "PAIGE is refreshing the available sources. No category progress is being inferred.", tone: "scanning", pill: "Reading" }
      : !systems.run
        ? { title: "No persisted Systems Check yet", detail: "A current result is unavailable. Nothing is being reported as healthy without evidence.", tone: "empty", pill: "No findings" }
        : resolvedFindings.length > 0 && attentionFindings.length === 0 && unavailableFindings.length === 0 && confirmedFindings.length === 0
          ? { title: "No active findings need attention", detail: "Resolved findings remain in the evidence trail; no current checks are being inferred as clear.", tone: "resolved", pill: "Resolved history" }
        : !hasCompleteEvidence
          ? { title: "The picture is incomplete", detail: "Overall health cannot be inferred from the available findings.", tone: "partial", pill: "Partial coverage" }
          : attentionFindings.length === 0
          ? { title: "Available checks are clear", detail: `${currentFindings.length} persisted finding${currentFindings.length === 1 ? "" : "s"} verified.`, tone: "confirmed", pill: "Confirmed" }
          : { title: `${attentionFindings.length} finding${attentionFindings.length === 1 ? " needs" : "s need"} attention`, detail: "Review the evidence and choose the next safe action.", tone: "attention", pill: "Needs attention" };
  const nextFinding = attentionFindings[0] ?? unavailableFindings[0] ?? null;
  const emergingSignalDetail = systems.run
    ? "are unavailable from this persisted run."
    : systems.isError
      ? "are unavailable because the current evidence read failed."
      : "are unavailable until a persisted Systems Check run exists.";

  return (
    <main className="sc-workspace" aria-label="Solo Systems Check">
      <div ref={scrollOwnerRef} className="sc-scroll-owner" aria-hidden={Boolean(selected || proposal || decision) || undefined}>
        <header className="sc-heading">
          <div>
            <h1>Systems Check</h1>
            <p>Your current operating evidence, coverage gaps, and next signal to inspect.</p>
            <span className="sc-sr-only"><span data-tenant-account-name>{resolvedAccount.accountName}</span>, <span data-tenant-account-tier>{resolvedAccount.accountTypeLabel}</span>, {command.greeting.dateLabel}. {command.greeting.name}: {command.loading ? "operating sources are still loading." : command.isError ? "some operating sources are unavailable." : command.greeting.summary}</span>
          </div>
          <div className="sc-heading-actions">
            {isStale && <Proof tone="stale">STALE EVIDENCE</Proof>}
            {isPartial && <Proof>PARTIAL COVERAGE</Proof>}
            {command.isError && <Proof tone="attention">OPERATING DATA UNAVAILABLE</Proof>}
            <button className="sc-button sc-button--quiet" type="button" onClick={refresh} aria-label="Refresh current data">
              <RefreshCw size={15} aria-hidden="true" />
              Refresh current data
            </button>
          </div>
        </header>

        {command.isError && <div className="sc-source-warning" role="status"><AlertTriangle size={16} /> Some business operating sources could not be read. No empty state is being treated as healthy; refresh current data to retry.</div>}

        <section className="sc-signal" data-operating-signal="true" aria-label="Current operating signal">
          <div className="sc-signal-stage" data-state={status.tone}>
            <div className="sc-signal-stage-head">
              <div><span className="sc-kicker">Operating signal</span><h2>Evidence moving through the business</h2></div>
              <span>{systems.run ? `${currentFindings.length} persisted finding${currentFindings.length === 1 ? "" : "s"}` : "No persisted run"}</span>
            </div>
            {isReading && <div className="sc-read-activity" role="status"><span /> Reading available systems — no category progress is reported</div>}
            <svg className="sc-signal-map" viewBox="0 0 700 380" role="img" aria-labelledby="operating-signal-title operating-signal-description">
              <title id="operating-signal-title">Current Systems Check operating signal</title>
              <desc id="operating-signal-description">Persisted evidence groups connect to PAIGE. Their labels state confirmed, needs attention, or unavailable without inferring missing health.</desc>
              <circle className="sc-orbit sc-orbit--outer" cx="350" cy="190" r="152" />
              <circle className="sc-orbit" cx="350" cy="190" r="116" />
              {domainGroups.slice(0, 4).map((group, index) => {
                const position = signalPositions[index];
                const stateLabel = evidenceStateLabel(group.state);
                const groupFinding = group.findings.find((finding) => evidenceFilter(finding) === group.state) ?? group.findings[0];
                return (
                  <g
                    key={group.domain}
                    className={`sc-signal-source sc-signal-source--${group.state}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${label(group.domain)}, ${stateLabel}`}
                    onClick={(event) => openFinding(groupFinding, event.currentTarget as unknown as HTMLElement)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openFinding(groupFinding, event.currentTarget as unknown as HTMLElement);
                      }
                    }}
                  >
                    <path className="sc-signal-path" d={position.path} />
                    <circle className="sc-signal-node" cx={position.x} cy={position.y} r="10" />
                    <text className="sc-signal-label" x={position.textX} y={position.textY} textAnchor={position.anchor}>{label(group.domain)}</text>
                    <text className="sc-signal-state-label" x={position.textX} y={position.textY + 18} textAnchor={position.anchor}>{stateLabel}</text>
                  </g>
                );
              })}
              <g className="sc-scan-arm" aria-hidden="true"><line x1="350" y1="190" x2="350" y2="78" /><circle cx="350" cy="78" r="4" /></g>
              <g className={`sc-core sc-core--${status.tone}`}>
                <circle cx="350" cy="190" r="73" />
                <text x="350" y="184" textAnchor="middle">PAIGE</text>
                <text className="sc-core-state" x="350" y="208" textAnchor="middle">{status.pill.toUpperCase()}</text>
              </g>
            </svg>
          </div>

          <aside className="sc-signal-summary" aria-live="polite">
            <div className="sc-signal-summary-head"><span className="sc-kicker">Coverage read</span><Proof tone={status.tone}>{status.pill.toUpperCase()}</Proof></div>
            <h2>{status.title}</h2>
            <p>{status.detail}</p>
            <div className="sc-signal-counts" aria-label="Finding totals">
              <div><strong>{confirmedFindings.length}</strong>{" "}<span>confirmed</span></div>
              <div><strong>{attentionFindings.length}</strong>{" "}<span>needs attention</span></div>
              <div><strong>{unavailableFindings.length}</strong>{" "}<span>unavailable</span></div>
            </div>
            <p className="sc-coverage-note"><strong>Emerging signals</strong> {emergingSignalDetail}</p>
            {nextFinding && (
              <button type="button" className="sc-next-signal" onClick={(event) => openFinding(nextFinding, event.currentTarget)}>
                <span>Next signal to inspect</span>
                <strong>{nextFinding.check_name || label(nextFinding.check_id)}</strong>
                <small>{nextFinding.paige_interpretation || "No PAIGE interpretation is attached to this persisted finding."}</small>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            )}
            {openPaige && <button type="button" className="sc-button sc-button--paige sc-rundown-button" onClick={openPaige}><Bot size={16} aria-hidden="true" /> Open PAIGE for the fuller rundown</button>}
            {hasCompletedRun && <span className="sc-freshness"><Clock3 size={13} aria-hidden="true" /> Last result {completedAt.toLocaleString()}</span>}
            {systems.isError && <button type="button" className="sc-button" onClick={systems.refresh}>Retry current data</button>}
          </aside>
        </section>

        <div className="sc-layout">
          <section className="sc-map-panel" aria-labelledby="system-map-title">
            <div className="sc-section-heading">
              <div><span className="sc-kicker">Evidence trail</span><h2 id="system-map-title">What supports this read</h2></div>
              <span>{currentFindings.length} current</span>
            </div>
            <div className="sc-filters" aria-label="Filter findings by result">
              <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
              <button type="button" aria-pressed={filter === "attention"} onClick={() => setFilter("attention")}>Needs attention</button>
              <button type="button" aria-pressed={filter === "confirmed"} onClick={() => setFilter("confirmed")}>Confirmed</button>
              <button type="button" aria-pressed={filter === "unavailable"} onClick={() => setFilter("unavailable")}>Unavailable</button>
              <button type="button" aria-pressed={filter === "resolved"} onClick={() => setFilter("resolved")}>Resolved</button>
            </div>
            <div className="sc-findings">
              {visibleFindings.map((finding) => (
                <button key={finding.id} type="button" className={`sc-finding sc-finding--${evidenceFilter(finding)}`} onClick={(event) => openFinding(finding, event.currentTarget)}>
                  <span className="sc-finding-mark" aria-hidden="true" />
                  <span><small>{label(finding.domain)}</small><strong>{finding.check_name || label(finding.check_id)}</strong></span>
                  <span className="sc-finding-state">{evidenceStateLabel(evidenceFilter(finding))}<ChevronRight size={15} /></span>
                </button>
              ))}
              {!visibleFindings.length && !systems.loading && <div className="sc-empty-inline">No persisted findings match this filter.</div>}
            </div>
          </section>

          <aside className="sc-side-stack" aria-label="Operating context">
            <section className="sc-side-panel">
              <div className="sc-section-heading"><div><span className="sc-kicker">Decision queue</span><h2>Waiting on you</h2></div><strong>{command.approvals.length}</strong></div>
              {command.approvals.slice(0, 3).map((item) => (
                <article className="sc-approval" key={item.id}><span>{item.dept} · {item.aging}</span><h3>{item.title}</h3><p>{item.preview}</p><div><button type="button" onClick={(event) => openDecision(item, "approve", event.currentTarget)}>Review approval</button><button type="button" onClick={(event) => openDecision(item, "decline", event.currentTarget)}>Review dismissal</button></div></article>
              ))}
              {!command.approvals.length && <p className="sc-muted">No approval records are waiting.</p>}
              <p className="sc-decision-feedback" role="status" aria-live="polite">{decisionMessage}</p>
            </section>
            <section className="sc-side-panel">
              <div className="sc-section-heading"><div><span className="sc-kicker">Operating pulse</span><h2>Departments</h2></div><Proof>PARTIAL</Proof></div>
              {command.departments.map((department) => (
                <div className="sc-department" key={department.slug}><span><i />{department.name}</span><strong>Status totals unavailable here</strong></div>
              ))}
              {command.departments.length ? <p className="sc-muted">Department names are connected. Open-work totals are not independently verified by this surface.</p> : <p className="sc-muted">No department status is available.</p>}
            </section>
            <section className="sc-side-panel">
              <div className="sc-section-heading"><div><span className="sc-kicker">Business attention</span><h2>Current signals</h2></div></div>
              {[ ["Clients at risk", command.attention?.at_risk_clients], ["Follow-ups due", command.attention?.follow_ups_due], ["Tasks due", command.attention?.tasks_due] ].filter(([, value]) => typeof value === "number").map(([name, value]) => <div className="sc-department" key={String(name)}><span>{name}</span><strong>{value}</strong></div>)}
              {!command.attention && <p className="sc-muted">No attention summary is available.</p>}
            </section>
            <section className="sc-side-panel">
              <div className="sc-section-heading"><div><span className="sc-kicker">Business signals</span><h2>Grounded totals</h2></div></div>
              {command.metrics.length ? command.metrics.map((metric) => (
                <div className="sc-business-signal" key={metric.k}><span>{metric.k}</span><strong>{metric.v}</strong>{command.isError ? <Proof>LAST AVAILABLE · PARTIAL</Proof> : <Proof tone="live">LIVE READ</Proof>}</div>
              )) : <p className="sc-muted">No grounded headline metrics are available.</p>}
            </section>
            <RailActivityPanel activity={activity} />
          </aside>
        </div>
      </div>

      {selected && (
        <div ref={drawerRef} className={`sc-drawer ${expanded ? "is-expanded" : ""}`} role="dialog" aria-modal={proposal ? undefined : true} aria-hidden={proposal || undefined} aria-label={expanded ? "Expanded finding details" : "Finding details"}>
          <div className="sc-drawer-head"><div><span className="sc-kicker">{label(selected.domain)} · {label(selected.severity_at_finding)}</span><h2>{selected.check_name || label(selected.check_id)}</h2></div><div><button data-initial-focus type="button" className="sc-icon-button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Return to drawer" : "Expand"}><ArrowUpRight size={18} /> <span>{expanded ? "Return" : "Expand"}</span></button><button type="button" className="sc-icon-button" onClick={closeFinding} aria-label="Close finding details"><X size={19} /></button></div></div>
          <div className="sc-drawer-body">
            <div className="sc-evidence-meta"><Proof tone={isResolved(selected) ? "resolved" : selected.status === "pass" ? "live" : "attention"}>{isResolved(selected) ? "Resolved" : label(selected.status)}</Proof><span>Recorded {new Date(selected.created_at).toLocaleString()}</span></div>
            <section><h3>Signal</h3><p>{selected.check_name || label(selected.check_id)} · {evidenceStateLabel(evidenceFilter(selected))}</p></section>
            <section><h3>Evidence and provenance</h3><p>Persisted finding {selected.id} from Systems Check run {selected.run_id}.</p>{selectedEvidence.rows.length ? <dl>{selectedEvidence.rows.map(([key, value]) => <React.Fragment key={key}><dt>{label(key)}</dt><dd>{value}</dd></React.Fragment>)}</dl> : <p>No presentation-safe evidence fields are available.</p>}{selectedEvidence.hasSuppressed && <p>Additional evidence is retained but not displayed here.</p>}</section>
            <section><h3>Impact</h3><p>{selected.paige_interpretation || "No PAIGE interpretation is attached to this persisted finding."}</p></section>
            {isResolved(selected)
              ? <section><h3>Recommended next step</h3><p>No additional work is being recommended from this resolved record.</p></section>
              : <section><h3>Recommended next step</h3><p>{draftedFixText(selected.paige_drafted_fix) || "Review this finding with PAIGE before any work is prepared or executed."}</p><button type="button" className="sc-button sc-button--paige" onClick={(event) => { proposalReturnFocus.current = event.currentTarget; setProposal(true); }}><Bot size={16} /> Put PAIGE to work</button></section>}
            <section><h3>Owner decision</h3><p>{selected.resolved_at ? selected.resolution || "A resolution is recorded without an attached decision summary." : "No owner decision is recorded for this finding."}</p></section>
            <section><h3>Durable outcome</h3><p>{selected.resolved_at ? `Resolved ${new Date(selected.resolved_at).toLocaleString()}${selected.resolution_action_id ? ` · Action ${selected.resolution_action_id}` : ""}.` : "No durable outcome is recorded on the tenant rail."}</p></section>
          </div>
        </div>
      )}

      {decision && (
        <div className="sc-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDecision(); }}>
          <section ref={decisionRef} className="sc-proposal" role="alertdialog" aria-modal="true" aria-labelledby="decision-title" aria-describedby="decision-description">
            <Proof tone="attention">GOVERNED DECISION</Proof>
            <h2 id="decision-title">{decision.action === "approve" ? "Approve" : "Dismiss"} this item?</h2>
            <p id="decision-description">{decision.item.dept} · {decision.item.title}</p>
            <div className="sc-decision-context">{decision.item.preview}</div>
            <p className="sc-decision-dialog-status" role="status" aria-live="polite">{decisionMessage}</p>
            <div className="sc-proposal-actions">
              <button data-initial-focus type="button" className="sc-button sc-button--quiet" onClick={closeDecision} disabled={decisionBusy}>Cancel</button>
              <button type="button" className="sc-button" onClick={() => void runDecision()} disabled={decisionBusy}>{decisionBusy ? "Saving…" : decision.action === "approve" ? "Confirm approval" : "Confirm dismissal"}</button>
            </div>
          </section>
        </div>
      )}

      {proposal && (
        <div className="sc-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProposal(); }}>
          <section ref={proposalRef} className="sc-proposal" role="alertdialog" aria-modal="true" aria-labelledby="ask-first-title">
            <Proof>PARTIAL</Proof><h2 id="ask-first-title">Ask First</h2><p>You can open the one existing PAIGE workspace to discuss this finding.</p><div className="sc-proposal-warning"><AlertTriangle size={17} /> Context has not been attached or prepared. No message will be prefilled or sent, and no work has started.</div><div className="sc-proposal-actions"><button data-initial-focus type="button" className="sc-button sc-button--quiet" onClick={closeProposal}>Cancel</button><button type="button" className="sc-button sc-button--paige" onClick={() => { setProposal(false); openPaige?.(); }}>Open PAIGE workspace</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
