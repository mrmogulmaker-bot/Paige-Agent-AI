import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SectionNote — the one-line "quiet row" for an empty/passive section.
 *
 * Deliberately sits ONE elevation step BELOW `SectionCard`: hairline border +
 * `bg-muted/30`, NO `shadow-card`. That keeps the elevation ladder intact —
 * a raised `SectionCard` (hero) reads above a flat `SectionNote` (quiet/footer) —
 * and lets the note render as an INSET when placed inside a card body (a muted
 * panel on `bg-card`), never a card-on-card double-shadow.
 *
 * The note IS the row: it replaces the tall `EmptyState` (`px-6 py-12`) plate for
 * subsections that are empty-until-a-producer-writes (scoreboard, handoff,
 * assignments) and for a footer roadmap strip. Reserve `EmptyState` for a genuine
 * first-run hero empty.
 *
 * Token-only, AA in both themes, gold-free (an act belongs in `action` as a ghost
 * button / a muted `StatePill`, never a resting gold).
 */
export function SectionNote({
  icon: Icon,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  /** Trailing affordance (ghost CTA or muted StatePill), pinned right. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius)] border border-border bg-muted/30 px-4 py-2.5",
        className,
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="min-w-0 truncate text-sm text-muted-foreground">{children}</span>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}
