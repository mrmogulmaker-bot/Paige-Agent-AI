/**
 * useDictation — press-to-talk voice dictation for any composer (#170, §49 Wave A).
 *
 * Replaces the dead voice-chat stub with a simple, honest mic → text pipeline:
 * hold the mic, speak, release; the words land in the composer. There is NO
 * agent, NO two-way voice, NO playback — dictation only.
 *
 * Pipeline
 *   getUserMedia (16k mono) → AudioRecorder resample → Float32 → Int16 PCM →
 *   binary WebSocket frames → `paige-dictate` edge fn → ONE Deepgram
 *   linear16/16k stream (via _shared/stt-router) → transcript JSON back.
 *
 * ── WS CONTRACT (matches the paige-dictate backend) ─────────────────────────
 *   Connect:  wss://<host>/functions/v1/paige-dictate?apikey=<ANON>&token=<jwt>
 *             A browser WebSocket cannot set headers, so the anon apikey (gateway
 *             routing) and the caller's Supabase access token both ride the query
 *             string. paige-dictate is verify_jwt=false and runs its OWN §9 gate:
 *             it verifies the token via auth.getUser() (invalid ⇒ socket never
 *             opens) and derives the tenant SERVER-SIDE via current_user_tenant_id()
 *             — never a client-supplied tenantId.
 *
 *   client → server (text, JSON):
 *     first frame:  { "type": "start", "sampleRate": 16000 }   // language? optional
 *     on release:   { "type": "stop" }
 *   client → server (binary):  raw PCM16 little-endian mono frames @ 16 kHz
 *                              (server fixes encoding = linear16).
 *
 *   server → client (text, JSON):
 *     { "type": "ready" }                                    // Deepgram open
 *     { "type": "transcript", "text": string, "is_final": boolean }
 *     { "type": "error", "code": string, "message": string } // socket closes after
 *
 * §13 honesty: this hook reports only what actually happened. A denied mic, a
 * missing config, or a socket failure surfaces a plain, jargon-free message —
 * never a silent success, and never a raw vendor/library error string leaking
 * to a tenant (§3/§45). Raw server error text is logged to the console only;
 * the tenant always sees a plain sentence.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioRecorder } from "@/utils/VoiceAudio";
import { supabase } from "@/integrations/supabase/client";

const DEEPGRAM_SAMPLE_RATE = 16000;

export type DictationStatus = "idle" | "requesting" | "listening" | "transcribing" | "error";

export interface UseDictationOptions {
  /** Called with each finalized transcript segment (no leading space). */
  onText: (segment: string) => void;
  /** Called with a plain, jargon-free message when dictation fails. */
  onError?: (message: string) => void;
}

export interface UseDictationApi {
  status: DictationStatus;
  /** Live (not-yet-final) transcript for an optional ambient hint. */
  partial: string;
  /** Plain message when status === "error"; null otherwise. */
  error: string | null;
  /** True while capturing or transcribing. */
  isActive: boolean;
  /** getUserMedia + WebSocket both available in this browser. */
  supported: boolean;
  /** Begin capture. MUST be called from within a user gesture (iOS). */
  start: () => Promise<void>;
  /** Stop capture and flush any trailing final transcript. */
  stop: () => void;
}

/**
 * Smart-join a dictated segment onto existing composer text: insert a single
 * separating space only when the previous text doesn't already end in
 * whitespace, so we never produce "worldhello" or double spaces. Shared so both
 * composers append dictation identically (§18 one home).
 */
export function appendDictation(prev: string, segment: string): string {
  if (!segment) return prev;
  if (!prev) return segment;
  return /\s$/.test(prev) ? prev + segment : prev + " " + segment;
}

// Float32 [-1,1] → Int16 PCM little-endian. Same clamp as VoiceAudio's
// encodeAudioForAPI, minus the base64 step (we stream raw binary over the WS).
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

/** Map any capture/socket failure to a plain, jargon-free message (§3). */
function describeDictationError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  const name = e?.name || "";
  const combined = `${name} ${e?.message || (typeof err === "string" ? err : "")}`.toLowerCase();
  if (name === "NotAllowedError" || combined.includes("permission") || combined.includes("denied")) {
    return "Microphone access is off. Allow the mic in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || combined.includes("no microphone") || combined.includes("notfound")) {
    return "No microphone found. Connect one and try again.";
  }
  if (name === "NotReadableError" || combined.includes("in use") || combined.includes("notreadable")) {
    return "Your microphone is being used by another app. Close it and try again.";
  }
  return "Voice typing isn't available right now. Please try again in a moment.";
}

function dictateWsUrl(token: string): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!base) return null;
  const wss = base.replace(/^http/, "ws").replace(/\/$/, "");
  // A browser WebSocket cannot set headers, so the anon apikey (gateway routing)
  // and the caller's access token (verified server-side → tenant) both ride the
  // query string, per the paige-dictate contract.
  const params = new URLSearchParams({ token });
  if (anon) params.set("apikey", anon);
  return `${wss}/functions/v1/paige-dictate?${params.toString()}`;
}

