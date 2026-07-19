// Import-smoke test for the §29 premium-motion toolkit.
//
// Proves every primitive compiles + imports from the barrel. It deliberately
// does NOT render — rendering would require a full RTL/browser harness this repo
// doesn't carry, and would boot framer-motion's matchMedia path. Import + shape
// assertion is the honest bar for "compiles + imports" (task §3). The heavy
// 3D/Rive/Spline runtimes stay code-split behind React.lazy and are never booted
// by importing the barrel.
import { describe, it, expect } from "vitest";
import * as PM from "./index";

describe("premium-motion barrel", () => {
  it("exports every primitive as a component function", () => {
    const expected = [
      "FadeInSection",
      "AnimatedText",
      "MagneticCTA",
      "GradientMasked",
      "NoiseOverlay",
      "GlassCard",
      "Spotlight",
      "ScrollReveal",
      "SplineScene",
      "R3FScene",
      "RiveEmbed",
    ] as const;
    for (const name of expected) {
      expect(typeof (PM as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
