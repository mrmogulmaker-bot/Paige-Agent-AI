// ConversationsThreadList — the scope-agnostic LEFT rail (§18 one home). It moves the tenant
// inbox's entire left column — New-conversation act, search, the filter strip, the
// select-all/sort/density bar, the bulk-action toolbar, the row list, and the Gmail-style
// keyboard cursor + multi-select — into ONE shell surface driven purely by the adapter's list
// model (normalized threads + mutator callbacks + render slots). The tenant refactor becomes
// thin wiring; the operator refactor implements the same model over operator_conversations.
//
// The row itself is scope-specific and enters through `renderRow` (tenant: the existing
// ThreadRow with its SnoozeMenu/LabelPopover; operator: a minimal row) — so the rich tenant row
// is reused UNCHANGED (§13/§37 zero regression). Everything else here is generic: it reads only
// ShellThread's normalized fields and calls the adapter's mutators.
//
// Behavior is byte-faithful to the shipped tenant rail: arrows/j-k move a CURSOR (highlight
// only, never opening/marking-read, so an unread-first sort never reorders under the cursor);
// Enter opens the cursored row; `x` toggles its multi-select; shift-click range-selects; the
// bulk runner scopes to SELECTED ∩ VISIBLE and reports partial results honestly (§13).
//
// §11: token-only, motion-safe; the list chrome is neutral/indigo — gold is spent only by the
// New-conversation act the scope renders, never here.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Search, SearchX, Inbox, ArrowUpDown, Rows3, AlignJustify,
  Archive, Clock, Tag, CheckCheck, MessageCircleReply, Check, X,
} from "lucide-react";
import { SectionCard, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  type Density, type ThreadSort, type Label,
  THREAD_SORTS, SORT_LABEL, DENSITY_STORAGE_KEY, readDensity,
  LABEL_DOT, snoozePresets, SNOOZE_SENTINEL_UNTIL_REPLY,
} from "../inbox-shared";
import type { ConversationsListModel, ShellThread } from "./conversationsAdapter";

// Normalized sort — composes AFTER the container's server state filter + client view/label/search
// filters (pure, no new query, §9). Mirrors inbox-shared.sortThreads but over ShellThread's
// already-resolved `title`/`unread`/`lastMessageAt` so Name (A–Z) alphabetizes by what the user
// actually sees (the row's display name), never an empty string (§13).
function sortShellThreads<TRaw>(threads: ShellThread<TRaw>[], mode: ThreadSort): ShellThread<TRaw>[] {
  const ts = (t: ShellThread<TRaw>) => (t.lastMessageAt ? new Date(t.lastMessageAt).getTime() : 0);
  const arr = [...threads];
  switch (mode) {
    case "name":
      return arr.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || ts(b) - ts(a));
    case "unread":
      return arr.sort((a, b) =>
        (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || ts(b) - ts(a));
    default:
      return arr.sort((a, b) => ts(b) - ts(a));
  }
}

