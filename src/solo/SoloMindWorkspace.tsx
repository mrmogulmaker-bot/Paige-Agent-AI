import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, ChevronLeft, ExternalLink, Maximize2, Minimize2, Pause, Play, RefreshCw, Rotate3D, X } from "lucide-react";
import { useSystemsCheck, type SystemsCheckFinding } from "@/hooks/useSystemsCheck";
import { useN8nSpineReadiness } from "./data/useN8nSpineReadiness";
import { N8N_ACTION_WORDS, N8N_API_WORDS, N8N_MCP_WORDS } from "../../supabase/functions/_shared/paige-spine/domains/n8nReadiness";
import { useCommandCenter } from "./data/useCommandCenter";
import { useSoloKnowledge, type SoloKnowledgeDoc } from "./data/useSoloKnowledge";
import {
  readMindOrbitEnabled,
  writeMindOrbitEnabled,
  type MindOrbitPreferenceScope,
} from "./mindOrbitPreference";
import "./solo-mind-workspace.css";

type Truth = "LIVE SOURCE" | "PARTIAL" | "UNAVAILABLE" | "PROPOSED";
type Category = "recall" | "knowledge" | "skills" | "identity" | "judgment";
type MindRecord = {
  id: string; category: Category; title: string; summary: string; source: string;
  when: string; truth: Truth; color: string; evidence: string; owner: string;
};
type Pulse = { category: Category; truth: Truth; title: string; duration: number; elapsed: number; started: number; reduced: boolean };
type ProjectedRecord = { record: MindRecord; x: number; y: number; z: number; depth: number };
type PresentationFrame = { x: number; y: number; phase: number; last: number; resumeAt: number };

function advancePresentationFrame(frame: PresentationFrame, now: number, active: boolean) {
  const elapsed = Math.min(34, now - (frame.last || now));
  frame.last = now;
  if (!active) return false;
  frame.phase += elapsed * 0.00018;
  frame.y += elapsed * 0.000085;
  frame.x = Math.sin(frame.phase) * 0.055;
  return true;
}

const CATEGORIES: Array<{ key: Category; label: string; color: string; truth: Truth }> = [
  { key: "recall", label: "Recall", color: "#D4AD62", truth: "PARTIAL" },
  { key: "knowledge", label: "Knowledge", color: "#9D87F5", truth: "LIVE SOURCE" },
  { key: "skills", label: "Skills", color: "#66BFB2", truth: "UNAVAILABLE" },
  { key: "identity", label: "Identity", color: "#DB8D6D", truth: "PROPOSED" },
  { key: "judgment", label: "Judgment", color: "#7596C8", truth: "PARTIAL" },
];

function hash(value: string) {
  let out = 2166136261;
  for (let i = 0; i < value.length; i += 1) out = Math.imul(out ^ value.charCodeAt(i), 16777619);
  return out >>> 0;
}

function pointFor(record: MindRecord, index: number) {
  const seed = hash(record.id);
  const category = CATEGORIES.findIndex((item) => item.key === record.category);
  const angle = ((seed % 360) / 180) * Math.PI + category * 0.7;
  const vertical = (((seed >>> 8) % 180) / 180 - 0.5) * 1.25;
  const radius = 0.44 + ((seed >>> 16) % 48) / 100 + (index % 3) * 0.025;
  return { x: Math.cos(angle) * radius, y: vertical, z: Math.sin(angle) * radius };
}

function knowledgeRecord(doc: SoloKnowledgeDoc): MindRecord {
  return {
    id: `knowledge:${doc.id}`, category: "knowledge", title: doc.title,
    summary: doc.summary || "Indexed document metadata.", source: doc.source || "PAIGE Knowledge",
    when: doc.when || doc.createdAt, truth: "LIVE SOURCE", color: "#9D87F5",
    evidence: `${doc.chunkCount} indexed chunk${doc.chunkCount === 1 ? "" : "s"}${doc.domain ? ` · ${doc.domain}` : ""}`,
    owner: "PAIGE Knowledge",
  };
}

