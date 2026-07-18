// #331 — the ONE shared thumbnail-strip primitive (§18: one home, reuse everywhere). Extracted
// VERBATIM from SessionImageCanvas's image-set strip (its role=group + indigo-active-ring + disabled-
// during-busy + lazy-thumb markup) so the image SET carousel, the VERSION strip, and the paged-doc
// PAGE rail all render the same strip instead of three forks.
//
// It is a labeled GROUP of buttons, NOT ARIA tabs (there is no controlled tabpanel — §18/§21 this
// navigates WITHIN a set/history, it is never an artifact-TYPE tab strip). §11: the active thumb is
// ringed INDIGO (border-primary ring-2 ring-primary), NEVER gold — gold is only the act moment on the
// chrome. §22: the color transition is gated on !reduceMotion; disabled during a render so a click can't
// swap the stage under an in-flight build. Token-only, AA both themes.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The minimum an item must carry: a stable id and an a11y name. Consumers extend it with their own
 *  payload (an image ref, a version, a page) and read it back in onSelect/renderThumb. */
export interface ArtifactStripItem {
  id: string;
  /** aria-label / accessible name for the thumb button. */
  label: string;
  /** Optional caption rendered UNDER the thumb (e.g. a tabular-nums "v3"). */
  caption?: ReactNode;
}

interface ArtifactStripProps<T extends ArtifactStripItem> {
  items: T[];
  /** The id that carries the indigo active ring — the item currently on the stage. */
  activeId: string | null;
  onSelect: (item: T) => void;
  /** Render the thumb's inner content (a real <img>, a scaled page, a numeral) — never a decorative
   *  glyph-in-a-box where a real thumbnail is available (§22). Fills the full thumb box. */
  renderThumb: (item: T) => ReactNode;
  /** Names the group for assistive tech ("Images in this set", "Version history", "Pages"). */
  ariaLabel: string;
  /** True while a render is in flight — the strip stays visible (reachable) but not clickable. */
  disabled?: boolean;
  reduceMotion?: boolean;
  /** Horizontal (image set / versions) or vertical (the left page rail). */
  orientation?: "horizontal" | "vertical";
  /** Override the default 14×14 square thumb (e.g. a portrait page tile). */
  thumbClassName?: string;
  className?: string;
}

export function ArtifactStrip<T extends ArtifactStripItem>({
  items,
  activeId,
  onSelect,
  renderThumb,
  ariaLabel,
  disabled = false,
  reduceMotion = false,
  orientation = "horizontal",
  thumbClassName,
  className,
}: ArtifactStripProps<T>) {
  const vertical = orientation === "vertical";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex max-w-full items-center gap-2",
        vertical ? "flex-col overflow-y-auto pr-1" : "overflow-x-auto pb-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <div key={item.id} className="flex shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              aria-label={item.label}
              // During a render the strip stays visible (tucked-away artifacts remain reachable) but is
              // not clickable — selecting mid-render would swap the stage under the build.
              disabled={disabled}
              onClick={() => !disabled && onSelect(item)}
              className={cn(
                "relative shrink-0 overflow-hidden rounded-lg border bg-muted/30 outline-none disabled:opacity-60",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active
                  ? "border-primary ring-2 ring-primary"
                  : "border-border/70 hover:border-primary/50",
                !reduceMotion && "transition-colors",
                thumbClassName ?? "h-14 w-14",
              )}
            >
              {renderThumb(item)}
            </button>
            {item.caption != null && (
              <span className="max-w-full text-[0.62rem] font-medium leading-none tabular-nums text-muted-foreground">
                {item.caption}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ArtifactStrip;
