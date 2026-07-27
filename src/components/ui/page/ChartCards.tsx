import type { ReactNode } from "react";
import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  chartSeriesColor,
  type ChartConfig,
} from "@/components/ui/chart";
import { SectionCard } from "./SectionCard";
import { EmptyState } from "./EmptyState";
import { StatRow } from "./StatTile";
import { StatPill, type StatPillProps } from "./StatPill";

/**
 * ChartCards — the shared, content-agnostic data-viz building blocks the whole
 * tier-dashboard family (operator / agency / standalone) composes with (§18: one
 * home, three depths). Every card is a SectionCard wrapping the ONE hardened
 * recharts wrapper (ChartContainer/ChartTooltipContent) on the --chart-1..6
 * tokens — no per-file `COLORS = [...]` arrays, no hand-rolled fourth chart style.
 *
 * DOCTRINE (binding):
 * - §11 GOLD DISCIPLINE: gold (--accent) is spent ONLY on the act/approve/on
 *   moment. NOTHING here is ever gold — series/fills/legends are --chart-1..6 /
 *   indigo / semantic. A caller who wants a gold act passes it into `actions`.
 * - §13 HONESTY: every card renders EmptyState (never a fabricated line/slice/bar)
 *   when its data is empty or insufficient. A "coming soon"/reserved metric passes
 *   a crafted `empty` naming what makes it populate — no fake series, no zero-fill.
 * - §11 motion-safe: recharts `isAnimationActive={!reduced}` via useReducedMotion.
 * - Token-only, AA in both themes (the --chart tokens carry a light + dark value).
 */

/** A single series/slice/bar. `colorVar` is a --chart-N token name; omit to auto-assign. */
export interface ChartSeriesDef {
  key: string;
  label: ReactNode;
  /** A CSS custom-property name (e.g. "--chart-2") or bare token ("chart-2"). Omit → auto CHART_SERIES color. */
  colorVar?: string;
}

/** Crafted empty/reserved copy shown in place of a chart when there is no real data (§13). */
export interface ChartEmpty {
  title: ReactNode;
  hint?: ReactNode;
}

const DEFAULT_HEIGHT = 260;

/**
 * Resolve a series color to a recharts stroke/fill string, on the ONE token scale.
 * Never returns gold. Precedence: explicit colorVar → indexed CHART_SERIES token.
 */
function resolveSeriesColor(colorVar: string | undefined, index: number): string {
  if (!colorVar) return chartSeriesColor(index);
  const v = colorVar.trim();
  if (v.startsWith("hsl(") || v.startsWith("rgb") || v.startsWith("var(") || v.startsWith("#")) return v;
  if (v.startsWith("--")) return `hsl(var(${v}))`;
  return `hsl(var(--${v}))`;
}

function ChartSkeleton({ height }: { height: number }) {
  return <Skeleton className="w-full rounded-md" style={{ height }} />;
}

/* ------------------------------------------------------------------------------------------------
 * 1. TrendLineCard — multi-series line over a shared x-axis (MRR trend, WAU, conversions over time).
 * ---------------------------------------------------------------------------------------------- */

export interface TrendLineCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Rows keyed by `xKey` + each series `key`. Empty/`<2` points → EmptyState (a line needs two points). */
  data: Array<Record<string, string | number | null | undefined>>;
  series: ChartSeriesDef[];
  xKey: string;
  loading?: boolean;
  empty?: ChartEmpty;
  /** Slot for CSV/PNG export controls, filters, a range picker — rendered in the card header. */
  actions?: ReactNode;
  height?: number;
  /** Show a recharts Brush for scrubbing a long series. Auto-suppressed under ~8 points. */
  brush?: boolean;
  /** Format an x-axis tick (e.g. a short date). */
  xTickFormatter?: (value: string | number) => string;
  /** Format a y-axis tick (e.g. currency, compact numbers). */
  yTickFormatter?: (value: number) => string;
  className?: string;
}

