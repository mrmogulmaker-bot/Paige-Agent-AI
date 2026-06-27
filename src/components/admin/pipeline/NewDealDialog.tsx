import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pipeline, PipelineStage, dollarsToCents, logDealActivity } from "@/lib/pipelines";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipeline: Pipeline | null;
  stages: PipelineStage[];
  defaultStageId?: string | null;
  defaultContactId?: string | null;
  onCreated: () => void;
};

type ContactOption = { id: string; label: string };
type CoachOption = { user_id: string; name: string };

export function NewDealDialog({ open, onOpenChange, pipeline, stages, defaultStageId, defaultContactId, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [stageId, setStageId] = useState<string>("");
  const [contactId, setContactId] = useState<string>("none");
  const [ownerId, setOwnerId] = useState<string>("me");
  const [value, setValue] = useState<string>("");
  const [closeDate, setCloseDate] = useState<string>("");
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMeId(user?.id ?? null);
      const [{ data: cs }, { data: roles }] = await Promise.all([
        supabase.from("clients").select("id, first_name, last_name, entity_name").order("created_at", { ascending: false }).limit(200),
        supabase.from("user_roles").select("user_id").eq("role", "coach"),
      ]);
      setContacts((cs || []).map((c: any) => ({
        id: c.id,
        label: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() + (c.entity_name ? ` · ${c.entity_name}` : ""),
      })));
      const coachIds = (roles || []).map((r: any) => r.user_id);
      if (coachIds.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", coachIds);
        setCoaches((profs || []).map((p: any) => ({ user_id: p.user_id, name: p.full_name || "Unnamed Coach" })));
      } else {
        setCoaches([]);
      }
      setStageId(defaultStageId || stages[0]?.id || "");
      setTitle("");
      setContactId(defaultContactId || "none");
      setOwnerId("me");
      setValue("");
      setCloseDate("");
    })();
  }, [open, defaultStageId, stages, defaultContactId]);

  const orderedStages = useMemo(() => [...stages].sort((a, b) => a.order_index - b.order_index), [stages]);

  const handleSave = async () => {
    if (!pipeline || !stageId || !title.trim()) {
      toast.error("Title and stage are required");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const resolvedOwner = ownerId === "me" ? user?.id : ownerId === "none" ? null : ownerId;
    const { data, error } = await supabase
      .from("deals")
      .insert({
        title: title.trim(),
        pipeline_id: pipeline.id,
        stage_id: stageId,
        contact_client_id: contactId === "none" ? null : contactId,
        owner_user_id: resolvedOwner ?? null,
        value_cents: dollarsToCents(value || "0"),
        expected_close_date: closeDate || null,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (data) await logDealActivity(data.id, "deal_created", `Deal created in ${pipeline.name}`);
    toast.success("Deal created");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Deal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Acme SBA Loan" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Stage</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue placeholder="Pick stage" /></SelectTrigger>
                <SelectContent>
                  {orderedStages.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Value ($)</Label>
              <Input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder="50000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contact</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">— None —</SelectItem>
                  {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.label || "Unnamed"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Me</SelectItem>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {coaches.filter((c) => c.user_id !== meId).map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Expected close date</Label>
            <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Create deal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
