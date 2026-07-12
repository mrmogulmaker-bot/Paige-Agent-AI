import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CalendarClock, Sparkles, Bell, CheckSquare, Flag, Map, ListChecks, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PageShell, PageHeader, SectionCard, StatRow, StatTile, EmptyState, Toolbar, FilterChip, StatePill,
} from "@/components/ui/page";
import { usePlanList, type PlanScope, type PlanItem, type PlanItemType } from "@/hooks/usePlanList";
import { bucketOf, isClosed, type TimeBucket } from "@/lib/planning";
import { PlanItemRow } from "./PlanItemRow";

const BUCKET_ORDER: { key: TimeBucket; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "none", label: "No date" },
];

const TYPE_CHIPS: { key: PlanItemType | "all"; label: string; icon: typeof Bell }[] = [
  { key: "all", label: "All", icon: ListChecks },
  { key: "reminder", label: "Reminders", icon: Bell },
  { key: "task", label: "Tasks", icon: CheckSquare },
  { key: "milestone", label: "Milestones", icon: Flag },
];

export function PlanningHub({ staff = false }: { staff?: boolean }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const focusItem = params.get("item");
  const [scope, setScope] = useState<PlanScope>("mine");
  const [typeFilter, setTypeFilter] = useState<PlanItemType | "all">("all");
  const [showDone, setShowDone] = useState(false);
  const focusedRef = useRef<HTMLDivElement | null>(null);

  const { plans, allItems, loading, error, refresh } = usePlanList({ scope });

  // Non-staff never see the Team scope; snap back to "mine" if it was set.
  useEffect(() => { if (!staff && scope === "team") setScope("mine"); }, [staff, scope]);

  const items = useMemo(
    () => (typeFilter === "all" ? allItems : allItems.filter((i) => i.item_type === typeFilter)),
    [allItems, typeFilter],
  );

  const openItems = items.filter((i) => !isClosed(i));
  const doneItems = items.filter((i) => i.status === "done");

  const byBucket = useMemo(() => {
    const map: Record<TimeBucket, PlanItem[]> = { overdue: [], today: [], week: [], later: [], none: [] };
    for (const it of openItems) map[bucketOf(it)].push(it);
    const sortByWhen = (a: PlanItem, b: PlanItem) => {
      const av = a.due_at ?? a.remind_at ?? "9999";
      const bv = b.due_at ?? b.remind_at ?? "9999";
      return av < bv ? -1 : av > bv ? 1 : 0;
    };
    (Object.keys(map) as TimeBucket[]).forEach((k) => map[k].sort(sortByWhen));
    return map;
  }, [openItems]);

  // Stats. plan_list doesn't return completed_at, so "Done" counts the visible
  // completed items rather than a strict this-week window.
  const overdueCount = byBucket.overdue.length;
  const todayCount = byBucket.today.length;
  const upcomingCount = byBucket.week.length;
  const doneCount = doneItems.length;

  // Deep-link: scroll to + highlight the fired reminder's row.
  useEffect(() => {
    if (!focusItem || loading) return;
    const el = document.querySelector<HTMLDivElement>(`[data-plan-item="${focusItem}"]`);
    if (el) {
      focusedRef.current = el;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-ring", "ring-offset-2", "ring-offset-background");
      const t = setTimeout(() => el.classList.remove("ring-2", "ring-ring", "ring-offset-2", "ring-offset-background"), 2400);
      return () => clearTimeout(t);
    }
  }, [focusItem, loading, items]);

  const planWithPaige = (
    <Button variant="gold" onClick={() => navigate("/app")}>
      <Sparkles className="mr-1.5 h-4 w-4" /> Plan with Paige
    </Button>
  );

  const nothing = !loading && openItems.length === 0 && doneItems.length === 0 && plans.length === 0;

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        icon={CalendarClock}
        title="Planning"
        description="Everything you and Paige are tracking — reminders, tasks, milestones, and plans, in one place."
        actions={planWithPaige}
      />

      <StatRow cols={4}>
        <StatTile label="Overdue" value={overdueCount} intent={overdueCount > 0 ? "negative" : "neutral"} loading={loading} />
        <StatTile label="Due today" value={todayCount} loading={loading} />
        <StatTile label="Next 7 days" value={upcomingCount} loading={loading} />
        <StatTile label="Done" value={doneCount} intent={doneCount > 0 ? "positive" : "neutral"} loading={loading} />
      </StatRow>

      <Toolbar>
        <FilterChip active={scope === "mine"} onClick={() => setScope("mine")}>Assigned to me</FilterChip>
        {staff && <FilterChip active={scope === "by_me"} onClick={() => setScope("by_me")}>Assigned by me</FilterChip>}
        {staff && <FilterChip active={scope === "team"} onClick={() => setScope("team")}>Team</FilterChip>}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {TYPE_CHIPS.map((t) => (
          <FilterChip key={t.key} active={typeFilter === t.key} onClick={() => setTypeFilter(t.key)}>
            <t.icon className="h-3 w-3" /> {t.label}
          </FilterChip>
        ))}
      </Toolbar>

      {error && (
        <SectionCard><p className="text-sm text-destructive">{error}</p></SectionCard>
      )}

      {nothing ? (
        <SectionCard>
          <EmptyState
            icon={CalendarClock}
            tone="brand"
            title="Nothing on the board yet"
            description="Ask Paige to set a reminder or map out your week, and it'll show up here."
            action={planWithPaige}
          />
        </SectionCard>
      ) : (
        <>
          {BUCKET_ORDER.map(({ key, label }) => {
            const rows = byBucket[key];
            if (rows.length === 0) return null;
            return (
              <SectionCard
                key={key}
                title={label}
                actions={key === "overdue"
                  ? <StatePill state="error">{rows.length} overdue</StatePill>
                  : <span className="text-xs text-muted-foreground">{rows.length}</span>}
              >
                <div className="space-y-2">
                  {rows.map((it) => <PlanItemRow key={it.id} item={it} onChanged={refresh} />)}
                </div>
              </SectionCard>
            );
          })}

          {/* Plans — grouped, with a progress read */}
          {plans.map((p) => {
            const total = p.items.length;
            const done = p.items.filter((i) => i.status === "done").length;
            const visible = typeFilter === "all" ? p.items : p.items.filter((i) => i.item_type === typeFilter);
            const openInPlan = visible.filter((i) => !isClosed(i));
            if (openInPlan.length === 0) return null;
            return (
              <SectionCard
                key={p.id}
                icon={Map}
                title={p.title}
                description={p.summary || undefined}
                actions={<span className="text-xs text-muted-foreground tabular-nums">{done}/{total} done</span>}
              >
                <div className="space-y-2">
                  {openInPlan.map((it) => <PlanItemRow key={it.id} item={it} onChanged={refresh} />)}
                </div>
              </SectionCard>
            );
          })}

          {/* Done — collapsed */}
          {doneItems.length > 0 && (
            <SectionCard>
              <button
                type="button"
                onClick={() => setShowDone((s) => !s)}
                className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                aria-expanded={showDone}
              >
                <span>Done ({doneItems.length})</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", showDone && "rotate-180")} />
              </button>
              {showDone && (
                <div className="mt-3 space-y-2">
                  {doneItems.map((it) => <PlanItemRow key={it.id} item={it} onChanged={refresh} />)}
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}
    </PageShell>
  );
}
