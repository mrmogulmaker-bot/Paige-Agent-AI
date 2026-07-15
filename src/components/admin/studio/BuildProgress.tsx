// The build ticker — Paige's team, working, in the rail.
//
// Extracted from GenerationExperience so the progress narration lives NEXT TO the
// conversation (the left rail) while the canvas stays pure page. Same honesty rules as
// ever (§13): there is NO percentage bar here, and there never will be until a real one
// exists — `growth-page-draft` returns one JSON payload, so a fabricated % would be a lie
// told at the exact moment the operator is deciding whether to trust this thing.
//
// What it shows is all true:
//   · the PHASE, each of the five naming real work the seam actually performs,
//     attributed to the agent on Paige's team who owns it (§8/§14)
//   · the ELAPSED SECONDS, the one honest number during the indeterminate model call
//   · the SECTION COUNT, but only once the payload has landed and the count is real
import { Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GP_SHIMMER, useReducedMotion } from "@/components/growth/growth-motion";
import { cn } from "@/lib/utils";
import { GENERATION_NOTES, PHASE_AGENTS } from "./studio-copy";
import type { GenerationPhase, GenerationState } from "./studio-types";

export interface BuildProgressProps {
  generation: GenerationState;
  /** Aborts the in-flight run. ALWAYS wired — never a dead cancel button. */
  onCancel: () => void;
  className?: string;
}

/** The five phases, in order. Each one names work the seam genuinely does. */
const PHASE_ORDER: Exclude<GenerationPhase, "idle" | "done" | "error">[] = [
  "brief",
  "brand",
  "drafting",
  "validating",
  "composing",
];

function phaseRank(phase: GenerationPhase): number {
  if (phase === "done") return PHASE_ORDER.length;
  const i = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]);
  return i === -1 ? 0 : i;
}

export function BuildProgress({ generation, onCancel, className }: BuildProgressProps) {
  const reduce = useReducedMotion();
  const { phase, emitted, total, elapsedMs } = generation;

  // Errors narrate on the canvas (the existing EmptyState + Retry); idle has nothing to say.
  if (phase === "idle" || phase === "error") return null;

  const current = phaseRank(phase);
  const seconds = Math.max(0, Math.round(elapsedMs / 1000));

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      {/* The moat, stated plainly (§8/§14): this isn't one model spinning — it's Paige
          conducting her crew. Sold in indigo, never gold. */}
      <div className="mb-4 flex items-center gap-2.5 border-b border-border/60 pb-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden />
        </span>
        <p className="text-sm font-medium text-foreground">
          Paige and her team are building your page.
        </p>
      </div>

      <div className="space-y-3" aria-live="polite">
        {PHASE_ORDER.map((p, i) => {
          const done = i < current;
          const active = i === current && phase !== "done";
          const agent = PHASE_AGENTS[p];
          if (!done && !active) {
            return (
              <div key={p} className="flex items-center gap-2.5 text-sm text-muted-foreground/60">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border" aria-hidden />
                <span className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{agent}</span>
                  <span className="ml-2">{GENERATION_NOTES[p]}</span>
                </span>
              </div>
            );
          }
          return (
            <div key={p} className="space-y-1.5">
              <div
                className={cn(
                  "flex items-center gap-2.5 text-sm",
                  done ? "text-muted-foreground" : "font-medium text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full",
                    done
                      ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
                      : "bg-primary text-primary-foreground",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide",
                      done ? "text-muted-foreground/70" : "text-foreground",
                    )}
                  >
                    {agent}
                  </span>
                  <span className="ml-2">{GENERATION_NOTES[p]}</span>
                </span>
              </div>
              {/* Indeterminate by design — we genuinely do not know how long the model
                  will take, and we will not invent a number. */}
              {active && !reduce && <div className={cn("ml-[30px] h-1 rounded-full", GP_SHIMMER)} />}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <div>
          <span className="font-display text-xl font-semibold tabular-nums text-foreground">{seconds}s</span>
          <span className="ml-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            {total != null ? `${emitted.length} of ${total} sections` : "Working"}
          </span>
        </div>
        {phase !== "done" && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}

export default BuildProgress;
