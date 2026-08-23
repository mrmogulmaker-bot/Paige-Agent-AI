/**
 * The spine — column 3. PAIGE, docked on the right for the whole session.
 *
 * Geometry is the pack's `<aside>` (`v3.dc.html` L3821): a column flex with `min-width:0` and
 * `min-height:0`, a `flex:none` face row, and two regions that each own their own scroll
 * (`flex:1; min-height:0; overflow:auto`) so the document never scrolls.
 *
 * THE SPINE COLLAPSES TWO WAYS AT ONCE, and both are required. The shell's third grid track goes
 * to `0px`, AND this component unmounts — the pack does both. Track-only would animate the
 * columns closed over a still-mounted 340px panel; unmount-only would leave a 340px hole.
 *
 * RULING C (Claude Design, 2026-08-23) — THE SPINE COLLAPSES TO 0 UNTIL PAIGE IS IN IT.
 * "416px reserved for absence is the blank-section failure at the largest scale in the shell. A
 * collapsed spine is honest; an empty one asserts a capability that isn't there."
 *
 * So the track is 0 while the spine has nothing to show, and it opens the moment it does. That
 * is driven by `SPINE_REGIONS` below — the regions this component actually renders — and NOT by
 * a hardcoded `false` in the shell. A region whose `content` is null is not wired yet; the day
 * PAIGE's thread or memory read lands, its `content` becomes a node, `spineHasContent()` turns
 * true on its own, and the shell opens the track with no second edit. Nothing here fabricates a
 * conversation, a memory or a face state (§13).
 */
import type { ReactNode } from "react";
import { CommandMark } from "@/operator/shell/CommandMark";

export type SpineRegionId = "memory" | "chat";

export type SpineRegion = {
  readonly id: SpineRegionId;
  /** What the region renders. `null` means the read behind it is not wired yet. */
  readonly content: ReactNode | null;
};

/**
 * The spine's regions, in the pack's order. Both are `null` today because neither read exists —
 * the chat engine, the thread and the memory read are wiring, and wiring is a later round.
 */
export const SPINE_REGIONS: readonly SpineRegion[] = [
  { id: "memory", content: null },
  { id: "chat", content: null },
];

/**
 * Whether the spine has anything to show. The shell reserves its track on THIS, so an empty
 * spine can never claim a quarter of the viewport, and a wired one opens without a flag flip.
 */
export function spineHasContent(regions: readonly SpineRegion[] = SPINE_REGIONS): boolean {
  return regions.some((region) => region.content !== null);
}

export default function OperatorSpine({
  regions = SPINE_REGIONS,
}: {
  readonly regions?: readonly SpineRegion[];
}) {
  const shown = regions.filter((region) => region.content !== null);
  if (shown.length === 0) return null;

  return (
    <aside
      data-operator-spine
      aria-label="PAIGE"
      className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border-strong bg-[var(--pg-spine)] shadow-[var(--pg-lift-2)]"
    >
      <div className="flex min-h-[60px] min-w-0 flex-none items-center gap-3 border-b border-border px-4">
        <CommandMark size={22} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-[0.4em] text-foreground">
          PAIGE
        </span>
      </div>

      {shown.map((region, i) => (
        <div
          key={region.id}
          data-spine-region={region.id}
          className={`min-h-0 min-w-0 flex-1 overflow-auto${i > 0 ? " border-t border-border" : ""}`}
        >
          {region.content}
        </div>
      ))}
    </aside>
  );
}
