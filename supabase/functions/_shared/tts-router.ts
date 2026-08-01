// _shared/tts-router.ts — Paige TTS Router (#131/#579). The ONE home for text-to-speech (§18/§34).
//
// Mirrors the stt-router / model-router ROUTE_TABLE pattern: a table keyed by tier, a pure
// route-picker, an honest needs_config degrade when NO provider key is present (NEVER a fake body,
// never a throw), and the actual synthesis delegated to the ONE client per provider — OpenAI via
// _shared/openai.ts (openaiSpeech), ElevenLabs via _shared/elevenlabs.ts (elevenlabsTts).
//
// PROVIDERS (#579 — ElevenLabs is now Paige's PRIMARY voice; OpenAI is the honest fallback)
//   "elevenlabs-premium" → Tier 1, WIRED default. ElevenLabs eleven_multilingual_v2. Paige's voice
//                        (owner-locked female 6aDn1KB0hjpdcocrUkmq) is the platform default on every
//                        tenant (§200) until a tenant authors their own (§7).
//   "openai-standard"    → Tier 2, WIRED fallback. OpenAI gpt-4o-mini-tts. The voice heard when
//                        ElevenLabs errors or is unconfigured — nova (#166), also warm + feminine so
//                        the degrade never shifts gender/persona (§6 no jarring hand-off).
//
// Neither provider is "reserved": both cells are live. The synthesis PLAN is an ORDERED FALLBACK
// CHAIN — the resolved voice picks the primary provider, and the router appends the other as the
// honest degrade so a single provider outage never silently fails (§13). Marketplace-authored custom
// voices (#132/#167) layer ON this per tenant later; they do not gate the default.
//
// PURE where it can be (§32): the route-picker, both voice catalogs + validation, the tier-default
// map, the fallback-chain planner, and the cache-key hash are pure/key-free and unit-smoked in
// scripts/tts-router-smoke.mts. Only the *Configured() probes read a key (PRESENCE only, never the
// value); the live calls live in openai.ts / elevenlabs.ts and are only reached for a planned attempt.

import { envKey } from "./env-key.ts";
import { openaiSpeech } from "./openai.ts";

/** TTS tiers. Both cells are WIRED (#579): ElevenLabs is the primary, OpenAI the fallback. The table
 *  is a Partial<Record> so a third provider is an ADD, never a fork (§18). */
export type TtsTier = "openai-standard" | "elevenlabs-premium";

export interface TtsRouteCell {
  provider: string; // provider slug (audit + honest reporting)
  model: string; // default model id for this cell
  justification: string; // one-line rationale (§11/§13), auditable in code
  host: string; // the synth endpoint (documented; the provider client owns the actual call)
}

// The TTS route table. Every cell carries its own justification so the choice is auditable in code
// (mirrors stt-router's STT_ROUTE_TABLE). A missing cell resolves to a clean error — never a silent
// wrong-provider substitution.
const TTS_ROUTE_TABLE: Partial<Record<TtsTier, TtsRouteCell>> = {
  "elevenlabs-premium": {
    provider: "elevenlabs",
    model: "eleven_multilingual_v2",
    justification:
      "ElevenLabs eleven_multilingual_v2 — Paige's PRIMARY platform voice (owner-locked female 6aDn1KB0hjpdcocrUkmq). WIRED default tier; OpenAI is the honest fallback (§13/#579).",
    host: "https://api.elevenlabs.io/v1/text-to-speech",
  },
  "openai-standard": {
    provider: "openai",
    model: "gpt-4o-mini-tts",
    justification:
      "OpenAI gpt-4o-mini-tts — low-cost, high-quality fallback voice (nova, #166) heard when ElevenLabs errors or is unconfigured; the routable TTS commodity behind Paige's router (§34), never a second OpenAI-audio client.",
    host: "https://api.openai.com/v1/audio/speech",
  },
};

/** Pure route-picker. Returns the cell for a tier, or undefined (⇒ a clean error downstream). */
export function resolveTtsRoute(tier: TtsTier): TtsRouteCell | undefined {
  return TTS_ROUTE_TABLE[tier];
}

// ── Voice catalogs (§7/§10 tenant-authored config-as-data) ────────────────────────────────────
// A resolved voice carries its PROVIDER so the handler routes it to the right client and the cache
// key never collides across providers. The two id spaces are disjoint (OpenAI = fixed lowercase
// words; ElevenLabs = 20-char base62), so classification is unambiguous.
export interface ResolvedVoice {
  provider: "elevenlabs" | "openai";
  id: string;
}

/** The valid OpenAI TTS voice ids. A tenant's chosen OpenAI voice is validated against this list on
 *  read — an unknown/stale value degrades to the tier default, never a 400. */
export const OPENAI_TTS_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse",
] as const;
export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];

/** The ElevenLabs voice catalog — an EXPLICIT 3-id allowlist (owner-locked, #579). Config-as-data:
 *  a tenant selects one (via set_tenant_paige_voice / a future picker, #167). An arbitrary opaque id
 *  is NOT accepted — it degrades to the default, never blindly POSTed to ElevenLabs. Labels stay
 *  backend-only (§11 — never surface a vendor voice id/name in UI). */
