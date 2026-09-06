import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, ChevronLeft, ExternalLink, Maximize2, Minimize2, Pause, Play, RefreshCw, Rotate3D, RotateCcw, X } from "lucide-react";
import { useN8nSpineReadiness } from "./data/useN8nSpineReadiness";
import { N8N_ACTION_WORDS, N8N_API_WORDS, N8N_MCP_WORDS } from "../../supabase/functions/_shared/paige-spine/domains/n8nReadiness";
import { useCommandCenter } from "./data/useCommandCenter";
import { useSoloKnowledge } from "./data/useSoloKnowledge";
import {
  readMindOrbitEnabled,
  writeMindOrbitEnabled,
  readMindMotionChoice,
  writeMindMotionChoice,
  readMindDismissed,
  writeMindDismissed,
  type MindMotionChoice,
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
// throwaway probe placed under `.mind-workspace` — the element that DEFINES --sig-* (they map to the
// theme's --pg-* chain). Falls back to the pack values when that element is not yet in the DOM (first
// paint / SSR / jsdom); never probes an element that lacks the tokens (that would return the inherited
// ink colour for all six and silently collapse the palette).
function resolveSignalColors(dark: boolean): Record<MindSignalState, number> {
  const fallback = SIGNAL_FALLBACK[dark ? "dark" : "light"];
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return { ...fallback };
  const host = document.querySelector(".mind-workspace");
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
  const [motionChoice, setMotionChoice] = useState<MindMotionChoice>(() => readMindMotionChoice(preferenceScope));
  const [osReduced, setOsReduced] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readMindDismissed(preferenceScope));
  const [orbUnavailable, setOrbUnavailable] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [dark, setDark] = useState(true);
  const [announcement, setAnnouncement] = useState("Mind presentation orbit is visual only. Tenant activity is unchanged.");

  const rootRef = useRef<HTMLElement>(null);
  const recordsRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const knownIds = useRef<Set<string> | null>(null);
  // Was the orb canvas the last real focus target? Tracked so a canvas re-mount (a node-structure
  // change from a data refresh, which bumps `orbKey`) can hand keyboard focus back to the fresh
  // canvas instead of dropping it to <body>. We set it from focusin only: a focusout to <body> (which
  // is exactly what the old canvas being removed produces) must NOT clear it, or the restore no-ops.
  const orbHadFocus = useRef(false);

  // Effective reduced-motion: an explicit user choice OVERRIDES the OS default in both directions;
  // absent a choice ("system"), follow the OS. This is what lets the ambient orbit run for a user
  // who wants it even when their OS asks to reduce motion — and still respects the OS by default.
  const reduced = motionChoice === "reduced" ? true : motionChoice === "full" ? false : osReduced;
  // The orb is ACTUALLY orbiting only when the presentation orbit is enabled AND motion is not
  // reduced — so the control label/state reflects that, never "Pause orbit" over a still orb.
  const orbiting = presentationOrbit && !reduced;

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
            actionNeeded: n8n.data.api.actionNeeded !== "none", // enum, not boolean: only "none" means no action
            detail: `Workflow count: ${n8n.data.api.workflowCount ?? "unavailable"}. ${N8N_ACTION_WORDS[n8n.data.api.actionNeeded]}. API visibility does not grant MCP authority. Current-state evidence, not Rail history.`,
          },
          mcp: {
            words: N8N_MCP_WORDS[n8n.data.mcp.state],
            action: N8N_ACTION_WORDS[n8n.data.mcp.actionNeeded],
            lastSuccessfulCheck: n8n.data.mcp.lastSuccessfulCheck,
            actionNeeded: n8n.data.mcp.actionNeeded !== "none", // enum, not boolean: only "none" means no action
            detail: `Approved workflows: ${n8n.data.mcp.approvedWorkflowCount ?? "unavailable"}. Approved tools: ${n8n.data.mcp.approvedToolCount ?? "unavailable"}. ${N8N_ACTION_WORDS[n8n.data.mcp.actionNeeded]}. OAuth consent is not approval to execute. Current-state evidence, not Rail history.`,
          },
        }
      : null,
    approvals: command.approvals.map((a) => ({ id: a.id, title: a.title, dept: a.dept, type: a.type, aging: a.aging })),
  }), [knowledge.docs, n8n.data, command.approvals]);

  const domains = useMemo(() => buildMindDomains(inputs), [inputs]);
  const records = useMemo(() => allRecords(domains), [domains]);
  const inDomain = useMemo(
    () => (domainFilter === "all" ? records : records.filter((r) => r.domain === domainFilter)),
    [domainFilter, records],
  );
  // Non-destructive dismissal: a dismissed card is hidden from the list only (the record stays in the
  // orb and is restorable) — §13/§70, nothing governed is deleted.
  const visible = useMemo(() => inDomain.filter((r) => !dismissed.has(r.id)), [inDomain, dismissed]);
  const dismissedCount = useMemo(() => records.filter((r) => dismissed.has(r.id)).length, [records, dismissed]);
  // Dismissed WITHIN the current filter — so an all-cleared filtered view says "cleared", not the
  // domain's honest-empty copy (a record that's merely dismissed still exists, §13).
  const dismissedInDomain = useMemo(() => inDomain.filter((r) => dismissed.has(r.id)).length, [inDomain, dismissed]);

  // Resolve the live --sig-* tokens in a POST-COMMIT effect, not in render: resolveSignalColors
  // mutates the DOM (appends/removes a probe span), which is impure in a useMemo (concurrent-mode
  // hazard) and — because the default theme is dark and `dark` never flips after mount on a dark
  // shell — would run exactly once during first render, before `.mind-workspace` is in the DOM, and
  // silently return the constant fallback for the WHOLE session. Running it here (after the element
  // is committed) makes the live-token path actually exercise for BOTH themes; the vetted fallback
  // (mirrors the --pg-* chain) is only the first-paint value, replaced on the next tick.
  const [signalColors, setSignalColors] = useState<Record<MindSignalState, number>>(() => resolveSignalColors(true));
  useEffect(() => {
    setSignalColors(resolveSignalColors(dark));
  }, [dark]);
  const orbNodes = useMemo(() => buildOrbNodes(domains, (s) => signalColors[s]), [domains, signalColors]);
  const orbRings = useMemo(() => buildOrbRings((s) => signalColors[s]), [signalColors]);
  // The engine sizes its instanced mesh at init and setData only recolours in place. Re-mount the
  // canvas (fresh context) ONLY when the node STRUCTURE changes (records added/removed/reordered);
  // recolour/theme/focus keep the same ids, so those reconcile in place with no rotation jump (§28).
  const orbKey = useMemo(() => orbNodes.map((n) => n.id).join("|"), [orbNodes]);

  // Track whether the orb canvas holds focus. Set true when it gains focus; cleared only when a
  // DIFFERENT real element gains focus (never on a focusout to <body>, which is what removing the
  // focused canvas produces) — so the flag survives the re-mount and the layout effect below can
  // restore focus to the fresh canvas.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.classList?.contains("mind-canvas")) orbHadFocus.current = true;
      else if (t !== document.body) orbHadFocus.current = false;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // When a node-structure change re-mounts the canvas (fresh `orbKey`) and the OLD canvas had
  // keyboard focus, return focus to the new canvas so an arrow-key user is not dropped to <body>
  // (a11y-as-function; skip the initial mount so we never steal focus on first paint).
  const orbKeySeen = useRef(orbKey);
  useLayoutEffect(() => {
    if (orbKey === orbKeySeen.current) return;
    orbKeySeen.current = orbKey;
    if (orbHadFocus.current && !orbUnavailable && typeof document !== "undefined") {
      document.querySelector<HTMLElement>(".mind-canvas")?.focus({ preventScroll: true });
    }
  }, [orbKey, orbUnavailable]);

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

  // Restore focus to whatever opened the drawer. If that element was removed while the drawer was
  // open (the canvas re-mounting on a background data refresh detaches the stored `.mind-canvas`
  // launcher), focusing it would silently drop to <body> — so fall back to the fresh canvas, then
  // the first record, then the surface root, never nothing (a11y-as-function).
  const restoreLauncherFocus = useCallback(() => {
    const el = launcherRef.current;
    if (el && typeof document !== "undefined" && document.contains(el)) { el.focus(); return; }
    const fallback =
      document.querySelector<HTMLElement>(".mind-canvas") ??
      rootRef.current?.querySelector<HTMLElement>("[data-mind-record]") ??
      rootRef.current;
    fallback?.focus?.();
  }, []);

  // Drawer: focus in, Escape closes + restores, trap Tab while expanded.
  useEffect(() => {
    if (!selected) return;
    requestAnimationFrame(() => drawerCloseRef.current?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelected(null); setExpanded(false); requestAnimationFrame(() => restoreLauncherFocus()); return; }
      if (event.key !== "Tab" || !expanded || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, selected, restoreLauncherFocus]);

  const chooseRecord = useCallback((record: MindRecord, launcher?: HTMLElement | null) => {
    if (launcher) launcherRef.current = launcher;
    setSelected(record);
    setAnnouncement(`${record.title}. ${record.truth}.`);
  }, []);

  const onPick = useCallback((node: MindOrbNodeLite) => {
    // Return focus to the orb (not <body>) when a record is opened via keyboard/click on the canvas.
    if (node.record) { chooseRecord(node.record, document.querySelector<HTMLElement>(".mind-canvas")); return; }
    // A hub (or ghost) pick focuses that domain and filters the list to it.
    setDomainFilter(node.domain);
    const def = MIND_DOMAINS.find((d) => d.key === node.domain);
    setAnnouncement(`Focused ${def?.name ?? node.domain}.`);
  }, [chooseRecord]);

  const focusDomainFromCallout = (key: MindDomainKey) => {
    setDomainFilter((cur) => (cur === key ? "all" : key));
  };

  const closeInspector = () => { setSelected(null); setExpanded(false); requestAnimationFrame(() => restoreLauncherFocus()); };
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
    if (orbiting) {
      writeMindOrbitEnabled(preferenceScope, false);
      setPresentationOrbit(false);
      setAnnouncement("Presentation orbit paused. Tenant activity is unchanged.");
      return;
    }
    // Resume: enable the orbit AND, if motion was reduced (by the OS or a prior choice), lift that
    // block so one click reliably starts the orbit whatever had frozen it (explicit user opt-in).
    writeMindOrbitEnabled(preferenceScope, true);
    setPresentationOrbit(true);
    if (reduced) { writeMindMotionChoice(preferenceScope, "full"); setMotionChoice("full"); }
    setAnnouncement("Presentation orbit resumed. It does not represent tenant activity.");
  };
  const toggleReduced = () => {
    // Explicit override, persisted per user+tenant: flip AWAY from the current effective state so one
    // click always changes what the viewer sees, whatever the OS default was.
    const next: MindMotionChoice = reduced ? "full" : "reduced";
    writeMindMotionChoice(preferenceScope, next);
    setMotionChoice(next);
    setAnnouncement(next === "reduced" ? "Reduced motion on. The orb is still." : "Reduced motion off. The orb resumes its calm orbit.");
  };
  const resetView = () => { setDomainFilter("all"); setResetToken((t) => t + 1); setAnnouncement("View reset. Showing all domains, recentred."); };
  const dismissRecord = useCallback((id: string, title: string, fromEl?: HTMLElement | null) => {
    // Record the clicked X's position so focus can move to whatever fills its slot after the re-render
    // (never dropped to <body> — the same standard this file holds for the drawer and orb re-mount).
    const before = recordsRef.current ? [...recordsRef.current.querySelectorAll<HTMLElement>(".mind-record-dismiss")] : [];
    const idx = fromEl ? before.indexOf(fromEl) : -1;
    setDismissed((cur) => { const next = new Set(cur); next.add(id); writeMindDismissed(preferenceScope, next); return next; });
    setAnnouncement(`${title} cleared from the activity list. The record stays in the orb — restore it with Restore dismissed.`);
    requestAnimationFrame(() => {
      const after = recordsRef.current ? [...recordsRef.current.querySelectorAll<HTMLElement>(".mind-record-dismiss")] : [];
      const target = (idx >= 0 && after[Math.min(idx, after.length - 1)])
        || recordsRef.current?.querySelector<HTMLElement>(".mind-records-restore")
        || recordsRef.current;
      target?.focus?.();
    });
  }, [preferenceScope]);
  const restoreDismissed = useCallback(() => {
    writeMindDismissed(preferenceScope, new Set());
    setDismissed(new Set());
    setAnnouncement("Dismissed cards restored to the activity list.");
  }, [preferenceScope]);

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
                    key={orbKey}
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

                {/* Orb controls. The presentation preferences (orbit pause, reduced motion) persist
                    per user+tenant and apply wherever the orb DOES start, so they stay available even
                    on a device that fell back to the list — reduced-motion is an accessibility control
                    and must never disappear when a feature degrades (§70). The orb-NAVIGATION
                    affordances (drag/scroll/keyboard hint, Reset view) act only on a live canvas, so
                    they are hidden when the 3D view is unavailable rather than shown as dead controls. */}
                <div className="mind-orb-controls" role="group" aria-label="Orbit controls">
                  {!orbUnavailable && (
                    <span className="mind-orb-hint" aria-hidden="true"><Rotate3D size={13} /> Drag · scroll · keyboard</span>
                  )}
                  <button type="button" aria-pressed={!orbiting} onClick={togglePresentationOrbit}>
                    {orbiting ? <Pause size={13} /> : <Play size={13} />}{orbiting ? "Pause orbit" : "Resume orbit"}
                  </button>
                  {!orbUnavailable && (
                    <button type="button" onClick={resetView}><Rotate3D size={13} />Reset view</button>
                  )}
                  <button type="button" aria-pressed={reduced} onClick={toggleReduced}>Reduced motion</button>
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

              {/* Record list — the accessible instrument (orb is not a novelty that buries records).
                  Each card can be CLEARED from the activity list (non-destructive: the record stays in
                  the orb and is restorable), so the viewer can work down what's in the brain. */}
              <div className="mind-records" role="group" aria-label="Grounded Mind records" ref={recordsRef} tabIndex={-1}>
                {visible.map((record) => (
                  <div key={record.id} className="mind-record-card">
                    <button type="button" data-mind-record onClick={(event) => chooseRecord(record, event.currentTarget)}>
                      <i style={{ background: `var(${SIGNAL_TOKEN[record.state]})` }} />
                      <span><strong>{record.title}</strong><small>{record.owner} · {record.when}</small></span>
                      <b>{record.truth}</b>
                    </button>
                    <button type="button" className="mind-record-dismiss" aria-label={`Clear ${record.title} from the activity list`}
                      onClick={(event) => dismissRecord(record.id, record.title, event.currentTarget)}><X size={12} /></button>
                  </div>
                ))}
                {!visible.length && <p>{
                  dismissedInDomain > 0
                    ? (domainFilter === "all"
                        ? "You've cleared every card from the activity list. The records still live in the orb — restore them below."
                        : `${MIND_DOMAINS.find((d) => d.key === domainFilter)?.name}: every card here is cleared. The records still live in the orb — restore them below.`)
                    : (domainFilter === "all"
                        ? "Nothing durable is indexed here yet. No sample records or invented relationships are substituted."
                        : `${MIND_DOMAINS.find((d) => d.key === domainFilter)?.name}: ${domains.find((d) => d.def.key === domainFilter)?.empty?.body ?? "Nothing on file yet."}`)
                }</p>}
                {dismissedCount > 0 && (
                  <button type="button" className="mind-records-restore" onClick={restoreDismissed}>
                    <RotateCcw size={12} />Restore {dismissedCount} dismissed
                  </button>
                )}
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
