import React from "react";
import { useAgentPresence } from "@/components/ui/paige/AgentPresenceContext";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, PageHead } from "./_shared";
import { useSoloMarketplace } from "./data/useSoloMarketplace";
import { toMarketplacePaigeReference, type MarketplaceItem, type MarketplaceTruthState } from "./marketplace-truth";
import "./marketplace.css";

function TruthBadge({ state }: { state: MarketplaceTruthState }) {
  return <span className={`mk-truth mk-truth-${state.toLowerCase()}`}>{state}</span>;
}

function CapabilityGlyph({ item, large = false }: { item: MarketplaceItem; large?: boolean }) {
  const Icon = item.itemType.includes("connector") ? Ic.vault : item.itemType.includes("workflow") ? Ic.bolt : Ic.grid;
  return <span className={`mk-glyph${large ? " mk-glyph-large" : ""}`} aria-hidden="true"><Icon size={large ? 31 : 21} style={{}} /></span>;
}

function MarketplaceCard({ item, onOpen }: { item: MarketplaceItem; onOpen: (item: MarketplaceItem, trigger: HTMLButtonElement) => void }) {
  return <button className="mk-card card" onClick={(event) => onOpen(item, event.currentTarget)} aria-label={`Review ${item.name}`}>
    <span className="mk-card-head"><CapabilityGlyph item={item} /><span className="mk-card-title"><strong>{item.name}</strong><span>{item.itemType}</span></span><TruthBadge state={item.safeState} /></span>
    <span className="mk-card-copy">{item.tagline || "A source-provided summary is unavailable from the current catalogue read."}</span>
    <span className="mk-card-meta"><span>{item.category}</span><span>Review details <Ic.chev size={13} style={{}} /></span></span>
  </button>;
}

function StatePanel({ state, refresh }: { state: "resolving" | "unavailable" | "error"; refresh: () => void }) {
  if (state === "resolving") return <div className="mk-state card" role="status"><TruthBadge state="PARTIAL" /><h2>Reading caller-scoped catalogue records</h2><p>No catalogue claims are shown until the server read returns.</p></div>;
  if (state === "unavailable") return <div className="mk-state card" role="status"><TruthBadge state="UNAVAILABLE" /><h2>Marketplace context unavailable</h2><p>An authoritative workspace context is required before catalogue records can be shown.</p></div>;
  return <div className="mk-state card" role="alert"><TruthBadge state="UNAVAILABLE" /><h2>Marketplace catalogue unavailable</h2><p>The safe catalogue read did not complete. No fixture content has been substituted.</p><button className="btn btn-s" onClick={refresh}>Retry safe read</button></div>;
}

function EmptyState({ title, copy, state = "LIVE" }: { title: string; copy: string; state?: MarketplaceTruthState }) {
  return <div className="mk-state card" role="status"><TruthBadge state={state} /><h2>{title}</h2><p>{copy}</p></div>;
}

