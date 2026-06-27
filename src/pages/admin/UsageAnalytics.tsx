import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, ExternalLink } from "lucide-react";

export default function UsageAnalytics() {
  const [projectUrl, setProjectUrl] = useState("");
  const [stats, setStats] = useState({ approvals: 0, workflowRuns: 0, sends: 0 });
  const hasPosthog = Boolean(import.meta.env.VITE_POSTHOG_KEY);

  useEffect(() => {
    void (async () => {
      const sb = supabase as unknown as any;
      const cfg = await sb.from("paige_config").select("posthog_project_url").eq("id", 1).maybeSingle();
      const ap = await sb.from("paige_pending_approvals").select("id", { count: "exact", head: true });
      const wr = await sb.from("paige_workflow_runs").select("id", { count: "exact", head: true });
      const snd = await sb.from("paige_messages_audit").select("id", { count: "exact", head: true }).eq("direction", "outbound");
      setProjectUrl(cfg.data?.posthog_project_url ?? "");
      setStats({
        approvals: ap.count ?? 0,
        workflowRuns: wr.count ?? 0,
        sends: snd.count ?? 0,
      });
    })();
  }, []);



  const save = async () => {
    const { error } = await supabase.from("paige_config").update({ posthog_project_url: projectUrl || null }).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Product Usage</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>PostHog</CardTitle>
          <CardDescription>
            {hasPosthog ? "Client + server SDKs are emitting events." : "PostHog disabled — add VITE_POSTHOG_KEY to enable."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={hasPosthog ? "default" : "secondary"}>{hasPosthog ? "Connected" : "Disabled"}</Badge>
          <div className="space-y-1">
            <Label>Project dashboard URL</Label>
            <div className="flex gap-2">
              <Input value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} placeholder="https://us.posthog.com/project/..." />
              <Button onClick={save}>Save</Button>
            </div>
          </div>
          {projectUrl && (
            <Button asChild variant="outline" className="gap-1">
              <a href={projectUrl} target="_blank" rel="noreferrer">Open PostHog <ExternalLink className="size-3" /></a>
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Approvals (all-time)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.approvals}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Workflow runs</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.workflowRuns}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Outbound sends</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.sends}</div></CardContent>
        </Card>
      </div>
    </div>
  );
}
