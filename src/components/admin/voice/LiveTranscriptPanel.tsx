// #140 B2 — the live-call co-pilot transcript panel.
//
// While a call is LIVE, the transcript streams into a DIMENSIONAL panel: a right-edge
// rail on landscape (§48 landscape-primary), a bottom sheet-card on mobile (a call can
// come in anywhere). Mounted ONCE in AdminLayout (next to <DialPadSurface/> and
// <IncomingCallOverlay/>), so it appears on ANY surface the moment a call goes live.
//
// DOCTRINE
//  §18  REUSES the shipped SectionCard rail primitive (@/components/ui/page) for the
//       card chrome — the SAME shape ContactCardRail uses — never a hand-rolled card.
//       Reads the ONE VoiceDeviceProvider (useVoiceDevice); no second Device, no fork.
//  §9 / #557  The transcript itself arrives on a PRIVATE realtime channel gated by the
//       realtime.messages RLS policy — a tenant can only ever see its OWN call (the
//       subscription lives in the provider via useLiveTranscript).
//  §13  Honest states, never a blank: "Listening…" before any transcript,
//       "Reconnecting…" on a dropped channel, the frozen transcript after the call ends
//       (until dismissed). needs_config (calling not provisioned) → the panel never
//       mounts (no dead surface).
//  §22  Motion earns its pixels and is per-effect reduced-motion-safe: the panel
//       slides in, NEW final lines animate in, the live dot pulses — all frozen flat
//       under useReducedMotion.
//  §11/§23  Token-only, AA both themes, indigo focus ring. NO gold — this panel has no
//       act/approve moment; the live indicator is a semantic status, not a gold "on".
//  §3   Plain, jargon-free copy — no product/table names, no "AI".
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Radio, X, Loader2, AudioLines } from "lucide-react";
import { SectionCard } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceDevice } from "@/lib/voice/VoiceDeviceProvider";
import type { TranscriptLine, TranscriptState } from "@/lib/voice/useLiveTranscript";

/** Header status pill — reflects the honest subscription state (§13). */
function StatusPill({ state, live }: { state: TranscriptState; live: boolean }) {
  const reduce = useReducedMotion();
  // Post-call (not live) → a settled "Call ended". Live → the subscription state.
  const label = !live
    ? "Call ended"
    : state === "reconnecting"
      ? "Reconnecting…"
      : state === "live"
        ? "Live"
        : "Listening…";
  // Semantic color, token-only. The warning HUE is carried by the DOT fill only — amber
  // as TEXT fails AA on a light surface (there is one --warning token, no darker
  // on-surface variant), so the reconnecting LABEL stays foreground-weight and legible in
  // both themes (§11/§23/§29); live/listening label → primary; ended → muted. Never gold.
  const tone =
    !live
      ? "text-muted-foreground"
      : state === "reconnecting"
        ? "text-foreground"
        : "text-[hsl(var(--primary))]";
  const dotBg =
    !live
      ? "bg-muted-foreground/60"
      : state === "reconnecting"
        ? "bg-[hsl(var(--warning))]"
        : "bg-[hsl(var(--primary))]";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", tone)}>
      <span className="relative flex h-2 w-2">
        {live && !reduce && state !== "reconnecting" && (
          <span className={cn("absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping", dotBg)} aria-hidden />
        )}
        <span className={cn("relative h-2 w-2 rounded-full", dotBg)} />
      </span>
      {label}
    </span>
  );
}

/** One transcript line. Finals are solid; the in-progress interim is dimmer + italic. */
function Line({ line, reduce }: { line: TranscriptLine; reduce: boolean | null }) {
  // Forward-compat speaker alignment: "You" → right/indigo, "Client"/unknown → left.
  // The current mono fork carries no speaker, so every line is a single honest stream.
  const isYou = line.speaker === "You";
  const bubble = (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug",
        isYou
          ? "rounded-br-sm bg-[hsl(var(--primary)/0.12)] text-foreground"
          : "rounded-bl-sm bg-muted text-foreground",
        // Interim (still-being-spoken) stays FOREGROUND-weight — it's the operator's focal,
        // newest content, so it must be the most legible, not the dimmest (§36/§11). Italic
        // + a live caret carry the "in progress" cue instead of dropping the text color.
        !line.isFinal && "italic",
      )}
    >
      {line.speaker && (
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {line.speaker}
        </span>
      )}
      {line.text}
      {!line.isFinal && (
        <span
          className={cn(
            "ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 rounded-full bg-[hsl(var(--primary))] align-middle",
            !reduce && "motion-safe:animate-pulse",
          )}
          aria-hidden
        />
      )}
    </div>
  );
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={cn("flex w-full", isYou ? "justify-end" : "justify-start")}
    >
      {bubble}
    </motion.div>
  );
}

