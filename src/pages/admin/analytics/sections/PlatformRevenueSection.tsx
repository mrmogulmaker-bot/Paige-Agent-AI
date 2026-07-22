// Platform Revenue (§A) — OPERATOR LENS (IA slice 1c-x). Owning desk (§16):
// Executive Office · Finance. is_platform_owner-gated (defense in depth: view
// toggle + this `if (!isPlatformOwner) return null` + the RPC's own
// is_platform_admin() server gate).
//
// SINGLE MRR SOURCE (build-brief b): MRR/ARR come from platform_subscriptions via
// operator_dashboard_metrics — the rival user_subscriptions computation is DELETED
// from the dashboard. Metrics are passed in from the shared hook so §E doesn't
// re-query. The RPC returns point-in-time aggregates (NOT a timeseries), so this
// renders StatTiles + an honest "no trend series" note — never a fabricated trend.
import { DollarSign, TrendingUp, Users, UserPlus, AlertTriangle, Activity } from "lucide-react";
import { SectionCard, StatTile, StatRow, EmptyState } from "@/components/ui/page";
import type { OperatorMetrics } from "@/hooks/analytics/useOperatorPlatformMetrics";

const fmtCentsUsd = (c: number) =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtInt = (n: number) => n.toLocaleString("en-US");

export function PlatformRevenueSection({
  metrics,
  loading,
  isPlatformOwner,
}: {
  metrics: OperatorMetrics | null;
  loading: boolean;
  isPlatformOwner: boolean;
}) {
  if (!isPlatformOwner) return null;

  return (
    <SectionCard
      icon={DollarSign}
      title="Platform revenue"
      description="Executive Office · Finance — from platform_subscriptions (billing Layer 1)"
    >
      {loading ? (
        <StatRow cols={4}>
          {Array.from({ length: 4 }).map((_, i) => (
            <StatTile key={i} label="" value="" loading />
          ))}
        </StatRow>
      ) : !metrics ? (
        <EmptyState
          icon={DollarSign}
          title="Platform revenue unavailable"
          description="Fleet-wide revenue could not be loaded."
        />
      ) : (
        <div className="space-y-4">
          <StatRow cols={4}>
            <StatTile label="MRR" value={fmtCentsUsd(metrics.mrrCents)} icon={DollarSign} />
            <StatTile label="ARR" value={fmtCentsUsd(metrics.arrCents)} icon={TrendingUp} />
            <StatTile
              label="ARPA"
              value={metrics.arpaCents == null ? "—" : fmtCentsUsd(metrics.arpaCents)}
              icon={DollarSign}
            />
            <StatTile
              label="Trial conversion"
              value={metrics.trialConversionPct == null ? "—" : `${metrics.trialConversionPct.toFixed(1)}%`}
              icon={TrendingUp}
            />
          </StatRow>
          <StatRow cols={4}>
            <StatTile label="Active tenants" value={fmtInt(metrics.activeTenants.total)} icon={Users} />
            <StatTile label="New tenants" value={fmtInt(metrics.newTenants)} icon={UserPlus} />
            <StatTile
              label="At-risk tenants"
              value={fmtInt(metrics.atRiskCount)}
              icon={AlertTriangle}
              intent={metrics.atRiskCount > 0 ? "negative" : "neutral"}
            />
            <StatTile label="Weekly active tenants" value={fmtInt(metrics.wauTenants)} icon={Activity} />
          </StatRow>
          <p className="text-xs text-muted-foreground">
            Point-in-time fleet aggregates (individual {fmtInt(metrics.activeTenants.individual)} ·
            standalone {fmtInt(metrics.activeTenants.standalone)} · agency{" "}
            {fmtInt(metrics.activeTenants.agency)} · enterprise {fmtInt(metrics.activeTenants.enterprise)}).
            A time-series trajectory isn't available from this source yet — the movement decomposition
            below (Platform Financials) shows period change.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
