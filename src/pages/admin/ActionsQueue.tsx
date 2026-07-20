/**
 * Admin → Paige Actions (the two-way action-bus queue, §8).
 *
 * The staff-facing view of Paige's action bus: every unit of work her departments hand each other —
 * a client-team at-risk flag routed to Owner Ops, an owner follow-up drafted by the email specialist,
 * a campaign the marketing desk is drafting — with its lifecycle (filed → drafting → drafted →
 * pending approval → done) and, critically, the filed/blocked/failed rows that used to die silently
 * now surfaced so a human can see and act. Data comes ONLY from list_actions, which is JWT-gated to
 * this tenant (§9) and admin/coach-only. Read-only surface — the acting happens in the Approvals inbox
 * (for pending drafts) and in Paige's chat (§10 the bus is Paige-governable).
 *
 * §11: built on the primitive layer, compact plain header, no gold (read-only). §13: honest empty and
 * error states; every row is a real bus row, never fabricated.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ListChecks, RefreshCw, ArrowRight, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  PageShell, PageHeader, StatRow, StatTile, DataTableShell, EmptyState,
  Toolbar, FilterChip, type Column,
} from "@/components/ui/page";

type ActionRow = {
  id: string;
  action_kind: string;
  from_department: string | null;
  to_department: string | null;
  title: string;
  summary: string | null;
  status: string;
  priority: string | null;
  filed_at: string;
  error: string | null;
};

// The bus lifecycle, in order — the filter chips + the KPI "open" grouping key off this.
const STATUSES = [
  "filed", "drafting", "drafted", "pending_approval", "approved", "executing", "done", "blocked", "failed", "dismissed",
] as const;
const OPEN_STATUSES = new Set(["filed", "drafting", "drafted", "pending_approval", "approved", "executing"]);
const ATTENTION_STATUSES = new Set(["blocked", "failed"]);

const STATUS_TONE: Record<string, string> = {
  filed: "text-muted-foreground",
  drafting: "text-[hsl(var(--ring))]",
  drafted: "text-[hsl(var(--ring))]",
  pending_approval: "text-[hsl(var(--warning))]",
  approved: "text-[hsl(var(--success))]",
  executing: "text-[hsl(var(--ring))]",
  done: "text-[hsl(var(--success))]",
  blocked: "text-[hsl(var(--destructive))]",
  failed: "text-[hsl(var(--destructive))]",
  dismissed: "text-muted-foreground",
};

function humanize(s?: string | null): string {
  if (!s) return "—";
  return s.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function ActionsQueue() {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["list_actions", statusFilter],
    queryFn: async (): Promise<ActionRow[]> => {
      const { data, error } = await supabase.rpc(
        "list_actions" as never,
        { p_status: statusFilter, p_limit: 200 } as never,
      );
      if (error) throw error;
      return (data ?? []) as ActionRow[];
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const counts = useMemo(() => {
    let open = 0, attention = 0, done = 0;
    for (const r of rows) {
      if (OPEN_STATUSES.has(r.status)) open++;
      else if (ATTENTION_STATUSES.has(r.status)) attention++;
      else if (r.status === "done") done++;
    }
    return { open, attention, done, total: rows.length };
  }, [rows]);

  const columns: Column[] = [
    { key: "when", header: "Filed" },
    { key: "title", header: "Work" },
    { key: "route", header: "Route" },
    { key: "kind", header: "Kind" },
    { key: "status", header: "Status" },
    { key: "priority", header: "Priority" },
  ];

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        eyebrow="Automation · Action bus"
        title="Paige Actions"
        description="The work Paige's departments hand each other — filed, drafted, waiting on your approval, or done. Anything blocked surfaces here to act on."
      />

      <StatRow cols={3}>
        <StatTile label="Open" value={counts.open} icon={ListChecks} hint="in flight on the bus" loading={q.isLoading} />
        <StatTile
          label="Needs attention"
          value={counts.attention}
          icon={ShieldAlert}
          intent={counts.attention > 0 ? "negative" : "neutral"}
          hint={counts.attention > 0 ? "blocked or failed" : "none blocked"}
          loading={q.isLoading}
        />
        <StatTile label="Completed" value={counts.done} icon={ListChecks} hint="in this view" loading={q.isLoading} />
      </StatRow>

      <div className="space-y-3">
        <Toolbar>
          <FilterChip active={statusFilter === null} onClick={() => setStatusFilter(null)}>All</FilterChip>
          {STATUSES.map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {humanize(s)}
            </FilterChip>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </Toolbar>

        <DataTableShell
          columns={columns}
          loading={q.isLoading}
          isEmpty={rows.length === 0}
          empty={
            <EmptyState
              icon={ListChecks}
              title={statusFilter ? `Nothing ${humanize(statusFilter).toLowerCase()}` : "The bus is clear"}
              description="When Paige's departments hand work to each other — a follow-up to draft, an at-risk client to flag — it appears here with its status."
            />
          }
        >
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                {formatDistanceToNow(new Date(r.filed_at), { addSuffix: true })}
              </TableCell>
              <TableCell className="max-w-[22rem]">
                <span className="font-medium text-foreground">{r.title}</span>
                {r.error && <span className="block text-xs text-[hsl(var(--destructive))]">{r.error}</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                <span>{humanize(r.from_department)}</span>
                <ArrowRight className="mx-1 inline h-3 w-3" aria-hidden />
                <span>{humanize(r.to_department)}</span>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.action_kind}</TableCell>
              <TableCell className="text-sm">
                <span className={STATUS_TONE[r.status] ?? "text-muted-foreground"}>{humanize(r.status)}</span>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{humanize(r.priority)}</TableCell>
            </TableRow>
          ))}
        </DataTableShell>
      </div>
    </PageShell>
  );
}
