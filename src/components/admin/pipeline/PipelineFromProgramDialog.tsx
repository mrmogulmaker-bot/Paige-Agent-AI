import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, Plus, X, Wand2 } from "lucide-react";
import { toast } from "sonner";

interface ProposedStage {
  label: string;
  probability: number;
  stage_type: "open" | "won" | "lost";
  rationale?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string | null;
  onCreated: (pipelineId: string) => void;
}

const STAGE_COLOR: Record<string, string> = { open: "#3b82f6", won: "#10b981", lost: "#ef4444" };
const OPEN_PALETTE = ["#94a3b8", "#3b82f6", "#8b5cf6", "#f59e0b", "#06b6d4"];

/**
 * Paige reads a tenant's program, proposes a pipeline tailored to it, and — on
 * the owner's approval — creates it via create_pipeline_with_stages (§8/§10).
 * The editable proposal card IS the propose→confirm gate; gold is spent only on
 * the final Create act.
 */
export function PipelineFromProgramDialog({ open, onOpenChange, tenantId, onCreated }: Props) {
  const [step, setStep] = useState<"source" | "review">("source");
  const [programText, setProgramText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [summary, setSummary] = useState("");
  const [name, setName] = useState("");
  const [stages, setStages] = useState<ProposedStage[]>([]);

  const reset = () => {
    setStep("source"); setProgramText(""); setSummary(""); setName(""); setStages([]);
    setDrafting(false); setCreating(false);
  };

  const close = (o: boolean) => { if (!o) reset(); onOpenChange(o); };

  const draft = async () => {
    if (programText.trim().length < 20) {
      toast.error("Give Paige a paragraph or more about your program to work from.");
      return;
    }
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("pipeline-suggest", {
        body: { program_text: programText, tenant_id: tenantId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const p = data as { program_summary: string; proposed_pipeline: { name: string; description: string; stages: ProposedStage[] } };
      setSummary(p.program_summary || "");
      setName(p.proposed_pipeline?.name || "Client Pipeline");
      setStages(p.proposed_pipeline?.stages || []);
      setStep("review");
    } catch (e: any) {
      toast.error(e?.message || "Paige couldn't draft a pipeline. Try adding more detail.");
    } finally {
      setDrafting(false);
    }
  };

  const setStage = (i: number, patch: Partial<ProposedStage>) =>
    setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeStage = (i: number) => setStages((prev) => prev.filter((_, idx) => idx !== i));
  const addStage = () =>
    setStages((prev) => [...prev, { label: "New stage", probability: 50, stage_type: "open" }]);

  const create = async () => {
    if (!tenantId) { toast.error("Select a workspace first."); return; }
    if (!name.trim()) { toast.error("Give the pipeline a name."); return; }
    if (stages.length < 2) { toast.error("A pipeline needs at least two stages."); return; }
    setCreating(true);
    try {
      const jsonbStages = stages.map((s, i) => ({
        label: s.label,
        color: s.stage_type === "won" || s.stage_type === "lost"
          ? STAGE_COLOR[s.stage_type]
          : OPEN_PALETTE[i % OPEN_PALETTE.length],
        order_index: i + 1,
        probability: s.probability,
        stage_type: s.stage_type,
      }));
      const { data, error } = await supabase.rpc("create_pipeline_with_stages", {
        _tenant_id: tenantId,
        _name: name.trim(),
        _stages: jsonbStages,
        _description: summary || null,
      });
      if (error) throw error;
      toast.success(`Paige built your "${name.trim()}" pipeline.`);
      onCreated(data as string);
      close(false);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't create the pipeline.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[hsl(var(--gold-dark))]" />
            Build a pipeline from your program
          </DialogTitle>
          <DialogDescription>
            {step === "source"
              ? "Paste or describe the program you run for clients. Paige reads it and drafts the stages that fit — you review before anything is created."
              : "Paige drafted these stages from your program. Edit anything, then create it."}
          </DialogDescription>
        </DialogHeader>

        {step === "source" ? (
          <div className="space-y-2 py-1">
            <Label htmlFor="program-text">Your program</Label>
            <Textarea
              id="program-text"
              value={programText}
              onChange={(e) => setProgramText(e.target.value)}
              rows={9}
              placeholder="e.g. A 12-week consulting engagement: discovery call, audit, strategy roadmap, implementation sprints, and a results review. Clients start as leads from my webinar…"
            />
            <p className="text-xs text-muted-foreground">
              The more you describe your phases and outcomes, the more tailored Paige's stages will be.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-1 max-h-[56vh] overflow-y-auto pr-1">
            {summary && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">What Paige sees: </span>{summary}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pipeline-name">Pipeline name</Label>
              <Input id="pipeline-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Stages</Label>
              {stages.map((s, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ background: s.stage_type === "won" || s.stage_type === "lost" ? STAGE_COLOR[s.stage_type] : OPEN_PALETTE[i % OPEN_PALETTE.length] }}
                    />
                    <Input
                      value={s.label}
                      onChange={(e) => setStage(i, { label: e.target.value })}
                      className="h-8 flex-1"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeStage(i)} aria-label="Remove stage">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 pl-4.5">
                    <Select value={s.stage_type} onValueChange={(v: any) => setStage(i, { stage_type: v })}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="won">Won</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number" min={0} max={100}
                        value={s.probability}
                        onChange={(e) => setStage(i, { probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                        className="h-8 w-20"
                      />
                      <span className="text-xs text-muted-foreground">% likely to close</span>
                    </div>
                  </div>
                  {s.rationale && <p className="text-xs text-muted-foreground pl-4.5">{s.rationale}</p>}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addStage} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Add stage
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "source" ? (
            <>
              <Button variant="ghost" onClick={() => close(false)} disabled={drafting}>Cancel</Button>
              <Button onClick={draft} disabled={drafting} className="gap-2">
                {drafting ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : <><Wand2 className="h-4 w-4" /> Draft with Paige</>}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("source")} disabled={creating}>Back</Button>
              <Button
                onClick={create}
                disabled={creating}
                className="bg-[hsl(var(--gold))] text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--gold))]/90 gap-2"
              >
                {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : "Create pipeline"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
