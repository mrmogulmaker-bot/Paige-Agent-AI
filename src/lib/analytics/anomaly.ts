/**
 * Client-side period-over-period anomaly note (IA slice 1c-x).
 *
 * HONESTY (§13/§8): this is a plain arithmetic delta over REAL rows — it is NOT
 * an L4 reasoning seam. No metric-series detector exists yet, so callers MUST
 * label the output as a simple period-over-period change and MUST NEVER phrase
 * it as "Paige reasoned / noticed / flagged". Attributing this arithmetic to
 * Paige's reasoning would be a fabrication.
 *
 * The series is split into two equal, adjacent windows (prior → current). A note
 * is returned only when there is a real, comparable baseline (prior sum > 0) and
 * the move clears the threshold. With < 2 comparable points, returns null (render
 * nothing — never a fabricated anomaly).
 */
export interface AnomalyResult {
  metricLabel: string;
  currentSum: number;
  priorSum: number;
  /** signed percent change of current window vs prior window */
  deltaPct: number;
  direction: "up" | "down";
  windowDays: number;
}

export function detectPeriodOverPeriod(
  metricLabel: string,
  series: { date: string; value: number }[],
  thresholdPct = 30,
): AnomalyResult | null {
  if (!Array.isArray(series) || series.length < 2) return null;
  const n = series.length;
  const half = Math.floor(n / 2);
  if (half < 1) return null;

  const prior = series.slice(0, half);
  const current = series.slice(n - half);
  const priorSum = prior.reduce((s, p) => s + (Number.isFinite(p.value) ? p.value : 0), 0);
  const currentSum = current.reduce((s, p) => s + (Number.isFinite(p.value) ? p.value : 0), 0);

  // No comparable baseline → no honest delta to report.
  if (priorSum <= 0) return null;

  const deltaPct = ((currentSum - priorSum) / priorSum) * 100;
  if (!Number.isFinite(deltaPct) || Math.abs(deltaPct) < thresholdPct) return null;

  return {
    metricLabel,
    currentSum,
    priorSum,
    deltaPct,
    direction: deltaPct >= 0 ? "up" : "down",
    windowDays: half,
  };
}
