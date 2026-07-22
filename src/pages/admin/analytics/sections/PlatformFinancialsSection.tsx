// Platform Financials (§E) — OPERATOR LENS (IA slice 1c-x). Owning desk (§16):
// Finance. is_platform_owner-gated (same defense-in-depth as §A).
//
// TRAP GUARD (build-brief c): §E must NEVER read financial_kpis — that table is a
// per-USER cashflow/underwriting store (avg_balance_90d, dscr, nsf_count), NOT
// company revenue. Despite the name it has nothing to do with platform financials.
// The only revenue source here is platform_subscriptions (via the shared operator
// metrics) + platform_metered_events.wholesale_cost_usd for COGS.
//
// Reuses MrrWaterfall for movement decomposition (relocated from the legacy body).
// MRR/ARR reuse the shared hook's metrics — no double-query.
import { Wallet, Coins } from "lucide-react";
import { SectionCard, StatTile, StatRow, EmptyState } from "@/components/ui/page";
import { MrrWaterfall } from "../MrrWaterfall";
import type { OperatorMetrics } from "@/hooks/analytics/useOperatorPlatformMetrics";

const fmtCentsUsd = (c: number) =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function PlatformFinancialsSection({
  metrics,
  wholesaleCostUsd,
  wholesaleAvailable,
  loading,
  isPlatformOwner,
  start,
  end,
}: {
  metrics: OperatorMetrics | null;
  wholesaleCostUsd: number;
  wholesaleAvailable: boolean;
  loading: boolean;
  isPlatformOwner: boolean;
  start: string;
  end: string;
}) {
  if (!isPlatformOwner) return null;

  return (
    <div className="space-y-6">
      <SectionCard
        icon={Wallet}
        title="Platform financials"
        description="Finance — billing-taxonomy financials (Layer 1 subscriptions · Layer 3 metered COGS)"
      >
        {loading ? (
          <StatRow cols={3}>
            {Array.from({ length: 3 }).map((_, i) => (
              <StatTile key={i} label="" value="" loading />
            ))}
          </StatRow>
        ) : (
          <div className="space-y-4">
            <StatRow cols={3}>
              <StatTile
                label="MRR (Layer 1)"
                value={metrics ? fmtCentsUsd(metrics.mrrCents) : "—"}
                icon={Coins}
              />
              <StatTile
                label="ARR (Layer 1)"
                value={metrics ? fmtCentsUsd(metrics.arrCents) : "—"}
                icon={Coins}
              />
              <StatTile
                label="Metered COGS (period)"
                value={wholesaleAvailable ? fmtUsd(wholesaleCostUsd) : "—"}
                icon={Wallet}
                hint="Layer 3 wholesale pass-through"
              />
            </StatRow>
            {!wholesaleAvailable && (
              <EmptyState
                title="No metered pass-through cost yet"
                description="Layer 3 wholesale cost populates gross-margin analysis once metered events are recorded. No fabricated margin is shown until then."
              />
            )}
            <p className="text-xs text-muted-foreground">
              MRR/ARR are monthly-equivalent Layer-1 figures; metered COGS is summed over the selected
              period. They aren't blended into a single margin here to avoid mixing time windows.
            </p>
          </div>
        )}
      </SectionCard>

      {/* Movement decomposition — reused MrrWaterfall, operator lens. */}
      <MrrWaterfall start={start} end={end} />
    </div>
  );
}
