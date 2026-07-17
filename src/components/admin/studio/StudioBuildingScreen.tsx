// The full-frame "Paige is building" presence — the cutscene canvas shared by every Studio
// artifact type. Extracted verbatim from GenerationExperience's page-only GenerationStage so
// Copy and Image get the IDENTICAL "submit → watch Paige build → land with the result" moment
// the page path already has (§18: one home for the presence, not a copy per mode; §11/§19).
//
// Presentational only — zero IO. The caller owns the narration (which agent, what note), the
// elapsed clock, and any progress stepper. HONESTY IS THE DESIGN (§13): this screen shows only
// what the caller passes. The page path hands it a REAL streamed phase note + a real 5-dot
// stepper; copy/image (a single non-streamed model call with no measurable phases) run it
// INDETERMINATE — the breathing PaigeMark + a real elapsed timer, and NO stepper — so nothing
// ever claims progress it can't measure.
//
// Gold discipline (§6/§11): PaigeMark's own gradients are the ONLY gold here — the brand mark's
// inherent color, unchanged, just animated. Every surrounding surface (the ambient wash, the
// stepper, the text) is indigo/neutral. This is a wait, not an act — no gold chrome.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { GP_FADE_RISE } from "@/components/growth/growth-motion";
import { cn } from "@/lib/utils";

export interface StudioBuildingScreenProps {
  /** The big narration line — the current phase's real note. */
  note: string;
  /** Who on Paige's team owns this beat (§8/§14) — e.g. "Design agent", "Copy agent". */
  agent: string;
  /** Real elapsed milliseconds since the build started. */
  elapsedMs: number;
  /** Motion-safe: the caller passes useReducedMotion() so PaigeMark and the note stop animating. */
  reduce: boolean;
  /** A secondary detail line under the note (e.g. "Assembling 5 sections…"). Page path only. */
  detail?: string | null;
  /** An optional progress stepper. The page path passes its real 5-dot phase order; copy/image
   *  pass nothing — indeterminate, no fabricated progress (§13). */
  stepper?: ReactNode;
  /** aria-label for the live region. */
  ariaLabel?: string;
  className?: string;
}

/**
 * The "Paige presence" — an animated PaigeMark (ring orbits, orb breathes, halo pulses, spark
 * drifts — all CSS/SVG, gated by `reduce`), the current note blown up large, the agent on
 * Paige's team who owns it, an optional stepper slot, and a live elapsed clock.
 */
export function StudioBuildingScreen({
  note,
  agent,
  elapsedMs,
  reduce,
  detail = null,
  stepper,
  ariaLabel = "Paige is building",
  className,
}: StudioBuildingScreenProps) {
  const seconds = Math.max(0, Math.round(elapsedMs / 1000));

  // Catch focus when the build starts — same a11y reasoning as the page path: the composer rail
  // goes inert at the same instant (the full-width transition), which blurs whatever had focus
  // and drops it to <body> with no cue. Pulling focus onto this live, aria-live region relocates
  // it into the one place that stays interactive during the build, so keyboard/AT users aren't
  // stranded (§13/a11y).
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  return (
    <div
      ref={stageRef}
      tabIndex={-1}
      role="status"
      aria-label={ariaLabel}
      className={cn(
        // h-full makes this the FULL-FRAME building screen: during an auto-run the conversation
        // rail is retracted to 0 (the immersive flag), so filling the canvas cell's height lets the
        // Paige presence sit centered in the whole frame. min-h keeps a floor on short screens; it
        // hands to the real result the instant it lands (§13). No gold here — a wait, not an act (§11).
        "relative flex h-full min-h-[560px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-card px-6 py-16 text-center",
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
        key={note}
        aria-live="polite"
        className={cn("relative mt-8 max-w-md space-y-2", !reduce && GP_FADE_RISE)}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          {agent} · Paige's team
        </p>
        <p className="font-display text-xl font-semibold text-foreground md:text-2xl">{note}</p>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      </div>

      {stepper}

      <p className="relative mt-3 text-[11px] uppercase tracking-wide text-muted-foreground tabular-nums">
        {seconds}s elapsed
      </p>
    </div>
  );
}

/**
 * A real elapsed-time clock for callers without a streamed phase timer (copy/image). Returns ms
 * since `active` last flipped true; resets to 0 whenever it goes false. Ticks every 250ms so the
 * whole-seconds line updates promptly without a busy loop. HONEST (§13): it measures wall-clock
 * time actually spent, never a fabricated percentage.
 */
export function useElapsedMs(active: boolean): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) {
      setMs(0);
      return;
    }
    const start = Date.now();
    setMs(0);
    const id = window.setInterval(() => setMs(Date.now() - start), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return ms;
}

export default StudioBuildingScreen;
