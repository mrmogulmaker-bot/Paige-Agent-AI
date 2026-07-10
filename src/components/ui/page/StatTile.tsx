import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { GlyphPlate } from "./GlyphPlate";

type Intent = "neutral" | "positive" | "negative";

export function StatRow({ cols = 4, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  const colClass = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" }[cols];
  return <div className={cn("grid gap-4 sm:grid-cols-2", colClass)}>{children}</div>;
}

/**
 * The KPI primitive — replaces the 5+ hand-rolled StatCard/KpiCard reinventions.
 * font-display tabular-nums value; delta color is SEMANTIC (never gold, never a
 * raw text-green-600). loading → Skeleton, not a spinner.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  delta,
  intent = "neutral",
  hint,
  loading,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  intent?: Intent;
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  const intentText = {
    neutral: "text-foreground",
    positive: "text-[hsl(var(--success))]",
    negative: "text-[hsl(var(--destructive))]",
  }[intent];

  const deltaMeta = delta
    ? {
        up: { Icon: ArrowUpRight, cls: "text-[hsl(var(--success))]", sr: "increased" },
        down: { Icon: ArrowDownRight, cls: "text-[hsl(var(--destructive))]", sr: "decreased" },
        flat: { Icon: ArrowRight, cls: "text-muted-foreground", sr: "unchanged" },
      }[delta.direction]
    : null;

  return (
    <div className={cn("rounded-[var(--radius)] border border-border bg-card shadow-card p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <div className={cn("mt-1 font-display text-2xl font-semibold tabular-nums", intentText)}>{value}</div>
          )}
        </div>
        {Icon && <GlyphPlate icon={Icon} size="sm" />}
      </div>
      {(deltaMeta || hint) && !loading && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {deltaMeta && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", deltaMeta.cls)}>
              <deltaMeta.Icon className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">{deltaMeta.sr} </span>
              {delta!.value}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
