// The full-frame "Paige is building" presence — the cutscene canvas shared by every Studio
// artifact type. Extracted from GenerationExperience's page-only GenerationStage so Copy and
// Image get the IDENTICAL "submit → watch Paige build → land with the result" moment the page
// path already has (§18: one home for the presence, not a copy per mode; §11/§19).
//
// #240 makes this cutscene GAME-GRADE (§11 "video-game level" is the Studio measuring stick) —
// one primitive that upgrades page, copy, and image at once. Six layers, all CSS keyframes +
// framer-motion (no Canvas/WebGL this pass — that's #301):
//   1. a themed seam (--gp-* spread in, app --primary fallback so it's never un-themed),
//   2. a drifting brand-toned AURORA replacing the flat wash,
//   3. a LIVING PaigeMark (two-period halo + orbiting satellites + a spring entrance),
//   4. CHOREOGRAPHED narration that branches STRICTLY on regime,
//   5. parallax depth planes + a slow autonomous push-in, and
//   6. (owned by the caller) an AnimatePresence hand-off so the swap resolves, never hard-cuts.
//
// HONESTY IS THE DESIGN (§13) — the regime branch is the load-bearing rule. The PAGE path is a
// real streamed run: it hands a `beats` list + the REAL `activeIndex` (phaseRank), so the beat
// stack settles one line at a time as the seam genuinely advances, and the aurora/halo warm one
// step per phase. COPY/IMAGE are ONE non-streamed model call with NO measurable phases, so they
// run INDETERMINATE: a single rotating ambient line (never a checklist, never a check, no step
// mapping) + the honest elapsed clock, with energy easing off wall-clock only — nothing ever
// claims a phase or a percentage the seam can't report.
//
// Gold discipline (§6/§11): PaigeMark's own gradients are the ONLY gold here — the brand mark's
// inherent color, unchanged, just animated. Every surrounding layer (aurora, halos, satellites,
// beats, text) is indigo/token off --build-primary; the settled beat check is INDIGO, never gold.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { GP_FADE_RISE, GP_SHIMMER } from "@/components/growth/growth-motion";
import { cn } from "@/lib/utils";

/** One phase beat in the page-regime vertical stack. */
export interface BuildBeat {
  /** The teammate on Paige's crew who owns this beat (§8/§14). */
  agent: string;
  /** The real note for this phase — names work the seam actually performs (§13). */
  note: string;
}

export interface StudioBuildingScreenProps {
  /** The big narration line — the current phase's real note (indeterminate fallback / eyebrow). */
  note: string;
  /** Who on Paige's team owns this beat (§8/§14) — e.g. "Design agent", "Copy agent". */
  agent: string;
  /** Real elapsed milliseconds since the build started. */
  elapsedMs: number;
  /** Motion-safe: the caller passes useReducedMotion() so every layer stops animating. */
  reduce: boolean;
  /** A secondary detail line under the note (e.g. "Assembling 5 sections…"). Page path only. */
  detail?: string | null;
  /** An optional progress stepper. Legacy slot — the page path now renders its progress as the
   *  choreographed beat stack (see `beats`) instead, so this stays empty in practice. */
  stepper?: ReactNode;
  /** aria-label for the live region. */
  ariaLabel?: string;
  className?: string;
  /** The spreadable `--gp-*` map from resolveGrowthTheme (growth-theme.ts) — spread onto the root
   *  so the cutscene is toned to the tenant's brand. ABSENT → every color falls back to the app's
   *  hsl(var(--primary)) via --build-primary, so it is never rendered un-themed (§6). */
  themeVars?: Record<string, string>;
  /** Explicit regime. Page = false (real streamed phases → beat stack). Copy/image = true
   *  (one non-streamed call → ambient only). Defaults to `stepper == null` for back-compat. */
  indeterminate?: boolean;
  /** PAGE regime: the ordered phase beats. Rendered as a vertical stack that settles as
   *  `activeIndex` advances. Ignored when indeterminate. */
  beats?: BuildBeat[];
  /** PAGE regime: index of the active beat (phaseRank). Earlier beats read resolved, later ones
   *  pending; drives --build-energy so the field warms one step per phase. */
  activeIndex?: number;
  /** COPY/IMAGE regime: craft aphorisms to rotate through, one at a time, off the wall-clock.
   *  Ambient by construction — never implies ordered completion (§13). */
  rotation?: string[];
}

