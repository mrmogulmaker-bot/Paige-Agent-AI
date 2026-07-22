// Analytics tenant/operator lens toggle (IA slice 1c-x). A thin clone of
// TeamViewToggle (1c-ix) / ClientsViewToggle (1c-viii-c) — reuse the PROVEN
// segmented-control chrome, but the axis is genuinely different (tenant vs
// operator, not mine/team/business), so this is a dedicated 2-value union, NOT
// a reuse of CommandCenterView (reusing that type would be the §18 mis-extension
// the architect flagged). Indigo active state, NEVER gold (gold stays on a
// genuine act, §11). Renders only when the persona can switch >1 lens — a
// non-owner tenant staffer never sees it and is pinned to the tenant lens.
import { cn } from "@/lib/utils";

export type AnalyticsLens = "tenant" | "operator";

const LABEL: Record<AnalyticsLens, string> = {
  tenant: "My practice",
  operator: "Whole platform",
};

export function AnalyticsViewToggle({
  views,
  value,
  onChange,
}: {
  views: AnalyticsLens[];
  value: AnalyticsLens;
  onChange: (v: AnalyticsLens) => void;
}) {
  if (views.length <= 1) return null;
  return (
    <div
      role="tablist"
      aria-label="Analytics lens"
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
    >
      {views.map((v) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {LABEL[v]}
          </button>
        );
      })}
    </div>
  );
}
