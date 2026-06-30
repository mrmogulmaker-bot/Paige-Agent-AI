import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Play, Power, ShieldAlert, Activity } from "lucide-react";

interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  risk_level: string;
  status: string;
  created_by: string;
  run_count: number;
  success_count: number;
  trigger_phrases: string[];
  require_admin_confirm_first_n: number;
}

interface SkillRun {
  id: string;
  skill_slug: string;
  status: string;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

interface Proposal {
  id: string;
  proposed_slug: string;
  proposed_name: string;
  description: string | null;
  risk_level: string;
  status: string;
  rationale: string | null;
  created_at: string;
}

const riskColor = (r: string) =>
  r === "read_only" ? "bg-emerald-500/10 text-emerald-700"
  : r === "draft" ? "bg-blue-500/10 text-blue-700"
  : r === "mutating" ? "bg-amber-500/10 text-amber-700"
  : "bg-rose-500/10 text-rose-700";

export default function SkillsHub() {
  const { toast } = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [runs, setRuns] = useState<SkillRun[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [forgeIntent, setForgeIntent] = useState("");
  const [forging, setForging] = useState(false);
  const [search, setSearch] = useState("");

  const refresh = async () => {
    setLoading(true);
    const [{ data: s }, { data: r }, { data: p }] = await Promise.all([
      supabase.from("paige_skills").select("*").order("created_at", { ascending: false }),
      supabase.from("paige_skill_runs").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("paige_skill_proposals").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setSkills((s ?? []) as Skill[]);
    setRuns((r ?? []) as SkillRun[]);
    setProposals((p ?? []) as Proposal[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const toggle = async (skill: Skill) => {
    const next = skill.status === "active" ? "disabled" : "active";
    const { error } = await supabase.from("paige_skills").update({ status: next }).eq("id", skill.id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: `Skill ${next}` });
    refresh();
  };

  const testRun = async (skill: Skill) => {
    const { data, error } = await supabase.functions.invoke("skill-runner", {
      body: { skill_slug: skill.slug, invoker_kind: "admin", inputs: {} },
    });
    if (error) return toast({ title: "Run failed", description: error.message, variant: "destructive" });
    toast({ title: "Run started", description: `Status: ${(data as { status?: string })?.status ?? "unknown"}` });
    refresh();
  };

  const forge = async () => {
    if (!forgeIntent.trim()) return;
    setForging(true);
    const { data, error } = await supabase.functions.invoke("skill-forge", {
      body: { intent: forgeIntent, rationale: "Manual forge from Skills Hub" },
    });
    setForging(false);
    if (error) return toast({ title: "Forge failed", description: error.message, variant: "destructive" });
    toast({ title: "Skill drafted + published", description: (data as { slug?: string })?.slug ?? "" });
    setForgeIntent("");
    refresh();
  };

  const filtered = useMemo(
    () => skills.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.slug.includes(search.toLowerCase())),
    [skills, search],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-amber-500" /> Skills Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Reusable recipes Paige can execute. She can propose new ones autonomously — high-risk skills require admin confirm on the first 3 runs.
          </p>
        </div>
        <Badge variant="outline" className="text-sm">{skills.filter(s => s.status === "active").length} active</Badge>
      </div>

      <Tabs defaultValue="skills">
        <TabsList>
          <TabsTrigger value="skills">Skills ({skills.length})</TabsTrigger>
          <TabsTrigger value="runs">Recent Runs ({runs.length})</TabsTrigger>
          <TabsTrigger value="proposals">Proposals ({proposals.length})</TabsTrigger>
          <TabsTrigger value="forge">Forge New Skill</TabsTrigger>
        </TabsList>

        <TabsContent value="skills" className="space-y-3">
          <Input placeholder="Search skills…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          {loading ? <p className="text-muted-foreground">Loading…</p> : filtered.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{s.name}</h3>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{s.slug}</code>
                    <Badge className={riskColor(s.risk_level)}>{s.risk_level}</Badge>
                    <Badge variant="outline">{s.category}</Badge>
                    {s.created_by === "paige" && <Badge className="bg-purple-500/10 text-purple-700">Paige-authored</Badge>}
                    {s.require_admin_confirm_first_n > 0 && s.run_count < s.require_admin_confirm_first_n && (
                      <Badge className="bg-amber-500/10 text-amber-700 gap-1"><ShieldAlert className="h-3 w-3" /> {s.require_admin_confirm_first_n - s.run_count} confirms left</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {s.run_count} runs · {s.success_count} successes · triggers: {s.trigger_phrases.slice(0, 2).join(" | ") || "—"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <div className="flex items-center gap-2 text-xs">
                    <Switch checked={s.status === "active"} onCheckedChange={() => toggle(s)} />
                    <span>{s.status}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => testRun(s)} className="gap-1">
                    <Play className="h-3 w-3" /> Test
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="runs" className="space-y-2">
          {runs.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <code className="text-xs">{r.skill_slug}</code>
                  <Badge variant={r.status === "succeeded" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                  {r.duration_ms !== null && <span className="text-xs text-muted-foreground">{r.duration_ms}ms</span>}
                </div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
              </CardContent>
              {r.error && <CardContent className="px-3 pb-3 text-xs text-destructive">{r.error}</CardContent>}
            </Card>
          ))}
          {runs.length === 0 && <p className="text-muted-foreground text-sm">No runs yet.</p>}
        </TabsContent>

        <TabsContent value="proposals" className="space-y-2">
          {proposals.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <strong>{p.proposed_name}</strong>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.proposed_slug}</code>
                  <Badge className={riskColor(p.risk_level)}>{p.risk_level}</Badge>
                  <Badge variant="outline">{p.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                {p.rationale && <p className="text-xs text-muted-foreground mt-1 italic">Why: {p.rationale}</p>}
              </CardContent>
            </Card>
          ))}
          {proposals.length === 0 && <p className="text-muted-foreground text-sm">No proposals yet.</p>}
        </TabsContent>

        <TabsContent value="forge" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Forge a new skill</CardTitle>
              <p className="text-sm text-muted-foreground">Describe what Paige should be able to do. She'll draft a structured skill, slot in the right tools, and auto-publish.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="e.g. When a client passes their MyFICO check, scrape three competitor lender sites and draft a comparison brief."
                value={forgeIntent}
                onChange={(e) => setForgeIntent(e.target.value)}
                rows={4}
              />
              <Button onClick={forge} disabled={forging || !forgeIntent.trim()} className="gap-2">
                <Sparkles className="h-4 w-4" /> {forging ? "Drafting…" : "Forge skill"}
              </Button>
              <p className="text-xs text-muted-foreground">Read-only/draft skills publish live immediately. Mutating + external-send skills require admin confirm on the first 3 runs.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
