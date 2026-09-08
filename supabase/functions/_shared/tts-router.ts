// The one Paige TTS router. A caller supplies text only; voice identity comes exclusively from
// the approved server-side Paige Voice Profile. No provider voice id or request override lives here.
import { envKey } from "./env-key.ts";
import { openaiSpeech } from "./openai.ts";

export type TtsTier = "openai-standard" | "elevenlabs-premium";
export interface TtsRouteCell { provider: "openai" | "elevenlabs"; model: string; justification: string; host: string }
const TTS_ROUTE_TABLE: Record<TtsTier, TtsRouteCell> = {
  "elevenlabs-premium": {
    provider: "elevenlabs",
    model: "eleven_multilingual_v2",
    justification: "Provider transport for an approved Paige Voice Profile; profile resolution owns voice identity.",
    host: "https://api.elevenlabs.io/v1/text-to-speech",
  },
  "openai-standard": {
    provider: "openai",
    model: "gpt-4o-mini-tts",
    justification: "Approved Paige Voice Profile fallback transport; profile resolution owns voice identity.",
    host: "https://api.openai.com/v1/audio/speech",
  },
};

export function resolveTtsRoute(tier: TtsTier): TtsRouteCell | undefined { return TTS_ROUTE_TABLE[tier]; }

export const OPENAI_TTS_VOICES = ["alloy","ash","ballad","coral","echo","fable","onyx","nova","sage","shimmer","verse"] as const;
export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];
export type ResolvedVoice = Readonly<{ provider: "elevenlabs" | "openai"; id: string; profileRevision: string }>;
export type ServerVoiceProfile = Readonly<{ provider: unknown; provider_voice_ref: unknown; revision: unknown; approved?: unknown; active?: unknown }>;

export function isOpenAiVoice(value: unknown): value is OpenAiTtsVoice {
  return typeof value === "string" && (OPENAI_TTS_VOICES as readonly string[]).includes(value);
}

export function resolveProfileVoice(profile: ServerVoiceProfile): ResolvedVoice | null {
  if (profile.approved !== true || profile.active !== true || typeof profile.revision !== "string" || !profile.revision.trim()) return null;
  if (profile.provider === "openai" && isOpenAiVoice(profile.provider_voice_ref)) {
    return { provider: "openai", id: profile.provider_voice_ref, profileRevision: profile.revision };
  }
  if (profile.provider === "elevenlabs" && typeof profile.provider_voice_ref === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(profile.provider_voice_ref)) {
    return { provider: "elevenlabs", id: profile.provider_voice_ref, profileRevision: profile.revision };
  }
  return null;
}

export async function ttsCacheKey(text: string, provider: string, voiceId: string, model: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${provider}:${model}:${voiceId}:${text}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2,"0")).join("");
}

export function ttsConfigured(): boolean { return Boolean(envKey("OPENAI_API_KEY")); }
export function elevenLabsConfigured(): boolean { return Boolean(envKey("ELEVENLABS_API_KEY")); }

export type TtsAttempt =
  | { provider: "elevenlabs"; model: string; voiceId: string; profileRevision: string }
  | { provider: "openai"; model: string; voice: OpenAiTtsVoice; profileRevision: string };
export type TtsSynthPlan = { ok: true; attempts: [TtsAttempt] } | { ok: false; needs_config: true };

export function planTtsSynthesis(resolved: ResolvedVoice): TtsSynthPlan {
  if (resolved.provider === "elevenlabs") {
    if (!elevenLabsConfigured()) return { ok: false, needs_config: true };
    return { ok: true, attempts: [{ provider: "elevenlabs", model: TTS_ROUTE_TABLE["elevenlabs-premium"].model, voiceId: resolved.id, profileRevision: resolved.profileRevision }] };
  }
  if (!ttsConfigured() || !isOpenAiVoice(resolved.id)) return { ok: false, needs_config: true };
  return { ok: true, attempts: [{ provider: "openai", model: TTS_ROUTE_TABLE["openai-standard"].model, voice: resolved.id, profileRevision: resolved.profileRevision }] };
}

export async function synthesizeSpeechStream(plan: { model: string; voice: OpenAiTtsVoice }, text: string): Promise<Response> {
  return await openaiSpeech({ input: text, voice: plan.voice, model: plan.model, format: "mp3" });
}
