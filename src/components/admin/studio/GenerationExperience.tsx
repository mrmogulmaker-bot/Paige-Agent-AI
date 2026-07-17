// The canvas half of the generation moment — the product demo.
//
// The phase ticker lives in BuildProgress (the Studio's left rail, next to the
// conversation); this component owns what happens ON the canvas while a run is in
// flight. Until the owner's screenshot review, that was a flat gray shimmer scaffold —
// "all you see is a blur." This file is the fix: a staged, Paige-branded "presence" that
// narrates the SAME true phase BuildProgress already tracks (GenerationStage, below),
// live and animated, then yields the instant real content starts landing.
//
// HONESTY IS THE DESIGN (§13): the phase note, the agent attribution, the elapsed
// seconds, and the section count are ALL real values pulled straight from
// `GenerationState` — nothing here is fabricated, and there is still no percentage
// (`growth-page-draft` returns one JSON payload, not a stream). Once the payload lands
// and the REAL blocks start materializing, they paint through the REAL <GrowthBlocks> —
// same renderer, same theme resolver, same footer child — and the stage steps aside.
// A failure narrates itself right here with a Retry; a dead model never paints a
// successful, empty page.
import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import type { GrowthPageTheme } from "@/lib/growth";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { GP_FADE_RISE, useReducedMotion } from "@/components/growth/growth-motion";
import { cn } from "@/lib/utils";
import { PHASE_ORDER, phaseRank } from "./BuildProgress";
import { LivePreview } from "./LivePreview";
import { GENERATION_NOTES, PHASE_AGENTS } from "./studio-copy";
import type { DeviceFrame, GenerationPhase, GenerationState } from "./studio-types";

export interface GenerationExperienceProps {
  generation: GenerationState;
  /** Passed straight through to the real <GrowthBlocks> — the published page's prop set. */
  theme: GrowthPageTheme | null;
  brandFloor: GrowthPageTheme | null;
  /** Lets an embedded_form resolve a live form exactly as the published page does. */
  tenantId?: string;
  device: DeviceFrame;
  /** Re-run after a failure. */
  onRetry?: () => void;
  className?: string;
}

/** Before the payload lands we have no honest count — so we scaffold a page shape, not a
 *  promise of a specific number of sections. */
const SCAFFOLD_SKELETONS = 3;

/** The phases the on-canvas stage knows how to narrate — exactly PHASE_AGENTS' keys. */
type StagePhase = keyof typeof PHASE_AGENTS;

function isStagePhase(phase: GenerationPhase): phase is StagePhase {
  return phase in PHASE_AGENTS;
}

interface GenerationStageProps {
  phase: StagePhase;
  note: string;
  total: number | null;
  emittedCount: number;
  elapsedMs: number;
  reduce: boolean;
  className?: string;
}

/**
 * The "Paige presence" — what the canvas shows BEFORE any real block has painted. This
 * replaces the old flat 3-box shimmer with a premium, staged visual: an animated
 * PaigeMark (the ring orbits, the orb breathes, the halo pulses, the spark drifts — all
 * CSS/SVG, gated by `reduce`), the current phase's real note blown up large, the agent
 * on Paige's team who owns that phase, and a five-dot stepper mirroring BuildProgress's
 * own phase order — so the rail and the canvas always tell the same story.
 *
 * Gold discipline (§6/§11): PaigeMark's own gradients are the ONLY gold here — the
 * brand mark's inherent color, unchanged, just animated. Every surrounding surface
 * (the ambient wash, the stepper, the text) is indigo/neutral, never gold-as-chrome.
 */
function GenerationStage({
  phase,
  note,
  total,
  emittedCount,
  elapsedMs,
  reduce,
  className,
}: GenerationStageProps) {
  const rank = phaseRank(phase);
  const seconds = Math.max(0, Math.round(elapsedMs / 1000));
  const agent = PHASE_AGENTS[phase];

  // Catch focus when the build starts. On a first build the composer's rail is made `inert` at the
  // same instant (the full-width transition), which per spec blurs whatever had focus and drops it
  // to <body> with no cue. Pulling focus onto this live, aria-live stage relocates it into the one
  // region that stays interactive during the build, so keyboard/AT users aren't stranded (§13/a11y).
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  // Once the payload has landed but before the first block has painted, the section
  // count is REAL — say so. Before that there's nothing to count yet, so we don't invent
  // a number (same rule BuildProgress already follows for its own count line).
  const detail =
    phase === "composing" && total != null && emittedCount === 0
      ? `Assembling ${total} section${total === 1 ? "" : "s"}…`
      : null;

  return (
    <div
      ref={stageRef}
      tabIndex={-1}
      role="status"
      aria-label="Paige is building your page"
      className={cn(
        "relative flex min-h-[560px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-card px-6 py-16 text-center",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        className,
      )}
    >
      {/* Ambient indigo field — purely atmospheric, never gold (§6/§11 gold discipline). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 46% at 50% 34%, hsl(var(--primary) / 0.12), transparent 72%)",
        }}
      />

      <PaigeMark animated={!reduce} className="relative h-24 w-24 md:h-28 md:w-28" />

      <div
        key={phase}
        aria-live="polite"
        className={cn("relative mt-8 max-w-md space-y-2", !reduce && GP_FADE_RISE)}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          {agent} · Paige's team
        </p>
        <p className="font-display text-xl font-semibold text-foreground md:text-2xl">{note}</p>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      </div>

      {/* The same five stages BuildProgress narrates in the rail — mirrored here so the
          canvas itself tells you what's happening, not just a side panel you might miss. */}
      <div className="relative mt-8 flex items-center gap-2" aria-hidden>
        {PHASE_ORDER.map((p, i) => {
          const done = i < rank;
          const active = i === rank;
          return (
            <span
              key={p}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] duration-300",
                done ? "w-4 bg-success" : active ? "w-6 bg-primary" : "w-1.5 bg-border-strong",
              )}
            />
          );
        })}
      </div>

      <p className="relative mt-3 text-[11px] uppercase tracking-wide text-muted-foreground tabular-nums">
        {seconds}s elapsed
      </p>
    </div>
  );
}

export function GenerationExperience({
  generation,
  theme,
  brandFloor,
  tenantId,
  device,
  onRetry,
  className,
}: GenerationExperienceProps) {
  const reduce = useReducedMotion();
  const { phase, emitted, total, error, note, elapsedMs } = generation;

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

  // Before the first REAL block has painted, show the "Paige presence" stage instead of a
  // blur. The instant a real block lands, this yields to the real renderer below — real
  // content always wins, never the other way around (§13).
  if (phase !== "done" && emitted.length === 0) {
    const stagePhase: StagePhase = isStagePhase(phase) ? phase : "brief";
    return (
      <GenerationStage
        className={className}
        phase={stagePhase}
        note={note || GENERATION_NOTES[stagePhase]}
        total={total}
        emittedCount={emitted.length}
        elapsedMs={elapsedMs}
        reduce={!!reduce}
      />
    );
  }

  const trailing = total != null ? Math.max(0, total - emitted.length) : SCAFFOLD_SKELETONS;

  return (
    <LivePreview
      className={className}
      blocks={emitted}
      theme={theme}
      brandFloor={brandFloor}
      tenantId={tenantId}
      device={device}
      trailingSkeletons={trailing}
      interactive={false}
      showFooter={trailing === 0}
    />
  );
}

export default GenerationExperience;