function MarketplaceDetail({ item, onClose, onOpenPaige, restoreFocus }: {
  item: MarketplaceItem; onClose: () => void; onOpenPaige: () => void;
  restoreFocus: React.MutableRefObject<HTMLButtonElement | null>;
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLElement>(null);
  const reference = toMarketplacePaigeReference(item);

  React.useEffect(() => {
    const trigger = restoreFocus.current;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>('button,[href],[tabindex]:not([tabindex="-1"])')].filter((control) => !control.hasAttribute("disabled"));
      if (!controls.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); trigger?.focus(); };
  }, [onClose, restoreFocus]);

  const fields = [
    ["Catalogue membership", item.tenantEligibility.state, "Returned by the current caller-scoped catalogue read; immutable release eligibility is not proven."],
    ["Version", item.releaseVersion.state, item.releaseVersion.value || "No version returned."],
    ["Publisher provenance", item.publisher.state, "Not present in the safe catalogue response."],
    ["Immutable release identity", item.releaseIdentity.state, "Not available in the current contract."],
    ["Approved scope", item.approvedScope.state, "No release-bound declaration is available."],
    ["Declared read, prepare, and runtime operations", item.declaredCapabilities.state, "Default deny until a reviewed declaration exists."],
    ["Prerequisites", item.prerequisites.state, "Not available in the current contract."],
  ] as const;

  return <div className="mk-dialog-layer">
    <button className="mk-dialog-backdrop" onClick={onClose} aria-label="Close capability details" />
    <aside ref={dialogRef} className="mk-dialog" role="dialog" aria-modal="true" aria-labelledby="mk-detail-title">
      <header className="mk-dialog-hero"><CapabilityGlyph item={item} large /><div><TruthBadge state={item.safeState} /><h2 id="mk-detail-title">{item.name}</h2><p>{item.itemType} · {item.category}</p></div><button ref={closeRef} className="mk-close" onClick={onClose} aria-label="Close capability details"><Ic.x size={16} style={{}} /></button></header>
      <div className="mk-dialog-body">
        <section><span className="eyebrow">Catalogue description</span><p>{item.description || item.tagline || "A description is unavailable from the current catalogue read."}</p></section>
        <section><span className="eyebrow">Release and capability truth</span><div className="mk-facts">{fields.map(([label, state, value]) => <div key={label}><span><strong>{label}</strong><TruthBadge state={state} /></span><p>{value}</p></div>)}</div></section>
        <section className="mk-paige-read" data-marketplace-paige-reference={reference.schema}><span className="eyebrow">Safe-reference preview</span><h3>PAIGE attachment unavailable</h3><p>This curated reference shows the proposed read contract. It is not attached, sent, installed, activated, purchased, or executed from this page.</p><dl><div><dt>Reference</dt><dd>{reference.capabilityRef}</dd></div><div><dt>Catalogue state</dt><dd>{reference.tenantEligibility.state}</dd></div><div><dt>Version authority</dt><dd>{reference.version.state}</dd></div></dl><button className="btn btn-p" onClick={() => { onClose(); queueMicrotask(onOpenPaige); }}><Ic.spark size={14} style={{}} />Open PAIGE workspace</button></section>
        <section className="mk-action-floor"><TruthBadge state="UNAVAILABLE" /><div><strong>Entitlement actions are not available</strong><p>Installation, removal, updates, purchase, and activation wait for immutable release authority, Marketplace-specific approval, and durable outcome contracts.</p></div></section>
      </div>
    </aside>
  </div>;
}

