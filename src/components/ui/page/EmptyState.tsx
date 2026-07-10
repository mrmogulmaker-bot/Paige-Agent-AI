import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The crafted empty/blank surface — replaces every "No X yet." one-liner,
 * `return null` blank screen, and backend-name leak. Copy is mogul-founder
 * voice and NEVER surfaces table/function names.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "muted",
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "muted" | "brand";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon && (
        <span
          className={cn(
            "grid h-12 w-12 place-items-center rounded-xl mb-4",
            tone === "brand"
              ? "bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-light))] text-white/90 shadow-md ring-1 ring-inset ring-[hsl(var(--gold)/0.25)]"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </span>
      )}
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
