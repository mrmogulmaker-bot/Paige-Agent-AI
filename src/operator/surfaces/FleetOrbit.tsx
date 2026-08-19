import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * FleetOrbit — a faithful port of Claude Design's `<fleet-field>` custom element
 * (`fleet-field.js`, loaded by the pack at `Super Admin Shell.dc.html:384` for the Fleet
 * Console's Field view). CD's own component is a real projected 3D field — a fibonacci-shell
 * point cloud, yaw/tilt rotation (auto-drifting, pointer-drag override), perspective
 * projection, glow, connective tissue between near neighbours, and a proximity hover
 * tooltip — not a flat ring. An owner render of the live pack (2026-08-19, "it rotates in
 * 3D") confirmed the gap against the SVG ring this replaces; this is a port of the pack's
 * own algorithm into a React/Canvas component, not a new design (§30/§28 — the pack's
 * geometry is frozen; only the vanilla-JS custom element becomes a typed component).
 *
 * §13 — CD's own component sizes a node by `t.mrr` and draws "{tier} · ${mrr}/mo" in the
 * hover tooltip. Money Spine is deferred (owner ruling 2026-08-19), so this component takes
 * a real, non-financial `weight` per node instead (team + clients, same figure FleetConsole
 * already computes) and the tooltip shows the tier alone — never a fabricated dollar figure.
 *
 * §11/§23 — CD's TIER map is literal hex; a raw Canvas 2D context cannot read a CSS custom
 * property, so tier colors are resolved from the platform's own tokens via getComputedStyle
 * at draw time (re-resolved when the theme changes) rather than hardcoded here.
 *
 * §11/§22 — motion-safe: when the OS prefers reduced motion, auto-rotation starts off (the
 * pack's own manual toggle still works either way, matching CD's in-canvas "Motion on/off").
 */

export type OrbitNode = {
  id: string;
  name: string;
  tier: "Agency" | "Solo" | "Enterprise" | "Sub-account";
  /** Real, non-financial weight — seats + clients. Never a stand-in for revenue. */
  weight: number;
  needsYou: boolean;
};

const TIER_VAR: Record<OrbitNode["tier"], string> = {
  Agency: "--primary",
  Solo: "--success",
  Enterprise: "--gold-dark",
  "Sub-account": "--muted-foreground",
};

type Point3 = { x: number; y: number; z: number };

function fibonacciShell(index: number, count: number): Point3 {
  const k = (index + 0.5) / count;
  const phi = Math.acos(1 - 2 * k);
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  const shell = 0.62 + ((index * 37) % 100) / 260;
  return {
    x: Math.sin(phi) * Math.cos(theta) * shell,
    y: Math.cos(phi) * shell * 0.82,
    z: Math.sin(phi) * Math.sin(theta) * shell,
  };
}

/** Resolve an `hsl(var(--x))` design token to a real `rgb(...)` string a canvas ctx can use. */
function resolveToken(cssVar: string): string {
  if (typeof window === "undefined") return "rgb(120,120,120)";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (!raw) return "rgb(120,120,120)";
  // Tokens are stored as bare "H S% L%" triples, consumed elsewhere as hsl(var(--x)).
  return `hsl(${raw})`;
}

function withAlpha(hslColor: string, alpha: number): string {
  return hslColor.replace(/^hsl\(/, "hsla(").replace(/\)$/, `, ${alpha})`);
}

export function FleetOrbit({
  nodes,
  onSelect,
}: {
  nodes: readonly OrbitNode[];
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [motion, setMotion] = useState(!prefersReducedMotion);
  const [hot, setHot] = useState<{ id: string; name: string; tier: string; sx: number; sy: number } | null>(
    null,
  );
  // §32 — the box size drives the canvas, not the other way round: a ResizeObserver on the
  // CONTAINER (not `getBoundingClientRect()` re-measured inside the RAF loop) means the paint
  // loop never has to guess whether layout has settled yet. `size` is null until the observer
  // fires at least once; draw() bails honestly on that instead of silently reading a stale 0.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize({ w: box.width, h: box.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxWeight = Math.max(1, ...nodes.map((n) => n.weight));
  const points = useMemo(
    () =>
      nodes.map((n, i) => ({
        ...n,
        p: fibonacciShell(i, Math.max(1, nodes.length)),
        r: 3.4 + Math.sqrt(n.weight / maxWeight) * 7.5,
      })),
    [nodes, maxWeight],
  );

  // Tier colors resolved from tokens, re-resolved when the theme flips (§11/§23).
  const [palette, setPalette] = useState<Record<OrbitNode["tier"], string> | null>(null);
  const [warningColor, setWarningColor] = useState("hsl(38 92% 50%)");
  useEffect(() => {
    const resolve = () => {
      setPalette({
        Agency: resolveToken(TIER_VAR.Agency),
        Solo: resolveToken(TIER_VAR.Solo),
        Enterprise: resolveToken(TIER_VAR.Enterprise),
        "Sub-account": resolveToken(TIER_VAR["Sub-account"]),
      });
      setWarningColor(resolveToken("--warning"));
    };
    resolve();
    const mo = new MutationObserver(resolve);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => mo.disconnect();
  }, []);

  const state = useRef({
    yaw: 0.4,
    tilt: -0.2,
    t: 0,
    drag: null as { x: number; y: number; yaw: number; tilt: number } | null,
    mx: -1e4,
    my: -1e4,
    hotIndex: -1,
  });
  const motionRef = useRef(motion);
  motionRef.current = motion;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // A canvas that can't hand back a 2D context is a real, visible-worthy failure, not a
      // "try again next frame" case (§32 — never silently swallow a crash-prone call site).
      console.error("FleetOrbit: canvas.getContext('2d') returned null");
      setRenderError("The field's canvas context is unavailable in this browser.");
      return;
    }
    if (!palette || !size || !size.w || !size.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size.w;
    const H = size.h;
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const s = state.current;
    if (motionRef.current) {
      s.t += 1 / 40;
      if (!s.drag) {
        s.yaw += 0.0055;
        s.tilt = -0.2 + Math.sin(s.t * 0.18) * 0.09;
      }
    }

    const cx = W / 2;
    const cy = H / 2;
    const scale = Math.min(W, H) * 0.4;
    const cyaw = Math.cos(s.yaw);
    const syaw = Math.sin(s.yaw);
    const ctilt = Math.cos(s.tilt);
    const stilt = Math.sin(s.tilt);

    const projected = points
      .map((n, i) => {
        const x1 = n.p.x * cyaw - n.p.z * syaw;
        const z1 = n.p.x * syaw + n.p.z * cyaw;
        const y2 = n.p.y * ctilt - z1 * stilt;
        const z2 = n.p.y * stilt + z1 * ctilt;
        const persp = 1 / (1 + z2 * 0.34);
        return {
          i,
          n,
          sx: cx + x1 * scale * persp,
          sy: cy + y2 * scale * persp,
          sz: z2,
          rr: n.r * persp,
          fade: Math.max(0.18, Math.min(1, 0.72 - z2 * 0.42)),
        };
      })
      .sort((a, b) => b.sz - a.sz);

    let hotIndex = -1;
    let best = 1e9;
    projected.forEach((p) => {
      const d = Math.hypot(p.sx - s.mx, p.sy - s.my);
      if (d < Math.max(14, p.rr + 8) && d < best) {
        best = d;
        hotIndex = p.i;
      }
    });
    if (hotIndex !== s.hotIndex) {
      s.hotIndex = hotIndex;
      const hp = hotIndex >= 0 ? projected.find((p) => p.i === hotIndex) : null;
      setHot(hp ? { id: hp.n.id, name: hp.n.name, tier: hp.n.tier, sx: hp.sx, sy: hp.sy } : null);
    }

    ctx.lineWidth = 1;
    for (let a = 0; a < projected.length; a += 1) {
      for (let b = a + 1; b < Math.min(projected.length, a + 4); b++) {
        const d = Math.hypot(projected[a].sx - projected[b].sx, projected[a].sy - projected[b].sy);
        if (d > scale * 0.52) continue;
        const al = (1 - d / (scale * 0.52)) * 0.16 * Math.min(projected[a].fade, projected[b].fade);
        ctx.strokeStyle = `rgba(150,178,224,${al.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(projected[a].sx, projected[a].sy);
        ctx.lineTo(projected[b].sx, projected[b].sy);
        ctx.stroke();
      }
    }

    projected.forEach((p) => {
      const hotNode = p.i === s.hotIndex;
      const pulse = motionRef.current ? 1 + Math.sin(s.t * 1.5 + p.i * 7) * 0.05 : 1;
      const r = p.rr * pulse * (hotNode ? 1.28 : 1);
      const color = palette[p.n.tier];
      const glow = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3.1);
      glow.addColorStop(0, withAlpha(color, 0.34 * p.fade));
      glow.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r * 3.1, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = withAlpha(color, Math.min(1, p.fade + 0.18));
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, 6.2832);
      ctx.fill();

      if (p.n.needsYou) {
        ctx.strokeStyle = withAlpha(warningColor, 0.85 * p.fade);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r + 4.5, 0, 6.2832);
        ctx.stroke();
      }
    });
  }, [points, palette, warningColor, size]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      try {
        draw();
      } catch (e) {
        // §32 — a crash inside the paint loop must degrade to something VISIBLE, never a
        // silent blank canvas the next session has to guess at from scratch.
        console.error("FleetOrbit: draw() threw", e);
        setRenderError(e instanceof Error ? e.message : "The field could not be drawn.");
        return; // stop the loop on a real crash rather than re-throwing every frame
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    state.current.drag = { x: e.clientX, y: e.clientY, yaw: state.current.yaw, tilt: state.current.tilt };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    state.current.mx = e.clientX - rect.left;
    state.current.my = e.clientY - rect.top;
    const d = state.current.drag;
    if (d) {
      state.current.yaw = d.yaw + (e.clientX - d.x) * 0.006;
      state.current.tilt = Math.max(-0.9, Math.min(0.9, d.tilt + (e.clientY - d.y) * 0.004));
    }
  };
  const onPointerUp = () => {
    state.current.drag = null;
  };
  const onPointerLeave = () => {
    state.current.mx = -1e4;
    state.current.my = -1e4;
  };
  const onClick = () => {
    if (state.current.hotIndex < 0) return;
    const p = points[state.current.hotIndex];
    if (p) onSelect(p.id);
  };

  return (
    // CD's own wrapper (`:host{position:relative;width:100%;height:100%}`) fills the dark box
    // via absolute inset, not flex-stretch — its immediate parent is `position:relative` with a
    // resolved size (Super Admin Shell.dc.html: `position:absolute;inset:0;overflow:hidden`
    // around `<x-import component-from-global-scope="fleet-field">`). Matching that here rather
    // than relying on flex-stretch removes a real render bug: a flex child's cross-axis stretch
    // can resolve to zero height across some ancestor chains even when every intermediate div
    // carries `min-h-0 flex-1`, and a zero-height canvas paints nothing (§32 — a green build
    // proves nothing about what actually renders; this was caught live, not in review).
    <div ref={containerRef} className="absolute inset-0">
      {renderError ? (
        // §32 — visible and honest beats a blank box: a real paint failure says so, with the
        // actual message, rather than leaving the field looking merely "not populated yet."
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-6 text-center">
          <div className="text-[12.5px] font-semibold text-[hsl(var(--rail-foreground))]">
            The field could not render.
          </div>
          <div className="max-w-xs text-[11px] text-[hsl(var(--rail-muted))]">{renderError}</div>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
          role="img"
          aria-label="The fleet, projected in three dimensions. Drag to orbit; click a tenant to open it."
        />
      )}
      {hot && (
        <div
          className="pointer-events-none absolute z-[3] whitespace-nowrap rounded-[9px] border border-[hsl(255,42%,60%)]/50 bg-[hsl(var(--rail))]/90 px-2.5 py-1.5 shadow-lg"
          style={{ left: Math.min(hot.sx + 14, (containerRef.current?.clientWidth ?? 320) - 140), top: hot.sy - 30 }}
        >
          <div className="text-[12px] font-semibold text-[hsl(var(--rail-foreground))]">{hot.name}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-[hsl(var(--rail-muted))]">{hot.tier}</div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setMotion((v) => !v)}
        className="absolute bottom-2.5 right-2.5 z-[3] whitespace-nowrap rounded-full border border-[hsl(var(--rail-foreground))]/25 bg-[hsl(var(--rail))]/60 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[hsl(var(--rail-foreground))] transition-colors hover:bg-[hsl(var(--rail))]/80"
      >
        Motion {motion ? "on" : "off"}
      </button>
    </div>
  );
}
