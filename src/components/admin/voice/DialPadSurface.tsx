// #140 Slice A2 — the ONE dialer surface (§18). Rendered exactly once in AdminLayout;
// the desktop + mobile <DialPadTrigger/>s and every click-to-call just toggle the shared
// dialerOpen state on the Device provider.
//
// It is a Sheet (a viewport-anchored overlay), NOT a trigger-anchored Popover. That is
// the fix for the mobile trap the crew caught: a click-to-call from a contact row on a
// phone must open a REAL, dismissible pad with a working hang-up — not a Popover anchored
// to a `display:none` desktop-only trigger that renders detached/mispositioned or not at
// all, leaving a live call with no way to end it (§13 honest / §36 discoverable on every
// viewport).
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useVoiceDevice } from "@/lib/voice/VoiceDeviceProvider";
import { DialPad } from "./DialPad";

export function DialPadSurface() {
  const voice = useVoiceDevice();
  if (!voice) return null;

  const { dialerOpen, setDialerOpen } = voice;

  return (
    <Sheet open={dialerOpen} onOpenChange={setDialerOpen}>
      <SheetContent side="right" className="w-[340px] max-w-[90vw] gap-0 p-0 sm:w-[360px]">
        {/* Radix requires a title for a11y; the pad is self-labelling, so keep it SR-only. */}
        <SheetHeader className="sr-only">
          <SheetTitle>Dialer</SheetTitle>
        </SheetHeader>
        <DialPad />
      </SheetContent>
    </Sheet>
  );
}
