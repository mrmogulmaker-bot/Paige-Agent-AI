// Team scoreboard (IA slice 1c-ix) — headline KPIs + a ranked per-rep leaderboard over
// team_scoreboard_metrics, with a time-window toggle and a team-group filter (both
// CLIENT-SIDE over the RLS-scoped rows — no tenant/window server param, §9). Owning
// desks are labeled honestly (§16: Sales · Client Success), and team groups are a
// role-derived UI organization (§13), never a backend segmentation.
//
// HONESTY (§13): NO producer writes metrics today, so rows are empty and the whole panel
// renders a crafted EmptyState — NEVER fabricated numbers or fake rows. The query is real,
// so it fills the instant the filed scoreboard-metric writer records. The at-risk banner is
// computed CLIENT-SIDE (bottom-quartile over a real metric) and shows ONLY when real rows
// exist — never "Paige noticed" (there is no frontend seam to L4 reasoning).
import { useMemo, useState } from "react";
import { BarChart3, ArrowUpDown, TrendingDown } from "lucide-react";
import { SectionCard, StatRow, StatTile, DataTableShell, EmptyState, FilterChip, type Column } from "@/components/ui/page";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GROUP_LABEL, GROUP_ORDER, groupForRoles, roleLabel, type TeamGroup } from "@/lib/team/teamGroups";
import type { ScoreboardRow } from "@/hooks/useTeamScoreboard";
import type { RosterMember } from "@/hooks/useTeamRoster";

type WindowKey = "today" | "week" | "mtd" | "qtd";
const WINDOW_LABEL: Record<WindowKey, string> = { today: "Today", week: "Week", mtd: "MTD", qtd: "QTD" };
const WINDOW_ORDER: WindowKey[] = ["today", "week", "mtd", "qtd"];

function windowStart(key: WindowKey): number {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today":
      return d.getTime();
    case "week":
      return d.getTime() - 6 * 86_400_000;
    case "mtd":
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case "qtd": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), q, 1).getTime();
    }
  }
}

