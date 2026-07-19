// FadeInSection — a scroll-into-view fade + rise wrapper (§29 premium motion).
//
// Doctrine: §11 — every animation is guarded by `useReducedMotion`. When the OS
// asks for reduced motion, the section renders at its final resting state on the
// first paint (no transform, no opacity ramp) so nothing is hidden or moving.
// Token-only: this primitive paints nothing itself; it only animates its
// children, so there is no color to hardcode.
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FadeInSectionProps {
  children: ReactNode;
  className?: string;
  /** Rise distance in px before settling. Kept visible-after-deploy (§25). */
  y?: number;
  /** Seconds to wait before the reveal begins. */
  delay?: number;
  /** Fraction of the element that must be in view to trigger (0–1). */
  amount?: number;
  /** Replay every time it re-enters the viewport instead of once. */
  once?: boolean;
}

export function FadeInSection({
  children,
  className,
  y = 24,
  delay = 0,
  amount = 0.3,
  once = true,
}: FadeInSectionProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    // Reduced-motion fallback: final state, no animation.
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default FadeInSection;
