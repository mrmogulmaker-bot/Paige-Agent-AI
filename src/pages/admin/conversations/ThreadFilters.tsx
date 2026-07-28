import { useMemo } from "react";
import { Toolbar, FilterChip } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import {
  type InboxView, type DbThread, type Label,
  INBOX_VIEWS, FILTER_LABEL, LABEL_DOT,
} from "./inbox-shared";

// R3: the chip strip carries the four state filters AND the four derived views the
// Command-Center tiles deep-link into — so URL state is visible, not just addressable.
export function ThreadFilters({
  view, onView, activeUnread,
  catalog, labelFilter, onLabelFilter,
}: {
  view: InboxView;
  onView: (v: InboxView) => void;
  activeUnread: number;
  catalog: Label[];
  labelFilter: string | null;
  onLabelFilter: (id: string | null) => void;
}) {
  const hasLabels = catalog.length > 0;
  return (
    <div className="space-y-1.5 border-b border-border/60 px-3 py-2">
      <Toolbar>
        <div className="flex flex-wrap items-center gap-1.5">
          {INBOX_VIEWS.map((v) => (
            <FilterChip key={v} active={view === v} onClick={() => onView(v)}>
              {FILTER_LABEL[v]}
              {(v === "active" || v === "unread") && activeUnread > 0 && (
                <span className="ml-1 tabular-nums text-[10px] opacity-80">{activeUnread}</span>
              )}
            </FilterChip>
          ))}
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
