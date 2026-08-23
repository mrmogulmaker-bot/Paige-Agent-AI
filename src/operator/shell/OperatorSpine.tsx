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
 * ROUND 1 IS GEOMETRY: the regions are the shape PAIGE lands in, and they are EMPTY. Nothing
 * here fabricates a conversation, a memory, or a face state (§13) — the chat engine, the thread
 * and the memory read are wiring, and wiring is a later round.
 */
import { PaigeMark } from "@/components/brand/PaigeMark";

export default function OperatorSpine() {
  return (
    <aside
      data-operator-spine
      aria-label="PAIGE"
      className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border-strong bg-card"
    >
      <div className="flex min-h-[60px] min-w-0 flex-none items-center gap-3 border-b border-border px-4">
        <PaigeMark className="h-[22px] w-[22px] flex-none" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-[0.4em] text-foreground">
          PAIGE
        </span>
      </div>

      {/* Memory. Its own scroll region, empty until it is wired. */}
      <div data-spine-region="memory" className="min-h-0 min-w-0 flex-1 overflow-auto" />

      {/* The conversation. Same shape, same rule. */}
      <div
        data-spine-region="chat"
        className="min-h-0 min-w-0 flex-1 overflow-auto border-t border-border"
      />
    </aside>
  );
}
