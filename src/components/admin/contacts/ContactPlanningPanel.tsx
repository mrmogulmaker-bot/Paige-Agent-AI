import { useEffect, useMemo, useState } from "react";
import { Plus, CheckSquare, ChevronDown, UserSquare2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

/** The client's own portal to-dos (legacy `tasks`, user_id-scoped) — shown
 * read-only so staff keep two-way visibility (§7) of what the client sees in
 * their portal, without silently completing the client's personal items. */
interface PortalTask { id: string; title: string; status: string; due_date: string | null; }

/**
 * The contact record's Tasks tab, on the shared plan_* seam (§10). Everything
 * Paige sets about this client (plan_set_reminder / plan_assign_task carry
 * contact_id) and everything staff add manually here land in the SAME place and
 * show together — the "wired to the client" fix. Works whether or not the
 * contact has a linked portal account, because plan_items key off contact_id.
 *
 * When the contact has a linked portal user, we ALSO surface their own portal
 * to-dos (the legacy `tasks` store) in a separate read-only section so staff
 * don't lose sight of what the client is tracking on their side.
 */
export function ContactPlanningPanel({
  contactId,
  contactName,
  linkedUserId = null,
}: {
  contactId: string;
  contactName?: string | null;
  linkedUserId?: string | null;
}) {
  const { allItems, loading, forbidden, userId, refresh } = usePlanList({ scope: "team", contactId });
  const reload = () => refresh({ silent: true });
  const [showDone, setShowDone] = useState(false);
  const [showPortal, setShowPortal] = useState(false);
  const [portalTasks, setPortalTasks] = useState<PortalTask[]>([]);

  const open = useMemo(() => allItems.filter((i) => !isClosed(i)).sort(byWhen), [allItems]);
  const done = useMemo(() => allItems.filter((i) => i.status === "done").sort(byWhen), [allItems]);

  // The client's own portal to-dos (read-only). Only meaningful once linked.
  useEffect(() => {
    if (!linkedUserId) { setPortalTasks([]); return; }
    let active = true;
    void supabase
      .from("tasks")
      .select("id,title,status,due_date")
      .eq("user_id", linkedUserId)
      .neq("status", "cancelled")
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50)
      .then(({ data }) => { if (active) setPortalTasks((data as PortalTask[]) ?? []); });
    return () => { active = false; };
  }, [linkedUserId]);
  const openPortal = portalTasks.filter((t) => t.status !== "completed");

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
          <h3 className="text-sm font-semibold">Tasks &amp; reminders</h3>
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

      {/* The client's own portal to-dos — read-only, so staff retain visibility
          of what the client is tracking (§7) without silently acting on it. */}
      {portalTasks.length > 0 && (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowPortal((s) => !s)}
            className="flex w-full items-center justify-between rounded text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={showPortal}
          >
            <span className="flex items-center gap-1.5">
              <UserSquare2 className="h-3.5 w-3.5" /> Their own to-dos ({openPortal.length})
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", showPortal && "rotate-180")} />
          </button>
          {showPortal && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">From their client portal — view only.</p>
              {portalTasks.map((t) => (
                <div key={t.id} className={cn("flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm", t.status === "completed" && "opacity-60")}>
                  <span className={cn("min-w-0 flex-1 truncate", t.status === "completed" && "line-through text-muted-foreground")}>{t.title}</span>
                  {t.due_date && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(t.due_date), { addSuffix: true })}
                    </span>
                  )}
                  <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{t.status.replace("_", " ")}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </CardContent></Card>
  );
}
