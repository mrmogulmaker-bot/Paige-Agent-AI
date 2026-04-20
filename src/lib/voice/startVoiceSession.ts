/**
 * Cross-browser helpers for starting an ElevenLabs voice session.
 *
 * Why this exists: mobile browsers (especially iOS Safari) impose strict
 * gesture-context rules around `getUserMedia` and `AudioContext`. If the
 * voice SDK is started after multiple `await` hops, the gesture context
 * is lost and the mic silently shuts down. These helpers must be invoked
 * directly from a click handler to preserve that gesture.
 */
import { supabase } from "@/integrations/supabase/client";

export type StartVoiceSessionResult = {
  /** Pass to `conversation.startSession`. */
  conversationToken?: string;
  signedUrl?: string;
  /** Pass through; the SDK auto-selects WebRTC when token is present. */
  connectionType: "webrtc" | "websocket";
  /** Keep this and resume() it once the SDK is connected (iOS speaker unlock). */
  audioContext: AudioContext | null;
  agentId?: string;
};

export type VoiceTransport = "webrtc" | "websocket";

type VoiceConversationController = {
  startSession: (options: any) => Promise<unknown>;
  endSession: () => Promise<void>;
};

export type StartManagedVoiceSessionOptions = {
  conversation: VoiceConversationController;
  authToken?: string;
  overrides?: Record<string, unknown>;
  logLabel?: string;
  forceWebSocket?: boolean;
};

export type StartManagedVoiceSessionResult = {
  connectionType: VoiceTransport;
  agentId?: string;
  usedFallback: boolean;
};

/**
 * Run inside the click handler — BEFORE any `await` — to:
 *   1) Unlock the iOS audio output by creating + resuming an AudioContext.
 *   2) Probe mic permission with a short-lived stream and immediately stop it
 *      so the SDK can acquire its own stream cleanly.
 *
 * Returns the AudioContext so the caller can keep it alive until disconnect.
 */
export async function primeMicAndAudio(): Promise<{ audioContext: AudioContext | null }> {
  // 1) Create + resume AudioContext synchronously (iOS Safari speaker unlock).
  let audioContext: AudioContext | null = null;
  try {
    const Ctor: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (Ctor) {
      audioContext = new Ctor();
      // resume() must be called inside the gesture — do not await elsewhere first.
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
    }
  } catch (e) {
    console.warn("[voice] AudioContext init failed (will continue without speaker unlock):", e);
  }

  // 2) Probe mic permission, then immediately release the tracks so the SDK can grab them.
  // iOS will refuse a second concurrent mic stream — releasing here is critical.
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());

  return { audioContext };
}

/**
 * Fetches a WebRTC conversation token (preferred) and falls back to a signed
 * WebSocket URL if the token endpoint isn't deployed. Always returns something
 * usable by `conversation.startSession`.
 */
export async function fetchVoiceCredentials(authToken?: string): Promise<{
  conversationToken?: string;
  signedUrl?: string;
  agentId?: string;
}> {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;

  // Try WebRTC token first (recommended for mobile).
  try {
    const { data, error } = await supabase.functions.invoke(
      "elevenlabs-conversation-token",
      { headers },
    );
    if (!error && data?.token) {
      return { conversationToken: data.token, agentId: data.agentId };
    }
    if (error) {
      console.warn("[voice] WebRTC token endpoint failed, falling back to signed URL:", error);
    }
  } catch (e) {
    console.warn("[voice] WebRTC token request threw, falling back to signed URL:", e);
  }

  // Fallback: signed WebSocket URL.
  const { data, error } = await supabase.functions.invoke(
    "elevenlabs-signed-url",
    { headers },
  );
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Voice service did not return a signed URL");
  return { signedUrl: data.signedUrl, agentId: data.agentId };
}

async function fetchSignedUrlCredentials(authToken?: string): Promise<{
  signedUrl?: string;
  agentId?: string;
}> {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
  const { data, error } = await supabase.functions.invoke(
    "elevenlabs-signed-url",
    { headers },
  );
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Voice service did not return a signed URL");
  return { signedUrl: data.signedUrl, agentId: data.agentId };
}

function isRecoverableWebRtcError(err: unknown): boolean {
  const e = err as any;
  const combined = `${e?.name || ""} ${e?.message || ""} ${e?.reason || ""}`.toLowerCase();
  return [
    "peer connection",
    "createoffer",
    "webrtc",
    "rtc",
    "ice",
    "sdp",
    "closed",
    "transport",
  ].some((token) => combined.includes(token));
}

