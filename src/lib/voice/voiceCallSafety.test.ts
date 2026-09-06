import { describe, expect, it } from "vitest";
import {
  acquireCallStart,
  isDialableNumber,
  normalizeDialNumber,
  providerCallErrorMessage,
  voiceHistoryStatus,
} from "./voiceCallSafety";

describe("voice call safety", () => {
  it("normalizes US local numbers to E.164 without exposing a client number", () => {
    expect(normalizeDialNumber("(555) 010-0123")).toBe("+15550100123");
    expect(normalizeDialNumber("1 555 010 0123")).toBe("+15550100123");
  });

  it("preserves valid international E.164 numbers and rejects ambiguous input", () => {
    expect(normalizeDialNumber("+44 20 7946 0958")).toBe("+442079460958");
    expect(isDialableNumber("+442079460958")).toBe(true);
    expect(isDialableNumber(normalizeDialNumber("12345"))).toBe(false);
  });

  it("maps provider failures to actionable categories without leaking raw messages", () => {
    const raw = "private provider payload";
    expect(providerCallErrorMessage({ code: 21211, message: raw })).toContain("valid phone number");
    expect(providerCallErrorMessage({ code: 31005, message: raw })).toContain("Retry");
    expect(providerCallErrorMessage({ code: 99999, message: raw })).toBe(
      "The provider rejected this call. Check the number and retry.",
    );
    expect(providerCallErrorMessage({ code: 99999, message: raw })).not.toContain(raw);
  });

  it("allows only one outbound start before the provider returns a Call object", () => {
    const lock = { current: false };
    expect(acquireCallStart(lock, false)).toBe(true);
    expect(acquireCallStart(lock, false)).toBe(false);
    lock.current = false;
    expect(acquireCallStart(lock, true)).toBe(false);
  });

  it("uses provider-evidence language for call history", () => {
    expect(voiceHistoryStatus("queued")).toEqual({ label: "Initiated", state: "pending" });
    expect(voiceHistoryStatus("delivered")).toEqual({ label: "Completed", state: "success" });
    expect(voiceHistoryStatus("failed")).toEqual({ label: "Failed", state: "error" });
  });
});
