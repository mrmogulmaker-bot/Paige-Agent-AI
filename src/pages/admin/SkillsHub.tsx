import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  PageShell,
  PageHeader,
  StatRow,
  StatTile,
  SectionCard,
  DataTableShell,
  EmptyState,
  StatePill,
} from "@/components/ui/page";
import { Blocks, Play, ShieldAlert, Activity, Lightbulb, Wand2, Search } from "lucide-react";

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

// Risk levels rendered on semantic status tokens (AA in light + dark), never
// the old light-only bg-emerald/amber/rose soup. read-only is safe (success),
// mutating is caution (warning), external/high is danger (destructive).
const RISK_META: Record<string, { label: string; cls: string }> = {
  read_only: { label: "Read-only", cls: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]" },
  draft: { label: "Draft", cls: "bg-primary/10 text-primary" },
  mutating: { label: "Mutating", cls: "bg-[hsl(var(--warning)/0.18)] text-[hsl(var(--warning))]" },
};

function RiskBadge({ risk }: { risk: string }) {
  const meta =
    RISK_META[risk] ??
    { label: risk.replace(/_/g, " "), cls: "bg-destructive/15 text-destructive" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

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

  const activeCount = skills.filter((s) => s.status === "active").length;

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        eyebrow="Paige Skills"
        title="Skills Hub"
        description="Reusable recipes Paige can run on demand. She proposes new ones on her own — high-risk skills wait for your confirm on the first three runs."
      />

      <StatRow cols={4}>
        <StatTile label="Skills" value={skills.length} icon={Blocks} loading={loading} />
        <StatTile label="Active" value={activeCount} icon={Activity} loading={loading} hint="live and callable" />
        <StatTile label="Recent runs" value={runs.length} icon={Play} loading={loading} />
        <StatTile label="Proposals" value={proposals.length} icon={Lightbulb} loading={loading} />
      </StatRow>

      <Tabs defaultValue="skills">
        <TabsList>
          <TabsTrigger value="skills">Skills ({skills.length})</TabsTrigger>
          <TabsTrigger value="runs">Recent Runs ({runs.length})</TabsTrigger>
          <TabsTrigger value="proposals">Proposals ({proposals.length})</TabsTrigger>
          <TabsTrigger value="forge">Forge New Skill</TabsTrigger>
        </TabsList>

        <TabsContent value="skills" className="space-y-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search skills…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-[var(--radius)]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <SectionCard>
              <EmptyState
                icon={Blocks}
                title={search ? "Nothing matches that search" : "No skills yet"}
                description={
                  search
                    ? "Try a different name or slug."
                    : "Forge Paige's first skill and it will show up here, ready to run."
                }
                tone="brand"
              />
            </SectionCard>
          ) : (
            filtered.map((s, i) => (
              <SectionCard
                key={s.id}
                numbered={i + 1}
                icon={Blocks}
                interactive
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {s.name}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal">{s.slug}</code>
                    <RiskBadge risk={s.risk_level} />
                    <MetaPill>{s.category}</MetaPill>
                    {s.created_by === "paige" && <MetaPill>Paige-authored</MetaPill>}
                    {s.require_admin_confirm_first_n > 0 && s.run_count < s.require_admin_confirm_first_n && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--warning)/0.18)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--warning))]">
                        <ShieldAlert className="h-3 w-3" /> {s.require_admin_confirm_first_n - s.run_count} confirms left
                      </span>
                    )}
                  </span>
                }
                description={s.description ?? undefined}
                actions={
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={s.status === "active"} onCheckedChange={() => toggle(s)} />
                      <StatePill state={s.status === "active" ? "on" : "off"} />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => testRun(s)} className="gap-1">
                      <Play className="h-3 w-3" /> Test
                    </Button>
                  </div>
                }
              >
                <p className="text-xs text-muted-foreground">
                  {s.run_count} runs · {s.success_count} successes · triggers: {s.trigger_phrases.slice(0, 2).join(" | ") || "—"}
                </p>
              </SectionCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="runs" className="space-y-3">
          <DataTableShell
            columns={[
              { key: "skill", header: "Skill" },
              { key: "status", header: "Status" },
              { key: "duration", header: "Duration", numeric: true },
              { key: "when", header: "When", numeric: true },
            ]}
            loading={loading}
            isEmpty={runs.length === 0}
            empty={
              <EmptyState
                icon={Activity}
                title="No runs yet"
                description="Once Paige runs a skill, every execution lands here with its status and timing."
              />
            }
          >
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <code className="text-xs">{r.skill_slug}</code>
                  {r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}
                </TableCell>
                <TableCell>
                  <StatePill
                    state={r.status === "succeeded" ? "success" : r.status === "failed" ? "error" : "pending"}
                  >
                    {r.status}
                  </StatePill>
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                  {r.duration_ms !== null ? `${r.duration_ms}ms` : "—"}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </DataTableShell>
        </TabsContent>

        <TabsContent value="proposals" className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-[var(--radius)]" />
              ))}
            </div>
          ) : proposals.length === 0 ? (
            <SectionCard>
              <EmptyState
                icon={Lightbulb}
                title="No proposals yet"
                description="When Paige spots a recipe worth adding, she'll pitch it here for your review."
              />
            </SectionCard>
          ) : (
            proposals.map((p) => (
              <SectionCard
                key={p.id}
                icon={Lightbulb}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {p.proposed_name}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal">{p.proposed_slug}</code>
                    <RiskBadge risk={p.risk_level} />
                    <MetaPill>{p.status}</MetaPill>
                  </span>
                }
                description={p.description ?? undefined}
              >
                {p.rationale && (
                  <p className="text-xs italic text-muted-foreground">Why: {p.rationale}</p>
                )}
              </SectionCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="forge" className="space-y-3">
          <SectionCard
            icon={Wand2}
            title="Forge a new skill"
            description="Describe what Paige should be able to do. She drafts a structured skill, slots in the right tools, and publishes it."
          >
            <div className="space-y-3">
              <Textarea
                placeholder="e.g. When a client finishes onboarding, pull their last three sessions and draft a check-in the coach can send."
                value={forgeIntent}
                onChange={(e) => setForgeIntent(e.target.value)}
                rows={4}
              />
              <Button variant="gold" onClick={forge} disabled={forging || !forgeIntent.trim()} className="gap-2">
                <Wand2 className="h-4 w-4" /> {forging ? "Drafting…" : "Forge skill"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Read-only and draft skills publish live right away. Skills that change data or send externally wait for your confirm on the first three runs.
              </p>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
