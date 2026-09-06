import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, ChevronLeft, ExternalLink, Maximize2, Minimize2, Pause, Play, RefreshCw, Rotate3D, X } from "lucide-react";
import { useN8nSpineReadiness } from "./data/useN8nSpineReadiness";
import { N8N_ACTION_WORDS, N8N_API_WORDS, N8N_MCP_WORDS } from "../../supabase/functions/_shared/paige-spine/domains/n8nReadiness";
import { useCommandCenter } from "./data/useCommandCenter";
import { useSoloKnowledge } from "./data/useSoloKnowledge";
import {
  readMindOrbitEnabled,
  writeMindOrbitEnabled,
  type MindOrbitPreferenceScope,
} from "./mindOrbitPreference";
import { MindOrbCanvas } from "./mind-orb/MindOrbCanvas";
import {
  buildMindDomains,
  buildOrbNodes,
  buildOrbRings,
  allRecords,
  MIND_DOMAINS,
  SIGNAL_LABEL,
  SIGNAL_TOKEN,
  type MindDomainKey,
  type MindInputs,
  type MindOrbNodeLite,
  type MindRecord,
  type MindSignalState,
} from "./mind-orb/mindDomains";
import "./solo-mind-workspace.css";

// Callout placement ports the approved prototype's slots (offers has no callout — it lives in the orb
// + legend only). §00: this ports the approved design, it does not invent one.
const CALLOUT_SLOT: Partial<Record<MindDomainKey, string>> = {
  identity: "co-tl",
  people: "co-ml",
  goals: "co-bl",
  systems: "co-tr",
  knowledge: "co-br",
};

// Fallback signal palette (the pack's --sig-* token values) for when getComputedStyle cannot resolve
// a CSS var — jsdom tests and the very first paint. The live path resolves the real token so this is
// only a safety net; kept in step with the design system's --sig-* chain (§13: mirrors, never invents).
const SIGNAL_FALLBACK: Record<"dark" | "light", Record<MindSignalState, number>> = {
  dark: { owner_confirmed: 0xd4a752, connection_sourced: 0x9b8de0, source_refreshed: 0x8fa9c4, needs_confirmation: 0x8fd1ae, legacy_sourced: 0xedc17f, unavailable: 0xeda093 },
  light: { owner_confirmed: 0xc9a96a, connection_sourced: 0x655a96, source_refreshed: 0x4d6f92, needs_confirmation: 0x327458, legacy_sourced: 0x986322, unavailable: 0xa5483d },
};

// Resolve the six --sig-* tokens to hex ints in the CURRENT theme. Reads the live CSS chain via a
// throwaway probe under an on-page [data-pg] host; falls back to the pack values when unavailable.
function resolveSignalColors(dark: boolean): Record<MindSignalState, number> {
  const fallback = SIGNAL_FALLBACK[dark ? "dark" : "light"];
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return { ...fallback };
  const host = document.querySelector("[data-pg]") ?? document.body;
  if (!host) return { ...fallback };
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:0;height:0;pointer-events:none";
  host.appendChild(probe);
  const out = {} as Record<MindSignalState, number>;
  try {
    (Object.keys(SIGNAL_TOKEN) as MindSignalState[]).forEach((state) => {
      probe.style.color = "";
      probe.style.color = `var(${SIGNAL_TOKEN[state]})`;
      const m = getComputedStyle(probe).color.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      out[state] = m ? ((parseInt(m[1], 10) << 16) | (parseInt(m[2], 10) << 8) | parseInt(m[3], 10)) : fallback[state];
    });
  } finally {
    host.removeChild(probe);
  }
  return out;
}

function detectDark(el: HTMLElement | null): boolean {
  const root = el?.closest("[data-pg]") as HTMLElement | null;
  return (root?.dataset.pg ?? "dark") !== "light";
}

const DOMAIN_ICON: Record<MindDomainKey, string> = {
  identity: "🏢", people: "👥", goals: "⌦", systems: "🗄", knowledge: "📗", offers: "🏷",
};

type Props = {
  accountContext?: { accountName?: string | null; accountType?: string | null } | null;
  openPaige?: () => void;
  preferenceScope?: MindOrbitPreferenceScope | null;
};

