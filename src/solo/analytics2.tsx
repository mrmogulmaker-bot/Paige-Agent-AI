import React from "react";
import { createPortal } from "react-dom";
import { resolveTenantAccountContext, type TenantAccountContext } from "@/components/tenant-shell/tenantShellRoutes";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import "./analytics2.css";

type Analytics2Props = {
  accountContext?: TenantAccountContext | null;
  openPaige?: () => void;
};

type TruthState = "UNAVAILABLE" | "NOT CONNECTED";
type LensKey = "brief" | "money" | "profit" | "ret" | "mkt" | "dec";
type Lens = {
  route: LensKey;
  label: string;
  title: string;
  truth: TruthState;
  summary: string;
  nextStep: string;
};

const LENSES: readonly Lens[] = [
  {
    route: "brief",
    label: "Brief",
    title: "Operating evidence",
    truth: "UNAVAILABLE",
    summary: "No canonical business-performance bundle is available for this account.",
    nextStep: "Issue a tenant-safe metric bundle before displaying an owner brief.",
  },
  {
    route: "money",
    label: "Sales funnel",
    title: "Stage evidence",
    truth: "UNAVAILABLE",
    summary: "No canonical stage definitions or contributing-record counts are available.",
    nextStep: "Prove stage identity, exclusions, and coverage before showing volume or conversion.",
  },
  {
    route: "profit",
    label: "Revenue & profit",
    title: "Financial evidence",
    truth: "UNAVAILABLE",
    summary: "Revenue and attributable direct-cost coverage have not been proved together.",
    nextStep: "Establish canonical revenue and direct-cost contracts before calculating profitability.",
  },
  {
    route: "ret",
    label: "Retention",
    title: "Cohort evidence",
    truth: "UNAVAILABLE",
    summary: "No canonical cohort boundary, return definition, or contributing-record set is available.",
    nextStep: "Issue the shared retention contract before displaying cohort values or churn.",
  },
  {
    route: "mkt",
    label: "Acquisition",
    title: "Source evidence",
    truth: "NOT CONNECTED",
    summary: "No canonical acquisition-source mapping is connected to this reading surface.",
    nextStep: "Connect a tenant-safe source map and prove its coverage before assigning outcomes.",
  },
  {
    route: "dec",
    label: "Decisions",
    title: "Governed decision evidence",
    truth: "UNAVAILABLE",
    summary: "No proven evidence reference or governed recommendation is available.",
    nextStep: "Resolve authoritative evidence before PAIGE prepares any bounded recommendation.",
  },
];

const RANGE_OPTIONS = ["Last 30 days", "Current quarter", "Year to date"] as const;

function TruthBadge({ truth }: { truth: TruthState }) {
  return <span className="anr-state" data-truth={truth}>{truth}</span>;
}

function EvidenceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="anr-evidence-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

function BriefVisual() {
  const rows = ["Revenue evidence", "Cost coverage", "Retention coverage", "Attribution coverage"];
  return <div className="anr-chart-stage" role="img" aria-label="Empty evidence wheel. No business performance is implied.">
    <div className="anr-brief-instrument">
      <div className="anr-evidence-wheel" aria-hidden="true">
        <i className="anr-wheel-ring anr-wheel-ring--outer" />
        <i className="anr-wheel-ring anr-wheel-ring--inner" />
        <div className="anr-wheel-core"><strong>No bundle</strong><span>No implied score</span></div>
      </div>
      <div className="anr-instrument-list">
        {rows.map((row) => <div className="anr-instrument-row" key={row} tabIndex={0} aria-label={`${row}: not proved`}>
          <span>{row}</span><i aria-hidden="true" /><strong>Not proved</strong>
        </div>)}
      </div>
    </div>
    <p className="anr-watermark">Empty evidence wheel · no implied performance</p>
  </div>;
}

