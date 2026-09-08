// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { inspectConfiguredVoiceProvider } from "../../supabase/functions/_shared/paige-voice-provider-inspection";

const voiceRef = "TestVoiceRef123456";
const inspect = (fetcher: typeof fetch, apiKey = "test-only-key", ref = voiceRef) => inspectConfiguredVoiceProvider({ apiKey, voiceRef: ref, fetcher });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("server-only voice provider metadata inspection", () => {
  it("never fetches without a key or with an invalid reference", async () => {
    const fetcher = vi.fn();
    expect((await inspect(fetcher, "")).code).toBe("not_configured");
    expect((await inspect(fetcher, "test-only-key", "../voice?x=1")).code).toBe("invalid_voice_reference");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("allowlists metadata and never upgrades capability proof", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ status: "active", tier: "creator", character_count: 12, character_limit: 100, max_credit_limit_extension: "unlimited", email: "PRIVATE", api_key: "PRIVATE" })).mockResolvedValueOnce(response({ voice_id: voiceRef, name: "PRIVATE", preview_url: "PRIVATE" }));
    const result = await inspect(fetcher);
    expect(result.subscription).toEqual({ transport: "ok", status: "active", tier: "creator", characterCount: 12, characterLimit: 100, creditLimitExtension: "unlimited" });
    expect(result.voice).toEqual({ transport: "ok", accessible: true, referenceMatches: true });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|test-only-key|TestVoiceRef|verified|approved/);
    expect(fetcher.mock.calls.map(c => c[0])).toEqual(["https://api.elevenlabs.io/v1/user/subscription", `https://api.elevenlabs.io/v1/voices/${voiceRef}`]);
    for (const [, options] of fetcher.mock.calls) expect(options).toMatchObject({ method: "GET", redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) });
  });
  it.each([[401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [429, "rate_limited"], [500, "provider_error"], [302, "redirect_refused"]])("sanitizes HTTP %s", async (status, transport) => {
    const result = await inspect(vi.fn().mockResolvedValue(response({ secret: "PRIVATE" }, status)));
    expect(result.subscription.transport).toBe(transport);
    expect(result.voice.accessible).toBe(false);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("sanitizes network failures and malformed JSON", async () => {
    const result = await inspect(vi.fn().mockRejectedValueOnce(new Error("PRIVATE")).mockResolvedValueOnce(new Response("PRIVATE")));
    expect(result.subscription.transport).toBe("network_error");
    expect(result.voice.transport).toBe("invalid_response");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("rejects oversized declared and streamed bodies", async () => {
    const huge = new Uint8Array(65537);
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("{}", { headers: { "content-length": "65537" } })).mockResolvedValueOnce(new Response(new ReadableStream({ start(c) { c.enqueue(huge); c.close(); } })));
    const result = await inspect(fetcher);
    expect(result.subscription.transport).toBe("response_too_large");
    expect(result.voice.transport).toBe("response_too_large");
  });
  it("rejects mismatched voice and untrusted scalar values", async () => {
    const result = await inspect(vi.fn().mockResolvedValueOnce(response({ status: "PRIVATE", tier: "PRIVATE", character_count: -1, character_limit: "999", max_credit_limit_extension: -1 })).mockResolvedValueOnce(response({ voice_id: "OtherReference" })));
    expect(result.subscription).toMatchObject({ status: "unknown", tier: "other", characterCount: null, characterLimit: null, creditLimitExtension: null });
    expect(result.voice).toMatchObject({ accessible: false, referenceMatches: false });
  });
  it("times out the fetch within eight seconds", async () => {
    vi.useFakeTimers();
    try {
      const pending = inspect(vi.fn().mockImplementation(() => new Promise(() => {})));
      await vi.advanceTimersByTimeAsync(8000);
      const result = await pending;
      expect(result.subscription.transport).toBe("timeout");
      expect(result.voice.transport).toBe("timeout");
    } finally { vi.useRealTimers(); }
  });
  it("also bounds a response whose body stalls after headers", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(new ReadableStream({ cancel }))));
      const pending = inspect(fetcher);
      await vi.advanceTimersByTimeAsync(8000);
      const result = await pending;
      expect(result.subscription.transport).toBe("timeout");
      expect(result.voice.transport).toBe("timeout");
      expect(cancel).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});
