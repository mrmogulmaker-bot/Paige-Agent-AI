// Team History (§C) — TENANT lens (IA slice 1c-x). Owning desk (§16): People &
// Talent · Operations. Reads team_scoreboard_metrics + team_handoff_queue (both
// RLS-tenant-scoped, NO tenant param).
//
// HONEST EMPTY-UNTIL-#422 (§11/§13): there is NO producer for the scoreboard yet
// (#422 open). The real query is wired so this fills the moment the writer ships;
// until then it renders a crafted EmptyState — never a fake trendline.
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { History, GitBranch } from "lucide-react";
import { SectionCard, StatTile, StatRow, EmptyState } from "@/components/ui/page";
import { useTeamHistory } from "@/hooks/analytics/useTeamHistory";

const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;

export function TeamHistorySection({ start, end }: { start: string; end: string }) {
  const data = useTeamHistory(start, end);

  // Build a per-day series for the first metric key present (real data only).
  const series =
    data.metricKeys.length > 0
      ? data.points
          .filter((p) => p.metricKey === data.metricKeys[0])
          .map((p) => ({ date: p.recordedAt.slice(0, 10), value: p.value }))
      : [];

  return (
    <div className="space-y-6">
      <SectionCard
        icon={History}
        title="Team history"
        description="People & Talent · Operations"
      >
        {data.loading ? (
          <div className="h-56 w-full animate-pulse rounded bg-muted" />
        ) : data.isEmpty || series.length < 2 ? (
          <EmptyState
            icon={History}
            title="Team performance history starts here"
            description="Team performance history starts recording once the scoreboard writer ships. No data yet — this fills in automatically the moment it does."
          />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
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
                  name={data.metricKeys[0]}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Handoff success" description="Accepted vs declined/expired lead handoffs" icon={GitBranch}>
        {data.loading ? (
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        ) : data.handoffSuccessRate == null ? (
          <EmptyState
            icon={GitBranch}
            title="No handoffs yet"
            description="No data until the scoreboard writer ships. Handoff acceptance rate appears once your team starts routing leads to one another."
          />
        ) : (
          <StatRow cols={3}>
            <StatTile label="Success rate" value={fmtPct(data.handoffSuccessRate)} intent="positive" />
            <StatTile label="Accepted" value={data.handoffAccepted.toLocaleString()} />
            <StatTile label="Declined / expired" value={(data.handoffDeclined + data.handoffExpired).toLocaleString()} />
          </StatRow>
        )}
      </SectionCard>
    </div>
  );
}
