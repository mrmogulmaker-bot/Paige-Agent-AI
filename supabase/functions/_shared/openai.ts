// _shared/openai.ts — OpenAI provider client for the Vibe Studio model router.
//
// Three capabilities, one vendor (the ONE OpenAI client on the platform — §18/§34):
//   openaiChat()   — text (the frontier-alt to Claude for reasoning/JSON); OpenAI Chat Completions.
//   openaiImage()  — gpt-image-1 image generation; returned as artifact_bytes (decoded from b64_json).
//   openaiSpeech() — text-to-speech (the audio/speech endpoint); returns the streaming Response so a
//                    caller can pipe the mp3 progressively. The ONLY OpenAI-audio call site — the TTS
//                    router (_shared/tts-router.ts) routes through THIS, never a second OpenAI client.
//
// FAIL-CLOSED (doctrine §13): OPENAI_API_KEY is read at CALL time; if absent we throw
// NeedsConfigError("openai") — never a generic crash, never a fake result. The key is never
// logged, echoed, or placed in a result field. Mirrors the fetch style of claude.ts.

import { NeedsConfigError, type ProviderCallResult } from "./provider-types.ts";
import { envKey } from "./env-key.ts";

const OPENAI_BASE = Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
const DEFAULT_CHAT_MODEL = "gpt-4o";
const IMAGE_MODEL = "gpt-image-1";

function openaiKey(): string {
  const k = envKey("OPENAI_API_KEY");
  if (!k) throw new NeedsConfigError("openai");
  return k;
}

export interface OpenAIChatInput {
  messages: { role: string; content: unknown }[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  json?: boolean; // request a JSON object response
}

/**
 * Text completion via OpenAI Chat Completions (frontier-tier alternative to Claude).
 * Returns ProviderCallResult with `content` + best-effort token counts.
 */
export async function openaiChat(input: OpenAIChatInput): Promise<ProviderCallResult> {
  const key = openaiKey();
  const model = input.model || DEFAULT_CHAT_MODEL;
  const started = Date.now();

  const body: Record<string, unknown> = {
    model,
    messages: input.messages,
    max_tokens: input.max_tokens ?? 2048,
  };
  if (input.temperature != null) body.temperature = input.temperature;
  if (input.json) body.response_format = { type: "json_object" };

  const resp = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenAI ${resp.status}: ${detail.slice(0, 500)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return {
    content: typeof content === "string" ? content : JSON.stringify(content),
    provider: "openai",
    model: data?.model ?? model,
    tokens_in: data?.usage?.prompt_tokens,
    tokens_out: data?.usage?.completion_tokens,
    latency_ms: Date.now() - started,
  };
}

export interface OpenAIImageInput {
  prompt: string;
  size?: string; // e.g. "1024x1024", "1536x1024", "1024x1536", "auto"
}

/**
 * Image generation via gpt-image-1. gpt-image-1 always returns base64 (no url option), so we
 * decode to artifact_bytes and let the router host it in studio-deliverables.
 */
export async function openaiImage(input: OpenAIImageInput): Promise<ProviderCallResult> {
  const key = openaiKey();
  const started = Date.now();

  const resp = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: input.prompt,
      size: input.size ?? "1024x1024",
      n: 1,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenAI image ${resp.status}: ${detail.slice(0, 500)}`);
  }
  const data = await resp.json();
  const b64: string | undefined = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image: no image data returned");
  return {
    artifact_bytes: decodeBase64(b64),
    artifact_mime: "image/png",
    provider: "openai",
    model: IMAGE_MODEL,
    latency_ms: Date.now() - started,
  };
}

export interface OpenAISpeechInput {
  /** The text to synthesize. Caller is responsible for length capping (OpenAI hard limit 4096). */
  input: string;
  /** OpenAI voice id (e.g. "nova"). Defaults to "nova" (Paige's voice, #166) — the TTS router
   *  normally resolves the real per-tenant voice; this is only the bare-wrapper fallback. */
  voice?: string;
  /** TTS model. Defaults to gpt-4o-mini-tts (the cheap, high-quality default). */
  model?: string;
  /** Response audio container. Defaults to "mp3" (streams to an <audio> element as audio/mpeg). */
  format?: string;
}

/**
 * Text-to-speech via OpenAI's audio/speech endpoint. Returns the raw fetch `Response` so the caller
 * can stream `resp.body` (a ReadableStream) straight to the client AND tee a copy for caching — a
 * full-buffer wait is never forced. FAIL-CLOSED (§13): the key is read via openaiKey(), which throws
 * NeedsConfigError when OPENAI_API_KEY is absent — the router checks presence first and turns that
 * into an honest needs_config, so this only runs when the key is truly set. A non-2xx from OpenAI
 * throws with the (truncated, key-free) detail; it never returns a fake/empty audio body.
 */
export async function openaiSpeech(input: OpenAISpeechInput): Promise<Response> {
  const key = openaiKey();
  const resp = await fetch(`${OPENAI_BASE}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: input.model ?? "gpt-4o-mini-tts",
      voice: input.voice ?? "nova",
      input: input.input,
      response_format: input.format ?? "mp3",
    }),
  });
  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenAI speech ${resp.status}: ${detail.slice(0, 500)}`);
  }
  return resp;
}

// Decode a base64 string to bytes without pulling a std dependency.
function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
