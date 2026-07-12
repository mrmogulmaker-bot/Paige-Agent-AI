import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ArrowRight } from "lucide-react";
import { SectionCard, StatePill } from "@/components/ui/page";
import { usePlanList } from "@/hooks/usePlanList";
import { bucketOf, isClosed } from "@/lib/planning";
import { PlanItemRow } from "./PlanItemRow";

/**
 * "What's due" — a compact planning read for the dashboard home. Reuses
 * usePlanList + PlanItemRow so it behaves identically to the full hub. Shows up
 * to 5 overdue/today items; overflow goes to the hub (no scroll-wall).
 */
export function UpcomingWidget() {
  const { allItems, loading, refresh } = usePlanList({ scope: "mine" });

  const due = useMemo(() => {
    const open = allItems.filter((i) => !isClosed(i));
    const soon = open.filter((i) => ["overdue", "today"].includes(bucketOf(i)));
    return soon
      .sort((a, b) => {
        const av = a.due_at ?? a.remind_at ?? "9999";
        const bv = b.due_at ?? b.remind_at ?? "9999";
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
  }, [allItems]);

  const overdue = due.filter((i) => bucketOf(i) === "overdue").length;
  const shown = due.slice(0, 5);

  // Stay quiet while loading or when nothing is due — no empty clutter on home.
  if (loading || due.length === 0) return null;

  return (
    <SectionCard
      icon={CalendarClock}
      title="What's due"
      actions={
        overdue > 0
          ? <StatePill state="error">{overdue} overdue</StatePill>
          : <Link to="/app/planning" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">View all <ArrowRight className="h-3 w-3" /></Link>
      }
    >
      <div className="space-y-2">
        {shown.map((it) => <PlanItemRow key={it.id} item={it} onChanged={refresh} />)}
      </div>
      {due.length > shown.length && (
        <Link to="/app/planning" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline">
          {due.length - shown.length} more in Planning <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </SectionCard>
  );
}