export const ELEVENLABS_TTS_VOICES = {
  "6aDn1KB0hjpdcocrUkmq": { label: "Warm", role: "primary" },  // owner-locked female — platform default
  "g6xIsTj2HwM6VR4iXFCw": { label: "Clear", role: "backup" },  // backup female (in-provider degrade for the primary)
  "vBKc2FfBKJfcZNyEt1n6": { label: "Deep", role: "male" },     // male option
} as const;
export type ElevenLabsVoiceId = keyof typeof ELEVENLABS_TTS_VOICES;

/** The owner-locked primary female — Paige's default voice on every tenant (§200/§3). */
export const PRIMARY_ELEVENLABS_VOICE: ElevenLabsVoiceId = "6aDn1KB0hjpdcocrUkmq";
/** The backup female — SAME provider as the primary, so a voice-level ElevenLabs hiccup degrades
 *  in-voice (gender/persona never shifts) before we ever fall to OpenAI (§6). */
export const BACKUP_ELEVENLABS_VOICE: ElevenLabsVoiceId = "g6xIsTj2HwM6VR4iXFCw";
/** The OpenAI voice heard ONLY on a full ElevenLabs outage — nova (#166), warm + feminine so the
 *  persona survives the degrade. Never the ElevenLabs id (OpenAI would 400 on an unknown voice). */
export const OPENAI_FALLBACK_VOICE: OpenAiTtsVoice = "nova";

/** The base default voice when a tenant has authored none and no tier default applies (#579): the
 *  ElevenLabs primary. Every tenant hears Paige's voice by default until they author their own (§7). */
export const DEFAULT_TTS_VOICE: ResolvedVoice = { provider: "elevenlabs", id: PRIMARY_ELEVENLABS_VOICE };

// Per-subscription-tier default voice (§7 — a sane default the tenant inherits until they author
// their own). Keyed by platform plan slug substrings; a real, non-placeholder map. §200-clean:
// generic slugs, NO tenant/MMA pin — the default fires for EVERY tenant. A tenant's own paige_voice
// always wins over these (§7). #167 (Wave C) layers the tenant-facing picker + tier gating on top.
const TIER_DEFAULT_VOICE: Record<string, ResolvedVoice> = {
  academy: DEFAULT_TTS_VOICE,
  enterprise: DEFAULT_TTS_VOICE,
  agency: DEFAULT_TTS_VOICE,
  practice: DEFAULT_TTS_VOICE,
  starter: DEFAULT_TTS_VOICE,
  free: DEFAULT_TTS_VOICE,
};

/** Pure: resolve the default voice for a platform plan slug (case-insensitive substring match). */
export function tierDefaultVoice(planSlug?: string | null): ResolvedVoice {
  if (!planSlug) return DEFAULT_TTS_VOICE;
  const s = planSlug.toLowerCase();
  for (const key of Object.keys(TIER_DEFAULT_VOICE)) {
    if (s.includes(key)) return TIER_DEFAULT_VOICE[key];
  }
  return DEFAULT_TTS_VOICE;
}

/** Pure: is this a valid OpenAI voice id? */
export function isOpenAiVoice(v: unknown): v is OpenAiTtsVoice {
  return typeof v === "string" && (OPENAI_TTS_VOICES as readonly string[]).includes(v);
}
/** Pure: is this one of the 3 allowlisted ElevenLabs voice ids? (An arbitrary opaque id is NOT.) */
export function isElevenLabsVoice(v: unknown): v is ElevenLabsVoiceId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ELEVENLABS_TTS_VOICES, v);
}
/** Pure: is this a valid, routable voice in EITHER catalog? (Custom Marketplace voices are #132.) */
export function isValidVoice(voice: unknown): boolean {
  return isElevenLabsVoice(voice) || isOpenAiVoice(voice);
}

/** Pure: classify a voice id to its provider, or null if it's in neither catalog (⇒ degrade, never
 *  a 400, §15). ElevenLabs is checked first; the id spaces are disjoint so ordering is only a guard. */
export function classifyVoice(v: unknown): ResolvedVoice | null {
  if (isElevenLabsVoice(v)) return { provider: "elevenlabs", id: v };
  if (isOpenAiVoice(v)) return { provider: "openai", id: v };
  return null;
}

/**
 * Pure voice resolution (§7 tenant-authored, §15 no placeholder): a caller-requested voice wins if
 * valid; else the tenant's authored playbook voice if valid; else the subscription-tier default;
 * else the base default. An invalid/custom request never 400s — it degrades to the next source.
 * Returns the resolved {provider,id} + which source it came from (honest reporting §13).
 */
