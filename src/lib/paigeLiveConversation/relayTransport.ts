import { AudioRecorder } from "@/utils/VoiceAudio";

export type RelayTransportState =
  | { kind: "ready" }
  | { kind: "unavailable"; message: string }
  | { kind: "permission-denied" }
  | { kind: "disconnected" };

export interface RelayTransport {
  interrupt(): void;
  setMuted(muted: boolean): void;
  stop(): void;
}

function pcm16(samples: Float32Array): ArrayBuffer {
  const output = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output.buffer;
}

function relayUrl(sessionId: string, ticket: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const params = new URLSearchParams({ session: sessionId, ticket });
  if (apikey) params.set("apikey", apikey);
  return base.replace(/^http/, "ws").replace(/\/$/, "") + "/functions/v1/paige-live-relay?" + params;
}

/**
 * First-party audio transport. No vendor SDK or key enters the browser.
 * Capture starts only after a server ready frame; the provider-free server
 * never sends ready, so it never asks for microphone permission.
 */
export function connectPaigeLiveRelay(input: Readonly<{
  sessionId: string;
  ticket: string;
  onState: (state: RelayTransportState) => void;
  onTranscript?: (text: string, final: boolean) => void;
}>): RelayTransport {
  const socket = new WebSocket(relayUrl(input.sessionId, input.ticket));
  socket.binaryType = "arraybuffer";
  let recorder: AudioRecorder | null = null;
  let context: AudioContext | null = null;
  let nextPlayAt = 0;
  let activeSources = new Set<AudioBufferSourceNode>();
  let stopped = false;
  let terminal = false;
  let runtimeDone = false;
  let muted = false;

  const clearPlayback = () => {
    for (const source of activeSources) { try { source.stop(); } catch { /* already ended */ } }
    activeSources = new Set();
    nextPlayAt = 0;
    runtimeDone = false;
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    recorder?.stop();
    recorder = null;
    clearPlayback();
    if (context) { void context.close(); context = null; }
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "end" }));
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(1000, "owner_end");
  };
  const maybePlaybackDone = () => {
    if (runtimeDone && !activeSources.size && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "playback.complete" }));
      runtimeDone = false;
    }
  };
  const playPcm = async (data: ArrayBuffer) => {
    if (stopped || terminal || data.byteLength < 2 || data.byteLength % 2) return;
    context ??= new AudioContext();
    if (context.state === "suspended") await context.resume();
    const values = new Int16Array(data);
    const buffer = context.createBuffer(1, values.length, 16_000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < values.length; i++) channel[i] = values[i] / 0x8000;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    activeSources.add(source);
    source.onended = () => { activeSources.delete(source); maybePlaybackDone(); };
    nextPlayAt = Math.max(context.currentTime, nextPlayAt);
    source.start(nextPlayAt);
    nextPlayAt += buffer.duration;
  };

  socket.onmessage = (event) => {
    if (stopped || terminal) return;
    if (event.data instanceof ArrayBuffer) { void playPcm(event.data); return; }
    if (typeof event.data !== "string") return;
    let frame: Record<string, unknown>;
    try { frame = JSON.parse(event.data) as Record<string, unknown>; } catch { return; }
    if (frame.type === "unavailable" || frame.type === "error") {
      terminal = true;
      recorder?.stop();
      recorder = null;
      clearPlayback();
      input.onState({ kind: "unavailable", message: "Live audio is not connected yet. You can keep working with Paige in chat." });
    } else if (frame.type === "ready") {
      recorder = new AudioRecorder((samples) => {
        if (socket.readyState === WebSocket.OPEN && !stopped && !terminal && !muted) socket.send(pcm16(samples));
      }, 16_000);
      void recorder.start().then(() => {
        if (stopped || terminal) { recorder?.stop(); return; }
        socket.send(JSON.stringify({ type: "start", sampleRate: 16_000 }));
        input.onState({ kind: "ready" });
      }).catch(() => {
        terminal = true;
        input.onState({ kind: "permission-denied" });
        stop();
      });
    } else if (frame.type === "transcript" && typeof frame.text === "string") {
      input.onTranscript?.(frame.text, frame.is_final === true);
    } else if (frame.type === "runtime.done") {
      runtimeDone = true;
      maybePlaybackDone();
    } else if (frame.type === "clear_playback") {
      clearPlayback();
    }
  };
  socket.onerror = () => { /* onclose emits one truthful state */ };
  socket.onclose = () => {
    recorder?.stop();
    recorder = null;
    clearPlayback();
    if (context) { void context.close(); context = null; }
    if (!stopped && !terminal) input.onState({ kind: "disconnected" });
  };
  return {
    setMuted(value) { muted = value; },
    interrupt() {
      clearPlayback();
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "interrupt" }));
    },
    stop,
  };
}
