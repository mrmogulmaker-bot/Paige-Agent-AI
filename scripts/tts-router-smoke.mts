// Pure proof for the server-owned Paige Voice Profile TTS route. No provider call or secret read.
const env: Record<string, string | undefined> = {};
(globalThis as unknown as { Deno?: unknown }).Deno = { env: { get: (key: string) => env[key], toObject: () => ({ ...env }) } };

const { resolveTtsRoute, resolveProfileVoice, ttsCacheKey, planTtsSynthesis } = await import("../supabase/functions/_shared/tts-router.ts");
let failures = 0;
const ok = (name: string, condition: boolean) => condition ? console.log(`  ✓ ${name}`) : (failures++, console.error(`  ✗ ${name}`));
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

ok("both transport routes remain registered", resolveTtsRoute("elevenlabs-premium")?.provider === "elevenlabs" && resolveTtsRoute("openai-standard")?.provider === "openai");
ok("unapproved profile fails closed", resolveProfileVoice({ provider: "openai", provider_voice_ref: "nova", revision: "r1", approved: false, active: true }) === null);
ok("inactive profile fails closed", resolveProfileVoice({ provider: "openai", provider_voice_ref: "nova", revision: "r1", approved: true, active: false }) === null);
ok("unknown OpenAI voice fails closed", resolveProfileVoice({ provider: "openai", provider_voice_ref: "invented", revision: "r1", approved: true, active: true }) === null);
const openaiProfile = resolveProfileVoice({ provider: "openai", provider_voice_ref: "nova", revision: "r1", approved: true, active: true });
const elevenProfile = resolveProfileVoice({ provider: "elevenlabs", provider_voice_ref: "providerRefA123", revision: "r2", approved: true, active: true });
ok("approved OpenAI profile resolves", eq(openaiProfile, { provider: "openai", id: "nova", profileRevision: "r1" }));
ok("approved provider reference resolves without a catalog literal", eq(elevenProfile, { provider: "elevenlabs", id: "providerRefA123", profileRevision: "r2" }));

delete env.OPENAI_API_KEY;
delete env.ELEVENLABS_API_KEY;
ok("no configured provider fails closed", !!openaiProfile && !planTtsSynthesis(openaiProfile).ok);
env.OPENAI_API_KEY = "presence-only";
ok("selected OpenAI profile creates exactly one attempt", !!openaiProfile && eq(planTtsSynthesis(openaiProfile), { ok: true, attempts: [{ provider: "openai", model: "gpt-4o-mini-tts", voice: "nova", profileRevision: "r1" }] }));
delete env.OPENAI_API_KEY;
env.ELEVENLABS_API_KEY = "presence-only";
ok("selected ElevenLabs profile creates exactly one attempt", !!elevenProfile && eq(planTtsSynthesis(elevenProfile), { ok: true, attempts: [{ provider: "elevenlabs", model: "eleven_multilingual_v2", voiceId: "providerRefA123", profileRevision: "r2" }] }));
ok("a configured alternate provider is not an implicit fallback", !!openaiProfile && !planTtsSynthesis(openaiProfile).ok);

const keyA = await ttsCacheKey("hello", "openai", "nova", "gpt-4o-mini-tts");
const keyB = await ttsCacheKey("hello", "openai", "nova", "gpt-4o-mini-tts");
const keyC = await ttsCacheKey("hello", "elevenlabs", "providerRefA123", "eleven_multilingual_v2");
ok("cache key is deterministic", keyA === keyB && /^[0-9a-f]{64}$/.test(keyA));
ok("provider identity separates cache entries", keyA !== keyC);

if (failures) process.exit(1);
console.log("All server-profile TTS checks passed.");
