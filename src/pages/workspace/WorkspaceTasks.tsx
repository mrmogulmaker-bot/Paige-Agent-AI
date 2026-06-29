import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { CheckSquare, Clock, Plus, Pencil } from "lucide-react";
import { useTasks, type Task } from "@/hooks/useTasks";

type TaskStatus = Task["status"];

/**
 * Client-facing tasks list — white-labeled.
 * The product name "Paige" must never appear here.
 */
export default function WorkspaceTasks() {
  const {
    tasks,
    loading,
    currentUserId,
    createTaskRaw,
    updateTask,
  } = useTasks({ scope: "self", limit: 200 });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fDue, setFDue] = useState("");
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setFTitle(""); setFDesc(""); setFDue("");
    setOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setFTitle(t.title);
    setFDesc(t.description || "");
    setFDue(t.due_date ? t.due_date.slice(0, 16) : "");
    setOpen(true);
  };

  const save = async () => {
    if (!fTitle.trim() || !currentUserId) return;
    setSaving(true);
    const payload = {
      title: fTitle.trim(),
      description: fDesc.trim() || null,
      due_date: fDue ? new Date(fDue).toISOString() : null,
      user_id: currentUserId,
    };
    const result = editing
      ? await updateTask(editing.id, payload)
      : await createTaskRaw({ ...payload, status: "pending" });
    setSaving(false);
    if (result) setOpen(false);
  };

  const toggle = async (t: Task) => {
    const next: TaskStatus = t.status === "completed" ? "pending" : "completed";
    await updateTask(t.id, { status: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">My Tasks</h1>
          <p className="text-sm opacity-75">Action items from your coach and yourself.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Add task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={3} />
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="datetime-local" value={fDue} onChange={(e) => setFDue(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        {loading ? (
          <div className="p-8 text-center opacity-70">Loading…</div>
        ) : !tasks.length ? (
          <div className="p-8 text-center opacity-70">No tasks yet. Add one to get started.</div>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-start gap-3 p-4">
                <button onClick={() => toggle(t)} className="mt-0.5" aria-label="toggle complete">
                  <CheckSquare className={`h-5 w-5 ${t.status === "completed" ? "text-accent" : "opacity-60 hover:opacity-100"}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={`font-medium ${t.status === "completed" ? "line-through opacity-60" : ""}`}>{t.title}</div>
                    <Badge variant="outline" className="text-xs capitalize">{t.status.replace("_", " ")}</Badge>
                    {t.track && <Badge variant="secondary" className="text-xs">{t.track}</Badge>}
                  </div>
                  {t.description && <div className="text-sm opacity-75 mt-1">{t.description}</div>}
                  {t.due_date && (
                    <div className="text-xs opacity-60 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Due {new Date(t.due_date).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(t)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
