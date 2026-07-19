// AnimatedText — word-by-word (or char) staggered reveal for headlines (§29).
//
// Doctrine: §11 motion-safe — reduced motion renders the full string instantly
// as plain text (screen-reader friendly: the whole phrase is always present in
// the DOM as a single node in the fallback). Token-only: inherits color, paints
// nothing of its own.
import { motion, useReducedMotion } from "framer-motion";
import type { ElementType } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedTextProps {
  text: string;
  className?: string;
  /** Split by word (default) or by character. */
  by?: "word" | "char";
  /** Per-item stagger, seconds. */
  stagger?: number;
  /** Delay before the first item, seconds. */
  delay?: number;
  /** Rendered wrapper element (h1, h2, p, span…). */
  as?: ElementType;
  /** Animate when scrolled into view instead of on mount. */
  inView?: boolean;
}

export function AnimatedText({
  text,
  className,
  by = "word",
  stagger = 0.05,
  delay = 0,
  as = "span",
  inView = false,
}: AnimatedTextProps) {
  const reduce = useReducedMotion();
  const Wrapper = motion(as as ElementType);

  if (reduce) {
    const Plain = as as ElementType;
    return <Plain className={className}>{text}</Plain>;
  }

  const units = by === "char" ? Array.from(text) : text.split(" ");

  const container = {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
  const item = {
    hidden: { opacity: 0, y: "0.4em" },
    visible: {
      opacity: 1,
      y: "0em",
      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  const animateProps = inView
    ? { whileInView: "visible" as const, viewport: { once: true, amount: 0.6 } }
    : { animate: "visible" as const };

  return (
    <Wrapper
      className={cn(className)}
      variants={container}
      initial="hidden"
      {...animateProps}
      aria-label={text}
    >
      {units.map((u, i) => (
        <motion.span
          key={`${u}-${i}`}
          variants={item}
          aria-hidden
          style={{ display: "inline-block", whiteSpace: "pre" }}
        >
          {u}
          {by === "word" && i < units.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </Wrapper>
  );
}

export default AnimatedText;
