// §32 headless guard for #131 (paige-tts chat voice playback). The live OpenAI TTS round-trip and
// the Storage cache can't be driven in CI, so this exercises the PURE, key-free logic the endpoint
// is built on and asserts it behaves:
//   • the TTS route-picker: the OpenAI cell for "openai-standard"; the RESERVED marketplace cell
//     for "elevenlabs-premium" (#132, not wired); undefined for an unknown tier
//   • voice validation + tier-default map + the resolveVoiceId precedence
//     (requested → playbook → tier → base default), incl. invalid/custom voices degrading (never 400)
//   • the SHA-256 cache key: deterministic for the same (text,voice,model), distinct when any differ
//   • planTtsSynthesis: needs_config when OPENAI_API_KEY is absent (honest degrade, never a wrong
//     provider), ok when present, reserved for the marketplace tier
//
// Run:  node --experimental-strip-types scripts/tts-router-smoke.mts
// Exit: 0 = the pure logic behaves; non-zero = a defect (fix before shipping).
//
// §13 HONEST — what this CANNOT verify (owed to a deployed call): the LIVE OpenAI audio/speech
// round-trip (needs the real OPENAI_API_KEY + audio quality, a live listen), the Storage cache
// hit/miss on prod, the platform_usage_events meter row landing, and the <audio> progressive
// playback in a real browser. This smoke does NOT fake a passing OpenAI call.

// tts-router → openai.ts / env-key.ts read Deno.env; shim it so the module imports in Node.
const env: Record<string, string | undefined> = {};
(globalThis as unknown as { Deno?: unknown }).Deno = {
  env: {
    get: (k: string) => env[k],
    toObject: () => ({ ...env }) as Record<string, string>,
  },
};

const {
  resolveTtsRoute,
  isValidVoice,
  tierDefaultVoice,
  resolveVoiceId,
  ttsCacheKey,
  planTtsSynthesis,
  DEFAULT_TTS_VOICE,
} = await import("../supabase/functions/_shared/tts-router.ts");

let failures = 0;
const ok = (name: string, cond: boolean) => {
  if (!cond) { failures++; console.error(`  ✗ ${name}`); } else { console.log(`  ✓ ${name}`); }
};

console.log("route table");
ok("openai-standard resolves to the OpenAI cell", resolveTtsRoute("openai-standard")?.provider === "openai");
ok("elevenlabs-premium is the reserved marketplace cell", resolveTtsRoute("elevenlabs-premium")?.marketplace_only === true);
// deno-lint-ignore no-explicit-any
ok("unknown tier resolves undefined", resolveTtsRoute("nope" as any) === undefined);

console.log("voice validation + defaults");
ok("alloy is valid", isValidVoice("alloy"));
ok("garbage is invalid", !isValidVoice("robo-9000"));
ok("base default is alloy", DEFAULT_TTS_VOICE === "alloy");
ok("academy tier default is nova", tierDefaultVoice("academy_pro") === "nova");
ok("agency tier default is sage", tierDefaultVoice("agency_growth") === "sage");
ok("unknown plan falls to base default", tierDefaultVoice("mystery_plan") === "alloy");
ok("null plan falls to base default", tierDefaultVoice(null) === "alloy");

console.log("resolveVoiceId precedence");
ok("valid requested wins", resolveVoiceId({ requested: "nova", playbookVoice: "echo", planSlug: "academy" }).voice === "nova");
ok("invalid requested degrades to playbook", resolveVoiceId({ requested: "custom-x", playbookVoice: "echo", planSlug: "academy" }).voice === "echo");
ok("no requested/playbook uses tier default", resolveVoiceId({ requested: null, playbookVoice: null, planSlug: "academy" }).voice === "nova");
ok("nothing set uses base default", resolveVoiceId({}).voice === "alloy");
ok("requested source reported", resolveVoiceId({ requested: "nova" }).source === "requested");

console.log("cache key (SHA-256, deterministic + distinct)");
const k1 = await ttsCacheKey("hello world", "alloy", "gpt-4o-mini-tts");
const k2 = await ttsCacheKey("hello world", "alloy", "gpt-4o-mini-tts");
const k3 = await ttsCacheKey("hello world", "nova", "gpt-4o-mini-tts");
const k4 = await ttsCacheKey("hello there", "alloy", "gpt-4o-mini-tts");
ok("64-hex-char digest", /^[0-9a-f]{64}$/.test(k1));
ok("same inputs → same key", k1 === k2);
ok("different voice → different key", k1 !== k3);
ok("different text → different key", k1 !== k4);

console.log("planTtsSynthesis (honest needs_config, never wrong provider)");
delete env.OPENAI_API_KEY;
const noKey = planTtsSynthesis("openai-standard", "alloy");
ok("no key → needs_config (not a throw, not a substitution)", !noKey.ok && "needs_config" in noKey);
const reserved = planTtsSynthesis("elevenlabs-premium", "alloy");
ok("marketplace tier → reserved (#132)", !reserved.ok && "reserved" in reserved);
env.OPENAI_API_KEY = "sk-test-not-real";
const withKey = planTtsSynthesis("openai-standard", "nova");
ok("key present → ok plan with the voice", withKey.ok === true && withKey.ok && withKey.voice === "nova");

if (failures) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nAll tts-router pure checks passed.");
