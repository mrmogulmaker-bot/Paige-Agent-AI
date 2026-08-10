// ConversationsThreeColumnShell — the PURE-LAYOUT three-column conversation frame
// (§18 one home). It owns ONLY the grid skeleton, the first-run swap, the railOpen
// responsive 3-col↔2-col toggle, and the mobile contact Sheet. It holds NO data and knows
// nothing about tenant vs operator — the container passes rendered slots
// (threadList / activeThread / contactPanel) and the boolean layout state. The PageShell +
// page heading stay with the container so the §11 banner/header decision is never made here.
//
// The grid classes are byte-faithful to the shipped tenant inbox so the extraction is a pure
// move, not a re-layout (§13 zero regression): the pane grid flows as the flex-1 last child of
// the container's `fill` PageShell (lg+), so its columns' own overflow-y-auto engage instead of
// a magic calc() height. Below lg it stacks with natural scroll.
//
// §11: token-only, motion-safe; no gold in the layout chrome (gold is spent by the slots' own
// acts — the composer Send, the New-conversation button).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export interface ConversationsThreeColumnShellProps {
  /** When `showFirstRun` is true this replaces the WHOLE grid (the §36 guided zero-state). */
  firstRun?: ReactNode;
  showFirstRun?: boolean;

  /** LEFT rail (ConversationsThreadList). */
  threadList: ReactNode;
  /** MIDDLE pane — the thread header + message list + composer, or the no-selection EmptyState.
   *  Container-owned (it carries the scope's draft-card wrapper + thread-header quick actions). */
  activeThread: ReactNode;
  /** RIGHT rail content (ConversationsContactPanel) — shown on xl+ when a thread is open and
   *  the rail is open. */
  contactPanel?: ReactNode;
  /** The same contact-panel content for the mobile Sheet (≤ xl). Usually the same node type. */
  mobileContactPanel?: ReactNode;

  /** A thread is open — drives 3-col (with rail) vs 2-col, and whether the rail can show. */
  hasSelection: boolean;
  /** The right rail is open (xl+). */
  railOpen: boolean;

  /** Mobile contact Sheet. */
  mobileSheetOpen: boolean;
  onMobileSheetOpenChange: (open: boolean) => void;
  /** Accessible title for the mobile Sheet (e.g. the contact name). */
  mobileSheetTitle?: string;

  /** Optional extra classes on the grid wrapper. */
  className?: string;
}

export function ConversationsThreeColumnShell({
  firstRun, showFirstRun = false,
  threadList, activeThread, contactPanel, mobileContactPanel,
  hasSelection, railOpen,
  mobileSheetOpen, onMobileSheetOpenChange, mobileSheetTitle,
  className,
}: ConversationsThreeColumnShellProps) {
  const showRail = hasSelection && railOpen;

  if (showFirstRun && firstRun) {
    // §36 first-run: before a single thread exists, one cohesive guided surface replaces the
    // two disconnected empty boxes. Everything else keeps its own EmptyState inside the rail/pane.
    return <>{firstRun}</>;
  }

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(260px,288px)_minmax(0,1fr)] lg:overflow-hidden xl:gap-4",
          showRail
            ? "xl:grid-cols-[minmax(280px,304px)_minmax(0,1fr)_minmax(280px,320px)] 2xl:grid-cols-[320px_minmax(0,1fr)_320px]"
            : "xl:grid-cols-[minmax(280px,304px)_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]",
          className,
        )}
      >
        {/* ── LEFT: thread rail ─────────────────────────────────────────────────── */}
        {threadList}

        {/* ── MIDDLE: thread detail + composer (or no-selection empty) ───────────── */}
        {activeThread}

        {/* ── RIGHT: contact rail (xl+ only, when a thread is open) ──────────────── */}
        {showRail && contactPanel && (
          <div className="hidden min-h-0 overflow-hidden xl:flex">{contactPanel}</div>
        )}
      </div>

      {/* Mobile / below-xl contact panel as a right Sheet. */}
      {hasSelection && (mobileContactPanel ?? contactPanel) && (
        <Sheet open={mobileSheetOpen} onOpenChange={onMobileSheetOpenChange}>
          <SheetContent side="right" className="flex h-full w-[min(26rem,100vw)] max-w-none flex-col gap-0 p-0">
            <SheetTitle className="sr-only">
              {mobileSheetTitle ? `Contact details for ${mobileSheetTitle}` : "Contact details"}
            </SheetTitle>
            {mobileContactPanel ?? contactPanel}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
