import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { GlyphPlate } from "./GlyphPlate";
import { Sparkline, type SparklineTone } from "./Sparkline";

/**
 * MetricEntityCard — the reusable "roll-up entity" card the 5 analytics surfaces all compose
 * (spec §5.a fleet map card, §5.b agency sub-account card, §5.c client roster row). ONE home
 * (§18) for: entity name + optional glyph, a 7-day health Sparkline, a headline metric with a
 * SEMANTIC vs-previous delta, an at-risk flag, and a keyboard-accessible click-to-expand
 * affordance (the drill gesture — pair with DrillContainer for the FLIP into a mini-dashboard).
 *
 * DOCTRINE (binding):
 * - §11/§6 GOLD DISCIPLINE: NOTHING here is gold. Delta is semantic (--success/--destructive/
 *   --muted). At-risk is --warning/--destructive — a status, not the act moment. Selection +
 *   focus emphasis is INDIGO (--ring), never gold. Gold is reserved for an act the caller adds.
 * - §22/§11 motion-safe: the at-risk pulse and the hover-lift are gated by useReducedMotion —
 *   under reduced motion the flag is a STATIC dot and the card does not lift.
 * - §32 VISIBLE: the at-risk pulse and hover-lift are perceptible, not sub-perceptual.
 * - §13 HONESTY: a `loading` card is a skeleton, never a "0"/blank. The Sparkline renders an
 *   honest flat baseline when there is no real trend.
 * - §36 intuitiveness: the whole card is the hit target; role/aria make the drill discoverable.
 */
export interface MetricEntityCardProps {
  name: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** N-period micro-trend (e.g. 7-day activity). `< 2` points → honest flat baseline. */
  spark?: number[];
  sparkTone?: SparklineTone;
  sparkVariant?: "line" | "area";
  /** Right-aligned headline metric (e.g. active clients, MRR). */
  metric?: ReactNode;
  metricLabel?: ReactNode;
  /** vs-previous-period comparison — arrow + text, colored by direction, never gold. */
  delta?: { value: string; direction: "up" | "down" | "flat" };
  /** At-risk flag — a SEMANTIC (non-gold) pulse dot + label. Static under reduced motion. */
  atRisk?: boolean;
  atRiskLabel?: string;
  /** Makes the card an interactive drill trigger (button semantics + focus ring + hover lift). */
  onClick?: () => void;
  /** Selected/expanded emphasis — indigo ring (never gold). */
  selected?: boolean;
  /**
   * Reflected on the drill trigger for assistive tech when this card owns an expanding panel.
   * When the card is interactive (has `onClick`) and this is omitted, it defaults to `false` so
   * screen readers announce a collapsed/expandable control; a non-interactive card sets no aria.
   */
  expanded?: boolean;
  loading?: boolean;
  className?: string;
}

function DeltaBadge({ delta }: { delta: NonNullable<MetricEntityCardProps["delta"]> }) {
  const meta = {
    up: { Icon: ArrowUpRight, cls: "text-[hsl(var(--success))]", sr: "increased" },
    down: { Icon: ArrowDownRight, cls: "text-[hsl(var(--destructive))]", sr: "decreased" },
    flat: { Icon: ArrowRight, cls: "text-muted-foreground", sr: "unchanged" },
  }[delta.direction];
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", meta.cls)}>
      <meta.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{meta.sr} </span>
      {delta.value}
    </span>
  );
}

function AtRiskFlag({ label, reduce }: { label: string; reduce: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--warning)/0.15)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--warning))]">
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        {!reduce && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--warning))]"
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 2.4 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--warning))]" />
      </span>
      {label}
    </span>
  );
}

export function MetricEntityCard({
  name,
  subtitle,
  icon: Icon,
  spark,
  sparkTone = "default",
  sparkVariant = "area",
  metric,
  metricLabel,
  delta,
  atRisk = false,
  atRiskLabel = "At risk",
  onClick,
  selected = false,
  expanded,
  loading = false,
  className,
}: MetricEntityCardProps) {
  const reduce = useReducedMotion();
  const interactive = typeof onClick === "function";

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && <GlyphPlate icon={Icon} size="sm" />}
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-semibold leading-tight text-foreground">
              {loading ? <Skeleton className="h-4 w-28" /> : name}
            </div>
            {subtitle && !loading && (
              <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>
        {atRisk && !loading && <AtRiskFlag label={atRiskLabel} reduce={!!reduce} />}
      </div>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-[34px] w-full" />
        ) : (
          <Sparkline data={spark ?? []} tone={sparkTone} variant={sparkVariant} height={34} />
        )}
      </div>

      {(metric != null || delta) && (
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            {loading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              metric != null && (
                <span className="font-display text-lg font-semibold tabular-nums text-foreground">
                  {metric}
                </span>
              )
            )}
            {metricLabel && !loading && (
              <span className="ml-1 text-xs text-muted-foreground">{metricLabel}</span>
            )}
          </div>
          {delta && !loading && <DeltaBadge delta={delta} />}
        </div>
      )}
    </>
  );

  const base =
    "rounded-[var(--radius)] border bg-card p-4 text-left shadow-card transition-shadow duration-200";
  const ringCls = selected ? "border-primary/40 ring-2 ring-ring" : "border-border";

  if (!interactive) {
    return <div className={cn(base, ringCls, className)}>{body}</div>;
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-expanded={expanded ?? false}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        base,
        ringCls,
        "block w-full cursor-pointer hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      {body}
    </motion.button>
  );
}
