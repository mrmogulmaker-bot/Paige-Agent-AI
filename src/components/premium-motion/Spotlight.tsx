// Spotlight — a cursor-tracking radial glow that lights the surface under the
// pointer (§29 premium motion).
//
// Doctrine: §11/§23 — the glow color is a brand TOKEN (indigo `--primary` by
// default; callers may pass `--accent` ONLY when the surface is a genuine act).
// No hardcoded hex. Motion-safe: reduced motion renders a soft STATIC centered
// glow (still adds depth, §25 visible) instead of tracking the cursor.
import {
  motion,
  useMotionValue,
  useMotionTemplate,
  useReducedMotion,
} from "framer-motion";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SpotlightProps {
  children?: ReactNode;
  className?: string;
  /** Glow radius in px. */
  size?: number;
  /** Brand-token color for the glow center. */
  color?: string;
  /** Peak alpha of the glow (§25 keep perceptible). */
  intensity?: number;
}

export function Spotlight({
  children,
  className,
  size = 380,
  color = "hsl(var(--primary))",
  intensity = 0.18,
}: SpotlightProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(-9999);
  const my = useMotionValue(-9999);
  const pct = Math.round(intensity * 100);

  // Live cursor-tracked gradient (hooks must run unconditionally, so this is
  // computed every render and simply unused in the reduced-motion branch).
  const liveBg = useMotionTemplate`radial-gradient(${size}px circle at ${mx}px ${my}px, color-mix(in srgb, ${color} ${pct}%, transparent), transparent 70%)`;

  if (reduce) {
    const staticBg = `radial-gradient(${size}px circle at 50% 40%, color-mix(in srgb, ${color} ${pct}%, transparent), transparent 70%)`;
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: staticBg }}
        />
        {children}
      </div>
    );
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
  };

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      onPointerMove={onMove}
      onPointerLeave={() => {
        mx.set(-9999);
        my.set(-9999);
      }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: liveBg }}
      />
      {children}
    </div>
  );
}

export default Spotlight;
