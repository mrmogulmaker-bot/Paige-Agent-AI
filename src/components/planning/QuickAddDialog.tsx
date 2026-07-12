import { useState } from "react";
import { Plus, Bell, CheckSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { friendlyPlanError } from "@/lib/planning";

type Kind = "reminder" | "task";

/** Human create-path for the Task Manager — a person adds a reminder/task for
 * themselves without going through Paige. Calls the SAME plan_* RPCs Paige's
 * tools call (§10), so the UI and Paige are one caller. */
export function QuickAddDialog({ userId, onCreated }: { userId: string | null; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("reminder");
  const [title, setTitle] = useState("");
  const [whenLocal, setWhenLocal] = useState(""); // datetime-local value
  const [busy, setBusy] = useState(false);

  const reset = () => { setKind("reminder"); setTitle(""); setWhenLocal(""); };

  async function submit() {
    const t = title.trim();
    if (!t) { toast.error("Give it a title"); return; }
    if (kind === "reminder" && !whenLocal) { toast.error("Pick a time to be reminded"); return; }
    const iso = whenLocal ? new Date(whenLocal).toISOString() : null;
    if (iso && new Date(iso).getTime() <= Date.now()) { toast.error("Pick a future time"); return; }

    setBusy(true);
    try {
      if (kind === "reminder") {
        const { error } = await supabase.rpc("plan_set_reminder", { p_title: t, p_remind_at: iso, p_channel: "in_app" });
        if (error) throw new Error(friendlyPlanError(error.message));
        toast.success("Reminder set — it'll ping you at that time");
      } else {
        if (!userId) throw new Error("Your account isn't loaded yet");
        const { error } = await supabase.rpc("plan_assign_task", { p_title: t, p_assigned_to_user_id: userId, p_due_at: iso });
        if (error) throw new Error(friendlyPlanError(error.message));
        toast.success("Task added");
      }
      setOpen(false);
      reset();
      onCreated();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't add that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> New
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to your plan</DialogTitle>
          <DialogDescription>A quick reminder or task for yourself. For anything more, just ask Paige.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {([["reminder", "Reminder", Bell], ["task", "Task", CheckSquare]] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  kind === k ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-title">{kind === "reminder" ? "Remind me to…" : "Task"}</Label>
            <Input
              id="qa-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "reminder" ? "Follow up with Dana" : "Draft the week-2 check-in"}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-when">{kind === "reminder" ? "When" : "Due (optional)"}</Label>
            <Input id="qa-when" type="datetime-local" value={whenLocal} onChange={(e) => setWhenLocal(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
            {kind === "reminder" ? "Set reminder" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
