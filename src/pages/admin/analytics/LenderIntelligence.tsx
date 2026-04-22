import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Props {
  start: string;
  end: string;
}

interface Ranked {
  name: string;
  count: number;
}

const PIE_COLORS = ["#CFAE70", "#000000", "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];

export function LenderIntelligence({ start, end }: Props) {
  const [searched, setSearched] = useState<Ranked[]>([]);
  const [byApps, setByApps] = useState<Ranked[]>([]);
  const [denialReasons, setDenialReasons] = useState<Ranked[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const startIso = new Date(start).toISOString();
        const endIso = new Date(end + "T23:59:59").toISOString();

        const [searchRes, appsRes, deniedRes] = await Promise.all([
          supabase
            .from("analytics_events")
            .select("properties")
            .eq("event_name", "lender_searched")
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .limit(10000),
          supabase
            .from("funding_journey_applications")
            .select("lender_name")
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .limit(5000),
          supabase
            .from("funding_journey_applications")
            .select("denial_reason_category, denial_reason_detail")
            .eq("status", "denied")
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .limit(5000),
        ]);

        const sMap = new Map<string, number>();
        for (const r of searchRes.data || []) {
          const name = (r.properties as { lender_name?: string } | null)?.lender_name;
          if (!name) continue;
          sMap.set(name, (sMap.get(name) || 0) + 1);
        }
        const aMap = new Map<string, number>();
        for (const r of appsRes.data || []) {
          if (!r.lender_name) continue;
          aMap.set(r.lender_name, (aMap.get(r.lender_name) || 0) + 1);
        }
        const dMap = new Map<string, number>();
        for (const r of deniedRes.data || []) {
          const reason = (r.denial_reason_category as string | null) || "unspecified";
          dMap.set(reason, (dMap.get(reason) || 0) + 1);
        }

        const toRanked = (m: Map<string, number>, n = 10): Ranked[] =>
          Array.from(m.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, n);

        if (cancelled) return;
        setSearched(toRanked(sMap));
        setByApps(toRanked(aMap));
        setDenialReasons(toRanked(dMap, 8));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Top 10 lenders searched</CardTitle>
        </CardHeader>
        <CardContent className="max-h-80 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : searched.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No lender searches yet. Paige will log lenders as they're recommended.
            </p>
          ) : (
            <RankList items={searched} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 lenders by applications</CardTitle>
        </CardHeader>
        <CardContent className="max-h-80 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : byApps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications submitted in this period.</p>
          ) : (
            <RankList items={byApps} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Common denial reasons</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : denialReasons.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-4">
              No denials recorded in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={denialReasons}
                  dataKey="count"
                  nameKey="name"
                  outerRadius={80}
                  label={(e) => `${e.name}`}
                >
                  {denialReasons.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RankList({ items }: { items: Ranked[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, idx) => (
        <li
          key={item.name}
          className="flex items-center justify-between text-sm border-b border-border pb-1.5 last:border-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs text-muted-foreground w-5">{idx + 1}.</span>
            <span className="truncate">{item.name}</span>
          </div>
          <span className="font-mono text-xs">{item.count}</span>
        </li>
      ))}
    </ol>
  );
}