/** A blurred, brand-toned aurora blob. Positioned by top-left (no transform of our own, so the
 *  reused .gp-aurora-* keyframe fully owns the drift). Brightness eases with --build-energy. */
function auroraBlob(
  left: string,
  top: string,
  size: string,
  mixPct: number,
  base: number,
  gain: number,
): CSSProperties {
  return {
    left,
    top,
    width: size,
    height: size,
    borderRadius: "9999px",
    filter: "blur(46px)",
    background: `radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--build-primary) ${mixPct}%, transparent), transparent 70%)`,
    // Warms one step per phase (page) or eases off elapsed (copy/image); static under reduce.
    opacity: `calc(${base} + ${gain} * var(--build-energy, 0))`,
  };
}

/** The LIVING entity — PaigeMark, wrapped in a two-period halo, orbiting satellite sparks, and a
 *  spring entrance. PaigeMark itself is untouched (it's shared with the landing/sign-up surfaces);
 *  the "alive" upgrade is composed around it here so no other surface is affected (§18). */
function LivingMark({ reduce }: { reduce: boolean }) {
  const haloBg =
    "radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--build-primary) 42%, transparent), transparent 70%)";
  // Token-tinted satellite spark — indigo brand tone lifted toward white for a glint, never gold.
  const sparkBg = "color-mix(in srgb, var(--build-primary) 72%, white 28%)";
  const sparkGlow = "0 0 8px 1px color-mix(in srgb, var(--build-primary) 45%, transparent)";

  const orbit = (cls: string, radiusPct: number, sparkPx: number) => (
    <span
      aria-hidden
      className={cn("absolute rounded-full", !reduce && cls)}
      style={{ inset: `-${radiusPct}%`, transformOrigin: "center" }}
    >
      <span
        className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full"
        style={{
          width: sparkPx,
          height: sparkPx,
          background: sparkBg,
          boxShadow: sparkGlow,
          opacity: `calc(0.5 + 0.4 * var(--build-energy, 0))`,
        }}
      />
    </span>
  );

  const content = (
    <div className="relative grid h-24 w-24 place-items-center md:h-28 md:w-28">
      {/* Two halos at different periods → an irregular, living composite pulse. The reused
          .paige-halo-pulse carries a 24px origin for the SVG grid, so re-center it inline. */}
      <span
        aria-hidden
        className={cn("absolute inset-[-28%] rounded-full", !reduce && "paige-halo-pulse")}
        style={{
          background: haloBg,
          transformOrigin: "center",
          opacity: `calc(0.4 + 0.35 * var(--build-energy, 0))`,
        }}
      />
      <span
        aria-hidden
        className={cn("absolute inset-[-46%] rounded-full", !reduce && "paige-halo-pulse-b")}
        style={{ background: haloBg, opacity: `calc(0.25 + 0.3 * var(--build-energy, 0))` }}
      />
      {orbit("build-orbit-1", 34, 5)}
      {orbit("build-orbit-2", 20, 3.5)}
      {orbit("build-orbit-3", 48, 4)}
      <PaigeMark animated={!reduce} className="relative h-24 w-24 md:h-28 md:w-28" />
    </div>
  );

  if (reduce) return content;
  // Spring wobble on entrance — a settle from slightly small + rotated into place.
  return (
    <motion.div
      initial={{ scale: 0.8, rotate: -8, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 12, mass: 0.9 }}
    >
      {content}
    </motion.div>
  );
}

