import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Analytics — Claude Design's `isArea` (Super Admin Shell.dc.html, L1444–1493) and `isBench`
 * (L1594–1670) blocks.
 *
 *   • `AreaChart` — the banded trend: the legend with each series' latest figure, the y-axis
 *     column, CD's 100×40 `preserveAspectRatio="none"` plot at 132px tall with its gradient
 *     fills, 1.6px lines, end dots and three grid rules, and the x-axis row underneath.
 *   • `Bench`     — the Paige Sandbox surface: the dark "on the bench" hero (elapsed eyebrow,
 *     name, note, percentage, stage, progress bar, blocker strip, act + environment + fixture),
 *     the "next on the bench" queue, and the two-column ENVIRONMENTS / OFF THE BENCH footer.
 *
 * §13 — A CHART IS A CLAIM ABOUT NUMBERS, so nothing on this file is drawn from a literal.
 * CD's `area()` builder is handed authored point arrays and its bench block is handed a named
 * build at 88% with a written blocker, four queued items with percentages, four environments
 * with drift counts. None of that ships. Every point, label, tick, percentage and sentence
 * arrives through props; a value the caller did not supply prints "—"; and with NO series the
 * chart draws its frame and its grid and says in words that no data is connected, rather than
 * a smooth invented curve — which is the single most convincing lie a console can tell.
 *
 * The chart's SCALE is arithmetic on the caller's own points (CD's `hi = max × 1.04`,
 * `lo = min(min × 0.96, 0)`), not an assumption: a series with one point still scales, a series
 * with none is simply not drawn.
 *
 * §11 GOLD BUDGET — gold appears exactly once in this file: the bench hero's single act
 * ("watch her build"). The blocker strip, which CD tints gold, is a warning and takes --warning;
 * the chart spends the --chart-1..6 data ramp and no gold at all.
 *
 * §5 — the bench act renders DISABLED with a title when the caller passed no handler, rather
 * than looking live and doing nothing.
 *
 * NOT PORTED, deliberately:
 *   • CD's `sr.fill` as a `<path d>`. Its builder emits a POLYGON points string ("0,100 x,y …")
 *     and its template feeds that to a `<path>`, which is not a path grammar — and the points
 *     are computed in a 0–100 vertical space while the viewBox is 0 0 100 40, so the curve
 *     would sit two and a half times below the box. Ours computes in the box's own space and
 *     emits a real `M/L/Z` path, so the geometry CD intended is what actually renders (§32 — a
 *     shape that compiles but does not appear is not shipped).
 *   • CD's `grid: [25,50,75]` for the same reason: in a 40-tall box two of those rules fall
 *     outside it. Ours places the three rules at a quarter, a half and three quarters of the
 *     plot, which is what they read as in the pack.
 *   • CD's `animation:{{ sbPulse }}` on the bench dot arrives as a JS-authored keyframe string;
 *     here the pulse is `motion-safe:animate-pulse` so the OS setting genuinely freezes it.
 */

const NOT_KNOWN = "—";

