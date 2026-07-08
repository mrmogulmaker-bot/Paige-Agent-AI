/**
 * Platform → Fleet Console (Agency/God view)
 * Owner-only tenant control plane: every tenant with live health — plan, status,
 * trial countdown, seat/customer utilization, and an at-risk flag — sortable,
 * with a drill-in for lifecycle actions. Replaces the old read-only table.
 * Blueprint §02 · Phase 1 (no Stripe).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Building2, Users, Contact as ContactIcon, ShieldAlert, AlertTriangle, Clock, ArrowUpDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTenantContext, TenantSummary } from "@/hooks/useTenantContext";
import { PLATFORM } from "@/lib/platform/identity";
import {
  type TenantStatus, type HealthLevel, STATUS_META, tenantHealth, trialDaysLeft,
} from "@/lib/platform/tenantLifecycle";
import { TenantDetailSheet, type FleetTenant } from "@/components/admin/platform/TenantDetailSheet";

const STATUS_TONE: Record<string, string> = {
  positive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  notice: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  neutral: "bg-muted text-muted-foreground border-border",
};
const HEALTH_DOT: Record<HealthLevel, string> = {
  healthy: "bg-emerald-400",
  watch: "bg-amber-400",
  critical: "bg-red-400",
};

type SortKey = "name" | "plan_offer" | "status" | "trial" | "seats" | "customers" | "health";
const HEALTH_RANK: Record<HealthLevel, number> = { healthy: 0, watch: 1, critical: 2 };

export default function PlatformTenants() {
  const { isPlatformOwner, loading: ctxLoading } = useTenantContext();
  const [rows, setRows] = useState<FleetTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    // RLS lets the platform owner read all tenants + members + clients.
    const [{ data: tenants }, { data: members }, { data: clients }] = await Promise.all([
      supabase
        .from("tenants")
        .select("id, slug, name, status, plan_offer, seat_limit, customer_limit, trial_ends_at")
        .order("created_at", { ascending: true }),
      supabase.from("tenant_members").select("tenant_id").eq("status", "active"),
      supabase.from("clients").select("tenant_id"),
    ]);

    const memberCounts = new Map<string, number>();
    (members ?? []).forEach((m) => memberCounts.set(m.tenant_id, (memberCounts.get(m.tenant_id) ?? 0) + 1));
    const customerCounts = new Map<string, number>();
    (clients ?? []).forEach((c) => {
      if (!c.tenant_id) return;
      customerCounts.set(c.tenant_id, (customerCounts.get(c.tenant_id) ?? 0) + 1);
    });

    setRows(
      ((tenants ?? []) as any[]).map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        status: t.status as TenantStatus,
        plan_offer: t.plan_offer,
        seat_limit: t.seat_limit ?? 0,
        customer_limit: t.customer_limit ?? 0,
        trial_ends_at: t.trial_ends_at,
        member_count: memberCounts.get(t.id) ?? 0,
        customer_count: customerCounts.get(t.id) ?? 0,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (ctxLoading || !isPlatformOwner) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxLoading, isPlatformOwner]);

  const withHealth = useMemo(
    () => rows.map((t) => ({ t, health: tenantHealth(t), days: trialDaysLeft(t.trial_ends_at) })),
    [rows],
  );

  const totals = useMemo(() => {
    return withHealth.reduce(
      (acc, { t, health }) => ({
        tenants: acc.tenants + 1,
        active: acc.active + (t.status === "active" ? 1 : 0),
        trials: acc.trials + (t.status === "trial" ? 1 : 0),
        atRisk: acc.atRisk + (health.level !== "healthy" ? 1 : 0),
      }),
      { tenants: 0, active: 0, trials: 0, atRisk: 0 },
    );
  }, [withHealth]);

  const sorted = useMemo(() => {
    const arr = [...withHealth];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: number | string, bv: number | string;
      switch (sortKey) {
        case "name": av = a.t.name.toLowerCase(); bv = b.t.name.toLowerCase(); break;
        case "plan_offer": av = a.t.plan_offer ?? ""; bv = b.t.plan_offer ?? ""; break;
        case "status": av = a.t.status; bv = b.t.status; break;
        case "trial":
          av = a.t.status === "trial" ? (a.days ?? Infinity) : Infinity;
          bv = b.t.status === "trial" ? (b.days ?? Infinity) : Infinity;
          break;
        case "seats": av = a.t.member_count; bv = b.t.member_count; break;
        case "customers": av = a.t.customer_count; bv = b.t.customer_count; break;
        case "health": av = HEALTH_RANK[a.health.level]; bv = HEALTH_RANK[b.health.level]; break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [withHealth, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(({ t }) =>
      t.name.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      t.status.includes(q) ||
      (t.plan_offer ?? "").toLowerCase().includes(q));
  }, [sorted, query]);

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" || k === "plan_offer" ? "asc" : "desc"); }
  };

  // Derive the open tenant from live rows (not a snapshot) so the drill-in
  // reflects a mutation the moment load() refetches after it.
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);
  const openTenant = (t: FleetTenant) => { setSelectedId(t.id); setSheetOpen(true); };

  if (ctxLoading) {
    return <div className="text-muted-foreground text-sm">Loading platform console…</div>;
  }

  if (!isPlatformOwner) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            <CardTitle>Platform owner only</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This area is restricted to the platform owner. If you manage a tenant,
            head to <strong>Settings → Workspace</strong> instead.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Fleet Console</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every workspace running on {PLATFORM.name}. Click a tenant to manage its plan, limits, and lifecycle.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Tenants" value={totals.tenants} icon={Building2} />
        <StatCard label="Active" value={totals.active} icon={Building2} />
        <StatCard label="On trial" value={totals.trials} icon={Clock} />
        <StatCard label="Needs attention" value={totals.atRisk} icon={AlertTriangle}
          tone={totals.atRisk > 0 ? "warn" : undefined} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">All tenants</CardTitle>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, slug, status…"
            className="max-w-[220px] h-8"
            aria-label="Search tenants"
          />
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {rows.length === 0 ? "No tenants yet." : "No tenants match your search."}
            </div>
          ) : (
            <TooltipProvider delayDuration={200}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead label="Tenant" k="name" {...{ sortKey, sortBy }} />
                      <SortHead label="Plan" k="plan_offer" {...{ sortKey, sortBy }} />
                      <SortHead label="Status" k="status" {...{ sortKey, sortBy }} />
                      <SortHead label="Trial" k="trial" {...{ sortKey, sortBy }} />
                      <SortHead label="Seats" k="seats" align="right" {...{ sortKey, sortBy }} />
                      <SortHead label="Customers" k="customers" align="right" {...{ sortKey, sortBy }} />
                      <SortHead label="Health" k="health" {...{ sortKey, sortBy }} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(({ t, health, days }) => {
                      const meta = STATUS_META[t.status];
                      return (
                        <TableRow
                          key={t.id}
                          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          tabIndex={0}
                          role="button"
                          aria-label={`Manage ${t.name}`}
                          onClick={() => openTenant(t)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTenant(t); }
                          }}
                        >
                          <TableCell>
                            <div className="font-medium">{t.name}</div>
                            <div className="text-xs text-muted-foreground">/{t.slug}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-[10px]">{t.plan_offer ?? "—"}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_TONE[meta.tone]}>{meta.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {t.status === "trial" && days !== null
                              ? days >= 0
                                ? <span className={days <= 3 ? "text-amber-400" : ""}>{days}d</span>
                                : <span className="text-red-400">lapsed</span>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={t.seat_limit > 0 && t.member_count >= t.seat_limit ? "text-amber-400" : ""}>
                              {t.member_count}/{t.seat_limit || "∞"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={t.customer_limit > 0 && t.customer_count >= t.customer_limit ? "text-amber-400" : ""}>
                              {t.customer_count}/{t.customer_limit || "∞"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {health.level === "healthy" ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className={`w-2 h-2 rounded-full ${HEALTH_DOT.healthy}`} /> Healthy
                              </span>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1.5 text-xs">
                                    <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[health.level]}`} />
                                    {health.level === "critical" ? "Critical" : "Watch"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{health.reasons.join(" · ")}</TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <TenantDetailSheet
        tenant={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onChanged={load}
      />
    </div>
  );
}

function SortHead({
  label, k, sortKey, sortBy, align,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortBy: (k: SortKey) => void; align?: "right";
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => sortBy(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === k ? "text-foreground font-medium" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      </button>
    </TableHead>
  );
}

function StatCard({
  label, value, icon: Icon, tone,
}: {
  label: string; value: number; icon: typeof Building2; tone?: "warn";
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className={`text-2xl font-bold tabular-nums mt-1 ${tone === "warn" ? "text-amber-400" : ""}`}>{value}</div>
        </div>
        <Icon className={`w-5 h-5 ${tone === "warn" ? "text-amber-400" : "text-muted-foreground"}`} />
      </CardContent>
    </Card>
  );
}
