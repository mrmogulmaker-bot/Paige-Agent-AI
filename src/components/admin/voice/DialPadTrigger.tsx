// #140 Slice A2 — the persistent dialer TRIGGER. A plain icon button that toggles the
// shared dialer-open state on the Device provider; the pad surface itself is rendered
// ONCE by <DialPadSurface/> (a viewport-anchored Sheet), so this trigger can be mounted
// on BOTH the desktop utilities cluster AND the mobile header without a second pad
// instance (§18: one Device, one pad surface, many plain triggers). §36: a recognizable
// phone icon in the top nav, discoverable in <5 min with zero docs — on every viewport.
import { Phone, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceDevice } from "@/lib/voice/VoiceDeviceProvider";

export function DialPadTrigger() {
  const voice = useVoiceDevice();
  if (!voice) return null;

  const { dialerOpen, setDialerOpen, warmUp, status } = voice;
  const live = status === "in_call";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={live ? "Dialer (call in progress)" : "Dialer"}
      aria-haspopup="dialog"
      aria-expanded={dialerOpen}
      onClick={() => {
        const next = !dialerOpen;
        setDialerOpen(next);
        if (next) warmUp(); // boot the Device on open so the first dial is instant
      }}
      className="relative text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50"
    >
      {live ? <PhoneCall className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
      {/* Ambient "call live" dot — a semantic SUCCESS (green) status, NOT gold. NOTE:
          --accent IS Paige Gold, so it must never be used here; gold is spent only on
          the pad's Call button (§11 gold-only-on-the-act). --success reads as
          "live/connected", the §11-sanctioned semantic-status path. */}
      {live && (
        <span
          aria-hidden
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-success ring-2 ring-primary"
        />
      )}
    </Button>
  );
}
