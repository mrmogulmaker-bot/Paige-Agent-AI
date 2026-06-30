import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Play } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SchemaProp {
  type: "string" | "number" | "integer" | "boolean";
  title?: string;
  description?: string;
  enum?: any[];
  default?: any;
}

export default function WorkflowDetail() {
  const { key } = useParams();
  const navigate = useNavigate();
  const [registry, setRegistry] = useState<any>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [runs, setRuns] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!key) return;
    (async () => {
      const { data: reg } = await supabase
        .from("paige_workflow_registry")
        .select("id, key, label, description, category, provider, parameters_schema, requires_approval, is_active, needs_n8n_link, sort_order")
        .eq("key", key)
        .maybeSingle();
      setRegistry(reg);
      const props = ((reg?.parameters_schema as any)?.properties ?? {}) as Record<string, SchemaProp>;
      const init: Record<string, any> = {};
      Object.entries(props).forEach(([k, v]) => { if (v.default !== undefined) init[k] = v.default; });
      setValues(init);
      if (reg?.id) {
        const { data: r } = await supabase
          .from("paige_workflow_runs")
          .select("id, status, triggered_at, error, n8n_execution_id")
          .eq("registry_id", reg.id)
          .order("triggered_at", { ascending: false })
          .limit(20);
        setRuns(r ?? []);
      }
    })();
  }, [key]);

  if (!registry) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const schema = ((registry.parameters_schema as any) ?? {}) as { properties?: Record<string, SchemaProp>; required?: string[] };
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  const run = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("trigger-workflow", {
      body: { registry_key: registry.key, payload: values },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error(`Trigger failed: ${error?.message || (data as any)?.error}`);
      return;
    }
    toast.success("Workflow triggered");
    navigate(`/admin/workflows/runs/${(data as any).run_id}`);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/workflows")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Workflows
        </Button>
        <Badge variant="secondary">{registry.category}</Badge>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{registry.label}</h1>
        {registry.description && (
          <p className="text-muted-foreground text-sm mt-1">{registry.description}</p>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Parameters</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {Object.keys(properties).length === 0 && (
            <p className="text-sm text-muted-foreground">No parameters required.</p>
          )}
          {Object.entries(properties).map(([k, p]) => (
            <div key={k} className="space-y-1.5">
              <Label className="text-xs">
                {p.title ?? k}
                {required.has(k) && <span className="text-destructive ml-1">*</span>}
              </Label>
              {p.description && (
                <p className="text-[11px] text-muted-foreground">{p.description}</p>
              )}
              {p.enum ? (
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={values[k] ?? ""}
                  onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                >
                  <option value="">—</option>
                  {p.enum.map((opt) => <option key={String(opt)} value={String(opt)}>{String(opt)}</option>)}
                </select>
              ) : p.type === "boolean" ? (
                <Switch
                  checked={!!values[k]}
                  onCheckedChange={(c) => setValues({ ...values, [k]: c })}
                />
              ) : p.type === "number" || p.type === "integer" ? (
                <Input
                  type="number"
                  value={values[k] ?? ""}
                  onChange={(e) => setValues({ ...values, [k]: e.target.value === "" ? "" : Number(e.target.value) })}
                />
              ) : (
                <Textarea
                  rows={2}
                  value={values[k] ?? ""}
                  onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                />
              )}
            </div>
          ))}
          <Button onClick={run} disabled={busy}>
            <Play className="w-4 h-4 mr-1.5" /> {busy ? "Running…" : "Run workflow"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
          {runs.map((r) => (
            <Link
              key={r.id}
              to={`/admin/workflows/runs/${r.id}`}
              className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/40 text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant={r.status === "failed" ? "destructive" : r.status === "completed" ? "default" : "secondary"}
                  className="capitalize text-[10px]"
                >
                  {r.status}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {formatDistanceToNow(new Date(r.triggered_at), { addSuffix: true })}
                </span>
              </div>
              {r.error && <span className="text-xs text-destructive truncate max-w-[200px]">{r.error}</span>}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
