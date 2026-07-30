// MessageAudioButton (#131) — per-message voice PLAYBACK control for Paige/assistant messages.
// Idle → Volume2 (play aloud) · loading → spinner · playing → Square (stop) · workspace not
// configured → disabled Volume2 + tooltip. One shared audio element via the messageTts controller,
// so a new play always stops the prior (no overlapping voices). §11: NO gold — playback is not the
// act/approve moment; a neutral ghost icon in the muted-foreground token, matching MessageMeta.
import { useSyncExternalStore } from "react";
import { Volume2, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { messageTts, type TtsFetchError } from "@/lib/voice/messageTts";

interface MessageAudioButtonProps {
  /** Stable message id — identifies which message owns the current playback. */
  messageId: string;
  /** The assistant text to speak. Empty ⇒ the button renders nothing. */
  content: string;
  /** Optional tint override (defaults to the muted-foreground used across MessageMeta). */
  className?: string;
}

/**
 * Fetch the synthesized mp3 for `content` from paige-tts. Uses a direct authenticated fetch (not
 * supabase.functions.invoke) so we get the raw streaming Response and a real Blob — invoke's binary
 * handling is unreliable. On a non-2xx we read the honest `{ error }` code (the resolveFunctionError
 * philosophy) and mark a `needs_config` for the tts_not_configured / tts_tier_reserved degrades.
 */
async function fetchMessageAudio(content: string): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw { needsConfig: false, message: "Please sign in." } as TtsFetchError;

  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ text: content }),
  });

  if (!resp.ok) {
    let code: string | null = null;
    try { code = (await resp.json())?.error ?? null; } catch { /* non-JSON body */ }
    throw {
      needsConfig: code === "tts_not_configured" || code === "tts_tier_reserved",
      code,
    } as TtsFetchError;
  }
  return await resp.blob();
}

export function MessageAudioButton({ messageId, content, className }: MessageAudioButtonProps) {
  const snap = useSyncExternalStore(messageTts.subscribe, messageTts.getSnapshot, messageTts.getSnapshot);
  const trimmed = content.trim();
  if (!trimmed) return null;

  const tint = className ?? "text-muted-foreground";
  const isActive = snap.activeId === messageId;
  const loading = isActive && snap.status === "loading";
  const playing = isActive && snap.status === "playing";

  const onClick = () => {
    void messageTts.toggle(
      messageId,
      () => fetchMessageAudio(trimmed),
      (e: TtsFetchError) => {
        // needsConfig is reflected by the disabled state below — don't scream a red error (§13/§36).
        if (!e.needsConfig) toast.error("Couldn't play that just now — give it another try.");
      },
    );
  };

  // Workspace has no TTS configured yet → an honest, non-alarming disabled state (§13/§36).
  if (snap.needsConfig) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span wrapper so the tooltip still fires on a disabled button */}
          <span className="inline-flex">
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled aria-label="Voice playback unavailable">
              <Volume2 className={cn("h-3 w-3", tint, "opacity-50")} />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Voice playback not yet configured for your workspace</TooltipContent>
      </Tooltip>
    );
  }

  const label = playing ? "Stop playback" : loading ? "Loading voice" : "Play message aloud";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={onClick}
      disabled={loading}
      aria-label={label}
      aria-pressed={playing}
      title={label}
    >
      {loading ? (
        <Loader2 className={cn("h-3 w-3 animate-spin motion-reduce:animate-none", tint)} />
      ) : playing ? (
        <Square className={cn("h-3 w-3", tint)} />
      ) : (
        <Volume2 className={cn("h-3 w-3", tint)} />
      )}
    </Button>
  );
}
