// Hover-revealed message action row (IA slice 1c-vi) — timestamp + copy for BOTH
// roles, retry/regenerate for assistant turns, and a slot for the ResponseFeedback
// thumbs. Revealed on hover, keyboard-focus, AND touch (no-hover devices show it
// always). Token-only, motion-safe; no gold (copy/retry/timestamp are not the act).
import { useState, type ReactNode } from "react";
import { Copy, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/useCopyToClipboard";
import { toast } from "sonner";

interface MessageMetaProps {
  role: "user" | "assistant";
  content: string;
  ts?: number;
  /** Present only for assistant turns that can be regenerated. */
  onRetry?: () => void;
  /** Voice-playback control (assistant turns, #131) or null. Sits in the same action row. */
  audioSlot?: ReactNode;
  /** The ResponseFeedback element (assistant + staff only) or null. */
  feedback?: ReactNode;
}

export function MessageMeta({ role, content, ts, onRetry, audioSlot, feedback }: MessageMetaProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  const onCopy = async () => {
    const ok = await copyText(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Couldn't copy — select the text and copy manually.");
    }
  };

  // Icon color adapts to the bubble background: on the indigo user bubble use the
  // on-primary token so it stays AA-legible; on the muted assistant bubble use the
  // muted-foreground token. Same token drives the timestamp (S1 AA fix).
  const tint = isUser ? "text-primary-foreground/70" : "text-muted-foreground";

  return (
    <div
      className={cn(
        "mt-2 flex items-center gap-1",
        "transition-opacity duration-150 motion-reduce:transition-none",
        // §36 discoverability: voice playback (#131) is a BRAND-NEW capability a coach
        // won't think to hover for — so when the speaker is present (assistant turns with
        // voice), the row rests at a quiet, non-zero opacity so it announces itself, then
        // rises to full on hover/focus. Conventional affordances (copy/retry/timestamp)
        // with no speaker keep the clean hover-only gate.
        audioSlot ? "opacity-60" : "opacity-0",
        "group-hover:opacity-100 focus-within:opacity-100",
        "[@media(hover:none)]:opacity-100", // touch devices have no hover — always show
        isUser && "justify-end",
      )}
    >
      {ts ? (
        <span className={cn("mr-1 text-xs tabular-nums", isUser ? "text-primary-foreground/70" : "text-muted-foreground/80")}>
          {new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      ) : null}

      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCopy} aria-label={copied ? "Copied" : "Copy message"}>
        {copied ? <Check className={cn("h-3 w-3", tint)} /> : <Copy className={cn("h-3 w-3", tint)} />}
      </Button>

      {onRetry && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRetry} aria-label="Regenerate response">
          <RotateCcw className={cn("h-3 w-3", tint)} />
        </Button>
      )}

      {audioSlot}

      {feedback}
    </div>
  );
}
