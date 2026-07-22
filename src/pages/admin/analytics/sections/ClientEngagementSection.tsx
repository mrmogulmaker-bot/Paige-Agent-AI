// Client Engagement (§B-engagement) — TENANT lens (IA slice 1c-x). Owning desk
// (§16): Client Success. Reads paige_client_events (RLS-tenant-scoped, NO tenant
// param) for the engagement series, and reuses the parameterized
// CohortRetentionTable in "client_lifecycle" mode for cohort retention.
//
// B-ENGAGEMENT ONLY — this does NOT render B-transformation
// (client_transformation_metrics does not exist; CX-4, deferred). §13: the
// series only draws a trendline with ≥ 2 days of real events.
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { HeartHandshake, Users } from "lucide-react";
import { SectionCard, StatTile, StatRow, EmptyState } from "@/components/ui/page";
import { useClientEngagement } from "@/hooks/analytics/useClientEngagement";
import { CohortRetentionTable } from "../CohortRetentionTable";

export function ClientEngagementSection({ start, end }: { start: string; end: string }) {
  const data = useClientEngagement(start, end);
  const daysWithActivity = data.byDay.filter((d) => d.value > 0).length;

  return (
    <div className="space-y-6">
      <SectionCard
        icon={HeartHandshake}
        title="Client engagement"
        description="Client Success"
      >
        {data.loading ? (
          <div className="h-56 w-full animate-pulse rounded bg-muted" />
        ) : daysWithActivity < 2 ? (
          <EmptyState
            icon={HeartHandshake}
            title="Insufficient data"
            description="Client engagement is charted from real activity across your clients. Once there are at least two active days, the trend shows here."
          />
        ) : (
          <div className="space-y-4">
            <StatRow cols={2}>
              <StatTile label="Client events" value={data.totalEvents.toLocaleString()} icon={HeartHandshake} />
              <StatTile label="Active clients" value={data.distinctClients.toLocaleString()} icon={Users} />
            </StatRow>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.byDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                      color: "hsl(var(--popover-foreground))",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    cursor={{ stroke: "hsl(var(--muted-foreground) / 0.4)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Engagement events"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Client retention by cohort — REUSED CohortRetentionTable, client mode (§18). */}
      <CohortRetentionTable mode="client_lifecycle" />
    </div>
  );
}
