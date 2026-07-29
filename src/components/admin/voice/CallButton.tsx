// #140 Slice A2 — the shared click-to-call affordance (§18: ONE home, not
// copy-pasted per surface). Placed next to a rendered phone number; clicking opens
// the single top-nav dialer PREFILLED with that number and starts the call via the
// one Device (`useVoiceDevice().callFrom`).
//
//  §11  NEUTRAL/indigo — gold is reserved for the primary CALL act inside the pad.
//       This is a per-number affordance; a gold icon on every phone row would
//       over-spend the accent and read as decoration. Muted at rest, primary on hover.
//  §36  An obvious phone tap on any number — no prompt-craft, no hunting.
//  §13  If voice isn't mounted (surface outside the admin shell) it renders nothing,
//       leaving the number untouched — never a dead/broken button.
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceDevice, normalizeDialNumber } from "@/lib/voice/VoiceDeviceProvider";

interface CallButtonProps {
  number: string | null | undefined;
  /** Extra classes for context-specific placement. */
  className?: string;
  /** Icon box size in px (default 28 — a compact inline tap target). */
  size?: number;
}

export function CallButton({ number, className, size = 28 }: CallButtonProps) {
  const voice = useVoiceDevice();
  const normalized = number ? normalizeDialNumber(number) : "";
  if (!voice || !normalized) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // don't trigger the row's copy/navigate handler
        e.preventDefault();
        voice.callFrom(number!);
      }}
      aria-label={`Call ${number}`}
      title={`Call ${number}`}
      style={{ height: size, width: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md",
        "text-muted-foreground transition-colors",
        "hover:bg-secondary hover:text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Phone className="h-3.5 w-3.5" />
    </button>
  );
}
