// The Vibe Studio Design Agent's extended-thinking display (U2). Claude's native `thinking` blocks
// arrive on a DISTINCT SSE channel (`delta.paige_thinking` — never answer text; see _shared/claude.ts
// streamAnthropicAsOpenAI + paige-ai-chat's STUDIO_THINKING_ENABLED gate). This renders that reasoning
// trace as a COLLAPSED-by-default panel above the reply: a subtle "Thinking… / Thought for Ns" label
// with a live duration, click to expand the monospace trace. §13: the reasoning is shown verbatim —
// dead-ends and course-corrections included, never stripped — because visible reasoning is the trust.
// §11: token-only, motion-safe (useReducedMotion), NO gold (reasoning is not an act moment).
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Brain, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReasoningPanel({
  text,
  active,
  startedAt,
  durationMs,
  className,
}: {
  /** The accumulated reasoning trace for this turn (may be empty while the first block streams). */
  text: string;
  /** True while thinking is still streaming (before the answer text begins). Drives the live timer. */
  active: boolean;
  /** performance.now() timestamp when the first thinking delta arrived; null before reasoning starts. */
  startedAt: number | null;
  /** Frozen reasoning duration in ms once thinking handed off to the answer; null while still active. */
  durationMs: number | null;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Live elapsed while reasoning streams — frozen once `durationMs` is set. Skipped under reduced
  // motion (a rapidly-updating counter is motion): the label falls back to a static "Thinking…".
  useEffect(() => {
    if (!active || startedAt == null || reduce) return;
    setElapsed(performance.now() - startedAt);
    const id = window.setInterval(() => setElapsed(performance.now() - startedAt), 200);
    return () => window.clearInterval(id);
  }, [active, startedAt, reduce]);

  // Nothing to show: no reasoning arrived and none is streaming.
  if (!active && !text.trim()) return null;

  const liveMs = durationMs ?? (active && !reduce ? elapsed : null);
  const label = active
    ? liveMs != null ? `Thinking… ${Math.max(0, liveMs / 1000).toFixed(1)}s` : "Thinking…"
    : durationMs != null ? `Thought for ${Math.max(0, durationMs / 1000).toFixed(1)}s` : "Reasoning";

  return (
    <div
      className={cn(
        "mb-1.5 max-w-[85%] overflow-hidden rounded-xl border border-[hsl(var(--studio-chrome-border)/0.4)] bg-[hsl(var(--foreground)/0.02)]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-reduce:transition-none"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-90")}
          aria-hidden
        />
        <Brain className={cn("h-3 w-3 shrink-0", active && "animate-pulse motion-reduce:animate-none")} aria-hidden />
        <span className="tabular-nums opacity-80">{label}</span>
      </button>
      {open && text.trim() && (
        <p className="max-h-56 overflow-y-auto whitespace-pre-wrap border-t border-[hsl(var(--studio-chrome-border)/0.3)] px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground/80">
          {text}
        </p>
      )}
    </div>
  );
}

export default ReasoningPanel;
