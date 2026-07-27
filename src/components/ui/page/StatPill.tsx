import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Line, LineChart, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

/**
 * StatPill — the DENSE sibling of StatTile (§11/§18).
 *
 * StatTile is the card KPI (a GlyphPlate, ~5-space padding, big display value). StatPill is the
 * compact, ~100–120px-tall metric built to sit shoulder-to-shoulder in a StatRow/grid — 4-up on
 * md, 2-up on sm, 6–8 across on xl — so an operator reads the whole platform state in one glance
 * (§36 five-minute test). It carries an OPTIONAL axis-less sparkline (recharts, via the canonical
 * ChartContainer, colored on the ONE --chart-1 scale — never gold).
 *
 * GOLD DISCIPLINE (§6/§11): the delta arrow is SEMANTIC — --success up, --destructive down,
 * --muted-foreground flat — NEVER gold. The sparkline is --chart-1. Nothing here is ever gold;
 * gold is spent only on the act/on moment (a StatePill state="on"), not on a resting metric.
 *
 * Motion-safe: the sparkline animation is gated by useReducedMotion (recharts
 * isAnimationActive={!reduced}). Value is tabular-nums so columns align.
 */
export type StatPillTone = "default" | "positive" | "negative";

export interface StatPillProps {
  label: string;
  value: string | number;
  /** SEMANTIC delta — arrow + text colored by direction, never gold. */
  delta?: { value: string; direction: "up" | "down" | "flat" };
  /** Optional real series — a ~34px axis-less sparkline. Omit when there is no real trend to show. */
  sparkline?: number[];
  hint?: string;
  /** Rendered at 16px max, inline (no 48px GlyphPlate circle — that's StatTile's job). */
  icon?: LucideIcon;
  tone?: StatPillTone;
  loading?: boolean;
  className?: string;
}

const SPARK_CONFIG: ChartConfig = {
  v: { label: "Trend", color: "hsl(var(--chart-1))" },
};

export function StatPill({
  label,
  value,
  delta,
  sparkline,
  hint,
  icon: Icon,
  tone = "default",
  loading,
  className,
}: StatPillProps) {
  const reduce = useReducedMotion();

  const valueTone = {
    default: "text-foreground",
    positive: "text-[hsl(var(--success))]",
    negative: "text-[hsl(var(--destructive))]",
  }[tone];

  const deltaMeta = delta
    ? {
        up: { Icon: ArrowUpRight, cls: "text-[hsl(var(--success))]", sr: "increased" },
        down: { Icon: ArrowDownRight, cls: "text-[hsl(var(--destructive))]", sr: "decreased" },
        flat: { Icon: ArrowRight, cls: "text-muted-foreground", sr: "unchanged" },
      }[delta.direction]
    : null;

  const sparkData =
    sparkline && sparkline.length > 1 ? sparkline.map((v, i) => ({ i, v })) : null;

  return (
    <div
      className={cn(
        "flex min-h-[100px] flex-col justify-between gap-2 rounded-[var(--radius)] border border-border bg-card p-3.5 shadow-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>

      <div className="min-w-0">
        {loading ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <div className={cn("truncate font-display text-xl font-semibold tabular-nums", valueTone)}>
            {value}
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        {loading ? (
          <Skeleton className="h-3.5 w-16" />
        ) : (
          <div className="flex min-w-0 items-center gap-1.5 text-xs">
            {deltaMeta && (
              <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", deltaMeta.cls)}>
                <deltaMeta.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="sr-only">{deltaMeta.sr} </span>
                {delta!.value}
              </span>
            )}
            {hint && <span className="truncate text-muted-foreground">{hint}</span>}
          </div>
        )}

        {sparkData && !loading && (
          <motion.div
            className="w-20 shrink-0"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.4 }}
          >
            <ChartContainer config={SPARK_CONFIG} className="!aspect-auto h-[34px] w-full">
              <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="var(--color-v)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reduce}
                />
              </LineChart>
            </ChartContainer>
          </motion.div>
        )}
      </div>
    </div>
  );
}