export function ConversationsThreadList<TRaw>(model: ConversationsListModel<TRaw>) {
  const {
    threads, loading, searching, search, onSearch, matchedEmpty,
    selectedKey, onSelect, onOpenFocus,
    snooze, archive, markRead, setLabels, labelCatalog, resetKey,
    renderRow, renderFilters, renderNewConversation, renderEmpty,
    hasSort = true, hasDensity = true, hasBulk = true,
  } = model;

  const reduce = useReducedMotion();

  // ── list-local presentation state (moved out of the container) ──────────────────────
  const [sort, setSort] = useState<ThreadSort>("recent");
  const [density, setDensity] = useState<Density>(readDensity);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const selectAnchorRef = useRef<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Gmail-style keyboard cursor — the highlighted row, SEPARATE from the open thread.
  const [cursorKey, setCursorKey] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(DENSITY_STORAGE_KEY, density); } catch { /* private mode */ }
  }, [density]);

  // ANY change that narrows the visible set (view/label/search — signaled via resetKey) resets
  // the selection + cursor so a bulk action can never reach a row the user can no longer see.
  const clearSelection = () => { setSelection(new Set()); selectAnchorRef.current = null; };
  useEffect(() => { clearSelection(); setCursorKey(null); }, [resetKey]);

  const rows = useMemo(() => (hasSort ? sortShellThreads(threads, sort) : threads), [threads, sort, hasSort]);

  // ── multi-select ────────────────────────────────────────────────────────────────────
  const toggleSelect = (key: string, e: { shiftKey: boolean }) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && selectAnchorRef.current) {
        const keys = rows.map((t) => t.key);
        const a = keys.indexOf(selectAnchorRef.current);
        const b = keys.indexOf(key);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(keys[i]);
          selectAnchorRef.current = key;
          return next;
        }
      }
      if (next.has(key)) next.delete(key); else next.add(key);
      selectAnchorRef.current = key;
      return next;
    });
  };
  const allVisibleSelected = rows.length > 0 && rows.every((t) => selection.has(t.key));
  const someVisibleSelected = rows.some((t) => selection.has(t.key));
  // Only rows that are BOTH selected AND visible can be acted on — the count derives from THIS,
  // never the raw Set, so the toolbar can never overstate what a bulk action touches (§13).
  const selectedVisibleCount = rows.reduce((n, t) => n + (selection.has(t.key) ? 1 : 0), 0);
  const toggleSelectAll = () => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) rows.forEach((t) => next.delete(t.key));
      else rows.forEach((t) => next.add(t.key));
      return next;
    });
    selectAnchorRef.current = null;
  };

  // ── bulk runner — reuses the per-thread seams in a loop (§18 no new mutation path),
  //    scoped to SELECTED ∩ VISIBLE, with honest partial reporting (§13). ───────────────
  const runBulk = async (verb: string, fn: (t: ShellThread<TRaw>) => Promise<boolean>) => {
    const targets = rows.filter((t) => selection.has(t.key));
    if (targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(targets.map(fn));
    setBulkBusy(false);
    const ok = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    const fail = results.length - ok;
    if (fail === 0) toast.success(`${verb} ${ok}.`);
    else if (ok === 0) toast.error(`Couldn't ${verb.toLowerCase()} any — ${fail} failed.`);
    else toast.warning(`${ok} of ${results.length} done — ${fail} failed.`);
    clearSelection();
  };
  const bulkArchive = () => runBulk("Archived", (t) => archive(t.id, true, { silent: true }));
  const bulkMarkRead = () => runBulk("Marked read", (t) => markRead(t.id, { silent: true }));
  const bulkSnooze = (until: Date | string) => runBulk("Snoozed", (t) => snooze(t.id, until, { silent: true }));
  const bulkApplyLabel = (label: Label) =>
    runBulk("Labeled", (t) =>
      setLabels(
        t.id,
        (t.labels ?? []).some((l) => l.id === label.id) ? (t.labels ?? []) : [...(t.labels ?? []), label],
        { silent: true },
      ));

  // ── open a thread (adapter marks it read) + keep the cursor on it ───────────────────
  const openThread = (key: string) => { onSelect(key); setCursorKey(key); };

  // ── keyboard nav (Gmail-style cursor) — faithful to the shipped rail ────────────────
  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const nav = ["ArrowDown", "ArrowUp", "j", "k", "Enter", "x", "X"];
    if (!nav.includes(e.key)) return;
    if ((e.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) return;
    if (rows.length === 0) return;
    const keys = rows.map((t) => t.key);
    // Base actions on the ACTUALLY-focused row, then the cursor, then the open thread — so
    // tabbing to a row and pressing an arrow / `x` never acts on a different, unfocused row.
    const focusedKey = (e.target as HTMLElement).closest?.("[data-thread-key]")?.getAttribute("data-thread-key") ?? null;
    const baseKey = focusedKey && keys.includes(focusedKey) ? focusedKey
      : cursorKey && keys.includes(cursorKey) ? cursorKey
      : selectedKey && keys.includes(selectedKey) ? selectedKey : null;
    if (e.key === "Enter") { e.preventDefault(); if (baseKey) { openThread(baseKey); onOpenFocus?.(); } return; }
    if (e.key === "x" || e.key === "X") { e.preventDefault(); if (baseKey && hasBulk) toggleSelect(baseKey, { shiftKey: false }); return; }
    e.preventDefault();
    const dir = (e.key === "ArrowDown" || e.key === "j") ? 1 : -1;
    const baseIdx = baseKey ? keys.indexOf(baseKey) : -1;
    const nextIdx = baseIdx === -1
      ? (dir === 1 ? 0 : keys.length - 1)
      : Math.min(keys.length - 1, Math.max(0, baseIdx + dir));
    const key = keys[nextIdx];
    setCursorKey(key);
    requestAnimationFrame(() => {
      const node = listRef.current?.querySelector<HTMLElement>(`[data-thread-key="${CSS.escape(key)}"]`);
      node?.scrollIntoView({ block: "nearest" });
      node?.focus();
    });
  };

  const showControls = hasSort || hasDensity;

  return (
    <SectionCard padded={false} bodyClassName="flex min-h-0 flex-1 flex-col" className="flex min-h-0 flex-col overflow-hidden">
      {/* New-conversation act + search */}
      <div className="space-y-2.5 border-b border-border/60 px-3 py-2.5">
        {renderNewConversation?.()}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search messages…"
            className="h-9 pl-8"
            aria-label="Search messages"
          />
        </div>
      </div>

      {/* Filter strip (scope-provided) */}
      {renderFilters?.()}

      {/* select-all · count · sort · density — only when the rail has rows */}
      {!loading && !searching && rows.length > 0 && (showControls || hasBulk) && (
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
          {hasBulk && (
            <Checkbox
              checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all visible conversations"
            />
          )}
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {rows.length} {rows.length === 1 ? "conversation" : "conversations"}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {hasSort && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowUpDown className="h-3.5 w-3.5" aria-hidden /> {SORT_LABEL[sort]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Sort by</DropdownMenuLabel>
                  {THREAD_SORTS.map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => setSort(s)}>
                      <Check className={cn("mr-2 h-3.5 w-3.5", sort === s ? "opacity-100" : "opacity-0")} aria-hidden />
                      {SORT_LABEL[s]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {hasDensity && (
              // Density segmented toggle (native <button>s — §11 only bans native select/checkbox).
              <div className="flex items-center rounded-md border border-border p-0.5" role="group" aria-label="Row density">
                {([["comfortable", Rows3, "Comfortable"], ["compact", AlignJustify, "Compact"]] as const).map(([d, Icon, label]) => (
                  <button
                    key={d}
                    type="button"
                    aria-label={`${label} density`}
                    aria-pressed={density === d}
                    onClick={() => setDensity(d)}
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                      density === d ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* bulk-action toolbar — appears when a selection exists. NEUTRAL/ghost (management, not
          an outward commit → no gold, §11). Motion-safe (§25). */}
      {hasBulk && (
        <AnimatePresence initial={false}>
          {selectedVisibleCount > 0 && (
            <motion.div
              key="bulk-bar"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.16 }}
              className="flex flex-wrap items-center gap-1 overflow-hidden border-b border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.05)] px-2 py-1.5"
            >
              <span className="mr-1 pl-1 text-xs font-medium tabular-nums text-foreground">{selectedVisibleCount} selected</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={bulkBusy} onClick={bulkArchive}>
                <Archive className="h-3.5 w-3.5" aria-hidden /> Archive
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={bulkBusy}>
                    <Clock className="h-3.5 w-3.5" aria-hidden /> Snooze
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Snooze {selectedVisibleCount}</DropdownMenuLabel>
                  {snoozePresets().map((p) => (
                    <DropdownMenuItem key={p.key} onSelect={() => bulkSnooze(p.until)}>
                      <Clock className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {p.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onSelect={() => bulkSnooze(SNOOZE_SENTINEL_UNTIL_REPLY)}>
                    <MessageCircleReply className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Until they reply
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={bulkBusy || labelCatalog.length === 0}>
                    <Tag className="h-3.5 w-3.5" aria-hidden /> Label
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Apply label</DropdownMenuLabel>
                  {labelCatalog.length === 0 ? (
                    <DropdownMenuItem disabled>No labels yet</DropdownMenuItem>
                  ) : labelCatalog.map((l) => (
                    <DropdownMenuItem key={l.id} onSelect={() => bulkApplyLabel(l)}>
                      <span className={cn("mr-2 h-2 w-2 rounded-full", LABEL_DOT[l.color])} aria-hidden /> {l.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={bulkBusy} onClick={bulkMarkRead}>
                <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark read
              </Button>
              <Button
                variant="ghost" size="icon" className="ml-auto h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={clearSelection} aria-label="Clear selection"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* the row list — keyboard container (nav fires only when focus is INSIDE the list) */}
      <div ref={listRef} onKeyDown={onListKeyDown} className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading || searching ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2.5">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : matchedEmpty ? (
          <EmptyState
            icon={SearchX} tone="muted"
            title={`No messages match "${search.trim()}".`}
            description="Try a client's name, a phone number, or a word from the message."
            className="py-10"
          />
        ) : rows.length === 0 ? (
          renderEmpty?.() ?? (
            <EmptyState
              icon={Inbox} tone="brand"
              title="No conversations yet."
              description="When a message arrives — or you start a new one — the thread lands here."
              className="py-10"
            />
          )
        ) : (
          <div className="space-y-1">
            {rows.map((t) =>
              renderRow(t, {
                active: t.key === selectedKey,
                cursored: t.key === cursorKey,
                selected: selection.has(t.key),
                selectionActive: selection.size > 0,
                onClick: () => openThread(t.key),
                onToggleSelect: (e) => toggleSelect(t.key, e),
                density,
              }),
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
