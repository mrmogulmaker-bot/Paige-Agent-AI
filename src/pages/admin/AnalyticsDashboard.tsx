import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Users,
  DollarSign,
  Activity,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  FileDown,
  FileText,
} from "lucide-react";
import {
  exportMetricsToCsv,
  exportMetricsToPdf,
  type InvestorMetrics,
} from "@/lib/analytics/investorExport";
import { CohortRetentionTable } from "./analytics/CohortRetentionTable";
import { MrrWaterfall } from "./analytics/MrrWaterfall";
import { RagPerformance } from "./analytics/RagPerformance";
import { CreditOutcomes } from "./analytics/CreditOutcomes";
import { LenderIntelligence } from "./analytics/LenderIntelligence";

type RangeKey = "7d" | "30d" | "90d" | "ytd";

interface DailyRow {
  date: string;
  new_signups: number;
  active_users: number;
  paige_sessions: number;
  voice_sessions: number;
  credit_uploads: number;
  funding_applications: number;
  new_mrr: number;
  churned_mrr: number;
}

interface FeatureRow {
  feature_name: string;
  usage_count: number;
  unique_users: number;
  date: string;
}

interface TopEvent {
  event_name: string;
  count: number;
}

interface ChannelRow {
  source: string;
  signups: number;
}

interface ActivityItem {
  id: string;
  event_name: string;
  event_category: string;
  user_id: string | null;
  page_path: string | null;
  created_at: string;
}

