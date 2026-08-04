/**
 * Operator Command Center — the platform operator's /admin home (godMode).
 *
 * This is the God-tier landing the operator opens first: fleet STATE at a glance,
 * what needs ATTENTION teed up as real work, a prominent door to PAIGE (Chief of
 * Staff), and honest drill-downs into the fleet. It is the operator's equivalent of
 * the tenant PracticeOverview — same proven composition (PageShell → plain
 * PageHeader → lead work → dense KPIs → chart grid) but DENSER and platform-scoped,
 * built to read as demonstrably superior to any tenant surface (the mandate).
 *
 * §9 TIER ISOLATION: every number is FLEET-WIDE and comes ONLY from the operator_*
 * RPCs, each gated on public.is_platform_admin() server-side (a non-operator call
 * RAISES 42501). No member/client PII — the at-risk table shows BUSINESS rows +
 * aggregate reasons only; the drill-in to a tenant's people lives in Fleet.
 *
 * §13 HONESTY: a tile/segment renders ONLY when its real RPC key is present (the RPC
 * omits any metric with no real source — never a fabricated zero). Charts with no
 * real data yet render a crafted EmptyState naming what makes them populate — never
 * a fake series. The MRR trend is honestly empty until ≥2 daily snapshots accrue.
 *
 * §11 GOLD DISCIPLINE: the ONE gold act on this surface is the per-row "Reach out"
 * in the attention queue + the "Open Paige" primary act — never a resting tile, KPI
 * accent, or chart series. Charts are --chart-1..6 / indigo / semantic only.
 *
 * Live: KPI + chart queries POLL (45s + refetchOnWindowFocus, the PlatformOverview
 * cadence); the at-risk queue ALSO refetches instantly on platform approval churn.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot, DollarSign, Building2, Receipt, AlertTriangle, Sparkles, Percent,
  Zap, Activity, Users, Gauge, ArrowUpRight, ShieldAlert, TrendingUp,
  HeartPulse, Filter, LineChart as LineChartIcon, Layers, Inbox, RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { PaigeDepartmentStatus } from "@/components/paige/PaigeDepartmentStatus";
import {
  PageShell, PageHeader, SectionCard, StatTile, StatRow, DataTableShell,
  EmptyState, StatePill, DateRangePicker, rangeToDates, KpiPillRow, DonutCard,
  BarCard, TrendLineCard,
  type Column, type DateRangeValue, type DonutDatum, type ChartSeriesDef,
  type KpiPillItem,
} from "@/components/ui/page";

// ── RPC return shapes (mirror 20260713110000 + 20260727180000 migrations) ──────
type TierSplit = {
  total?: number | null;
  individual?: number | null;
  standalone?: number | null;
  agency?: number | null;
  enterprise?: number | null;
};
type OperatorMetrics = {
  mrr_cents?: number | null;
  arr_cents?: number | null;
  active_tenants?: TierSplit | null;
  new_tenants?: number | null;
  dunning?: { count?: number | null; mrr_cents?: number | null } | null;
  at_risk_count?: number | null;
  total_platform_users?: number | null;
  fleet_paige_actions?: number | null;
  wau_tenants?: number | null;
  arpa_cents?: number | null;
  trial_conversion_pct?: number | null;
};
type AtRiskTenant = {
  tenant_id: string;
  name: string;
  tier: string | null;
  mrr_cents: number | null;
  reason: string | null;
  last_active: string | null;
};
type HealthDistribution = {
  healthy?: number | null;
  watch?: number | null;
  at_risk?: number | null;
  critical?: number | null;
};
type SignupFunnel = {
  signed_up?: number | null;
  trialing?: number | null;
  active_in_trial?: number | null;
  converted?: number | null;
  retained_30d?: number | null;
};
type NewTenantWeek = { week_start: string; tier: string | null; cnt: number | null };
type MrrSnapshot = {
  snapshot_date: string;
  mrr_cents: number | null;
  arr_cents: number | null;
  active_tenants: number | null;
};

const has = (v: unknown): boolean => v !== undefined && v !== null;

function usd(cents?: number | null, compact = false): string {
  if (!has(cents)) return "—";
  return ((cents as number) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  });
}

const num = (n?: number | null): string => (has(n) ? (n as number).toLocaleString() : "—");

/** DateRangePicker window → whole days, for the window-aware RPC args. */
function windowDays(v: DateRangeValue): number {
  const ms = v.to.getTime() - v.from.getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

const FLEET_HREF = "/admin/platform/tenants";
const PAIGE_HREF = "/admin/playbook";
const ATTENTION_ANCHOR = "operator-attention-queue";

export default function OperatorCommandCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Window drives the window-aware RPCs (metrics p_window_days, funnel p_window_days,
  // MRR history p_days). The at-risk LEAD list is a fixed 14-day silence window per
  // the IA spec — it is the operator's act queue, not a windowed report.
  const [range, setRange] = useState<DateRangeValue>(() => {
    const { from, to } = rangeToDates("30d");
    return { from, to, key: "30d" };
  });
  const days = useMemo(() => windowDays(range), [range]);

  const metricsQ = useQuery({
    queryKey: ["operator_dashboard_metrics", days],
    queryFn: async (): Promise<OperatorMetrics> => {
      const { data, error } = await supabase.rpc(
        "operator_dashboard_metrics" as never,
        { p_window_days: days } as never,
      );
      if (error) throw error;
      return (data ?? {}) as OperatorMetrics;
    },
    refetchInterval: 45000,
    refetchOnWindowFocus: true,
  });

  const atRiskQ = useQuery({
    queryKey: ["operator_at_risk_tenants"],
    queryFn: async (): Promise<AtRiskTenant[]> => {
      const { data, error } = await supabase.rpc(
        "operator_at_risk_tenants" as never,
        { p_days: 14 } as never,
      );
      if (error) throw error;
      return (data ?? []) as AtRiskTenant[];
    },
    refetchInterval: 45000,
    refetchOnWindowFocus: true,
  });

  const healthQ = useQuery({
    queryKey: ["operator_health_distribution"],
    queryFn: async (): Promise<HealthDistribution> => {
      const { data, error } = await supabase.rpc("operator_health_distribution" as never);
      if (error) throw error;
      return (data ?? {}) as HealthDistribution;
    },
    refetchInterval: 45000,
    refetchOnWindowFocus: true,
  });

  const funnelQ = useQuery({
    queryKey: ["operator_signup_funnel", days],
    queryFn: async (): Promise<SignupFunnel> => {
      const { data, error } = await supabase.rpc(
        "operator_signup_funnel" as never,
        { p_window_days: days } as never,
      );
      if (error) throw error;
      return (data ?? {}) as SignupFunnel;
    },
    refetchInterval: 45000,
    refetchOnWindowFocus: true,
  });

  const newTenantsQ = useQuery({
    queryKey: ["operator_new_tenants_by_week"],
    queryFn: async (): Promise<NewTenantWeek[]> => {
      const { data, error } = await supabase.rpc(
        "operator_new_tenants_by_week" as never,
        { p_weeks: 12 } as never,
      );
      if (error) throw error;
      return (data ?? []) as NewTenantWeek[];
    },
    refetchInterval: 45000,
    refetchOnWindowFocus: true,
  });

  const mrrQ = useQuery({
    queryKey: ["operator_mrr_history", days],
    queryFn: async (): Promise<MrrSnapshot[]> => {
      const { data, error } = await supabase.rpc(
        "operator_mrr_history" as never,
        { p_days: Math.max(days, 90) } as never,
      );
      if (error) throw error;
      return (data ?? []) as MrrSnapshot[];
    },
    refetchInterval: 45000,
    refetchOnWindowFocus: true,
  });

  // Poll for tiles; realtime for the attention queue. Platform approval churn nudges
  // an instant refetch of the at-risk queue + the fleet-action KPI so the operator's
  // attention surface never lags the fleet (already-published table).
  useEffect(() => {
    const ch = supabase
      .channel("operator_command_center_pending_approvals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paige_pending_approvals" },
        () => {
          qc.invalidateQueries({ queryKey: ["operator_at_risk_tenants"] });
          qc.invalidateQueries({ queryKey: ["operator_dashboard_metrics", days] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, days]);

  const m = metricsQ.data ?? {};
  const loading = metricsQ.isLoading;
  const tenants = m.active_tenants ?? undefined;
  const dunCount = m.dunning?.count ?? null;
  const dunMrr = m.dunning?.mrr_cents ?? null;
  const atRisk = atRiskQ.data ?? [];

  // Total MRR at stake in the LEAD queue header — the dunning exposure is the honest
  // platform-wide "$ at risk" figure (§13: present-guarded, never a fabricated 0).
  const atRiskMrrLabel = has(dunMrr) ? `${usd(dunMrr)}/mo at stake` : null;

  const lastUpdated = metricsQ.dataUpdatedAt
    ? formatDistanceToNow(new Date(metricsQ.dataUpdatedAt), { addSuffix: true })
    : null;

  // ── Fleet KPIs — dense, present-guarded pill vocabulary (§13). Order = money first,
  //    then reach + activation. Deltas omitted: the metrics RPC provides no period-over-
  //    period basis, so an honest no-delta beats a fabricated arrow (§13). ──────────────
  const kpiItems: KpiPillItem[] = [
    { label: "Recurring revenue", value: usd(m.mrr_cents), icon: DollarSign, hint: "per month", present: has(m.mrr_cents), loading },
    { label: "Annual run-rate", value: usd(m.arr_cents), icon: TrendingUp, hint: "ARR", present: has(m.arr_cents), loading },
    { label: "Active tenants", value: num(tenants?.total), icon: Building2, hint: tierSplitHint(tenants) ?? undefined, present: has(tenants?.total), loading },
    { label: "New tenants", value: num(m.new_tenants), icon: Sparkles, hint: "this window", present: has(m.new_tenants), loading },
    { label: "Weekly active", value: num(m.wau_tenants), icon: Activity, hint: "tenants", present: has(m.wau_tenants), loading },
    { label: "Trial → paid", value: has(m.trial_conversion_pct) ? `${m.trial_conversion_pct}%` : "—", icon: Percent, present: has(m.trial_conversion_pct), loading },
    { label: "Avg / account", value: usd(m.arpa_cents), icon: Gauge, hint: "per paying tenant / mo", present: has(m.arpa_cents), loading },
    { label: "Platform users", value: num(m.total_platform_users), icon: Users, present: has(m.total_platform_users), loading },
  ];

  // ── Fleet by tier — real active_tenants split on the --chart-1..4 tokens (never gold). ──
  const tierData: DonutDatum[] = (
    [
      { label: "Solo", value: tenants?.individual, colorVar: "--chart-1" },
      { label: "Standalone", value: tenants?.standalone, colorVar: "--chart-2" },
      { label: "Agency", value: tenants?.agency, colorVar: "--chart-3" },
      { label: "Enterprise", value: tenants?.enterprise, colorVar: "--chart-4" },
    ] as Array<{ label: string; value?: number | null; colorVar: string }>
  )
    .filter((d) => has(d.value))
    .map((d) => ({ label: d.label, value: d.value as number, colorVar: d.colorVar }));

  // ── Fleet health distribution — one server-authoritative definition (RPC). ──────────
  const h = healthQ.data ?? {};
  const healthData: DonutDatum[] = (
    [
      { label: "Healthy", value: h.healthy, colorVar: "--chart-2" },
      { label: "Watch", value: h.watch, colorVar: "--chart-4" },
      { label: "At risk", value: h.at_risk, colorVar: "--chart-5" },
      { label: "Critical", value: h.critical, colorVar: "--chart-6" },
    ] as Array<{ label: string; value?: number | null; colorVar: string }>
  )
    .filter((d) => has(d.value))
    .map((d) => ({ label: d.label, value: d.value as number, colorVar: d.colorVar }));

  // ── New tenants by week — pivot the (week_start, tier, cnt) rows into a stacked bar. ──
  const { newTenantRows, newTenantBars } = useMemo(() => pivotNewTenants(newTenantsQ.data ?? []), [newTenantsQ.data]);

  // ── Trial → paid funnel — honest lifecycle steps; sparse renders honestly, never padded. ──
  const f = funnelQ.data ?? {};
  const funnelRows = (
    [
      { stage: "Signed up", count: f.signed_up },
      { stage: "Trialing", count: f.trialing },
      { stage: "Active in trial", count: f.active_in_trial },
      { stage: "Converted", count: f.converted },
      { stage: "Retained 30d", count: f.retained_30d },
    ] as Array<{ stage: string; count?: number | null }>
  )
    .filter((r) => has(r.count))
    .map((r) => ({ stage: r.stage, count: r.count as number }));
  const funnelBars: ChartSeriesDef[] = [{ key: "count", label: "Tenants", colorVar: "--chart-1" }];

  // ── MRR over time — REAL snapshots; honestly empty until ≥2 accrue (TrendLineCard guards). ──
  const mrrRows = (mrrQ.data ?? []).map((s) => ({
    date: s.snapshot_date,
    mrr: has(s.mrr_cents) ? (s.mrr_cents as number) / 100 : null,
  }));
  const mrrSeries: ChartSeriesDef[] = [{ key: "mrr", label: "MRR", colorVar: "--chart-1" }];

  const atRiskColumns: Column[] = [
    { key: "name", header: "Tenant" },
    { key: "tier", header: "Tier" },
    { key: "mrr", header: "MRR", numeric: true },
    { key: "reason", header: "Risk" },
    { key: "last", header: "Last active" },
    { key: "act", header: <span className="sr-only">Act</span> },
  ];

  // Whole-fleet empty short-circuit. Pre-launch (the state the operator opens FIRST) the
  // fleet has no data anywhere — rendering the full analytics stack then stacks ~6
  // individually-honest-but-cumulatively-noisy empty cards, which inverts the "superior to
  // tenant" mandate in exactly the zero-data case (the tenant Overview collapses to ONE
  // clean canvas). When every real source is genuinely empty — and only once everything has
  // loaded (never mid-fetch) — we render ONE consolidated canvas in place of the stack. The
  // charts return the moment real fleet data exists. Kept honest: this fires on empty DATA,
  // never on an error (the error card above owns that) or a still-loading state.
  const anyFleetLoading =
    metricsQ.isLoading || atRiskQ.isLoading || healthQ.isLoading ||
    funnelQ.isLoading || newTenantsQ.isLoading || mrrQ.isLoading;
  const fleetEmpty =
    !anyFleetLoading &&
    !metricsQ.isError &&
    !(has(tenants?.total) && (tenants?.total as number) > 0) &&
    atRisk.length === 0 &&
    tierData.length === 0 &&
    healthData.length === 0 &&
    newTenantRows.length === 0 &&
    funnelRows.length === 0 &&
    !mrrRows.some((r) => has(r.mrr)) &&
    !has(dunCount) && !has(dunMrr) && !has(m.at_risk_count);

  return (
    <PageShell width="wide">
      {/* Compact identity header (§11 banner rule — work leads, no hero). The window
          picker rides the actions slot and drives every window-aware RPC. */}
      <PageHeader
        variant="plain"
        icon={Building2}
        eyebrow="Operator"
        title="Your platform at a glance"
        description="Fleet-wide health, the revenue in motion, and exactly which businesses need you right now."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {lastUpdated && (
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Updated {lastUpdated}
              </span>
            )}
            <DateRangePicker value={range} onChange={setRange} />
          </div>
        }
      />

      {/* 1 — PAIGE, CHIEF OF STAFF. The operator wants Paige more prominent than the
          tenants: a full-width door to her workspace with an ambient fleet-action badge
          (a signal, not a queue). "Open Paige" carries one of the two gold acts. */}
      <SectionCard
        icon={Bot}
        title="Paige, your Chief of Staff"
        description="She runs the fleet's plays across all ten departments — drafting the moves, flagging what's drifting, and handing you the decisions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {has(m.fleet_paige_actions) && (
              <StatePill state="building" icon={<Zap className="h-3 w-3" aria-hidden />}>
                {num(m.fleet_paige_actions)} actions fleet-wide
              </StatePill>
            )}
            <Button variant="gold" onClick={() => navigate(PAIGE_HREF)}>
              Open Paige <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        }
      />

      {metricsQ.isError && (
        <SectionCard title="Fleet metrics unavailable" icon={ShieldAlert}>
          <p className="text-sm text-muted-foreground">
            Live platform metrics couldn't load right now — the attention queue below is unaffected.
          </p>
        </SectionCard>
      )}

      {/* Whole-fleet zero-data canvas (§13/§36) — ONE crafted empty in place of the stack,
          so the operator's first, pre-launch impression reads as clean and intentional (the
          "superior to tenant" mandate) rather than six stacked empty cards. Naming what
          populates it; no gold (opening the console is navigation, not the act moment). */}
      {fleetEmpty ? (
        <SectionCard icon={Sparkles} title="Your fleet is just getting started">
          <EmptyState
            icon={Building2}
            tone="brand"
            title="No tenants on the platform yet"
            description="This is your fleet command center. As businesses come onto the platform, their revenue in motion, fleet health, growth by week, and exactly which tenants need you all surface here — biggest money first. Nothing is charted until there's real data behind it."
            action={
              <Button variant="outline" onClick={() => navigate(FLEET_HREF)}>
                <Building2 className="h-4 w-4" aria-hidden /> Open Fleet Console
              </Button>
            }
          />
        </SectionCard>
      ) : (
      <>
      {/* 2 — TENANTS NEEDING YOU (LEAD). The only section that is both real per-item work
          AND directly actionable — the operator's DraftsAwaitingPanel at platform altitude.
          The per-row "Reach out" is the page's other gold act. Honest empty when healthy. */}
      <SectionCard
        icon={AlertTriangle}
        title="Tenants needing you"
        description="Past-due, suspended, or gone quiet — biggest revenue first, ready to act on."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {atRisk.length > 0 && (
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {atRisk.length} {atRisk.length === 1 ? "tenant" : "tenants"}
              </span>
            )}
            {atRiskMrrLabel && (
              <StatePill state="warning" icon={<Receipt className="h-3 w-3" aria-hidden />}>
                {atRiskMrrLabel}
              </StatePill>
            )}
          </div>
        }
      >
        <div id={ATTENTION_ANCHOR} className="scroll-mt-6">
          <DataTableShell
            columns={atRiskColumns}
            loading={atRiskQ.isLoading}
            isEmpty={atRisk.length === 0}
            empty={
              <EmptyState
                icon={ShieldAlert}
                tone="brand"
                title="Every tenant is healthy"
                description="No business is past due, suspended, or gone quiet. When one drifts, it surfaces here to act on — biggest money first."
              />
            }
          >
            {atRisk.map((t) => (
              <TableRow key={t.tenant_id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{t.tier ?? "—"}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{usd(t.mrr_cents)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.reason ?? "—"}</TableCell>
                <TableCell className="text-sm tabular-nums text-muted-foreground">
                  {t.last_active
                    ? formatDistanceToNow(new Date(t.last_active), { addSuffix: true })
                    : "No activity"}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="gold" size="sm" onClick={() => navigate(FLEET_HREF)}>
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> Reach out
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </DataTableShell>
        </div>
      </SectionCard>

      {/* 3 — FLEET KPIs. Dense present-guarded pills (§13) — no big stat cards, no
          fabricated zeros. 8 keys wrap 4-up into two rows. */}
      <KpiPillRow items={kpiItems} cols={4} />

      {/* 4 + health — composition donuts. Real segments from active_tenants + the
          server-authoritative health RPC. Segment→Fleet drill is the header link
          (per-segment cell drill would require a ChartCards prop change, deferred). */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DonutCard
          title="Fleet by tier"
          description="Where your live tenants sit across the plan tiers."
          data={tierData}
          loading={loading}
          centerLabel="tenants"
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate(FLEET_HREF)}>
              <Filter className="h-4 w-4" aria-hidden /> Open Fleet
            </Button>
          }
          empty={{
            title: "No tenants to break down yet",
            hint: "The tier split appears as businesses come onto the platform.",
          }}
        />
        <DonutCard
          title="Fleet health"
          description="One definition across the platform — healthy, watch, at-risk, critical."
          data={healthData}
          loading={healthQ.isLoading}
          centerLabel="tenants"
          empty={{
            title: "No health signal yet",
            hint: "Health buckets appear once there are live tenants to classify.",
          }}
        />
      </div>

      {/* New tenants by week + trial→paid funnel. Both REAL; the funnel renders sparse
          steps honestly (a genuine 0 is a real count, never padded). */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BarCard
          title="New tenants by week"
          description="Fleet provisioning over the last 12 weeks, split by tier."
          data={newTenantRows}
          bars={newTenantBars}
          xKey="week"
          stacked
          loading={newTenantsQ.isLoading}
          empty={{
            title: "No provisioning in this range yet",
            hint: "Each new tenant lands here in its signup week as the fleet grows.",
          }}
        />
        <BarCard
          title="Trial → paid funnel"
          description="How this window's cohort moves from signup to retained revenue."
          data={funnelRows}
          bars={funnelBars}
          xKey="stage"
          horizontal
          loading={funnelQ.isLoading}
          empty={{
            title: "No cohort in this window yet",
            hint: "The lifecycle funnel fills in as tenants sign up and convert.",
          }}
        />
      </div>

      {/* 5 — REVENUE AT RISK — the honest dunning exposure, three present-guarded tiles. */}
      {(has(dunCount) || has(dunMrr) || has(m.at_risk_count)) && (
        <SectionCard
          icon={Receipt}
          title="Revenue at risk"
          description="Past-due accounts and the recurring revenue on the line."
        >
          <StatRow cols={3}>
            {has(dunCount) && (
              <StatTile
                label="Dunning accounts"
                value={num(dunCount)}
                icon={Receipt}
                intent={(dunCount as number) > 0 ? "negative" : "neutral"}
                hint="past due or unpaid"
                loading={loading}
              />
            )}
            {has(dunMrr) && (
              <StatTile
                label="MRR at stake"
                value={usd(dunMrr)}
                icon={DollarSign}
                intent={(dunMrr as number) > 0 ? "negative" : "neutral"}
                hint="recurring revenue exposed"
                loading={loading}
              />
            )}
            {has(m.at_risk_count) && (
              <a
                href={`#${ATTENTION_ANCHOR}`}
                className="rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                aria-label={`${m.at_risk_count} tenants need attention — jump to the queue`}
              >
                <StatTile
                  label="Needs attention"
                  value={num(m.at_risk_count)}
                  icon={AlertTriangle}
                  intent={(m.at_risk_count as number) > 0 ? "negative" : "neutral"}
                  hint="tenants at risk · review above"
                  loading={loading}
                  className="h-full transition-shadow hover:shadow-lg"
                />
              </a>
            )}
          </StatRow>
        </SectionCard>
      )}

      {/* 6 — GROWTH OVER TIME. REAL RPC (operator_mrr_history) — but the TrendLineCard
          renders its crafted EmptyState until ≥2 daily snapshots accrue (§13: a line
          needs two real points; NEVER a synthetic backfilled curve). Below the fold. */}
      <TrendLineCard
        title="MRR over time"
        description="Your recurring-revenue curve, recorded as daily snapshots."
        data={mrrRows}
        series={mrrSeries}
        xKey="date"
        loading={mrrQ.isLoading}
        yTickFormatter={(v) => usd(v * 100, true)}
        xTickFormatter={(v) => new Date(String(v)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        empty={{
          title: "Your growth curve is being recorded",
          hint: "The MRR line draws itself as daily snapshots accrue — one real point per day, never a synthetic backfill.",
        }}
      />

      {/* "See them work" (Task #245, §7 3-layer VP framework), operator/fleet scope.
          Fleet-wide because the operator's has_role(admin) RLS returns every tenant's
          open actions (§9/§51 God-tier outcome). Gold-free read (§11). */}
      <PaigeDepartmentStatus scope="operator" />

      {/* Honest reserved slots — real SectionCards naming their populate trigger, never a
          fabricated count (§13). These sit below the fold on purpose. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={Layers} title="Cohort retention">
          <EmptyState
            icon={HeartPulse}
            title="Retention cohorts are coming"
            description="Once enough monthly cohorts have a full retention window, their curves render here — no source exists to chart yet, so nothing is shown rather than a placeholder."
          />
        </SectionCard>
        <SectionCard icon={Inbox} title="Drafts awaiting you">
          <EmptyState
            icon={Sparkles}
            title="Your platform draft queue is coming"
            description="A fleet-scoped approvals queue — Paige's drafted platform moves waiting on your one-click approval — lands with the operator C-Suite roster. Until then, tenant drafts stay in each tenant's own Command Center."
          />
        </SectionCard>
      </div>
      </>
      )}
    </PageShell>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** Compact tier split → "12 solo · 4 agency" (present tiers only). */
function tierSplitHint(t?: TierSplit | null): string | null {
  if (!t) return null;
  const parts: string[] = [];
  if (has(t.individual)) parts.push(`${t.individual} solo`);
  if (has(t.standalone)) parts.push(`${t.standalone} standalone`);
  if (has(t.agency)) parts.push(`${t.agency} agency`);
  if (has(t.enterprise)) parts.push(`${t.enterprise} enterprise`);
  return parts.length ? parts.join(" · ") : null;
}

const TIER_KEYS = ["individual", "standalone", "agency", "enterprise"] as const;
const TIER_LABEL: Record<(typeof TIER_KEYS)[number], string> = {
  individual: "Solo",
  standalone: "Standalone",
  agency: "Agency",
  enterprise: "Enterprise",
};
const TIER_COLOR: Record<(typeof TIER_KEYS)[number], string> = {
  individual: "--chart-1",
  standalone: "--chart-2",
  agency: "--chart-3",
  enterprise: "--chart-4",
};

/**
 * Pivot the flat (week_start, tier, cnt) RPC rows into per-week rows with one column
 * per tier for a stacked BarCard. Only tiers that actually appear get a bar series —
 * no fabricated empty tier stacks (§13). Weeks are ordered ascending.
 */
function pivotNewTenants(rows: NewTenantWeek[]): {
  newTenantRows: Array<Record<string, string | number>>;
  newTenantBars: ChartSeriesDef[];
} {
  const byWeek = new Map<string, Record<string, string | number>>();
  const seenTiers = new Set<string>();
  let hasOther = false;

  for (const r of rows) {
    if (!r.week_start) continue;
    const wk = r.week_start;
    const label = new Date(wk).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const row = byWeek.get(wk) ?? { week: label, _sort: wk };
    const tierKey = (TIER_KEYS as readonly string[]).includes(r.tier ?? "")
      ? (r.tier as (typeof TIER_KEYS)[number])
      : null;
    const col = tierKey ?? "other";
    if (tierKey) seenTiers.add(tierKey);
    else hasOther = true;
    row[col] = (Number(row[col]) || 0) + (Number(r.cnt) || 0);
    byWeek.set(wk, row);
  }

  const newTenantRows = Array.from(byWeek.values())
    .sort((a, b) => String(a._sort).localeCompare(String(b._sort)))
    .map((row) => {
      const clean: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(row)) if (k !== "_sort") clean[k] = v;
      return clean;
    });

  const newTenantBars: ChartSeriesDef[] = TIER_KEYS
    .filter((k) => seenTiers.has(k))
    .map((k) => ({ key: k, label: TIER_LABEL[k], colorVar: TIER_COLOR[k] }));

  // A real signup whose provisioning event lacks an account_type still happened —
  // give it a neutral "Other" bar (slate --chart-6, never gold) so it never vanishes
  // from the chart (§13 completeness). Only emitted when such a row actually exists.
  if (hasOther) {
    newTenantBars.push({ key: "other", label: "Other", colorVar: "--chart-6" });
  }

  return { newTenantRows, newTenantBars };
}
