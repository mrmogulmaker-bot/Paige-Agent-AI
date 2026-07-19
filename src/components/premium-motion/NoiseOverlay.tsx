// NoiseOverlay — a subtle SVG grain texture layer for depth (§29 premium motion).
//
// Doctrine: §25 VISIBLE-AFTER-DEPLOY — headless-tuned "grain" routinely ships
// invisible, so the default opacity here is at the clearly-perceptible end
// (0.08) for the owner to dial DOWN, never an unseeable 0.02. The grain itself
// is static (no animation), so there is nothing for reduced-motion to stop; the
// `animate` shift is the only motion and IS gated. Token-agnostic: pure grain,
// no brand color painted.
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export interface NoiseOverlayProps {
  className?: string;
  /** 0–1. Clearly-visible default per §25; dial down, don't ship invisible. */
  opacity?: number;
  /** feTurbulence base frequency — higher = finer grain. */
  frequency?: number;
  /** Slowly drift the grain (motion-gated). */
  animate?: boolean;
}

export function NoiseOverlay({
  className,
  opacity = 0.08,
  frequency = 0.8,
  animate = false,
}: NoiseOverlayProps) {
  const reduce = useReducedMotion();

  // A tiny inline SVG turbulence tile, encoded as a data URI background.
  const dataUri = useMemo(() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [frequency]);

  const style: React.CSSProperties = {
    backgroundImage: dataUri,
    opacity,
    mixBlendMode: "overlay",
  };

  const shared = cn("pointer-events-none absolute inset-0", className);

  if (reduce || !animate) {
    return <div aria-hidden className={shared} style={style} />;
  }

  return (
    <motion.div
      aria-hidden
      className={shared}
      style={style}
      animate={{ backgroundPositionX: ["0px", "120px"], backgroundPositionY: ["0px", "120px"] }}
      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
    />
  );
}

export default NoiseOverlay;
