// Inline slash-command palette (IA slice 1c-vi) — an input-anchored satellite menu
// that opens when the composer value is a bare "/token". Keyboard is driven from
// the composer's own onKeyDown (focus never leaves the Textarea), Raycast/Linear
// style. This replaces the always-visible quick-chips with a discoverable palette.
//
// It is NOT an artifact-type picker (§18/§21) — it's a shortcut over commands that
// already existed as chips. Highlight uses bg-muted (neutral), NOT bg-accent — the
// gold budget stays on Send (§11).
import type { QuickChip } from "@/components/paige/commandCenterTypes";
import { cn } from "@/lib/utils";

interface SlashCommandMenuProps {
  open: boolean;
  items: QuickChip[];
  activeIndex: number;
  onHover: (i: number) => void;
  onPick: (c: QuickChip) => void;
}

export function SlashCommandMenu({ open, items, activeIndex, onHover, onPick }: SlashCommandMenuProps) {
  if (!open || items.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="Commands"
      className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
    >
      {items.map((c, i) => (
        <button
          key={c.label}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          onMouseEnter={() => onHover(i)}
          // Prevent the Textarea from losing focus/blurring before the pick fires.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c)}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
            i === activeIndex ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/60",
          )}
        >
          <span className="truncate">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