/** One row of the page-regime beat stack. Streams in on mount and spring-settles into a resolved
 *  state (a calm INDIGO check — never gold) as `done` flips; the active line carries a token
 *  shimmer. Under reduce it renders plainly, no spring, no shimmer. */
function BeatRow({
  beat,
  done,
  active,
  reduce,
}: {
  beat: BuildBeat;
  done: boolean;
  active: boolean;
  reduce: boolean;
}) {
  const Row = reduce ? "li" : motion.li;
  const rowMotion = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { type: "spring" as const, stiffness: 260, damping: 24 },
      };

  const icon = done ? (
    // Settled: a calm indigo check (§ spec — INDIGO not gold).
    reduce ? (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-primary">
        <Check className="h-3 w-3" />
      </span>
    ) : (
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 340, damping: 18 }}
        className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-primary"
      >
        <Check className="h-3 w-3" />
      </motion.span>
    )
  ) : active ? (
    <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  ) : (
    <span className="grid h-5 w-5 place-items-center rounded-full border border-border" aria-hidden />
  );

  return (
    <Row {...rowMotion} className="space-y-1">
      <div
        className={cn(
          "flex items-center gap-2.5 text-sm",
          done ? "text-muted-foreground" : active ? "font-medium text-foreground" : "text-muted-foreground/60",
        )}
      >
        {icon}
        <span className="min-w-0">
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wide",
              active ? "text-foreground" : "text-muted-foreground/70",
            )}
          >
            {beat.agent}
          </span>
          <span className="ml-2">{beat.note}</span>
        </span>
      </div>
      {/* The active line's work is in flight — an honest, indeterminate token shimmer, exactly the
          cue BuildProgress uses in the rail. No shimmer under reduce. */}
      {active && !reduce && <div className={cn("ml-[30px] h-1 rounded-full", GP_SHIMMER)} />}
    </Row>
  );
}

