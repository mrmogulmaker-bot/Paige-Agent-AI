/**
 * Platform → Paige Intelligence (God-view Intelligence Dashboard, §34 L7 Slice 1).
 *
 * The operator's fleet-wide window into Paige's own brain: how many LLM calls she makes, what they
 * COST (a labeled estimate), how they route, and the live state of the §34 intelligence departments —
 * Observability (L1 traces), Quality/Evals (L2), Talent (L5 roster), Learning (L6 memory).
 *
 * §9 tier isolation: every number is FLEET-WIDE and comes ONLY from operator_intelligence_metrics +
 * operator_intelligence_trace_tail — both gated on is_platform_admin() server-side (a non-operator
 * call RAISES 42501). PII-free by construction: the metrics are pure aggregates; the trace tail is
 * per-call METADATA only (never the input/output excerpts). The trace-tail read is audited server-side
 * (one god_view.fleet_query row per fetch), so even Super-Admin per-call visibility is traceable.
 *
 * §13 honest render: a tile/section shows ONLY when its key is present, and every panel has a crafted
 * empty state — the fleet's data is genuinely thin today (L1 tracing + L6 capture are freshly live),
 * so this surface is built to fill in as the brain runs, never to fake fullness.
 *
 * Live: KPI tiles POLL (30s); the trace tail is fetched on load + a manual Refresh (kept deliberate so
 * the audited per-call read isn't fired on every poll). Read-only surface — no gold act (§11).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Activity, DollarSign, Cpu, Gauge, Bot, ClipboardCheck, Brain, ShieldAlert,
  RefreshCw, Route as RouteIcon, Layers, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  PageShell, PageHeader, StatRow, StatTile, SectionCard, DataTableShell, EmptyState,
  PresenceDot, type Column,
} from "@/components/ui/page";

// ── RPC return shapes (mirror 20260720120000_operator_intelligence_rpcs.sql) ──────────────────────
type Breakdown = { provider?: string; tier?: string; status?: string; modality?: string; count: number; cost_estimate_usd?: number | null };
type TraceRollup = {
  total?: number | null;
  window_days?: number | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_estimate_usd?: number | null;
  avg_latency_ms?: number | null;
  error_count?: number | null;
  needs_config?: number | null;
  by_provider?: Breakdown[];
  by_tier?: Breakdown[];
  by_status?: Breakdown[];
};
type IntelligenceMetrics = {
  traces?: TraceRollup | null;
  doctrine_flags?: number | null;
  evals?: { runs?: number | null; runs_all?: number | null; avg_pass_rate?: number | null; results?: number | null; passed?: number | null } | null;
  roster?: { total?: number | null; enabled?: number | null; auto_disabled?: number | null; invocations?: number | null; invocations_all?: number | null } | null;
  memory?: { total?: number | null; window?: number | null; rated?: number | null; by_modality?: Breakdown[] } | null;
};
type TraceRow = {
  id: string;
  created_at: string;
  tenant_label: string | null;
  agent_id: string | null;
  provider: string | null;
  model: string | null;
  job_kind: string | null;
  modality: string | null;
  tier: string | null;
  status: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  cost_estimate_usd: number | null;
  error_class: string | null;
};

const has = (v: unknown): boolean => v !== undefined && v !== null;

function usd(v?: number | null): string {
  if (!has(v)) return "—";
  const n = v as number;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 4 : 2,
  });
}

function compactNum(v?: number | null): string {
  if (!has(v)) return "—";
  return (v as number).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

function ms(v?: number | null): string {
  if (!has(v)) return "—";
  const n = v as number;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n} ms`;
}

const STATUS_TONE: Record<string, string> = {
  success: "text-[hsl(var(--success))]",
  error: "text-[hsl(var(--destructive))]",
  needs_config: "text-[hsl(var(--warning))]",
};

export default function PlatformIntelligence() {
  const metricsQ = useQuery({
    queryKey: ["operator_intelligence_metrics"],
    queryFn: async (): Promise<IntelligenceMetrics> => {
      const { data, error } = await supabase.rpc(
        "operator_intelligence_metrics" as never,
        { p_window_days: 30 } as never,
      );
      if (error) throw error;
      return (data ?? {}) as IntelligenceMetrics;
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  // The trace tail is the audited per-call read — fetched on mount + a manual Refresh, NOT polled, so
  // the god_view.fleet_query audit row is written on a deliberate access, not every 30s tick.
  const traceQ = useQuery({
    queryKey: ["operator_intelligence_trace_tail"],
    queryFn: async (): Promise<TraceRow[]> => {
      const { data, error } = await supabase.rpc(
        "operator_intelligence_trace_tail" as never,
        { p_limit: 50 } as never,
      );
      if (error) throw error;
      return (data ?? []) as TraceRow[];
    },
    refetchOnWindowFocus: false,
  });

  const m = metricsQ.data ?? {};
  const t = m.traces ?? {};
  const evals = m.evals ?? {};
  const roster = m.roster ?? {};
  const memory = m.memory ?? {};
  const loading = metricsQ.isLoading;
  const traces = traceQ.data ?? [];

  const lastUpdated = metricsQ.dataUpdatedAt
    ? formatDistanceToNow(new Date(metricsQ.dataUpdatedAt), { addSuffix: true })
    : null;

  const tokenHint = useMemo(() => {
    if (!has(t.tokens_in) && !has(t.tokens_out)) return undefined;
    return `${compactNum(t.tokens_in)} in · ${compactNum(t.tokens_out)} out`;
  }, [t.tokens_in, t.tokens_out]);

  const columns: Column[] = [
    { key: "time", header: "When" },
    { key: "tenant", header: "Workspace" },
    { key: "agent", header: "Caller" },
    { key: "route", header: "Route" },
    { key: "job", header: "Job" },
    { key: "status", header: "Status" },
    { key: "tokens", header: "Tokens", numeric: true },
    { key: "latency", header: "Latency", numeric: true },
    { key: "cost", header: "Est. cost", numeric: true },
  ];

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        eyebrow="Platform · Intelligence"
        title="Paige Intelligence"
        description="How Paige's brain runs across the fleet — every LLM call, what it costs, and the live state of her intelligence departments."
      />

      {/* Live status row — refresh cadence + window, with the breathing presence dot (§25). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <PresenceDot status="online" size="sm" />
          Live · refreshes every 30s
        </span>
        {lastUpdated && <span className="tabular-nums">· updated {lastUpdated}</span>}
        <span>· 30-day window</span>
        <span className="inline-flex items-center gap-1">
          <ShieldAlert className="h-3 w-3" aria-hidden /> fleet-wide · aggregates only, no client content
        </span>
      </div>

      {metricsQ.isError && (
        <SectionCard title="Intelligence metrics unavailable" icon={ShieldAlert}>
          <p className="text-sm text-muted-foreground">
            The fleet intelligence rollup couldn't load right now. This surface is operator-only — if
            you're not on a platform-admin account, that's expected.
          </p>
        </SectionCard>
      )}

      {/* ── L1 Observability — the trace rollup as hero KPIs ─────────────────────────────────────── */}
      <StatRow cols={4}>
        <StatTile
          label="Traced calls"
          value={has(t.total) ? (t.total as number).toLocaleString() : "—"}
          icon={Activity}
          hint="last 30 days"
          loading={loading}
        />
        <StatTile
          label="Est. spend"
          value={usd(t.cost_estimate_usd)}
          icon={DollarSign}
          hint="estimate · list price"
          loading={loading}
        />
        <StatTile
          label="Tokens"
          value={compactNum((t.tokens_in ?? 0) + (t.tokens_out ?? 0))}
          icon={Cpu}
          hint={tokenHint}
          loading={loading}
        />
        <StatTile
          label="Avg latency"
          value={ms(t.avg_latency_ms)}
          icon={Gauge}
          hint={has(t.error_count) && (t.error_count as number) > 0 ? `${t.error_count} errored` : undefined}
          intent={has(t.error_count) && (t.error_count as number) > 0 ? "negative" : "neutral"}
          loading={loading}
        />
      </StatRow>

      {/* ── Cost & routing — where the calls go ──────────────────────────────────────────────────── */}
      <SectionCard
        title="Cost & routing"
        description="Which providers and routing tiers Paige's calls flow through."
        icon={RouteIcon}
      >
        {(t.by_provider?.length ?? 0) === 0 && (t.by_tier?.length ?? 0) === 0 ? (
          <EmptyState
            icon={RouteIcon}
            title="No routed calls yet"
            description="As Paige runs, the provider and tier mix of her LLM calls appears here."
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">By provider</h3>
              <ul className="space-y-1.5">
                {(t.by_provider ?? []).map((p) => (
                  <li key={p.provider} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">{p.provider}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {p.count.toLocaleString()} {p.count === 1 ? "call" : "calls"}
                      {has(p.cost_estimate_usd) && <span className="ml-2 text-foreground">{usd(p.cost_estimate_usd)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">By routing tier</h3>
              <ul className="space-y-1.5">
                {(t.by_tier ?? []).map((tr) => (
                  <li key={tr.tier} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">{tr.tier}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {tr.count.toLocaleString()} {tr.count === 1 ? "call" : "calls"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── The brain across every department — live state of the §34 layers ─────────────────────── */}
      <SectionCard
        title="Across every department"
        description="The live state of Paige's intelligence layers — Talent, Quality, Learning, and governance."
        icon={Layers}
      >
        <StatRow cols={4}>
          <StatTile
            label="Sub-agents"
            value={has(roster.enabled) ? `${roster.enabled}` : "—"}
            icon={Bot}
            hint={has(roster.total) ? `of ${roster.total} on the roster` : undefined}
            loading={loading}
          />
          <StatTile
            label="Eval runs"
            value={has(evals.runs) ? (evals.runs as number).toLocaleString() : "—"}
            icon={ClipboardCheck}
            hint={
              has(evals.avg_pass_rate)
                ? `${Math.round((evals.avg_pass_rate as number) * 100)}% avg pass`
                : (has(evals.runs_all) && (evals.runs_all as number) > 0 ? `${evals.runs_all} all-time` : "none run yet")
            }
            loading={loading}
          />
          <StatTile
            label="Memories"
            value={has(memory.total) ? (memory.total as number).toLocaleString() : "—"}
            icon={Brain}
            hint={
              has(memory.total) && (memory.total as number) > 0
                ? (has(memory.window) ? `${memory.window} in 30d` : undefined)
                : "learning as she creates"
            }
            loading={loading}
          />
          <StatTile
            label="Doctrine flags"
            value={has(m.doctrine_flags) ? (m.doctrine_flags as number).toLocaleString() : "—"}
            icon={Sparkles}
            hint={has(m.doctrine_flags) && (m.doctrine_flags as number) > 0 ? "review below" : "none flagged"}
            intent={has(m.doctrine_flags) && (m.doctrine_flags as number) > 0 ? "negative" : "neutral"}
            loading={loading}
          />
        </StatRow>
        {has(roster.invocations_all) && (roster.invocations_all as number) > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            {(roster.invocations_all as number).toLocaleString()} sub-agent invocations on record
            {has(roster.invocations) && ` · ${roster.invocations} in the last 30 days`}.
          </p>
        )}
      </SectionCard>

      {/* ── Recent activity — the PII-free trace tail (audited on fetch) ─────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-foreground">Recent activity</h2>
            {traces.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">· {traces.length}</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => traceQ.refetch()}
            disabled={traceQ.isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${traceQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <DataTableShell
          columns={columns}
          loading={traceQ.isLoading}
          isEmpty={traces.length === 0}
          empty={
            <EmptyState
              icon={Activity}
              title="No calls traced yet"
              description="Every LLM call Paige makes lands here — provider, cost, and latency — the moment tracing sees it."
            />
          }
        >
          {traces.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </TableCell>
              <TableCell className="font-medium">{r.tenant_label ?? "Platform"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.agent_id ?? "—"}</TableCell>
              <TableCell className="text-sm">
                <span className="text-foreground">{r.provider ?? "—"}</span>
                {r.model && <span className="text-muted-foreground"> · {r.model}</span>}
                {r.tier && <span className="text-muted-foreground"> · {r.tier}</span>}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.job_kind ?? r.modality ?? "—"}</TableCell>
              <TableCell className="text-sm">
                <span className={STATUS_TONE[r.status ?? ""] ?? "text-muted-foreground"}>
                  {r.status ?? "—"}
                </span>
                {r.error_class && <span className="ml-1 text-xs text-muted-foreground">({r.error_class})</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {has(r.tokens_in) || has(r.tokens_out)
                  ? `${compactNum(r.tokens_in ?? 0)}/${compactNum(r.tokens_out ?? 0)}`
                  : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{ms(r.latency_ms)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{usd(r.cost_estimate_usd)}</TableCell>
            </TableRow>
          ))}
        </DataTableShell>
      </div>
    </PageShell>
  );
}
