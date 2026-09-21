import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageAudioButton } from "./MessageAudioButton";

const harness = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } } })),
  snapshot: { activeId: null as string | null, status: "idle" as const, needsConfig: false },
  toggle: vi.fn(),
  toastError: vi.fn(),
  toastMessage: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: harness.getSession } },
}));

vi.mock("@/lib/voice/messageTts", () => ({
  messageTts: {
    subscribe: () => () => undefined,
    getSnapshot: () => harness.snapshot,
    toggle: harness.toggle,
  },
}));

vi.mock("sonner", () => ({
  toast: { error: harness.toastError, message: harness.toastMessage },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("MessageAudioButton request identity and failure delivery", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    harness.getSession.mockClear();
    harness.toggle.mockReset();
    harness.toastError.mockClear();
    harness.toastMessage.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["audio"]), { status: 200 })));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const renderButton = async () => {
    await act(async () => root.render(<MessageAudioButton messageId="message-1" content="Hello owner" />));
    return host.querySelector("button")!;
  };

  it("mints one UUID per play tap and reuses it for transport attempts inside that tap", async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    vi.stubGlobal("crypto", { randomUUID });
    harness.toggle.mockImplementation(async (_id, fetchAudio) => {
      await fetchAudio();
      await fetchAudio();
    });
    const button = await renderButton();

    await act(async () => { button.click(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { button.click(); await Promise.resolve(); await Promise.resolve(); });

    expect(randomUUID).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(4);
    expect(new Headers(calls[0][1]?.headers).get("Idempotency-Key")).toBe("11111111-1111-4111-8111-111111111111");
    expect(new Headers(calls[1][1]?.headers).get("Idempotency-Key")).toBe("11111111-1111-4111-8111-111111111111");
    expect(new Headers(calls[2][1]?.headers).get("Idempotency-Key")).toBe("22222222-2222-4222-8222-222222222222");
    expect(new Headers(calls[3][1]?.headers).get("Idempotency-Key")).toBe("22222222-2222-4222-8222-222222222222");
  });

  it.each([
    ["tts_tenant_allowance_reached", 429, "message", /monthly allowance/i],
    ["tts_global_cap_reached", 429, "error", /temporarily paused/i],
    ["tts_request_already_reserved", 409, "message", /still be processing/i],
    ["tts_synth_failed", 502, "error", /didn’t start/i],
  ] as const)("delivers the %s response as its honest state", async (code, status, channel, copy) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: code }), {
      status,
      headers: { "Content-Type": "application/json" },
    }));
    harness.toggle.mockImplementation(async (_id, fetchAudio, onError) => {
      try { await fetchAudio(); } catch (error) { onError?.(error); }
    });
    const button = await renderButton();

    await act(async () => { button.click(); await Promise.resolve(); await Promise.resolve(); });

    const sink = channel === "message" ? harness.toastMessage : harness.toastError;
    expect(sink).toHaveBeenCalledWith(expect.stringMatching(copy));
  });
});
