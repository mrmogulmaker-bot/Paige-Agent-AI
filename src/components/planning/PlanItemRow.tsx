import { useState } from "react";
import { Bell, CheckSquare, Flag, Circle, CheckCircle2, Clock, Trash2, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatePill, type PillState } from "@/components/ui/page";
import type { PlanItem } from "@/hooks/usePlanList";
import {
  itemDate, relativeWhen, absoluteWhen, isClosed, bucketOf,
  setItemStatus, rescheduleItem, removeItem, snoozePresets,
} from "@/lib/planning";

const TYPE_ICON: Record<PlanItem["item_type"], LucideIcon> = {
  reminder: Bell,
  task: CheckSquare,
  milestone: Flag,
};

const STATUS_PILL: Record<PlanItem["status"], PillState> = {
  open: "off",
  in_progress: "on",
  blocked: "error",
  done: "success",
  cancelled: "off",
};

const PRIORITY_TEXT: Record<PlanItem["priority"], string> = {
  urgent: "text-destructive",
  high: "text-warning",
  normal: "text-muted-foreground",
  low: "text-muted-foreground/70",
};

export function PlanItemRow({
  item,
  onChanged,
  className,
}: {
  item: PlanItem;
  onChanged: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const closed = isClosed(item);
  const done = item.status === "done";
  const Icon = TYPE_ICON[item.item_type] ?? Bell;
  const when = itemDate(item);
  const overdue = !closed && bucketOf(item) === "overdue";
  const isReminder = item.item_type === "reminder";

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "That didn't work");
    } finally {
      setBusy(false);
      setSnoozeOpen(false);
    }
  }

  const toggleDone = () =>
    run(() => setItemStatus(item.id, done ? "open" : "done"),
      done ? "Marked not done" : (isReminder ? "Dismissed" : "Marked done"));

  const presets = snoozePresets();

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors",
        closed && "opacity-60",
        className,
      )}
      data-plan-item={item.id}
    >
      {/* Complete toggle — the one act/approve moment (gold on done). */}
      <button
        type="button"
        onClick={toggleDone}
        disabled={busy}
        aria-label={done ? "Mark not done" : isReminder ? "Dismiss reminder" : "Mark done"}
        aria-pressed={done}
        className="mt-0.5 shrink-0 rounded-full text-muted-foreground transition-colors hover:text-gold-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {done ? <CheckCircle2 className="h-5 w-5 text-gold-dark" /> : <Circle className="h-5 w-5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn("truncate text-sm font-medium text-foreground", done && "line-through text-muted-foreground")}>
            {item.title}
          </span>
        </div>
        {item.summary && !done && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.summary}</p>
        )}
        {!done && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {when && (
              <span className={cn(overdue ? "font-semibold text-destructive" : "text-muted-foreground")} title={absoluteWhen(when)}>
                {relativeWhen(when)}
              </span>
            )}
            {item.priority !== "normal" && item.priority !== "low" && (
              <span className={cn("font-medium capitalize", PRIORITY_TEXT[item.priority])}>{item.priority}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!closed && item.status !== "open" && (
          <StatePill state={STATUS_PILL[item.status]}>
            {item.status === "in_progress" ? "In progress" : item.status}
          </StatePill>
        )}

        {!closed && (
          <>
            {/* Snooze / reschedule */}
            <Popover open={snoozeOpen} onOpenChange={setSnoozeOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" disabled={busy} aria-label="Snooze or reschedule">
                  <Clock className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-1">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {isReminder ? "Remind me…" : "Move to…"}
                </p>
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => run(() => rescheduleItem(item, p.iso), `Moved to ${p.label.toLowerCase()}`)}
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {p.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Remove — destructive, confirm-gated */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={busy} aria-label="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove this {item.item_type}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{item.title}" will be cancelled{item.linked_action_id ? " and taken off the action queue" : ""}. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={() => run(() => removeItem(item.id), "Removed")}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}

        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" />}
      </div>
    </div>
  );
}