const COLORS = ["#CFAE70", "#000000", "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];

function rangeToDates(key: RangeKey): { start: string; end: string; days: number } {
  const end = new Date();
  const start = new Date();
  let days = 30;
  if (key === "7d") days = 7;
  else if (key === "30d") days = 30;
  else if (key === "90d") days = 90;
  else if (key === "ytd") {
    start.setMonth(0, 1);
    days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days };
  }
  start.setDate(end.getDate() - days);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days };
}

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function AnalyticsDashboard() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { start, end, days } = useMemo(() => rangeToDates(range), [range]);

  // Live KPI data
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeToday, setActiveToday] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [trialToPaid, setTrialToPaid] = useState(0);
  const [churnRate, setChurnRate] = useState(0);

  // MV data
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [featureUsage, setFeatureUsage] = useState<FeatureRow[]>([]);
  const [topEvents, setTopEvents] = useState<TopEvent[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      // ---- Live KPIs ----
      const [usersRes, subsActiveRes, subsTrialRes, subsCancelledRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("user_subscriptions")
          .select("plan_slug", { count: "exact" })
          .eq("status", "active"),
        supabase
          .from("user_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "trial"),
        supabase
          .from("user_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "cancelled")
          .gte("updated_at", new Date(Date.now() - 30 * 86400000).toISOString()),
      ]);
      setTotalUsers(usersRes.count || 0);

      // Estimate MRR from active subscriptions × tier price.
      const planSlugs = (subsActiveRes.data || []).map((r: { plan_slug: string }) => r.plan_slug);
      let mrrSum = 0;
      if (planSlugs.length) {
        const { data: plans } = await supabase
          .from("subscription_plans")
          .select("slug, price");
        const priceMap = new Map((plans || []).map((p: { slug: string; price: number }) => [p.slug, Number(p.price) || 0]));
        for (const slug of planSlugs) mrrSum += priceMap.get(slug) || 0;
      }
      setMrr(mrrSum);

      const trialCount = subsTrialRes.count || 0;
      const activeCount = subsActiveRes.count || 0;
      setTrialToPaid(trialCount + activeCount > 0 ? activeCount / (trialCount + activeCount) : 0);

      const cancelled = subsCancelledRes.count || 0;
      setChurnRate(activeCount + cancelled > 0 ? cancelled / (activeCount + cancelled) : 0);

      // Active today (distinct user_id from analytics_events last 24h) — direct query (admin)
      const since = new Date(Date.now() - 86400000).toISOString();
      const { data: activeRows } = await supabase
        .from("analytics_events")
        .select("user_id")
        .gte("created_at", since)
        .not("user_id", "is", null)
        .limit(5000);
      const activeSet = new Set((activeRows || []).map((r: { user_id: string }) => r.user_id));
      setActiveToday(activeSet.size);

      // ---- MV: daily summary via RPC ----
      const { data: dailyData } = await supabase.rpc("get_analytics_daily_summary", {
        _start: start,
        _end: end,
      });
      setDaily((dailyData as DailyRow[]) || []);

      // ---- MV: feature usage via RPC ----
      const { data: featData } = await supabase.rpc("get_analytics_feature_usage", {
        _start: start,
        _end: end,
      });
      setFeatureUsage((featData as FeatureRow[]) || []);

      // ---- Top events (direct admin query) ----
      const { data: rawEvents } = await supabase
        .from("analytics_events")
        .select("event_name")
        .gte("created_at", new Date(start).toISOString())
        .lte("created_at", new Date(end + "T23:59:59").toISOString())
        .limit(10000);
      const eventCounts = new Map<string, number>();
      for (const e of rawEvents || []) {
        eventCounts.set(e.event_name, (eventCounts.get(e.event_name) || 0) + 1);
      }
      setTopEvents(
        Array.from(eventCounts.entries())
          .map(([event_name, count]) => ({ event_name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15),
      );

      // ---- Acquisition channels (signups grouped by referral_code/utm_source) ----
      const { data: signupRows } = await supabase
        .from("analytics_events")
        .select("referral_code, utm_source, properties")
        .eq("event_name", "signup_complete")
        .gte("created_at", new Date(start).toISOString())
        .limit(5000);
      const channelMap = new Map<string, number>();
      for (const r of signupRows || []) {
        let src = "direct";
        if (r.referral_code) src = `ref:${r.referral_code}`;
        else if (r.utm_source) src = `utm:${r.utm_source}`;
        else if ((r.properties as { source?: string } | null)?.source) src = String((r.properties as { source: string }).source);
        channelMap.set(src, (channelMap.get(src) || 0) + 1);
      }
      const channelArr = Array.from(channelMap.entries())
        .map(([source, signups]) => ({ source, signups }))
        .sort((a, b) => b.signups - a.signups);
      setChannels(channelArr);

      // ---- Real-time activity ----
      const { data: actData } = await supabase
        .from("analytics_events")
        .select("id, event_name, event_category, user_id, page_path, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      setActivity((actData as ActivityItem[]) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(async () => {
      const { data: actData } = await supabase
        .from("analytics_events")
        .select("id, event_name, event_category, user_id, page_path, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      setActivity((actData as ActivityItem[]) || []);
    }, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const newSignupsInPeriod = daily.reduce((s, d) => s + (d.new_signups || 0), 0);
  const arr = mrr * 12;
  const dauMau = useMemo(() => {
    if (daily.length === 0) return 0;
    const dau = daily[daily.length - 1]?.active_users || 0;
    const mauSet = new Set<string>();
    for (const d of daily.slice(-30)) {
      if (d.active_users > 0) mauSet.add(d.date);
    }
    const mau = daily.slice(-30).reduce((s, d) => Math.max(s, d.active_users), 0);
    return mau > 0 ? dau / mau : 0;
  }, [daily]);

  const investorMetrics: InvestorMetrics = {
    generatedAt: new Date(),
    periodLabel: `Last ${days} days (${start} → ${end})`,
    totalUsers,
    mrr,
    arr,
    activeToday,
    trialToPaid,
    churnRate,
    dauMau,
    newSignups: newSignupsInPeriod,
    topChannels: channels.slice(0, 10),
    growth: daily.map((d) => ({ date: d.date, new_signups: d.new_signups })),
  };

  const handleRefreshViews = async () => {
    setRefreshing(true);
    try {
      await supabase.rpc("refresh_analytics_views");
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  };

  const featureAdoption = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of featureUsage) {
      map.set(f.feature_name, (map.get(f.feature_name) || 0) + f.unique_users);
    }
    return Array.from(map.entries())
      .map(([feature, users]) => ({ feature, users }))
      .sort((a, b) => b.users - a.users);
  }, [featureUsage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Investor-grade product, growth, and revenue intelligence.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <TabsList>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
              <TabsTrigger value="90d">90d</TabsTrigger>
              <TabsTrigger value="ytd">YTD</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={handleRefreshViews} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Refresh views
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportMetricsToCsv(investorMetrics)}>
            <FileDown className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button size="sm" onClick={() => exportMetricsToPdf(investorMetrics)}>
            <FileText className="w-4 h-4 mr-1" /> Investor PDF
          </Button>
        </div>
      </div>

      {/* SECTION 1 — Growth Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Total Users" value={totalUsers.toLocaleString()} icon={Users} />
        <Kpi label="MRR" value={fmtMoney(mrr)} icon={DollarSign} />
        <Kpi label="Active Today" value={activeToday.toLocaleString()} icon={Activity} />
        <Kpi label="Trial → Paid" value={fmtPct(trialToPaid)} icon={TrendingUp} />
        <Kpi label="Churn (30d)" value={fmtPct(churnRate)} icon={TrendingDown} />
        <Kpi label="ARR" value={fmtMoney(arr)} icon={DollarSign} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Growth</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="new_signups"
                stroke="#CFAE70"
                strokeWidth={2}
                name="New Signups"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="active_users"
                stroke="#000000"
                strokeWidth={2}
                name="Active Users"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* SECTION 2 — Acquisition + SECTION 4 partial */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Acquisition Channels</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {channels.length === 0 ? (
              <EmptyState text="No signup events yet. Wire `signup_complete` calls and channel data will populate here." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channels.slice(0, 6)}
                    dataKey="signups"
                    nameKey="source"
                    outerRadius={90}
                    label
                  >
                    {channels.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paige & Voice Sessions / day</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="paige_sessions" fill="#CFAE70" name="Paige" />
                <Bar dataKey="voice_sessions" fill="#000000" name="Voice" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Feature adoption + Top events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Feature Adoption (unique users)</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {featureAdoption.length === 0 ? (
              <EmptyState text="Feature usage will appear here once events fire." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureAdoption.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="feature" type="category" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip />
                  <Bar dataKey="users" fill="#CFAE70" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Events</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 overflow-y-auto">
            {topEvents.length === 0 ? (
              <EmptyState text="No events recorded yet for this period." />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left py-2">Event</th>
                    <th className="text-right py-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {topEvents.map((e) => (
                    <tr key={e.event_name} className="border-t border-border">
                      <td className="py-2">{e.event_name}</td>
                      <td className="py-2 text-right font-mono">{e.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SECTION 8 — Real-time activity */}
      <Card>
        <CardHeader>
          <CardTitle>Live Activity Feed</CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 overflow-y-auto">
          {activity.length === 0 ? (
            <EmptyState text="No events yet. As soon as users hit pages, this feed lights up." />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {activity.map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="capitalize">
                      {a.event_category}
                    </Badge>
                    <span className="font-medium truncate">{a.event_name}</span>
                    {a.page_path && (
                      <span className="text-muted-foreground truncate">{a.page_path}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground whitespace-nowrap">
                    <span className="font-mono text-xs">
                      {a.user_id ? a.user_id.slice(0, 8) : "anon"}
                    </span>
                    <span className="text-xs">
                      {new Date(a.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="text-center text-sm text-muted-foreground py-4">Loading analytics…</div>
      )}

      {/* SECTION — Cohort retention */}
      <CohortRetentionTable />

      {/* SECTION — MRR waterfall */}
      <MrrWaterfall start={start} end={end} />

      {/* SECTION — RAG performance */}
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground">Paige Intelligence — RAG Performance</h2>
        <RagPerformance start={start} end={end} />
      </div>

      {/* SECTION — Credit outcomes */}
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground">Credit Outcomes</h2>
        <CreditOutcomes start={start} end={end} />
      </div>

      {/* SECTION — Lender intelligence */}
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground">Lender Intelligence</h2>
        <LenderIntelligence start={start} end={end} />
      </div>
    </div>
  );
}

function Kpi({
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
      {text}
    </div>
  );
}