export const Marketplace = () => {
  const [tab, setTab] = useSubtabRoute("solo", "marketplace", "today");
  const tabs = [
    ["today", "Today", Ic.spark],
    ["browse", "Browse", Ic.grid],
    ["installed", "Installed", Ic.check],
    ["updates", "Updates", Ic.arrow],
  ] as const;
  const { expandRail } = useAgentPresence();
  const read = useSoloMarketplace();
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("All");
  const [openItem, setOpenItem] = React.useState<MarketplaceItem | null>(null);
  const restoreFocus = React.useRef<HTMLButtonElement | null>(null);
  const pageRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (openItem) pageRef.current?.setAttribute("inert", "");
    else pageRef.current?.removeAttribute("inert");
  }, [openItem]);
  const categories = React.useMemo(() => ["All", ...new Set(read.items.map((item) => item.category))], [read.items]);
  const visibleItems = React.useMemo(() => read.items.filter((item) => {
    const matchesCategory = category === "All" || item.category === category;
    return matchesCategory && `${item.name} ${item.tagline || ""} ${item.itemType} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [category, query, read.items]);
  const installedItems = read.items.filter((item) => item.installed);
  const openDetail = (item: MarketplaceItem, trigger: HTMLButtonElement) => { restoreFocus.current = trigger; setOpenItem(item); };

  return <div className="mk-workspace" role="region" aria-label="Marketplace">
    <div ref={pageRef} className="mk-page" aria-hidden={openItem ? true : undefined}>
    <div className="mk-tabs"><nav className="mk-tablist" aria-label="Marketplace views">{tabs.map(([key, label, Icon]) => <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}><Icon size={15} style={{}} />{label}</button>)}</nav><div className="mk-counts"><span><TruthBadge state={read.state === "ready" ? read.summary.installed.state : "UNAVAILABLE"} />{read.state === "ready" ? `${read.summary.installed.count} visible install observations` : "Install observations unavailable"}</span></div></div>
    <div className="pg-body mk-body">
      <PageHead eyebrow="Governed capability catalogue" title="Marketplace" sub="Discover catalogue capabilities. Release authority and entitlement actions fail closed when their contracts are absent." right={null} />
      {read.state !== "ready" ? <StatePanel state={read.state} refresh={read.refresh} /> : <>
        {tab === "today" && <div className="mk-flow"><section className="mk-hero"><div><TruthBadge state="PARTIAL" /><h2>Capabilities move through a governed release path</h2><p>Creators submit. The platform authorizes an exact release. Tenants discover catalogue records. Governed entitlement and Capabilities setup follow only when their contracts are proven.</p><button className="btn" onClick={() => setTab("browse")}>Browse catalogue records <Ic.arrow size={14} style={{}} /></button></div><div className="mk-lifecycle" aria-label="Marketplace authority lifecycle"><span>Creator submission</span><Ic.chev size={14} style={{}} /><span>Platform authorization</span><Ic.chev size={14} style={{}} /><span>Tenant discovery</span><Ic.chev size={14} style={{}} /><span>Governed entitlement</span></div></section><section><div className="mk-section-head"><div><span className="eyebrow">Catalogue read</span><h2>Records available to review</h2></div><span className="mk-source"><TruthBadge state="LIVE" />Read completed</span></div>{read.items.length ? <div className="mk-card-rail">{read.items.map((item) => <MarketplaceCard key={item.slug} item={item} onOpen={openDetail} />)}</div> : <EmptyState state="PARTIAL" title="0 catalogue records returned" copy="The current caller-scoped catalogue returned zero records. This is not proof of complete release or entitlement inventory." />}</section></div>}
        {tab === "browse" && <div className="mk-flow"><div className="mk-tools"><label><Ic.search size={15} style={{}} /><span className="sr-only">Search capabilities</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search catalogue capabilities" /></label><div className="mk-filters" aria-label="Capability categories">{categories.map((value) => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div></div>{visibleItems.length ? <div className="mk-grid">{visibleItems.map((item) => <MarketplaceCard key={item.slug} item={item} onOpen={openDetail} />)}</div> : <EmptyState state="PARTIAL" title="No matching catalogue records" copy="The current caller-scoped catalogue has no matching records." />}</div>}
        {tab === "installed" && <div className="mk-flow">{installedItems.length ? <><div className="mk-boundary"><TruthBadge state="PARTIAL" /><p>These are visible legacy active-install observations. The catalogue RPC is not a complete entitlement read, and immutable release binding and activation health are unavailable.</p></div><div className="mk-grid">{installedItems.map((item) => <MarketplaceCard key={item.slug} item={item} onOpen={openDetail} />)}</div></> : <EmptyState state="PARTIAL" title="0 visible active-install observations" copy="No active install row was joined to the returned catalogue records. This is not proof of a complete entitlement inventory." />}</div>}
        {tab === "updates" && <div className="mk-flow"><EmptyState state="UNAVAILABLE" title="Update readiness unavailable" copy="The current contract does not bind a complete installed inventory to approved immutable releases. No update count, claim, or control is shown." /></div>}
      </>}
      <p className="mk-source-note">Source: <code>{read.source}</code>. This existing server RPC applies caller-scoped catalogue rules, but its response does not prove immutable release authority or complete entitlement state. The page treats the tenant identifier only as an address.</p>
    </div>
    </div>
    {openItem && <MarketplaceDetail item={openItem} onClose={() => setOpenItem(null)} onOpenPaige={expandRail} restoreFocus={restoreFocus} />}
  </div>;
};