function FunnelVisual() {
  const stages = ["Qualified lead", "Proposal", "Commitment", "Confirmed outcome"];
  return <div className="anr-chart-stage" role="img" aria-label="Empty sales funnel stages. No volume or conversion is implied.">
    <div className="anr-cylinder-funnel">
      {stages.map((stage, index) => <div className="anr-cylinder-stage" data-stage={index + 1} key={stage} tabIndex={0} aria-label={`${stage}: no proved count`}>
        <div><strong>{stage}</strong><span>No proved count</span></div>
      </div>)}
    </div>
    <p className="anr-watermark">Empty cylinder stages · no implied volume or conversion</p>
  </div>;
}

function FinancialVisual() {
  const rows = ["Revenue boundary", "Direct-cost coverage", "Margin-ready overlap"];
  return <div className="anr-chart-stage" role="img" aria-label="Empty financial evidence rings. No total, margin, or ratio is implied.">
    <div className="anr-radial-composition">
      <div className="anr-radial-stack" aria-hidden="true">
        <i className="anr-radial-ring anr-radial-ring--outer" />
        <i className="anr-radial-ring anr-radial-ring--middle" />
        <i className="anr-radial-ring anr-radial-ring--inner" />
        <div className="anr-radial-core"><strong>No total</strong><span>No implied ratio</span></div>
      </div>
      <div className="anr-radial-legend">
        {rows.map((row) => <div className="anr-legend-row" key={row} tabIndex={0} aria-label={`${row}: not proved`}>
          <i aria-hidden="true" /><strong>{row}</strong><span>Not proved</span>
        </div>)}
        <p>Ring length is structural only. It is not a result, goal, comparison, or financial claim.</p>
      </div>
    </div>
    <p className="anr-watermark">Empty radial structure · no implied financial result</p>
  </div>;
}

function RetentionVisual() {
  const columns = ["Start", "W1", "W2", "W3", "W4"];
  const rows = ["Recent cohort", "Prior cohort", "Earlier cohort"];
  return <div className="anr-chart-stage" role="img" aria-label="Empty cohort grid. No retention rate or trajectory is implied.">
    <div className="anr-cohort-grid">
      <span className="anr-cohort-label" aria-hidden="true" />
      {columns.map((column) => <span className="anr-cohort-label" key={column}>{column}</span>)}
      {rows.map((row) => <React.Fragment key={row}>
        <strong className="anr-cohort-label">{row}</strong>
        {columns.map((column) => <span className="anr-cohort-cell" key={column} tabIndex={0} aria-label={`${row}, ${column}: no proved retention value`}>—</span>)}
      </React.Fragment>)}
    </div>
    <p className="anr-watermark">Empty cohort frame · no implied retention</p>
  </div>;
}

function AcquisitionVisual() {
  const nodes = ["CRM source identity", "Campaign mapping", "Revenue linkage"];
  return <div className="anr-chart-stage" role="img" aria-label="Unconnected acquisition source map. No attribution is implied.">
    <div className="anr-source-map">
      <div className="anr-source-stack">
        {nodes.map((node) => <div className="anr-source-node" key={node} tabIndex={0} aria-label={`${node}: not connected`}>
          <strong>{node}</strong><span>Not connected</span>
        </div>)}
      </div>
      <div className="anr-source-path" aria-hidden="true"><i /></div>
      <div className="anr-source-target"><strong>Canonical acquisition evidence bundle</strong><TruthBadge truth="NOT CONNECTED" /></div>
    </div>
    <p className="anr-watermark">Source-connection frame · no attribution claim</p>
  </div>;
}

