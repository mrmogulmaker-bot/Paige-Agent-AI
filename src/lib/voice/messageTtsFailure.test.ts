import { describe, expect, it } from "vitest";
import { classifyTtsFailure } from "./messageTtsFailure";

describe("message TTS failure copy", () => {
  it("keeps the required failure states distinct without naming a provider", () => {
    const cases = [
      ["tts_tenant_allowance_reached", 429, "allowance", "monthly allowance"],
      ["tts_global_cap_reached", 429, "platform_paused", "temporarily paused"],
      ["tts_emergency_disabled", 503, "platform_paused", "temporarily paused"],
      ["tts_request_already_reserved", 409, "pending", "still be processing"],
      ["tts_request_ambiguous", 409, "pending", "still be processing"],
      ["tts_synth_failed", 502, "retryable", "didn’t start"],
      ["tts_not_configured", 503, "not_configured", "isn’t available"],
    ] as const;

    for (const [code, status, kind, copy] of cases) {
      const result = classifyTtsFailure(code, status);
      expect(result.kind).toBe(kind);
      expect(result.message).toContain(copy);
      expect(result.message).not.toMatch(/openai|elevenlabs|provider/i);
    }
  });

  it("shows reset timing only when the server supplies a valid value", () => {
    const withoutReset = classifyTtsFailure("tts_tenant_allowance_reached", 429);
    const withReset = classifyTtsFailure("tts_tenant_allowance_reached", 429, "2026-10-01T00:00:00Z");
    const invalidReset = classifyTtsFailure("tts_tenant_allowance_reached", 429, "not-a-date");

    expect(withoutReset.message).toContain("monthly reset");
    expect(withReset.message).toMatch(/Oct 1/);
    expect(withReset.message).not.toContain("monthly reset");
    expect(invalidReset.message).toBe(withoutReset.message);
  });

  it("uses status only as a conservative fallback when no known code is present", () => {
    expect(classifyTtsFailure(null, 409).kind).toBe("pending");
    expect(classifyTtsFailure(null, 502).kind).toBe("retryable");
    expect(classifyTtsFailure(null, 503).kind).toBe("platform_paused");
    expect(classifyTtsFailure("unknown_future_code", 418).kind).toBe("retryable");
  });
});
