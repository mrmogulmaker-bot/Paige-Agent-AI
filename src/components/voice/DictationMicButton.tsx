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
  className,
}: DictationMicButtonProps) {
  const dictation = useDictation({ onText, onError });
  const { isActive, supported, start, stop } = dictation;

  const beginHold = () => { if (!disabled && supported) void start(); };
  const endHold = () => { if (isActive) stop(); };

  const unsupported = !supported;
  const isDisabled = disabled || unsupported;

  const title = unsupported
    ? "Voice typing isn't supported in this browser"
    : isActive
      ? "Release to stop dictating"
      : "Hold to dictate — speak, then release";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={isDisabled}
      aria-label={isActive ? "Dictating — release to stop" : "Hold to dictate"}
      aria-pressed={isActive}
      title={title}
      className={cn(
        "select-none touch-none",
        // Active = indigo (never gold): a soft filled tint + a motion-safe ring.
        isActive &&
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
        if (!HOLD_KEYS.has(e.key) || e.repeat || isActive) return;
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
      {label && <span>{isActive ? activeLabel ?? label : label}</span>}
    </Button>
  );
}
