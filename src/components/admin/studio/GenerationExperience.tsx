// The designed generation moment — the product demo.
//
// HONESTY IS THE DESIGN (§13). `growth-page-draft` returns ONE JSON payload; there is no
// token stream today. So there is NO percentage bar here, and there never will be until a
// real one exists — a fabricated % is a lie told at the exact moment the operator is
// deciding whether to trust this thing.
//
// What we show is all true:
//   · the PHASE, and each of the five names real work the seam actually performs
//   · the ELAPSED SECONDS, the one honest number during the indeterminate model call
//   · the SECTION COUNT, but only once the payload has landed and the count is real
//   · the BLOCKS THEMSELVES, drawn by the REAL <GrowthBlocks> as they materialize —
//     what you watch appear IS what publishes
import { AlertTriangle, Check } from "lucide-react";
import type { GrowthPageTheme } from "@/lib/growth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { GP_SHIMMER, useReducedMotion } from "@/components/growth/growth-motion";
import { cn } from "@/lib/utils";
import { LivePreview } from "./LivePreview";
import { GENERATION_NOTES } from "./studio-copy";
import type { DeviceFrame, GenerationPhase, GenerationState } from "./studio-types";

export interface GenerationExperienceProps {
  generation: GenerationState;
  /** Passed straight through to the real <GrowthBlocks> — the published page's prop set. */
  theme: GrowthPageTheme | null;
  brandFloor: GrowthPageTheme | null;
  /** Lets an embedded_form resolve a live form exactly as the published page does. */
  tenantId?: string;
  device: DeviceFrame;
  /** Aborts the in-flight run. ALWAYS wired — never a dead cancel button. */
  onCancel: () => void;
  /** Re-run after a failure. */
  onRetry?: () => void;
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

/** Before the payload lands we have no honest count — so we scaffold a page shape, not a
 *  promise of a specific number of sections. */
const SCAFFOLD_SKELETONS = 3;

function phaseRank(phase: GenerationPhase): number {
  if (phase === "done") return PHASE_ORDER.length;
  const i = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]);
  return i === -1 ? 0 : i;
}

export function GenerationExperience({
  generation,
  theme,
  brandFloor,
  tenantId,
  device,
  onCancel,
  onRetry,
  className,
}: GenerationExperienceProps) {
  const reduce = useReducedMotion();
  const { phase, emitted, total, elapsedMs, error } = generation;

  if (phase === "error") {
    return (
      <div className={cn("rounded-xl border border-border bg-card", className)}>
        <EmptyState
          icon={AlertTriangle}
          title="That didn't land"
          description={error?.message ?? GENERATION_NOTES.error}
          action={
            onRetry ? (
              <Button variant="outline" onClick={onRetry}>
                Try it again
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const current = phaseRank(phase);
  const seconds = Math.max(0, Math.round(elapsedMs / 1000));
  const trailing = total != null ? Math.max(0, total - emitted.length) : SCAFFOLD_SKELETONS;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-3" aria-live="polite">
            {PHASE_ORDER.map((p, i) => {
              const done = i < current;
              const active = i === current;
              if (!done && !active) {
                return (
                  <div key={p} className="flex items-center gap-2.5 text-sm text-muted-foreground/60">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border" aria-hidden />
                    <span>{GENERATION_NOTES[p]}</span>
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
                    <span>{GENERATION_NOTES[p]}</span>
                  </div>
                  {/* Indeterminate by design — we genuinely do not know how long the model
                      will take, and we will not invent a number. */}
                  {active && !reduce && <div className={cn("ml-[30px] h-1 rounded-full", GP_SHIMMER)} />}
                </div>
              );
            })}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="text-right">
              <div className="font-display text-2xl font-semibold tabular-nums text-foreground">{seconds}s</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {total != null ? `${emitted.length} of ${total} sections` : "Working"}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Stop
            </Button>
          </div>
        </div>
      </div>

      {/* The demo: every section that lands is drawn by the SAME renderer that ships it. */}
      <LivePreview
        blocks={emitted}
        theme={theme}
        brandFloor={brandFloor}
        tenantId={tenantId}
        device={device}
        trailingSkeletons={trailing}
        interactive={false}
        showFooter={trailing === 0}
      />
    </div>
  );
}

export default GenerationExperience;
