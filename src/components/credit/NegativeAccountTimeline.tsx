import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getAccountAgeImpact, type AccountAgeBand } from "@/lib/fundabilityScores";

export interface NegativeAccountTimelineItem {
  id: string;
  label: string;
  accountType?: string | null;
  date: string | Date | null | undefined;
}

interface NegativeAccountTimelineProps {
  accounts: NegativeAccountTimelineItem[];
  totalWeightedNegativeScore?: number;
}

const TIMELINE_MAX_MONTHS = 84; // FCRA 7-year removal
const PRIMARY_LOOKBACK_MONTHS = 24;

const BAND_DOT_CLASS: Record<AccountAgeBand, string> = {
  critical: "bg-red-500 ring-red-200",
  severe: "bg-orange-500 ring-orange-200",
  moderate: "bg-amber-500 ring-amber-200",
  mild: "bg-yellow-500 ring-yellow-200",
  aging: "bg-blue-500 ring-blue-200",
  historical: "bg-gray-400 ring-gray-200",
  approaching_removal: "bg-green-500 ring-green-200",
};

export function NegativeAccountTimeline({
  accounts,
  totalWeightedNegativeScore,
}: NegativeAccountTimelineProps) {
  const dots = useMemo(() => {
    return accounts
      .map((a) => ({ ...a, impact: getAccountAgeImpact(a, a.date) }))
      .filter((a) => a.impact.monthsOnReport >= 0);
  }, [accounts]);

  const within24 = dots.filter((d) => d.impact.monthsOnReport <= PRIMARY_LOOKBACK_MONTHS).length;
  const approachingRemoval = dots.filter(
    (d) => d.impact.band === "approaching_removal" && d.impact.monthsUntilRemoval <= 12
  ).length;

  if (dots.length === 0) return null;

  const summaryLine =
    within24 === 0
      ? `All ${dots.length} of your negative accounts are outside the primary 24-month bank lookback window. This is a strong position — most conventional lenders will not flag these in automated underwriting.`
      : `Your ${dots.length} negative account${dots.length === 1 ? "" : "s"} have a weighted impact score of ${(totalWeightedNegativeScore ?? 0).toFixed(2)}. ${within24} ${within24 === 1 ? "account falls" : "accounts fall"} within the critical 24-month bank lookback window.${approachingRemoval > 0 ? ` ${approachingRemoval} account${approachingRemoval === 1 ? "" : "s"} will be automatically removed within 12 months.` : ""}`;

  // Position helpers — clamp into [0, TIMELINE_MAX_MONTHS] for plotting
  const pctFor = (months: number) =>
    `${Math.min(100, Math.max(0, (Math.min(months, TIMELINE_MAX_MONTHS) / TIMELINE_MAX_MONTHS) * 100))}%`;

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Negative Account Timeline</h3>
        <p className="text-sm text-muted-foreground">{summaryLine}</p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Track */}
          <div className="relative h-20">
            {/* High-impact zone (0-24mo) */}
            <div
              className="absolute top-0 bottom-0 left-0 rounded-l bg-red-50/70"
              style={{ width: pctFor(PRIMARY_LOOKBACK_MONTHS) }}
              aria-hidden
            />
            {/* Aging zone (24-84mo) */}
            <div
              className="absolute top-0 bottom-0 rounded-r bg-muted/40"
              style={{
                left: pctFor(PRIMARY_LOOKBACK_MONTHS),
                right: 0,
              }}
              aria-hidden
            />

            {/* Center axis line */}
            <div className="absolute left-0 right-0 top-1/2 h-px bg-border" aria-hidden />

            {/* 24-month marker */}
            <div
              className="absolute top-0 bottom-0 border-l-2 border-dashed border-primary/70"
              style={{ left: pctFor(PRIMARY_LOOKBACK_MONTHS) }}
              aria-hidden
            />
            {/* 84-month marker */}
            <div
              className="absolute top-0 bottom-0 border-l-2 border-dashed border-green-600/70"
              style={{ left: pctFor(TIMELINE_MAX_MONTHS) }}
              aria-hidden
            />

            {/* Dots */}
            <TooltipProvider delayDuration={100}>
              {dots.map((d) => (
                <Tooltip key={d.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 rounded-full ring-4 ring-offset-1 ring-offset-background transition-transform hover:scale-125 focus:outline-none focus:ring-primary ${BAND_DOT_CLASS[d.impact.band]}`}
                      style={{ left: pctFor(d.impact.monthsOnReport) }}
                      aria-label={`${d.label} — ${d.impact.bandLabel}`}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="font-semibold text-sm">{d.label}</p>
                    {d.accountType && (
                      <p className="text-xs text-muted-foreground capitalize">{d.accountType}</p>
                    )}
                    <p className="text-xs mt-1">
                      <span className="font-medium">{d.impact.bandLabel}</span>
                      {" • "}
                      {d.impact.monthsOnReport} months on report
                    </p>
                    {d.impact.monthsUntilRemoval > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {d.impact.monthsUntilRemoval} month
                        {d.impact.monthsUntilRemoval === 1 ? "" : "s"} until FCRA removal
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          </div>

          {/* X-axis labels */}
          <div className="relative mt-2 h-8 text-[10px] text-muted-foreground">
            <span className="absolute left-0 -translate-x-0">Today</span>
            <span
              className="absolute -translate-x-1/2 text-primary font-medium"
              style={{ left: pctFor(PRIMARY_LOOKBACK_MONTHS) }}
            >
              24mo · Primary Bank Lookback
            </span>
            <span
              className="absolute -translate-x-full text-green-700 font-medium"
              style={{ left: pctFor(TIMELINE_MAX_MONTHS) }}
            >
              84mo · FCRA Removal
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
        <LegendDot className="bg-red-500" label="Critical (0-6mo)" />
        <LegendDot className="bg-orange-500" label="Severe (7-12mo)" />
        <LegendDot className="bg-amber-500" label="Moderate (13-18mo)" />
        <LegendDot className="bg-yellow-500" label="Mild (19-24mo)" />
        <LegendDot className="bg-blue-500" label="Aging (25-48mo)" />
        <LegendDot className="bg-gray-400" label="Historical (49-84mo)" />
        <LegendDot className="bg-green-500" label="Approaching Removal (85mo+)" />
      </div>
    </Card>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${className}`} aria-hidden />
      {label}
    </span>
  );
}
