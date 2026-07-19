// GlassCard — a layered glass surface with an optional hover lift (§29).
//
// Doctrine: §22 depth from LAYERED surfaces + hairline borders (not "made-it-dark");
// §11 token-only (bg-card / border-border / backdrop-blur), gold is NEVER spent
// on a resting surface — this card stays neutral/indigo. The hover LIFT is the
// only motion and is gated by `useReducedMotion` (reduced → a static card that
// still has its glass + border, just no travel).
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GlassCardProps {
  children: ReactNode;
  className?: string;
  /** Lift + subtle scale on hover (motion-gated). */
  interactive?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className, interactive = false, onClick }: GlassCardProps) {
  const reduce = useReducedMotion();

  const base = cn(
    // Layered glass: translucent card fill + hairline border + blur + soft ring.
    "relative rounded-2xl border border-border/70 bg-card/60 backdrop-blur-xl",
    "shadow-[0_1px_0_0_hsl(var(--border)/0.6)_inset,0_20px_40px_-24px_hsl(var(--primary)/0.35)]",
    interactive && "cursor-pointer",
    className,
  );

  if (reduce || !interactive) {
    return (
      <div className={base} onClick={onClick}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={base}
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      {children}
    </motion.div>
  );
}

export default GlassCard;