export function useDictation({ onText, onError }: UseDictationOptions): UseDictationApi {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const pendingFrames = useRef<ArrayBuffer[]>([]);
  const activeRef = useRef(false);
  // Keep the latest callbacks in refs so an inline closure from the consumer
  // never needs to re-subscribe and never goes stale mid-session.
  const onTextRef = useRef(onText);
  const onErrorRef = useRef(onError);
  useEffect(() => { onTextRef.current = onText; }, [onText]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof WebSocket !== "undefined";

  const teardown = useCallback(() => {
    activeRef.current = false;
    pendingFrames.current = [];
    try { recorderRef.current?.stop(); } catch { /* best-effort */ }
    recorderRef.current = null;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try { ws.close(); } catch { /* best-effort */ }
    }
  }, []);

  const fail = useCallback((message: string) => {
    setError(message);
    setStatus("error");
    setPartial("");
    onErrorRef.current?.(message);
    teardown();
  }, [teardown]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    // Stop the mic immediately; keep the socket open briefly so any trailing
    // final transcript still arrives, then the server closes it.
    try { recorderRef.current?.stop(); } catch { /* best-effort */ }
    recorderRef.current = null;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: "stop" })); } catch { /* best-effort */ }
    }
    setPartial("");
    setStatus((s) => (s === "error" ? s : "idle"));
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    if (!supported) { fail("Voice typing isn't supported in this browser."); return; }

    setError(null);
    setPartial("");
    setStatus("requesting");
    activeRef.current = true;

    // Acquire the mic FIRST, inside the caller's gesture (iOS requirement). If
    // the user denies, we never open a needless socket.
    let recorder: AudioRecorder;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { fail("Please sign in to use voice typing."); return; }

      const url = dictateWsUrl(token);
      if (!url) { fail("Voice typing isn't available right now."); return; }

      recorder = new AudioRecorder((frame) => {
        if (!activeRef.current) return;
        const buf = floatTo16BitPCM(frame);
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(buf);
        else pendingFrames.current.push(buf); // buffer until the socket opens
      }, DEEPGRAM_SAMPLE_RATE);
      await recorder.start();
      if (!activeRef.current) { try { recorder.stop(); } catch { /* ignore */ } return; }
      recorderRef.current = recorder;

      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        if (!activeRef.current) { try { ws.close(); } catch { /* ignore */ } return; }
        try {
          // Audio is resampled to 16 kHz mono linear16 client-side, so we declare
          // that rate truthfully (server fixes encoding=linear16). Matches the
          // paige-dictate start-frame contract: { type, sampleRate, language? }.
          ws.send(JSON.stringify({ type: "start", sampleRate: DEEPGRAM_SAMPLE_RATE }));
          // Flush frames captured before the socket finished connecting.
          for (const buf of pendingFrames.current) ws.send(buf);
        } catch { /* best-effort */ }
        pendingFrames.current = [];
        setStatus("listening");
      };

      ws.onmessage = (ev) => {
        let msg: { type?: string; text?: string; is_final?: boolean; message?: string };
        try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ""); }
        catch { return; }
        if (msg.type === "transcript") {
          const text = (msg.text || "").trim();
          if (msg.is_final) {
            if (text) onTextRef.current(text);
            setPartial("");
            if (activeRef.current) setStatus("listening");
          } else {
            setPartial(text);
            if (activeRef.current) setStatus("transcribing");
          }
        } else if (msg.type === "error") {
          // Never surface raw server/vendor text to the tenant (§3/§45) — log it
          // for debugging, show a plain sentence.
          if (msg.message) console.warn("[dictation] server error:", msg.message);
          fail("Voice typing hit a snag. Please try again.");
        } else if (msg.type === "ready") {
          if (activeRef.current) setStatus("listening");
        }
      };

      ws.onerror = () => {
        // A socket error mid-session is only a failure if we were still capturing.
        if (activeRef.current) fail("Couldn't reach voice typing. Check your connection and try again.");
      };

      ws.onclose = (ev) => {
        if (activeRef.current && !ev.wasClean) {
          fail("Voice typing disconnected. Please try again.");
        } else {
          teardown();
          setStatus((s) => (s === "error" ? s : "idle"));
        }
      };
    } catch (err) {
      fail(describeDictationError(err));
    }
  }, [supported, fail, teardown]);

  // Clean up on unmount so a mid-dictation navigation never leaks the mic/socket.
  useEffect(() => () => teardown(), [teardown]);

  return {
    status,
    partial,
    error,
    isActive: status === "listening" || status === "transcribing" || status === "requesting",
    supported,
    start,
    stop,
  };
}
