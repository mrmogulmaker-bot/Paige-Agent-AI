import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function WorkflowRuns() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("paige_workflow_runs")
        .select("id, status, triggered_at, error, registry_id, paige_workflow_registry(key, label)")
        .order("triggered_at", { ascending: false })
        .limit(100);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4 max-w-4xl">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/workflows"><ArrowLeft className="w-4 h-4 mr-1" /> Workflows</Link>
      </Button>
      <Card>
        <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
          {rows.map((r) => (
            <Link
              key={r.id}
              to={`/admin/workflows/runs/${r.id}`}
              className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-muted/40 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {(r as any).paige_workflow_registry?.label ?? "(deleted workflow)"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.triggered_at), { addSuffix: true })}
                </div>
              </div>
              <Badge
                variant={r.status === "failed" ? "destructive" : r.status === "completed" ? "default" : "secondary"}
                className="capitalize"
              >
                {r.status}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
