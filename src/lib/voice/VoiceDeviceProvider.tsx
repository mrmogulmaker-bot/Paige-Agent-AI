// #140 Slice A2 — the ONE Twilio Voice Device lifecycle (§18).
//
// This provider owns the SINGLE @twilio/voice-sdk `Device` instance for the whole
// admin shell. The top-nav dial pad and every click-to-call affordance are just
// callers of the one hook (`useVoiceDevice`) — there is never a second Device, so
// registrations don't leak and a call started from a contact row and a call started
// from the keypad are the same live call.
//
// DOCTRINE
//  §18  ONE home for the Device lifecycle. Mounted once (AdminLayout); consumers
//       read it via context. No per-surface Device.
//  §13  Honest states only. `needs_config` from the A1 token fn → a real "not set
//       up yet" state (no Device constructed, no fake dialer). A Device/connection
//       error or a denied mic → status "error" with a real reason — never a
//       fabricated "connected".
//  §32  The A1 token TTL is SHORT (default 600s). We subscribe to the Device's
//       `tokenWillExpire` event and re-mint + `updateToken` BEFORE it lapses, so a
//       stale token never silently kills calling.
//  §9   The browser passes NO tenant/identity to the token fn — identity is derived
//       server-side from the JWT (A1). We never log the token.
//  §14  Only the owner-sanctioned @twilio/voice-sdk is used; loaded lazily via a
//       dynamic import so the ~SDK weight isn't paid on admin pages that never call.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Call, Device, TwilioError } from "@twilio/voice-sdk";
import { supabase } from "@/integrations/supabase/client";

export type VoiceStatus =
  | "idle" // no Device yet (nothing has asked to call)
  | "connecting" // fetching token / registering / dialing
  | "ready" // Device registered, no active call
  | "in_call" // a call is live
  | "needs_config" // A1 token fn returned needs_config — voice not provisioned
  | "error"; // token/Device/mic failure — carries a human reason

export interface ActiveCallInfo {
  /** The number we dialed (display form). */
  number: string;
  /** epoch ms when the call connected — the DialPad renders a timer off this. */
  startedAt: number;
}

interface VoiceDeviceValue {
  status: VoiceStatus;
  /** Human-readable reason when status is "error" or "needs_config". */
  reason: string | null;
  /** Place an outbound call to an E.164-ish number. Lazily boots the Device. */
  call: (rawNumber: string) => Promise<void>;
  /** Hang up the active call (no-op if none). */
  hangup: () => void;
  muted: boolean;
  toggleMute: () => void;
  activeCall: ActiveCallInfo | null;

  // ── Dialer UI wiring (so a click-to-call anywhere drives the one top-nav pad) ──
  dialerOpen: boolean;
  setDialerOpen: (open: boolean) => void;
  /** Controlled keypad value, shared so click-to-call can prefill it. */
  draft: string;
  setDraft: (v: string) => void;
  /** Open the pad prefilled with a number (does NOT dial). */
  openDialerWith: (number: string) => void;
  /** Open the pad prefilled AND start the call (the click-to-call path). */
  callFrom: (number: string) => void;
  /** Boot the Device early (called when the pad opens) so the first dial is instant. */
  warmUp: () => void;
}

const VoiceDeviceContext = createContext<VoiceDeviceValue | null>(null);

// Re-mint this many ms is handled by Twilio's own `tokenWillExpire` (fires ~10s
// before expiry by default); we just react to it. Kept as a named constant so the
// §32 refresh path is self-documenting.
const TOKEN_REFRESH_EVENT = "tokenWillExpire" as const;

type MintResult =
  | { kind: "token"; token: string }
  | { kind: "needs_config"; message: string }
  | { kind: "error"; message: string };

/**
 * Call the A1 token seam. §9: no body params that could widen scope — identity and
 * tenant are server-derived from the JWT. §13: needs_config and error are surfaced
 * honestly; the token is never logged.
 */
async function mintToken(): Promise<MintResult> {
  try {
    const { data, error } = await supabase.functions.invoke("voice-access-token", {
      body: {},
    });
    if (error) {
      // functions.invoke turns a non-2xx (e.g. the 502 real-failure path) into `error`.
      // needs_config is a 200 so it lands in `data`, not here.
      return { kind: "error", message: "Couldn't reach the calling service. Try again in a moment." };
    }
    const d = (data ?? {}) as {
      token?: string;
      needs_config?: boolean;
      message?: string;
    };
    if (d.needs_config) {
      return {
        kind: "needs_config",
        message:
          d.message ??
          "Calling isn't set up for this practice yet. Once your phone number is provisioned you'll be able to call from the browser.",
      };
    }
    if (typeof d.token === "string" && d.token.length > 0) {
      return { kind: "token", token: d.token };
    }
    return { kind: "error", message: "Calling is temporarily unavailable." };
  } catch {
    return { kind: "error", message: "Couldn't reach the calling service. Try again in a moment." };
  }
}

