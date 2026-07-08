import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { AlertTriangle, BookOpen, Sparkles, TrendingUp, Activity } from "lucide-react";

interface RagDoc {
  id: string;
  document_type: string;
  title: string;
  quality_score: number;
  usage_count: number;
  helpful_count: number;
  is_published: boolean;
  created_at: string;
}

interface Props {
  docs: RagDoc[];
  typeColors: Record<string, string>;
}

const PIE_PALETTE = [
  "hsl(var(--accent))",
  "hsl(var(--primary))",
  "#10b981",
  "#8b5cf6",
  "#f59e0b",
  "#06b6d4",
  "#ef4444",
];

export function KnowledgeInsightsTab({ docs, typeColors }: Props) {
  const [retrievalSeries, setRetrievalSeries] = useState<{ date: string; retrievals: number }[]>([]);
  const [retrievalsThisMonth, setRetrievalsThisMonth] = useState<number>(0);
  const [avgHelpfulness, setAvgHelpfulness] = useState<number>(0);

  useEffect(() => {
    (async () => {
      // Last 30 days of retrievals
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data: logs } = await supabase
        .from("rag_retrieval_log" as any)
        .select("created_at, was_helpful")
        .gte("created_at", since.toISOString())
        .limit(5000);

      const buckets = new Map<string, number>();
      let helpfulYes = 0;
      let helpfulTotal = 0;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      let monthCount = 0;

      (logs || []).forEach((row: any) => {
        const d = new Date(row.created_at);
        const key = d.toISOString().slice(0, 10);
        buckets.set(key, (buckets.get(key) || 0) + 1);
        if (d >= monthStart) monthCount++;
        if (typeof row.was_helpful === "boolean") {
          helpfulTotal++;
          if (row.was_helpful) helpfulYes++;
        }
      });

      // Fill missing days
      const series: { date: string; retrievals: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        series.push({ date: key.slice(5), retrievals: buckets.get(key) || 0 });
      }
      setRetrievalSeries(series);
      setRetrievalsThisMonth(monthCount);
      setAvgHelpfulness(helpfulTotal > 0 ? (helpfulYes / helpfulTotal) * 100 : 0);
    })();
  }, [docs.length]);

  const stats = useMemo(() => {
    const total = docs.length;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const autoThisMonth = docs.filter((d) =>
      new Date(d.created_at) >= monthStart && d.id // any doc created this month
    ).length;
    return { total, autoThisMonth };
  }, [docs]);

  const byType = useMemo(() => {
    const counts = new Map<string, number>();
    docs.forEach((d) => counts.set(d.document_type, (counts.get(d.document_type) || 0) + 1));
    return Array.from(counts.entries()).map(([name, value]) => ({ name: name.replace(/_/g, " "), value, key: name }));
  }, [docs]);

  const topRetrieved = useMemo(
    () => [...docs].sort((a, b) => b.usage_count - a.usage_count).slice(0, 10).filter((d) => d.usage_count > 0),
    [docs]
  );

  const topHelpful = useMemo(
    () => [...docs]
      .filter((d) => d.usage_count >= 3)
      .map((d) => ({ ...d, rate: d.helpful_count / d.usage_count }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10),
    [docs]
  );

  const flagged = useMemo(
    () => docs.filter((d) => d.usage_count >= 10 && (d.helpful_count / d.usage_count) < 0.3),
    [docs]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BookOpen} label="Total Documents" value={stats.total.toLocaleString()} />
        <StatCard icon={Sparkles} label="Auto-Generated This Month" value={stats.autoThisMonth.toLocaleString()} />
        <StatCard icon={Activity} label="RAG Retrievals This Month" value={retrievalsThisMonth.toLocaleString()} />
        <StatCard icon={TrendingUp} label="Avg Helpfulness" value={`${avgHelpfulness.toFixed(0)}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {byType.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No documents yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                    {byType.map((_, i) => (
                      <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retrieval Frequency (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={retrievalSeries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="retrievals" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Retrieved Documents</CardTitle>
          </CardHeader>
          <CardContent>
            {topRetrieved.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No retrievals yet.</p>
            ) : (
              <ul className="space-y-2">
                {topRetrieved.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate" title={d.title}>{d.title}</div>
                      <Badge variant="outline" className={`text-[10px] mt-0.5 ${typeColors[d.document_type] || ""}`}>
                        {d.document_type.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="text-sm font-bold tabular-nums text-gold-dark">{d.usage_count}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Helpful Documents</CardTitle>
          </CardHeader>
          <CardContent>
            {topHelpful.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Need more retrievals to rank helpfulness.</p>
            ) : (
              <ul className="space-y-2">
                {topHelpful.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate" title={d.title}>{d.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {d.helpful_count}/{d.usage_count} helpful
                      </div>
                    </div>
                    <div className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {(d.rate * 100).toFixed(0)}%
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {flagged.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Flagged for Review
              <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                {flagged.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              These documents are retrieved often but rarely produce a helpful client response (helpful rate &lt; 30%).
            </p>
            <ul className="space-y-2">
              {flagged.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" title={d.title}>{d.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.helpful_count}/{d.usage_count} helpful · {((d.helpful_count / d.usage_count) * 100).toFixed(0)}%
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                    Low helpfulness
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
