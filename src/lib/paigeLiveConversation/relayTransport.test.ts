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
});
