import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useConfirm } from "@/hooks/useConfirm";

type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  due_date: string | null;
  created_at: string;
};

export function ContactTasksPanel({
  contactId,
  linkedUserId,
}: {
  contactId: string;
  linkedUserId: string | null;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const ownerId = linkedUserId; // tasks are scoped by user_id on the existing tasks table

  const load = async () => {
    if (!ownerId) { setTasks([]); return; }
    const { data } = await supabase
      .from("tasks").select("*").eq("user_id", ownerId)
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(100);
    setTasks((data as Task[]) || []);
  };

  useEffect(() => {
    load();
    if (!ownerId) return;
    const ch = supabase.channel(`contact_tasks:${contactId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${ownerId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [contactId, ownerId]);

  const add = async () => {
    if (!title.trim() || !ownerId) return;
    setBusy(true);
    const { error } = await supabase.from("tasks").insert({
      user_id: ownerId,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      status: "pending",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setTitle(""); setDescription(""); setDueDate("");
    toast.success("Task created");
  };

  const toggle = async (t: Task) => {
    const next = t.status === "completed" ? "pending" : "completed";
    const { error } = await supabase.from("tasks").update({ status: next }).eq("id", t.id);
    if (error) toast.error(error.message);
  };

  const remove = async (t: Task) => {
    const ok = await confirm({
      title: "Delete this task?",
      description: "It's removed for good — this can't be undone.",
      actionLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) toast.error(error.message);
  };

  if (!ownerId) {
    return (
      <Card><CardContent className="p-4 text-sm text-muted-foreground text-center py-6">
        Tasks become available once this contact has a linked portal account. Send them a portal invite from the Portal tab.
      </CardContent></Card>
    );
  }

  return (
    <Card><CardContent className="p-4 space-y-4">
      {confirmDialog}
      <div className="space-y-2 border-b pb-3">
        <Input placeholder="Task title…" value={title} onChange={e => setTitle(e.target.value)} />
        <Textarea placeholder="Description (optional)" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <div className="flex gap-2">
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-9 max-w-xs" />
          <Button onClick={add} disabled={!title.trim() || busy}>
            <Plus className="h-4 w-4 mr-1" /> Add task
          </Button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">No tasks yet.</div>
      ) : (
        <div className="space-y-2">
          {tasks.map(t => (
            <div key={t.id} className={`flex items-start gap-3 border border-border rounded p-3 text-sm ${t.status === "completed" ? "opacity-60" : ""}`}>
              <Checkbox checked={t.status === "completed"} onCheckedChange={() => toggle(t)} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${t.status === "completed" ? "line-through" : ""}`}>{t.title}</div>
                {t.description && <div className="text-muted-foreground text-xs mt-0.5">{t.description}</div>}
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="outline" className="text-[10px] capitalize">{t.status.replace("_", " ")}</Badge>
                  {t.due_date && (
                    <span className="text-[10px] text-muted-foreground">
                      Due {formatDistanceToNow(new Date(t.due_date), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(t)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </CardContent></Card>
  );
}
