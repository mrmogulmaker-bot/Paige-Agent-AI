import { motion, useReducedMotion } from "framer-motion";
import { Clock, Lock, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { MarketplaceSkill } from "@/lib/marketplace/skills";

interface Props {
  skill: MarketplaceSkill;
  Icon: LucideIcon;
  isOn: boolean;
  available: boolean;
  lockedOn: boolean;
  saving: boolean;
  loading: boolean;
  justArmed: boolean;
  onToggle: (on: boolean) => void;
  onNotify: () => void;
}

/**
 * One capability in the Paige store. A glyph "plate" (not a tinted square), a
 * word-pill that carries state independent of color (Off / Live / Roadmap /
 * Included), and the enable moment lit in gold — the single act color (§6).
 */
export function SkillCard({
  skill, Icon, isOn, available, lockedOn, saving, loading, justArmed, onToggle, onNotify,
}: Props) {
  const reduce = useReducedMotion();

  // Word-pill (top-right) — state legible without relying on color.
  const StatePill = () => {
    if (lockedOn) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--gold)/0.5)] bg-transparent px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--gold-dark))]">
          <Lock className="h-3 w-3" /> Included
        </span>
      );
    }
    if (!available) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Clock className="h-3 w-3" /> Roadmap
        </span>
      );
    }
    if (isOn) {
      return (
        <motion.span
          initial={reduce ? false : { scale: 0.9 }}
          animate={{ scale: 1 }}
          className="inline-flex items-center rounded-full bg-[hsl(var(--gold))] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--accent-foreground))]"
        >
          Live
        </motion.span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Off
      </span>
    );
  };

  const footerMicrocopy = lockedOn
    ? "Included with your Funding coach type — manage it in Your Paige."
    : !available
      ? "On the roadmap."
      : isOn
        ? "On — Paige runs this with every client."
        : "Off — switch on to add it.";

  return (
    <motion.div
      layout
      whileHover={reduce ? undefined : { y: -2 }}
      className={cn(
        "group relative flex min-h-[15rem] flex-col rounded-[var(--radius)] border bg-card p-5 transition-shadow duration-200",
        isOn ? "border-[hsl(var(--gold)/0.55)]" : "border-border shadow-card hover:shadow-lg",
      )}
      style={isOn ? { boxShadow: "var(--shadow-glow)" } : undefined}
    >
      {/* top row: glyph plate + state pill */}
      <div className="flex items-start justify-between">
        <motion.span
          animate={justArmed && !reduce ? { scale: [1, 1.06, 1] } : undefined}
          transition={{ duration: 0.32 }}
          className={cn(
            "relative grid h-14 w-14 place-items-center rounded-xl shadow-md ring-1 ring-inset",
            "bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-light))]",
            isOn ? "ring-[hsl(var(--gold)/0.6)]" : "ring-[hsl(var(--gold)/0.25)]",
          )}
        >
          <Icon className="h-6 w-6 text-white/90" aria-hidden />
          {!available && (
            <span
              className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.06]"
              style={{ background: "repeating-linear-gradient(45deg,hsl(var(--primary)) 0 6px,transparent 6px 12px)" }}
              aria-hidden
            />
          )}
        </motion.span>
        <StatePill />
      </div>

      <h3 className="mt-4 text-base font-semibold leading-tight text-foreground">{skill.name}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{skill.tagline}</p>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground/90">{skill.description}</p>

      {/* footer control row */}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium",
          isOn || lockedOn ? "text-[hsl(var(--gold-dark))]" : "text-muted-foreground")}>
          {(isOn || lockedOn) && <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))]" />}
          {footerMicrocopy}
        </span>

        {available ? (
          <Switch
            checked={isOn}
            disabled={saving || loading || lockedOn}
            onCheckedChange={onToggle}
            aria-label={`Toggle ${skill.name}`}
            className="shrink-0 data-[state=checked]:bg-[hsl(var(--gold))] focus-visible:ring-[hsl(var(--ring))]"
          />
        ) : lockedOn ? (
          <a
            href="/admin/your-paige"
            className="shrink-0 rounded text-xs font-medium text-[hsl(var(--primary))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            Manage →
          </a>
        ) : (
          <button
            type="button"
            onClick={onNotify}
            className="shrink-0 inline-flex items-center gap-1 rounded text-xs font-medium text-[hsl(var(--primary))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            <Sparkles className="h-3 w-3" /> Notify me
          </button>
        )}
      </div>
    </motion.div>
  );
}
