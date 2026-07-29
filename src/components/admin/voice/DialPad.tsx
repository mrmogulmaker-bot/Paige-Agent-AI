// #140 Slice A2 — the dial pad UI. Renders inside the top-nav trigger's popover and
// is a pure CONSUMER of the single Device (§18): it holds no Twilio state of its own.
//
//  §11  GOLD is spent on exactly ONE control — the primary CALL button. The keypad
//       digits, backspace, and the hang-up (destructive) are neutral/indigo. No gold
//       on a resting border, key, or the mute toggle.
//  §13  Honest states: needs_config → a real "not set up yet" panel (no fake dialer);
//       error → a real reason; connecting → an honest spinner; never a fake "connected".
//  §11  Token-only, AA both themes, motion-safe (useReducedMotion guards the pulse).
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Delete, Loader2, Mic, MicOff, Phone, PhoneCall, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useVoiceDevice, normalizeDialNumber } from "@/lib/voice/VoiceDeviceProvider";

const KEYS: { d: string; sub?: string }[] = [
  { d: "1" }, { d: "2", sub: "ABC" }, { d: "3", sub: "DEF" },
  { d: "4", sub: "GHI" }, { d: "5", sub: "JKL" }, { d: "6", sub: "MNO" },
  { d: "7", sub: "PQRS" }, { d: "8", sub: "TUV" }, { d: "9", sub: "WXYZ" },
  { d: "*" }, { d: "0", sub: "+" }, { d: "#" },
];

function useCallTimer(startedAt: number | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt == null) return;
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function DialPad() {
  const voice = useVoiceDevice();
  const reduceMotion = useReducedMotion();
  // All hooks run unconditionally BEFORE any early return (rules of hooks).
  const timer = useCallTimer(voice?.activeCall?.startedAt ?? null);

  // No provider (defensive) — render nothing rather than crash.
  if (!voice) return null;

  const {
    status, reason, draft, setDraft, call, hangup, muted, toggleMute, activeCall,
  } = voice;

  const inCall = status === "in_call" || (status === "connecting" && activeCall != null);
  const normalized = normalizeDialNumber(draft);
  const canCall = normalized.length > 0 && status !== "connecting";

  function press(k: string) {
    setDraft(draft + k);
  }
  function backspace() {
    setDraft(draft.slice(0, -1));
  }

  // ── Honest: calling not provisioned (§13) ────────────────────────────────────
  if (status === "needs_config") {
    return (
      <div className="p-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <PhoneOff className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Calling isn't set up yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {reason ?? "Once your phone number is provisioned you'll be able to call from the browser."}
        </p>
      </div>
    );
  }

  // ── Active call surface ──────────────────────────────────────────────────────
  if (inCall) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <div className="flex flex-col items-center gap-1">
          <span
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary",
              status === "in_call" && !reduceMotion && "animate-pulse",
            )}
          >
            <PhoneCall className="h-6 w-6" />
          </span>
          <p className="mt-2 text-base font-semibold tabular-nums tracking-tight text-foreground">
            {activeCall?.number ?? normalized}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {status === "connecting" ? "Connecting…" : timer}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant={muted ? "secondary" : "outline"}
            size="icon"
            aria-pressed={muted}
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={toggleMute}
            className="h-12 w-12 rounded-full"
          >
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          {/* Hang up is DESTRUCTIVE, never gold (§11). */}
          <Button
            type="button"
            variant="destructive"
            size="icon"
            aria-label="Hang up"
            onClick={hangup}
            className="h-14 w-14 rounded-full"
          >
            <PhoneOff className="h-6 w-6" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Idle / ready / connecting / error dialer ─────────────────────────────────
  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <label htmlFor="dialpad-number" className="sr-only">Phone number</label>
        <Input
          id="dialpad-number"
          inputMode="tel"
          autoComplete="off"
          placeholder="Enter a number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCall) { e.preventDefault(); void call(draft); }
          }}
          className="h-12 text-center text-lg font-medium tracking-wide tabular-nums"
        />
      </div>

      {/* Keypad — all NEUTRAL (§11: no gold on keys). */}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k.d}
            type="button"
            onClick={() => press(k.d)}
            aria-label={`Dial ${k.d}`}
            className={cn(
              "flex h-12 flex-col items-center justify-center rounded-md border border-border bg-background",
              "text-lg font-medium text-foreground transition-colors",
              "hover:bg-secondary hover:border-primary/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              !reduceMotion && "active:scale-[0.97]",
            )}
          >
            <span className="leading-none">{k.d}</span>
            {k.sub && <span className="mt-0.5 text-[9px] leading-none tracking-widest text-muted-foreground">{k.sub}</span>}
          </button>
        ))}
      </div>

      {/* Row: backspace (neutral) + CALL (the ONE gold act, §11). */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Backspace"
          onClick={backspace}
          disabled={draft.length === 0}
          className="h-12 w-12 shrink-0"
        >
          <Delete className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="gold"
          onClick={() => void call(draft)}
          disabled={!canCall}
          className="h-12 flex-1 text-base"
          aria-label="Call"
        >
          {status === "connecting" ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Connecting…</>
          ) : (
            <><Phone className="h-5 w-5" /> Call</>
          )}
        </Button>
      </div>

      {/* Honest error line (§13) — a real reason, never a fake "connected". */}
      {status === "error" && reason && (
        <p role="alert" className="text-center text-xs text-destructive">{reason}</p>
      )}
    </div>
  );
}
