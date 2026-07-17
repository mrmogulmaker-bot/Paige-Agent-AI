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
import { AlertTriangle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { GrowthPageTheme } from "@/lib/growth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { useReducedMotion } from "@/components/growth/growth-motion";
import { resolveGrowthTheme } from "@/components/growth/growth-theme";
import { cn } from "@/lib/utils";
import { PHASE_ORDER, phaseRank } from "./BuildProgress";
import { LivePreview } from "./LivePreview";
import { StudioBuildingScreen, type BuildBeat } from "./StudioBuildingScreen";
import { GENERATION_NOTES, PHASE_AGENTS } from "./studio-copy";
import type { DeviceFrame, GenerationPhase, GenerationState } from "./studio-types";

/** The five real phases as beats for the cutscene's vertical stack — the SAME order + notes +
 *  agents BuildProgress narrates in the rail, so the canvas and the rail never disagree (§13). */
const PHASE_BEATS: BuildBeat[] = PHASE_ORDER.map((p) => ({
  agent: PHASE_AGENTS[p],
  note: GENERATION_NOTES[p],
}));

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
  /** The tenant-brand `--gp-*` map, so the cutscene aurora/halo tone to THIS page's brand. */
  themeVars: Record<string, string>;
  className?: string;
}

/**
 * The page path's "Paige presence" — the shared StudioBuildingScreen run in its DETERMINATE
 * regime (`indeterminate={false}`): fed the real five phase beats and the REAL active index
 * (phaseRank) so the vertical beat stack settles one line at a time as the seam genuinely
 * advances, and the brand-toned aurora/halo warm one step per phase. Same order + notes + agents
 * BuildProgress narrates in the rail — the canvas and the rail never disagree (§13). The full-frame
 * presence, aurora, living PaigeMark, and elapsed clock all live in the shared primitive now
 * (§18 — one home), so copy/image render the identical cutscene, minus the phase beats.
 */
function GenerationStage({
  phase,
  note,
  total,
  emittedCount,
  elapsedMs,
  reduce,
  themeVars,
  className,
}: GenerationStageProps) {
  const rank = phaseRank(phase);
  const agent = PHASE_AGENTS[phase];

  // Once the payload has landed but before the first block has painted, the section
  // count is REAL — say so. Before that there's nothing to count yet, so we don't invent
  // a number (same rule BuildProgress already follows for its own count line).
  const detail =
    phase === "composing" && total != null && emittedCount === 0
      ? `Assembling ${total} section${total === 1 ? "" : "s"}…`
      : null;

  return (
    <StudioBuildingScreen
      className={className}
      note={note}
      agent={agent}
      elapsedMs={elapsedMs}
      reduce={reduce}
      detail={detail}
      ariaLabel="Paige is building your page"
      themeVars={themeVars}
      indeterminate={false}
      beats={PHASE_BEATS}
      activeIndex={rank}
    />
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

  // Tone the cutscene to THIS page's resolved brand — the SAME resolver the live preview and the
  // published page use, so the building screen's aurora/halo match what lands (§6/§18). Cheap and
  // pure; recompute inline (theme/brandFloor are stable across a run).
  const themeVars = resolveGrowthTheme(theme, brandFloor);

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
  const showStage = phase !== "done" && emitted.length === 0;
  const stagePhase: StagePhase = isStagePhase(phase) ? phase : "brief";
  const trailing = total != null ? Math.max(0, total - emitted.length) : SCAFFOLD_SKELETONS;

  // HAND-OFF (§ layer 6): the swap from cutscene → real page is a RESOLVE, not a hard cut — the
  // field calms and recedes as the page springs up. AnimatePresence with mode="wait" runs the
  // exit before the enter; both are reduce-gated so under reduced-motion the swap is instant.
  return (
    <AnimatePresence mode="wait" initial={false}>
      {showStage ? (
        <motion.div
          key="cutscene"
          className="h-full"
          exit={reduce ? undefined : { opacity: 0, scale: 0.985, filter: "blur(4px)" }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <GenerationStage
            className={className}
            phase={stagePhase}
            note={note || GENERATION_NOTES[stagePhase]}
            total={total}
            emittedCount={emitted.length}
            elapsedMs={elapsedMs}
            reduce={!!reduce}
            themeVars={themeVars}
          />
        </motion.div>
      ) : (
        <motion.div
          key="page"
          className="h-full"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 20 }}
        >
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default GenerationExperience;
