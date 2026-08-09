import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Area, AreaChart, Line, LineChart, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

/**
 * Sparkline — the standalone axis-less micro-trend (§18: extracted from StatPill so any
 * surface can carry a 7-day health micro-chart WITHOUT the full StatPill card chrome —
 * the fleet map card, the agency roll-up card, a client roster row). ONE implementation:
 * StatPill now delegates here too, so there is no second copy of the spark logic.
 *
 * DOCTRINE (binding):
 * - §11/§6 GOLD DISCIPLINE: the mark is --chart-1 (default) or a SEMANTIC status token
 *   (--success up / --destructive down). NOTHING here is ever gold — gold is the act color.
 * - §13 HONESTY: fewer than two real, finite points is NOT a trend — it renders an honest
 *   flat baseline rule, never a fabricated line.
 * - §11 motion-safe: the entry fade + recharts draw animation are both gated by
 *   useReducedMotion (isAnimationActive={!reduced}).
 * - Token-only, AA in both themes (the --chart / --success / --destructive tokens each
 *   carry a light + dark value).
 */
export type SparklineTone = "default" | "positive" | "negative";

const TONE_COLOR: Record<SparklineTone, string> = {
  default: "hsl(var(--chart-1))",
  positive: "hsl(var(--success))",
  negative: "hsl(var(--destructive))",
};

export interface SparklineProps {
  /** The series values, oldest → newest. `< 2` finite points renders a flat baseline (§13). */
  data: number[];
  variant?: "line" | "area";
  tone?: SparklineTone;
  height?: number;
  strokeWidth?: number;
  className?: string;
  /** Accessible description (e.g. "7-day activity, trending up"). The chart itself is decorative. */
  ariaLabel?: string;
  /** Suppress the entry fade even when motion is allowed (e.g. inside a list that already staggers). */
  animate?: boolean;
}

export function Sparkline({
  data,
  variant = "line",
  tone = "default",
  height = 34,
  strokeWidth = 2,
  className,
  ariaLabel,
  animate = true,
}: SparklineProps) {
  const reduce = useReducedMotion();
  const rawId = useId();
  const gradId = `spark-${rawId.replace(/:/g, "")}`;
  const points = (Array.isArray(data) ? data : []).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  const config: ChartConfig = { v: { label: "Trend", color: TONE_COLOR[tone] } };

  // §13: fewer than two real points is not a trend — an honest flat baseline, never a fake line.
  if (points.length < 2) {
    return (
      <div
        className={cn("flex items-center", className)}
        style={{ height }}
        role="img"
        aria-label={ariaLabel ?? "No trend yet"}
      >
        <span className="h-px w-full bg-border" aria-hidden />
      </div>
    );
  }

  const rows = points.map((v, i) => ({ i, v }));

  const inner = (
    <ChartContainer config={config} className="!aspect-auto w-full" style={{ height }}>
      {variant === "area" ? (
        <AreaChart data={rows} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-v)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-v)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke="var(--color-v)"
            strokeWidth={strokeWidth}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={!reduce}
          />
        </AreaChart>
      ) : (
        <LineChart data={rows} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="v"
            stroke="var(--color-v)"
            strokeWidth={strokeWidth}
            dot={false}
            isAnimationActive={!reduce}
          />
        </LineChart>
      )}
    </ChartContainer>
  );

  if (!animate || reduce) {
    return (
      <div className={cn("w-full", className)} role="img" aria-label={ariaLabel ?? "Trend"}>
        {inner}
      </div>
    );
  }

  return (
    <motion.div
      className={cn("w-full", className)}
      role="img"
      aria-label={ariaLabel ?? "Trend"}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {inner}
    </motion.div>
  );
}
