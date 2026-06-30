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
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [quota, setQuota] = useState<QuotaRow | null>(null);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeBusy, setForgeBusy] = useState(false);
  const [forge, setForge] = useState({
    slug: "", name: "", domain: "ops", description: "", rationale: "",
    runtime: "soft" as "soft" | "local" | "langgraph",
    system_prompt: "", triggers: "",
  });

  const loadInvocations = async () => {
    const { data } = await supabase
      .from("paige_subagent_invocations")
      .select("id,subagent_slug,status,latency_ms,created_at,contact_id,error")
      .order("created_at", { ascending: false })
      .limit(50);
    setInvocations((data ?? []) as InvocationRow[]);
  };

  const loadProposals = async () => {
    const { data: r } = await supabase.functions.invoke("subagent-forge", {
      body: { action: "list" },
    });
    setProposals((r?.proposals ?? []) as ProposalRow[]);
    setQuota((r?.quota ?? null) as QuotaRow | null);
  };

  useEffect(() => { loadProposals(); }, []);

  const submitForge = async () => {
    if (!forge.slug || !forge.name || !forge.system_prompt || !forge.rationale) {
      toast.error("slug, name, rationale, and system_prompt are required");
      return;
    }
    setForgeBusy(true);
    const { data, error } = await supabase.functions.invoke("subagent-forge", {
      body: {
        action: "propose",
        ...forge,
        triggers: forge.triggers.split(",").map(s => s.trim()).filter(Boolean),
      },
    });
    setForgeBusy(false);
    if (error || !data?.ok) {
      toast.error(error?.message ?? data?.error ?? "Proposal failed");
      return;
    }
    toast.success(forge.runtime === "soft" ? "Soft sub-agent is live" : "Hard proposal routed to Approvals");
    setForgeOpen(false);
    setForge({ slug: "", name: "", domain: "ops", description: "", rationale: "", runtime: "soft", system_prompt: "", triggers: "" });
    refresh();
    loadProposals();
  };

  const approveProposal = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("subagent-forge", {
      body: { action: "approve", proposal_id: id },
    });
    if (error || !data?.ok) toast.error(error?.message ?? data?.error ?? "Approve failed");
    else { toast.success("Sub-agent is live"); refresh(); loadProposals(); }
  };

  const rejectProposal = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("subagent-forge", {
      body: { action: "reject", proposal_id: id, notes: "Rejected from admin console" },
    });
    if (error || !data?.ok) toast.error(error?.message ?? data?.error ?? "Reject failed");
    else { toast.success("Proposal rejected"); loadProposals(); }
  };

  const toggleEnabled = async (slug: string, enabled: boolean) => {
    const { error } = await supabase
      .from("paige_subagents")
      .update({ enabled })
      .eq("slug", slug);
    if (error) toast.error(error.message);
    else { toast.success(`${slug} ${enabled ? "enabled" : "disabled"}`); refresh(); }
  };

  const runTest = async (slug: string) => {
    if (!testContactId) { toast.error("Provide a Contact/Client ID to test against"); return; }
    setTestingSlug(slug);
    setLastResult(null);
    const result = await invoke(slug, { contact_id: testContactId }, { contact_id: testContactId });
    setLastResult(result);
    setTestingSlug(null);
    if (result.ok) toast.success(`${slug} returned in ${result.latency_ms}ms`);
    else toast.error(result.error ?? "Sub-agent call failed");
    loadInvocations();
  };

  type SubAgent = (typeof agents)[number];
  const runtimeIcon = (r: SubAgent["runtime"]) =>
    r === "local" ? <Cpu className="h-3.5 w-3.5" /> :
    r === "soft" ? <Sparkles className="h-3.5 w-3.5" /> :
    <Cloud className="h-3.5 w-3.5" />;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> Paige Sub-Agent Console
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Specialist agents Paige delegates work to. <strong>Soft</strong> agents are prompt-only and Paige can ship them autonomously.
            <strong> Hard</strong> agents (local edge functions, LangGraph) require admin approval.
          </p>
          {quota ? (
            <p className="text-xs text-muted-foreground mt-2">
              Today: {quota.proposals_count}/10 proposals · {quota.soft_shipped} soft shipped · {quota.hard_shipped} hard shipped
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Dialog open={forgeOpen} onOpenChange={setForgeOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Wand2 className="h-4 w-4" /> Forge Sub-Agent</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Forge a New Sub-Agent</DialogTitle>
                <DialogDescription>
                  Soft agents ship live immediately. Hard agents (local / LangGraph) route to Approvals for admin sign-off because they require new code.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-1">
                  <label className="text-xs font-medium">Slug</label>
                  <Input value={forge.slug} onChange={(e) => setForge({ ...forge, slug: e.target.value.toLowerCase() })} placeholder="churn-risk-scout" className="font-mono text-xs" />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-medium">Name</label>
                  <Input value={forge.name} onChange={(e) => setForge({ ...forge, name: e.target.value })} placeholder="Churn Risk Scout" />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-medium">Domain</label>
                  <Select value={forge.domain} onValueChange={(v) => setForge({ ...forge, domain: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["fundability","compliance","credit","funding","research","outreach","intake","sales","coaching","ops","support","marketing","analytics","automation"].map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-medium">Runtime</label>
                  <Select value={forge.runtime} onValueChange={(v) => setForge({ ...forge, runtime: v as "soft" | "local" | "langgraph" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="soft">Soft (ships instantly)</SelectItem>
                      <SelectItem value="local">Local edge function (needs approval)</SelectItem>
                      <SelectItem value="langgraph">LangGraph (needs approval)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium">Description (≥20 chars)</label>
                  <Input value={forge.description} onChange={(e) => setForge({ ...forge, description: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium">Why this agent? (≥20 chars — admins read this)</label>
                  <Textarea value={forge.rationale} onChange={(e) => setForge({ ...forge, rationale: e.target.value })} rows={2} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium">System Prompt (≥50 chars)</label>
                  <Textarea value={forge.system_prompt} onChange={(e) => setForge({ ...forge, system_prompt: e.target.value })} rows={6} placeholder="You are a Churn Risk Scout. Given a client's recent activity, identify churn signals..." />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium">Triggers (comma-separated)</label>
                  <Input value={forge.triggers} onChange={(e) => setForge({ ...forge, triggers: e.target.value })} placeholder="churn, at risk, silent client" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setForgeOpen(false)}>Cancel</Button>
                <Button onClick={submitForge} disabled={forgeBusy}>{forgeBusy ? "Forging…" : "Submit"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={() => { refresh(); loadProposals(); }}>Refresh</Button>
        </div>
      </header>

      <Tabs defaultValue="registry" className="w-full">
        <TabsList>
          <TabsTrigger value="registry">Registry</TabsTrigger>
          <TabsTrigger value="proposals" onClick={loadProposals}>
            Proposals {proposals.filter(p => p.status === "proposed").length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">{proposals.filter(p => p.status === "proposed").length}</Badge>
            )}
          </TabsTrigger>
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
                      <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                        {a.name}
                        <Badge variant="outline" className="text-xs gap-1">
                          {runtimeIcon(a.runtime)} {a.runtime}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">{a.domain}</Badge>
                        {a.auto_generated ? (
                          <Badge className="text-[10px] bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200">
                            <Sparkles className="h-3 w-3 mr-1" /> Auto-generated
                          </Badge>
                        ) : null}
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
                        : a.runtime === "soft"
                        ? <>Soft (prompt-only)</>
                        : <>LangGraph: <code>{a.langgraph_graph ?? "(unset)"}</code></>}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="proposals" className="space-y-3 mt-4">
          {proposals.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
              No proposals yet. Use <strong>Forge Sub-Agent</strong> or let Paige propose one autonomously via the MCP <code>propose_subagent</code> tool.
            </CardContent></Card>
          ) : proposals.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {p.proposed_name}
                      <code className="text-xs text-muted-foreground">{p.proposed_slug}</code>
                      <Badge variant="outline" className="text-xs">{p.runtime}</Badge>
                      <Badge variant="secondary" className="text-xs">{p.domain}</Badge>
                      {p.status === "proposed" ? <Badge className="text-[10px] bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100"><ShieldAlert className="h-3 w-3 mr-1" /> Awaiting approval</Badge>
                        : p.status === "approved" || p.status === "shipped" ? <Badge className="text-[10px] bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" /> {p.status}</Badge>
                        : <Badge className="text-[10px] bg-rose-100 text-rose-900 border-rose-200 hover:bg-rose-100"><XCircle className="h-3 w-3 mr-1" /> {p.status}</Badge>}
                    </CardTitle>
                    <CardDescription className="text-sm">{p.description}</CardDescription>
                  </div>
                  {p.status === "proposed" ? (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => rejectProposal(p.id)}>Reject</Button>
                      <Button size="sm" onClick={() => approveProposal(p.id)}>Approve & Ship</Button>
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="text-xs"><span className="text-muted-foreground">Rationale: </span>{p.rationale}</div>
                {p.proposed_by_agent ? (
                  <div className="text-xs text-muted-foreground">Proposed by <code>{p.proposed_by_agent}</code> · {new Date(p.created_at).toLocaleString()}</div>
                ) : (
                  <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</div>
                )}
                {p.review_notes ? <div className="text-xs text-rose-700">Notes: {p.review_notes}</div> : null}
              </CardContent>
            </Card>
          ))}
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
