import React from "react";
import { createPortal } from "react-dom";
import { resolveTenantAccountContext, type TenantAccountContext } from "@/components/tenant-shell/tenantShellRoutes";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import "./analytics2.css";

type Analytics2Props = { accountContext?: TenantAccountContext | null; openPaige?: () => void };
type MetricTruthState = "UNAVAILABLE" | "NOT CONNECTED";
type MetricDefinition = { id:string; name:string; state:MetricTruthState; summary:string; nextStep:string };
const METRICS: MetricDefinition[] = [
  {id:"revenue",name:"Revenue",state:"UNAVAILABLE",summary:"No canonical revenue evidence bundle is available for this account.",nextStep:"Connect a canonical revenue contract before any total, comparison, or trend is shown."},
  {id:"margin",name:"Gross margin",state:"UNAVAILABLE",summary:"Revenue and attributable direct-cost coverage have not been proved together.",nextStep:"Establish the shared revenue and direct-cost contracts before calculating margin."},
  {id:"churn",name:"Client churn",state:"UNAVAILABLE",summary:"No canonical churn definition, cohort boundary, or contributing-record set is available.",nextStep:"Issue the shared churn contract before displaying retention or churn."},
  {id:"attribution",name:"Revenue attribution",state:"NOT CONNECTED",summary:"No canonical acquisition-source mapping is connected to Analytics.",nextStep:"Connect a tenant-safe attribution source and prove its coverage before assigning revenue."},
];
const RANGE_OPTIONS = ["Last 30 days", "Current quarter", "Year to date"] as const;

