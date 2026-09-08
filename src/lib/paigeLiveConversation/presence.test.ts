import { describe, expect, it } from "vitest";
import { presenceFrame, resolvePresenceState } from "./presence";

describe("truthful Paige Presence", () => {
  it("never derives speaking or listening from text or an unverified session", () => {
    expect(resolvePresenceState({ phase: "speaking", outputPlaying: false })).toBe("ready");
    expect(resolvePresenceState({ phase: "listening", microphoneActive: false })).toBe("ready");
    expect(resolvePresenceState({ phase: "unavailable", working: true })).toBe("working");
    expect(resolvePresenceState({ phase: "unavailable", working: false })).toBe("unavailable");
  });
  it("preserves honest terminal and damped states", () => {
    for (const phase of ["held", "interrupted", "unavailable", "disconnected"] as const) {
      expect(resolvePresenceState({ phase, outputPlaying: true, microphoneActive: true })).toBe(phase);
      expect(presenceFrame(phase, 2, { amplitude: 1, brightness: 1 }).energy).toBe(0);
    }
  });
  it("morphs an irregular idle silhouette, with no invented audio energy", () => {
    const a = presenceFrame("ready", 0);
    const b = presenceFrame("ready", 4);
    expect(a.path).not.toBe(b.path);
    expect(a.energy).toBe(0);
    expect(a.path).toContain("C");
    expect(a.path).not.toContain("NaN");
  });
  it("real normalized analyzer samples change speaking deformation and light", () => {
    const quiet = presenceFrame("speaking", 2, { amplitude: 0, brightness: 0 });
    const loud = presenceFrame("speaking", 2, { amplitude: .8, brightness: .5 });
    expect(loud.path).not.toBe(quiet.path);
    expect(loud.light).toBeGreaterThan(quiet.light);
    expect(loud.energy).toBe(.8);
    expect(presenceFrame("speaking", 2, { amplitude: NaN, brightness: Infinity }).energy).toBe(0);
  });
});
