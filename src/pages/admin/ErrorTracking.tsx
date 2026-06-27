import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Bug, ExternalLink } from "lucide-react";

type FailedRun = {
  id: string;
  registry_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
};


export default function ErrorTracking() {
  const [orgSlug, setOrgSlug] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [recent, setRecent] = useState<FailedRun[]>([]);
  const hasSentry = Boolean(import.meta.env.VITE_SENTRY_DSN);

  useEffect(() => {
    void (async () => {
      const [cfg, runs] = await Promise.all([
        supabase.from("paige_config").select("sentry_org_slug, sentry_project_slug").eq("id", 1).maybeSingle(),
        supabase.from("paige_workflow_runs").select("id, registry_id, status, error, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(25),
      ]);
      setOrgSlug(cfg.data?.sentry_org_slug ?? "");
      setProjectSlug(cfg.data?.sentry_project_slug ?? "");
      setRecent((runs.data ?? []) as FailedRun[]);

    })();
  }, []);

  const save = async () => {
    const { error } = await supabase.from("paige_config").update({
      sentry_org_slug: orgSlug || null,
      sentry_project_slug: projectSlug || null,
    }).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const sentryUrl = orgSlug && projectSlug
    ? `https://${orgSlug}.sentry.io/issues/?project=${projectSlug}`
    : null;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Bug className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Error Tracking</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sentry</CardTitle>
          <CardDescription>
            {hasSentry
              ? "Frontend errors are tunneled through /functions/v1/sentry-tunnel."
              : "Sentry disabled — add VITE_SENTRY_DSN + SENTRY_DSN secrets to enable."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={hasSentry ? "default" : "secondary"}>{hasSentry ? "Connected" : "Disabled"}</Badge>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Org slug</Label>
              <Input value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} placeholder="mma-ops" />
            </div>
            <div className="space-y-1">
              <Label>Project slug</Label>
              <Input value={projectSlug} onChange={(e) => setProjectSlug(e.target.value)} placeholder="paige-frontend" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>Save</Button>
            {sentryUrl && (
              <Button asChild variant="outline" className="gap-1">
                <a href={sentryUrl} target="_blank" rel="noreferrer">Open Sentry <ExternalLink className="size-3" /></a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent failed workflow runs</CardTitle>
          <CardDescription>From paige_workflow_runs · last 25 failures.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 && <p className="text-sm text-muted-foreground">No failed runs.</p>}
          {recent.map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-mono text-xs">{r.workflow_key ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              {r.error && <div className="mt-1 text-xs text-destructive whitespace-pre-wrap">{r.error}</div>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
