/**
 * VoiceSessionModal — premium full-screen (mobile) / modal (desktop) UI for an
 * active ElevenLabs voice session with Paige.
 *
 * Surfaces:
 *   - Page context badge (top)
 *   - Animated avatar + waveform
 *   - Live status: connecting → ready → listening → thinking → speaking
 *   - Live transcript (last few turns)
 *   - Mute toggle
 *   - End call (red, prominent)
 *
 * Pure UI: relies on the parent for the @11labs conversation lifecycle.
 */
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, PhoneOff, Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import paigeAvatar from "@/assets/paige-ai-avatar.png";
import { cn } from "@/lib/utils";

export type VoiceModalStatus = "connecting" | "listening" | "speaking" | "thinking";

export interface VoiceTranscriptEntry {
  role: "user" | "assistant";
  content: string;
}

interface VoiceSessionModalProps {
  open: boolean;
  status: VoiceModalStatus;
  isMuted: boolean;
  pageName: string;
  transcript: VoiceTranscriptEntry[];
  onToggleMute: () => void;
  onEndCall: () => void;
}

const STATUS_COPY: Record<VoiceModalStatus, string> = {
  connecting: "Connecting...",
  listening: "Listening...",
  speaking: "Paige is speaking...",
  thinking: "Paige is thinking...",
};

export function VoiceSessionModal({
  open,
  status,
  isMuted,
  pageName,
  transcript,
  onToggleMute,
  onEndCall,
}: VoiceSessionModalProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript to bottom on new entries
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript.length]);

  // Lock body scroll while modal is open (mobile UX)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const recentTranscript = useMemo(
    () => transcript.slice(-12),
    [transcript]
  );

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-background/95 backdrop-blur-xl animate-in fade-in duration-200 flex flex-col">
      {/* Page context badge */}
      <div className="flex-shrink-0 pt-[env(safe-area-inset-top,1rem)] pb-2 px-4 flex items-center justify-center">
        <div className="px-3 py-1 rounded-full border border-border/60 bg-muted/40 backdrop-blur text-[11px] text-muted-foreground">
          Paige can see: <span className="text-foreground font-medium">{pageName}</span>
        </div>
      </div>

      {/* Avatar + waveform */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center pt-6 pb-4">
        <div className="relative">
          {/* Animated rings — gold when speaking, navy/muted when listening */}
          <div
            className={cn(
              "absolute inset-0 rounded-full transition-all duration-300",
              status === "speaking"
                ? "ring-4 ring-primary/60 animate-pulse scale-110"
                : status === "listening"
                ? "ring-2 ring-accent/40 scale-105"
                : status === "thinking"
                ? "ring-2 ring-muted-foreground/40 scale-105"
                : "ring-2 ring-muted/30"
            )}
          />
          <div
            className={cn(
              "absolute -inset-3 rounded-full blur-2xl transition-opacity duration-300",
              status === "speaking" ? "bg-primary/30 opacity-100" :
              status === "listening" ? "bg-accent/20 opacity-80" :
              "bg-muted/20 opacity-50"
            )}
          />
          <img
            src={paigeAvatar}
            alt="Paige"
            className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-primary/40 shadow-glow"
          />
        </div>

        {/* Status pill */}
        <div className="mt-5 flex items-center gap-2">
          {status === "connecting" || status === "thinking" ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : status === "speaking" ? (
            <Volume2 className="h-4 w-4 text-primary animate-pulse" />
          ) : (
            <div className="h-2.5 w-2.5 rounded-full bg-accent animate-pulse" />
          )}
          <span className="text-sm text-foreground font-medium">{STATUS_COPY[status]}</span>
        </div>

        {/* Waveform bars (decorative, animates with speaking state) */}
        <div className="mt-4 flex items-end justify-center gap-1 h-8">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={cn(
                "w-1 rounded-full transition-all duration-200",
                status === "speaking"
                  ? "bg-primary animate-pulse"
                  : status === "listening" && !isMuted
                  ? "bg-accent/60"
                  : "bg-muted-foreground/30"
              )}
              style={{
                height: status === "speaking"
                  ? `${20 + Math.sin((Date.now() / 200) + i) * 12}px`
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
          <p className="text-center text-xs text-muted-foreground/70 mt-8">
            {status === "connecting" ? "Setting up your session..." : "Say hi to start the conversation."}
          </p>
        ) : (
          recentTranscript.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[88%] sm:max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-snug",
                m.role === "user"
                  ? "ml-auto bg-accent/20 border border-accent/30 text-foreground"
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
      <div className="flex-shrink-0 px-4 pb-[env(safe-area-inset-bottom,1.5rem)] pt-3 border-t border-border/40 bg-background/80">
        <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
          <Button
            onClick={onToggleMute}
            variant="outline"
            size="lg"
            className={cn(
              "h-14 w-14 rounded-full p-0",
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
            className="h-14 px-8 rounded-full font-semibold"
          >
            <PhoneOff className="h-5 w-5 mr-2" />
            End Call
          </Button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground mt-3">
          {isMuted ? "Mic is muted — Paige can't hear you" : "Speaking is active"}
        </p>
      </div>
    </div>,
    document.body
  );
}
