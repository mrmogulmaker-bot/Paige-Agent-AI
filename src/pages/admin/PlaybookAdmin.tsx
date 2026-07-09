/**
 * Playbook editor — where a tenant AUTHORS their Paige (roadmap #1, doctrine §7).
 *
 * Loads the tenant's active (resolved) Playbook, lets an admin edit the persona,
 * quick actions, probing questions, client journey, intake, and portal modules,
 * and saves the whole thing to tenants.features.playbook_config via the
 * set_tenant_playbook RPC (the same seam Paige uses — §10). "Start from a preset"
 * seeds the form from a vertical in the starter library. The read side
 * (resolveActivePlaybook + every consumer) already exists, so saving here makes
 * the tenant's Paige native to their practice with no code change downstream.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { resolveActivePlaybook } from "@/lib/playbook/resolve";
import { PLAYBOOK_LIBRARY } from "@/lib/playbook/presets";
import type { Playbook, IntakeField } from "@/lib/playbook/types";
import { toast } from "sonner";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";

const INTAKE_TYPES: IntakeField["type"][] = ["text", "longtext", "select", "number", "date", "phone", "address"];

function RowShell({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md border p-3">
      <div className="flex-1 min-w-0 space-y-2">{children}</div>
      <Button variant="ghost" size="icon" className="text-muted-foreground shrink-0" onClick={onRemove} aria-label="Remove">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function PlaybookAdmin() {
  const { activeTenantId, activeTenant } = useTenantContext();
  const [pb, setPb] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let on = true;
    resolveActivePlaybook().then((p) => { if (on) { setPb(structuredClone(p)); setLoading(false); } });
    return () => { on = false; };
  }, [activeTenantId]);

  const applyPreset = (slug: string) => {
    const preset = PLAYBOOK_LIBRARY.find((p) => p.slug === slug);
    if (preset) { setPb(structuredClone(preset)); toast.info(`Loaded the "${preset.name}" starter — edit and save to make it yours.`); }
  };

  // Generic patch helpers keep the JSX terse.
  const patch = (fn: (d: Playbook) => void) => setPb((prev) => { if (!prev) return prev; const next = structuredClone(prev); fn(next); return next; });

  const save = async () => {
    if (!activeTenantId || !pb) return;
    if (!pb.persona.name.trim() || !pb.persona.greeting.trim()) {
      toast.error("Paige needs at least a name and a greeting.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_tenant_playbook", {
        _tenant_id: activeTenantId,
        _config: pb as unknown as Record<string, never>,
      });
      if (error) throw error;
      toast.success("Paige's playbook saved — she's now native to your practice.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the playbook");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !pb) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground p-8 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading your Paige…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Your Paige
          </h1>
          <p className="text-sm text-muted-foreground">
            Author how Paige shows up for {activeTenant?.name ?? "your"} clients — her persona, questions,
            journey, and portal. This is what makes her native to your practice.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select onValueChange={applyPreset}>
            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Start from a preset" /></SelectTrigger>
            <SelectContent>
              {PLAYBOOK_LIBRARY.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      {/* Persona */}
      <Card>
        <CardHeader><CardTitle className="text-base">Persona</CardTitle>
          <CardDescription>Who Paige is, from your client's standpoint.</CardDescription></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Name</Label>
            <Input value={pb.persona.name} onChange={(e) => patch((d) => { d.persona.name = e.target.value; })} placeholder="Paige" /></div>
          <div className="space-y-1.5"><Label>Role</Label>
            <Input value={pb.persona.role} onChange={(e) => patch((d) => { d.persona.role = e.target.value; })} placeholder="your coach's assistant" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Opening greeting</Label>
            <Textarea rows={2} value={pb.persona.greeting} onChange={(e) => patch((d) => { d.persona.greeting = e.target.value; })} /></div>
          <div className="space-y-1.5"><Label>Tone</Label>
            <Input value={pb.persona.tone} onChange={(e) => patch((d) => { d.persona.tone = e.target.value; })} placeholder="warm, direct, encouraging" /></div>
          <div className="space-y-1.5"><Label>Domain of expertise</Label>
            <Input value={pb.persona.domain} onChange={(e) => patch((d) => { d.persona.domain = e.target.value; })} placeholder="business consulting" /></div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Quick actions</CardTitle>
          <CardDescription>One-tap prompts shown in the client chat.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {pb.quickActions.map((q, i) => (
            <RowShell key={i} onRemove={() => patch((d) => { d.quickActions.splice(i, 1); })}>
              <div className="grid sm:grid-cols-2 gap-2">
                <Input value={q.label} placeholder="Button label" onChange={(e) => patch((d) => { d.quickActions[i].label = e.target.value; })} />
                <Input value={q.prompt} placeholder="What it asks Paige" onChange={(e) => patch((d) => { d.quickActions[i].prompt = e.target.value; })} />
              </div>
            </RowShell>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch((d) => { d.quickActions.push({ label: "", prompt: "" }); })}>
            <Plus className="w-4 h-4 mr-1" /> Add quick action
          </Button>
        </CardContent>
      </Card>

      {/* Probing questions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Probing questions</CardTitle>
          <CardDescription>How Paige discovers what each client needs, in her voice.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {pb.probingQuestions.map((q, i) => (
            <RowShell key={i} onRemove={() => patch((d) => { d.probingQuestions.splice(i, 1); })}>
              <Input value={q.ask} placeholder="How she asks it" onChange={(e) => patch((d) => { d.probingQuestions[i].ask = e.target.value; })} />
              <Input value={q.captures} placeholder="What it captures (e.g. primary_goal)" onChange={(e) => patch((d) => { d.probingQuestions[i].captures = e.target.value; })} />
            </RowShell>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch((d) => { d.probingQuestions.push({ id: slugify(String(d.probingQuestions.length + 1)), ask: "", captures: "" }); })}>
            <Plus className="w-4 h-4 mr-1" /> Add question
          </Button>
        </CardContent>
      </Card>

      {/* Journey */}
      <Card>
        <CardHeader><CardTitle className="text-base">Client journey</CardTitle>
          <CardDescription>The stages a client moves through with you.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {pb.journey.map((s, i) => (
            <RowShell key={i} onRemove={() => patch((d) => { d.journey.splice(i, 1); })}>
              <div className="grid sm:grid-cols-2 gap-2">
                <Input value={s.label} placeholder="Stage name" onChange={(e) => patch((d) => { d.journey[i].label = e.target.value; d.journey[i].key = slugify(e.target.value); })} />
                <Input value={s.description} placeholder="What happens here" onChange={(e) => patch((d) => { d.journey[i].description = e.target.value; })} />
              </div>
            </RowShell>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch((d) => { d.journey.push({ key: "", label: "", description: "" }); })}>
            <Plus className="w-4 h-4 mr-1" /> Add stage
          </Button>
        </CardContent>
      </Card>

      {/* Intake */}
      <Card>
        <CardHeader><CardTitle className="text-base">Intake</CardTitle>
          <CardDescription>What a new client answers when they join.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {pb.intake.map((f, i) => (
            <RowShell key={i} onRemove={() => patch((d) => { d.intake.splice(i, 1); })}>
              <div className="grid sm:grid-cols-[1fr_140px] gap-2">
                <Input value={f.label} placeholder="Question label" onChange={(e) => patch((d) => { d.intake[i].label = e.target.value; if (!d.intake[i].key) d.intake[i].key = slugify(e.target.value); })} />
                <Select value={f.type} onValueChange={(v) => patch((d) => { d.intake[i].type = v as IntakeField["type"]; })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INTAKE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {f.type === "select" && (
                <Input value={(f.options ?? []).join(", ")} placeholder="Options, comma-separated"
                  onChange={(e) => patch((d) => { d.intake[i].options = e.target.value.split(",").map((o) => o.trim()).filter(Boolean); })} />
              )}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={!!f.required} onCheckedChange={(v) => patch((d) => { d.intake[i].required = v; })} /> Required
              </label>
            </RowShell>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch((d) => { d.intake.push({ key: "", label: "", type: "text" }); })}>
            <Plus className="w-4 h-4 mr-1" /> Add field
          </Button>
        </CardContent>
      </Card>

      {/* Portal modules */}
      <Card>
        <CardHeader><CardTitle className="text-base">Portal modules</CardTitle>
          <CardDescription>The sections your clients see in their portal, in order.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {pb.portal.modules.map((m, i) => (
            <RowShell key={i} onRemove={() => patch((d) => { d.portal.modules.splice(i, 1); })}>
              <Input value={m.label} placeholder="Module name" onChange={(e) => patch((d) => { d.portal.modules[i].label = e.target.value; d.portal.modules[i].key = slugify(e.target.value); })} />
            </RowShell>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch((d) => { d.portal.modules.push({ key: "", label: "" }); })}>
            <Plus className="w-4 h-4 mr-1" /> Add module
          </Button>
        </CardContent>
      </Card>

      <Separator />
      <div className="flex justify-end pb-8">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save your Paige
        </Button>
      </div>
    </div>
  );
}
