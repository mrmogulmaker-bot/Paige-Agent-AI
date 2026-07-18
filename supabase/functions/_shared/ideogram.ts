// _shared/ideogram.ts — Ideogram provider client for the Vibe Studio model router.
//
// Ideogram is the image-with-text lane: it renders legible typography INSIDE images (ad
// creatives, posters, thumbnails with words) — the one thing general image models still botch.
// The router routes modality "image-with-text" here regardless of tier.
//
// FAIL-CLOSED (doctrine §13): IDEOGRAM_API_KEY is read at CALL time; if absent we throw
// NeedsConfigError("ideogram"). Key sent as the `Api-Key` header only — never logged/echoed/
// placed in a result. Returns a vendor-hosted URL (artifact_url) which the router downloads
// and re-hosts in studio-deliverables (Ideogram's URLs expire).

import { NeedsConfigError, type ProviderCallResult } from "./provider-types.ts";

const IDEOGRAM_URL = Deno.env.get("IDEOGRAM_BASE_URL") ?? "https://api.ideogram.ai/generate";
const DEFAULT_MODEL = "V_2";

function ideogramKey(): string {
  const k = Deno.env.get("IDEOGRAM_API_KEY");
  if (!k) throw new NeedsConfigError("ideogram");
  return k;
}

export interface IdeogramImageInput {
  prompt: string;
  aspect?: string; // "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "16:10" | "10:16" ...
  model?: string;
}

// Ideogram takes an ASPECT_<W>_<H> enum, not a "16:9" string. Map the common ratios; default
// to square when unrecognized (a bad ratio must never fail the whole generation).
function aspectRatioEnum(aspect?: string): string {
  const map: Record<string, string> = {
    "1:1": "ASPECT_1_1",
    "16:9": "ASPECT_16_9",
    "9:16": "ASPECT_9_16",
    "4:3": "ASPECT_4_3",
    "3:4": "ASPECT_3_4",
    "16:10": "ASPECT_16_10",
    "10:16": "ASPECT_10_16",
    "3:2": "ASPECT_3_2",
    "2:3": "ASPECT_2_3",
  };
  return map[(aspect ?? "").trim()] ?? "ASPECT_1_1";
}

/**
 * Generate a typography-capable image. Returns ProviderCallResult with artifact_url set (the
 * router re-hosts it). Ideogram's response is { data: [{ url }] }.
 */
export async function ideogramImage(input: IdeogramImageInput): Promise<ProviderCallResult> {
  const key = ideogramKey();
  const model = input.model || DEFAULT_MODEL;
  const started = Date.now();

  const resp = await fetch(IDEOGRAM_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "Api-Key": key },
    body: JSON.stringify({
      image_request: {
        prompt: input.prompt,
        model,
        aspect_ratio: aspectRatioEnum(input.aspect),
        magic_prompt_option: "AUTO",
      },
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Ideogram ${resp.status}: ${detail.slice(0, 500)}`);
  }
  const data = await resp.json();
  const url: string | undefined = data?.data?.[0]?.url;
  if (!url) throw new Error("Ideogram: no image url returned");
  return {
    artifact_url: url,
    artifact_mime: "image/png",
    provider: "ideogram",
    model,
    latency_ms: Date.now() - started,
  };
}
