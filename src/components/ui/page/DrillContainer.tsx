import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * DrillContainer — the shared-element FLIP drill-down (spec §6.9 / §7, §22 motion).
 *
 * The single reusable primitive every analytics roll-up composes for "summary card expands
 * into detail — spring, not a modal pop." When `open` flips, the container's own bounds
 * animate (framer `layout`) from the summary's height to the detail's height while the inner
 * content cross-fades, so the card appears to zoom into the underlying rows/mini-dashboard.
 * Pass a stable `layoutId` when the summary and the expanded surface are DIFFERENT DOM nodes
 * (e.g. a fleet-map card morphing into an overlay) so framer animates the SAME element.
 *
 * DOCTRINE (binding):
 * - §22 spring, not duration: the size morph is a spring; the content swap is a short fade.
 * - §11 motion-safe: under useReducedMotion the layout animation is OFF and the swap is an
 *   INSTANT cut (no fade) — the drill still works, it just doesn't animate.
 * - §32 VISIBLE-after-deploy: the spring is a real, perceptible morph (not sub-perceptual);
 *   the open state also lifts to shadow-lg so the depth change reads.
 * - §11 GOLD DISCIPLINE: nothing here is gold — the container is the neutral card ground.
 *   A selection/focus emphasis, if the caller adds one, is indigo (--ring), never gold.
 */
export interface DrillContainerProps {
  open: boolean;
  summary: ReactNode;
  detail: ReactNode;
  /** Shared-element id — set when summary and detail are distinct nodes you want morphed. */
  layoutId?: string;
  /** Override the spring (stiffness/damping). Ignored under reduced motion. */
  spring?: Transition;
  /** Drop the default card chrome (border/bg/shadow) when the caller supplies its own. */
  bare?: boolean;
  className?: string;
}

const DEFAULT_SPRING: Transition = { type: "spring", stiffness: 320, damping: 34, mass: 0.9 };

export function DrillContainer({
  open,
  summary,
  detail,
  layoutId,
  spring,
  bare = false,
  className,
}: DrillContainerProps) {
  const reduce = useReducedMotion();
  const sizeTransition: Transition = reduce ? { duration: 0 } : (spring ?? DEFAULT_SPRING);

  return (
    <motion.div
      {...(layoutId ? { layoutId } : {})}
      layout={!reduce}
      transition={sizeTransition}
      className={cn(
        "overflow-hidden",
        !bare &&
          "rounded-[var(--radius)] border border-border bg-card shadow-card transition-shadow duration-200",
        !bare && open && "shadow-lg",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={open ? "detail" : "summary"}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
        >
          {open ? detail : summary}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
