import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DictationMicButton } from "./DictationMicButton";
import { useDictation, type UseDictationApi } from "@/lib/voice/useDictation";

const voiceHarness = vi.hoisted(() => ({
  recorderStarts: 0,
  recorderStops: 0,
  getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } } })),
  recorderStart: vi.fn(async () => undefined),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: voiceHarness.getSession } },
}));

vi.mock("@/utils/VoiceAudio", () => ({
  AudioRecorder: class {
    constructor(_onFrame: (frame: Float32Array) => void, _sampleRate: number) {}
    async start() {
      voiceHarness.recorderStarts += 1;
      await voiceHarness.recorderStart();
    }
    stop() { voiceHarness.recorderStops += 1; }
  },
}));

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  binaryType = "";
  readyState = FakeWebSocket.CONNECTING;
  sent: unknown[] = [];
  closeCalls = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public readonly url: string) { sockets.push(this); }
  send(value: unknown) { this.sent.push(value); }
  close() { this.closeCalls += 1; this.readyState = FakeWebSocket.CLOSED; }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(new Event("open")); }
  message(value: Record<string, unknown>) { this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(value) })); }
  error() { this.onerror?.(new Event("error")); }
  closed(wasClean = true) { this.readyState = FakeWebSocket.CLOSED; this.onclose?.({ wasClean } as CloseEvent); }
}

