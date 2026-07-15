// The generation runner for the Vibe Studio.
//
// This hook is the REACT side of the generate seam — it holds no IO of its own. All
// network work bottoms out in `draftPage()` from the studio seam layer (§10), so the
// Studio's Generate button and Paige's headless tool call the exact same function. One
// seam, two callers, no fork (§13).
//
// What it owns: the honest GenerationState. Five phases that each name real work the seam
// actually performs, an elapsed-seconds counter (the ONE true number during the model's
// indeterminate wait), the block-by-block materialization cadence, and a live abort path.
//
// What it deliberately does NOT own: a percentage. `growth-page-draft` returns a single
// JSON payload — there is no token stream — so any % we drew would be fabricated. We show
// the phase, the elapsed seconds, and (once the payload lands and the count is REAL) the
// section count. Nothing else. If the edge function later streams SSE, `draftPage`'s
// `onBlocks` callback starts firing per block and this file changes by zero lines.
import { useCallback, useEffect, useRef, useState } from "react";
import type { GrowthAssetKind, GrowthBlock } from "@/lib/growth";
import { useReducedMotion } from "@/components/growth/growth-motion";
import { draftPage, STUDIO_ERROR_COPY, type DraftPageResult } from "@/components/admin/studio/studio";
import {
  EMPTY_GENERATION,
  type GenerationPhase,
  type GenerationState,
  type StudioError,
  type StudioErrorCode,
} from "@/components/admin/studio/studio-types";
import { GENERATION_NOTES } from "@/components/admin/studio/studio-copy";

/** Phases during which a run is genuinely in flight — the only time the ticker runs. */
const RUNNING_PHASES: ReadonlySet<GenerationPhase> = new Set<GenerationPhase>([
  "brief",
  "brand",
  "drafting",
  "validating",
  "composing",
]);

/** Cadence of the staged reveal. The blocks are REAL by this point — we already hold the
 *  validated array — so this is a reveal, never a fake trickle. */
const REVEAL_STEP_MS = 150;
const REVEAL_LEAD_MS = 60;

/** Coerce anything thrown by the seam into a StudioError the operator can read (§11). */
function asStudioError(err: unknown, fallback: StudioErrorCode): StudioError {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    "message" in err &&
    typeof (err as StudioError).message === "string"
  ) {
    return err as StudioError;
  }
  return { code: fallback, message: STUDIO_ERROR_COPY[fallback], recoverable: true };
}

export interface UseGeneratePageResult {
  /** The whole honest picture of the run. The canvas draws `generation.emitted`. */
  generation: GenerationState;
  isGenerating: boolean;
  /** Runs the seam. Resolves with the payload, or null on error/abort — NEVER throws.
   *  Calling it while a run is in flight aborts the previous one first. */
  generate: (input: {
    brief: string;
    tone?: string;
    /** The clarifying step's questionnaire answer (§15), passed straight through to draftPage(). */
    questionnaireAnswer?: string;
    /** Up to 3 uploaded reference/deliverable files, passed straight through to draftPage(). */
    attachments?: { url: string; mediaType: string; kind: GrowthAssetKind }[];
  }) => Promise<DraftPageResult | null>;
  /** Abort the in-flight run. Phase → "idle". Also fired on unmount. */
  cancel: () => void;
  /** Clear the run back to idle (after the shell has absorbed the result). */
  reset: () => void;
}

