// _shared/tts-router.ts — Paige TTS Router (#131). The ONE home for text-to-speech (§18/§34).
//
// Mirrors the stt-router / model-router ROUTE_TABLE pattern: a table keyed by tier, a pure
// route-picker, an honest needs_config degrade when the provider key is absent (NEVER a
// wrong-provider substitution, never a throw), and the actual synthesis delegated to the ONE
// OpenAI client (_shared/openai.ts openaiSpeech) — there is exactly one OpenAI-audio call site
// on the platform and it lives behind this router.
//
// TIERS
//   "openai-standard"  → Tier 1, WIRED. OpenAI TTS (gpt-4o-mini-tts). The commodity behind the
//                        router; Paige owns the orchestration (§34).
//   "elevenlabs-premium" → Tier 2, RESERVED for the Marketplace (#132). Marked marketplace_only
//                        and NOT wired — resolving to it returns a clean "reserved" plan, never a
//                        live ElevenLabs call. This is the reserved slot, not an active provider.
//
// PURE where it can be (§32): the route-picker, the voice catalog + validation, the tier-default
// map, and the cache-key hash are pure/key-free and unit-smoked in scripts/tts-router-smoke.mts.
// Only ttsConfigured() reads the key (presence only, never the value); synthesizeSpeechStream()
// performs the live OpenAI call via openai.ts.

import { envKey } from "./env-key.ts";
import { openaiSpeech } from "./openai.ts";

/** TTS tiers. One WIRED tier (OpenAI standard) + one RESERVED Marketplace tier (#132). The table
 *  is a Partial<Record> so a third tier is an ADD, never a fork (§18). */
export type TtsTier = "openai-standard" | "elevenlabs-premium";

export interface TtsRouteCell {
  provider: string; // provider slug (audit + honest reporting)
  model: string; // default model id for this cell
  justification: string; // one-line rationale (§11/§13), auditable in code
  host: string; // the synth endpoint (documented; openai.ts owns the actual call)
  /** RESERVED Marketplace slot (#132) — present in the table but NOT wired. A route to a
   *  marketplace_only cell resolves to { reserved: true }, never a live call. */
  marketplace_only?: boolean;
}

// The TTS route table. Every cell carries its own justification so the choice is auditable in code
// (mirrors stt-router's STT_ROUTE_TABLE). A missing cell resolves to a clean error; a reserved cell
// to a clean reserved plan — never a silent wrong-provider substitution.
const TTS_ROUTE_TABLE: Partial<Record<TtsTier, TtsRouteCell>> = {
  "openai-standard": {
    provider: "openai",
    model: "gpt-4o-mini-tts",
    justification:
      "OpenAI gpt-4o-mini-tts — low-cost, high-quality speech for per-message chat playback; the routable TTS commodity behind Paige's router (§34), never a second OpenAI-audio client.",
    host: "https://api.openai.com/v1/audio/speech",
  },
  "elevenlabs-premium": {
    provider: "elevenlabs",
    model: "eleven_multilingual_v2",
    justification:
      "ElevenLabs premium voices — RESERVED Tier-2 Marketplace slot (#132). Present as the reserved cell so the second tier is an ADD, not a fork; NOT wired now.",
    host: "https://api.elevenlabs.io/v1/text-to-speech",
    marketplace_only: true,
  },
};

/** Pure route-picker. Returns the cell for a tier, or undefined (⇒ a clean error downstream). */
export function resolveTtsRoute(tier: TtsTier = "openai-standard"): TtsRouteCell | undefined {
  return TTS_ROUTE_TABLE[tier];
}

// ── Voice catalog (§7/§10 tenant-authored config-as-data) ────────────────────────────────────
// The valid OpenAI TTS voice ids. A tenant's chosen voice (playbook.paige_voice) is validated
// against this list on read — an unknown/stale value degrades to the tier default, never a 400.
export const OPENAI_TTS_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse",
] as const;
export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];

/** The base default voice when a tenant has authored none and no tier default applies. */
export const DEFAULT_TTS_VOICE: OpenAiTtsVoice = "alloy";

// Per-subscription-tier default voice (§7 — a sane default the tenant inherits until they author
// their own). Keyed by platform plan slug substrings; a real, non-placeholder map. Every value is a
// valid catalog voice. A tenant's own paige_voice always wins over these (§7).
const TIER_DEFAULT_VOICE: Record<string, OpenAiTtsVoice> = {
  academy: "nova", // higher tier → the warmer, more premium default
  enterprise: "nova",
  agency: "sage",
  practice: "alloy",
  starter: "alloy",
  free: "alloy",
};

