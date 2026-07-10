// Admin viewer for security canary probes. Lists recent probe runs against
// the publicly-readable growth tables and surfaces any regressions.
// Reference migration for the Wave 0 premium primitive layer.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ShieldCheck, ShieldAlert, RefreshCw, PlayCircle, Clock, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  PageShell, PageHeader, StatRow, StatTile, DataTableShell, EmptyState, StatePill,
  type Column, type PillState,
} from "@/components/ui/page";

interface CanaryRun {
  id: string;
  probe_name: string;
  target: string;
  status: "pass" | "regression" | "error";
  leaked_columns: string[] | null;
  http_status: number | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_PILL: Record<CanaryRun["status"], { state: PillState; label: string }> = {
  pass: { state: "success", label: "Pass" },
  regression: { state: "error", label: "Regression" },
  error: { state: "pending", label: "Error" },
};

const COLS: Column[] = [
  { key: "when", header: "When" },
  { key: "probe", header: "Probe" },
  { key: "target", header: "Target" },
  { key: "status", header: "Status" },
  { key: "http", header: "HTTP", numeric: true },
  { key: "detail", header: "Leaked columns / error" },
];

export default function SecurityCanaryAdmin() {
  const [runs, setRuns] = useState<CanaryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("security_canary_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error("Failed to load canary runs");
    } else {
      setRuns((data ?? []) as CanaryRun[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runNow = async () => {
    setProbing(true);
    const { data, error } = await supabase.functions.invoke("security-canary-probe", {
      body: { source: "manual" },
    });
    setProbing(false);
    if (error) {
      toast.error(`Probe failed: ${error.message}`);
      return;
    }
    const regressions = (data as { regressions?: number } | null)?.regressions ?? 0;
    if (regressions > 0) toast.error(`${regressions} regression(s) detected — check the table`);
    else toast.success("All probes passed");
    load();
  };

  const lastRun = runs[0];
  const recentRegressions = runs.filter((r) => r.status === "regression").length;
  const healthy = lastRun && runs.slice(0, 2).every((r) => r.status === "pass");

  return (
    <PageShell width="wide">
      <PageHeader
        icon={healthy ? ShieldCheck : ShieldAlert}
        eyebrow="Platform · Integrity"
        title="Security Canary"
        description="Hourly probes confirm anonymous visitors can't read restricted internal columns on the public growth tables."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="gold" size="sm" onClick={runNow} disabled={probing}>
              <PlayCircle className={`h-4 w-4 mr-2 ${probing ? "animate-pulse" : ""}`} />
              {probing ? "Probing…" : "Run probe now"}
            </Button>
          </>
        }
      />

      <StatRow cols={3}>
        <StatTile
          label="Status"
          value={healthy ? "Healthy" : lastRun ? "Needs attention" : "—"}
          intent={healthy ? "positive" : lastRun ? "negative" : "neutral"}
          icon={healthy ? ShieldCheck : ShieldAlert}
          loading={loading}
        />
        <StatTile
          label="Recent regressions"
          value={recentRegressions}
          intent={recentRegressions > 0 ? "negative" : "neutral"}
          hint="last 100 runs"
          icon={ShieldAlert}
          loading={loading}
        />
        <StatTile
          label="Last run"
          value={lastRun ? formatDistanceToNow(new Date(lastRun.created_at), { addSuffix: true }) : "—"}
          hint="scheduled hourly (:07)"
          icon={Clock}
          loading={loading}
        />
      </StatRow>

      <DataTableShell
        columns={COLS}
        loading={loading}
        isEmpty={runs.length === 0}
        empty={
          <EmptyState
            icon={CalendarClock}
            title="No probe runs yet"
            description="Run the first probe now to confirm the public growth tables aren't leaking restricted columns."
            action={<Button variant="gold" size="sm" onClick={runNow} disabled={probing}>Run probe now</Button>}
          />
        }
      >
        {runs.map((r) => {
          const pill = STATUS_PILL[r.status];
          return (
            <TableRow key={r.id}>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </TableCell>
              <TableCell className="font-mono text-xs">{r.probe_name}</TableCell>
              <TableCell className="font-mono text-xs">{r.target}</TableCell>
              <TableCell><StatePill state={pill.state}>{pill.label}</StatePill></TableCell>
              <TableCell className="text-sm text-right tabular-nums">{r.http_status ?? "—"}</TableCell>
              <TableCell className="text-sm">
                {r.leaked_columns && r.leaked_columns.length > 0 ? (
                  <span className="text-[hsl(var(--destructive))] font-mono text-xs">
                    {r.leaked_columns.join(", ")}
                  </span>
                ) : r.error_message ? (
                  <span className="text-[hsl(var(--warning))] text-xs">{r.error_message}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </DataTableShell>
    </PageShell>
  );
}
