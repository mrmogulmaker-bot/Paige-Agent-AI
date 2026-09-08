import { describe, expect, it } from "vitest";
import { resolvePaigeVoiceProfile, type PaigeVoiceProfile } from "./voiceProfile";

const profile: PaigeVoiceProfile = {
  id: "profile-1",
  paigeFacingName: "paige_default_voice",
  revision: "rev-7",
  provider: "elevenlabs",
  providerVoiceRef: "provider-ref-primary",
  approved: true,
  active: true,
  effectiveAt: "2026-09-01T00:00:00.000Z",
  speechPolicy: { source: "paige-profile", speed: 1 },
  audit: {
    approvedByActorId: "operator-1",
    approvedAt: "2026-08-31T00:00:00.000Z",
    changeReceiptRef: "receipt-7",
  },
};

describe("config-driven Paige voice profile", () => {
  it("binds the approved provider reference and exposes only Paige-facing identity publicly", () => {
    const result = resolvePaigeVoiceProfile({
      primary: profile,
      availability: [{
        provider: "elevenlabs",
        providerVoiceRef: "provider-ref-primary",
        available: true,
        authorized: true,
      }],
      sessionStartedAt: "2026-09-06T12:00:00.000Z",
    });
    expect(result).toMatchObject({
      ok: true,
      binding: { publicProfile: { name: "paige_default_voice", revision: "rev-7" } },
      usedFallback: false,
    });
    if (result.ok) {
      expect(result.binding.publicProfile).not.toHaveProperty("provider");
      expect(result.binding.publicProfile).not.toHaveProperty("providerVoiceRef");
      expect(Object.isFrozen(result.binding)).toBe(true);
    }
  });

  it("does not trust a display name and fails closed when the provider reference is unavailable", () => {
    expect(resolvePaigeVoiceProfile({
      primary: profile,
      availability: [{
        provider: "elevenlabs",
        providerVoiceRef: "different-ref-same-display-name",
        available: true,
        authorized: true,
      }],
      sessionStartedAt: "2026-09-06T12:00:00.000Z",
    })).toEqual({ ok: false, code: "provider_voice_unavailable" });
  });

  it("uses only a separately approved fallback and keeps a bound session revision immutable", () => {
    const fallback = {
      ...profile,
      id: "profile-fallback",
      revision: "rev-fallback-2",
      providerVoiceRef: "provider-ref-fallback",
      audit: { ...profile.audit, changeReceiptRef: "receipt-fallback-2" },
    };
    const result = resolvePaigeVoiceProfile({
      primary: profile,
      approvedFallback: fallback,
      availability: [{
        provider: "elevenlabs",
        providerVoiceRef: "provider-ref-fallback",
        available: true,
        authorized: true,
      }],
      sessionStartedAt: "2026-09-06T12:00:00.000Z",
    });
    expect(result).toMatchObject({ ok: true, usedFallback: true });
    if (!result.ok) throw new Error("expected fallback binding");
    expect(result.binding.internal.providerVoiceRef).toBe("provider-ref-fallback");
    expect(() => {
      (result.binding.internal as { providerVoiceRef: string }).providerVoiceRef = "changed";
    }).toThrow();
  });

  it("makes request-level tuning ownership explicit", () => {
    const result = resolvePaigeVoiceProfile({
      primary: profile,
      availability: [{
        provider: "elevenlabs",
        providerVoiceRef: profile.providerVoiceRef,
        available: true,
        authorized: true,
      }],
      sessionStartedAt: "2026-09-06T12:00:00.000Z",
    });
    expect(result).toMatchObject({
      ok: true,
      binding: { internal: { speechPolicy: { source: "paige-profile", speed: 1 } } },
    });
  });
});
