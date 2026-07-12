import { useMemo, useState } from "react";
import { Plus, CheckSquare, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { usePlanList, type PlanItem } from "@/hooks/usePlanList";
import { isClosed } from "@/lib/planning";
import { PlanItemRow } from "@/components/planning/PlanItemRow";
import { QuickAddDialog } from "@/components/planning/QuickAddDialog";

const byWhen = (a: PlanItem, b: PlanItem) => {
  const av = a.due_at ?? a.remind_at ?? "9999";
  const bv = b.due_at ?? b.remind_at ?? "9999";
  return av < bv ? -1 : av > bv ? 1 : 0;
};

/**
 * The contact record's Tasks tab, on the shared plan_* seam (§10). Everything
 * Paige sets about this client (plan_set_reminder / plan_assign_task carry
 * contact_id) and everything staff add manually here land in the SAME place and
 * show together — the "wired to the client" fix. Works whether or not the
 * contact has a linked portal account, because plan_items key off contact_id,
 * not a portal user_id.
 */
export function ContactPlanningPanel({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName?: string | null;
}) {
  const { allItems, loading, forbidden, userId, refresh } = usePlanList({ scope: "team", contactId });
  const reload = () => refresh({ silent: true });
  const [showDone, setShowDone] = useState(false);

  const open = useMemo(() => allItems.filter((i) => !isClosed(i)).sort(byWhen), [allItems]);
  const done = useMemo(() => allItems.filter((i) => i.status === "done").sort(byWhen), [allItems]);

  const addTrigger = (
    <Button size="sm">
      <Plus className="mr-1.5 h-4 w-4" /> Add task
    </Button>
  );

  if (forbidden) {
    return (
      <Card><CardContent className="p-4">
        <EmptyState icon={CheckSquare} title="Tasks aren't available here"
          description="Reminders and tasks live with your team's workspace." />
      </CardContent></Card>
    );
  }

  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Tasks & reminders</h3>
          <p className="text-xs text-muted-foreground">
            What you and Paige are tracking for {contactName || "this contact"}.
          </p>
        </div>
        <QuickAddDialog
          userId={userId}
          onCreated={reload}
          contactId={contactId}
          contactName={contactName}
          trigger={addTrigger}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-lg border border-border bg-muted/40 animate-pulse motion-reduce:animate-none" />)}
        </div>
      ) : open.length === 0 && done.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          tone="brand"
          title="Nothing tracked yet"
          description="Add a task or reminder for this contact, or ask Paige to follow up — it'll show up here."
          action={
            <QuickAddDialog
              userId={userId}
              onCreated={reload}
              contactId={contactId}
              contactName={contactName}
              trigger={addTrigger}
            />
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {open.map((it) => <PlanItemRow key={it.id} item={it} onChanged={reload} />)}
          </div>

          {done.length > 0 && (
            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowDone((s) => !s)}
                className="flex w-full items-center justify-between rounded text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={showDone}
              >
                <span>Done ({done.length})</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", showDone && "rotate-180")} />
              </button>
              {showDone && (
                <div className="mt-3 space-y-2">
                  {done.map((it) => <PlanItemRow key={it.id} item={it} onChanged={reload} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </CardContent></Card>
  );
}
