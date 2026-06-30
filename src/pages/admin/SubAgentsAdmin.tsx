import { useEffect, useState } from "react";
import { useSubAgents, usePaigeOrchestrator } from "@/hooks/usePaigeOrchestrator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Cloud, Cpu, Play, Search, Sparkles, Workflow, Wand2, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";

interface InvocationRow {
  id: string;
  subagent_slug: string;
  status: string;
  latency_ms: number | null;
  created_at: string;
  contact_id: string | null;
  error: string | null;
}

interface ProposalRow {
  id: string;
  proposed_slug: string;
  proposed_name: string;
  domain: string;
  description: string;
  rationale: string;
  runtime: "soft" | "local" | "langgraph";
  status: string;
  proposed_by_agent: string | null;
  created_at: string;
  review_notes: string | null;
}

interface QuotaRow {
  quota_date: string;
  proposals_count: number;
  soft_shipped: number;
  hard_shipped: number;
}

export default function SubAgentsAdmin() {
  const { agents, loading, refresh } = useSubAgents();
  const { invoke } = usePaigeOrchestrator();
  const [testContactId, setTestContactId] = useState("");
  const [testingSlug, setTestingSlug] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [invocations, setInvocations] = useState<InvocationRow[]>([]);

  const loadInvocations = async () => {
    const { data } = await supabase
      .from("paige_subagent_invocations")
      .select("id,subagent_slug,status,latency_ms,created_at,contact_id,error")
      .order("created_at", { ascending: false })
      .limit(50);
    setInvocations((data ?? []) as InvocationRow[]);
  };

  const toggleEnabled = async (slug: string, enabled: boolean) => {
    const { error } = await supabase
      .from("paige_subagents")
      .update({ enabled })
      .eq("slug", slug);
    if (error) toast.error(error.message);
    else {
      toast.success(`${slug} ${enabled ? "enabled" : "disabled"}`);
      refresh();
    }
  };

  const runTest = async (slug: string) => {
    if (!testContactId) {
      toast.error("Provide a Contact/Client ID to test against");
      return;
    }
    setTestingSlug(slug);
    setLastResult(null);
    const result = await invoke(slug, { contact_id: testContactId }, { contact_id: testContactId });
    setLastResult(result);
    setTestingSlug(null);
    if (result.ok) toast.success(`${slug} returned in ${result.latency_ms}ms`);
    else toast.error(result.error ?? "Sub-agent call failed");
    loadInvocations();
  };

  const runtimeIcon = (r: SubAgent["runtime"]) =>
    r === "local" ? <Cpu className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />;

  type SubAgent = (typeof agents)[number];

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> Paige Sub-Agent Console
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Specialist agents Paige delegates work to. Local agents run as Edge Functions;
            LangGraph agents dispatch through <code className="text-xs">paige-bridge</code>.
            Keeps Paige&apos;s context light and answers consistent.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>Refresh</Button>
      </header>

      <Tabs defaultValue="registry" className="w-full">
        <TabsList>
          <TabsTrigger value="registry">Registry</TabsTrigger>
          <TabsTrigger value="test">Test Console</TabsTrigger>
          <TabsTrigger value="activity" onClick={loadInvocations}>Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="space-y-3 mt-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (
            agents.map((a) => (
              <Card key={a.slug}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {a.name}
                        <Badge variant="outline" className="text-xs gap-1">
                          {runtimeIcon(a.runtime)} {a.runtime}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">{a.domain}</Badge>
                      </CardTitle>
                      <CardDescription className="text-sm">{a.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{a.enabled ? "Enabled" : "Disabled"}</span>
                      <Switch checked={!!a.enabled} onCheckedChange={(v) => toggleEnabled(a.slug, v)} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {a.triggers.slice(0, 6).map((t) => (
                      <Badge key={t} variant="outline" className="text-xs font-normal">
                        <Search className="h-3 w-3 mr-1" />{t}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Workflow className="h-3 w-3" />
                    <span>
                      {a.runtime === "local"
                        ? <>Edge: <code>{a.edge_function ?? "(unset)"}</code></>
                        : <>LangGraph: <code>{a.langgraph_graph ?? "(unset)"}</code></>}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="test" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoke a sub-agent</CardTitle>
              <CardDescription>Drop in a Client/Contact ID and fire any registered sub-agent against it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Contact / Client ID</label>
                <Input
                  value={testContactId}
                  onChange={(e) => setTestContactId(e.target.value)}
                  placeholder="uuid…"
                  className="mt-1.5 font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {agents.filter((a) => a.enabled).map((a) => (
                  <Button
                    key={a.slug}
                    variant="outline"
                    onClick={() => runTest(a.slug)}
                    disabled={testingSlug === a.slug || !testContactId}
                    className="justify-start"
                  >
                    <Play className="h-3.5 w-3.5 mr-2" />
                    {a.name}
                    {testingSlug === a.slug && <span className="ml-auto text-xs">…</span>}
                  </Button>
                ))}
              </div>
              {lastResult ? (
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[400px]">
                  {JSON.stringify(lastResult, null, 2)}
                </pre>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent invocations</CardTitle>
              <CardDescription>Last 50 sub-agent calls across the platform.</CardDescription>
            </CardHeader>
            <CardContent>
              {invocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invocations yet. Run a test or talk to Paige.</p>
              ) : (
                <div className="space-y-2">
                  {invocations.map((row) => (
                    <div key={row.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          variant={row.status === "succeeded" ? "default" : row.status === "failed" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {row.status}
                        </Badge>
                        <span className="font-medium truncate">{row.subagent_slug}</span>
                        {row.contact_id ? (
                          <span className="text-xs text-muted-foreground font-mono truncate hidden md:inline">{row.contact_id.slice(0, 8)}…</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span>{row.latency_ms ? `${row.latency_ms}ms` : "—"}</span>
                        <span>{new Date(row.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