function DecisionVisual() {
  const steps = ["Human", "Read", "Brain", "Trust Compass", "Write", "Rail", "Page"];
  return <div className="anr-chart-stage">
    <div className="anr-decision-frame">
      <div className="anr-decision-mark" aria-hidden="true" />
      <strong>No governed recommendation</strong>
      <p>Recommendations require proven evidence, an opaque server-issued reference, and applicable authority.</p>
      <div className="anr-spine" aria-label="Governed capability path">
        {steps.map((step) => <span key={step} data-live={step === "Human" || step === "Read" || step === "Page"}>{step}</span>)}
      </div>
      <p className="anr-muted">No action, approval, outcome, or recovery is simulated.</p>
    </div>
    <p className="anr-watermark">Governance frame · no action authority</p>
  </div>;
}

function LensVisual({ lens }: { lens: Lens }) {
  if (lens.route === "brief") return <BriefVisual />;
  if (lens.route === "money") return <FunnelVisual />;
  if (lens.route === "profit") return <FinancialVisual />;
  if (lens.route === "ret") return <RetentionVisual />;
  if (lens.route === "mkt") return <AcquisitionVisual />;
  return <DecisionVisual />;
}

export function Analytics2({ accountContext, openPaige }: Analytics2Props) {
  const [view, setView] = useSubtabRoute("solo", "analytics", "brief");
  const tabs = [
    ["brief", "Brief"],
    ["money", "Sales funnel"],
    ["profit", "Revenue & profit"],
    ["ret", "Retention"],
    ["mkt", "Acquisition"],
    ["dec", "Decisions"],
  ] as const;
  const lens = LENSES.find((item) => item.route === view) ?? LENSES[0];
  const account = resolveTenantAccountContext(accountContext);
  const accountResolved = account.accountName !== "Your workspace" && account.accountType === "standalone";
  const [range, setRange] = React.useState<(typeof RANGE_OPTIONS)[number]>("Last 30 days");
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const pageContentRef = React.useRef<HTMLDivElement>(null);
  const dialogRef = React.useRef<HTMLElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const closeEvidence = React.useCallback(() => {
    setInspectorOpen(false);
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, []);

  React.useEffect(() => {
    if (!inspectorOpen) return;
    closeButtonRef.current?.focus();
    const pageContent = pageContentRef.current;
    const shell = pageContent?.closest<HTMLElement>("[data-tenant-shell]") ?? null;
    const shellWasInert = shell?.inert ?? false;
    const shellAriaHidden = shell?.getAttribute("aria-hidden") ?? null;
    if (pageContent) pageContent.inert = true;
    if (shell) {
      shell.inert = true;
      shell.setAttribute("aria-hidden", "true");
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEvidence();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (pageContent) pageContent.inert = false;
      if (shell) {
        shell.inert = shellWasInert;
        if (shellAriaHidden === null) shell.removeAttribute("aria-hidden");
        else shell.setAttribute("aria-hidden", shellAriaHidden);
      }
    };
  }, [closeEvidence, inspectorOpen]);

  const openEvidence = (trigger: HTMLElement) => {
    returnFocusRef.current = trigger;
    setInspectorOpen(true);
  };

  const portalTheme = pageContentRef.current?.closest<HTMLElement>("[data-pg]")?.getAttribute("data-pg") ?? "dark";

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? LENSES.length - 1
        : event.key === "ArrowRight"
          ? (index + 1) % LENSES.length
          : (index - 1 + LENSES.length) % LENSES.length;
    setView(LENSES[next].route);
    tabRefs.current[next]?.focus();
  };

  if (!accountResolved) return <section className="anr-workspace anr-account-blocked" aria-labelledby="analytics-title">
    <h1 id="analytics-title" className="anr-sr-only">Analytics</h1>
    <div className="anr-account-card"><TruthBadge truth="UNAVAILABLE" /><h2>Account context unavailable</h2><p>Analytics cannot resolve a verified active Solo account.</p><p className="anr-muted">No metric request, evidence read, PAIGE context, or action has been prepared.</p></div>
  </section>;

  return <section className="anr-workspace" aria-labelledby="analytics-title" data-analytics-truth={lens.truth}>
    <h1 id="analytics-title" className="anr-sr-only">Analytics</h1>
    <div ref={pageContentRef} className="anr-page-content" aria-hidden={inspectorOpen ? "true" : undefined}>
      <header className="anr-commandbar">
        <div className="anr-tabs" role="tablist" aria-label="Analytics workspaces">
          {tabs.map(([route, label], index) => <button
            type="button"
            role="tab"
            aria-selected={lens.route === route}
            tabIndex={lens.route === route ? 0 : -1}
            key={route}
            ref={(node) => { tabRefs.current[index] = node; }}
            onClick={() => setView(route)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >{label}</button>)}
        </div>
        <div className="anr-command-actions">
          <span className="anr-account-context">Account <strong data-tenant-account-name>{account.accountName}</strong></span>
          <button type="button" className="anr-secondary" onClick={openPaige} disabled={!openPaige}>{openPaige ? "Open PAIGE workspace" : "PAIGE unavailable"}</button>
        </div>
      </header>

      <div className="anr-toolbar" aria-label="View controls">
        <div className="anr-range-group" role="group" aria-label="View range preference">
          <span className="anr-control-label">Range</span>
          {RANGE_OPTIONS.map((option) => <button type="button" key={option} aria-pressed={range === option} onClick={() => setRange(option)}>{option}</button>)}
        </div>
        <button type="button" className="anr-compare" disabled>Compare: off</button>
        <span className="anr-view-note">View preferences never change formulas, evidence, or caveats.</span>
      </div>

      <div className="anr-workspace-grid">
        <main className="anr-pane anr-primary-pane">
          <header className="anr-pane-heading">
            <div><span className="anr-eyebrow">{lens.label}</span><h2>{lens.title}</h2><p>Exact range · source coverage · freshness stay attached to this view</p></div>
            <div className="anr-heading-actions"><TruthBadge truth={lens.truth} /><button type="button" className="anr-icon-action" aria-label="Open evidence" onClick={(event) => openEvidence(event.currentTarget)}>↗</button></div>
          </header>
          <div className="anr-evidence-strip" aria-label="Attached evidence summary">
            <div><span>Truth</span><strong data-truth={lens.truth}>{lens.truth}</strong></div>
            <div><span>Range</span><strong>{range}<small>Local preference · unissued</small></strong></div>
            <div><span>Source</span><strong>No source reference</strong></div>
            <div><span>Freshness</span><strong>Not queried</strong></div>
          </div>
          <div className="anr-pane-scroll">
            <LensVisual lens={lens} />
            <div className="anr-contract-grid">
              <section>
                <span className="anr-eyebrow">Evidence contract</span>
                <h3>Canonical evidence is unavailable</h3>
                <dl>
                  <EvidenceRow label="Definition">No canonical definition issued</EvidenceRow>
                  <EvidenceRow label="Exact range">No server-issued boundary</EvidenceRow>
                  <EvidenceRow label="Source">No bounded source reference</EvidenceRow>
                  <EvidenceRow label="Coverage">Unavailable</EvidenceRow>
                  <EvidenceRow label="Freshness">Not queried</EvidenceRow>
                </dl>
              </section>
              <aside>
                <strong>Immutable caveat</strong>
                <p>{lens.summary} Values, formulas, exclusions, or comparisons cannot be redefined by a saved view.</p>
              </aside>
            </div>
          </div>
        </main>

        <aside className="anr-pane anr-side-pane" aria-label="Truth and governance boundary">
          <div className="anr-side-scroll">
            <section>
              <span className="anr-eyebrow">Truth boundary</span><h2>What this view can say</h2>
              <dl className="anr-truth-list">
                <div><dt>LIVE</dt><dd>Verified account context and one shell-owned PAIGE workspace.</dd></div>
                <div><dt>PARTIAL</dt><dd>Navigation and range controls are local, view-only preferences.</dd></div>
                <div><dt>UNAVAILABLE</dt><dd>Canonical values, formulas, comparisons, recommendations, and actions.</dd></div>
              </dl>
            </section>
            <section>
              <span className="anr-eyebrow">PAIGE spine</span><h2>Reading precedes action</h2>
              <div className="anr-spine" aria-label="Human to governed page pathway">
                {["Human", "Read", "Brain", "Trust Compass", "Write", "Rail", "Page"].map((step) => <span key={step} data-live={step === "Human" || step === "Read" || step === "Page"}>{step}</span>)}
              </div>
              <p>No opaque evidence reference exists, so Brain, Trust Compass, Write, and Rail remain inactive here.</p>
            </section>
            <section>
              <span className="anr-eyebrow">Decisions</span><h2>No simulated recommendation queue</h2>
              <div className="anr-decision-row"><i /> <span><strong>No governed recommendation</strong>A recommendation can appear only after proven evidence and applicable authority.</span></div>
              <div className="anr-decision-row"><i /> <span><strong>No action history claim</strong>Context Rail is not a substitute for business metrics or completeness.</span></div>
            </section>
            <section className="anr-paige-boundary">
              <strong>Read boundary</strong>
              <p>Attach only a presentation-safe opaque reference after a real tenant-scoped resolver exists.</p>
              <button type="button" disabled>Ask PAIGE for a rundown</button>
              <button type="button" disabled>Open analysis workspace</button>
            </section>
          </div>
        </aside>
      </div>
    </div>

    {inspectorOpen ? createPortal(<div className="anr-layer" data-pg={portalTheme} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEvidence(); }}>
      <section ref={dialogRef} className="anr-drawer" role="dialog" aria-modal="true" aria-labelledby="analytics-evidence-title">
        <header>
          <div><span className="anr-eyebrow">Evidence inspector</span><h2 id="analytics-evidence-title">{lens.title}</h2><p>Presentation-safe projection · no opaque reference issued</p></div>
          <button ref={closeButtonRef} type="button" className="anr-close" onClick={closeEvidence} aria-label="Close evidence">×</button>
        </header>
        <div className="anr-drawer-scroll">
          <TruthBadge truth={lens.truth} />
          <h3>{lens.summary}</h3>
          <dl className="anr-evidence-list">
            <EvidenceRow label="Metric identity">{lens.title} · canonical identity unavailable</EvidenceRow>
            <EvidenceRow label="Definition">UNAVAILABLE — no canonical definition issued</EvidenceRow>
            <EvidenceRow label="Formula / version">UNAVAILABLE — no canonical formula or version issued</EvidenceRow>
            <EvidenceRow label="Exact requested range">UNAVAILABLE — {range} is a local preference, not a server-issued boundary</EvidenceRow>
            <EvidenceRow label="Source references">No bounded source references issued</EvidenceRow>
            <EvidenceRow label="Contributing records">UNAVAILABLE — no server-derived count</EvidenceRow>
            <EvidenceRow label="Completeness / coverage">UNAVAILABLE — completeness cannot be inferred</EvidenceRow>
            <EvidenceRow label="Exclusions">UNAVAILABLE — exclusions cannot be enumerated without a canonical resolver</EvidenceRow>
            <EvidenceRow label="Freshness / queried at">NOT QUERIED — no Analytics Evidence Bundle was resolved</EvidenceRow>
            <EvidenceRow label="Truth state">{lens.truth}</EvidenceRow>
          </dl>
          <div className="anr-next-step"><strong>Next safe step</strong><p>{lens.nextStep}</p></div>
          <div className="anr-boundary">PAIGE may receive only an opaque server-resolved evidence reference. Raw events, customer content, provider payloads, prompts, and client-authoritative values are not exposed here.</div>
        </div>
        <footer><button type="button" className="anr-secondary" onClick={closeEvidence}>Close</button><button type="button" disabled>Ask PAIGE for a rundown</button></footer>
      </section>
    </div>, document.body) : null}
  </section>;
}