let sockets: FakeWebSocket[] = [];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe("Solo dictation control", () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalMediaDevices: MediaDevices | undefined;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    sockets = [];
    voiceHarness.recorderStarts = 0;
    voiceHarness.recorderStops = 0;
    voiceHarness.getSession.mockClear();
    voiceHarness.recorderStart.mockReset();
    voiceHarness.recorderStart.mockResolvedValue(undefined);
    originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: FakeWebSocket });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
  });

  const renderControl = async (scopeEpoch = "account-a", onText = vi.fn()) => {
    await act(async () => {
      root.render(<DictationMicButton onText={onText} showStatus scopeEpoch={scopeEpoch} />);
      await Promise.resolve();
    });
  };

  it("shows requesting, listening, release-to-transcribing, then idle after a clean final", async () => {
    const onText = vi.fn();
    await renderControl("account-a", onText);
    const button = host.querySelector("button")!;

    await act(async () => button.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    expect(host.textContent).toContain("Requesting mic");

    await act(async () => sockets[0].open());
    expect(host.textContent).toContain("Listening");
    await act(async () => sockets[0].message({ type: "transcript", text: "Testing", is_final: false }));
    expect(host.textContent).toContain("Listening");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.disabled).toBe(false);

    await act(async () => button.dispatchEvent(new Event("pointerup", { bubbles: true })));
    expect(host.textContent).toContain("Transcribing");
    expect(button.disabled).toBe(false);

    await act(async () => sockets[0].message({ type: "transcript", text: "Testing PAIGE", is_final: true }));
    expect(onText).toHaveBeenCalledWith("Testing PAIGE");
    expect(host.textContent).toContain("Transcribing");

    await act(async () => sockets[0].closed(true));
    expect(host.textContent).toContain("Hold to talk");
  });

  it("stops a quick pointer or keyboard release before permission work resolves", async () => {
    await renderControl();
    const button = host.querySelector("button")!;
    await act(async () => {
      button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      button.dispatchEvent(new Event("pointerup", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sockets).toHaveLength(0);
    expect(host.textContent).toContain("Hold to talk");

    await act(async () => {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      button.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sockets).toHaveLength(0);
  });

  it("stops a recorder whose startup fails after microphone acquisition begins", async () => {
    voiceHarness.recorderStart.mockRejectedValueOnce(new Error("audio setup failed"));
    await renderControl();
    await act(async () => host.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    expect(voiceHarness.recorderStops).toBe(1);
    expect(sockets).toHaveLength(0);
    expect(host.textContent).toContain("Voice typing unavailable");
  });

  it("cleans a pending recorder exactly once when the user releases", async () => {
    let resolveStart!: () => void;
    voiceHarness.recorderStart.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveStart = resolve; }));
    await renderControl();
    const button = host.querySelector("button")!;
    await act(async () => button.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    await act(async () => button.dispatchEvent(new Event("pointerup", { bubbles: true })));
    expect(voiceHarness.recorderStops).toBe(1);
    await act(async () => { resolveStart(); await Promise.resolve(); });
    expect(voiceHarness.recorderStops).toBe(1);
    expect(sockets).toHaveLength(0);
    expect(host.textContent).toContain("Hold to talk");
  });

  it("cleans a pending recorder and opens no socket after an account epoch change", async () => {
    let resolveStart!: () => void;
    voiceHarness.recorderStart.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveStart = resolve; }));
    const onText = vi.fn();
    await renderControl("account-a", onText);
    await act(async () => host.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    await renderControl("account-b", onText);
    expect(voiceHarness.recorderStops).toBe(1);
    await act(async () => { resolveStart(); await Promise.resolve(); });
    expect(voiceHarness.recorderStops).toBe(1);
    expect(sockets).toHaveLength(0);
    expect(onText).not.toHaveBeenCalled();
  });

  it("surfaces permission, unsupported, provider-failure, and unavailable states", async () => {
    const denied = new Error("denied"); denied.name = "NotAllowedError";
    voiceHarness.recorderStart.mockRejectedValueOnce(denied);
    await renderControl();
    await act(async () => host.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    expect(host.textContent).toContain("Mic permission off");

    await renderControl();
    await act(async () => host.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    await act(async () => sockets.at(-1)!.open());
    await act(async () => host.querySelector("button")!.dispatchEvent(new Event("pointerup", { bubbles: true })));
    await act(async () => sockets.at(-1)!.error());
    expect(host.textContent).toContain("Voice typing failed");

    await renderControl();
    await act(async () => host.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    await act(async () => sockets.at(-1)!.open());
    await act(async () => sockets.at(-1)!.message({ type: "error", code: "not_configured", message: "unavailable" }));
    expect(host.textContent).toContain("Voice typing unavailable");

    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    await renderControl();
    expect(host.textContent).toContain("Mic unsupported");
  });

  it("treats a clean provider close before release as a surfaced failure", async () => {
    await renderControl();
    await act(async () => host.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    await act(async () => sockets[0].open());
    await act(async () => sockets[0].closed(true));
    expect(host.textContent).toContain("Voice typing failed");
  });

  it("stops capture if the parent disables the control mid-hold", async () => {
    const onText = vi.fn();
    await renderControl("account-a", onText);
    await act(async () => host.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    await act(async () => sockets[0].open());
    await act(async () => root.render(<DictationMicButton onText={onText} showStatus scopeEpoch="account-a" disabled />));
    expect(voiceHarness.recorderStops).toBeGreaterThan(0);
    expect(host.textContent).toContain("Transcribing");
  });

  it.each(["pointercancel", "lostpointercapture"])("stops capture on %s", async (eventName) => {
    await renderControl();
    const button = host.querySelector("button")!;
    await act(async () => button.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    await act(async () => sockets[0].open());
    await act(async () => button.dispatchEvent(new Event(eventName, { bubbles: true })));
    expect(host.textContent).toContain("Transcribing");
    expect(voiceHarness.recorderStops).toBeGreaterThan(0);
  });

  it("supports Enter hold/release without dropping keyboard focus", async () => {
    await renderControl();
    const button = host.querySelector("button")!;
    button.focus();
    await act(async () => button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await flush();
    await act(async () => sockets[0].open());
    await act(async () => button.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true })));
    expect(host.textContent).toContain("Transcribing");
    expect(document.activeElement).toBe(button);
    await act(async () => sockets[0].closed(true));
    expect(document.activeElement).toBe(button);
  });

  it("fences old recording callbacks and closes only their own socket after an epoch change", async () => {
    const onText = vi.fn();
    await renderControl("account-a", onText);
    const button = host.querySelector("button")!;
    await act(async () => button.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    const socketA = sockets[0];
    await act(async () => socketA.open());
    await act(async () => button.dispatchEvent(new Event("pointerup", { bubbles: true })));

    await renderControl("account-b", onText);
    await act(async () => host.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await flush();
    const socketB = sockets[1];
    expect(socketB).toBeDefined();

    await act(async () => socketA.message({ type: "transcript", text: "stale account A", is_final: true }));
    await act(async () => socketA.closed(true));
    expect(onText).not.toHaveBeenCalled();
    expect(socketB.closeCalls).toBe(0);

    await act(async () => socketB.open());
    await act(async () => socketB.message({ type: "transcript", text: "account B", is_final: true }));
    expect(onText).toHaveBeenCalledWith("account B");
  });

  it("does not let a released run be replaced before its provider stream settles", async () => {
    let latest!: UseDictationApi;
    const Probe = () => {
      latest = useDictation({ onText: vi.fn(), scopeEpoch: "account-a" });
      return null;
    };
    await act(async () => root.render(<Probe />));
    await act(async () => { void latest.start(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => sockets[0].open());
    await act(async () => latest.stop());
    await act(async () => { await latest.start(); });
    expect(sockets).toHaveLength(1);
    expect(latest.status).toBe("transcribing");
    await act(async () => sockets[0].closed(true));
    expect(latest.status).toBe("idle");
  });

  it("surfaces a provider failure when a released stream never settles", async () => {
    vi.useFakeTimers();
    try {
      await renderControl();
      const button = host.querySelector("button")!;
      await act(async () => button.dispatchEvent(new Event("pointerdown", { bubbles: true })));
      await flush();
      await act(async () => sockets[0].open());
      await act(async () => button.dispatchEvent(new Event("pointerup", { bubbles: true })));
      expect(host.textContent).toContain("Transcribing");
      await act(async () => { vi.advanceTimersByTime(15_000); });
      expect(host.textContent).toContain("Voice typing failed");
    } finally {
      vi.useRealTimers();
    }
  });
});