async function startSessionWithCredentials(
  conversation: VoiceConversationController,
  creds: { conversationToken?: string; signedUrl?: string; agentId?: string },
  overrides?: Record<string, unknown>,
  logLabel = "[voice]",
): Promise<VoiceTransport> {
  const connectionType: VoiceTransport = creds.conversationToken ? "webrtc" : "websocket";
  console.log(`${logLabel} starting ${connectionType} voice session`, {
    agentId: creds.agentId,
    hasToken: !!creds.conversationToken,
    hasSignedUrl: !!creds.signedUrl,
  });

  if (creds.conversationToken) {
    await conversation.startSession({
      conversationToken: creds.conversationToken,
      connectionType: "webrtc",
      ...(overrides ?? {}),
    });
    return "webrtc";
  }

  if (creds.signedUrl) {
    await conversation.startSession({
      signedUrl: creds.signedUrl,
      ...(overrides ?? {}),
    });
    return "websocket";
  }

  throw new Error("No voice credentials returned");
}

export async function startManagedVoiceSession({
  conversation,
  authToken,
  overrides,
  logLabel = "[voice]",
  forceWebSocket = false,
}: StartManagedVoiceSessionOptions): Promise<StartManagedVoiceSessionResult> {
  if (forceWebSocket) {
    const wsCreds = await fetchSignedUrlCredentials(authToken);
    await startSessionWithCredentials(conversation, wsCreds, overrides, logLabel);
    return { connectionType: "websocket", agentId: wsCreds.agentId, usedFallback: true };
  }

  const creds = await fetchVoiceCredentials(authToken);

  try {
    const connectionType = await startSessionWithCredentials(conversation, creds, overrides, logLabel);
    return { connectionType, agentId: creds.agentId, usedFallback: false };
  } catch (err) {
    if (!creds.conversationToken || !isRecoverableWebRtcError(err)) {
      throw err;
    }

    console.warn(`${logLabel} WebRTC session failed, retrying over signed URL`, err);
    try {
      await conversation.endSession();
    } catch {
      // ignore partial session cleanup failure before fallback
    }

    const wsCreds = await fetchSignedUrlCredentials(authToken);
    await startSessionWithCredentials(conversation, wsCreds, overrides, `${logLabel} [fallback]`);
    return {
      connectionType: "websocket",
      agentId: wsCreds.agentId ?? creds.agentId,
      usedFallback: true,
    };
  }
}

/**
 * Map any thrown error from getUserMedia / SDK / fetch into a user-facing message.
 */
export function describeVoiceError(err: unknown, isMobile: boolean): { title: string; description: string } {
  const e = err as any;
  const name: string = e?.name || "";
  const msg: string = (e?.message || (typeof e === "string" ? e : "")) || "";
  const combined = `${name} ${msg}`.toLowerCase();

  if (name === "NotAllowedError" || combined.includes("permission") || combined.includes("notallowed")) {
    return {
      title: "Microphone Access Required",
      description: isMobile
        ? "Enable the microphone in your browser settings. On iPhone: Settings → Safari → Microphone → Allow. Then refresh and try again."
        : "Click the lock icon in your browser's address bar and allow microphone access, then try again.",
    };
  }
  if (name === "NotFoundError" || combined.includes("notfound") || combined.includes("no microphone")) {
    return {
      title: "No Microphone Found",
      description: "We couldn't detect a microphone. Connect one and try again.",
    };
  }
  if (name === "NotReadableError" || combined.includes("notreadable") || combined.includes("in use")) {
    return {
      title: "Microphone In Use",
      description: "Another app is using your microphone. Close it (Zoom, Teams, FaceTime, etc.) and try again.",
    };
  }
  if (combined.includes("websocket") || combined.includes("network") || combined.includes("failed to fetch")) {
    return {
      title: "Connection Failed",
      description: "We couldn't reach the voice service. Check your internet connection and try again.",
    };
  }
  if (combined.includes("token") || combined.includes("signed url") || combined.includes("agent")) {
    return {
      title: "Voice Service Unavailable",
      description: msg || "The voice service is temporarily unavailable. Please try again in a moment.",
    };
  }
  return {
    title: "Voice Chat Failed to Start",
    description: msg || `Unexpected error${name ? ` (${name})` : ""}. Please try again.`,
  };
}