function humanizeMetric(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function memberName(id: string, memberById: Record<string, RosterMember>): string {
  const m = memberById[id];
  return m?.full_name?.trim() || m?.email || "Teammate";
}

export function TeamScoreboard({
  rows,
  loading,
  memberById,
  rolesByUser,
  restrictToUserId = null,
}: {
  rows: ScoreboardRow[];
  loading: boolean;
  memberById: Record<string, RosterMember>;
  rolesByUser: Record<string, string[]>;
  /** "My Queue" view → only this user's rows. null = whole tenant (RLS already scopes). */
  restrictToUserId?: string | null;
}) {
  const [windowKey, setWindowKey] = useState<WindowKey>("week");
  const [group, setGroup] = useState<TeamGroup | "all">("all");
  const [sortKey, setSortKey] = useState<string>("__name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // 1) Window + group + view filter (all client-side, §9 — no server params).
  const filtered = useMemo(() => {
    const start = windowStart(windowKey);
    return rows.filter((r) => {
      if (Date.parse(r.recorded_at) < start) return false;
      if (restrictToUserId && r.user_id !== restrictToUserId) return false;
      if (group !== "all" && groupForRoles(rolesByUser[r.user_id] ?? []) !== group) return false;
      return true;
    });
  }, [rows, windowKey, group, restrictToUserId, rolesByUser]);

  // 2) Distinct metric keys present, and a per-(user,metric) LATEST-value pivot.
  const { metricKeys, pivot } = useMemo(() => {
    const keys = new Set<string>();
    // user_id → metric_key → { value, at }
    const p = new Map<string, Map<string, { value: number; at: number }>>();
    for (const r of filtered) {
      keys.add(r.metric_key);
      const at = Date.parse(r.recorded_at);
      let byMetric = p.get(r.user_id);
      if (!byMetric) {
        byMetric = new Map();
        p.set(r.user_id, byMetric);
      }
      const prev = byMetric.get(r.metric_key);
      if (!prev || at >= prev.at) byMetric.set(r.metric_key, { value: Number(r.value) || 0, at });
    }
    return { metricKeys: Array.from(keys).sort(), pivot: p };
  }, [filtered]);

  // 3) Headline KPI per metric = sum of latest-per-user values.
  const kpis = useMemo(() => {
    return metricKeys.map((key) => {
      let total = 0;
      for (const byMetric of pivot.values()) {
        const cell = byMetric.get(key);
        if (cell) total += cell.value;
      }
      return { key, total };
    });
  }, [metricKeys, pivot]);

  // 4) Leaderboard rows: one per rep with each metric's latest value.
  const leaderboard = useMemo(() => {
    const out = Array.from(pivot.entries()).map(([userId, byMetric]) => {
      const values: Record<string, number | null> = {};
      for (const key of metricKeys) values[key] = byMetric.get(key)?.value ?? null;
      return {
        userId,
        name: memberName(userId, memberById),
        roles: rolesByUser[userId] ?? [],
        values,
      };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      if (sortKey === "__name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "__group") {
        return GROUP_LABEL[groupForRoles(a.roles)].localeCompare(GROUP_LABEL[groupForRoles(b.roles)]) * dir;
      }
      return ((a.values[sortKey] ?? 0) - (b.values[sortKey] ?? 0)) * dir;
    });
    return out;
  }, [pivot, metricKeys, memberById, rolesByUser, sortKey, sortDir]);

  // 5) At-risk signal — the true bottom QUARTILE (by count) over the FIRST metric key,
  // real rows only (§13). Taking sorted.slice(0, floor(n/4)) flags exactly the bottom
  // ~25% (never the bottom half, which a `<= q1` threshold produced at small n), and only
  // when there are enough reps for a quartile to be meaningful (n >= 4).
  const atRisk = useMemo(() => {
    if (metricKeys.length === 0 || leaderboard.length < 4) return null;
    const headline = metricKeys[0];
    const withVals = leaderboard
      .map((r) => ({ name: r.name, v: r.values[headline] }))
      .filter((r): r is { name: string; v: number } => typeof r.v === "number");
    if (withVals.length < 4) return null;
    const sorted = [...withVals].sort((a, b) => a.v - b.v);
    const cutoff = Math.floor(sorted.length / 4); // bottom-quartile count (>=1 at n>=4)
    const behind = sorted.slice(0, cutoff);
    if (behind.length === 0) return null;
    return { metric: humanizeMetric(headline), names: behind.map((b) => b.name), window: WINDOW_LABEL[windowKey] };
  }, [metricKeys, leaderboard, windowKey]);

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "__name" || key === "__group" ? "asc" : "desc");
    }
  }

  const sortHeader = (key: string, label: string, numeric?: boolean) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => toggleSort(key)}
      className={cn(
        "-ml-2 h-7 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        numeric && "ml-auto",
      )}
    >
      {label}
      <ArrowUpDown className={cn("ml-1 h-3 w-3", sortKey === key ? "opacity-90" : "opacity-40")} />
    </Button>
  );

  const columns: Column[] = [
    { key: "__rank", header: "#" },
    { key: "__name", header: sortHeader("__name", "Rep") },
    { key: "__group", header: sortHeader("__group", "Role") },
    ...metricKeys.map((k) => ({ key: k, header: sortHeader(k, humanizeMetric(k), true), numeric: true })),
  ];

  const isEmpty = !loading && filtered.length === 0;

  return (
    <SectionCard
      title="Team scoreboard"
      description="Sales · Client Success performance"
      icon={BarChart3}
    >
      <div className="space-y-4">
        {/* At-risk banner — only ever shown when REAL rows exist and a rep is behind (§13). */}
        {atRisk && (
          <div className="flex items-start gap-2.5 rounded-md border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] p-3">
            <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" aria-hidden />
            <p className="text-sm text-foreground">
              <span className="font-medium">{atRisk.names.slice(0, 3).join(", ")}</span>
              {atRisk.names.length > 3 ? ` +${atRisk.names.length - 3} more` : ""}{" "}
              {atRisk.names.length === 1 ? "is" : "are"} trending behind on{" "}
              <span className="font-medium">{atRisk.metric}</span> this {atRisk.window.toLowerCase()}.
            </p>
          </div>
        )}

        {/* Filters — window + team group. Indigo active, NEVER gold (§11). */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {WINDOW_ORDER.map((w) => (
              <FilterChip key={w} active={windowKey === w} onClick={() => setWindowKey(w)}>
                {WINDOW_LABEL[w]}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={group === "all"} onClick={() => setGroup("all")}>All roles</FilterChip>
            {GROUP_ORDER.map((g) => (
              <FilterChip key={g} active={group === g} onClick={() => setGroup(g)}>
                {GROUP_LABEL[g]}
              </FilterChip>
            ))}
          </div>
        </div>

        {isEmpty ? (
          <EmptyState
            icon={BarChart3}
            tone="brand"
            title="No metrics recorded yet"
            description="Rep performance will populate here the moment your scoreboard starts recording."
          />
        ) : (
          <>
            {/* One recorded metric would leave a dead cell in StatRow's 2-col min — render
                the lone tile full-width; two or more use the StatRow grid. */}
            {kpis.length === 1 ? (
              <StatTile
                label={humanizeMetric(kpis[0].key)}
                value={numberFmt.format(kpis[0].total)}
                loading={loading}
              />
            ) : kpis.length > 1 ? (
              <StatRow cols={Math.min(4, kpis.length) as 2 | 3 | 4}>
                {kpis.slice(0, 4).map((k) => (
                  <StatTile
                    key={k.key}
                    label={humanizeMetric(k.key)}
                    value={numberFmt.format(k.total)}
                    loading={loading}
                  />
                ))}
              </StatRow>
            ) : null}

            <DataTableShell columns={columns} loading={loading}>
              {leaderboard.map((r, i) => (
                <TableRow key={r.userId}>
                  <TableCell className="w-8 text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.roles.length > 0 ? roleLabel(r.roles[0]) : GROUP_LABEL[groupForRoles(r.roles)]}
                  </TableCell>
                  {metricKeys.map((k) => (
                    <TableCell key={k} className="text-right tabular-nums">
                      {r.values[k] == null ? "—" : numberFmt.format(r.values[k] as number)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </DataTableShell>
          </>
        )}
      </div>
    </SectionCard>
  );
}
