// @vitest-environment node
// fal adapter contract tests — the pure, provider-callable-without-network
// surface: output normalization across fal's model-family shapes, the curated
// estimate catalog (estimates, unit math, unknown models), and the fail-closed
// secret posture (absent key → NeedsConfigError, never a network call).
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeFalOutput, falAdapter } from "../../supabase/functions/_shared/media-provider/fal.ts";
import { NeedsConfigError } from "../../supabase/functions/_shared/provider-types.ts";
import { estimateFromCatalog } from "../../supabase/functions/_shared/media-provider/mod.ts";

// vitest has no Deno global: stub env absent by default (secret-missing posture).
const stubEnv = (env: Record<string, string> = {}) => {
  vi.stubGlobal("Deno", {
    env: {
      get: (n: string) => env[n],
      toObject: () => env,
    },
  });
};
afterEach(() => vi.unstubAllGlobals());

describe("normalizeFalOutput — every fal output family", () => {
  it("images family: {images:[{url},…]}", () => {
    expect(normalizeFalOutput({ images: [{ url: "https://v3.fal.media/a.png" }, { url: "https://v3.fal.media/b.png" }] }))
      .toEqual(["https://v3.fal.media/a.png", "https://v3.fal.media/b.png"]);
  });
  it("video family: {video:{url}}", () => {
    expect(normalizeFalOutput({ video: { url: "https://v3.fal.media/v.mp4" } }))
      .toEqual(["https://v3.fal.media/v.mp4"]);
  });
  it("bare string and array shapes", () => {
    expect(normalizeFalOutput("https://x/1.png")).toEqual(["https://x/1.png"]);
    expect(normalizeFalOutput(["https://x/1.png", "https://x/2.png"])).toEqual(["https://x/1.png", "https://x/2.png"]);
  });
  it("non-http strings are dropped; nothing fabricates an artifact", () => {
    expect(normalizeFalOutput({ images: [{ url: "not-a-url" }] })).toEqual([]);
    expect(normalizeFalOutput(null)).toEqual([]);
    expect(normalizeFalOutput({})).toEqual([]);
  });
});

describe("estimate catalog", () => {
  // getCapabilities() probes secret visibility (envKey) — stub env first.
  stubEnv({});
  const catalog = falAdapter.getCapabilities().models;

  it("curated defaults carry the documented fal model ids", () => {
    const ids = catalog.map((m) => m.id);
    expect(ids).toContain("fal-ai/nano-banana");
    expect(ids).toContain("fal-ai/flux-pro/v1.1");
    expect(ids).toContain("fal-ai/nano-banana/edit");
    expect(ids).toContain("fal-ai/veo3/fast");
    expect(ids).toContain("fal-ai/veo3");
  });

  it("video estimates are per-second with bounded duration math", () => {
    const e = estimateFromCatalog(catalog, { mode: "video", model: "fal-ai/veo3/fast", videoSeconds: 8 });
    expect(e?.unit).toBe("second");
    // 8s at the curated $0.15/s within rounding at 4dp.
    expect(e?.estimatedCostUsd).toBeCloseTo(1.2, 3);
    expect(e?.basis).toMatch(/estimate/);
  });

  it("image estimates are per-image", () => {
    const e = estimateFromCatalog(catalog, { mode: "image", model: "fal-ai/nano-banana" });
    expect(e?.estimatedCostUsd).toBeCloseTo(0.039, 4);
  });

  it("unknown models return null — no guessed price", () => {
    expect(estimateFromCatalog(catalog, { mode: "image", model: "not/a-model" })).toBeNull();
  });
});

describe("fail-closed secret posture", () => {
  it("reports unconfigured when FAL_KEY is absent (boolean only — never the value)", () => {
    stubEnv({});
    expect(falAdapter.isConfigured()).toBe(false);
  });

  it("reports configured when the key is present (either canonical name)", () => {
    stubEnv({ FAL_KEY: "test-key-presence-only" });
    expect(falAdapter.isConfigured()).toBe(true);
  });

  it("submit throws NeedsConfigError BEFORE any network when the key is absent", async () => {
    stubEnv({});
    await expect(
      falAdapter.submit({ model: "fal-ai/nano-banana", mode: "image", prompt: "x" }),
    ).rejects.toBeInstanceOf(NeedsConfigError);
  });
});

describe("license + retention disclosures", () => {
  stubEnv({});
  it("carries the owner's exact commercial-use language — no ownership promise", () => {
    const license = falAdapter.getLicenseClass();
    expect(license.commercialUse).toBe("conditional");
    expect(license.disclosure).toMatch(/Commercial-use status depends on the applicable provider and model terms/);
  });
  it("states the copy-before-expiry retention posture", () => {
    const r = falAdapter.getRetentionPolicy();
    expect(r.copyDeadline).toMatch(/Paige copies the asset into its own Storage/);
  });
});
