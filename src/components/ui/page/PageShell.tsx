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
}: {
  width?: Width;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-6 md:space-y-8", WIDTHS[width], className)}>
      {children}
    </div>
  );
}