/** Pure: resolve the default voice for a platform plan slug (case-insensitive substring match). */
export function tierDefaultVoice(planSlug?: string | null): OpenAiTtsVoice {
  if (!planSlug) return DEFAULT_TTS_VOICE;
  const s = planSlug.toLowerCase();
  for (const key of Object.keys(TIER_DEFAULT_VOICE)) {
    if (s.includes(key)) return TIER_DEFAULT_VOICE[key];
  }
  return DEFAULT_TTS_VOICE;
}

/** Pure: is this a valid, non-reserved OpenAI voice? (Custom Marketplace voices are #132.) */
export function isValidVoice(voice: unknown): voice is OpenAiTtsVoice {
  return typeof voice === "string" && (OPENAI_TTS_VOICES as readonly string[]).includes(voice);
}

/**
 * Pure voice resolution (§7 tenant-authored, §15 no placeholder): a caller-requested voice wins if
 * valid; else the tenant's authored playbook voice if valid; else the subscription-tier default;
 * else the base default. An invalid/custom (marketplace #132) request never 400s — it degrades to
 * the next source. Returns the chosen voice + which source it came from (honest reporting §13).
 */
export function resolveVoiceId(args: {
  requested?: string | null;
  playbookVoice?: string | null;
  planSlug?: string | null;
}): { voice: OpenAiTtsVoice; source: "requested" | "playbook" | "tier" | "default" } {
  if (isValidVoice(args.requested)) return { voice: args.requested, source: "requested" };
  if (isValidVoice(args.playbookVoice)) return { voice: args.playbookVoice, source: "playbook" };
  const tier = tierDefaultVoice(args.planSlug);
  // If a tier default exists distinct from the base, report it as "tier"; else "default".
  return tier === DEFAULT_TTS_VOICE && !args.planSlug
    ? { voice: DEFAULT_TTS_VOICE, source: "default" }
    : { voice: tier, source: "tier" };
}

/** Pure: the tenant-scoped Storage cache key for a synthesis (§14). SHA-256 of model:voice:text,
 *  hex-encoded, so identical replays hit the cache and skip OpenAI entirely. */
export async function ttsCacheKey(text: string, voice: string, model: string): Promise<string> {
  const material = `${model}:${voice}:${text}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** OPENAI_API_KEY presence (case-insensitive, §12). Never returns/logs the value. */
export function ttsConfigured(): boolean {
  return Boolean(envKey("OPENAI_API_KEY"));
}

/** The plan a caller acts on: a ready OpenAI cell (key present), a RESERVED marketplace tier,
 *  an HONEST needs_config degrade (no key), or a typed route error. */
export type TtsSynthPlan =
  | { ok: true; provider: string; model: string; voice: OpenAiTtsVoice }
  | { ok: false; reserved: true; provider: string } // marketplace_only tier (#132)
  | { ok: false; needs_config: true; provider: "unconfigured" }
  | { ok: false; error: string };

/**
 * Resolve the synthesis plan for a tier + voice WITHOUT calling OpenAI (so it's unit-testable).
 * No cell ⇒ a typed error; a marketplace_only cell ⇒ reserved (#132); a wired cell but no key ⇒
 * needs_config (the SAME honest shape a missing stt-router cell produces). The key is NOT read here
 * beyond presence, so a plan object can be logged safely (§13).
 */
export function planTtsSynthesis(tier: TtsTier = "openai-standard", voice: OpenAiTtsVoice = DEFAULT_TTS_VOICE): TtsSynthPlan {
  const cell = resolveTtsRoute(tier);
  if (!cell) return { ok: false, error: `tts_route_unconfigured_tier:${tier}` };
  if (cell.marketplace_only) return { ok: false, reserved: true, provider: cell.provider };
  if (!ttsConfigured()) return { ok: false, needs_config: true, provider: "unconfigured" };
  return { ok: true, provider: cell.provider, model: cell.model, voice };
}

/**
 * Perform the live TTS call for a resolved OpenAI plan, returning the streaming Response so the
 * caller can pipe + tee it (progressive playback + cache write). This is the ONLY function that
 * triggers a live OpenAI-audio call, and it delegates to the ONE OpenAI client (openai.ts). It is
 * only ever reached after planTtsSynthesis returned { ok: true } (key present, non-reserved tier).
 */
export async function synthesizeSpeechStream(plan: { model: string; voice: OpenAiTtsVoice }, text: string): Promise<Response> {
  return await openaiSpeech({ input: text, voice: plan.voice, model: plan.model, format: "mp3" });
}
