// The generative-UI choice CARD (#343 / Upgrade 1) — the design agent's `ask_choices` tool can now
// return rich options (label + one-line description + optional preview thumbnail), and each one renders
// as a tappable card instead of a bare pill. This is NOT a new chat surface or a rival message router
// (§18): StudioChat's existing `paige_choices` render routes a rich option here and a bare {label,value}
// to the compact pill, so the one transcript keeps holding every decision (§21).
//
// §11 gold discipline: resting + hover + focus are indigo (--ring / --primary); gold is spent ONLY on
// the confirm ACT, which for a multi-select lives on StudioChat's "Continue" button — never on a resting
// or selected card here, and a single-select card sends on click (no persistent selected state).
//
// Why not SectionCard from @/components/ui/page: that primitive is a NON-interactive container on the
// general-admin card tokens (bg-card/border-border). This surface is the Studio chat, which runs on the
// --studio-chrome-* tokens, and a choice must BE a <button>. So the card is built on the studio tokens,
// matching the surrounding chat chrome, rather than forking the container primitive into a button.
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentChoiceCardOption {
  label: string;
  value: string;
  description?: string;
  icon?: string;
  preview?: string;
}

export function AgentChoiceCard({
  option,
  selected,
  multi,
  disabled,
  onSelect,
}: {
  option: AgentChoiceCardOption;
  /** Multi-select intermediate pick (indigo). Always false for single-select (it sends on click). */
  selected: boolean;
  multi: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role={multi ? "option" : "radio"}
      aria-checked={multi ? selected : undefined}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl border p-3 text-left",
        "transition-[background-color,border-color,box-shadow,transform] duration-150 motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-1 focus-visible:ring-offset-[hsl(var(--background))]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary/70 bg-[hsl(var(--ring)/0.14)]"
          : "border-[hsl(var(--studio-chrome-border)/0.6)] bg-[hsl(var(--foreground)/0.03)] hover:border-primary/50 hover:bg-[hsl(var(--foreground)/0.06)] hover:shadow-sm motion-safe:hover:-translate-y-0.5",
      )}
    >
      {option.preview ? (
        <img
          src={option.preview}
          alt=""
          aria-hidden
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-lg border border-[hsl(var(--studio-chrome-border)/0.5)] object-cover"
        />
      ) : option.icon ? (
        <span className="mt-0.5 shrink-0 text-lg leading-none" aria-hidden>{option.icon}</span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{option.label}</span>
          {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
        </span>
        {option.description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{option.description}</span>
        )}
      </span>
    </button>
  );
}

export default AgentChoiceCard;
