import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

export default function WorkflowRunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [registry, setRegistry] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: r } = await supabase
        .from("paige_workflow_runs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      setRun(r);
      if (r?.registry_id) {
        const { data: reg } = await supabase
          .from("paige_workflow_registry")
          .select("key, label")
          .eq("id", r.registry_id)
          .maybeSingle();
        setRegistry(reg);
      }
    })();
  }, [id]);

  // Poll for completion if running
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("paige_workflow_runs")
        .select("*")
        .eq("id", run.id)
        .maybeSingle();
      if (data) setRun(data);
    }, 4000);
    return () => clearInterval(t);
  }, [run]);

  if (!run) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Badge
          variant={run.status === "failed" ? "destructive" : run.status === "completed" ? "default" : "secondary"}
          className="capitalize"
        >
          {run.status}
        </Badge>
        {registry && (
          <Link to={`/admin/workflows/${registry.key}`} className="text-sm text-accent hover:underline">
            {registry.label}
          </Link>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Run details</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <div><span className="text-muted-foreground">Triggered:</span> {new Date(run.triggered_at).toLocaleString()}</div>
          {run.completed_at && (
            <div><span className="text-muted-foreground">Completed:</span> {new Date(run.completed_at).toLocaleString()}</div>
          )}
          {run.n8n_execution_id && (
            <div><span className="text-muted-foreground">n8n execution:</span> <code className="text-xs">{run.n8n_execution_id}</code></div>
          )}
          {run.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <div className="text-xs font-medium text-destructive">Error</div>
              <pre className="text-xs whitespace-pre-wrap mt-1">{run.error}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Payload</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
            {JSON.stringify(run.payload, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {run.result && (
        <Card>
          <CardHeader><CardTitle className="text-base">Result</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
              {JSON.stringify(run.result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
