import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckSquare, Clock, Plus, Pencil, Trash2, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";

type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  track: string | null;
  deal_id: string | null;
  created_at: string;
};

const STATUS_OPTS: TaskStatus[] = ["pending", "in_progress", "completed", "cancelled"];

export default function TasksAdmin() {
  const [meId, setMeId] = useState<string | null>(null);
  const [mine, setMine] = useState<TaskRow[]>([]);
  const [all, setAll] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  // editor dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fStatus, setFStatus] = useState<TaskStatus>("pending");
  const [fTrack, setFTrack] = useState("");
  const [fDue, setFDue] = useState("");
  const [fOwner, setFOwner] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setMeId(user?.id || null);
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200);
    const tasks = (data || []) as TaskRow[];
    setAll(tasks);
    setMine(tasks.filter((t) => t.user_id === user?.id));
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setFTitle("");
    setFDesc("");
    setFStatus("pending");
    setFTrack("");
    setFDue("");
    setFOwner(meId || "");
    setEditorOpen(true);
  };

  const openEdit = (t: TaskRow) => {
    setEditing(t);
    setFTitle(t.title);
    setFDesc(t.description || "");
    setFStatus(t.status);
    setFTrack(t.track || "");
    setFDue(t.due_date ? t.due_date.slice(0, 16) : "");
    setFOwner(t.user_id);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!fTitle.trim()) { toast.error("Title is required"); return; }
    if (!fOwner.trim()) { toast.error("Assignee (user_id) is required"); return; }
    setSaving(true);
    const payload = {
      title: fTitle.trim(),
      description: fDesc.trim() || null,
      status: fStatus,
      track: fTrack.trim() || null,
      due_date: fDue ? new Date(fDue).toISOString() : null,
      user_id: fOwner.trim(),
    };
    const { error } = editing
      ? await supabase.from("tasks").update(payload).eq("id", editing.id)
      : await supabase.from("tasks").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Task updated" : "Task created");
    setEditorOpen(false);
    load();
  };

  const toggleComplete = async (t: TaskRow) => {
    const next: TaskStatus = t.status === "completed" ? "pending" : "completed";
    const { error } = await supabase.from("tasks").update({ status: next }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next === "completed" ? "Marked complete" : "Reopened");
    load();
  };

  const remove = async (t: TaskRow) => {
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Task deleted");
    load();
  };

  const renderList = (items: TaskRow[]) => {
    if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
    if (!items.length) return <div className="p-8 text-center text-muted-foreground">No tasks.</div>;
    return (
      <div className="divide-y divide-border">
        {items.map((t) => (
          <div key={t.id} className="flex items-start gap-3 p-4">
            <button
              onClick={() => toggleComplete(t)}
              className="mt-0.5 flex-shrink-0"
              aria-label={t.status === "completed" ? "Reopen task" : "Complete task"}
            >
              <CheckSquare className={`h-5 w-5 ${t.status === "completed" ? "text-accent" : "text-muted-foreground hover:text-foreground"}`} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`font-medium ${t.status === "completed" ? "line-through opacity-60" : ""}`}>{t.title}</div>
                <Badge variant="outline" className="text-xs capitalize">{t.status.replace("_", " ")}</Badge>
                {t.track && <Badge variant="secondary" className="text-xs">{t.track}</Badge>}
              </div>
              {t.description && <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</div>}
              {t.due_date && (
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Due {new Date(t.due_date).toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(t)} aria-label="Edit task">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => toggleComplete(t)} aria-label="Toggle complete">
                {t.status === "completed" ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label="Delete task">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                    <AlertDialogDescription>"{t.title}" will be permanently removed.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove(t)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Tasks</h1>
          <p className="text-sm text-muted-foreground">Operator task queue.</p>
        </div>
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> New Task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Task" : "New Task"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="What needs to happen?" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={fStatus} onValueChange={(v) => setFStatus(v as TaskStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTS.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Due date</Label>
                  <Input type="datetime-local" value={fDue} onChange={(e) => setFDue(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Track</Label>
                  <Input value={fTrack} onChange={(e) => setFTrack(e.target.value)} placeholder="sales, cs, btf…" />
                </div>
                <div>
                  <Label>Assignee user_id</Label>
                  <Input value={fOwner} onChange={(e) => setFOwner(e.target.value)} placeholder="auth.users.id" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <Tabs defaultValue="mine">
          <TabsList className="m-3">
            <TabsTrigger value="mine">Assigned to me ({mine.length})</TabsTrigger>
            <TabsTrigger value="all">All visible ({all.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-0">{renderList(mine)}</TabsContent>
          <TabsContent value="all" className="mt-0">{renderList(all)}</TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
