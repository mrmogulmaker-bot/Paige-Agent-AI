import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one page frame. AdminLayout's <main> already owns outer padding
 * (p-3 sm:p-4 md:p-6), so PageShell must NOT re-pad — it only centers, caps
 * width, and sets a single vertical rhythm. This kills the container/max-w/
 * space-y drift the audit found across all 66 pages.
 *
 *   narrow  → forms & config       (max-w-2xl)
 *   default → standard admin pages (max-w-6xl)
 *   wide    → dashboards & tables  (max-w-[90rem])
 *   full    → edge-to-edge         (max-w-none)
 */
type Width = "narrow" | "default" | "wide" | "full";

const WIDTHS: Record<Width, string> = {
  narrow: "max-w-2xl",
  default: "max-w-6xl",
  wide: "max-w-[90rem]",
  full: "max-w-none",
};

export function PageShell({
  width = "default",
  children,
  className,
  fill = false,
}: {
  width?: Width;
  children: ReactNode;
  className?: string;
  /**
   * Pin the shell to the height its scroll parent gives it (lg+), so a split-pane
   * or inbox surface can flow through the app's `h-dvh → flex-1 → min-h-0` chain
   * and let ITS OWN columns own the scroll — instead of a magic `calc(100dvh-…)`
   * that undershoots the chrome and double-scrolls (the ClientsConversations bug).
   * Pair with a `lg:min-h-0 lg:flex-1` last child (the pane grid). Below lg the
   * shell stays a natural-flow block, so stacked mobile keeps normal page scroll.
   */
  fill?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-6 md:space-y-8",
        fill && "lg:flex lg:h-full lg:min-h-0 lg:flex-col",
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
