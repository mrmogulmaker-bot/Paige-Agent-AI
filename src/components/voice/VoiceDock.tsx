/**
 * VoiceDock — the active voice-session UI, scoped to the chat widget instead of
 * the whole viewport. It renders as an absolute overlay INSIDE the chat
 * container (which must be position:relative), so voice takes over only the
 * chatbot — the rest of the page stays visible and usable around it.
 *
 * Deliberately NOT a portal and NOT a body-scroll lock (that was the old
 * full-screen takeover). Tenant-agnostic (§9): the same dock serves the admin
 * "Your Paige" surface and the client portal.
 *
 * Surfaces (kept from the old modal):
 *   - Page-context badge
 *   - Animated avatar + status rings
 *   - Live status pill: connecting → listening → thinking → speaking
 *   - Decorative waveform (motion-safe)
 *   - Live transcript (scrollable, last ~12 turns)
 *   - Mute toggle + prominent End Call
 *   - Optional "type while talking" row (Textarea + send) when wired via props
 *
 * Pure UI: the parent owns the @11labs conversation lifecycle.
 */
import { useEffect, useMemo, useRef } from "react";
import { Mic, MicOff, PhoneOff, Volume2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { cn } from "@/lib/utils";
import type { VoiceModalStatus, VoiceTranscriptEntry } from "@/components/voice/types";

// Re-export so callers can import the voice types straight from the dock.
export type { VoiceModalStatus, VoiceTranscriptEntry };

interface VoiceDockProps {
  open: boolean;
  status: VoiceModalStatus;
  isMuted: boolean;
  pageName: string;
  transcript: VoiceTranscriptEntry[];
  onToggleMute: () => void;
  onEndCall: () => void;
  /** Optional "type while talking" row. Provide all three to show it. */
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onSendText?: () => void;
  /** Disables the send button while a text turn is in flight. */
  isSending?: boolean;
}

const STATUS_COPY: Record<VoiceModalStatus, string> = {
  connecting: "Connecting...",
  listening: "Listening...",
  speaking: "Paige is speaking...",
  thinking: "Paige is thinking...",
};

// Static, index-based silhouette for the waveform. Kept out of render math so
// there's no Date.now() churn (SSR-safe); "alive" motion comes from a
// motion-safe pulse, not a per-frame height recompute.
const WAVE_HEIGHTS = [12, 20, 28, 16, 26, 14, 22];

export function VoiceDock({
  open,
  status,
  isMuted,
  pageName,
  transcript,
  onToggleMute,
  onEndCall,
  inputValue,
  onInputChange,
  onSendText,
  isSending = false,
}: VoiceDockProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript to bottom on new entries.
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript.length]);

  const recentTranscript = useMemo(() => transcript.slice(-12), [transcript]);

  const showTextRow = typeof onInputChange === "function" && typeof onSendText === "function";

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col rounded-[inherit] overflow-hidden bg-background/95 backdrop-blur-xl animate-in fade-in duration-200 motion-reduce:animate-none">
      {/* Page context badge */}
      <div className="flex-shrink-0 pt-3 pb-2 px-4 flex items-center justify-center">
        <div className="px-3 py-1 rounded-full border border-border/60 bg-muted/40 backdrop-blur text-[11px] text-muted-foreground">
          Paige can see: <span className="text-foreground font-medium">{pageName}</span>
        </div>
      </div>

      {/* Avatar + waveform */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center pt-2 pb-3">
        <div className="relative">
          {/* Status rings are indigo/muted chrome, never gold — gold is reserved
              for the act moment (the Send button). Speaking reads as the strong
              indigo pulse; listening a softer ring; resting states muted. */}
          <div
            className={cn(
              "absolute inset-0 rounded-full transition-all duration-300",
              status === "speaking"
                ? "ring-4 ring-primary/60 animate-pulse motion-reduce:animate-none scale-110"
                : status === "listening"
                ? "ring-2 ring-primary/40 scale-105"
                : status === "thinking"
                ? "ring-2 ring-muted-foreground/40 scale-105"
                : "ring-2 ring-muted/30"
            )}
          />
          <div
            className={cn(
              "absolute -inset-3 rounded-full blur-2xl transition-opacity duration-300",
              status === "speaking"
                ? "bg-primary/30 opacity-100"
                : status === "listening"
                ? "bg-primary/20 opacity-80"
                : "bg-muted/20 opacity-50"
            )}
          />
          <img
            src={paigeAvatar}
            alt="Paige"
            className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-primary/40 shadow-glow"
          />
        </div>

        {/* Status pill */}
        <div className="mt-4 flex items-center gap-2">
          {status === "connecting" || status === "thinking" ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground" />
          ) : status === "speaking" ? (
            <Volume2 className="h-4 w-4 text-primary animate-pulse motion-reduce:animate-none" />
          ) : (
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
          )}
          <span className="text-sm text-foreground font-medium">{STATUS_COPY[status]}</span>
        </div>

        {/* Waveform bars — decorative, motion-safe (index-based heights + pulse). */}
        <div className="mt-3 flex items-end justify-center gap-1 h-7">
          {WAVE_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className={cn(
                "w-1 rounded-full transition-colors duration-200",
                status === "speaking"
                  ? "bg-primary animate-pulse motion-reduce:animate-none"
                  : status === "listening" && !isMuted
                  ? "bg-primary/50"
                  : "bg-muted-foreground/30"
              )}
              style={{
                height:
                  status === "speaking"
                    ? `${h}px`
                    : status === "listening" && !isMuted
                    ? `${8 + (i % 3) * 4}px`
                    : "6px",
                animationDelay: `${i * 80}ms`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Live transcript */}
      <div
        ref={transcriptRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 space-y-2"
      >
        {recentTranscript.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground/70 mt-6">
            {status === "connecting" ? "Setting up your session..." : "Say hi to start the conversation."}
          </p>
        ) : (
          recentTranscript.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[88%] sm:max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-snug",
                m.role === "user"
                  ? "ml-auto bg-primary/10 border border-primary/20 text-foreground"
                  : "bg-muted/40 border border-border/60 text-foreground"
              )}
            >
              <p className="text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
                {m.role === "user" ? "You" : "Paige"}
              </p>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 px-4 pb-3 pt-3 border-t border-border/40 bg-background/80">
        <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
          <Button
            onClick={onToggleMute}
            variant="outline"
            size="lg"
            className={cn(
              "h-12 w-12 rounded-full p-0",
              isMuted && "bg-muted text-muted-foreground"
            )}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>

          <Button
            onClick={onEndCall}
            variant="destructive"
            size="lg"
            className="h-12 px-8 rounded-full font-semibold"
          >
            <PhoneOff className="h-5 w-5 mr-2" />
            End Call
          </Button>
        </div>

        {/* Type while talking — only when the caller wires the props. */}
        {showTextRow && (
          <div className="mt-3 max-w-md mx-auto">
            <p className="text-center text-[10px] text-muted-foreground mb-1.5">
              {isMuted ? "Mic is muted — type to Paige, or unmute to speak" : "Speaking is active — you can also type"}
            </p>
            <div className="flex items-end gap-2">
              <Textarea
                value={inputValue ?? ""}
                onChange={(e) => onInputChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSendText?.();
                  }
                }}
                placeholder="Type to Paige while talking… (Shift+Enter for a new line)"
                rows={1}
                className="flex-1 text-sm bg-muted/30 min-h-[40px] max-h-[120px] resize-none py-2"
              />
              <Button
                onClick={() => onSendText?.()}
                disabled={isSending || !(inputValue ?? "").trim()}
                variant="gold"
                size="icon"
                aria-label="Send message"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
