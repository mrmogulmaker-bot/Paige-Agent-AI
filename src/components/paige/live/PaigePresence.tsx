import { useEffect, useId, useRef, useState } from "react";
import { presenceFrame, SILENT_ENERGY, type AudioEnergy, type PresenceState } from "@/lib/paigeLiveConversation/presence";
import "./paige-presence.css";

export interface PaigePresenceProps {
  state: PresenceState;
  visible?: boolean;
  /** Read only from the actual output/microphone analyser. Never a generated speech timer. */
  readEnergy?: () => AudioEnergy;
}

export function PaigePresence({ state, visible = true, readEnergy = () => SILENT_ENERGY }: PaigePresenceProps) {
  const id = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [reduced, setReduced] = useState(false);
  const [hidden, setHidden] = useState(false);
  const initial = presenceFrame(state, 0);
  useEffect(() => {
    const doc = svgRef.current?.ownerDocument ?? document;
    const view = doc.defaultView;
    const media = view?.matchMedia?.("(prefers-reduced-motion: reduce)");
    const sync = () => { setReduced(media?.matches ?? false); setHidden(doc.hidden); };
    sync();
    media?.addEventListener("change", sync);
    doc.addEventListener("visibilitychange", sync);
    return () => { media?.removeEventListener("change", sync); doc.removeEventListener("visibilitychange", sync); };
  }, []);
  useEffect(() => {
    const svg = svgRef.current;
    const view = svg?.ownerDocument.defaultView;
    if (!svg || !view) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = view.performance.now();
    const paint = () => {
      const elapsed = reduced ? 0 : (view.performance.now() - start) / 1000;
      const frame = presenceFrame(state, elapsed, reduced || hidden || !visible ? SILENT_ENERGY : readEnergy());
      svg.querySelectorAll("[data-presence-shape]").forEach((path) => path.setAttribute("d", frame.path));
      svg.style.setProperty("--presence-energy", String(frame.energy));
      svg.style.setProperty("--presence-light", String(frame.light));
      svg.style.setProperty("--presence-drift", `${frame.drift}px`);
      svg.style.setProperty("--presence-turn", `${frame.turn}deg`);
      svg.dataset.energy = frame.energy.toFixed(3);
      if (visible && !hidden && !reduced) timer = setTimeout(paint, state === "held" ? 125 : 40);
    };
    paint();
    return () => { if (timer !== undefined) clearTimeout(timer); };
  }, [state, visible, reduced, hidden, readEnergy]);

  return <div className="paige-presence" data-presence-state={state} data-motion={reduced ? "reduced" : hidden || !visible ? "suspended" : "ambient"} aria-hidden="true">
    <svg ref={svgRef} viewBox="0 0 320 310" focusable="false">
      <defs>
        <linearGradient id={`${id}-material`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--presence-edge)"/><stop offset=".22" stopColor="var(--presence-plum)"/><stop offset=".5" stopColor="var(--presence-obsidian)"/><stop offset=".78" stopColor="var(--presence-plum)"/><stop offset="1" stopColor="var(--presence-obsidian)"/></linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="1" x2="1" y2="0"><stop stopColor="var(--presence-plum)"/><stop offset=".43" stopColor="var(--presence-gold)"/><stop offset=".62" stopColor="var(--presence-light-ink)"/><stop offset="1" stopColor="var(--presence-plum)"/></linearGradient>
        <radialGradient id={`${id}-light`} cx=".35" cy=".28"><stop stopColor="var(--presence-light-ink)" stopOpacity=".65"/><stop offset=".4" stopColor="var(--presence-gold)" stopOpacity=".12"/><stop offset="1" stopColor="var(--presence-obsidian)" stopOpacity="0"/></radialGradient>
        <filter id={`${id}-shadow`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>
        <clipPath id={`${id}-clip`}><path data-presence-shape d={initial.path}/></clipPath>
      </defs>
      <path className="paige-presence__shadow" d="M63 276Q134 250 244 270Q272 286 190 291Q82 301 63 276Z" filter={`url(#${id}-shadow)`}/>
      <g className="paige-presence__sculpture">
        <path className="paige-presence__back" data-presence-shape d={initial.path} fill={`url(#${id}-gold)`} transform="translate(13 -8) rotate(13 160 146) scale(.97)"/>
        <path data-presence-shape d={initial.path} fill={`url(#${id}-material)`} stroke="var(--presence-edge)" strokeWidth=".7"/>
        <g clipPath={`url(#${id}-clip)`}>
          <path className="paige-presence__fold" d="M76 49C248 61 84 132 224 176C302 204 172 276 111 249C227 216 119 185 142 146C191 89 89 122 76 49Z" fill={`url(#${id}-gold)`}/>
          <path className="paige-presence__depth" d="M214 26C274 125 116 124 180 196C208 233 124 277 77 269C159 210 79 173 121 124C172 79 202 83 214 26Z" fill={`url(#${id}-material)`}/>
          <path data-presence-shape d={initial.path} fill={`url(#${id}-light)`}/>
          <g className="paige-presence__pathways" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="1.4"><path d="M93 60C242 106 79 127 197 207S156 239 128 264"/><path d="M229 68C95 119 235 148 126 218"/></g>
        </g>
        <path className="paige-presence__rim" d="M77 92C62 54 123 35 149 49M218 231Q246 231 249 192" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="2"/>
      </g>
      <g className="paige-presence__fragments" fill={`url(#${id}-gold)`}><path d="M48 117Q32 137 46 148L53 128Z"/><path d="M263 68Q288 80 271 98L267 79Z"/><path d="M254 245L267 235L263 252Z"/></g>
    </svg>
  </div>;
}