export function SoloMindWorkspace({ accountContext, openPaige, preferenceScope }: Props) {
  const knowledge = useSoloKnowledge();
  const command = useCommandCenter();
  const n8n = useN8nSpineReadiness();

  const [domainFilter, setDomainFilter] = useState<MindDomainKey | "all">("all");
  const [selected, setSelected] = useState<MindRecord | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [presentationOrbit, setPresentationOrbit] = useState(() => readMindOrbitEnabled(preferenceScope));
  const [reducedToggle, setReducedToggle] = useState(false);
  const [osReduced, setOsReduced] = useState(false);
  const [orbUnavailable, setOrbUnavailable] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [dark, setDark] = useState(true);
  const [announcement, setAnnouncement] = useState("Mind presentation orbit is visual only. Tenant activity is unchanged.");

  const rootRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const knownIds = useRef<Set<string> | null>(null);

  const reduced = reducedToggle || osReduced;

  // Honour the OS reduced-motion setting, not just the toggle (a11y honesty).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setOsReduced(e.matches);
    if (mq.addEventListener) { mq.addEventListener("change", onChange); return () => mq.removeEventListener("change", onChange); }
    mq.addListener?.(onChange); return () => mq.removeListener?.(onChange);
  }, []);

  // Track the active theme so orb colours follow Mineral/Obsidian.
  useEffect(() => {
    const el = rootRef.current;
    setDark(detectDark(el));
    const host = el?.closest("[data-pg]") as HTMLElement | null;
    if (!host || typeof MutationObserver === "undefined") return;
    const obs = new MutationObserver(() => setDark(detectDark(el)));
    obs.observe(host, { attributes: true, attributeFilter: ["data-pg"] });
    return () => obs.disconnect();
  }, []);

  const inputs = useMemo<MindInputs>(() => ({
    knowledge: knowledge.docs.map((doc) => ({
      id: doc.id, title: doc.title, summary: doc.summary, source: doc.source,
      when: doc.when, createdAt: doc.createdAt, chunkCount: doc.chunkCount, domain: doc.domain,
    })),
    n8n: n8n.data
      ? {
          api: {
            words: N8N_API_WORDS[n8n.data.api.state],
            action: N8N_ACTION_WORDS[n8n.data.api.actionNeeded],
            lastSuccessfulCheck: n8n.data.api.lastSuccessfulCheck,
            actionNeeded: !!n8n.data.api.actionNeeded,
            detail: `Workflow count: ${n8n.data.api.workflowCount ?? "unavailable"}. ${N8N_ACTION_WORDS[n8n.data.api.actionNeeded]}. API visibility does not grant MCP authority. Current-state evidence, not Rail history.`,
          },
          mcp: {
            words: N8N_MCP_WORDS[n8n.data.mcp.state],
            action: N8N_ACTION_WORDS[n8n.data.mcp.actionNeeded],
            lastSuccessfulCheck: n8n.data.mcp.lastSuccessfulCheck,
            actionNeeded: !!n8n.data.mcp.actionNeeded,
            detail: `Approved workflows: ${n8n.data.mcp.approvedWorkflowCount ?? "unavailable"}. Approved tools: ${n8n.data.mcp.approvedToolCount ?? "unavailable"}. ${N8N_ACTION_WORDS[n8n.data.mcp.actionNeeded]}. OAuth consent is not approval to execute. Current-state evidence, not Rail history.`,
          },
        }
      : null,
    approvals: command.approvals.map((a) => ({ id: a.id, title: a.title, dept: a.dept, type: a.type, aging: a.aging })),
  }), [knowledge.docs, n8n.data, command.approvals]);

  const domains = useMemo(() => buildMindDomains(inputs), [inputs]);
  const records = useMemo(() => allRecords(domains), [domains]);
  const visible = useMemo(
    () => (domainFilter === "all" ? records : records.filter((r) => r.domain === domainFilter)),
    [domainFilter, records],
  );

  const signalColors = useMemo(() => resolveSignalColors(dark), [dark]);
  const orbNodes = useMemo(() => buildOrbNodes(domains, (s) => signalColors[s]), [domains, signalColors]);
  const orbRings = useMemo(() => buildOrbRings((s) => signalColors[s]), [signalColors]);

  const loading = knowledge.loading || command.loading || n8n.loading;
  const partial = !!knowledge.error || command.isError || !!n8n.error;

  // Announce a newly-observed grounded record (never on a stale/errored load; never fabricated).
  useEffect(() => {
    const ids = new Set(records.map((r) => r.id));
    if (!loading && !partial && knownIds.current !== null) {
      const added = records.find((r) => !knownIds.current?.has(r.id));
      if (added) setAnnouncement(`${added.title} was newly observed from ${added.source}. ${added.truth}.`);
    }
    if (!loading && !partial) knownIds.current = ids;
  }, [loading, partial, records]);

  // Keep the drawer selection valid if the underlying record list changes.
  useEffect(() => {
    setSelected((cur) => (cur ? records.find((r) => r.id === cur.id) ?? null : cur));
  }, [records]);

  // Drawer: focus in, Escape closes + restores, trap Tab while expanded.
  useEffect(() => {
    if (!selected) return;
    requestAnimationFrame(() => drawerCloseRef.current?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelected(null); setExpanded(false); requestAnimationFrame(() => launcherRef.current?.focus()); return; }
      if (event.key !== "Tab" || !expanded || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, selected]);

  const chooseRecord = useCallback((record: MindRecord, launcher?: HTMLElement | null) => {
    if (launcher) launcherRef.current = launcher;
    setSelected(record);
    setAnnouncement(`${record.title}. ${record.truth}.`);
  }, []);

  const onPick = useCallback((node: MindOrbNodeLite) => {
    if (node.record) { chooseRecord(node.record); return; }
    // A hub (or ghost) pick focuses that domain and filters the list to it.
    setDomainFilter(node.domain);
    const def = MIND_DOMAINS.find((d) => d.key === node.domain);
    setAnnouncement(`Focused ${def?.name ?? node.domain}.`);
  }, [chooseRecord]);

  const focusDomainFromCallout = (key: MindDomainKey) => {
    setDomainFilter((cur) => (cur === key ? "all" : key));
  };

  const closeInspector = () => { setSelected(null); setExpanded(false); requestAnimationFrame(() => launcherRef.current?.focus()); };
  const refresh = () => { knowledge.refresh(); command.refresh(); void n8n.refresh(); setAnnouncement("Refreshing the current record sources. This is not a scan."); };
  const openExistingPaige = () => {
    setSelected(null); setExpanded(false);
    setAnnouncement("PAIGE opened. No Mind context was attached or prepared.");
    openPaige?.();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[aria-label="Fold PAIGE conversation"]')?.focus({ preventScroll: true });
    }));
  };
  const togglePresentationOrbit = () => {
    const next = !presentationOrbit;
    writeMindOrbitEnabled(preferenceScope, next);
    setPresentationOrbit(next);
    setAnnouncement(next ? "Presentation orbit resumed. It does not represent tenant activity." : "Presentation orbit paused. Tenant activity is unchanged.");
  };
  const toggleReduced = () => {
    setReducedToggle((v) => { const next = !v; setAnnouncement(next ? "Reduced motion on. The orb is still." : "Reduced motion off."); return next; });
  };
  const resetView = () => { setDomainFilter("all"); setResetToken((t) => t + 1); setAnnouncement("View reset. Showing all domains, recentred."); };

  const domainVerdict = (key: MindDomainKey) => domains.find((d) => d.def.key === key)?.verdict ?? "PARTIAL";
  const domainSignalState = (key: MindDomainKey): MindSignalState => {
    const d = domains.find((x) => x.def.key === key);
    if (!d) return "needs_confirmation";
    if (d.verdict === "UNAVAILABLE") return "unavailable";
    return d.records[0]?.state ?? "needs_confirmation";
  };
  const truthClass = (truth: string) =>
    truth === "LIVE SOURCE" ? "mind-truth--live" : truth === "UNAVAILABLE" ? "mind-truth--unavail" : truth === "PROPOSED" ? "mind-truth--proposed" : "mind-truth--partial";

  const orbLabel = `Interactive Mind knowledge orb. Governed records are positioned by domain and coloured by their canonical source state. ${presentationOrbit && !reduced ? "A slow presentation orbit shows depth." : "The orb is still."} Presentation motion does not represent tenant activity. Drag to rotate, scroll or +/- to zoom, arrow keys to rotate, and Enter to inspect the front record.`;

  return (
    <section className="mind-workspace" aria-labelledby="mind-title" ref={rootRef}>
      <div className="mind-scroll-owner" {...(expanded ? { inert: "" } : {})} aria-hidden={expanded ? true : undefined}>
        <header className="mind-heading">
          <div>
            <p className="mind-eyebrow">{accountContext?.accountName || "Solo account"} · Solo · Governed knowledge</p>
            <h1 id="mind-title" className="mind-sr-only">Mind</h1>
            <p>What PAIGE knows about your business — by domain, with honest source provenance, and without hidden reasoning.</p>
          </div>
          <div className="mind-actions">
            <span className="mind-truth mind-truth--proposed">PROPOSED IA</span>
            <button type="button" className="mind-button" onClick={refresh}><RefreshCw size={14} aria-hidden="true" />Refresh records</button>
            <button type="button" className="mind-button mind-button--paige" onClick={openExistingPaige}>✦ Open PAIGE</button>
          </div>
        </header>
        <p className="mind-paige-note" role="note">PARTIAL · Opening PAIGE uses the one existing workspace. No Mind context was attached or prepared.</p>

        {loading ? (
          <div className="mind-state" role="status"><BrainCircuit aria-hidden="true" /><h2>Resolving this account's Mind…</h2><p>Previous-account records are not shown while grounded sources resolve.</p></div>
        ) : (
          <>
            {partial && <div className="mind-source-warning" role="status"><strong>Mind has partial coverage</strong><span>No missing source is treated as empty. Retry refreshes read-only records.</span></div>}
            <section className="mind-panel" aria-labelledby="mind-brain-title">
              <div className="mind-panel-head">
                <div><h2 id="mind-brain-title">PAIGE knowledge orb</h2><p>Each node is a governed record, coloured by its source signal. The slow orbit shows depth only — it is not tenant activity.</p></div>
                <span className="mind-truth mind-truth--proposed">INTERACTIVE 3D · PRESENTATION</span>
              </div>

              <div className="mind-stage">
                {orbUnavailable ? (
                  <div className="mind-orb-fallback" role="note">
                    <BrainCircuit aria-hidden="true" />
                    <div><strong>Showing your records as a list</strong><span>This device couldn't start the 3D view. Nothing is hidden — every governed record is in the list below, with the same evidence.</span></div>
                  </div>
                ) : (
                  <MindOrbCanvas
                    className="mind-canvas"
                    nodes={orbNodes}
                    rings={orbRings}
                    dark={dark}
                    running={presentationOrbit}
                    reduced={reduced}
                    onPick={onPick}
                    onUnavailable={(reason) => setOrbUnavailable(reason)}
                    focusDomain={domainFilter === "all" ? null : domainFilter}
                    resetToken={resetToken}
                    ariaLabel={orbLabel}
                  />
                )}

                {/* Domain callouts (approved slots) — a keyboard-complete path to focus each domain. */}
                {!orbUnavailable && (
                  <div className="mind-callouts" role="group" aria-label="Knowledge domains">
                    {MIND_DOMAINS.filter((d) => CALLOUT_SLOT[d.key]).map((d) => {
                      const state = domainSignalState(d.key);
                      return (
                        <button key={d.key} type="button" className={`mind-callout ${CALLOUT_SLOT[d.key]}`} aria-pressed={domainFilter === d.key}
                          aria-label={`${d.name} — ${SIGNAL_LABEL[state]}. Focus this domain.`} onClick={() => focusDomainFromCallout(d.key)}>
                          <span className="mind-callout-plate" aria-hidden="true">{DOMAIN_ICON[d.key]}</span>
                          <span><span className="mind-callout-name">{d.name}</span><span className="mind-callout-state"><i className="mind-dot" style={{ background: `var(${SIGNAL_TOKEN[state]})` }} />{SIGNAL_LABEL[state]}</span></span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Orbital controls */}
                <div className="mind-orb-controls" role="group" aria-label="Orbit controls">
                  <span className="mind-orb-hint" aria-hidden="true"><Rotate3D size={13} /> Drag · scroll · keyboard</span>
                  <button type="button" aria-pressed={!presentationOrbit} onClick={togglePresentationOrbit}>
                    {presentationOrbit ? <Pause size={13} /> : <Play size={13} />}{presentationOrbit ? "Pause orbit" : "Resume orbit"}
                  </button>
                  <button type="button" onClick={resetView}><Rotate3D size={13} />Reset view</button>
                  <button type="button" aria-pressed={reducedToggle} onClick={toggleReduced}>Reduced motion</button>
                </div>

                {/* Source-signal legend (the approved palette) */}
                <aside className="mind-legend" aria-label="Source signals">
                  <h4>Source signals</h4>
                  {(["owner_confirmed", "connection_sourced", "source_refreshed", "needs_confirmation", "legacy_sourced", "unavailable"] as MindSignalState[]).map((s) => (
                    <div key={s} className="mind-legend-row"><i className="mind-dot" style={{ background: `var(${SIGNAL_TOKEN[s]})` }} />{SIGNAL_LABEL[s]}</div>
                  ))}
                </aside>

                <p className="mind-stage-caption">This view reflects governed records and their source signals. It is not exhaustive, and presentation motion is not tenant activity.</p>
              </div>

              {/* Domain filter — the approved six domains */}
              <div className="mind-categories" role="group" aria-label="Filter Mind records by domain">
                <button type="button" aria-pressed={domainFilter === "all"} onClick={() => setDomainFilter("all")}><span>All domains</span><small>{records.length} GROUNDED</small></button>
                {MIND_DOMAINS.map((d) => {
                  const count = records.filter((r) => r.domain === d.key).length;
                  return (
                    <button key={d.key} type="button" aria-pressed={domainFilter === d.key} onClick={() => setDomainFilter(d.key)}
                      style={{ "--mind-category": `var(${SIGNAL_TOKEN[domainSignalState(d.key)]})` } as React.CSSProperties}>
                      <span>{d.name}</span><small>{count ? `${count} · ${domainVerdict(d.key)}` : domainVerdict(d.key)}</small>
                    </button>
                  );
                })}
              </div>

              {/* Record list — the accessible instrument (orb is not a novelty that buries records) */}
              <div className="mind-records" role="group" aria-label="Grounded Mind records">
                {visible.map((record) => (
                  <button key={record.id} type="button" data-mind-record onClick={(event) => chooseRecord(record, event.currentTarget)}>
                    <i style={{ background: `var(${SIGNAL_TOKEN[record.state]})` }} />
                    <span><strong>{record.title}</strong><small>{record.owner} · {record.when}</small></span>
                    <b>{record.truth}</b>
                  </button>
                ))}
                {!visible.length && <p>{domainFilter === "all" ? "Nothing durable is indexed here yet. No sample records or invented relationships are substituted." : `${MIND_DOMAINS.find((d) => d.key === domainFilter)?.name}: ${domains.find((d) => d.def.key === domainFilter)?.empty?.body ?? "Nothing on file yet."}`}</p>}
              </div>
            </section>
          </>
        )}
      </div>

      <div className="mind-announcement" aria-live="polite">{announcement}</div>

      {selected && (
        <aside ref={drawerRef} className={`mind-drawer${expanded ? " is-expanded" : ""}`} role="dialog" aria-modal={expanded ? "true" : "false"} aria-label="Mind record details">
          <header>
            <div><span className={`mind-truth ${truthClass(selected.truth)}`}>{selected.truth}</span><h2>{selected.title}</h2></div>
            <div>
              <button type="button" aria-label={expanded ? "Restore record drawer" : "Expand record drawer"} onClick={() => setExpanded((v) => !v)}>{expanded ? <Minimize2 /> : <Maximize2 />}</button>
              <button ref={drawerCloseRef} type="button" aria-label="Close Mind record details" onClick={closeInspector}><X /></button>
            </div>
          </header>
          <div className="mind-drawer-body">
            <section><h3>Record contract</h3><p>{selected.summary}</p></section>
            <section><h3>Source and provenance</h3><dl><dt>Current owner</dt><dd>{selected.owner}</dd><dt>Source</dt><dd>{selected.source}</dd><dt>Signal</dt><dd>{SIGNAL_LABEL[selected.state]}</dd><dt>Evidence</dt><dd>{selected.evidence}</dd><dt>Recorded</dt><dd>{selected.when}</dd></dl></section>
            <section><h3>Honesty boundary</h3><p>Mind indexes this attributable record. It does not infer private reasoning, causal relationships, or unavailable history.</p></section>
            <section><h3>Next safe action</h3><button type="button" className="mind-button" onClick={closeInspector}><ChevronLeft size={14} />Back to the orb</button><button type="button" className="mind-button mind-button--paige" onClick={openExistingPaige}><ExternalLink size={14} />Open PAIGE · PARTIAL</button></section>
          </div>
        </aside>
      )}
    </section>
  );
}
