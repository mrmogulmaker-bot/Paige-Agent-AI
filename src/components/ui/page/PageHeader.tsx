import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { GlyphPlate } from "./GlyphPlate";

export interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  variant?: "plain" | "hero";
  backHref?: string;
  /** show the PaigeMark on the hero variant */
  mark?: boolean;
  className?: string;
}

/**
 * The masthead primitive — the single biggest premium lift. Two variants from
 * one component:
 *   plain → quiet leaf-page header (font-display h1 mandatory)
 *   hero  → the tokenized Marketplace masthead (gradient-hero, PaigeMark, gold
 *           accents in a dark field). Reserve for hubs / flagship pages.
 */
export function PageHeader({
  title, eyebrow, description, icon: Icon, actions,
  variant = "plain", backHref, mark = true, className,
}: PageHeaderProps) {
  const reduce = useReducedMotion();

  const back = backHref ? (
    <Link
      to={backHref}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded"
    >
      <ChevronLeft className="h-4 w-4" /> Back
    </Link>
  ) : null;

  if (variant === "hero") {
    return (
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "relative overflow-hidden rounded-[calc(var(--radius)+6px)] p-5 md:p-6 shadow-xl",
          className,
        )}
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute -top-24 -right-16 h-72 w-72 rounded-full"
            style={{ background: "radial-gradient(closest-side, hsl(var(--gold)/0.28), transparent)" }}
          />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(0 0% 100%/1) 1px,transparent 1px),linear-gradient(90deg,hsl(0 0% 100%/1) 1px,transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
        </div>
        <div className="relative">
          {back && <div className="mb-3 [&_a]:text-white/70 [&_a:hover]:text-white">{back}</div>}
          <div className="flex items-center gap-2.5">
            {mark && <PaigeMark className="h-7 w-7" />}
            {eyebrow && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-light))]">
                {eyebrow}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h1 className="max-w-2xl font-display text-2xl md:text-3xl font-semibold leading-[1.15] text-white text-balance">
                {title}
              </h1>
              {description && (
                <p className="mt-1.5 max-w-xl text-sm text-white/70">{description}</p>
              )}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </div>
      </motion.section>
    );
  }

  // plain
  return (
    <div className={cn("border-b border-border/60 pb-5", className)}>
      {back && <div className="mb-2">{back}</div>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && <GlyphPlate icon={Icon} size="md" />}
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {eyebrow}
              </div>
            )}
            <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-foreground text-balance">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
