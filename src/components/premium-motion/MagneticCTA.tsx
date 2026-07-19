// MagneticCTA — a button/element that leans toward the cursor (§29 premium motion).
//
// Doctrine: §11 — gated by `useReducedMotion` (no magnetic pull, no spring when
// reduced; it renders as a plain static wrapper). §11 gold discipline: this
// primitive does NOT paint gold — it only wraps the caller's own element, so the
// caller decides whether the wrapped control is the act (gold) or not. Token-only.
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MagneticCTAProps {
  children: ReactNode;
  className?: string;
  /** How far (px) the element travels toward the pointer at the edge. */
  strength?: number;
}

export function MagneticCTA({ children, className, strength = 14 }: MagneticCTAProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  if (reduce) {
    return <div className={cn("inline-flex", className)}>{children}</div>;
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const relX = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const relY = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    x.set(Math.max(-1, Math.min(1, relX)) * strength);
    y.set(Math.max(-1, Math.min(1, relY)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={cn("inline-flex", className)}
      style={{ x: sx, y: sy }}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      {children}
    </motion.div>
  );
}

export default MagneticCTA;
