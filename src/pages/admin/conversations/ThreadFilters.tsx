import { useMemo } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Toolbar, FilterChip } from "@/components/ui/page";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  type InboxView, type DbThread, type Label,
  INBOX_VIEWS, FILTER_LABEL, LABEL_DOT,
} from "./inbox-shared";

// §27(1) reclaim vertical space: the two views the rail already treats as primary
// (Active — the default; Unread — the count-bearing nudge) stay as one-tap inline
// chips; the remaining seven fold into a compact menu so the 9-view strip collapses
// from ~3 rows to one. The active view is ALWAYS visible — as an inline chip, or as
// the trigger's own label when it's a folded one (§36 discoverable). The menu reuses
// the rail's existing Sort DropdownMenu pattern (§18 — no new primitive/panel).
const INLINE_VIEWS: InboxView[] = ["active", "unread"];
const MORE_VIEWS: InboxView[] = INBOX_VIEWS.filter((v) => !INLINE_VIEWS.includes(v));

// R3: the chip strip carries the four state filters AND the four derived views the
// Command-Center tiles deep-link into — so URL state is visible, not just addressable.
export function ThreadFilters({
  view, onView, activeUnread, foldedPending = 0,
  catalog, labelFilter, onLabelFilter,
}: {
  view: InboxView;
  onView: (v: InboxView) => void;
  activeUnread: number;
  /** count of threads sitting in the folded draft-first views (Drafts / Awaiting
   *  reply) — badged on the "More" trigger so folding those §36 moat views to
   *  reclaim space never buries their proactive pull. */
  foldedPending?: number;
  catalog: Label[];
  labelFilter: string | null;
  onLabelFilter: (id: string | null) => void;
}) {
  const hasLabels = catalog.length > 0;
  const foldedActive = MORE_VIEWS.includes(view);
  return (
    <div className="space-y-1.5 border-b border-border/60 px-3 py-2">
      <Toolbar>
        <div className="flex flex-wrap items-center gap-1.5">
          {INLINE_VIEWS.map((v) => (
            <FilterChip key={v} active={view === v} onClick={() => onView(v)}>
              {FILTER_LABEL[v]}
              {/* the count is unread threads — it belongs on ONE chip (Unread), not
                  echoed on Active where the same number reads as ambiguous. */}
              {v === "unread" && activeUnread > 0 && (
                <span className="ml-1 tabular-nums text-[10px] opacity-80">{activeUnread}</span>
              )}
            </FilterChip>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* active drives only the indigo styling; a menu button is not a toggle,
                  so suppress aria-pressed (Radix supplies aria-haspopup/expanded). */}
              <FilterChip active={foldedActive} aria-pressed={undefined} aria-label="More views">
                {foldedActive ? FILTER_LABEL[view] : "More"}
                {foldedPending > 0 && (
                  <span className="tabular-nums text-[10px] opacity-80">{foldedPending}</span>
                )}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </FilterChip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {MORE_VIEWS.map((v) => (
                <DropdownMenuItem
                  key={v}
                  onSelect={() => onView(v)}
                  className="justify-between gap-2"
                >
                  {FILTER_LABEL[v]}
                  {view === v && <Check className="h-3.5 w-3.5" aria-hidden />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Toolbar>

      {hasLabels && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={labelFilter === null} onClick={() => onLabelFilter(null)}>
            All labels
          </FilterChip>
          {catalog.map((l) => (
            <FilterChip
              key={l.id}
              active={labelFilter === l.id}
              onClick={() => onLabelFilter(labelFilter === l.id ? null : l.id)}
            >
              <span className={cn("h-2 w-2 rounded-full", LABEL_DOT[l.color])} aria-hidden />
              {l.name}
            </FilterChip>
          ))}
        </div>
      )}
    </div>
  );
}

/** derived label catalog = union of labels across loaded threads, keyed by id (§18 —
 *  no rival registry table; labels live inline on threads.labels). */
export function useLabelCatalog(dbThreads: DbThread[]): Label[] {
  return useMemo(() => {
    const m = new Map<string, Label>();
    for (const t of dbThreads) for (const l of t.labels ?? []) if (!m.has(l.id)) m.set(l.id, l);
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [dbThreads]);
}