/** Best-effort E.164-ish normalisation: keep a leading +, strip everything non-digit. */
export function normalizeDialNumber(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return hasPlus ? `+${digits}` : digits;
}

export function VoiceDeviceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [dialerOpen, setDialerOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  // Guards concurrent boots (pad opens + click-to-call fire together).
  const bootingRef = useRef<Promise<Device | null> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSet = useCallback(<T,>(setter: (v: T) => void, v: T) => {
    if (mountedRef.current) setter(v);
  }, []);

  // ── Device boot (lazy, single-flight). Constructs + registers the ONE Device. ──
  const bootDevice = useCallback(async (): Promise<Device | null> => {
    if (deviceRef.current) return deviceRef.current;
    if (bootingRef.current) return bootingRef.current;

    const boot = (async (): Promise<Device | null> => {
      safeSet(setStatus, "connecting");
      safeSet(setReason, null);

      const minted = await mintToken();
      if (minted.kind === "needs_config") {
        safeSet(setStatus, "needs_config");
        safeSet(setReason, minted.message);
        return null;
      }
      if (minted.kind === "error") {
        safeSet(setStatus, "error");
        safeSet(setReason, minted.message);
        return null;
      }

      // §14: load the owner-sanctioned SDK lazily — only when someone actually calls.
      let DeviceCtor: typeof Device;
      try {
        ({ Device: DeviceCtor } = await import("@twilio/voice-sdk"));
      } catch {
        safeSet(setStatus, "error");
        safeSet(setReason, "The calling module failed to load. Refresh and try again.");
        return null;
      }

      let device: Device;
      try {
        device = new DeviceCtor(minted.token, {
          // Keep the audio graph lean; A3 will extend codec/edge options.
          closeProtection: true,
        });
      } catch {
        safeSet(setStatus, "error");
        safeSet(setReason, "Couldn't start the calling device.");
        return null;
      }

      device.on("registered", () => {
        // Don't stomp an in-progress call's status.
        if (!callRef.current) safeSet(setStatus, "ready");
      });

      device.on("error", (err: TwilioError.TwilioError) => {
        // §13/§32: a Device 'error' must NOT tear down a LIVE call's surface. Twilio
        // emits 'error' mid-call for non-fatal signaling/reconnect/edge conditions; if
        // we flipped status to "error" while a call is connected, DialPad's active-call
        // surface (timer + mute + the destructive HANG-UP) would unmount and the user
        // would be stuck on a still-live call with no way to end it. Real mid-call
        // failures are owned by call.on("error") below (which clears the call + resets
        // state). So only surface a Device-level error when there is NO active call.
        if (callRef.current) return;
        safeSet(setStatus, "error");
        safeSet(
          setReason,
          err?.message ? `Calling error: ${err.message}` : "A calling error occurred.",
        );
      });

      // §32: SHORT token refresh. Twilio fires this ~10s before expiry — re-mint and
      // hand the Device a fresh token so a live/idle registration never goes stale.
      device.on(TOKEN_REFRESH_EVENT, async () => {
        const applyFreshToken = async (): Promise<boolean> => {
          const next = await mintToken();
          if (next.kind !== "token") return false;
          try {
            device.updateToken(next.token);
            return true;
          } catch {
            return false;
          }
        };
        // One short-backoff retry absorbs a transient mint blip (network/502).
        let refreshed = await applyFreshToken();
        if (!refreshed) {
          await new Promise((r) => setTimeout(r, 1500));
          refreshed = await applyFreshToken();
        }
        // §32 "a stale token silently kills calling": if the refresh ultimately fails
        // AND no call is live, DESTROY the dead-but-registered Device so the next call()
        // re-boots with a fresh token — otherwise bootDevice() reuses the stale deviceRef
        // forever and calling is silently dead until a page reload. A live call is left
        // untouched (its own error path owns it); the dead registration is only reaped
        // when idle.
        if (!refreshed && !callRef.current) {
          try {
            device.destroy();
          } catch {
            /* ignore */
          }
          if (deviceRef.current === device) deviceRef.current = null;
          safeSet(setStatus, "idle");
        }
      });

      // A2 does NOT own inbound (A3 does). Stub so an incoming call can't crash the
      // shell: reject it politely rather than auto-answering or throwing.
      device.on("incoming", (incoming: Call) => {
        try {
          incoming.reject();
        } catch {
          /* no-op — A3 wires real inbound handling */
        }
      });

      try {
        await device.register();
      } catch {
        safeSet(setStatus, "error");
        safeSet(setReason, "Couldn't register for calling. Try again in a moment.");
        return null;
      }

      deviceRef.current = device;
      return device;
    })();

    bootingRef.current = boot;
    const result = await boot;
    bootingRef.current = null;
    return result;
  }, [safeSet]);

  const warmUp = useCallback(() => {
    // Fire-and-forget; status reflects progress. Never throws to the caller.
    if (!deviceRef.current && status !== "connecting") void bootDevice();
  }, [bootDevice, status]);

  const wireCall = useCallback(
    (call: Call, number: string) => {
      callRef.current = call;
      setMuted(false);

      call.on("accept", () => {
        safeSet(setStatus, "in_call");
        safeSet(setActiveCall, { number, startedAt: Date.now() });
      });

      const end = () => {
        callRef.current = null;
        safeSet(setActiveCall, null);
        safeSet(setMuted, false);
        // Back to ready if the Device is still registered, else idle.
        safeSet(setStatus, deviceRef.current ? "ready" : "idle");
      };
      call.on("disconnect", end);
      call.on("cancel", end);
      call.on("reject", end);
      call.on("error", (err: TwilioError.TwilioError) => {
        safeSet(setStatus, "error");
        safeSet(setReason, err?.message ? `Call failed: ${err.message}` : "The call failed.");
        callRef.current = null;
        safeSet(setActiveCall, null);
      });
    },
    [safeSet],
  );

  const call = useCallback(
    async (rawNumber: string) => {
      const number = normalizeDialNumber(rawNumber);
      if (!number) {
        safeSet(setStatus, "error");
        safeSet(setReason, "Enter a number to call.");
        return;
      }
      if (callRef.current) return; // already in a call — A3 owns multi-call

      // Mic is required for outbound audio. Probe FIRST so a denial is a clear,
      // handled state (§13) instead of an opaque Device failure mid-connect.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release the probe track immediately; Twilio acquires its own.
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        safeSet(setStatus, "error");
        safeSet(
          setReason,
          "Microphone access is blocked. Allow the mic in your browser to place calls.",
        );
        return;
      }

      const device = await bootDevice();
      if (!device) return; // status already set to needs_config/error honestly

      safeSet(setStatus, "connecting");
      safeSet(setActiveCall, { number, startedAt: Date.now() });
      try {
        const outbound = await device.connect({ params: { To: number } });
        wireCall(outbound, number);
      } catch {
        safeSet(setStatus, deviceRef.current ? "ready" : "error");
        safeSet(setReason, "Couldn't place the call. Try again.");
        safeSet(setActiveCall, null);
      }
    },
    [bootDevice, wireCall, safeSet],
  );

  const hangup = useCallback(() => {
    const c = callRef.current;
    if (c) {
      try {
        c.disconnect();
      } catch {
        /* disconnect handler resets state */
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    const next = !c.isMuted();
    c.mute(next);
    setMuted(next);
  }, []);

  const openDialerWith = useCallback(
    (number: string) => {
      setDraft(number);
      setDialerOpen(true);
      warmUp();
    },
    [warmUp],
  );

  const callFrom = useCallback(
    (number: string) => {
      setDraft(number);
      setDialerOpen(true);
      void call(number);
    },
    [call],
  );

  // Clean up the Device on unmount so we never leak a registration (§18/§13).
  useEffect(() => {
    return () => {
      try {
        callRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        deviceRef.current?.destroy();
      } catch {
        /* ignore */
      }
      deviceRef.current = null;
      callRef.current = null;
    };
  }, []);

  const value = useMemo<VoiceDeviceValue>(
    () => ({
      status,
      reason,
      call,
      hangup,
      muted,
      toggleMute,
      activeCall,
      dialerOpen,
      setDialerOpen,
      draft,
      setDraft,
      openDialerWith,
      callFrom,
      warmUp,
    }),
    [
      status,
      reason,
      call,
      hangup,
      muted,
      toggleMute,
      activeCall,
      dialerOpen,
      draft,
      openDialerWith,
      callFrom,
      warmUp,
    ],
  );

  return <VoiceDeviceContext.Provider value={value}>{children}</VoiceDeviceContext.Provider>;
}

/**
 * Consume the single Device. Returns null if no provider is mounted (e.g. a surface
 * outside the admin shell) so callers can degrade instead of crashing.
 */
export function useVoiceDevice(): VoiceDeviceValue | null {
  return useContext(VoiceDeviceContext);
}
