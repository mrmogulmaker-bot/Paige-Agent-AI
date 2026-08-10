// #12 — the shared conversation-compacting card. When a persisted thread's verbatim history gets
// long, the server folds the older turns into a rolling summary (cheap-model) so the chat can keep
// going without overflowing the model's context. That used to be SILENT; this card gives the coach a
// calm, honest heads-up while it happens, driven by the server's `paige_compacting` SSE frames.
//
// ONE home (§18), consumed only by the surfaces that PERSIST threads (owner/platform "Your Paige",
// Studio, broker). Non-persisting surfaces (client portal, floating widget) never compact, so they
// never render this — nothing fake is shown there (§13).
//
// Frame contract (server): { paige_compacting: { state, pct? } } where state ∈
//   approaching — the kept tail is nearing the fold budget (~80%+); no fold yet → a gentle heads-up.
//   start       — a fold began → indeterminate progress.
//   progress    — a fold step landed (pct 10/35/80/100) → determinate progress.
//   done        — the fold finished → hide.
//   skipped     — the fold errored/produced nothing; the turn CONTINUED uncompacted → a tiny,
//                 reassuring "kept your full history" note, never an alarm (§13 honest degrade).
//
// The ~80% is an ESTIMATE (chars/4 heuristic over an absolute fold budget — NOT an exact % of a
// model's context window), so the copy is deliberately non-technical: no raw percentage is shown to
// the coach (§36). The pct only drives the bar's fill during an actual fold.
//
// §11/§23: gold-FREE (gold is only the send act) — calm-power indigo (--ring/--primary). Token-only,
// AA in both themes, motion-safe (the shimmer freezes and the bar snaps under reduced motion).
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export type CompactingState =
  | "idle"
  | "approaching"
  | "start"
  | "progress"
  | "done"
  | "skipped";

export interface CompactingSignal {
  state: CompactingState;
  /** 0–100 fold progress; present on progress frames, optional on approaching. */
  pct?: number;
}

export function PaigeCompactingCard({
  signal,
  personaName,
  className,
}: {
  signal: CompactingSignal | null | undefined;
  /** The tenant's assistant name, for a native voice. Defaults to "Paige". */
  personaName?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const state = signal?.state ?? "idle";

  // The "approaching" heads-up is a pre-fold notice (no fold this turn), so nothing clears it from
  // the stream — auto-dismiss it after a readable beat so it doesn't linger past the turn (§36).
  // Fold states (start/progress) and skipped are cleared by their own done/next-send, untouched here.
  const [approachingDismissed, setApproachingDismissed] = useState(false);
  useEffect(() => {
    if (state !== "approaching") {
      setApproachingDismissed(false);
      return;
    }
    setApproachingDismissed(false);
    const id = window.setTimeout(() => setApproachingDismissed(true), 8000);
    return () => window.clearTimeout(id);
  }, [state]);

  // Nothing to show at rest, once the fold has finished, or after the approaching notice self-dismisses.
  if (state === "idle" || state === "done") return null;
  if (state === "approaching" && approachingDismissed) return null;

  const name = personaName?.trim() || "Paige";

  // Honest degrade: the fold didn't happen; the full history was kept and the turn continued.
  if (state === "skipped") {
    return (
      <div
        className={cn(
          "flex max-w-[85%] items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <Layers className="h-3 w-3 shrink-0 text-[hsl(var(--ring))]" aria-hidden />
        <span>Kept your full history — no changes needed.</span>
      </div>
    );
  }

  const approaching = state === "approaching";
  // Determinate only when a real progress pct is present; `start` is indeterminate.
  const pct =
    state === "progress" && typeof signal?.pct === "number"
      ? Math.max(0, Math.min(100, signal.pct))
      : null;

  const heading = approaching
    ? "Our conversation's getting long"
    : "Tidying up our conversation";
  const sub = approaching
    ? `${name} will neatly summarize the earlier part so you can keep chatting without missing a beat.`
    : `${name} is summarizing the earlier part so we can keep going smoothly. Your chat stays right here.`;

  return (
    <div
      className={cn(
        "max-w-[85%] rounded-xl border border-border bg-muted/25 px-3 py-2.5",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[hsl(var(--ring)/0.1)] ring-1 ring-inset ring-[hsl(var(--ring)/0.25)]">
          <Layers
            className={cn(
              "h-3.5 w-3.5 text-[hsl(var(--ring))]",
              !approaching && "motion-safe:animate-pulse",
            )}
            aria-hidden
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium leading-snug text-foreground">{heading}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{sub}</p>

          {/* Progress track — only while an actual fold is running (start/progress), not on the
              approaching heads-up. Determinate width when a pct is known; a slow indeterminate
              shimmer otherwise. Both freeze under reduced motion. */}
          {!approaching && (
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]"
              role="progressbar"
              aria-label="Compacting conversation"
              {...(pct != null
                ? { "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 }
                : {})}
            >
              {pct != null ? (
                <div
                  className="h-full rounded-full bg-[hsl(var(--ring))] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${pct}%` }}
                />
              ) : reduce ? (
                // Reduced motion, indeterminate: a static partial fill (no shimmer).
                <div className="h-full w-1/3 rounded-full bg-[hsl(var(--ring)/0.7)]" />
              ) : (
                <div className="h-full w-1/3 rounded-full bg-[hsl(var(--ring))] cc-indeterminate" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PaigeCompactingCard;