function EvidenceRow({label,children}:{label:string;children:React.ReactNode}){
  return <div className="anr-evidence-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

export function Analytics2({accountContext,openPaige}:Analytics2Props){
  const [view,setView]=useSubtabRoute("solo","analytics","brief");
  const tabs=[['brief','Brief'],['money','The money'],['profit','Profitability'],['ret','Retention'],['dec','Decisions'],['mkt','Market watch']];
  const account=resolveTenantAccountContext(accountContext);
  const accountResolved=account.accountName!=="Your workspace"&&account.accountType==="standalone";
  const [range,setRange]=React.useState<(typeof RANGE_OPTIONS)[number]>("Last 30 days");
  const [selectedMetric,setSelectedMetric]=React.useState<MetricDefinition|null>(null);
  const pageContentRef=React.useRef<HTMLDivElement>(null);
  const dialogRef=React.useRef<HTMLElement>(null);
  const closeButtonRef=React.useRef<HTMLButtonElement>(null);
  const returnFocusRef=React.useRef<HTMLElement|null>(null);
  const closeEvidence=React.useCallback(()=>{setSelectedMetric(null);requestAnimationFrame(()=>returnFocusRef.current?.focus())},[]);
  React.useEffect(()=>{
    if(!selectedMetric)return;
    closeButtonRef.current?.focus();
    const pageContent=pageContentRef.current;
    const shell=pageContent?.closest<HTMLElement>("[data-tenant-shell]")??null;
    const shellWasInert=shell?.inert??false;
    const shellAriaHidden=shell?.getAttribute("aria-hidden")??null;
    if(pageContent)pageContent.inert=true;
    if(shell){shell.inert=true;shell.setAttribute("aria-hidden","true")}
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();closeEvidence();return}
      if(event.key!=="Tab"||!dialogRef.current)return;
      const focusable=[...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      const first=focusable[0];
      const last=focusable[focusable.length-1];
      if(!first||!last)return;
      if(event.shiftKey&&(document.activeElement===first||!dialogRef.current.contains(document.activeElement))){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||!dialogRef.current.contains(document.activeElement))){event.preventDefault();first.focus()}
    };
    window.addEventListener("keydown",onKeyDown);
    return()=>{
      window.removeEventListener("keydown",onKeyDown);
      if(pageContent)pageContent.inert=false;
      if(shell){shell.inert=shellWasInert;if(shellAriaHidden===null)shell.removeAttribute("aria-hidden");else shell.setAttribute("aria-hidden",shellAriaHidden)}
    };
  },[closeEvidence,selectedMetric]);
  const openEvidence=(metric:MetricDefinition,trigger:HTMLElement)=>{returnFocusRef.current=trigger;setSelectedMetric(metric)};

  if(!accountResolved)return <section className="anr-workspace anr-account-blocked" aria-labelledby="analytics-title"><div className="anr-account-card"><span className="anr-state anr-state--unavailable">UNAVAILABLE</span><h1 id="analytics-title">Analytics</h1><p>Analytics cannot resolve a verified active Solo account.</p><p className="anr-muted">No metric request, evidence read, PAIGE context, or action has been prepared.</p></div></section>;

  return <section className="anr-workspace" aria-labelledby="analytics-title" data-analytics-truth="unavailable"><div ref={pageContentRef} className="anr-page-content" aria-hidden={selectedMetric?"true":undefined}>
    <header className="anr-header"><div className="anr-title-group"><span className="anr-eyebrow">Evidence before appearance</span><h1 id="analytics-title">Analytics</h1><p>Business performance for <strong data-tenant-account-name>{account.accountName}</strong></p></div><div className="anr-header-status" aria-label="Analytics availability"><span className="anr-state anr-state--unavailable">READ-ONLY · UNAVAILABLE</span><span>No canonical metric bundle issued</span></div></header>
    <div className="anr-truth-banner" role="status"><div><strong>No business totals are available yet.</strong><span> Analytics will not substitute telemetry, zeroes, sample values, benchmarks, or inferred recommendations.</span></div><button type="button" className="anr-secondary" onClick={openPaige} disabled={!openPaige}>{openPaige?"Open PAIGE workspace":"PAIGE workspace unavailable"}</button></div>
    <div className="anr-toolbar" aria-label="Analytics view controls"><div><span className="anr-control-label">Analytics view</span><div className="anr-segmented" role="group" aria-label="Analytics view preference">{tabs.map(([key,label])=><button type="button" key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div></div><div><span className="anr-control-label">View range</span><div className="anr-segmented" role="group" aria-label="View range preference">{RANGE_OPTIONS.map(option=><button type="button" key={option} aria-pressed={range===option} onClick={()=>setRange(option)}>{option}</button>)}</div></div><p><strong>View only.</strong> These preferences never change formulas, evidence, or caveats.</p></div>
    <div className="anr-body"><section className="anr-main" aria-label="Canonical operating metrics"><div className="anr-section-heading"><div><span className="anr-eyebrow">Canonical operating metrics</span><h2>Truthful absence until evidence exists</h2></div><span>{range} · display preference only</span></div>
      <div className="anr-metric-grid">{METRICS.map(metric=><article className="anr-metric" key={metric.id} data-truth-state={metric.state}><div className="anr-metric-topline"><span className={`anr-state anr-state--${metric.state==="NOT CONNECTED"?"not-connected":"unavailable"}`}>{metric.state}</span></div><h3>{metric.name}</h3><div className="anr-value">No metric value issued</div><p>{metric.summary}</p><dl className="anr-card-facts"><div><dt>Source</dt><dd>No bounded source reference</dd></div><div><dt>Coverage</dt><dd>Unavailable</dd></div><div><dt>Freshness</dt><dd>Not queried</dd></div></dl><button type="button" className="anr-evidence-button" onClick={event=>openEvidence(metric,event.currentTarget)}>Open evidence and coverage</button></article>)}</div>
      <section className="anr-guarded" aria-labelledby="governed-analysis-title"><div><span className="anr-eyebrow">PAIGE spine · PARTIAL</span><h2 id="governed-analysis-title">Grounded analysis is not ready</h2><p>The existing PAIGE workspace can open, but Analytics has no opaque server-issued evidence reference to attach. No rundown, recommendation, approval, or action is prepared.</p></div><div className="anr-guarded-actions"><button type="button" disabled>Ask PAIGE for a rundown</button><button type="button" disabled>Open analysis workspace</button><span>Requires an account-scoped evidence reference.</span></div></section>
    </section><aside className="anr-side" aria-label="Analytics contract status"><section><span className="anr-eyebrow">What is available</span><h2>Reading surface</h2><ul><li><strong>LIVE</strong><span>Verified account identity and the existing shell-owned PAIGE workspace.</span></li><li><strong>PARTIAL</strong><span>Analytics-view routing and session-local range selection; both are view-only.</span></li><li><strong>UNAVAILABLE</strong><span>Metric values, comparisons, charts, recommendations, analysis references, and actions.</span></li></ul></section><section><span className="anr-eyebrow">Governed action</span><h2>Reading precedes action</h2><p>Any future Analytics action must reuse the existing Action Bus after the tenant and capability Trust clamp and durable idempotent outcome/recovery contract exist.</p><p className="anr-muted">This page does not read Context Rail content and does not create a rail, action, memory, autonomy, or outcome record.</p></section></aside></div></div>
    {selectedMetric?createPortal(<div className="anr-layer" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)closeEvidence()}}><section ref={dialogRef} className="anr-drawer" role="dialog" aria-modal="true" aria-labelledby="analytics-evidence-title"><header><div><span className="anr-eyebrow">Analytics Evidence Bundle</span><h2 id="analytics-evidence-title">{selectedMetric.name}</h2><p>Safe browser projection · no opaque reference issued</p></div><button ref={closeButtonRef} type="button" className="anr-close" onClick={closeEvidence} aria-label="Close evidence">×</button></header><div className="anr-drawer-scroll"><span className={`anr-state anr-state--${selectedMetric.state==="NOT CONNECTED"?"not-connected":"unavailable"}`}>{selectedMetric.state}</span><div className="anr-drawer-value">No metric value issued</div><dl className="anr-evidence-list"><EvidenceRow label="Metric identity">{selectedMetric.name}</EvidenceRow><EvidenceRow label="Definition">UNAVAILABLE — no canonical definition issued</EvidenceRow><EvidenceRow label="Formula / version">UNAVAILABLE — no canonical formula or version issued</EvidenceRow><EvidenceRow label="Exact requested range">UNAVAILABLE — {range} is a local view preference, not a server-issued time boundary</EvidenceRow><EvidenceRow label="Source references">No bounded source references issued</EvidenceRow><EvidenceRow label="Contributing records">UNAVAILABLE — no server-derived count</EvidenceRow><EvidenceRow label="Completeness / coverage">UNAVAILABLE — completeness cannot be inferred</EvidenceRow><EvidenceRow label="Exclusions">UNAVAILABLE — exclusions cannot be enumerated without the canonical resolver</EvidenceRow><EvidenceRow label="Freshness / queried at">NOT QUERIED — no Analytics Evidence Bundle was resolved</EvidenceRow><EvidenceRow label="Truth state">{selectedMetric.state}</EvidenceRow></dl><div className="anr-next-step"><strong>Next safe step</strong><p>{selectedMetric.nextStep}</p></div><div className="anr-boundary">PAIGE may receive only an opaque server-resolved evidence reference. Raw events, customer content, provider payloads, prompts, and client-authoritative values are not exposed here.</div></div><footer><button type="button" className="anr-secondary" onClick={closeEvidence}>Close</button><button type="button" disabled>Ask PAIGE for a rundown</button></footer></section></div>,document.body):null}
  </section>;
}
