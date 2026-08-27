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
const TRANSCRIPTION_SETTLE_TIMEOUT_MS = 15_000;

export type DictationStatus = "idle" | "requesting" | "listening" | "transcribing" | "error";
export type DictationFailure = "permission-denied" | "unsupported" | "provider-failure" | "unavailable";

export interface UseDictationOptions {
  /** Called with each finalized transcript segment (no leading space). */
  onText: (segment: string) => void;
  /** Called with a plain, jargon-free message when dictation fails. */
  onError?: (message: string) => void;
  /** Authenticated account epoch. A change invalidates the entire recording generation. */
  scopeEpoch?: string | null;
}

export interface UseDictationApi {
  status: DictationStatus;
  /** Live (not-yet-final) transcript for an optional ambient hint. */
  partial: string;
  /** Plain message when status === "error"; null otherwise. */
  error: string | null;
  /** Stable failure class for accessible, truthful UI copy. */
  failure: DictationFailure | null;
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
function describeDictationError(err: unknown): { failure: DictationFailure; message: string } {
  const e = err as { name?: string; message?: string };
  const name = e?.name || "";
  const combined = `${name} ${e?.message || (typeof err === "string" ? err : "")}`.toLowerCase();
  if (name === "NotAllowedError" || combined.includes("permission") || combined.includes("denied")) {
    return { failure: "permission-denied", message: "Microphone access is off. Allow the mic in your browser settings, then try again." };
  }
  if (name === "NotFoundError" || combined.includes("no microphone") || combined.includes("notfound")) {
    return { failure: "unavailable", message: "No microphone found. Connect one and try again." };
  }
  if (name === "NotReadableError" || combined.includes("in use") || combined.includes("notreadable")) {
    return { failure: "unavailable", message: "Your microphone is being used by another app. Close it and try again." };
  }
  return { failure: "unavailable", message: "Voice typing isn't available right now. Please try again in a moment." };
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

type DictationRun = {
  generation: number;
  scopeEpoch: string | null;
  released: boolean;
  recorder: AudioRecorder | null;
  socket: WebSocket | null;
  pendingFrames: ArrayBuffer[];
  settleTimer: ReturnType<typeof setTimeout> | null;
};

export function useDictation({ onText, onError, scopeEpoch = null }: UseDictationOptions): UseDictationApi {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<DictationFailure | null>(null);
  const generationRef = useRef(0);
  const currentRunRef = useRef<DictationRun | null>(null);
  const scopeEpochRef = useRef(scopeEpoch);
  scopeEpochRef.current = scopeEpoch;
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

  const teardownRun = useCallback((run: DictationRun) => {
    if (run.settleTimer) clearTimeout(run.settleTimer);
    run.settleTimer = null;
    run.pendingFrames = [];
    try { run.recorder?.stop(); } catch { /* best-effort */ }
    run.recorder = null;
    const ws = run.socket;
    run.socket = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try { ws.close(); } catch { /* best-effort */ }
    }
  }, []);

  const isCurrent = useCallback((run: DictationRun) =>
    currentRunRef.current === run &&
    run.generation === generationRef.current &&
    run.scopeEpoch === scopeEpochRef.current,
  []);

  const finishRun = useCallback((run: DictationRun) => {
    if (!isCurrent(run)) return;
    currentRunRef.current = null;
    teardownRun(run);
    setPartial("");
    setFailure(null);
    setError(null);
    setStatus("idle");
  }, [isCurrent, teardownRun]);

  const failRun = useCallback((run: DictationRun, nextFailure: DictationFailure, message: string) => {
    if (!isCurrent(run)) return;
    currentRunRef.current = null;
    setFailure(nextFailure);
    setError(message);
    setStatus("error");
    setPartial("");
    onErrorRef.current?.(message);
    teardownRun(run);
  }, [isCurrent, teardownRun]);

  const stop = useCallback(() => {
    const run = currentRunRef.current;
    if (!run || run.released) return;
    run.released = true;
    // Stop the mic immediately; keep the socket open briefly so any trailing
    // final transcript still arrives, then the server closes it.
    try { run.recorder?.stop(); } catch { /* best-effort */ }
    run.recorder = null;
    const ws = run.socket;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: "stop" })); } catch { /* best-effort */ }
    }
    run.settleTimer = setTimeout(() => {
      failRun(run, "provider-failure", "Voice typing took too long to finish. Please try again.");
    }, TRANSCRIPTION_SETTLE_TIMEOUT_MS);
    setPartial("");
    setStatus((s) => (s === "error" ? s : "transcribing"));
  }, [failRun]);

  const start = useCallback(async () => {
    // One provider stream at a time. A released run remains current until its
    // trailing final/close arrives, preventing old-close/new-socket contamination.
    if (currentRunRef.current) return;
    if (!supported) {
      const message = "Voice typing isn't supported in this browser.";
      setFailure("unsupported"); setError(message); setStatus("error");
      onErrorRef.current?.(message);
      return;
    }

    setError(null);
    setFailure(null);
    setPartial("");
    setStatus("requesting");
    const run: DictationRun = {
      generation: ++generationRef.current,
      scopeEpoch: scopeEpochRef.current,
      released: false,
      recorder: null,
      socket: null,
      pendingFrames: [],
      settleTimer: null,
    };
    currentRunRef.current = run;

    // Acquire the mic FIRST, inside the caller's gesture (iOS requirement). If
    // the user denies, we never open a needless socket.
    let recorder: AudioRecorder;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isCurrent(run)) return;
      if (run.released) { finishRun(run); return; }
      const token = session?.access_token;
      if (!token) { failRun(run, "unavailable", "Please sign in to use voice typing."); return; }

      const url = dictateWsUrl(token);
      if (!url) { failRun(run, "unavailable", "Voice typing isn't available right now."); return; }

      recorder = new AudioRecorder((frame) => {
        if (!isCurrent(run) || run.released) return;
        const buf = floatTo16BitPCM(frame);
        const ws = run.socket;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(buf);
        else run.pendingFrames.push(buf); // buffer until this run's socket opens
      }, DEEPGRAM_SAMPLE_RATE);
      // Register before awaiting permission/audio startup so release, unmount,
      // and account invalidation can stop a partially acquired microphone.
      run.recorder = recorder;
      await recorder.start();
      if (!isCurrent(run)) return; // invalidation already tore this run down
      if (run.released) { finishRun(run); return; }

      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      run.socket = ws;

      ws.onopen = () => {
        if (!isCurrent(run)) { try { ws.close(); } catch { /* ignore */ } return; }
        try {
          // Audio is resampled to 16 kHz mono linear16 client-side, so we declare
          // that rate truthfully (server fixes encoding=linear16). Matches the
          // paige-dictate start-frame contract: { type, sampleRate, language? }.
          ws.send(JSON.stringify({ type: "start", sampleRate: DEEPGRAM_SAMPLE_RATE }));
          // Flush frames captured before the socket finished connecting.
          for (const buf of run.pendingFrames) ws.send(buf);
          if (run.released) ws.send(JSON.stringify({ type: "stop" }));
        } catch { /* best-effort */ }
        run.pendingFrames = [];
        setStatus(run.released ? "transcribing" : "listening");
      };

      ws.onmessage = (ev) => {
        if (!isCurrent(run)) return;
        let msg: { type?: string; text?: string; is_final?: boolean; message?: string; code?: string };
        try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ""); }
        catch { return; }
        if (msg.type === "transcript") {
          const text = (msg.text || "").trim();
          if (msg.is_final) {
            if (text) onTextRef.current(text);
            setPartial("");
            setStatus(run.released ? "transcribing" : "listening");
          } else {
            setPartial(text);
            setStatus(run.released ? "transcribing" : "listening");
          }
        } else if (msg.type === "error") {
          // Never surface raw server/vendor text to the tenant (§3/§45) — log it
          // for debugging, show a plain sentence.
          if (msg.message) console.warn("[dictation] server error:", msg.message);
          const unavailable = msg.code === "not_configured";
          failRun(run, unavailable ? "unavailable" : "provider-failure", unavailable
            ? "Voice typing isn't available right now."
            : "Voice typing hit a snag. Please try again.");
        } else if (msg.type === "ready") {
          setStatus(run.released ? "transcribing" : "listening");
        }
      };

      ws.onerror = () => {
        failRun(run, "provider-failure", "Couldn't reach voice typing. Check your connection and try again.");
      };

      ws.onclose = (ev) => {
        if (!isCurrent(run)) return;
        if (!ev.wasClean || !run.released) failRun(run, "provider-failure", "Voice typing disconnected. Please try again.");
        else finishRun(run);
      };
    } catch (err) {
      if (!isCurrent(run)) return;
      const described = describeDictationError(err);
      failRun(run, described.failure, described.message);
    }
  }, [supported, failRun, finishRun, isCurrent]);

  useEffect(() => {
    const run = currentRunRef.current;
    if (!run || run.scopeEpoch === scopeEpoch) return;
    generationRef.current += 1;
    currentRunRef.current = null;
    teardownRun(run);
    setStatus("idle"); setPartial(""); setError(null); setFailure(null);
  }, [scopeEpoch, teardownRun]);

  // Clean up on unmount so a mid-dictation navigation never leaks the mic/socket.
  useEffect(() => () => {
    generationRef.current += 1;
    const run = currentRunRef.current;
    currentRunRef.current = null;
    if (run) teardownRun(run);
  }, [teardownRun]);

  return {
    status,
    partial,
    error,
    failure,
    isActive: status === "listening" || status === "transcribing" || status === "requesting",
    supported,
    start,
    stop,
  };
}
