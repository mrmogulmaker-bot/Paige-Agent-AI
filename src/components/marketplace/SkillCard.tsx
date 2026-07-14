import { motion, useReducedMotion } from "framer-motion";
import { Clock, Lock } from "lucide-react";
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
  /** Open the full detail view (whole card is a stretched-link overlay button). */
  onOpen?: () => void;
}

/**
 * One capability in the Paige store. A glyph "plate", a word-pill that carries
 * state independent of color (Off / Live / Roadmap / Included), and the enable
 * moment lit in gold — the single act color (§6/§11). Gold is reserved strictly
 * to the Switch-checked fill and the "Live" pill; nothing at rest is gold.
 *
 * Openable via a "stretched-link" overlay button (a11y): the openable control is
 * a SIBLING of the Switch/links (higher-z controls sit above the overlay), so no
 * interactive control is nested inside another.
 */
export function SkillCard({
  skill, Icon, isOn, available, lockedOn, saving, loading, justArmed, onToggle, onOpen,
}: Props) {
  const reduce = useReducedMotion();

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
    ? "Included with your Funding playbook — manage it in Your Paige."
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
        isOn
          ? "border-[hsl(var(--primary)/0.4)] shadow-lg"
          : "border-border shadow-card hover:shadow-lg",
      )}
    >
      {/* Stretched-link overlay: the openable control. Sits above static content
          (so clicking the card body opens details) but BELOW the interactive
          footer controls (z-20), so no control is nested inside another. */}
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${skill.name} details`}
          className="absolute inset-0 z-10 rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        />
      )}

      {/* top row: glyph plate + state pill (static — clicks fall through to overlay) */}
      <div className="flex items-start justify-between">
        <motion.span
          animate={justArmed && !reduce ? { scale: [1, 1.06, 1] } : undefined}
          transition={{ duration: 0.32 }}
          className={cn(
            "relative grid h-14 w-14 place-items-center rounded-xl shadow-md ring-1 ring-inset ring-border",
            "bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-light))]",
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

      {/* footer control row — sits above the overlay so its controls own their clicks */}
      <div className="relative z-20 mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {footerMicrocopy}
        </span>

        {available && !lockedOn ? (
          <Switch
            checked={isOn}
            disabled={saving || loading}
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
          <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Coming soon
          </span>
        )}
      </div>
    </motion.div>
  );
}
