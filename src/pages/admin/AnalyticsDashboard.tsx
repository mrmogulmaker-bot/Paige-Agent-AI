// Analytics — tiered TENANT / OPERATOR surface (IA slice 1c-x).
//
// TIERED SEAM (owner-locked, mirrors 1c-vii/1c-ix): every staffer sees the TENANT
// lens (their practice / team / clients / Paige); a platform owner can toggle to
// the OPERATOR lens (fleet-wide platform figures). The toggle is gated by
// useTenantContext().isPlatformOwner; a non-owner is pinned to the tenant lens
// and never sees the toggle. Operator content is DOUBLY gated (lens + section
// isPlatformOwner guard) and the operator RPCs enforce is_platform_admin/owner
// server-side — defense in depth, so opening the route never leaks platform data.
//
// §9 NO CLIENT tenant_id: tenant-lens reads (F/B/C) are RLS-tenant-scoped and pass
// NO tenant param. Operator-lens reads (A/E + legacy platform analytics) go through
// is_platform_owner-gated RPCs / owner-RLS'd tables.
//
// MRR RECONCILIATION (build-brief b): the rival user_subscriptions ×
// subscription_plans.price MRR/trial/churn computation was DELETED — the single
// MRR source is platform_subscriptions via operator_dashboard_metrics, rendered
// only in the operator lens (§A/§E). There is no tenant-lens MRR in this slice.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFeature } from "@/hooks/useTenantFeature";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { BarChart3, Users, Activity, RefreshCw, FileDown, FileText } from "lucide-react";
import { PageShell, PageHeader, StatTile, StatRow } from "@/components/ui/page";
import {
  exportMetricsToCsv,
  exportMetricsToPdf,
  type InvestorMetrics,
} from "@/lib/analytics/investorExport";
import { AnalyticsViewToggle, type AnalyticsLens } from "@/components/analytics/AnalyticsViewToggle";
import { OperatorLensFrame } from "@/components/analytics/OperatorLensFrame";
import { PaigeContributionSection } from "./analytics/sections/PaigeContributionSection";
import { ClientEngagementSection } from "./analytics/sections/ClientEngagementSection";
import { TeamHistorySection } from "./analytics/sections/TeamHistorySection";
import { PlatformRevenueSection } from "./analytics/sections/PlatformRevenueSection";
import { PlatformFinancialsSection } from "./analytics/sections/PlatformFinancialsSection";
import { useOperatorPlatformMetrics } from "@/hooks/analytics/useOperatorPlatformMetrics";
import { CohortRetentionTable } from "./analytics/CohortRetentionTable";
import { RagPerformance } from "./analytics/RagPerformance";
import { CreditOutcomes } from "./analytics/CreditOutcomes";
import { LenderIntelligence } from "./analytics/LenderIntelligence";
import { BrokerIntelligence } from "./analytics/BrokerIntelligence";

type RangeKey = "7d" | "30d" | "90d" | "ytd";
const LENS_STORAGE_KEY = "paige_analytics_lens";

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

// Semantic, token-based chart palette. NO gold-as-series (§11 gold budget) and
// no hardcoded hex — gold is reserved for a genuine act, never a chart line.
const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--primary-light))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--destructive))",
];

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

