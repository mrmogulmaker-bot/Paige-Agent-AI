// GradientMasked — text (or any element) painted with a brand gradient via
// background-clip:text (§29 premium motion).
//
// Doctrine: §11/§23 — the gradient is built from brand TOKENS only (indigo →
// gold via CSS custom properties); zero hardcoded hex. The optional shimmer
// SWEEP is the animated part, and it is gated by `useReducedMotion` — reduced
// motion shows the static gradient (still fully legible, still branded), just
// with no travelling highlight.
import { motion, useReducedMotion } from "framer-motion";
import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GradientMaskedProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /** Add a slow shimmer sweep across the gradient (motion-gated). */
  shimmer?: boolean;
  /**
   * Gradient stops as CSS color values. Defaults to brand indigo → gold using
   * tokens so callers get on-brand output without passing anything.
   */
  from?: string;
  via?: string;
  to?: string;
}

export function GradientMasked({
  children,
  className,
  as = "span",
  shimmer = false,
  from = "hsl(var(--primary))",
  via = "hsl(var(--accent))",
  to = "hsl(var(--gold-light))",
}: GradientMaskedProps) {
  const reduce = useReducedMotion();
  const Wrapper = motion(as as ElementType);

  const baseStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(100deg, ${from}, ${via}, ${to})`,
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
  };

  if (reduce || !shimmer) {
    const Plain = as as ElementType;
    return (
      <Plain className={cn(className)} style={baseStyle}>
        {children}
      </Plain>
    );
  }

  return (
    <Wrapper
      className={cn(className)}
      style={{ ...baseStyle, backgroundSize: "200% 100%" }}
      initial={{ backgroundPositionX: "0%" }}
      animate={{ backgroundPositionX: ["0%", "200%"] }}
      transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </Wrapper>
  );
}

export default GradientMasked;
