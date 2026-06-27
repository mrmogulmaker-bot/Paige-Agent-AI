import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft, Star } from "lucide-react";
import { Pipeline, PipelineStage } from "@/lib/pipelines";

const STAGE_COLORS = ["#94a3b8", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];

export default function PipelineSettings() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [newPipelineName, setNewPipelineName] = useState("");

  useEffect(() => { load(); }, []);
  useEffect(() => { if (activeId) loadStages(activeId); }, [activeId]);

  const load = async () => {
    const { data } = await supabase.from("pipelines").select("*").order("is_default", { ascending: false }).order("name");
    setPipelines(data || []);
    if (data?.length && !activeId) setActiveId(data[0].id);
  };

  const loadStages = async (pid: string) => {
    const { data } = await supabase.from("pipeline_stages").select("*").eq("pipeline_id", pid).order("order_index");
    setStages((data as PipelineStage[]) || []);
  };

  const createPipeline = async () => {
    if (!newPipelineName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("pipelines").insert({
      name: newPipelineName.trim(),
      created_by: user?.id,
    }).select().single();
    if (error) return toast.error(error.message);
    // Default stages for new pipeline
    if (data) {
      await supabase.from("pipeline_stages").insert([
        { pipeline_id: data.id, label: "Lead", color: "#94a3b8", order_index: 1, probability: 10, stage_type: "open" },
        { pipeline_id: data.id, label: "Won", color: "#10b981", order_index: 2, probability: 100, stage_type: "won" },
        { pipeline_id: data.id, label: "Lost", color: "#ef4444", order_index: 3, probability: 0, stage_type: "lost" },
      ]);
    }
    setNewPipelineName("");
    await load();
    if (data) setActiveId(data.id);
    toast.success("Pipeline created");
  };

  const renamePipeline = async (id: string, name: string) => {
    const { error } = await supabase.from("pipelines").update({ name }).eq("id", id);
    if (error) return toast.error(error.message);
    setPipelines((p) => p.map((x) => x.id === id ? { ...x, name } : x));
  };

  const setDefault = async (id: string) => {
    await supabase.from("pipelines").update({ is_default: false }).neq("id", id);
    await supabase.from("pipelines").update({ is_default: true }).eq("id", id);
    await load();
    toast.success("Default pipeline updated");
  };

  const deletePipeline = async (id: string) => {
    const { error } = await supabase.from("pipelines").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await load();
    setActiveId(pipelines.find((p) => p.id !== id)?.id || "");
    toast.success("Pipeline deleted");
  };

  const addStage = async () => {
    if (!activeId) return;
    const nextIdx = (stages.length ? stages[stages.length - 1].order_index : 0) + 1;
    const { error } = await supabase.from("pipeline_stages").insert({
      pipeline_id: activeId,
      label: "New stage",
      order_index: nextIdx,
      color: STAGE_COLORS[stages.length % STAGE_COLORS.length],
      probability: 50,
      stage_type: "open",
    });
    if (error) return toast.error(error.message);
    loadStages(activeId);
  };

  const updateStage = async (id: string, patch: Partial<PipelineStage>) => {
    setStages((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
    const { error } = await supabase.from("pipeline_stages").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const moveStage = async (id: string, dir: -1 | 1) => {
    const idx = stages.findIndex((s) => s.id === id);
    const swap = stages[idx + dir];
    if (!swap) return;
    const a = stages[idx], b = swap;
    await Promise.all([
      supabase.from("pipeline_stages").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("pipeline_stages").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    loadStages(activeId);
  };

  const deleteStage = async (id: string) => {
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
    if (error) return toast.error("Stage in use — move deals first.");
    loadStages(activeId);
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/pipeline")}><ArrowLeft className="w-4 h-4 mr-1" /> Back to board</Button>
      </div>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Pipeline Settings</h1>
        <p className="text-sm text-muted-foreground">Build pipelines that match how you actually sell. Stages, probabilities, and win/lost rules are fully customizable.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Pipelines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pipelines.map((p) => (
            <div key={p.id} className={`flex items-center gap-2 p-2 rounded border ${p.id === activeId ? "border-accent bg-accent/5" : "border-border"}`}>
              <button onClick={() => setActiveId(p.id)} className="text-left flex-1">
                <div className="font-medium text-sm flex items-center gap-2">
                  {p.name}
                  {p.is_default && <Badge variant="outline" className="text-[10px]"><Star className="w-3 h-3 mr-1" />default</Badge>}
                </div>
              </button>
              {!p.is_default && (
                <Button size="sm" variant="ghost" onClick={() => setDefault(p.id)}>Set default</Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete pipeline "{p.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>You can't delete a pipeline that still has deals. Move or delete its deals first.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deletePipeline(p.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input placeholder="New pipeline name…" value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} />
            <Button onClick={createPipeline}><Plus className="w-4 h-4 mr-1" /> Create</Button>
          </div>
        </CardContent>
      </Card>

      {activeId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Stages</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Win probability powers your weighted forecast. Stage type controls auto-close behavior.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="w-56"
                value={pipelines.find((p) => p.id === activeId)?.name || ""}
                onChange={(e) => setPipelines((prev) => prev.map((p) => p.id === activeId ? { ...p, name: e.target.value } : p))}
                onBlur={(e) => renamePipeline(activeId, e.target.value)}
              />
              <Button size="sm" onClick={addStage}><Plus className="w-4 h-4 mr-1" />Stage</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {stages.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No stages yet — click "Stage" to add one.</p>}
            {stages.map((s, idx) => (
              <div key={s.id} className="grid grid-cols-12 gap-2 items-center p-2 border border-border rounded">
                <div className="col-span-1 flex flex-col">
                  <button disabled={idx === 0} onClick={() => moveStage(s.id, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                  <button disabled={idx === stages.length - 1} onClick={() => moveStage(s.id, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                </div>
                <Input className="col-span-4" value={s.label} onChange={(e) => setStages((prev) => prev.map((x) => x.id === s.id ? { ...x, label: e.target.value } : x))} onBlur={(e) => updateStage(s.id, { label: e.target.value })} />
                <div className="col-span-2 flex gap-1 flex-wrap">
                  {STAGE_COLORS.map((c) => (
                    <button key={c} onClick={() => updateStage(s.id, { color: c })} className={`w-5 h-5 rounded-full border-2 ${s.color === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} aria-label={c} />
                  ))}
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Win %</Label>
                  <Input type="number" min="0" max="100" value={s.probability} onChange={(e) => setStages((prev) => prev.map((x) => x.id === s.id ? { ...x, probability: Number(e.target.value) } : x))} onBlur={(e) => updateStage(s.id, { probability: Math.max(0, Math.min(100, Number(e.target.value))) })} className="h-8" />
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Type</Label>
                  <Select value={s.stage_type} onValueChange={(v) => updateStage(s.id, { stage_type: v as any })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 flex justify-end">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{s.label}"?</AlertDialogTitle>
                        <AlertDialogDescription>You can't delete a stage that still contains deals.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteStage(s.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
