/**
 * Platform → Operator Overview (God dashboard).
 *
 * The platform operator's home masthead: fleet-wide health at a glance — MRR/ARR,
 * live tenants with tier split, dunning exposure, and the at-risk count — over a
 * live at-risk drill list. §9 tier isolation: every number here is FLEET-WIDE and
 * comes ONLY from operator_dashboard_metrics + operator_at_risk_tenants, both gated
 * on is_platform_admin() server-side (a non-operator RPC call RAISES 42501). No
 * member/client PII: the at-risk table shows BUSINESS rows and aggregate reasons
 * only — the drill-in to a tenant's people lives in the Fleet Console below.
 *
 * Live: KPI tiles POLL (refetchInterval 45s + refetchOnWindowFocus); the at-risk
 * rail ALSO refetches instantly on platform approval churn via paige_pending_approvals
 * realtime. Gold discipline (§6/§11): the ONE gold act on this surface is the
 * per-row "Reach out" — never a resting tile.
 *
 * Renders defensively: a tile appears ONLY when its key is present (the RPC omits
 * any metric with no real source — §13, no fabricated numbers).
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, Building2, Receipt, AlertTriangle, Sparkles, Percent,
  Zap, Activity, Users, Gauge, ArrowUpRight, ShieldAlert,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  StatRow, StatTile, SectionCard, DataTableShell, EmptyState, type Column,
} from "@/components/ui/page";

// ── RPC return shapes (mirrors 20260713110000_tier_dashboard_metrics.sql) ──────
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

// Compact tier split → "12 solo · 4 agency · 1 enterprise" (present tiers only).
function tierSplitHint(t?: TierSplit | null): string | null {
  if (!t) return null;
  const parts: string[] = [];
  if (has(t.individual)) parts.push(`${t.individual} solo`);
  if (has(t.standalone)) parts.push(`${t.standalone} standalone`);
  if (has(t.agency)) parts.push(`${t.agency} agency`);
  if (has(t.enterprise)) parts.push(`${t.enterprise} enterprise`);
  return parts.length ? parts.join(" · ") : null;
}

const ATTENTION_ANCHOR = "platform-attention-queue";

export default function PlatformOverview({
  onReachOut,
}: {
  /** Open the Fleet Console drill-in for an at-risk tenant (the operator's act surface). */
  onReachOut?: (tenantId: string, name: string) => void;
}) {
  const qc = useQueryClient();

  const metricsQ = useQuery({
    queryKey: ["operator_dashboard_metrics"],
    queryFn: async (): Promise<OperatorMetrics> => {
      const { data, error } = await supabase.rpc(
        "operator_dashboard_metrics" as never,
        { p_window_days: 30 } as never,
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

  // Poll for tiles; realtime for the rail. Platform approval churn nudges an
  // instant refetch of the at-risk rail + the fleet-action KPI so the operator's
  // attention surface never lags the fleet (already-published table).
  useEffect(() => {
    const ch = supabase
      .channel("operator_overview_pending_approvals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paige_pending_approvals" },
        () => {
          qc.invalidateQueries({ queryKey: ["operator_at_risk_tenants"] });
          qc.invalidateQueries({ queryKey: ["operator_dashboard_metrics"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const m = metricsQ.data ?? {};
  const loading = metricsQ.isLoading;
  const tenants = m.active_tenants ?? undefined;
  const dunCount = m.dunning?.count ?? null;
  const dunMrr = m.dunning?.mrr_cents ?? null;

  // The KPI rollup and the at-risk queue are independent calls. If the KPI RPC
  // errors we show a scoped notice in place of the tiles (the defensive has()
  // guards already hide every tile when m={}) but the attention queue — the
  // operator's act surface — still renders from its own query.
  const atRisk = atRiskQ.data ?? [];

  const columns: Column[] = [
    { key: "name", header: "Tenant" },
    { key: "tier", header: "Tier" },
    { key: "mrr", header: "MRR", numeric: true },
    { key: "reason", header: "Risk" },
    { key: "last", header: "Last active" },
    { key: "act", header: <span className="sr-only">Act</span> },
  ];

  return (
    <section className="space-y-6" aria-label="Platform overview">
      {metricsQ.isError && (
        <SectionCard title="Fleet overview unavailable" icon={ShieldAlert}>
          <p className="text-sm text-muted-foreground">
            Live platform metrics couldn't load right now — the attention queue below is unaffected.
          </p>
        </SectionCard>
      )}
      {/* ── Hero KPIs: fleet revenue + reach + the attention signal ─────────── */}
      <StatRow cols={4}>
        {has(m.mrr_cents) && (
          <StatTile
            label="Recurring revenue"
            value={usd(m.mrr_cents)}
            icon={DollarSign}
            hint={has(m.arr_cents) ? `${usd(m.arr_cents)} ARR` : "per month"}
            loading={loading}
          />
        )}
        {has(tenants?.total) && (
          <StatTile
            label="Active tenants"
            value={tenants!.total}
            icon={Building2}
            hint={tierSplitHint(tenants) ?? undefined}
            loading={loading}
          />
        )}
        {has(dunCount) && (
          <StatTile
            label="Dunning exposure"
            value={dunCount}
            icon={Receipt}
            intent={(dunCount as number) > 0 ? "negative" : "neutral"}
            hint={has(dunMrr) ? `${usd(dunMrr)}/mo at stake` : "past-due accounts"}
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
              value={m.at_risk_count}
              icon={AlertTriangle}
              intent={(m.at_risk_count as number) > 0 ? "negative" : "neutral"}
              hint="tenants at risk · review below"
              loading={loading}
              className="h-full transition-shadow hover:shadow-lg"
            />
          </a>
        )}
      </StatRow>

      {/* ── Secondary KPIs: growth + activation ─────────────────────────────── */}
      <StatRow cols={4}>
        {has(m.new_tenants) && (
          <StatTile label="New tenants" value={m.new_tenants} icon={Sparkles} hint="last 30 days" loading={loading} />
        )}
        {has(m.trial_conversion_pct) && (
          <StatTile
            label="Trial → paid"
            value={`${m.trial_conversion_pct}%`}
            icon={Percent}
            loading={loading}
          />
        )}
        {has(m.fleet_paige_actions) && (
          <StatTile label="Paige actions" value={m.fleet_paige_actions} icon={Zap} hint="fleet-wide" loading={loading} />
        )}
        {has(m.wau_tenants) && (
          <StatTile label="Weekly active tenants" value={m.wau_tenants} icon={Activity} loading={loading} />
        )}
      </StatRow>

      {/* ── Fleet engagement ─────────────────────────────────────────────────── */}
      {(has(m.total_platform_users) || has(m.arpa_cents)) && (
        <SectionCard title="Fleet engagement" description="Reach and revenue efficiency across every workspace.">
          <div className="grid gap-4 sm:grid-cols-2">
            {has(m.total_platform_users) && (
              <StatTile label="Platform users" value={m.total_platform_users} icon={Users} loading={loading} />
            )}
            {has(m.arpa_cents) && (
              <StatTile
                label="Avg. revenue / account"
                value={usd(m.arpa_cents)}
                icon={Gauge}
                hint="per paying tenant / mo"
                loading={loading}
              />
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Attention queue: the at-risk drill list (the gold act lives here) ── */}
      <div id={ATTENTION_ANCHOR} className="scroll-mt-6 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-semibold text-foreground">Attention queue</h2>
          {atRisk.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">· {atRisk.length}</span>
          )}
        </div>
        <DataTableShell
          columns={columns}
          loading={atRiskQ.isLoading}
          isEmpty={atRisk.length === 0}
          empty={
            <EmptyState
              icon={ShieldAlert}
              title="The whole fleet is healthy"
              description="No tenant is past due, suspended, or gone quiet. When one drifts, it surfaces here to act on."
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
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => onReachOut?.(t.tenant_id, t.name)}
                  disabled={!onReachOut}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" /> Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </DataTableShell>
      </div>
    </section>
  );
}