function figure(value: string | null | undefined): string {
  return value === null || value === undefined || value === "" ? NOT_KNOWN : value;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** 0–1, or null when the caller does not know it. Never coerced to zero (§13). */
function fraction(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function percentLabel(value: number | null | undefined): string {
  const f = fraction(value);
  return f === null ? NOT_KNOWN : `${Math.round(f * 100)}%`;
}

/* ────────────────────────────────────────────────────────────────────────────
   AreaChart — CD `isArea`, L1444–1493
   ──────────────────────────────────────────────────────────────────────────── */

/** Which slot of the shared data-viz ramp a series takes. Never a hex at the call site. */
export type ChartToneSlot = 1 | 2 | 3 | 4 | 5 | 6;

export interface AreaSeries {
  id: string;
  name: string;
  /** Oldest → newest. An empty array means the series is NOT drawn, not that it is flat. */
  points: readonly number[];
  /**
   * The latest value, already formatted by the caller (it owns the unit and the locale).
   * null → the legend prints "—" rather than re-deriving a number we were not given.
   */
  latest?: string | null;
  tone?: ChartToneSlot;
}

export interface AreaChartProps {
  series: readonly AreaSeries[];
  /** Formats a y-axis tick. Absent → a plain grouped integer. */
  formatValue?: (value: number) => string;
  /** CD's x-axis row. Absent → no row is drawn (an invented time axis is still an invention). */
  xLabels?: readonly string[];
  /** True only when a metrics source is genuinely attached — see the empty copy below. */
  connected?: boolean;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

/** CD's plot box, kept exactly: 100 wide, 40 tall, stretched by `preserveAspectRatio="none"`. */
const VIEW_W = 100;
const VIEW_H = 40;
/** A quarter, a half and three quarters of the plot (see the note on CD's `grid`). */
const GRID_Y = [0.25, 0.5, 0.75].map((f) => f * VIEW_H);

function toneVar(slot: ChartToneSlot | undefined, index: number): string {
  const n = slot ?? ((index % 6) + 1);
  return `hsl(var(--chart-${n}))`;
}

const integerFormat = new Intl.NumberFormat();

export function AreaChart({
  series,
  formatValue,
  xLabels,
  connected = false,
  loading = false,
  error = null,
  className,
}: AreaChartProps) {
  const gradientBase = useId().replace(/:/g, "");

  const plotted = useMemo(() => {
    const drawable = series.filter((s) => s.points.length > 0);
    if (drawable.length === 0) return null;

    const all = drawable.flatMap((s) => s.points).filter((v) => Number.isFinite(v));
    if (all.length === 0) return null;

    // CD's own scale, to the decimal: a 4% headroom above the max, a 4% skirt below the min,
    // and a floor pinned at zero so a bar-like series is never drawn hanging in mid-air.
    const hi = Math.max(...all) * 1.04;
    const lo = Math.min(Math.min(...all) * 0.96, 0);
    const span = Math.max(1, hi - lo);

    const built = drawable.map((s, i) => {
      const n = s.points.length;
      const pts = s.points.map((v, idx) => {
        const x = (idx / Math.max(1, n - 1)) * VIEW_W;
        const y = VIEW_H - ((v - lo) / span) * VIEW_H;
        return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
      });
      const line = pts.map((p, idx) => `${idx === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
      return {
        id: s.id,
        name: s.name,
        latest: s.latest,
        colour: toneVar(s.tone, i),
        line,
        fill: `M${pts[0][0]},${VIEW_H} ${pts
          .map((p) => `L${p[0]},${p[1]}`)
          .join(" ")} L${pts[pts.length - 1][0]},${VIEW_H} Z`,
        dot: pts[pts.length - 1],
      };
    });

    const fmt = formatValue ?? ((v: number) => integerFormat.format(Math.round(v)));
    return { built, yLabels: [hi, lo + span * 0.5, lo].map(fmt) };
  }, [series, formatValue]);

  const legend = series.map((s, i) => ({
    id: s.id,
    name: s.name,
    latest: s.latest,
    colour: toneVar(s.tone, i),
  }));

  if (loading) {
    return (
      <div className={cn("min-w-0", className)}>
        <div className="h-[132px] rounded-[11px] bg-muted motion-safe:animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      {legend.length > 0 && (
        <dl className="flex min-w-0 flex-wrap items-end gap-x-[14px] gap-y-2">
          {legend.map((lg) => (
            <div key={lg.id} className="min-w-0">
              <dt className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  style={{ backgroundColor: lg.colour }}
                  className="h-[7px] w-[7px] flex-none rounded-[2px]"
                />
                <span className="whitespace-nowrap text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">
                  {lg.name}
                </span>
              </dt>
              <dd className="mt-0.5 text-[19px] font-bold tabular-nums tracking-[-0.02em]">
                {figure(lg.latest)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-[11px] flex min-w-0 gap-2">
        <div className="flex flex-none flex-col justify-between py-px">
          {(plotted?.yLabels ?? [NOT_KNOWN, NOT_KNOWN, NOT_KNOWN]).map((label, i) => (
            <span
              key={`${i}-${label}`}
              className="whitespace-nowrap font-mono text-[8.5px] text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={
                plotted
                  ? `Trend for ${plotted.built.map((s) => s.name).join(", ")}`
                  : "No data connected"
              }
              className="block h-[132px] w-full overflow-visible"
            >
              {plotted && (
                <defs>
                  {plotted.built.map((s) => (
                    <linearGradient
                      key={s.id}
                      id={`${gradientBase}-${s.id}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={s.colour} stopOpacity="0.34" />
                      <stop offset="100%" stopColor={s.colour} stopOpacity="0.02" />
                    </linearGradient>
                  ))}
                </defs>
              )}

              {GRID_Y.map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2={VIEW_W}
                  y2={y}
                  stroke="hsl(var(--border))"
                  strokeWidth="0.3"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {plotted?.built.map((s) => (
                <path key={`${s.id}-fill`} d={s.fill} fill={`url(#${gradientBase}-${s.id})`} />
              ))}
              {plotted?.built.map((s) => (
                <path
                  key={`${s.id}-line`}
                  d={s.line}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {plotted?.built.map((s) => (
                <circle
                  key={`${s.id}-dot`}
                  cx={s.dot[0]}
                  cy={s.dot[1]}
                  r="3.2"
                  fill={s.colour}
                  stroke="hsl(var(--card))"
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {!plotted && (
              /* §13 — the frame and its rules are true (they are just a grid); the CURVE would
                 not be, so it is absent and the reason is said in words. */
              <div className="absolute inset-0 grid place-items-center px-3">
                <div className="max-w-md text-center">
                  <div className="text-[12.5px] font-semibold">
                    {error
                      ? "The series could not be read."
                      : connected
                        ? "No readings in this window."
                        : "No data connected."}
                  </div>
                  <div className="mt-1 text-[11px] leading-[1.5] text-muted-foreground">
                    {error ??
                      (connected
                        ? "The source is attached but has reported nothing for this period."
                        : "A curve here would be a claim about numbers nobody has measured, so none is drawn.")}
                  </div>
                </div>
              </div>
            )}
          </div>

          {!!xLabels?.length && (
            <div className="mt-[5px] flex justify-between">
              {xLabels.map((x, i) => (
                <span key={`${i}-${x}`} className="font-mono text-[8.5px] text-muted-foreground">
                  {x}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Bench — CD `isBench`, L1594–1670
   ──────────────────────────────────────────────────────────────────────────── */

/** The dark hero: the one thing she is building right now. */
export interface BenchNow {
  name: string;
  /** What it is, in the caller's words. null → left out. */
  note?: string | null;
  /** 0–1. null → the percentage prints "—" and the bar stays empty (§13). */
  progress: number | null;
  /** "Testing", "In build" — a real stage label. null → "—". */
  stage?: string | null;
  /** "running 47 minutes". null → the eyebrow reads without it. */
  elapsed?: string | null;
  /** Environment and build id. null → "—". */
  env?: string | null;
  /** Which fixture she is building against. null → left out. */
  fixture?: string | null;
  /** What is holding it up. null → the blocker strip is not drawn at all. */
  blocker?: string | null;
  /** CD's act. Without `onOpen` it renders disabled and says why (§5). */
  cta?: string | null;
  onOpen?: () => void;
}

/** CD's tone-per-queue-item, as a closed union instead of three pasted hexes. */
export type BenchTone = "ok" | "warn" | "info";

export interface BenchQueueItem {
  id: string;
  name: string;
  note?: string | null;
  stage?: string | null;
  /** 0–1. null → "—" and an empty track. */
  progress: number | null;
  tone?: BenchTone;
  onOpen?: () => void;
}

export interface BenchEnvironment {
  id: string;
  name: string;
  note?: string | null;
  /** "6 migrations ahead", "current". null → "—". */
  drift: string | null;
  /** How the environment reads. Absent → neutral, never green-by-default. */
  state?: "ok" | "warn" | "risk";
}

export interface BenchShelfItem {
  id: string;
  name: string;
  /** When it left the bench. null → "—". */
  when: string | null;
  outcome?: "shipped" | "parked" | "dropped";
}

export interface BenchProps {
  /** What is on the bench this minute. null → the hero says so (see `connected`). */
  now?: BenchNow | null;
  queue?: readonly BenchQueueItem[];
  environments?: readonly BenchEnvironment[];
  shelf?: readonly BenchShelfItem[];
  /** The caller's closing line. Absent → nothing is printed. */
  foot?: string | null;
  /** True only when the sandbox is genuinely attached — decides which empty sentence is true. */
  connected?: boolean;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

const BENCH_TONE_BAR: Record<BenchTone, string> = {
  ok: "bg-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning))]",
  info: "bg-[hsl(var(--primary))]",
};

const ENV_DOT: Record<NonNullable<BenchEnvironment["state"]>, string> = {
  ok: "bg-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning))]",
  risk: "bg-[hsl(var(--destructive))]",
};

const SHELF_GLYPH: Record<NonNullable<BenchShelfItem["outcome"]>, { glyph: string; ink: string }> = {
  shipped: { glyph: "✓", ink: "text-[hsl(var(--success))]" },
  parked: { glyph: "‖", ink: "text-[hsl(var(--gold-dark))]" },
  dropped: { glyph: "✕", ink: "text-[hsl(var(--destructive))]" },
};

/** CD's 9px/.14em section eyebrow. */
function BenchEyebrow({ children }: { children: string }) {
  return (
    <div className="text-[9px] font-semibold tracking-[0.14em] text-muted-foreground">{children}</div>
  );
}

export function Bench({
  now = null,
  queue = [],
  environments = [],
  shelf = [],
  foot = null,
  connected = false,
  loading = false,
  error = null,
  className,
}: BenchProps) {
  if (loading) {
    return (
      <div className={cn("flex min-w-0 flex-col gap-[11px] px-[14px] pb-[13px]", className)}>
        <div className="h-[196px] rounded-[14px] bg-muted motion-safe:animate-pulse" />
        <div className="h-[52px] rounded-[10px] bg-muted motion-safe:animate-pulse" />
      </div>
    );
  }

  const progress = fraction(now?.progress);

  return (
    <div className={cn("flex min-w-0 flex-col gap-[11px] px-[14px] pb-[13px]", className)}>
      {/* ── on the bench ─────────────────────────────────────────────── */}
      {now ? (
        <div className="min-w-0 rounded-[14px] bg-rail px-4 py-3.5 text-rail-foreground shadow-[0_12px_28px_hsl(var(--rail)/0.28)]">
          <div className="flex min-w-0 items-start gap-[11px]">
            <span
              aria-hidden
              className="mt-[5px] h-2 w-2 flex-none rounded-full bg-[hsl(var(--success-light))] motion-safe:animate-pulse"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-semibold tracking-[0.16em] text-rail-muted">
                {now.elapsed ? `ON THE BENCH · ${now.elapsed}` : "ON THE BENCH"}
              </div>
              <div className="mt-1.5 text-[17px] font-bold tracking-[-0.02em] text-rail-foreground">
                {now.name}
              </div>
              {now.note && (
                <div className="mt-[5px] text-[12px] leading-[1.55] text-rail-foreground/80">
                  {now.note}
                </div>
              )}
            </div>
            <div className="flex-none text-right">
              <div className="font-mono text-[19px] font-bold text-[hsl(var(--success-light))]">
                {percentLabel(now.progress)}
              </div>
              <div className="mt-0.5 text-[9.5px] text-rail-muted">{figure(now.stage)}</div>
            </div>
          </div>

          <div className="mt-[11px] h-[5px] overflow-hidden rounded-[3px] bg-rail-foreground/15">
            {/* No percentage, no fill: an empty track is honest, a guessed one is not. */}
            <div
              style={{ width: progress === null ? "0%" : `${progress * 100}%` }}
              className="h-full bg-[hsl(var(--success-light))]"
            />
          </div>

          {now.blocker && (
            /* CD tints this strip gold; a blocker is a warning, not an act, so it takes
               --warning and leaves the gold budget to the button below (§11). */
            <div className="mt-[11px] flex min-w-0 items-start gap-[9px] rounded-[9px] border border-[hsl(var(--warning)/0.42)] bg-[hsl(var(--warning)/0.18)] px-[11px] py-[9px]">
              <span aria-hidden className="mt-px flex-none text-[10px] text-[hsl(var(--warning))]">
                ⚑
              </span>
              <span className="min-w-0 text-[11.5px] leading-[1.5] text-rail-foreground/90">
                {now.blocker}
              </span>
            </div>
          )}

          {(now.cta || now.env || now.fixture) && (
            <div className="mt-[11px] flex flex-wrap items-center gap-[9px]">
              {now.cta && (
                <button
                  type="button"
                  onClick={now.onOpen}
                  disabled={!now.onOpen}
                  title={now.onOpen ? undefined : "Not wired to an action yet."}
                  className={cn(
                    "whitespace-nowrap rounded-[9px] bg-cd-gold px-[15px] py-2 text-[12.5px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter]",
                    now.onOpen ? "hover:brightness-[1.06]" : "cursor-not-allowed opacity-50",
                    FOCUS,
                  )}
                >
                  {now.cta}
                </button>
              )}
              {now.env && (
                <span className="font-mono text-[9.5px] text-rail-muted">{now.env}</span>
              )}
              {now.fixture && (
                <span className="ml-auto flex-none text-[10px] text-rail-muted">{now.fixture}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[14px] border border-dashed border-border bg-muted/40 px-4 py-[18px]">
          <div className="text-[12.5px] font-semibold">
            {error
              ? "The bench could not be read."
              : connected
                ? "Nothing is on the bench."
                : "The sandbox is not connected."}
          </div>
          <div className="mt-1.5 max-w-xl text-[11.5px] leading-[1.5] text-muted-foreground">
            {error ??
              (connected
                ? "She is not building anything this minute. What she picks up next appears below."
                : "What she is building, how far through it is and what is blocking it are facts about a running build. None of them are drawn until the sandbox actually reports them.")}
          </div>
        </div>
      )}

      {/* ── next on the bench ────────────────────────────────────────── */}
      <div>
        <BenchEyebrow>NEXT ON THE BENCH</BenchEyebrow>
        <div className="mt-2 flex flex-col gap-1.5">
          {queue.length === 0 && (
            <p className="text-[11px] leading-[1.5] text-muted-foreground">
              {connected ? "Nothing is queued behind it." : "The queue is not connected."}
            </p>
          )}
          {queue.map((q) => {
            const f = fraction(q.progress);
            const inner = (
              <>
                <span className="min-w-[70px] flex-1 overflow-hidden">
                  <span className="block truncate text-[12px] font-semibold">{q.name}</span>
                  {q.note && (
                    <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                      {q.note}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  className="h-1 w-[74px] flex-none overflow-hidden rounded-[2px] bg-muted"
                >
                  <span
                    style={{ width: f === null ? "0%" : `${f * 100}%` }}
                    className={cn("block h-full", BENCH_TONE_BAR[q.tone ?? "info"])}
                  />
                </span>
                <span className="w-8 flex-none text-right font-mono text-[9.5px] tabular-nums text-muted-foreground">
                  {percentLabel(q.progress)}
                </span>
                <span className="flex-none whitespace-nowrap text-[10px] text-muted-foreground">
                  {figure(q.stage)}
                </span>
              </>
            );
            const shell =
              "flex w-full min-w-0 items-center gap-2.5 rounded-[10px] border border-border bg-card px-[11px] py-2 text-left";
            return q.onOpen ? (
              <button
                key={q.id}
                type="button"
                onClick={q.onOpen}
                className={cn(shell, "transition-colors hover:border-border-strong", FOCUS)}
              >
                {inner}
              </button>
            ) : (
              <div key={q.id} className={shell}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── environments · off the bench ─────────────────────────────── */}
      <div className="flex min-w-0 flex-wrap gap-[11px]">
        <div className="min-w-0 flex-1 basis-[200px]">
          <BenchEyebrow>ENVIRONMENTS</BenchEyebrow>
          {environments.length === 0 && (
            <p className="mt-2 text-[11px] leading-[1.5] text-muted-foreground">
              No environment is reporting.
            </p>
          )}
          <dl className="mt-2 flex flex-col gap-1 empty:mt-0">
            {environments.map((e) => (
              <div key={e.id} className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 flex-none rounded-full",
                    e.state ? ENV_DOT[e.state] : "bg-muted-foreground/40",
                  )}
                />
                <dt className="flex-none text-[11.5px] font-semibold">{e.name}</dt>
                <dd className="flex min-w-0 flex-1 items-center gap-2">
                  {e.note && (
                    <span className="min-w-0 truncate text-[10.5px] text-muted-foreground">
                      {e.note}
                    </span>
                  )}
                  <span className="ml-auto flex-none font-mono text-[9.5px] text-muted-foreground">
                    {figure(e.drift)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0 flex-1 basis-[200px]">
          <BenchEyebrow>OFF THE BENCH</BenchEyebrow>
          {shelf.length === 0 && (
            <p className="mt-2 text-[11px] leading-[1.5] text-muted-foreground">
              Nothing has come off the bench yet.
            </p>
          )}
          <dl className="mt-2 flex flex-col gap-1 empty:mt-0">
            {shelf.map((s) => {
              const mark = s.outcome ? SHELF_GLYPH[s.outcome] : null;
              return (
                <div key={s.id} className="flex min-w-0 items-center gap-2">
                  {mark && (
                    <span aria-hidden className={cn("flex-none text-[10px]", mark.ink)}>
                      {mark.glyph}
                    </span>
                  )}
                  <dt className="min-w-0 truncate text-[11.5px]">
                    {s.name}
                    {s.outcome && <span className="sr-only"> — {s.outcome}</span>}
                  </dt>
                  <dd className="ml-auto flex-none whitespace-nowrap text-[10px] text-muted-foreground">
                    {figure(s.when)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      {foot && <p className="text-[10.5px] leading-[1.5] text-muted-foreground">{foot}</p>}
    </div>
  );
}

export default AreaChart;
