import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent toolbar/filter row. Use with shadcn Select/Input/Checkbox — the
 * native <select>/<input type=checkbox> the audit flagged are banned here.
 */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>{children}</div>
  );
}

/**
 * A filter pill. Active = indigo (bg-primary), NEVER gold — gold is reserved for
 * the act/approve/on moment, not a resting filter selection.
 */
export function FilterChip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : // Resting = a quiet hairline pill; hover brightens the edge AND the fill AND the label
            // together, so a filter chip has a real, felt pop instead of just swapping bg (#5).
            "border border-border bg-transparent text-muted-foreground hover:border-[hsl(var(--border-strong))] hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