export default function AnalyticsDashboard() {
  const { isPlatformOwner } = useTenantContext();
  // Funding/credit analytics are an opt-in tenant surface (§2/§9) — shown only to
  // tenants who chose the funding preset, never in the coaching-generic default.
  const { enabled: fundingEnabled } = useTenantFeature("funding_readiness");
  const [range, setRange] = useState<RangeKey>("30d");
  const { start, end, days } = useMemo(() => rangeToDates(range), [range]);
  const startIso = useMemo(() => new Date(start).toISOString(), [start]);
  const endIso = useMemo(() => new Date(end + "T23:59:59").toISOString(), [end]);

  // ── LENS ─────────────────────────────────────────────────────────────────
  const lenses: AnalyticsLens[] = isPlatformOwner ? ["tenant", "operator"] : ["tenant"];
  const [lens, setLensState] = useState<AnalyticsLens>(() => {
    try {
      const saved = localStorage.getItem(LENS_STORAGE_KEY);
      if (saved === "tenant" || saved === "operator") return saved;
    } catch {
      /* storage unavailable */
    }
    return "tenant";
  });
  // A non-owner can never be on the operator lens.
  const effectiveLens: AnalyticsLens = isPlatformOwner ? lens : "tenant";
  useEffect(() => {
    if (!isPlatformOwner && lens !== "tenant") setLensState("tenant");
  }, [isPlatformOwner, lens]);
  const setLens = (v: AnalyticsLens) => {
    setLensState(v);
    try {
      localStorage.setItem(LENS_STORAGE_KEY, v);
    } catch {
      /* non-fatal */
    }
  };
  const operatorActive = isPlatformOwner && effectiveLens === "operator";

  // Operator platform metrics (shared by §A and §E — one query, gated to owner).
  const operator = useOperatorPlatformMetrics(days, startIso, endIso, operatorActive);

  // ── LEGACY OPERATOR-LENS platform analytics (analytics_events, owner-only) ──
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeToday, setActiveToday] = useState(0);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [featureUsage, setFeatureUsage] = useState<FeatureRow[]>([]);
  const [topEvents, setTopEvents] = useState<TopEvent[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const usersRes = await supabase.from("profiles").select("id", { count: "exact", head: true });
      setTotalUsers(usersRes.count || 0);

      const since = new Date(Date.now() - 86400000).toISOString();
      const { data: activeRows } = await supabase
        .from("analytics_events")
        .select("user_id")
        .gte("created_at", since)
        .not("user_id", "is", null)
        .limit(5000);
      const activeSet = new Set((activeRows || []).map((r: { user_id: string }) => r.user_id));
      setActiveToday(activeSet.size);

      const { data: dailyData } = await supabase.rpc("get_analytics_daily_summary", {
        _start: start,
        _end: end,
      });
      setDaily((dailyData as DailyRow[]) || []);

      const { data: featData } = await supabase.rpc("get_analytics_feature_usage", {
        _start: start,
        _end: end,
      });
      setFeatureUsage((featData as FeatureRow[]) || []);

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
        else if ((r.properties as { source?: string } | null)?.source)
          src = String((r.properties as { source: string }).source);
        channelMap.set(src, (channelMap.get(src) || 0) + 1);
      }
      setChannels(
        Array.from(channelMap.entries())
          .map(([source, signups]) => ({ source, signups }))
          .sort((a, b) => b.signups - a.signups),
      );

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

  // Only load platform-wide content when the operator lens is active (owner).
  useEffect(() => {
    if (!operatorActive) return;
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
  }, [range, operatorActive]);

  const dauMau = useMemo(() => {
    if (daily.length === 0) return 0;
    const dau = daily[daily.length - 1]?.active_users || 0;
    const mau = daily.slice(-30).reduce((s, d) => Math.max(s, d.active_users), 0);
    return mau > 0 ? dau / mau : 0;
  }, [daily]);

  const newSignupsInPeriod = daily.reduce((s, d) => s + (d.new_signups || 0), 0);

  // Investor export — reconciled to the SINGLE MRR source (operator RPC, cents→$).
  const investorMetrics: InvestorMetrics = {
    generatedAt: new Date(),
    periodLabel: `Last ${days} days (${start} → ${end})`,
    totalUsers: operator.metrics?.totalPlatformUsers ?? totalUsers,
    mrr: (operator.metrics?.mrrCents ?? 0) / 100,
    arr: (operator.metrics?.arrCents ?? 0) / 100,
    activeToday,
    trialToPaid: (operator.metrics?.trialConversionPct ?? 0) / 100,
    churnRate: 0,
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
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={BarChart3}
        title="Analytics"
        description={
          operatorActive
            ? "Fleet-wide platform intelligence."
            : "Your practice, your team, your clients — and what Paige did for them."
        }
        actions={
          <>
            <AnalyticsViewToggle views={lenses} value={effectiveLens} onChange={setLens} />
            <div className="overflow-x-auto -mx-1 px-1">
              <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <TabsList>
                  <TabsTrigger value="7d">7d</TabsTrigger>
                  <TabsTrigger value="30d">30d</TabsTrigger>
                  <TabsTrigger value="90d">90d</TabsTrigger>
                  <TabsTrigger value="ytd">YTD</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {operatorActive && (
              <>
                <Button variant="outline" size="sm" onClick={handleRefreshViews} disabled={refreshing}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Refresh views</span>
                  <span className="sm:hidden">Refresh</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportMetricsToCsv(investorMetrics)}>
                  <FileDown className="w-4 h-4 mr-1" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportMetricsToPdf(investorMetrics)}>
                  <FileText className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Investor PDF</span>
                  <span className="sm:hidden">PDF</span>
                </Button>
              </>
            )}
          </>
        }
      />

      {/* ── TENANT LENS — every staffer. RLS-tenant-scoped, NO tenant param. ── */}
      {effectiveLens === "tenant" && (
        <div className="space-y-8">
          <PaigeContributionSection start={start} end={end} />
          <ClientEngagementSection start={start} end={end} />
          <TeamHistorySection start={start} end={end} />

          {/* Funding/credit analytics — opt-in tenant surface only (§2/§9). */}
          {fundingEnabled && (
            <div className="space-y-8">
              <div className="space-y-2">
                <h2 className="font-display text-xl font-semibold text-foreground">Credit Outcomes</h2>
                <CreditOutcomes start={start} end={end} />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-xl font-semibold text-foreground">Lender Intelligence</h2>
                <LenderIntelligence start={start} end={end} />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-xl font-semibold text-foreground">Broker Intelligence</h2>
                <BrokerIntelligence start={start} end={end} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── OPERATOR LENS — isPlatformOwner only, visually unmistakable. ── */}
      {operatorActive && (
        <OperatorLensFrame>
          <PlatformRevenueSection
            metrics={operator.metrics}
            loading={operator.loading}
            isPlatformOwner={isPlatformOwner}
          />
          <PlatformFinancialsSection
            metrics={operator.metrics}
            wholesaleCostUsd={operator.wholesaleCostUsd}
            wholesaleAvailable={operator.wholesaleAvailable}
            loading={operator.loading}
            isPlatformOwner={isPlatformOwner}
            start={start}
            end={end}
          />

          {/* Legacy platform product/growth analytics (analytics_events). */}
          <StatRow cols={2}>
            <StatTile label="Total platform users" value={totalUsers.toLocaleString()} icon={Users} />
            <StatTile label="Active today" value={activeToday.toLocaleString()} icon={Activity} />
          </StatRow>

          <Card>
            <CardHeader>
              <CardTitle>User Growth</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {daily.length < 2 ? (
                <ChartEmpty text="Not enough data yet to chart platform growth." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="new_signups" stroke={COLORS[0]} strokeWidth={2} name="New Signups" dot={false} />
                    <Line type="monotone" dataKey="active_users" stroke={COLORS[4]} strokeWidth={2} name="Active Users" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Acquisition Channels</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {channels.length === 0 ? (
                  <ChartEmpty text="No signup events yet for this period." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={channels.slice(0, 6)} dataKey="signups" nameKey="source" outerRadius={90} label>
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
                {daily.length < 2 ? (
                  <ChartEmpty text="Session data appears once activity is recorded." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="paige_sessions" fill={COLORS[0]} name="Paige" />
                      <Bar dataKey="voice_sessions" fill={COLORS[4]} name="Voice" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Feature Adoption (unique users)</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                {featureAdoption.length === 0 ? (
                  <ChartEmpty text="Feature usage will appear here once events fire." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={featureAdoption.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="feature" type="category" tick={{ fontSize: 11 }} width={140} />
                      <Tooltip />
                      <Bar dataKey="users" fill={COLORS[0]} />
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
                  <ChartEmpty text="No events recorded yet for this period." />
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
                          <td className="py-2 text-right tabular-nums">{e.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Live Activity Feed</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto">
              {activity.length === 0 ? (
                <ChartEmpty text="No events yet. As soon as users hit pages, this feed lights up." />
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {activity.map((a) => (
                    <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="capitalize">
                          {a.event_category}
                        </Badge>
                        <span className="font-medium truncate">{a.event_name}</span>
                        {a.page_path && <span className="text-muted-foreground truncate">{a.page_path}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground whitespace-nowrap">
                        <span className="font-mono text-xs">{a.user_id ? a.user_id.slice(0, 8) : "anon"}</span>
                        <span className="text-xs">{new Date(a.created_at).toLocaleTimeString()}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {loading && (
            <div className="text-center text-sm text-muted-foreground py-4">Loading platform analytics…</div>
          )}

          {/* Platform-signup cohort retention (owner lens). */}
          <CohortRetentionTable mode="platform_signup" />

          <div className="space-y-2">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Paige Intelligence — RAG Performance
            </h2>
            <RagPerformance start={start} end={end} />
          </div>
        </OperatorLensFrame>
      )}
    </PageShell>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
      {text}
    </div>
  );
}
