// ScrollReveal — a directional, optionally-staggered scroll-into-view reveal (§29).
//
// Where FadeInSection is the plain fade+rise, ScrollReveal adds a DIRECTION
// (up/down/left/right) and can stagger a list of children. Doctrine: §11 —
// gated by `useReducedMotion`; reduced motion renders children at rest with no
// transform. Token-only (paints nothing itself).
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Direction = "up" | "down" | "left" | "right";

export interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  direction?: Direction;
  /** Travel distance in px. */
  distance?: number;
  /** Stagger each direct child (treats children as a list). */
  stagger?: number;
  delay?: number;
  amount?: number;
  once?: boolean;
}

function offset(direction: Direction, d: number) {
  switch (direction) {
    case "up":
      return { x: 0, y: d };
    case "down":
      return { x: 0, y: -d };
    case "left":
      return { x: d, y: 0 };
    case "right":
      return { x: -d, y: 0 };
  }
}

export function ScrollReveal({
  children,
  className,
  direction = "up",
  distance = 28,
  stagger = 0,
  delay = 0,
  amount = 0.3,
  once = true,
}: ScrollRevealProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  const { x, y } = offset(direction, distance);
  const item: Variants = {
    hidden: { opacity: 0, x, y },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
    },
  };

  // Staggered mode: wrap each child in its own motion item.
  if (stagger > 0) {
    const container: Variants = {
      hidden: {},
      visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
    };
    return (
      <motion.div
        className={cn(className)}
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once, amount }}
      >
        {Children.map(children, (child, i) => (
          <motion.div key={i} variants={item}>
            {child}
          </motion.div>
        ))}
      </motion.div>
    );
  }

  // Single-block mode.
  return (
    <motion.div
      className={cn(className)}
      variants={item}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

export default ScrollReveal;
