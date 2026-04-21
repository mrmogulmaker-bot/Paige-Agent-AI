import { useEffect, useRef, useState } from "react";
import { Download, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DiagramEntity, EntityDiagramData, EntityType } from "@/lib/entityDiagram";

interface Props {
  data: EntityDiagramData;
}

const TYPE_LABEL: Record<EntityType, string> = {
  holdco: "HoldCo",
  opco: "OpCo",
  management: "Management Co",
  asset: "Asset Co",
  ip: "IP Co",
  vehicle: "Vehicle Co",
};

// Inline styles for fixed brand colors per spec (#1a2840 / #d4a574). Kept inline so the
// captured PNG renders identically regardless of the consuming theme.
const NAVY = "#1a2840";
const NAVY_DEEP = "#0f1a2c";
const NAVY_MID = "#22344f";
const GOLD = "#d4a574";
const PURPLE_TINT = "#2a2342";
const TEAL_TINT = "#1d3a3e";

function entityStyle(type: EntityType, isHold: boolean): React.CSSProperties {
  if (type === "holdco") {
    return { background: GOLD, color: NAVY, border: `2px solid ${GOLD}` };
  }
  const base: React.CSSProperties = {
    border: `1.5px solid ${GOLD}`,
    color: "#fff",
  };
  if (type === "opco") return { ...base, background: NAVY };
  if (type === "management") return { ...base, background: NAVY_DEEP };
  if (type === "asset") return { ...base, background: NAVY_MID };
  if (type === "ip") return { ...base, background: PURPLE_TINT };
  if (type === "vehicle") return { ...base, background: TEAL_TINT };
  return { ...base, background: NAVY };
}

export function EntityDiagramCard({ data }: Props) {
  const isMobile = useIsMobile();
  const cardRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; label?: string }>>([]);
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });

  const root = data.entities.find(e => e.type === "holdco") || data.entities.find(e => !e.parent) || data.entities[0];
  const children = data.entities.filter(e => e.parent === root?.id);

  const capitalFor = (id: string) =>
    data.capital_access?.find(c => c.entity === id)?.instruments ?? [];

  // Compute SVG connector lines between parent and each child box (desktop only)
  useEffect(() => {
    if (isMobile) return;
    const tree = treeRef.current;
    if (!tree) return;

    const compute = () => {
      const rootEl = tree.querySelector<HTMLDivElement>('[data-entity-id="' + root?.id + '"]');
      if (!rootEl) return;
      const treeRect = tree.getBoundingClientRect();
      const rootRect = rootEl.getBoundingClientRect();
      const x1 = rootRect.left - treeRect.left + rootRect.width / 2;
      const y1 = rootRect.bottom - treeRect.top;
      const next: typeof lines = [];
      data.connections
        .filter(c => c.from === root?.id)
        .forEach(c => {
          const childEl = tree.querySelector<HTMLDivElement>(`[data-entity-id="${c.to}"]`);
          if (!childEl) return;
          const r = childEl.getBoundingClientRect();
          const x2 = r.left - treeRect.left + r.width / 2;
          const y2 = r.top - treeRect.top;
          next.push({ x1, y1, x2, y2, label: c.label });
        });
      setLines(next);
      setSvgSize({ w: tree.scrollWidth, h: tree.scrollHeight });
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(tree);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [data, isMobile, root?.id]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      setDownloading(true);
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: NAVY,
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = "entity-structure.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("[EntityDiagramCard] download failed", e);
    } finally {
      setDownloading(false);
    }
  };

  const renderEntity = (e: DiagramEntity) => {
    const style = entityStyle(e.type, e.type === "holdco");
    const instruments = capitalFor(e.id);
    return (
      <div
        key={e.id}
        data-entity-id={e.id}
        className="rounded-lg p-3 shadow-md"
        style={{
          ...style,
          minWidth: e.type === "holdco" ? 220 : 180,
          maxWidth: 240,
        }}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="font-bold text-sm leading-tight">{e.name}</div>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap"
            style={{
              background: e.type === "holdco" ? NAVY : GOLD,
              color: e.type === "holdco" ? GOLD : NAVY,
            }}
          >
            {TYPE_LABEL[e.type]}
          </span>
        </div>
        {e.description && (
          <div
            className="text-[11px] leading-snug opacity-90 mb-2"
            style={{ color: e.type === "holdco" ? NAVY : "#e8eef7" }}
          >
            {e.description}
          </div>
        )}
        {instruments.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {instruments.map((ins, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: GOLD, color: NAVY }}
              >
                {ins}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={cardRef}
      className="rounded-xl my-3 w-full"
      style={{
        background: NAVY,
        border: `2px solid ${GOLD}`,
        padding: 16,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-white font-bold text-base leading-tight">{data.title}</div>
          {data.subtitle && (
            <div className="text-xs mt-0.5" style={{ color: GOLD }}>
              {data.subtitle}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownload}
          disabled={downloading}
          className="shrink-0 h-8 text-xs gap-1.5"
          style={{ borderColor: GOLD, color: GOLD, background: "transparent" }}
        >
          <Download className="w-3 h-3" />
          {downloading ? "Saving…" : "Download"}
        </Button>
      </div>

      {isMobile ? (
        <div className="flex flex-col gap-3">
          {root && renderEntity(root)}
          <div
            className="ml-3 pl-4 flex flex-col gap-3"
            style={{ borderLeft: `2px solid ${GOLD}` }}
          >
            {children.map(c => renderEntity(c))}
          </div>
        </div>
      ) : (
        <div ref={treeRef} className="relative">
          <div className="flex justify-center mb-12">{root && renderEntity(root)}</div>
          <div className="flex flex-wrap justify-center gap-4 relative z-10">
            {children.map(c => renderEntity(c))}
          </div>
          {svgSize.w > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={svgSize.w}
              height={svgSize.h}
              style={{ zIndex: 1 }}
            >
              <defs>
                <marker
                  id="arrow-gold"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={GOLD} />
                </marker>
              </defs>
              {lines.map((l, i) => {
                const midX = (l.x1 + l.x2) / 2;
                const midY = (l.y1 + l.y2) / 2;
                return (
                  <g key={i}>
                    <path
                      d={`M ${l.x1} ${l.y1} C ${l.x1} ${midY}, ${l.x2} ${midY}, ${l.x2} ${l.y2}`}
                      stroke={GOLD}
                      strokeWidth={1.5}
                      fill="none"
                      markerEnd="url(#arrow-gold)"
                      opacity={0.85}
                    />
                    {l.label && (
                      <text
                        x={midX}
                        y={midY - 4}
                        fontSize={10}
                        fill={GOLD}
                        textAnchor="middle"
                        style={{ fontStyle: "italic" }}
                      >
                        {l.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      )}

      {data.notes && (
        <div
          className="mt-4 flex gap-2 items-start rounded-md p-3"
          style={{ background: "rgba(212,165,116,0.08)", border: `1px dashed ${GOLD}` }}
        >
          <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" style={{ color: GOLD }} />
          <div className="text-xs italic leading-relaxed" style={{ color: GOLD }}>
            {data.notes}
          </div>
        </div>
      )}
    </div>
  );
}
