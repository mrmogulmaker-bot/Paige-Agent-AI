import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * FleetOrbit — Claude Design's "The fleet, by weight" field view (Super Admin Shell.dc.html,
 * the `isFleet` block's `flFieldTitle`/`flFieldMeta`/`flFieldHint`/`flLegend`). A real radial
 * visualization, not a bounding box (§31) — every tenant is a node the operator can drag to
 * orbit, hover to name, and click to open, exactly as the pack specifies the interaction.
 *
 * §13 — CD's caption reads "node size is monthly revenue". We have no revenue figure to size by
 * (Money Spine is deferred, owner ruling 2026-08-19), so sizing a node by an invented dollar
 * value would be exactly the fabrication this console exists to refuse. Node size here is real:
 * team + client count, the one weight signal the platform actually has for a tenant today. The
 * caption says so plainly rather than repeating CD's revenue claim over data that isn't there —
 * the moment real MRR lands, this is the one place that swaps to it.
 *
 * §11/§23 — token-only. CD's literal tier hex (TIER_INK) become the platform's own semantic
 * tokens: indigo for Agency, success-green for Solo, gold-dark for Enterprise, a neutral
 * hairline tone for a sub-account — so the legend still reads the design's intent without a
 * hardcoded hex shipping.
 */

export type OrbitNode = {
  id: string;
  name: string;
  tier: "Agency" | "Solo" | "Enterprise" | "Sub-account";
  /** Real, non-financial weight — seats + clients. Never a stand-in for revenue. */
  weight: number;
  needsYou: boolean;
};

const TIER_TOKEN: Record<OrbitNode["tier"], string> = {
  Agency: "hsl(var(--primary))",
  Solo: "hsl(var(--success))",
  Enterprise: "hsl(var(--gold-dark))",
  "Sub-account": "hsl(var(--muted-foreground))",
};

const SIZE = 320;
const CENTER = SIZE / 2;
const RING_RADIUS = 118;
const NODE_MIN = 7;
const NODE_MAX = 17;

export function FleetOrbit({
  nodes,
  onSelect,
}: {
  nodes: readonly OrbitNode[];
  onSelect: (id: string) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const dragRef = useRef<{ startAngle: number; startRotation: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const maxWeight = Math.max(1, ...nodes.map((n) => n.weight));
  const positioned = useMemo(
    () =>
      nodes.map((n, i) => {
        const angle = (i / Math.max(1, nodes.length)) * 2 * Math.PI + rotation;
        const r = NODE_MIN + (n.weight / maxWeight) * (NODE_MAX - NODE_MIN);
        return {
          ...n,
          x: CENTER + RING_RADIUS * Math.cos(angle),
          y: CENTER + RING_RADIUS * Math.sin(angle),
          r,
        };
      }),
    [nodes, rotation, maxWeight],
  );

  const angleFromCenter = (clientX: number, clientY: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    return Math.atan2(y, x);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startAngle: angleFromCenter(e.clientX, e.clientY), startRotation: rotation };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const now = angleFromCenter(e.clientX, e.clientY);
    setRotation(dragRef.current.startRotation + (now - dragRef.current.startAngle));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2.5">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-full max-h-[360px] w-full max-w-[360px] cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        role="img"
        aria-label="The fleet, arranged by weight. Drag to rotate; click a tenant to open it."
      >
        {/* The hub — the fleet itself, at the center of its own orbit. */}
        <circle cx={CENTER} cy={CENTER} r={4} className="fill-border" />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          fill="none"
          className="stroke-border"
          strokeDasharray="2 4"
        />
        {positioned.map((n) => (
          <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
            {n.needsYou && (
              <circle
                r={n.r + 3}
                fill="none"
                stroke="hsl(var(--warning))"
                strokeWidth={1.5}
              />
            )}
            <circle
              r={n.r}
              fill={TIER_TOKEN[n.tier]}
              className="cursor-pointer transition-opacity hover:opacity-80"
              onClick={() => onSelect(n.id)}
            >
              <title>
                {n.name} · {n.tier}
                {n.needsYou ? " · needs you" : ""}
              </title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {(
          [
            ["Agency", TIER_TOKEN.Agency],
            ["Solo", TIER_TOKEN.Solo],
            ["Enterprise", TIER_TOKEN.Enterprise],
            ["Needs you", "hsl(var(--warning))"],
          ] as const
        ).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span aria-hidden className={cn("h-2 w-2 rounded-full")} style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
