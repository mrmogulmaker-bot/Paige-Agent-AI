import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Target, FileCheck, DollarSign } from "lucide-react";

interface Props {
  start: string;
  end: string;
}

const RANGES: { label: string; min: number; max: number }[] = [
  { label: "<580", min: 0, max: 579 },
  { label: "580–619", min: 580, max: 619 },
  { label: "620–659", min: 620, max: 659 },
  { label: "660–699", min: 660, max: 699 },
  { label: "700–739", min: 700, max: 739 },
  { label: "740+", min: 740, max: 900 },
];
const MILESTONES = [580, 620, 680, 720];

export function CreditOutcomes({ start, end }: Props) {
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [distribution, setDistribution] = useState<{ range: string; count: number }[]>([]);
  const [milestoneHits, setMilestoneHits] = useState<Record<number, number>>({});
  const [funding, setFunding] = useState({ submitted: 0, funded: 0, denied: 0 });
  const [improvements, setImprovements] = useState({ d30: 0, d60: 0, d90: 0 });
  const [hasAnyData, setHasAnyData] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1. Pull profile estimated FICOs as starting score signal.
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, estimated_fico_tu, estimated_fico_ex, estimated_fico_eq")
          .limit(5000);

        let sum = 0;
        let n = 0;
        const dist = RANGES.map((r) => ({ range: r.label, count: 0 }));
        for (const p of profiles || []) {
          const scores = [p.estimated_fico_tu, p.estimated_fico_ex, p.estimated_fico_eq]
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v) && v > 0);
          if (scores.length === 0) continue;
          // Use middle score (most lender-relevant); fall back to avg.
          const sorted = [...scores].sort((a, b) => a - b);
          const middle = sorted[Math.floor(sorted.length / 2)];
          sum += middle;
          n++;
          const idx = RANGES.findIndex((r) => middle >= r.min && middle <= r.max);
          if (idx >= 0) dist[idx].count++;
        }
        setAvgScore(n > 0 ? Math.round(sum / n) : null);
        setDistribution(dist);

        // 2. Milestones crossed this month — derived from business_credit_history score deltas.
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const { data: history } = await supabase
          .from("business_credit_history")
          .select("user_id, score_value, recorded_at, metric_name")
          .gte("recorded_at", monthStart.toISOString())
          .order("recorded_at", { ascending: true })
          .limit(20000);

        const byUser = new Map<string, { score: number; ts: number }[]>();
        for (const h of history || []) {
          if (!h.user_id) continue;
          const list = byUser.get(h.user_id) ?? [];
          list.push({
            score: Number(h.score_value),
            ts: new Date(h.recorded_at).getTime(),
          });
          byUser.set(h.user_id, list);
        }
        const hits: Record<number, number> = { 580: 0, 620: 0, 680: 0, 720: 0 };
        for (const entries of byUser.values()) {
          if (entries.length < 2) continue;
          const first = entries[0].score;
          const last = entries[entries.length - 1].score;
          for (const m of MILESTONES) {
            if (first < m && last >= m) hits[m]++;
          }
        }
        setMilestoneHits(hits);

        // 2b. Score improvement at 30 / 60 / 90 days (clients who increased vs first reading).
        const { data: history90 } = await supabase
          .from("business_credit_history")
          .select("user_id, score_value, recorded_at")
          .gte("recorded_at", new Date(Date.now() - 95 * 86400000).toISOString())
          .order("recorded_at", { ascending: true })
          .limit(20000);

        const longByUser = new Map<string, { score: number; ts: number }[]>();
        for (const h of history90 || []) {
          if (!h.user_id) continue;
          const list = longByUser.get(h.user_id) ?? [];
          list.push({
            score: Number(h.score_value),
            ts: new Date(h.recorded_at).getTime(),
          });
          longByUser.set(h.user_id, list);
        }
        const buckets = { d30: 0, d60: 0, d90: 0 };
        for (const entries of longByUser.values()) {
          if (entries.length < 2) continue;
          const baseline = entries[0];
          const findAfter = (days: number) =>
            entries.find((e) => e.ts >= baseline.ts + days * 86400000);
          const r30 = findAfter(30);
          const r60 = findAfter(60);
          const r90 = findAfter(90);
          if (r30 && r30.score > baseline.score) buckets.d30++;
          if (r60 && r60.score > baseline.score) buckets.d60++;
          if (r90 && r90.score > baseline.score) buckets.d90++;
        }
        setImprovements(buckets);

        // 3. Funding outcomes
        const startIso = new Date(start).toISOString();
        const endIso = new Date(end + "T23:59:59").toISOString();
        const { data: apps } = await supabase
          .from("funding_journey_applications")
          .select("status")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .limit(5000);
        let submitted = 0;
        let funded = 0;
        let denied = 0;
        for (const a of apps || []) {
          submitted++;
          const status = String(a.status);
          if (status === "funded" || status === "approved") funded++;
          else if (status === "denied") denied++;
        }
        if (cancelled) return;
        setFunding({ submitted, funded, denied });

        const anyData =
          n > 0 ||
          submitted > 0 ||
          Object.values(hits).some((v) => v > 0) ||
          buckets.d30 + buckets.d60 + buckets.d90 > 0;
        setHasAnyData(anyData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const conversion = funding.submitted > 0 ? funding.funded / funding.submitted : 0;

  if (!loading && !hasAnyData) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No credit profile updates recorded yet. Credit score changes, milestone hits, and bureau
          updates will appear here as clients upload reports and Paige tracks their progress.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Avg Starting Score" value={avgScore != null ? `${avgScore}` : "—"} icon={TrendingUp} />
        <Stat label="Apps Submitted" value={funding.submitted.toLocaleString()} icon={FileCheck} />
        <Stat label="Funded" value={funding.funded.toLocaleString()} icon={DollarSign} />
        <Stat label="Funding Conversion" value={`${(conversion * 100).toFixed(1)}%`} icon={Target} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credit score distribution</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#CFAE70" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Milestone hits this month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {MILESTONES.map((m) => (
              <div
                key={m}
                className="rounded-lg border border-border bg-card p-4 flex flex-col items-center"
              >
                <div className="text-xs text-muted-foreground">Crossed {m}</div>
                <div className="text-2xl font-bold mt-1">{milestoneHits[m] ?? 0}</div>
                <div className="text-[10px] text-muted-foreground">clients</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Calculated from credit profile score deltas this calendar month.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Score improvement tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {([
              { label: "30 days", value: improvements.d30 },
              { label: "60 days", value: improvements.d60 },
              { label: "90 days", value: improvements.d90 },
            ] as const).map((row) => (
              <div
                key={row.label}
                className="rounded-lg border border-border bg-card p-4 flex flex-col items-center"
              >
                <div className="text-xs text-muted-foreground">Improved at {row.label}</div>
                <div className="text-2xl font-bold mt-1">{row.value}</div>
                <div className="text-[10px] text-muted-foreground">clients</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Clients whose later reading exceeded their first reading in the rolling window.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-xl md:text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
