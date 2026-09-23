import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const recorder = vi.hoisted(() => ({ start: vi.fn(async () => undefined), stop: vi.fn() }));
vi.mock("@/utils/VoiceAudio", () => ({
  AudioRecorder: class {
    start = recorder.start;
    stop = recorder.stop;
  },
}));
import { connectPaigeLiveRelay } from "./relayTransport";

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  readonly url: string;
  readyState = 1;
  binaryType = "";
  sent: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) { this.url = url; FakeSocket.instances.push(this); }
  send(data: unknown) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  receive(data: unknown) { this.onmessage?.({ data }); }
}

describe("first-party Live relay transport", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
    vi.stubGlobal("WebSocket", FakeSocket);
    FakeSocket.instances = [];
    recorder.start.mockClear();
    recorder.stop.mockClear();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("uses only the first-party WSS URL and never captures on provider-free unavailable", () => {
    const states: unknown[] = [];
    const transport = connectPaigeLiveRelay({ sessionId: "session-1", ticket: "opaque", onState: (state) => states.push(state) });
    const socket = FakeSocket.instances[0];
    expect(socket.url).toContain("wss://test.supabase.co/functions/v1/paige-live-relay?");
    expect(socket.url).toContain("ticket=opaque");
    expect(socket.url).toContain("apikey=public-test-key");
    expect(socket.url).not.toContain("tenantId");
    socket.receive(JSON.stringify({ type: "unavailable", code: "adapters_not_connected" }));
    expect(states).toEqual([{ kind: "unavailable", message: "Live audio is not connected yet. You can keep working with Paige in chat." }]);
    expect(recorder.start).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([]);
    transport.stop();
  });

  it("clears playback and emits interrupt without a provider SDK", () => {
    const transport = connectPaigeLiveRelay({ sessionId: "session-2", ticket: "opaque-2", onState: () => undefined });
    const socket = FakeSocket.instances[0];
    transport.interrupt();
    expect(socket.sent).toContain(JSON.stringify({ type: "interrupt" }));
    transport.stop();
    expect(socket.readyState).toBe(3);
  });

  it("routes a finalized voice turn through the existing runtime and fences it on interruption", () => {
    const turns: Array<{ text: string; turnId: string }> = [];
    const cancelled: string[] = [];
    const transport = connectPaigeLiveRelay({
      sessionId: "session-runtime", ticket: "opaque-runtime", onState: () => undefined,
      onVoiceTurn: (text, turnId) => turns.push({ text, turnId }),
      onRuntimeCancel: (turnId) => cancelled.push(turnId),
    });
    const socket = FakeSocket.instances[0];
    socket.receive(JSON.stringify({ type: "runtime.dispatch", text: "What next?", turn_id: "turn-1" }));
    expect(turns).toEqual([{ text: "What next?", turnId: "turn-1" }]);
    transport.runtimeDispatched("turn-1");
    transport.runtimeChunk("turn-1", "One sentence.");
    expect(socket.sent).toContain(JSON.stringify({ type: "runtime.dispatched", turn_id: "turn-1" }));
    expect(socket.sent).toContain(JSON.stringify({ type: "runtime.chunk", turn_id: "turn-1", text: "One sentence." }));
    socket.receive(JSON.stringify({ type: "runtime.cancel", turn_id: "turn-1" }));
    expect(cancelled).toEqual(["turn-1"]);
    transport.interrupt();
    expect(socket.sent).toContain(JSON.stringify({ type: "interrupt" }));
    transport.stop();
  });

  it("does not complete playback while audio waits for the output context to resume", async () => {
    let finishResume!: () => void;
    const resume = new Promise<void>((resolve) => { finishResume = resolve; });
    const sources: Array<{ onended: (() => void) | null }> = [];
    vi.stubGlobal("AudioContext", class {
      state = "suspended";
      currentTime = 0;
      destination = {};
      resume = vi.fn(() => resume);
      close = vi.fn(async () => undefined);
      createBuffer(_channels: number, length: number) {
        return { duration: length / 16_000, getChannelData: () => new Float32Array(length) };
      }
      createBufferSource() {
        const source = { buffer: null, onended: null as (() => void) | null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        sources.push(source);
        return source;
      }
    });
    const transport = connectPaigeLiveRelay({ sessionId: "session-3", ticket: "opaque-3", onState: () => undefined });
    const socket = FakeSocket.instances[0];
    socket.receive(new Int16Array([100, 200]).buffer);
    socket.receive(JSON.stringify({ type: "runtime.done" }));
    expect(socket.sent).not.toContain(JSON.stringify({ type: "playback.complete" }));
    finishResume();
    await Promise.resolve();
    await Promise.resolve();
    expect(sources).toHaveLength(1);
    expect(socket.sent).not.toContain(JSON.stringify({ type: "playback.complete" }));
    sources[0].onended?.();
    expect(socket.sent).toContain(JSON.stringify({ type: "playback.complete" }));
    transport.stop();
  });

  it("never reports ready when the socket closes during microphone startup", async () => {
    let finishStart!: () => void;
    recorder.start.mockImplementationOnce(() => new Promise<void>((resolve) => { finishStart = resolve; }));
    const states: unknown[] = [];
    connectPaigeLiveRelay({ sessionId: "session-4", ticket: "opaque-4", onState: (state) => states.push(state) });
    const socket = FakeSocket.instances[0];
    socket.receive(JSON.stringify({ type: "ready" }));
    socket.close();
    finishStart();
    await Promise.resolve();
    await Promise.resolve();
    expect(states).toEqual([{ kind: "disconnected" }]);
    expect(socket.sent).not.toContain(JSON.stringify({ type: "start", sampleRate: 16_000 }));
    expect(recorder.stop).toHaveBeenCalled();
  });
});
