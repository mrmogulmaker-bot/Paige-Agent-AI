import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, Bot, CheckCircle2, ChevronRight, CircleDashed,
  Clock3, Database, RefreshCw, ShieldAlert, Sparkles, X,
} from "lucide-react";
import { useSystemsCheck, type SystemsCheckFinding } from "@/hooks/useSystemsCheck";
import { resolveTenantAccountContext, type TenantAccountContext } from "@/components/tenant-shell/tenantShellRoutes";
import { useCommandCenter, type CommandApproval } from "./data/useCommandCenter";
import "./solo-systems-check-workspace.css";

interface Props { accountContext?: TenantAccountContext | null; openPaige?: () => void }

const label = (value: string | null | undefined) =>
  (value || "Other").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const isAttention = (finding: SystemsCheckFinding) => finding.status !== "pass";

function Proof({ children, tone = "partial" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`sc-proof sc-proof--${tone}`}>{children}</span>;
}

export function SoloSystemsCheckWorkspace({ accountContext, openPaige }: Props) {
  const command = useCommandCenter();
  const systems = useSystemsCheck("tenant");
  const resolvedAccount = resolveTenantAccountContext(accountContext);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<SystemsCheckFinding | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [proposal, setProposal] = useState(false);
  const [decision, setDecision] = useState<{ item: CommandApproval; action: "approve" | "decline" } | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
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
  const domains = useMemo(
    () => [...new Set(currentFindings.map((finding) => finding.domain).filter(Boolean) as string[])],
    [currentFindings],
  );
  const visibleFindings = filter === "all"
    ? currentFindings
    : currentFindings.filter((finding) => finding.domain === filter);
  const attentionFindings = currentFindings.filter(isAttention);
  const isPartial = !!systems.run && (
    currentFindings.some((finding) => finding.status === "skip" || finding.status === "error") ||
    (systems.run.check_count ?? currentFindings.length) > currentFindings.length
  );
  const hasCompleteEvidence = currentFindings.length > 0 && !isPartial;
  const completedAt = systems.run?.completed_at ? new Date(systems.run.completed_at) : null;
  const isStale = !!completedAt && Date.now() - completedAt.getTime() > 24 * 60 * 60 * 1000;

  useEffect(() => {
    setFilter("all");
    setSelected(null);
    setExpanded(false);
    setProposal(false);
    setDecision(null);
    setDecisionBusy(false);
    decisionBusyRef.current = false;
    setDecisionMessage("");
  }, [command.accountEpoch]);

  const closeFinding = () => {
    setProposal(false);
    setSelected(null);
    setExpanded(false);
    returnFocus.current?.focus();
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

  useEffect(() => {
    if (scrollOwnerRef.current) scrollOwnerRef.current.inert = Boolean(selected || proposal || decision);
    if (drawerRef.current) drawerRef.current.inert = proposal;
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

  const status = systems.isError
    ? { title: "Systems Check is unavailable", detail: "No account status is being inferred. Retry the current data read.", tone: "unavailable" }
    : systems.loading || command.loading || systems.scanPending
      ? { title: "Resolving current account evidence", detail: "PAIGE is reading the latest available sources. This is not live scan progress.", tone: "loading" }
      : !systems.run
        ? { title: "No persisted Systems Check yet", detail: "A current result is unavailable. Nothing is being reported as healthy without evidence.", tone: "unavailable" }
        : !hasCompleteEvidence
          ? { title: "Coverage is incomplete", detail: "Overall health cannot be inferred from the available findings.", tone: "attention" }
          : attentionFindings.length === 0
          ? { title: "All available checks are clear", detail: `${currentFindings.length} persisted finding${currentFindings.length === 1 ? "" : "s"} verified.`, tone: "healthy" }
          : { title: `${attentionFindings.length} finding${attentionFindings.length === 1 ? "" : "s"} need attention`, detail: "Review the evidence and choose the next safe action.", tone: "attention" };

  return (
    <main className="sc-workspace" aria-label="Solo Systems Check">
      <div ref={scrollOwnerRef} className="sc-scroll-owner" aria-hidden={Boolean(selected || proposal || decision) || undefined}>
        <header className="sc-heading">
          <div>
            <div className="sc-eyebrow"><Sparkles size={14} aria-hidden="true" /> PAIGE operating diagnostic</div>
            <h1>Systems Check</h1>
            <p><span data-tenant-account-name>{resolvedAccount.accountName}</span> · <span data-tenant-account-tier>{resolvedAccount.accountTypeLabel}</span> · {command.greeting.dateLabel}. Hi {command.greeting.name}; {command.isError ? "some operating sources are unavailable." : command.greeting.summary}</p>
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

        <section className={`sc-status sc-status--${status.tone}`} aria-live="polite">
          <div className="sc-status-icon" aria-hidden="true">
            {status.tone === "healthy" ? <CheckCircle2 /> : status.tone === "loading" ? <CircleDashed className="sc-activity" /> : <ShieldAlert />}
          </div>
          <div><h2>{status.title}</h2><p>{status.detail}</p></div>
          {systems.run?.completed_at && <span className="sc-freshness"><Clock3 size={13} /> Last result {completedAt?.toLocaleString()}</span>}
          {systems.isError && <button type="button" className="sc-button" onClick={systems.refresh}>Retry current data</button>}
        </section>

        {command.isError && <div className="sc-source-warning" role="status"><AlertTriangle size={16} /> Some business operating sources could not be read. No empty state is being treated as healthy; refresh current data to retry.</div>}

        <section className="sc-metrics" aria-label="Grounded business signals">
          {command.metrics.length ? command.metrics.map((metric) => (
            <article key={metric.k} className="sc-metric"><span>{metric.k}</span><strong>{metric.v}</strong>{command.isError ? <Proof>LAST AVAILABLE · PARTIAL</Proof> : <Proof tone="live">LIVE READ</Proof>}</article>
          )) : <article className="sc-empty-inline"><Database size={17} /> No grounded headline metrics are available.</article>}
        </section>

        <div className="sc-layout">
          <section className="sc-map-panel" aria-labelledby="system-map-title">
            <div className="sc-section-heading">
              <div><span className="sc-kicker">Operating system map</span><h2 id="system-map-title">Evidence by system</h2></div>
              <span>{currentFindings.length} current</span>
            </div>
            {(systems.loading || systems.scanPending) && (
              <div className="sc-read-activity" role="status"><span /> Reading available systems — no category progress is reported</div>
            )}
            <div className="sc-filters" aria-label="Filter findings by system">
              <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
              {domains.map((domain) => <button key={domain} type="button" aria-pressed={filter === domain} onClick={() => setFilter(domain)}>{label(domain)}</button>)}
            </div>
            <div className="sc-findings">
              {visibleFindings.map((finding) => (
                <button key={finding.id} type="button" className={`sc-finding sc-finding--${finding.status}`} onClick={(event) => openFinding(finding, event.currentTarget)}>
                  <span className="sc-finding-mark" aria-hidden="true" />
                  <span><small>{label(finding.domain)}</small><strong>{finding.check_name || label(finding.check_id)}</strong></span>
                  <span className="sc-finding-state">{label(finding.status)}<ChevronRight size={15} /></span>
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
          </aside>
        </div>
      </div>

      {selected && (
        <div ref={drawerRef} className={`sc-drawer ${expanded ? "is-expanded" : ""}`} role="dialog" aria-modal={proposal ? undefined : true} aria-hidden={proposal || undefined} aria-label={expanded ? "Expanded finding details" : "Finding details"}>
          <div className="sc-drawer-head"><div><span className="sc-kicker">{label(selected.domain)} · {label(selected.severity_at_finding)}</span><h2>{selected.check_name || label(selected.check_id)}</h2></div><div><button data-initial-focus type="button" className="sc-icon-button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Return to drawer" : "Expand"}><ArrowUpRight size={18} /> <span>{expanded ? "Return" : "Expand"}</span></button><button type="button" className="sc-icon-button" onClick={closeFinding} aria-label="Close finding details"><X size={19} /></button></div></div>
          <div className="sc-drawer-body">
            <div className="sc-evidence-meta"><Proof tone={selected.status === "pass" ? "live" : "attention"}>{label(selected.status)}</Proof><span>Recorded {new Date(selected.created_at).toLocaleString()}</span></div>
            <section><h3>Why it matters</h3><p>{selected.paige_interpretation || "No PAIGE interpretation is attached to this persisted finding."}</p></section>
            <section><h3>Evidence</h3>{selected.evidence ? <dl>{Object.entries(selected.evidence).map(([key, value]) => <React.Fragment key={key}><dt>{label(key)}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></React.Fragment>)}</dl> : <p>No evidence payload is available.</p>}</section>
            <section><h3>Next safe action</h3><p>Review this finding with PAIGE before any work is prepared or executed.</p><button type="button" className="sc-button sc-button--paige" onClick={(event) => { proposalReturnFocus.current = event.currentTarget; setProposal(true); }}><Bot size={16} /> Put PAIGE to work</button></section>
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
