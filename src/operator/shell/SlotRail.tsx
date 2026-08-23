/**
 * The rail — column 1 of the shell. Six slots, flat, in the IA's order.
 *
 * Geometry is the pack's (`v3.dc.html` L88-L124): a column flex `<nav>` at `18px 13px 14px`,
 * a brand lockup, a scrolling destination list, and a foot pinned with `margin-top:auto`.
 * The list is a grid whose single track is `minmax(0,1fr)` — that track-min is what stops one
 * long destination label from widening the rail (rule 4, the defect that landed six times).
 *
 * FLAT, NOT GROUPED, AND NOT NINE ROWS. The shell this replaces carried seventeen branches in
 * two collapsible groups and needed a ResizeObserver to keep them on screen; six slots need
 * neither, so neither is here (§30 — strip, do not layer). A rail slot is a body of work with
 * its own objects; everything else is a view, a summoned surface, or a mechanism.
 *
 * `data-slot` is on every row deliberately: it is the seam the shell harness measures slot
 * ORDER through, so the contract is observable from outside React.
 */
import { NavLink } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { OPERATOR_SLOTS } from "@/operator/ia/operatorIA";
import { slotGlyph } from "@/operator/shell/slotGlyphs";
import { slotPath } from "@/operator/shell/operatorAddress";
import { CommandMark } from "@/operator/shell/CommandMark";
import { cn } from "@/lib/utils";

export type SlotRailProps = {
  readonly compact: boolean;
  readonly onToggleCompact: () => void;
  readonly isDark: boolean;
  readonly onToggleTheme: () => void;
  readonly onSignOut: () => void;
};

export default function SlotRail({
  compact, onToggleCompact, isDark, onToggleTheme, onSignOut,
}: SlotRailProps) {
  const reduce = useReducedMotion();

  const footRow = cn(
    "flex min-h-[40px] min-w-0 items-center gap-3 rounded-[9px] px-[11px] text-left",
    "text-rail-muted hover:text-rail-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    compact && "justify-center px-0",
  );

  return (
    <nav
      data-operator-rail
      aria-label="Destinations"
      className={cn(
        "relative z-[3] flex min-h-0 min-w-0 flex-col overflow-hidden",
        "border-r border-border-strong bg-[var(--pg-nav)] text-rail-foreground",
        "px-[13px] pb-[14px] pt-[18px]",
      )}
    >
      {/* Brand lockup. flex-none: it never competes with the list for height. */}
      <div className={cn("mb-4 flex min-w-0 flex-none items-center gap-3", compact && "justify-center")}>
        {/* No `state` while nothing is running — the resting treatment is the honest
            default, and a mark that pulses at charged speed on an idle console is the
            motion rule broken. State gets wired when the command bar lands. */}
        <CommandMark />
        {!compact && (
          <span className="flex min-w-0 flex-col">
            <b className="block truncate text-[11px] font-medium tracking-[0.4em] text-rail-foreground">
              PAIGE
            </b>
            <small className="mt-1 block truncate font-mono text-[11px] tracking-[0.08em] text-rail-muted">
              PLATFORM OPERATOR
            </small>
          </span>
        )}
      </div>

      {/* The destination list. Its own scroll region — the document never scrolls. */}
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-px overflow-y-auto overflow-x-hidden">
        {OPERATOR_SLOTS.map((slot) => {
          const path = slotGlyph(slot.id);
          return (
            <NavLink
              key={slot.id}
              to={slotPath(slot.id)}
              data-slot={slot.id}
              title={slot.label}
              className={({ isActive }) =>
                cn(
                  "relative flex min-h-[44px] min-w-0 items-center gap-3 rounded-[9px] px-[11px] text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !reduce && "transition-colors duration-200",
                  compact && "justify-center px-0",
                  isActive
                    ? "bg-rail-foreground/10 text-rail-foreground"
                    : "text-rail-muted hover:text-rail-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* The pack's active tab: a 1px gold rule on the leading edge, spent on the
                      selected state and nothing else (§11 — gold marks the on moment). */}
                  <i
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute left-0 top-1/2 w-px -translate-y-1/2 rounded-full bg-cd-gold",
                      !reduce && "transition-[height] duration-200",
                      isActive ? "h-6" : "h-0",
                    )}
                  />
                  {path ? (
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      className={cn(
                        "h-4 w-4 flex-none",
                        !reduce && "transition-colors duration-200",
                        "text-current",
                      )}
                    >
                      <path
                        d={path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="square"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                  {!compact && (
                    <span className="min-w-0 flex-1 truncate text-[13px]">{slot.label}</span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Foot. `mt-auto` pins it; the list above it is what flexes. */}
      <div className="mt-auto grid min-w-0 gap-px border-t border-rail-foreground/15 pt-3">
        <button type="button" onClick={onToggleTheme} className={footRow}
          aria-label={isDark ? "Switch to the light theme" : "Switch to the dark theme"}>
          <i
            aria-hidden
            className="h-3 w-3 flex-none rounded-full border border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]"
          />
          {!compact && <span className="min-w-0 flex-1 truncate text-[13px]">{isDark ? "Obsidian" : "Mineral"}</span>}
        </button>

        <button type="button" onClick={onToggleCompact} className={footRow}
          aria-label={compact ? "Expand the rail" : "Collapse the rail"} aria-expanded={!compact}>
          <i
            aria-hidden
            className={cn(
              "h-2.5 w-2.5 flex-none border-l border-t border-current",
              compact ? "rotate-[135deg]" : "-rotate-45",
            )}
          />
          {!compact && <span className="min-w-0 flex-1 truncate text-[13px]">Collapse rail</span>}
        </button>

        {/* §58 — the console's ONLY sign-out path. It came over from the shell this replaces
            rather than being dropped with the chrome that happened to host it. */}
        <button type="button" onClick={onSignOut} className={footRow} aria-label="Sign out">
          <i aria-hidden className="h-2.5 w-2.5 flex-none rotate-45 border-r border-t border-current" />
          {!compact && <span className="min-w-0 flex-1 truncate text-[13px]">Sign out</span>}
        </button>
      </div>
    </nav>
  );
}
