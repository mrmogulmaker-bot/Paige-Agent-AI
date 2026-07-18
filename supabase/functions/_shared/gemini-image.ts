// _shared/gemini-image.ts — Gemini image client for the Vibe Studio model router.
//
// The image OPEN-FAST lane. Gemini's "nano-banana"-class model (gemini-2.5-flash-image) is the
// cheaper/stronger default for hero/marketing art (owner directive 2026-07-15). This is the
// minimal generateContent call already proven in supabase/functions/generate-image/index.ts,
// extracted here so the router uses ONE Gemini seam instead of duplicating the fetch (§12/§18).
//
// FAIL-CLOSED (doctrine §13): GEMINI_API_KEY is read at CALL time; if absent we throw
// NeedsConfigError("gemini") — never a generic crash, never a fake image. The key is never
// logged/echoed/placed in a result. Returns artifact_bytes (decoded from the inline base64) so
// the router hosts the PNG itself in studio-deliverables (Gemini returns no hosted URL).

import { NeedsConfigError, type ProviderCallResult } from "./provider-types.ts";
import { envKey } from "./env-key.ts";

const GEMINI_BASE = Deno.env.get("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-2.5-flash-image";

function geminiKey(): string {
  const k = envKey("GEMINI_API_KEY");
  if (!k) throw new NeedsConfigError("gemini");
  return k;
}

export interface GeminiImageInput {
  prompt: string;
  model?: string;
}

/**
 * Generate an image via Gemini generateContent with an IMAGE response modality. The image comes
 * back inline as base64 in the first candidate's parts (no hosted URL), so we decode to
 * artifact_bytes and let the router persist it. Throws a typed Error on an API failure and
 * NeedsConfigError when the key is unset.
 */
export async function geminiImage(input: GeminiImageInput): Promise<ProviderCallResult> {
  const key = geminiKey();
  const model = input.model || DEFAULT_MODEL;
  const started = Date.now();

  const resp = await fetch(
    `${GEMINI_BASE}/models/${model}:generateContent`,
    {
      method: "POST",
      // Key in a header, never the URL query string — a network-level fetch reject throws a
      // TypeError carrying the request URL, which would leak `?key=<secret>` into caller logs.
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: input.prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    },
  );
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Gemini image ${resp.status}: ${detail.slice(0, 500)}`);
  }
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const b64: string | undefined = parts.find((p: any) => p?.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error("Gemini image: no image data returned");
  return {
    artifact_bytes: decodeBase64(b64),
    artifact_mime: "image/png",
    provider: "gemini",
    model,
    latency_ms: Date.now() - started,
  };
}

// Decode a base64 string to bytes without pulling a std dependency (mirrors openai.ts).
function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