export function useGeneratePage(tenantId: string | null): UseGeneratePageResult {
  const reduce = useReducedMotion();
  const [generation, setGeneration] = useState<GenerationState>(EMPTY_GENERATION);

  const abortRef = useRef<AbortController | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const reduceRef = useRef<boolean>(!!reduce);
  reduceRef.current = !!reduce;

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current != null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  // The elapsed ticker. Runs ONLY while a phase is actually running, and is torn down on
  // done / error / idle / unmount — no orphan interval outliving the run.
  useEffect(() => {
    if (!RUNNING_PHASES.has(generation.phase) || generation.startedAt == null) return;
    const id = window.setInterval(() => {
      setGeneration((g) =>
        RUNNING_PHASES.has(g.phase) && g.startedAt != null
          ? { ...g, elapsedMs: Date.now() - g.startedAt }
          : g,
      );
    }, 250);
    return () => window.clearInterval(id);
  }, [generation.phase, generation.startedAt]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
      if (revealTimerRef.current != null) window.clearTimeout(revealTimerRef.current);
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearRevealTimer();
    setGeneration(EMPTY_GENERATION);
  }, [clearRevealTimer]);

  const reset = useCallback(() => {
    clearRevealTimer();
    setGeneration(EMPTY_GENERATION);
  }, [clearRevealTimer]);

  /** Reveal the REAL blocks we already hold, through the REAL renderer, on a stagger that
   *  matches the canvas's own `fadeRiseStyle` cadence. Under reduced motion they all land
   *  at once — the phase copy still advances, so nothing is hidden from anyone. */
  const revealBlocks = useCallback(
    (blocks: GrowthBlock[], signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        setGeneration((g) => ({
          ...g,
          phase: "composing",
          note: GENERATION_NOTES.composing,
          total: blocks.length,
          emitted: [],
        }));

        if (reduceRef.current || blocks.length === 0) {
          setGeneration((g) => ({ ...g, emitted: blocks }));
          resolve();
          return;
        }

        let painted = 0;
        const step = () => {
          revealTimerRef.current = null;
          if (signal.aborted) {
            resolve();
            return;
          }
          painted += 1;
          const slice = blocks.slice(0, painted);
          setGeneration((g) => ({ ...g, emitted: slice }));
          if (painted >= blocks.length) {
            resolve();
            return;
          }
          revealTimerRef.current = window.setTimeout(step, REVEAL_STEP_MS);
        };
        revealTimerRef.current = window.setTimeout(step, REVEAL_LEAD_MS);
      }),
    [],
  );

  const generate = useCallback(
    async ({
      brief,
      tone,
      questionnaireAnswer,
      attachments,
    }: {
      brief: string;
      tone?: string;
      questionnaireAnswer?: string;
      attachments?: { url: string; mediaType: string; kind: GrowthAssetKind }[];
    }): Promise<DraftPageResult | null> => {
      const trimmed = brief.trim();

      if (!tenantId) {
        setGeneration({
          ...EMPTY_GENERATION,
          phase: "error",
          note: GENERATION_NOTES.error,
          error: { code: "NO_TENANT", message: STUDIO_ERROR_COPY.NO_TENANT, recoverable: false },
        });
        return null;
      }
      if (trimmed.length < 5) {
        setGeneration({
          ...EMPTY_GENERATION,
          phase: "error",
          note: GENERATION_NOTES.error,
          error: { code: "EMPTY_BRIEF", message: STUDIO_ERROR_COPY.EMPTY_BRIEF, recoverable: true },
        });
        return null;
      }

      abortRef.current?.abort();
      clearRevealTimer();
      const controller = new AbortController();
      abortRef.current = controller;

      setGeneration({
        ...EMPTY_GENERATION,
        phase: "brief",
        startedAt: Date.now(),
        note: GENERATION_NOTES.brief,
      });

      try {
        const result = await draftPage({
          tenantId,
          brief: trimmed,
          tone,
          questionnaireAnswer,
          attachments,
          signal: controller.signal,
          onPhase: (phase, note) =>
            setGeneration((g) =>
              g.phase === "error" ? g : { ...g, phase, note: note || GENERATION_NOTES[phase] },
            ),
          // Today the seam calls this once, with the full validated array. If growth-page-draft
          // starts streaming, it fires per block and the canvas paints as they land — same code.
          onBlocks: (blocks) =>
            setGeneration((g) =>
              g.phase === "error" ? g : { ...g, emitted: blocks, total: blocks.length },
            ),
        });

        if (controller.signal.aborted) return null;

        await revealBlocks(result.blocks, controller.signal);
        if (controller.signal.aborted) return null;

        setGeneration((g) => ({
          ...g,
          phase: "done",
          note: GENERATION_NOTES.done,
          emitted: result.blocks,
          total: result.blocks.length,
        }));
        return result;
      } catch (err) {
        clearRevealTimer();
        if (controller.signal.aborted) {
          setGeneration(EMPTY_GENERATION);
          return null;
        }
        setGeneration((g) => ({
          ...g,
          phase: "error",
          note: GENERATION_NOTES.error,
          error: asStudioError(err, "GENERATION_FAILED"),
        }));
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [tenantId, clearRevealTimer, revealBlocks],
  );

  return {
    generation,
    isGenerating: RUNNING_PHASES.has(generation.phase),
    generate,
    cancel,
    reset,
  };
}

export default useGeneratePage;
