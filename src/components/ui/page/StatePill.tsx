import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillState = "on" | "off" | "pending" | "roadmap" | "included" | "error" | "success" | "warning";

/**
 * The state-carrying word-pill — generalized from the Marketplace SkillCard.
 * Retires the platform's badge color soup (bg-amber-100, emerald-500/15,
 * violet/rose/cyan, hardcoded hex, light-only tones).
 *
 * Gold discipline: `on`/live is the ONLY gold-filled pill — it IS the on moment.
 * `included` uses AA-safe gold-dark text. State is legible by LABEL, not color.
 */
const STYLES: Record<PillState, string> = {
  on: "bg-[hsl(var(--gold))] text-[hsl(var(--accent-foreground))]",
  included: "border border-[hsl(var(--gold)/0.5)] bg-transparent text-[hsl(var(--gold-dark))]",
  success: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
  pending: "bg-muted text-muted-foreground",
  roadmap: "bg-muted text-muted-foreground",
  off: "bg-muted text-muted-foreground",
  error: "bg-destructive/15 text-destructive",
};

const DEFAULT_LABEL: Record<PillState, string> = {
  on: "On", off: "Off", pending: "Pending", roadmap: "Roadmap",
  included: "Included", error: "Error", success: "Active", warning: "Warning",
};

export function StatePill({
  state,
  children,
  icon,
  className,
}: {
  state: PillState;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STYLES[state],
        className,
      )}
    >
      {icon}
      {children ?? DEFAULT_LABEL[state]}
    </span>
  );
}
