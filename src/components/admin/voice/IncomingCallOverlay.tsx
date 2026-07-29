// #140 Slice A3 — the inbound ringing surface. When Twilio rings the browser Device,
// VoiceDeviceProvider surfaces the call as `incomingCall`; this overlay presents it with
// an ACCEPT (the ONE gold act, §11) and a destructive REJECT. Mounted ONCE in AdminLayout
// (next to <DialPadSurface/>), so a call ringing on ANY surface/breakpoint pops the same
// dimensional, viewport-anchored dialog (§47/§48 — landscape-primary but mobile-correct;
// a call can come in anywhere).
//
//  §11  GOLD is spent on exactly ONE control — ACCEPT (the act). REJECT is destructive
//       (never gold). Token-only, AA both themes. The pulse ring is indigo/primary, not gold.
//  §22  The ring pulse is motion-safe: useReducedMotion freezes it to a static ring.
//  §13  Shows the REAL caller number Twilio gave us; "Unknown caller" when withheld — never
//       a fabricated name.
//  §18  Reuses the shipped Dialog primitive (a viewport-anchored, focus-trapped overlay) —
//       NOT a hand-rolled fixed div. One home for modal chrome.
import { useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { Phone, PhoneIncoming, PhoneOff } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceDevice } from "@/lib/voice/VoiceDeviceProvider";

export function IncomingCallOverlay() {
  const voice = useVoiceDevice();
  const reduceMotion = useReducedMotion();
  // §36 safety: the primary act (ACCEPT) owns default focus so a reflexive Enter/Space
  // ANSWERS the call — never the destructive DECLINE (Radix would otherwise focus the
  // first focusable child, which is Decline). This is an answer surface; hanging up on a
  // caller by accident is the exact footgun we design out.
  const acceptRef = useRef<HTMLButtonElement>(null);
  if (!voice) return null;

  const { incomingCall, acceptIncoming, rejectIncoming } = voice;
  const open = incomingCall != null;

  return (
    <Dialog
      open={open}
      // A dismissal that isn't ACCEPT (Esc — outside-tap is prevented below) is a DECLINE,
      // so we never leave a live ring with no resolution (§13).
      onOpenChange={(next) => {
        if (!next && open) rejectIncoming();
      }}
    >
      {/* Hide the primitive's default close X — ACCEPT / REJECT are the only two exits so
          the choice reads unambiguously (an X next to REJECT would be redundant). */}
      <DialogContent
        className="max-w-sm text-center [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        // §36: focus ACCEPT (the gold act), not the destructive Decline that renders first.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          acceptRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Incoming call</DialogTitle>
        <DialogDescription className="sr-only">
          An incoming call is ringing. Accept or decline.
        </DialogDescription>

        <div className="flex flex-col items-center gap-5 py-2">
          {/* Ringing avatar — an indigo pulse ring (motion-safe). Gold is NOT spent here. */}
          <div className="relative flex h-20 w-20 items-center justify-center">
            {!reduceMotion && (
              <>
                <span className="absolute inset-0 rounded-full bg-primary/20 motion-safe:animate-ping" aria-hidden />
                <span
                  className="absolute inset-0 rounded-full bg-primary/10 motion-safe:animate-ping"
                  style={{ animationDelay: "0.4s" }}
                  aria-hidden
                />
              </>
            )}
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/30">
              <PhoneIncoming className="h-7 w-7" />
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Incoming call
            </p>
            <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
              {incomingCall?.from ?? "Unknown caller"}
            </p>
          </div>

          <div className="flex items-center justify-center gap-6 pt-1">
            {/* DECLINE — destructive, never gold (§11). */}
            <div className="flex flex-col items-center gap-1.5">
              <Button
                type="button"
                variant="destructive"
                size="icon"
                aria-label="Decline call"
                onClick={rejectIncoming}
                className="h-14 w-14 rounded-full"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <span className="text-[11px] text-muted-foreground">Decline</span>
            </div>

            {/* ACCEPT — the ONE gold act (§11). */}
            <div className="flex flex-col items-center gap-1.5">
              <Button
                ref={acceptRef}
                type="button"
                variant="gold"
                size="icon"
                aria-label="Accept call"
                onClick={acceptIncoming}
                className={cn("h-16 w-16 rounded-full", !reduceMotion && "motion-safe:animate-pulse")}
              >
                <Phone className="h-7 w-7" />
              </Button>
              <span className="text-[11px] font-medium text-foreground">Accept</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