export function resolveVoiceId(args: {
  requested?: string | null;
  playbookVoice?: string | null;
  planSlug?: string | null;
}): { voice: ResolvedVoice; source: "requested" | "playbook" | "tier" | "default" } {
  const req = classifyVoice(args.requested);
  if (req) return { voice: req, source: "requested" };
  const pb = classifyVoice(args.playbookVoice);
  if (pb) return { voice: pb, source: "playbook" };
  if (args.planSlug) return { voice: tierDefaultVoice(args.planSlug), source: "tier" };
  return { voice: DEFAULT_TTS_VOICE, source: "default" };
}

/** Pure: the tenant-scoped Storage cache key for a synthesis (§14). SHA-256 of provider:model:voice:text,
 *  hex-encoded, so identical replays hit the cache AND an ElevenLabs render can never collide with an
 *  OpenAI render of the same text (the provider is in the material — separation is auditable, §13). */
export async function ttsCacheKey(text: string, provider: string, voiceId: string, model: string): Promise<string> {
  const material = `${provider}:${model}:${voiceId}:${text}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** OPENAI_API_KEY presence (case-insensitive, §12). Never returns/logs the value. */
export function ttsConfigured(): boolean {
  return Boolean(envKey("OPENAI_API_KEY"));
}
/** ELEVENLABS_API_KEY presence (case-insensitive, §12). Never returns/logs the value. */
export function elevenLabsConfigured(): boolean {
  return Boolean(envKey("ELEVENLABS_API_KEY"));
}

// ── Synthesis plan: an ORDERED FALLBACK CHAIN (#579) ─────────────────────────────────────────────
// One attempt per provider the router will try, in order. The resolved voice picks the primary
// provider; the router appends the honest degrade. Only providers whose key is present are queued —
// so with NO ElevenLabs key, an ElevenLabs-default voice cleanly degrades to OpenAI/nova (the
// ship-safe state), and with NEITHER key the plan is needs_config (never a fake body, §13).
export type TtsAttempt =
  | { provider: "elevenlabs"; model: string; voiceId: ElevenLabsVoiceId }
  | { provider: "openai"; model: string; voice: OpenAiTtsVoice };

export type TtsSynthPlan =
  | { ok: true; attempts: TtsAttempt[] } // ≥1 configured provider
  | { ok: false; needs_config: true }; // NEITHER provider configured

/**
 * Pure planner (no live call, so it's unit-testable §32). Builds the ordered attempt chain for a
 * resolved voice, gated by which provider keys are present:
 *  - ElevenLabs voice → [that EL voice] then (only when it's the PRIMARY default) [backup EL voice]
 *    then [OpenAI nova]. The backup keeps a primary-voice hiccup in-voice before the provider flip (§6).
 *  - OpenAI voice (a tenant explicitly authored one) → [that OpenAI voice] then [EL primary].
 */
export function planTtsSynthesis(resolved: ResolvedVoice): TtsSynthPlan {
  const elModel = resolveTtsRoute("elevenlabs-premium")!.model;
  const oaModel = resolveTtsRoute("openai-standard")!.model;
  const elOk = elevenLabsConfigured();
  const oaOk = ttsConfigured();
  const attempts: TtsAttempt[] = [];

  if (resolved.provider === "elevenlabs") {
    const id = (isElevenLabsVoice(resolved.id) ? resolved.id : PRIMARY_ELEVENLABS_VOICE) as ElevenLabsVoiceId;
    if (elOk) attempts.push({ provider: "elevenlabs", model: elModel, voiceId: id });
    // In-provider degrade for the DEFAULT primary voice: try the backup female before OpenAI (§6).
    if (elOk && id === PRIMARY_ELEVENLABS_VOICE && BACKUP_ELEVENLABS_VOICE !== id) {
      attempts.push({ provider: "elevenlabs", model: elModel, voiceId: BACKUP_ELEVENLABS_VOICE });
    }
    if (oaOk) attempts.push({ provider: "openai", model: oaModel, voice: OPENAI_FALLBACK_VOICE });
  } else {
    const v = (isOpenAiVoice(resolved.id) ? resolved.id : OPENAI_FALLBACK_VOICE) as OpenAiTtsVoice;
    if (oaOk) attempts.push({ provider: "openai", model: oaModel, voice: v });
    if (elOk) attempts.push({ provider: "elevenlabs", model: elModel, voiceId: PRIMARY_ELEVENLABS_VOICE });
  }

  return attempts.length ? { ok: true, attempts } : { ok: false, needs_config: true };
}

/**
 * Perform the live TTS call for a resolved OpenAI attempt, returning the streaming Response so the
 * caller can pipe + tee it (progressive playback + cache write). This is the ONLY function that
 * triggers a live OpenAI-audio call, and it delegates to the ONE OpenAI client (openai.ts). The
 * ElevenLabs attempt is performed by the caller via _shared/elevenlabs.ts (buffered bytes).
 */
export async function synthesizeSpeechStream(plan: { model: string; voice: OpenAiTtsVoice }, text: string): Promise<Response> {
  return await openaiSpeech({ input: text, voice: plan.voice, model: plan.model, format: "mp3" });
}