/**
 * The "Paige presence" cutscene — a themed aurora field, a living PaigeMark, choreographed
 * narration (branched on regime), and a live elapsed clock, on parallax depth planes with a slow
 * push-in. All motion is `reduce`-gated here AND no-oped in index.css (belt and suspenders).
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
  themeVars,
  indeterminate,
  beats,
  activeIndex = 0,
  rotation,
}: StudioBuildingScreenProps) {
  const seconds = Math.max(0, Math.round(elapsedMs / 1000));
  const isIndeterminate = indeterminate ?? stepper == null;

  // ── Energy (0..1) drives the aurora/halo/satellite brightness.
  //   PAGE: one step per phase off the REAL phaseRank — a genuine warm as the seam advances.
  //   COPY/IMAGE: eased off the wall-clock ONLY, zero per-phase reaction (there are no phases).
  //   Under reduce, the indeterminate wall-clock ramp is FROZEN to a fixed warm value — a reduce
  //   user opted out of continuous motion, and the elapsed ticker would otherwise animate the
  //   aurora/halo opacities for 20s (§11: every animation guarded by useReducedMotion). The page
  //   ramp stays live under reduce because it steps discretely off real phaseRank state, not a clock.
  const energy = isIndeterminate
    ? reduce
      ? 0.7
      : Math.min(1, elapsedMs / 20000)
    : beats && beats.length > 1
      ? Math.min(1, Math.max(0, activeIndex / (beats.length - 1)))
      : 0;

  // Catch focus when the build starts — same a11y reasoning as before: the composer rail goes
  // inert at the same instant, blurring whatever had focus; pulling it onto this live region
  // relocates it into the one place that stays interactive during the build (§13/a11y).
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  // Copy/image ambient line — rotate off the wall-clock, honest and phase-free. Frozen to the
  // base note under reduce so the surface stays calm.
  const rotationLine =
    isIndeterminate && rotation && rotation.length > 0 && !reduce
      ? rotation[Math.floor(elapsedMs / 3200) % rotation.length]
      : note;

  const rootStyle: CSSProperties = {
    ...(themeVars as CSSProperties | undefined),
    // The one color source for every layer below: the tenant brand primary, or the app token
    // when no themeVars were passed (copy/image today) — never un-themed (§6).
    ["--build-primary" as string]: "var(--gp-primary, hsl(var(--primary)))",
    ["--build-energy" as string]: energy.toFixed(3),
  };

  return (
    <div
      ref={stageRef}
      tabIndex={-1}
      role="status"
      aria-label={ariaLabel}
      style={rootStyle}
      className={cn(
        // h-full makes this the FULL-FRAME building screen: during an auto-run the conversation
        // rail is retracted to 0, so filling the canvas cell centers the presence in the whole
        // frame. min-h floors it on short screens; it hands to the real result the instant it
        // lands (§13). No gold here — a wait, not an act (§11).
        // The base is the deep indigo studio canvas (was platform bg-card — a flat gray box under
        // the aurora): the "video-game" build moment must glow on the brand field, not read as a
        // gray card (§11). The aurora + living mark paint on top of this deep indigo stage.
        "relative flex h-full min-h-[560px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-[hsl(var(--studio-chrome-border)/0.5)] bg-[hsl(var(--studio-canvas))] px-6 py-16 text-center",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        className,
      )}
    >
      {/* Layers 2 + 5 — brand-toned aurora on a slow autonomous push-in plane (parallax depth).
          Three blobs drift at different rates via the reused .gp-aurora-* keyframes. */}
      <div aria-hidden className={cn("pointer-events-none absolute inset-0", !reduce && "build-pushin")}>
        <div className={cn("gp-aurora-blob absolute", !reduce && "gp-aurora-a")} style={auroraBlob("14%", "2%", "66%", 26, 0.34, 0.26)} />
        <div className={cn("gp-aurora-blob absolute", !reduce && "gp-aurora-b")} style={auroraBlob("-10%", "40%", "54%", 20, 0.26, 0.22)} />
        <div className={cn("gp-aurora-blob absolute", !reduce && "gp-aurora-c")} style={auroraBlob("58%", "34%", "58%", 22, 0.26, 0.24)} />
      </div>

      {/* Fixed AA vignette — a scrim of the card color lifted through the middle so the eyebrow,
          beats, and clock keep AA contrast over the BRIGHTEST aurora frame (light AND dark). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(72% 62% at 50% 50%, hsl(var(--card) / 0.58), hsl(var(--card) / 0) 80%)",
        }}
      />

      {/* Layer 3 — the living mark on its own drift plane, drifting at a different rate than the
          aurora (parallax). */}
      <div className={cn("relative", !reduce && "build-drift-slow")}>
        <LivingMark reduce={reduce} />
      </div>

      {/* Layer 4 — choreographed narration, branched STRICTLY on regime (§13). */}
      {isIndeterminate ? (
        // COPY/IMAGE: a single rotating ambient line + the honest elapsed clock below. No stack,
        // no checks, no step mapping — nothing implies an ordered completion.
        <div
          key={reduce ? "static" : rotationLine}
          aria-live="polite"
          className={cn("relative mt-8 max-w-md space-y-2", !reduce && GP_FADE_RISE)}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {agent} · Paige's team
          </p>
          <p className="font-display text-xl font-semibold text-foreground md:text-2xl">{rotationLine}</p>
          {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        </div>
      ) : (
        // PAGE: the real phases as a vertical beat stack that settles as the seam advances. The
        // eyebrow rotates with the active phase's agent.
        <div className="relative mt-8 w-full max-w-sm">
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {agent} · Paige's team
          </p>
          <ul className="space-y-2.5 text-left" aria-live="polite">
            {(beats ?? []).map((b, i) => (
              <BeatRow key={b.note} beat={b} done={i < activeIndex} active={i === activeIndex} reduce={reduce} />
            ))}
          </ul>
          {detail && <p className="mt-3 text-center text-sm text-muted-foreground">{detail}</p>}
        </div>
      )}

      {stepper}

      <p className="relative mt-4 text-[11px] uppercase tracking-wide text-muted-foreground tabular-nums">
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
