// #140 B2/B3 — the live-call co-pilot panel (transcript + intelligence).
//
// While a call is LIVE, the transcript streams into a DIMENSIONAL panel: a right-edge
// rail on landscape (§48 landscape-primary), a bottom sheet-card on mobile (a call can
// come in anywhere). Mounted ONCE in AdminLayout (next to <DialPadSurface/> and
// <IncomingCallOverlay/>), so it appears on ANY surface the moment a call goes live.
//
// B3 layers Paige's four live moves ON the SAME panel, fed by the SAME private channel
// (§18 — no second surface, no second subscription): WHISPER cues (L6 recall, swapped on
// topic shift), COMMITMENT chips (a promise filed as a task), an AT-RISK indicator
// (churn/competitor/frustration — semantic warning/destructive, never gold), and a
// DRAFT-READY affordance (the follow-up that landed in approvals, one tap to review).
//
// DOCTRINE
//  §18  REUSES the shipped SectionCard rail primitive (@/components/ui/page) for the
//       card chrome — the SAME shape ContactCardRail uses — never a hand-rolled card.
//       Reads the ONE VoiceDeviceProvider (useVoiceDevice); no second Device, no fork.
//       B3 intelligence rides the SAME useLiveTranscript subscription (one channel).
//  §9 / #557  Transcript AND intelligence arrive on a PRIVATE realtime channel gated by
//       the realtime.messages RLS policy — a tenant can only ever see its OWN call.
//  §13  Honest states, never a blank: "Listening…" before any transcript, "Reconnecting…"
//       on a dropped channel, the frozen transcript+intelligence after the call ends
//       (until dismissed). Intelligence regions render ONLY when real content lands — a
//       call with no whisper/flag/commitment/draft shows none of them (no fabrication).
//  §22  Motion earns its pixels and is per-effect reduced-motion-safe: the panel slides
//       in, final lines + whisper cards + commitment chips + the draft bar animate in,
//       the live dot / at-risk indicator pulse — EACH with its own flat fallback under
//       useReducedMotion.
//  §11/§23  Token-only, AA both themes, indigo focus ring. Gold is NEVER spent here —
//       the live indicator is a status, at-risk is warning/destructive, commitments and
//       the draft affordance are indigo/neutral; none is an approve/act moment.
//  §36  One-glance: cues legible with source + similarity; the draft is one tap to review.
//  §3   Plain, jargon-free copy — no product/table names, no "AI".
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Radio, X, Loader2, AudioLines, Lightbulb, AlertTriangle, ClipboardCheck,
  PenLine, ArrowUpRight,
} from "lucide-react";
import { SectionCard } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceDevice } from "@/lib/voice/VoiceDeviceProvider";
import {
  EMPTY_CALL_INTELLIGENCE,
  type TranscriptLine,
  type TranscriptState,
  type CallIntelligence,
  type WhisperCard,
  type CommitmentChip,
  type AtRiskFlag,
  type DraftReady,
} from "@/lib/voice/useLiveTranscript";

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

