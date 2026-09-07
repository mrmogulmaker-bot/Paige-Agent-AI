// _shared/elevenlabs.ts — low-level ElevenLabs text-to-speech transport.
//
// Callers must resolve the provider reference through the service-only Paige Voice Profile and
// readiness gate before entering this adapter. This file owns transport only.
//
// FAIL-CLOSED (doctrine §13): ELEVENLABS_API_KEY is read at CALL time; if absent we throw
// NeedsConfigError("elevenlabs") — never a generic crash, never fake audio. The key is very
// likely NOT set today, so this modality honestly degrades to needs_config until it is. The key
// travels only in the xi-api-key header and is NEVER logged/echoed/placed in a result.

import { NeedsConfigError, type ProviderCallResult } from "./provider-types.ts";
import { envKey } from "./env-key.ts";

const ELEVENLABS_BASE = Deno.env.get("ELEVENLABS_BASE_URL") ?? "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL = Deno.env.get("ELEVENLABS_MODEL") ?? "eleven_multilingual_v2";

function elevenlabsKey(): string {
  const k = envKey("ELEVENLABS_API_KEY");
  if (!k) throw new NeedsConfigError("elevenlabs");
  return k;
}

export interface ElevenLabsTtsInput {
  text: string;
  /** Required server-resolved provider reference. There is deliberately no provider default. */
  voiceId: string;
  modelId?: string;
}

/**
 * Render `text` to speech via ElevenLabs and return the mp3 bytes. Throws NeedsConfigError when
 * the key is unset (honest degrade) and a typed Error on an API failure — never a fake artifact.
 */
export async function elevenlabsTts(opts: ElevenLabsTtsInput): Promise<ProviderCallResult> {
  const key = elevenlabsKey();
  const voiceId = opts.voiceId;
  if (!voiceId) throw new NeedsConfigError("elevenlabs:paige_voice_profile");
  const modelId = opts.modelId || DEFAULT_MODEL;
  const started = Date.now();

  // The server-resolved reference is still encoded so no unexpected provider value can reshape
  // the request path (§13 secure-by-construction).
  const resp = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    // Key in the xi-api-key header only — never the URL — so a network-level fetch reject
    // (which echoes the request URL into a TypeError) can never leak the secret.
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text: opts.text, model_id: modelId }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs ${resp.status}: ${detail.slice(0, 500)}`);
  }

  // The endpoint returns the rendered audio as the raw response body (no JSON envelope).
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length === 0) throw new Error("ElevenLabs: empty audio response");
  return {
    artifact_bytes: bytes,
    artifact_mime: "audio/mpeg",
    provider: "elevenlabs",
    model: modelId,
    latency_ms: Date.now() - started,
  };
}
