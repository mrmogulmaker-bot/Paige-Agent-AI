/**
 * DictationMicButton — the one shared mic control for every composer (#170).
 *
 * Press-to-talk: hold (pointer or keyboard) to record, release to stop; the
 * dictated words are handed back via `onText` for the composer to append. It
 * drives the shared `useDictation` hook (§18 one home) so the two composers
 * behave identically.
 *
 * §11: the mic is NEUTRAL/indigo — a mic is not an "act", so gold stays on Send.
 * Motion-safe (every pulse guards `motion-reduce`), token-only, jargon-free.
 */
import { useEffect, useId, useRef } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDictation } from "@/lib/voice/useDictation";
import type { ButtonProps } from "@/components/ui/button";

interface DictationMicButtonProps {
  /** Receives each finalized transcript segment (no leading space). */
  onText: (segment: string) => void;
  /** Surface a plain, jargon-free failure (e.g. via a toast). */
  onError?: (message: string) => void;
  disabled?: boolean;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  /** Optional visible label (toolbar style). Icon-only when omitted. */
  label?: string;
  /** Label shown while actively listening (defaults to `label`). */
  activeLabel?: string;
  /** Show the compact persistent state beside the control (Solo composer). */
  showStatus?: boolean;
  /** Authenticated account epoch used to invalidate a recording generation. */
  scopeEpoch?: string | null;
  className?: string;
}

const HOLD_KEYS = new Set([" ", "Enter"]);

export function DictationMicButton({
  onText,
  onError,
  disabled,
  size = "icon",
  variant = "ghost",
  label,
  activeLabel,
  showStatus = false,
  scopeEpoch = null,
  className,
}: DictationMicButtonProps) {
  const dictation = useDictation({ onText, onError, scopeEpoch });
  const { status, failure, supported, start, stop } = dictation;
  const statusId = useId();
  const holdingRef = useRef(false);

  useEffect(() => {
    if (status === "idle" || status === "error") {
      holdingRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    if ((disabled || !supported) && (status === "requesting" || status === "listening")) {
      holdingRef.current = false;
      stop();
    }
  }, [disabled, status, stop, supported]);

  const beginHold = () => {
    if (disabled || !supported || holdingRef.current || (status !== "idle" && status !== "error")) return;
    holdingRef.current = true;
    void start();
  };
  const endHold = () => {
    holdingRef.current = false;
    // stop() is generation-aware and idempotent; calling it unconditionally is
    // what makes a release safe even before the requesting state repaints.
    stop();
  };

  const unsupported = !supported;
  const isDisabled = disabled || unsupported;
  const activationUnavailable = isDisabled || status === "transcribing";
  const isCapturing = status === "requesting" || status === "listening";
  const failed = status === "error";

  const state = unsupported ? "unsupported" : failure ?? status;
  const stateLabel = unsupported
    ? "Mic unsupported"
    : failure === "permission-denied"
      ? "Mic permission off"
      : failure === "provider-failure"
        ? "Voice typing failed"
        : failure === "unavailable"
          ? "Voice typing unavailable"
          : status === "requesting"
            ? "Requesting mic"
            : status === "listening"
              ? "Listening"
              : status === "transcribing"
                ? "Transcribing"
                : "Hold to talk";

  const title = unsupported
    ? "Voice typing isn't supported in this browser"
    : status === "requesting"
      ? "Requesting microphone access"
      : status === "listening"
      ? "Release to stop dictating"
      : status === "transcribing"
        ? "Finishing voice typing"
        : failed
          ? dictation.error ?? "Voice typing isn't available right now"
      : "Hold to dictate — speak, then release";

  const accessibleLabel = unsupported
    ? "Voice typing unsupported"
    : failure === "permission-denied"
      ? "Microphone permission off"
      : failure === "provider-failure"
        ? "Voice typing failed — hold to retry"
        : failure === "unavailable"
          ? "Voice typing unavailable — hold to retry"
          : status === "requesting"
            ? "Requesting microphone access — release to stop"
            : status === "listening"
              ? "Listening — release to stop"
              : status === "transcribing"
                ? "Transcribing recorded speech"
                : "Hold to dictate";

  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={isDisabled}
      aria-disabled={activationUnavailable}
      aria-label={accessibleLabel}
      aria-describedby={showStatus ? statusId : undefined}
      aria-pressed={isCapturing}
      title={title}
      className={cn(
        "select-none touch-none",
        // Active = indigo (never gold): a soft filled tint + a motion-safe ring.
        isCapturing &&
          "bg-primary/10 text-primary ring-2 ring-primary/50 animate-pulse motion-reduce:animate-none",
        className,
      )}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        beginHold();
      }}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onLostPointerCapture={endHold}
      onKeyDown={(e) => {
        if (!HOLD_KEYS.has(e.key) || e.repeat || holdingRef.current) return;
        e.preventDefault();
        beginHold();
      }}
      onKeyUp={(e) => {
        if (!HOLD_KEYS.has(e.key)) return;
        e.preventDefault();
        endHold();
      }}
      onBlur={endHold}
    >
      <Mic className={cn(size === "icon" ? "h-4 w-4" : "mr-1.5 h-3.5 w-3.5")} />
      {label && <span>{isCapturing ? activeLabel ?? label : label}</span>}
    </Button>
  );

  if (!showStatus) return button;
  return (
    <span className="inline-flex min-w-0 flex-none items-center gap-1.5" data-dictation-state={state}>
      {button}
      <span
        id={statusId}
        role={failed || unsupported ? "alert" : "status"}
        aria-live={failed || unsupported ? "assertive" : "polite"}
        className={cn(
          "max-w-24 truncate text-[10px] font-medium leading-tight",
          failed || unsupported ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {stateLabel}
      </span>
    </span>
  );
}