/** Short, locale-aware due date ("Aug 2", or "Aug 2, 2027" when it's not this year). */
function formatDue(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

/**
 * WHISPER cues — L6 recall Paige surfaces to the operator, refreshed on topic shift.
 * The whole SET swaps when a new whisper lands (ids change → AnimatePresence cross-fades
 * old out, new in). §36 one-glance: title + a similarity chip + the source, all legible.
 * Renders nothing when there are no cues (§13 — no fabricated context).
 */
function WhisperCues({ cards, reduce }: { cards: WhisperCard[]; reduce: boolean | null }) {
  if (cards.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-border/60 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <Lightbulb className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Paige&apos;s cues
        </span>
      </div>
      {/* Capped + self-scrolling so the cues never crowd out the transcript below (§27
          space): tighter on the mobile bottom-sheet, taller on the desktop rail. */}
      <div className="flex max-h-[22vh] flex-col gap-2 overflow-y-auto sm:max-h-[40dvh]">
        <AnimatePresence initial={false}>
          {cards.map((c) => (
            <WhisperCardView key={c.id} card={c} reduce={reduce} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function WhisperCardView({ card, reduce }: { card: WhisperCard; reduce: boolean | null }) {
  const pct =
    card.similarity != null
      ? Math.round(Math.max(0, Math.min(1, card.similarity)) * 100)
      : null;
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/70 bg-muted/40 p-2.5 pl-3",
        "ring-1 ring-border/40 supports-[backdrop-filter]:bg-muted/30",
      )}
    >
      {/* Left indigo accent — depth cue, never gold (§11). */}
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-[hsl(var(--primary)/0.6)]"
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 line-clamp-2 text-[12px] font-semibold leading-tight text-foreground">
          {card.title}
        </p>
        {pct != null && (
          <span className="shrink-0 rounded-full bg-[hsl(var(--primary)/0.1)] px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-[hsl(var(--primary))]">
            {pct}% match
          </span>
        )}
      </div>
      {card.body && (
        <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
          {card.body}
        </p>
      )}
      {card.source && (
        <p className="mt-1.5 truncate text-[10px] text-muted-foreground/80">{card.source}</p>
      )}
    </motion.div>
  );
}

/**
 * COMMITMENT chips — a promise ("send the contract by Friday") filed as a task in real
 * time, no interruption. Chips animate in as they land; a wrapping horizontal scroll row
 * keeps the band compact (§11/§27 space). Indigo/neutral — a filed task, not an act.
 */
function CommitmentRow({ chips, reduce }: { chips: CommitmentChip[]; reduce: boolean | null }) {
  if (chips.length === 0) return null;
  return (
    <div className="shrink-0 border-t border-border/60 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <ClipboardCheck className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Filed for you
        </span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        <AnimatePresence initial={false}>
          {chips.map((c) => (
            <CommitmentChipView key={c.actionId} chip={c} reduce={reduce} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CommitmentChipView({ chip, reduce }: { chip: CommitmentChip; reduce: boolean | null }) {
  const due = chip.dueAt ? formatDue(chip.dueAt) : null;
  return (
    <motion.span
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 460, damping: 30 }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-foreground",
        "border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)]",
      )}
    >
      <ClipboardCheck className="h-3 w-3 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
      <span className="max-w-[170px] truncate font-medium">{chip.title}</span>
      {due && <span className="shrink-0 tabular-nums text-muted-foreground">· Due {due}</span>}
    </motion.span>
  );
}

/**
 * AT-RISK indicator — a SUBTLE strip that lights on a churn/competitor/frustration flag.
 * Semantic warning (low/med) or destructive (high) tokens — NEVER gold (§11). The flag is
 * already filed to the team by the backend (client.at_risk, autonomy=auto), so the one-tap
 * affordance is an honest ACKNOWLEDGE (§13 — no fabricated "escalated" claim). Shows the
 * most-severe flag; a new, more-severe flag re-surfaces after an acknowledge.
 */
function AtRiskStrip({ flags, reduce }: { flags: AtRiskFlag[]; reduce: boolean | null }) {
  const [ackCount, setAckCount] = useState(0);
  // Reset the acknowledgement when the call's flags clear (a new call starts empty).
  useEffect(() => {
    if (flags.length === 0 && ackCount !== 0) setAckCount(0);
  }, [flags.length, ackCount]);

  if (flags.length === 0 || flags.length <= ackCount) return null;

  const rank: Record<AtRiskFlag["level"], number> = { low: 0, med: 1, high: 2 };
  // Most severe first; break ties by most recent.
  const top = [...flags].sort(
    (a, b) => rank[b.level] - rank[a.level] || (a.at < b.at ? 1 : -1),
  )[0];
  const extra = flags.length - 1;
  const high = top.level === "high";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={cn(
        "flex shrink-0 items-center gap-2 border-b px-3 py-2",
        high
          ? "border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.1)]"
          : "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.1)]",
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {!reduce && (
          <span
            className={cn(
              "absolute inset-0 rounded-full opacity-50 motion-safe:animate-ping",
              high ? "bg-[hsl(var(--destructive)/0.5)]" : "bg-[hsl(var(--warning)/0.5)]",
            )}
            aria-hidden
          />
        )}
        <AlertTriangle
          className={cn(
            "relative h-4 w-4",
            high ? "text-[hsl(var(--destructive))]" : "text-[hsl(var(--warning))]",
          )}
          aria-hidden
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold leading-tight text-foreground">
          {high ? "Watch this one" : "Possible concern"}
          {extra > 0 && (
            <span className="ml-1 font-normal text-muted-foreground">+{extra} more</span>
          )}
        </p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">
          {/* §13 honesty: only claim it was filed for the team when the action-bus write actually
              succeeded (actionId present). If the write failed, still surface the concern — never a
              false claim that a record exists. */}
          {top.actionId ? `${top.signal} · Paige flagged it for the team` : top.signal}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        onClick={() => setAckCount(flags.length)}
        aria-label="Acknowledge concern"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </motion.div>
  );
}

/**
 * DRAFT-READY affordance — the follow-up Paige auto-drafted landed in the approval queue
 * near call-end. A quiet, one-tap row straight to that draft (§36 one-click). Indigo/
 * neutral — reviewing is not the approve act (the act lives in the approvals surface).
 */
function DraftReadyBar({ draft, reduce }: { draft: DraftReady | null; reduce: boolean | null }) {
  if (!draft) return null;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="shrink-0 border-t border-border/60 p-2.5"
    >
      <Link
        to={`/admin/approvals/${draft.approvalId}`}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors",
          "border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] hover:bg-[hsl(var(--primary)/0.12)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          <PenLine className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold leading-tight text-foreground">
            Follow-up drafted
          </span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
            {draft.subject ? draft.subject : "Review it in approvals"}
          </span>
        </span>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
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
  // #140 B3 — the intelligence captured at call-end, frozen alongside the transcript so
  // the operator can still review the cues/commitments/flags/draft after the call drops.
  const [frozenIntel, setFrozenIntel] = useState<CallIntelligence | null>(null);
  const liveRef = useRef<TranscriptLine[]>([]);
  const intelRef = useRef<CallIntelligence>(EMPTY_CALL_INTELLIGENCE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const inCall = voice?.status === "in_call";
  const liveTranscript = voice?.liveTranscript;
  const liveIntelligence = voice?.liveIntelligence;

  // Mirror the live lines + intelligence while the call is up, so we can freeze both when
  // the provider tears its buffers down the instant the call ends.
  useEffect(() => {
    if (inCall) liveRef.current = liveTranscript ?? [];
  }, [inCall, liveTranscript]);
  useEffect(() => {
    if (inCall) intelRef.current = liveIntelligence ?? EMPTY_CALL_INTELLIGENCE;
  }, [inCall, liveIntelligence]);

  // On call start: reveal + drop any prior frozen snapshot. On call end WITH content:
  // freeze it (persist until dismissed). A call that produced nothing leaves frozen null
  // → the panel simply closes (no dead surface).
  useEffect(() => {
    if (inCall) {
      setDismissed(false);
      setFrozen(null);
      setFrozenIntel(null);
    } else {
      if (liveRef.current.length > 0) setFrozen((prev) => prev ?? liveRef.current);
      const i = intelRef.current;
      if (i.whispers.length || i.commitments.length || i.atRisk.length || i.draftReady) {
        setFrozenIntel((prev) => prev ?? i);
      }
    }
  }, [inCall]);

  const displayLines = useMemo<TranscriptLine[]>(
    () => (inCall ? (liveTranscript ?? []) : (frozen ?? [])),
    [inCall, liveTranscript, frozen],
  );
  const displayIntel: CallIntelligence = inCall
    ? (liveIntelligence ?? EMPTY_CALL_INTELLIGENCE)
    : (frozenIntel ?? EMPTY_CALL_INTELLIGENCE);
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

  // A frozen snapshot with ONLY intelligence (no transcript lines) still earns the panel,
  // so the operator can review what Paige filed even if the transcript was empty.
  const hasFrozenIntel =
    frozenIntel != null &&
    (frozenIntel.whispers.length > 0 ||
      frozenIntel.commitments.length > 0 ||
      frozenIntel.atRisk.length > 0 ||
      frozenIntel.draftReady != null);
  const hasContent = inCall || (frozen != null && frozen.length > 0) || hasFrozenIntel;
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

            {/* #140 B3 — Paige's live moves, all on this ONE panel (§18/§21):
                at-risk flag (subtle, warning/destructive) sits just under the header;
                whisper cues render above the transcript; commitments + the follow-up
                draft settle below it. Each region renders ONLY when real content lands. */}
            <AtRiskStrip flags={displayIntel.atRisk} reduce={reduce} />
            <WhisperCues cards={displayIntel.whispers} reduce={reduce} />
            {renderBody()}
            <CommitmentRow chips={displayIntel.commitments} reduce={reduce} />
            <DraftReadyBar draft={displayIntel.draftReady} reduce={reduce} />
          </SectionCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