export function LiveTranscriptPanel() {
  const voice = useVoiceDevice();
  const reduce = useReducedMotion();

  const [dismissed, setDismissed] = useState(false);
  // The transcript captured at the moment the call ended, held until the operator
  // dismisses it (the provider clears its live buffer when the call goes idle).
  const [frozen, setFrozen] = useState<TranscriptLine[] | null>(null);
  const liveRef = useRef<TranscriptLine[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const inCall = voice?.status === "in_call";
  const liveTranscript = voice?.liveTranscript;

  // Mirror the live lines while the call is up, so we can freeze the final transcript
  // even though the provider tears its buffer down the instant the call ends.
  useEffect(() => {
    if (inCall) liveRef.current = liveTranscript ?? [];
  }, [inCall, liveTranscript]);

  // On call start: reveal + drop any prior frozen snapshot. On call end WITH content:
  // freeze it (persist until dismissed). A call that produced nothing leaves frozen null
  // → the panel simply closes (no dead surface).
  useEffect(() => {
    if (inCall) {
      setDismissed(false);
      setFrozen(null);
    } else if (liveRef.current.length > 0) {
      setFrozen((prev) => prev ?? liveRef.current);
    }
  }, [inCall]);

  const displayLines = useMemo<TranscriptLine[]>(
    () => (inCall ? (liveTranscript ?? []) : (frozen ?? [])),
    [inCall, liveTranscript, frozen],
  );
  const state: TranscriptState = inCall ? (voice?.transcriptState ?? "listening") : "idle";

  // Auto-scroll to the newest line, but only when the operator is already pinned near
  // the bottom (don't yank them back if they've scrolled up to re-read).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [displayLines]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const hasContent = inCall || (frozen != null && frozen.length > 0);
  const open = !!voice && voice.status !== "needs_config" && hasContent && !dismissed;

  // Reduced-motion: no slide, instant mount/unmount.
  const slide = reduce
    ? { initial: false as const, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, x: 24, y: 12 },
        animate: { opacity: 1, x: 0, y: 0 },
        exit: { opacity: 0, x: 24, y: 12 },
      };

  const renderBody = () => {
    if (displayLines.length === 0) {
      // Honest empty/loading — never a blank (§13).
      return (
        <div className="grid flex-1 place-items-center px-6 py-10 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary)/0.25)]">
              {!reduce && state !== "reconnecting" && (
                <span className="absolute inset-0 rounded-full bg-[hsl(var(--primary)/0.15)] motion-safe:animate-ping" aria-hidden />
              )}
              {state === "reconnecting" ? (
                <Loader2 className="relative h-5 w-5 motion-safe:animate-spin" />
              ) : (
                <AudioLines className="relative h-5 w-5" />
              )}
            </span>
            <p className="text-sm font-medium text-foreground">
              {state === "reconnecting" ? "Reconnecting…" : "Listening…"}
            </p>
            <p className="max-w-[220px] text-xs text-muted-foreground">
              {state === "reconnecting"
                ? "Lost the live feed for a moment — picking it back up."
                : "Paige is listening in. What's said on this call shows up here."}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3"
      >
        {state === "reconnecting" && (
          <div className="mb-1 flex items-center justify-center gap-1.5 rounded-md bg-[hsl(var(--warning)/0.1)] px-2 py-1 text-[11px] text-foreground">
            <Loader2 className="h-3 w-3 text-[hsl(var(--warning))] motion-safe:animate-spin" />
            Reconnecting…
          </div>
        )}
        <AnimatePresence initial={false}>
          {displayLines.map((line) => (
            <Line key={line.key} line={line} reduce={reduce} />
          ))}
        </AnimatePresence>
      </div>
    );
  };

  if (!voice) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...slide}
          transition={{ type: "spring", stiffness: 360, damping: 34 }}
          className={cn(
            // Landscape: right-edge rail below the top header. Mobile: bottom sheet-card.
            "fixed z-30 flex flex-col",
            "inset-x-2 bottom-2 max-h-[55dvh]",
            "sm:inset-x-auto sm:right-3 sm:top-[4.75rem] sm:bottom-4 sm:w-[360px] sm:max-h-none",
          )}
          role="log"
          aria-live="polite"
          aria-label="Live call transcript"
        >
          <SectionCard
            padded={false}
            bodyClassName="flex min-h-0 flex-1 flex-col"
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              // Dimensional depth (§22): raised elevation + hairline ring + a translucent,
              // blurred ground so the panel reads as a layer floating above the surface.
              "border-border/70 bg-card/95 shadow-2xl ring-1 ring-border/50 backdrop-blur-xl",
              "supports-[backdrop-filter]:bg-card/80",
            )}
          >
            {/* Header — live status + close. A thin top accent hairline adds the raised
                edge (indigo, not gold). */}
            <div className="relative flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
              <span
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary)/0.5)] to-transparent"
                aria-hidden
              />
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
                  <Radio className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight text-foreground">
                    Live transcript
                  </p>
                  {voice.activeCall?.number && inCall && (
                    <p className="truncate text-[11px] leading-tight text-muted-foreground">
                      {voice.activeCall.number}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusPill state={state} live={inCall} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  onClick={() => setDismissed(true)}
                  aria-label="Hide live transcript"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {renderBody()}
          </SectionCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