export function TrendLineCard({
  title,
  description,
  data,
  series,
  xKey,
  loading,
  empty,
  actions,
  height = DEFAULT_HEIGHT,
  brush,
  xTickFormatter,
  yTickFormatter,
  className,
}: TrendLineCardProps) {
  const reduce = useReducedMotion();

  const config = useMemo<ChartConfig>(() => {
    return series.reduce<ChartConfig>((acc, s, i) => {
      acc[s.key] = { label: s.label, color: resolveSeriesColor(s.colorVar, i) };
      return acc;
    }, {});
  }, [series]);

  const hasData = Array.isArray(data) && data.length >= 2 && series.length > 0;
  const showBrush = brush && data.length > 8;

  return (
    <SectionCard title={title} description={description} actions={actions} className={className}>
      {loading ? (
        <ChartSkeleton height={height} />
      ) : !hasData ? (
        <EmptyState
          title={empty?.title ?? "No trend to show yet"}
          description={empty?.hint ?? "This chart fills in once there are at least two data points."}
        />
      ) : (
        <ChartContainer config={config} className="!aspect-auto w-full" style={{ height }}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: showBrush ? 4 : 8, left: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={xTickFormatter}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={44} tickFormatter={yTickFormatter} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={`var(--color-${s.key})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={!reduce}
                connectNulls
              />
            ))}
            {showBrush && (
              <Brush
                dataKey={xKey}
                height={22}
                travellerWidth={8}
                stroke="hsl(var(--chart-1))"
                fill="hsl(var(--muted))"
                tickFormatter={xTickFormatter as ((value: string | number, index: number) => string) | undefined}
              />
            )}
          </LineChart>
        </ChartContainer>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 2. DonutCard — composition (tier split, health distribution) as a donut with a center total.
 * ---------------------------------------------------------------------------------------------- */

export interface DonutDatum {
  label: string;
  value: number;
  /** A --chart-N token name or bare token. Omit → auto CHART_SERIES color by index. */
  colorVar?: string;
}

export interface DonutCardProps {
  title: ReactNode;
  description?: ReactNode;
  data: DonutDatum[];
  loading?: boolean;
  empty?: ChartEmpty;
  actions?: ReactNode;
  height?: number;
  /** Center-total caption under the summed value (e.g. "tenants"). Total is summed from `data`. */
  centerLabel?: ReactNode;
  /** Override the center number (defaults to the sum of values); pass a preformatted node. */
  centerValue?: ReactNode;
  /** Format a tooltip/legend value (e.g. percent). */
  valueFormatter?: (value: number) => string;
  className?: string;
}

export function DonutCard({
  title,
  description,
  data,
  loading,
  empty,
  actions,
  height = DEFAULT_HEIGHT,
  centerLabel,
  centerValue,
  valueFormatter,
  className,
}: DonutCardProps) {
  const reduce = useReducedMotion();

  const rows = useMemo(
    () =>
      (Array.isArray(data) ? data : []).map((d, i) => ({
        ...d,
        fill: resolveSeriesColor(d.colorVar, i),
      })),
    [data],
  );

  const config = useMemo<ChartConfig>(() => {
    return rows.reduce<ChartConfig>((acc, r) => {
      acc[r.label] = { label: r.label, color: r.fill };
      return acc;
    }, {});
  }, [rows]);

  const total = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.value) || 0), 0), [rows]);
  const hasData = rows.length > 0 && total > 0;

  return (
    <SectionCard title={title} description={description} actions={actions} className={className}>
      {loading ? (
        <ChartSkeleton height={height} />
      ) : !hasData ? (
        <EmptyState
          title={empty?.title ?? "Nothing to break down yet"}
          description={empty?.hint ?? "This distribution appears once there is data to divide."}
        />
      ) : (
        <ChartContainer config={config} className="!aspect-auto w-full" style={{ height }}>
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  nameKey="label"
                  formatter={valueFormatter ? (v: number) => valueFormatter(v) : undefined}
                />
              }
            />
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={2}
              strokeWidth={2}
              isAnimationActive={!reduce}
            >
              {rows.map((r) => (
                <Cell key={r.label} fill={r.fill} stroke="hsl(var(--card))" />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="label" />} />
          </PieChart>
        </ChartContainer>
      )}
      {!loading && hasData && (
        <div className="pointer-events-none -mt-3 flex flex-col items-center">
          <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
            {centerValue ?? total.toLocaleString()}
          </span>
          {centerLabel && (
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{centerLabel}</span>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 3. BarCard — vertical or horizontal bars (new tenants by period, dunning by tier, etc.).
 * ---------------------------------------------------------------------------------------------- */

export interface BarCardProps {
  title: ReactNode;
  description?: ReactNode;
  data: Array<Record<string, string | number | null | undefined>>;
  bars: ChartSeriesDef[];
  xKey: string;
  loading?: boolean;
  empty?: ChartEmpty;
  actions?: ReactNode;
  height?: number;
  /** Render a horizontal bar chart (category axis on the left). */
  horizontal?: boolean;
  /** Stack the bars instead of grouping them side by side. */
  stacked?: boolean;
  catTickFormatter?: (value: string | number) => string;
  valueTickFormatter?: (value: number) => string;
  className?: string;
}

export function BarCard({
  title,
  description,
  data,
  bars,
  xKey,
  loading,
  empty,
  actions,
  height = DEFAULT_HEIGHT,
  horizontal,
  stacked,
  catTickFormatter,
  valueTickFormatter,
  className,
}: BarCardProps) {
  const reduce = useReducedMotion();

  const config = useMemo<ChartConfig>(() => {
    return bars.reduce<ChartConfig>((acc, b, i) => {
      acc[b.key] = { label: b.label, color: resolveSeriesColor(b.colorVar, i) };
      return acc;
    }, {});
  }, [bars]);

  const hasData = Array.isArray(data) && data.length > 0 && bars.length > 0;
  const stackId = stacked ? "stack" : undefined;

  const catAxisProps = {
    dataKey: xKey,
    type: "category" as const,
    tickLine: false,
    axisLine: false,
    tickMargin: 8,
    tickFormatter: catTickFormatter,
  };
  const valAxisProps = {
    type: "number" as const,
    tickLine: false,
    axisLine: false,
    tickMargin: 8,
    tickFormatter: valueTickFormatter,
  };

  return (
    <SectionCard title={title} description={description} actions={actions} className={className}>
      {loading ? (
        <ChartSkeleton height={height} />
      ) : !hasData ? (
        <EmptyState
          title={empty?.title ?? "No breakdown yet"}
          description={empty?.hint ?? "Bars appear once there is data to chart."}
        />
      ) : (
        <ChartContainer config={config} className="!aspect-auto w-full" style={{ height }}>
          <BarChart
            data={data}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 8, right: 12, bottom: 8, left: horizontal ? 8 : 4 }}
          >
            <CartesianGrid vertical={horizontal} horizontal={!horizontal} strokeDasharray="3 3" />
            {horizontal ? (
              <>
                <XAxis {...valAxisProps} />
                <YAxis {...catAxisProps} width={96} />
              </>
            ) : (
              <>
                <XAxis {...catAxisProps} />
                <YAxis {...valAxisProps} width={44} />
              </>
            )}
            <ChartTooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} content={<ChartTooltipContent />} />
            {bars.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
            {bars.map((b) => (
              <Bar
                key={b.key}
                dataKey={b.key}
                fill={`var(--color-${b.key})`}
                stackId={stackId}
                radius={stacked ? 0 : 4}
                isAnimationActive={!reduce}
                maxBarSize={horizontal ? 28 : 48}
              />
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 4. KpiPillRow — the dense, present-guarded KPI vocabulary the operator/agency/standalone
 *    tiers all reuse. A thin semantic wrapper over StatRow + StatPill. Renders ONLY present
 *    items (§13: no fabricated zeros) — an item with `present: false` is dropped, not zeroed.
 * ---------------------------------------------------------------------------------------------- */

export interface KpiPillItem {
  label: string;
  value: string | number;
  delta?: StatPillProps["delta"];
  sparkline?: number[];
  hint?: string;
  icon?: StatPillProps["icon"];
  tone?: StatPillProps["tone"];
  /** §13 present-guard: default true. When false the item is OMITTED — never rendered as a 0. */
  present?: boolean;
  loading?: boolean;
}

export interface KpiPillRowProps {
  items: KpiPillItem[];
  cols?: 2 | 3 | 4;
  className?: string;
}

export function KpiPillRow({ items, cols = 4, className }: KpiPillRowProps) {
  const shown = (Array.isArray(items) ? items : []).filter((i) => i.present !== false);
  if (shown.length === 0) return null;
  return (
    <div className={cn(className)}>
      <StatRow cols={cols}>
        {shown.map((i) => (
          <StatPill
            key={i.label}
            label={i.label}
            value={i.value}
            delta={i.delta}
            sparkline={i.sparkline}
            hint={i.hint}
            icon={i.icon}
            tone={i.tone}
            loading={i.loading}
          />
        ))}
      </StatRow>
    </div>
  );
}