function findingRecord(finding: SystemsCheckFinding): MindRecord {
  return {
    id: `finding:${finding.id}`, category: "recall", title: finding.check_name || "Systems Check finding",
    summary: finding.paige_interpretation || "Latest persisted Systems Check evidence.",
    source: "Latest Systems Check snapshot", when: finding.created_at, truth: "PARTIAL", color: "#D4AD62",
    evidence: `${finding.domain || "Uncategorized"} · ${finding.status} · latest run only`, owner: "Systems Check",
  };
}

type Props = {
  accountContext?: { accountName?: string | null; accountType?: string | null } | null;
  openPaige?: () => void;
  preferenceScope?: MindOrbitPreferenceScope | null;
};

export function SoloMindWorkspace({ accountContext, openPaige, preferenceScope }: Props) {
  const knowledge = useSoloKnowledge();
  const systems = useSystemsCheck("tenant");
  const command = useCommandCenter();
  const n8n = useN8nSpineReadiness();
  const [category, setCategory] = useState<Category | "all">("all");
  const [selectedValue, setSelected] = useState<MindRecord | null>(null);
  const selected = selectedValue?.id.startsWith("n8n-readiness:") && !n8n.data ? null : selectedValue;
  const [expanded, setExpanded] = useState(false);
  const [rotation, setRotation] = useState({ x: -0.12, y: 0.18, zoom: 1 });
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [motionPhase, setMotionPhase] = useState(0);
  const [paused, setPaused] = useState(false);
  const [presentationOrbit, setPresentationOrbit] = useState(() => readMindOrbitEnabled(preferenceScope));
  const [announcement, setAnnouncement] = useState("Mind presentation orbit is visual only. Tenant activity is unchanged.");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const launcherRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; rx: number; ry: number; moved: boolean } | null>(null);
  const knownIds = useRef<Set<string> | null>(null);
  const projectedRef = useRef<ProjectedRecord[]>([]);
  const presentationRef = useRef<PresentationFrame>({ x: 0, y: 0, phase: 0, last: 0, resumeAt: 0 });
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const records = useMemo<MindRecord[]>(() => [
    ...(n8n.data ? [
      { id: "n8n-readiness:api", category: "recall" as const, title: "n8n API connection", summary: N8N_API_WORDS[n8n.data.api.state], source: "Integrations · current connection record", when: n8n.data.api.lastSuccessfulCheck ? `Last successful check: ${n8n.data.api.lastSuccessfulCheck}` : "No successful check proven", truth: "LIVE SOURCE" as const, color: "#D4AD62", evidence: `Workflow count: ${n8n.data.api.workflowCount ?? "unavailable"}. ${N8N_ACTION_WORDS[n8n.data.api.actionNeeded]}. API visibility does not grant MCP authority. Current-state evidence, not Rail history.`, owner: "Solo Integrations" },
      { id: "n8n-readiness:mcp", category: "recall" as const, title: "n8n Paige tools (MCP)", summary: N8N_MCP_WORDS[n8n.data.mcp.state], source: "Integrations · current authorization record", when: n8n.data.mcp.lastSuccessfulCheck ? `Last successful check: ${n8n.data.mcp.lastSuccessfulCheck}` : "No successful check proven", truth: "LIVE SOURCE" as const, color: "#D4AD62", evidence: `Approved workflows: ${n8n.data.mcp.approvedWorkflowCount ?? "unavailable"}. Approved tools: ${n8n.data.mcp.approvedToolCount ?? "unavailable"}. ${N8N_ACTION_WORDS[n8n.data.mcp.actionNeeded]}. OAuth consent is not approval to execute or change workflows. Current-state evidence, not Rail history.`, owner: "Solo Integrations" },
    ] : []),
    ...knowledge.docs.map(knowledgeRecord),
    ...systems.findings.map(findingRecord),
    ...command.approvals.map((approval) => ({
      id: `decision:${approval.id}`, category: "judgment" as const, title: approval.title,
      summary: "Current decision reference. The actionable queue remains in Systems Check.",
      source: "Waiting on you", when: approval.aging, truth: "LIVE SOURCE" as const, color: "#7596C8",
      evidence: `${approval.dept}${approval.type ? ` · ${approval.type}` : ""} · current pending item`, owner: "Systems Check decision queue",
    })),
  ], [command.approvals, knowledge.docs, systems.findings, n8n.data]);

  useEffect(() => {
    setSelected(current => current?.id.startsWith("n8n-readiness:") ? records.find(record => record.id === current.id) ?? null : current);
  }, [records]);

  const visible = useMemo(() => category === "all" ? records : records.filter((record) => record.category === category), [category, records]);
  const loading = knowledge.loading || systems.loading || command.loading || n8n.loading;
  const partial = !!knowledge.error || systems.isError || command.isError || n8n.error;

  useEffect(() => {
    const ids = new Set(records.map((record) => record.id));
    if (!loading && !partial && knownIds.current !== null) {
      const added = records.find((record) => !knownIds.current?.has(record.id));
      if (added) {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (selected) {
          setAnnouncement(`${added.title} was newly observed while record detail had focus. Motion was not started.`);
        } else {
          setPaused(false);
          setMotionPhase(reduced ? .5 : 0);
          setPulse({ category: added.category, truth: added.truth, title: added.title, duration: reduced ? 900 : 1800, elapsed: 0, started: performance.now(), reduced: !!reduced });
          setAnnouncement(`${added.title} was newly observed from ${added.source}. ${added.truth}.`);
        }
      }
    }
    if (!loading && !partial) knownIds.current = ids;
  }, [loading, partial, records, selected]);

  useEffect(() => {
    if (!pulse || paused) return;
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = pulse.elapsed + (now - pulse.started);
      setMotionPhase(Math.min(1, elapsed / pulse.duration));
      if (elapsed >= pulse.duration) {
        setPulse(null); setPaused(false); setMotionPhase(0);
        setAnnouncement(`${pulse.title} source-change motion complete. Mind is still.`);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, pulse]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    let context: CanvasRenderingContext2D | null = null;
    try { context = canvas?.getContext?.("2d") ?? null; } catch { context = null; }
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width || 760);
    const height = Math.max(1, rect.height || 440);
    const styles = getComputedStyle(canvas);
    const categoryColors = Object.fromEntries(CATEGORIES.map((item) => [
      item.key,
      styles.getPropertyValue(`--mind-${item.key}`).trim() || item.color,
    ])) as Record<Category, string>;
    const categoryColor = (category: Category) => categoryColors[category] || "#655A96";
    const numericStyle = (name: string, fallback: number) => {
      const parsed = Number.parseFloat(styles.getPropertyValue(name));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const textureAlpha = numericStyle("--mind-texture-alpha", .25);
    const nodeAlpha = numericStyle("--mind-node-alpha", .58);
    const nodeRingAlpha = numericStyle("--mind-node-ring-alpha", .42);
    const edgeColor = styles.getPropertyValue("--mind-edge").trim() || "rgba(169,158,204,.28)";
    const labelColor = styles.getPropertyValue("--mind-label").trim() || "#F6F2EA";
    const labelSurface = styles.getPropertyValue("--mind-label-surface").trim() || "rgba(16,14,20,.84)";
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio; canvas.height = height * ratio;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const cx = width / 2; const cy = height * 0.51; const scale = Math.min(width, height) * 0.52 * rotation.zoom;
    const viewX = rotation.x + presentationRef.current.x;
    const viewY = rotation.y + presentationRef.current.y;
    const cosY = Math.cos(viewY); const sinY = Math.sin(viewY);
    const cosX = Math.cos(viewX); const sinX = Math.sin(viewX);
    const textureCount = records.length <= 5 ? 90 : records.length <= 30 ? 240 : 480;
    context.globalAlpha = textureAlpha;
    for (let i = 0; i < textureCount; i += 1) {
      const angle = i * 2.399963 + viewY;
      const y = 1 - (i / Math.max(1, textureCount - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const x3 = Math.cos(angle) * radius; const z3 = Math.sin(angle) * radius;
      const y1 = y * Math.cos(viewX) - z3 * Math.sin(viewX);
      const z2 = y * Math.sin(viewX) + z3 * Math.cos(viewX);
      const depth = 1.8 / (2.45 - z2); const cat = CATEGORIES[i % CATEGORIES.length];
      context.fillStyle = categoryColor(cat.key); context.beginPath(); context.arc(cx + x3 * scale * depth, cy + y1 * scale * depth, .95 + depth * .72, 0, Math.PI * 2); context.fill();
    }
    const projected = visible.map((record, index) => {
      const p = pointFor(record, index);
      const x1 = p.x * cosY - p.z * sinY; const z1 = p.x * sinY + p.z * cosY;
      const y1 = p.y * cosX - z1 * sinX; const z2 = p.y * sinX + z1 * cosX;
      const depth = 1.8 / (2.35 - z2);
      return { record, x: cx + x1 * scale * depth, y: cy + y1 * scale * depth, z: z2, depth };
    }).sort((a, b) => a.z - b.z);
    projectedRef.current = projected;
    context.strokeStyle = edgeColor; context.lineWidth = 0.9;
    for (let i = 1; i < projected.length; i += 1) {
      const a = projected[i - 1]; const b = projected[i];
      if (a.record.category !== b.record.category) continue;
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
    for (const item of projected) {
      const active = pulse?.category === item.record.category;
      const eased = pulse?.reduced ? .7 : 1 - Math.pow(1 - motionPhase, 3);
      const radius = (selected?.id === item.record.id ? 6.5 : 3.2) * item.depth + (active ? 2 + Math.sin(eased * Math.PI) * 4 : 0);
      const color = categoryColor(item.record.category);
      context.globalAlpha = Math.min(1, nodeAlpha + item.depth * .36);
      context.fillStyle = color; context.beginPath(); context.arc(item.x, item.y, radius, 0, Math.PI * 2); context.fill();
      if (active || selected?.id === item.record.id) {
        context.globalAlpha = nodeRingAlpha; context.strokeStyle = color; context.lineWidth = 2;
        context.beginPath(); context.arc(item.x, item.y, radius + 6, 0, Math.PI * 2); context.stroke();
      }
    }
    const labelCount = width < 520 ? 1 : 3;
    context.font = "650 10px ui-sans-serif, system-ui, sans-serif";
    context.textBaseline = "middle";
    for (const item of projected.slice(-labelCount)) {
      const label = item.record.title.length > 34 ? `${item.record.title.slice(0, 32)}…` : item.record.title;
      const textWidth = context.measureText(label).width;
      const left = Math.min(width - textWidth - 18, Math.max(8, item.x + 9));
      const top = Math.min(height - 24, Math.max(8, item.y - 10));
      context.globalAlpha = .92; context.fillStyle = labelSurface; context.fillRect(left, top, textWidth + 12, 20);
      context.globalAlpha = 1; context.fillStyle = labelColor; context.fillText(label, left + 6, top + 10);
    }
    context.globalAlpha = 1;
  }, [motionPhase, pulse, records.length, rotation, selected?.id, visible]);
  const latestDrawRef = useRef(draw);
  const ownCanvas = useCallback((element: HTMLCanvasElement | null) => {
    canvasRef.current = element;
    setCanvasElement(element);
  }, []);

  useLayoutEffect(() => {
    latestDrawRef.current = draw;
    draw();
  }, [draw]);

  useLayoutEffect(() => {
    if (!canvasElement) return;
    latestDrawRef.current();
    const firstPaintFrame = requestAnimationFrame(() => latestDrawRef.current());
    if (typeof ResizeObserver === "undefined") return () => cancelAnimationFrame(firstPaintFrame);
    const observer = new ResizeObserver(() => latestDrawRef.current());
    observer.observe(canvasElement);
    return () => { cancelAnimationFrame(firstPaintFrame); observer.disconnect(); };
  }, [canvasElement]);

  useEffect(() => {
    const presentation = presentationRef.current;
    presentation.last = 0;
    if (!presentationOrbit || pulse || selected) {
      draw();
      return;
    }
    let frame = 0;
    const tick = (now: number) => {
      if (advancePresentationFrame(presentation, now, !dragRef.current && now >= presentation.resumeAt)) draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw, presentationOrbit, pulse, selected]);

  useEffect(() => {
    const themeRoot = canvasRef.current?.closest("[data-pg]");
    if (!themeRoot || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(draw);
    observer.observe(themeRoot, { attributes: true, attributeFilter: ["data-pg"] });
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    if (!selected) return;
    requestAnimationFrame(() => drawerCloseRef.current?.focus({ preventScroll: true }));
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelected(null); setExpanded(false); requestAnimationFrame(() => launcherRef.current?.focus()); return; }
      if (event.key !== "Tab" || !expanded || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [expanded, selected]);

  const chooseRecord = (record: MindRecord, launcher?: HTMLElement | null) => {
    if (launcher) launcherRef.current = launcher;
    setPulse(null); setPaused(false); setMotionPhase(0); setSelected(record); setAnnouncement(`${record.title}. ${record.truth}.`);
  };

  const closeInspector = () => { setSelected(null); setExpanded(false); requestAnimationFrame(() => launcherRef.current?.focus()); };
  const refresh = () => { knowledge.refresh(); systems.refresh(); command.refresh(); void n8n.refresh(); setAnnouncement("Refreshing the current record sources. This is not a scan."); };
  const openExistingPaige = () => {
    const command = document.querySelector<HTMLElement>("[data-tenant-paige-command]");
    setSelected(null); setExpanded(false); setPulse(null); setPaused(false);
    setAnnouncement("PAIGE opened. No Mind context was attached or prepared.");
    openPaige?.();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      (document.querySelector<HTMLElement>('[aria-label="Fold PAIGE conversation"]') ?? command)?.focus({ preventScroll: true });
    }));
  };
  const selectCategory = (next: Category | "all") => {
    const interrupted = !!pulse;
    setCategory(next); setSelected(null); setPulse(null); setPaused(false); setMotionPhase(0);
    setAnnouncement(interrupted ? `Source-change motion interrupted. ${next === "all" ? "All records" : CATEGORIES.find((item) => item.key === next)?.label} filter selected.` : `${next === "all" ? "All records" : CATEGORIES.find((item) => item.key === next)?.label} filter selected.`);
  };
  const selectFront = () => { const record = projectedRef.current.at(-1)?.record; if (record) chooseRecord(record, canvasRef.current); };
  const selectAt = (x: number, y: number) => { const nearest = projectedRef.current.reduce<{ item: ProjectedRecord | null; distance: number }>((best,item) => { const distance = Math.hypot(item.x-x,item.y-y); return distance < best.distance ? { item, distance } : best; }, { item:null,distance:18 }); if(nearest.item) chooseRecord(nearest.item.record,canvasRef.current); };
  const interruptPresentation = () => {
    presentationRef.current.resumeAt = performance.now() + 1400;
    presentationRef.current.last = 0;
  };

  const canvasKey = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = 0.12;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "Enter"].includes(event.key)) return;
    interruptPresentation();
    if (event.key === "ArrowLeft") setRotation((v) => ({ ...v, y: v.y - step }));
    else if (event.key === "ArrowRight") setRotation((v) => ({ ...v, y: v.y + step }));
    else if (event.key === "ArrowUp") setRotation((v) => ({ ...v, x: v.x - step }));
    else if (event.key === "ArrowDown") setRotation((v) => ({ ...v, x: v.x + step }));
    else if (event.key === "+" || event.key === "=") setRotation((v) => ({ ...v, zoom: Math.min(1.55, v.zoom + .1) }));
    else if (event.key === "-") setRotation((v) => ({ ...v, zoom: Math.max(.7, v.zoom - .1) }));
    else if (event.key === "Enter") selectFront();
    event.preventDefault();
    if (event.key !== "Enter") setAnnouncement(`Topology view adjusted. Zoom ${Math.round(rotation.zoom * 100)} percent. Direct manipulation is not tenant activity.`);
  };

  const presentationStatus = selected
    ? "FOCUS LOCK · STATIC"
    : presentationOrbit
      ? "PRESENTATION ORBIT · NOT ACTIVITY"
      : "PRESENTATION ORBIT PAUSED";
  const presentationButtonLabel = selected
    ? "Orbit paused for focus"
    : presentationOrbit
      ? "Pause orbit"
      : "Resume orbit";
  const canvasMotionDescription = pulse
    ? paused
      ? `Grounded source-change motion is paused for ${pulse.title}. The presentation orbit is suspended.`
      : `Grounded source-change motion is active for ${pulse.title}. The presentation orbit is suspended.`
    : selected
    ? "The topology is static while record detail has focus."
    : presentationOrbit
      ? "A slow presentation orbit shows depth."
      : "The presentation orbit is paused.";
  const canvasLabel = `Interactive three-dimensional Mind topology. ${canvasMotionDescription} Presentation motion does not represent tenant activity. Drag to rotate, use the mouse wheel to zoom, arrow keys to rotate, plus and minus to zoom, and Enter to inspect the front grounded record.`;
  const togglePresentationOrbit = () => {
    const next = !presentationOrbit;
    writeMindOrbitEnabled(preferenceScope, next);
    setPresentationOrbit(next);
    setAnnouncement(presentationOrbit ? "Presentation orbit paused. Tenant activity is unchanged." : "Presentation orbit resumed. It does not represent tenant activity.");
  };

  return (
    <section className="mind-workspace" aria-labelledby="mind-title">
      <div className="mind-scroll-owner" {...(expanded ? { inert: "" } : {})} aria-hidden={expanded ? true : undefined}>
        <header className="mind-heading">
          <div><p className="mind-eyebrow">{accountContext?.accountName || "Solo account"} · Solo · Governed records</p><h1 id="mind-title" className="mind-sr-only">Mind</h1><p>Your durable business records, decisions, knowledge, and source provenance—without hidden reasoning.</p></div>
          <div className="mind-actions"><span className="mind-truth mind-truth--proposed">PROPOSED IA</span><button type="button" className="mind-button" onClick={refresh}><RefreshCw size={14} aria-hidden="true" />Refresh records</button><button type="button" className="mind-button mind-button--paige" onClick={openExistingPaige}>✦ Open PAIGE</button></div>
        </header>
        <p className="mind-paige-note" role="note">PARTIAL · Opening PAIGE uses the one existing workspace. No Mind context was attached or prepared.</p>
        {loading ? <div className="mind-state" role="status"><BrainCircuit aria-hidden="true" /><h2>Resolving this account's Mind…</h2><p>Previous-account records are not shown while grounded sources resolve.</p></div> : (
          <>
            {partial && <div className="mind-source-warning" role="status"><strong>Mind has partial coverage</strong><span>No missing source is treated as empty. Retry refreshes read-only records.</span></div>}
            {!partial && records.length === 0 ? <div className="mind-state"><BrainCircuit aria-hidden="true" /><h2>Nothing durable is indexed here yet</h2><p>No sample records or invented relationships are substituted.</p><button type="button" className="mind-button" onClick={refresh}>Retry current sources</button></div> : (
              <section className="mind-panel" aria-labelledby="mind-brain-title">
                <div className="mind-panel-head"><div><h2 id="mind-brain-title">PAIGE data brain</h2><p>An optional presentation orbit can show 3D depth; activity particles remain source-gated.</p></div><span className="mind-truth mind-truth--proposed">INTERACTIVE 3D · PRESENTATION</span></div>
                <div className="mind-stage">
                  <canvas ref={ownCanvas} className="mind-canvas" tabIndex={0} role="group" aria-roledescription="interactive 3D topology viewer" aria-label={canvasLabel}
                    onKeyDown={canvasKey}
                    onPointerDown={(event) => { interruptPresentation(); dragRef.current = { x: event.clientX, y: event.clientY, rx: rotation.x, ry: rotation.y, moved:false }; event.currentTarget.setPointerCapture?.(event.pointerId); }}
                    onPointerMove={(event) => { const drag = dragRef.current; if (!drag) return; if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>4)drag.moved=true; setRotation((v) => ({ ...v, x: drag.rx + (event.clientY - drag.y) * .008, y: drag.ry + (event.clientX - drag.x) * .008 })); }}
                    onPointerUp={(event) => { const drag=dragRef.current; dragRef.current=null; interruptPresentation(); if(drag&&!drag.moved){const rect=event.currentTarget.getBoundingClientRect();selectAt(event.clientX-rect.left,event.clientY-rect.top);} }}
                    onPointerCancel={() => { dragRef.current = null; interruptPresentation(); }}
                    onLostPointerCapture={() => { if (dragRef.current) { dragRef.current = null; interruptPresentation(); } }}
                    onWheel={(event) => { event.preventDefault(); interruptPresentation(); setRotation((v) => ({ ...v, zoom: Math.max(.7, Math.min(1.55, v.zoom - event.deltaY * .001)) })); }} />
                  <div className="mind-canvas-help" aria-hidden="true"><strong>VIRTUAL DATA BRAIN</strong><span><Rotate3D size={12} /> Drag · wheel · keyboard</span></div>
                  <div className="mind-motion"><span className={`mind-truth ${pulse?.truth === "LIVE SOURCE" ? "mind-truth--live" : pulse ? "mind-truth--partial" : "mind-truth--proposed"}`}>{pulse ? `${paused ? "PAUSED" : pulse.truth} · ${pulse.category.toUpperCase()}` : presentationStatus}</span>{pulse ? <button type="button" onClick={() => { if(paused){setPulse((value)=>value?{...value,started:performance.now()}:value);setPaused(false);}else{setPulse((value)=>value?{...value,elapsed:value.elapsed+(performance.now()-value.started)}:value);setPaused(true);} }}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? "Resume" : "Pause"}</button> : <button type="button" aria-pressed={presentationOrbit} disabled={!!selected} onClick={togglePresentationOrbit}>{presentationOrbit ? <Pause size={13} /> : <Play size={13} />}{presentationButtonLabel}</button>}</div>
                  <p className="mind-stage-caption">Presentation density: {records.length <= 5 ? 90 : records.length <= 30 ? 240 : 480} non-record texture points. The slow orbit shows form only; activity appears only for a grounded source change.</p>
                </div>
                <div className="mind-categories" role="group" aria-label="Filter Mind records by category">
                  <button type="button" aria-pressed={category === "all"} onClick={() => selectCategory("all")}><span>All records</span><small>{records.length} GROUNDED</small></button>
                  {CATEGORIES.map((item) => { const count = records.filter((record) => record.category === item.key).length; return <button key={item.key} type="button" aria-pressed={category === item.key} onClick={() => selectCategory(item.key)} style={{ "--mind-category": `var(--mind-${item.key})` } as React.CSSProperties}><span>{item.label}</span><small>{count ? `${count} · ${item.truth}` : item.truth}</small></button>; })}
                </div>
                <div className="mind-records" role="group" aria-label="Grounded Mind records">
                  {visible.map((record) => <button key={record.id} type="button" data-mind-record onClick={(event) => chooseRecord(record, event.currentTarget)}><i style={{ background: `var(--mind-${record.category})` }} /><span><strong>{record.title}</strong><small>{record.owner} · {record.when}</small></span><b>{record.truth}</b></button>)}
                  {!visible.length && <p>No grounded records are available in this category.</p>}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <div className="mind-announcement" aria-live="polite">{announcement}</div>
      {selected && <aside ref={drawerRef} className={`mind-drawer${expanded ? " is-expanded" : ""}`} role="dialog" aria-modal={expanded ? "true" : "false"} aria-label="Mind record details">
        <header><div><span className={`mind-truth ${selected.truth === "LIVE SOURCE" ? "mind-truth--live" : "mind-truth--partial"}`}>{selected.truth}</span><h2>{selected.title}</h2></div><div><button type="button" aria-label={expanded ? "Restore record drawer" : "Expand record drawer"} onClick={() => setExpanded((value) => !value)}>{expanded ? <Minimize2 /> : <Maximize2 />}</button><button ref={drawerCloseRef} type="button" aria-label="Close Mind record details" onClick={closeInspector}><X /></button></div></header>
        <div className="mind-drawer-body"><section><h3>Record contract</h3><p>{selected.summary}</p></section><section><h3>Source and provenance</h3><dl><dt>Current owner</dt><dd>{selected.owner}</dd><dt>Source</dt><dd>{selected.source}</dd><dt>Evidence</dt><dd>{selected.evidence}</dd><dt>Recorded</dt><dd>{selected.when}</dd></dl></section><section><h3>Honesty boundary</h3><p>Mind indexes this attributable record. It does not infer private reasoning, causal relationships, or unavailable history.</p></section><section><h3>Next safe action</h3><button type="button" className="mind-button" onClick={closeInspector}><ChevronLeft size={14} />Back to topology</button><button type="button" className="mind-button mind-button--paige" onClick={openExistingPaige}><ExternalLink size={14} />Open PAIGE · PARTIAL</button></section></div>
      </aside>}
    </section>
  );
}

