import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Database, BookOpen, ThumbsUp, Activity } from "lucide-react";

interface Props {
  start: string;
  end: string;
}

interface RagDoc {
  id: string;
  title: string;
  document_type: string;
  usage_count: number;
  helpful_count: number;
}

export function RagPerformance({ start, end }: Props) {
  const [totalRetrievals, setTotalRetrievals] = useState(0);
  const [avgSimilarity, setAvgSimilarity] = useState<number | null>(null);
  const [helpfulnessRate, setHelpfulnessRate] = useState<number | null>(null);
  const [docCount, setDocCount] = useState(0);
  const [perDay, setPerDay] = useState<{ date: string; count: number }[]>([]);
  const [topDocs, setTopDocs] = useState<RagDoc[]>([]);
  const [flagged, setFlagged] = useState<RagDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const startIso = new Date(start).toISOString();
        const endIso = new Date(end + "T23:59:59").toISOString();

        const [eventsRes, docsRes] = await Promise.all([
          supabase
            .from("analytics_events")
            .select("created_at, properties")
            .eq("event_name", "rag_retrieval_triggered")
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .limit(10000),
          supabase
            .from("rag_documents")
            .select("id, title, document_type, usage_count, helpful_count, is_published")
            .order("usage_count", { ascending: false })
            .limit(500),
        ]);

        const events = eventsRes.data || [];
        setTotalRetrievals(events.length);

        let simSum = 0;
        let simCount = 0;
        const byDay = new Map<string, number>();
        for (const e of events) {
          const sim = Number(
            (e.properties as { avg_similarity?: number } | null)?.avg_similarity ?? NaN,
          );
          if (Number.isFinite(sim)) {
            simSum += sim;
            simCount++;
          }
          const day = new Date(e.created_at).toISOString().slice(0, 10);
          byDay.set(day, (byDay.get(day) || 0) + 1);
        }
        setAvgSimilarity(simCount > 0 ? simSum / simCount : null);

        const dayArr: { date: string; count: number }[] = [];
        const cursor = new Date(start);
        const endDt = new Date(end);
        while (cursor <= endDt) {
          const k = cursor.toISOString().slice(0, 10);
          dayArr.push({ date: k, count: byDay.get(k) || 0 });
          cursor.setDate(cursor.getDate() + 1);
        }
        setPerDay(dayArr);

        const allDocs = (docsRes.data || []) as (RagDoc & { is_published: boolean })[];
        const published = allDocs.filter((d) => d.is_published);
        setDocCount(published.length);

        const totalUsage = published.reduce((s, d) => s + (d.usage_count || 0), 0);
        const totalHelpful = published.reduce((s, d) => s + (d.helpful_count || 0), 0);
        setHelpfulnessRate(totalUsage > 0 ? totalHelpful / totalUsage : null);

        setTopDocs(published.slice(0, 10));
        setFlagged(
          published.filter(
            (d) => d.usage_count > 10 && d.helpful_count / Math.max(d.usage_count, 1) < 0.3,
          ).slice(0, 10),
        );

        if (cancelled) return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total RAG Retrievals"
          value={totalRetrievals.toLocaleString()}
          icon={Activity}
        />
        <StatCard
          label="Avg Similarity"
          value={avgSimilarity != null ? avgSimilarity.toFixed(3) : "—"}
          icon={Database}
        />
        <StatCard
          label="Helpfulness Rate"
          value={helpfulnessRate != null ? `${(helpfulnessRate * 100).toFixed(1)}%` : "—"}
          icon={ThumbsUp}
        />
        <StatCard
          label="KB Documents"
          value={docCount.toLocaleString()}
          icon={BookOpen}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>RAG retrievals per day</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={perDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#CFAE70" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top 10 most retrieved documents</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {topDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No document retrievals yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left py-2">Title</th>
                    <th className="text-right py-2">Uses</th>
                    <th className="text-right py-2">Helpful</th>
                    <th className="text-right py-2">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {topDocs.map((d) => {
                    const rate = d.usage_count > 0 ? d.helpful_count / d.usage_count : 0;
                    return (
                      <tr key={d.id} className="border-t border-border">
                        <td className="py-2">
                          <div className="font-medium truncate max-w-xs">{d.title}</div>
                          <Badge variant="outline" className="text-[10px] mt-1">
                            {d.document_type}
                          </Badge>
                        </td>
                        <td className="py-2 text-right font-mono">{d.usage_count}</td>
                        <td className="py-2 text-right font-mono">{d.helpful_count}</td>
                        <td className="py-2 text-right font-mono">{(rate * 100).toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Flagged for review
              {flagged.length > 0 && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                  {flagged.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {flagged.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents currently flagged. Documents with &gt;10 retrievals and a helpfulness rate
                below 30% will appear here for review.
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {flagged.map((d) => {
                  const rate = d.helpful_count / Math.max(d.usage_count, 1);
                  return (
                    <li key={d.id} className="py-2">
                      <div className="font-medium">{d.title}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{d.document_type}</Badge>
                        <span>{d.usage_count} uses</span>
                        <span className="text-destructive">
                          {(rate * 100).toFixed(0)}% helpful
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
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
