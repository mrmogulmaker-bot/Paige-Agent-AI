// Admin viewer for security canary probes. Lists recent probe runs against
// the publicly-readable growth tables and surfaces any regressions.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, ShieldAlert, RefreshCw, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

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

const STATUS_BADGE: Record<CanaryRun["status"], { label: string; className: string }> = {
  pass: { label: "Pass", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  regression: { label: "Regression", className: "bg-red-500/15 text-red-700 border-red-500/30" },
  error: { label: "Error", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
};

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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {healthy ? (
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            ) : (
              <ShieldAlert className="h-6 w-6 text-red-600" />
            )}
            Security Canary
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hourly probes confirm that anonymous visitors cannot read restricted internal columns on
            <code className="mx-1 px-1 rounded bg-muted">growth_forms</code>
            and
            <code className="mx-1 px-1 rounded bg-muted">growth_pages</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={runNow} disabled={probing}>
            <PlayCircle className={`h-4 w-4 mr-2 ${probing ? "animate-pulse" : ""}`} />
            {probing ? "Probing…" : "Run probe now"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last run</CardDescription>
            <CardTitle className="text-lg">
              {lastRun ? formatDistanceToNow(new Date(lastRun.created_at), { addSuffix: true }) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recent regressions (last 100 runs)</CardDescription>
            <CardTitle className={`text-lg ${recentRegressions > 0 ? "text-red-600" : ""}`}>
              {recentRegressions}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Schedule</CardDescription>
            <CardTitle className="text-lg">Every hour (:07)</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent probe runs</CardTitle>
          <CardDescription>
            Each run executes one probe per target. A regression means a restricted column was
            reachable by an anonymous caller.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Probe</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>Leaked columns / error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No probe runs yet. Click "Run probe now" to generate the first run.
                  </TableCell>
                </TableRow>
              )}
              {runs.map((r) => {
                const badge = STATUS_BADGE[r.status];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.probe_name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.target}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.http_status ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {r.leaked_columns && r.leaked_columns.length > 0 ? (
                        <span className="text-red-600 font-mono text-xs">
                          {r.leaked_columns.join(", ")}
                        </span>
                      ) : r.error_message ? (
                        <span className="text-amber-700 text-xs">{r.error_message}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
