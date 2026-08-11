// §32 headless guard for #131/#579 (paige-tts chat voice playback). The live provider round-trips
// (ElevenLabs + OpenAI) and the Storage cache can't be driven in CI, so this exercises the PURE,
// key-free logic the endpoint is built on and asserts it behaves:
//   • the route-picker: both cells WIRED (elevenlabs-premium = the primary, openai-standard = the
//     fallback); undefined for an unknown tier
//   • voice validation across BOTH catalogs + the provider classifier + tier-default map + the
//     resolveVoiceId precedence (requested → playbook → tier → base default), incl. invalid/custom
//     voices degrading (never 400)
//   • the SHA-256 cache key: deterministic; distinct when ANY of provider/model/voice/text differ
//     (the cross-PROVIDER separation proof)
//   • planTtsSynthesis: the ORDERED FALLBACK CHAIN — needs_config when NEITHER key is present;
//     ElevenLabs-first→OpenAI-fallback ordering; honest degrade to OpenAI/nova when EL is unkeyed
//
// Run:  node --experimental-strip-types scripts/tts-router-smoke.mts
// Exit: 0 = the pure logic behaves; non-zero = a defect (fix before shipping).
//
// §13 HONEST — what this CANNOT verify (owed to a deployed call + a listen): the LIVE ElevenLabs /
// OpenAI audio round-trips (need the real secrets + an ear on the voice), the Storage cache hit/miss
// on prod, the platform_usage_events meter row landing, and the <audio> playback in a real browser.
// This smoke does NOT fake a passing provider call. It also does NOT prove the ElevenLabs voice ids
// exist on the account — that was checked separately via the ElevenLabs MCP (all 3 render real mp3).

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
  isOpenAiVoice,
  isElevenLabsVoice,
  classifyVoice,
  tierDefaultVoice,
  resolveVoiceId,
  ttsCacheKey,
  planTtsSynthesis,
  DEFAULT_TTS_VOICE,
  PRIMARY_ELEVENLABS_VOICE,
  BACKUP_ELEVENLABS_VOICE,
  OPENAI_FALLBACK_VOICE,
  ELEVENLABS_TTS_VOICES,
} = await import("../supabase/functions/_shared/tts-router.ts");

const EL_PRIMARY = "0S5oIfi8zOZixuSj8K6n";   // Ivanna — owner-ruled default 2026-08-09
const EL_WARM = "6aDn1KB0hjpdcocrUkmq";       // prior default, now a selectable "Warm" alt
const EL_BACKUP = "g6xIsTj2HwM6VR4iXFCw";
const EL_MALE = "vBKc2FfBKJfcZNyEt1n6";
const EL_MODEL = "eleven_multilingual_v2";
const OA_MODEL = "gpt-4o-mini-tts";

let failures = 0;
const ok = (name: string, cond: boolean) => {
  if (!cond) { failures++; console.error(`  ✗ ${name}`); } else { console.log(`  ✓ ${name}`); }
};
// deno-lint-ignore no-explicit-any
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

console.log("route table (both cells WIRED, #579)");
ok("elevenlabs-premium is the WIRED primary (not reserved)",
  resolveTtsRoute("elevenlabs-premium")?.provider === "elevenlabs" &&
  (resolveTtsRoute("elevenlabs-premium") as Record<string, unknown>)?.marketplace_only === undefined);
ok("openai-standard is the WIRED fallback", resolveTtsRoute("openai-standard")?.provider === "openai");
// deno-lint-ignore no-explicit-any
ok("unknown tier resolves undefined", resolveTtsRoute("nope" as any) === undefined);

console.log("catalog constants");
ok("primary EL voice is the owner-locked id", PRIMARY_ELEVENLABS_VOICE === EL_PRIMARY);
ok("backup EL voice is the second id", BACKUP_ELEVENLABS_VOICE === EL_BACKUP);
ok("OpenAI fallback voice is nova (#166)", OPENAI_FALLBACK_VOICE === "nova");
ok("EL catalog has exactly the 4 owner ids", eq(Object.keys(ELEVENLABS_TTS_VOICES).sort(), [EL_MALE, EL_PRIMARY, EL_WARM, EL_BACKUP].sort()));
ok("base default is the EL primary", eq(DEFAULT_TTS_VOICE, { provider: "elevenlabs", id: EL_PRIMARY }));

console.log("voice validation + provider classifier");
ok("nova is a valid OpenAI voice", isOpenAiVoice("nova") && isValidVoice("nova"));
ok("all 4 EL ids are valid EL voices", isElevenLabsVoice(EL_PRIMARY) && isElevenLabsVoice(EL_WARM) && isElevenLabsVoice(EL_BACKUP) && isElevenLabsVoice(EL_MALE));
ok("EL ids valid via isValidVoice", isValidVoice(EL_PRIMARY) && isValidVoice(EL_WARM) && isValidVoice(EL_BACKUP) && isValidVoice(EL_MALE));
ok("nova is NOT an EL voice", !isElevenLabsVoice("nova"));
ok("garbage is invalid in both catalogs", !isValidVoice("robo-9000"));
ok("classify EL primary → elevenlabs", eq(classifyVoice(EL_PRIMARY), { provider: "elevenlabs", id: EL_PRIMARY }));
ok("classify nova → openai", eq(classifyVoice("nova"), { provider: "openai", id: "nova" }));
ok("classify garbage → null (degrades, never 400)", classifyVoice("robo-9000") === null);

console.log("tier defaults (§200 every tier = EL primary)");
ok("academy tier default is EL primary", eq(tierDefaultVoice("academy_pro"), DEFAULT_TTS_VOICE));
ok("agency tier default is EL primary", eq(tierDefaultVoice("agency_growth"), DEFAULT_TTS_VOICE));
ok("unknown plan falls to base default", eq(tierDefaultVoice("mystery_plan"), DEFAULT_TTS_VOICE));
ok("null plan falls to base default", eq(tierDefaultVoice(null), DEFAULT_TTS_VOICE));

console.log("resolveVoiceId precedence (mixed catalog)");
ok("requested EL id wins", eq(resolveVoiceId({ requested: EL_MALE, playbookVoice: "echo", planSlug: "academy" }).voice, { provider: "elevenlabs", id: EL_MALE }));
ok("requested OpenAI enum still routes to OpenAI", eq(resolveVoiceId({ requested: "nova" }).voice, { provider: "openai", id: "nova" }));
ok("invalid requested degrades to playbook (OpenAI)", eq(resolveVoiceId({ requested: "custom-x", playbookVoice: "echo", planSlug: "academy" }).voice, { provider: "openai", id: "echo" }));
ok("no requested/playbook uses tier default", eq(resolveVoiceId({ requested: null, playbookVoice: null, planSlug: "academy" }).voice, DEFAULT_TTS_VOICE));
ok("nothing set uses base default (EL primary)", eq(resolveVoiceId({}).voice, DEFAULT_TTS_VOICE));
ok("default source reported", resolveVoiceId({}).source === "default");
ok("requested source reported", resolveVoiceId({ requested: EL_PRIMARY }).source === "requested");

console.log("cache key (SHA-256, deterministic + cross-PROVIDER distinct)");
const k1 = await ttsCacheKey("hello world", "elevenlabs", EL_PRIMARY, EL_MODEL);
const k2 = await ttsCacheKey("hello world", "elevenlabs", EL_PRIMARY, EL_MODEL);
const kOpenAi = await ttsCacheKey("hello world", "openai", "nova", OA_MODEL);
const kVoice = await ttsCacheKey("hello world", "elevenlabs", EL_BACKUP, EL_MODEL);
const kText = await ttsCacheKey("hello there", "elevenlabs", EL_PRIMARY, EL_MODEL);
ok("64-hex-char digest", /^[0-9a-f]{64}$/.test(k1));
ok("same inputs → same key", k1 === k2);
ok("different PROVIDER → different key (no cross-provider collision)", k1 !== kOpenAi);
ok("different voice → different key", k1 !== kVoice);
ok("different text → different key", k1 !== kText);

console.log("planTtsSynthesis — ordered fallback chain (honest degrade)");
delete env.OPENAI_API_KEY;
delete env.ELEVENLABS_API_KEY;
const noKey = planTtsSynthesis(DEFAULT_TTS_VOICE);
ok("NEITHER key → needs_config (never a fake body)", !noKey.ok && "needs_config" in noKey);

// Only OpenAI keyed: an EL-default voice honestly degrades to OpenAI/nova (the ship-safe state today).
env.OPENAI_API_KEY = "sk-test";
const oaOnly = planTtsSynthesis(DEFAULT_TTS_VOICE);
ok("only OpenAI keyed → EL default degrades to [openai/nova]",
  oaOnly.ok && oaOnly.attempts.length === 1 && eq(oaOnly.attempts[0], { provider: "openai", model: OA_MODEL, voice: "nova" }));

// Only ElevenLabs keyed: EL default → [primary, backup] (no OpenAI available); explicit OpenAI → [EL primary] last resort.
delete env.OPENAI_API_KEY;
env.ELEVENLABS_API_KEY = "xi-test";
const elOnly = planTtsSynthesis(DEFAULT_TTS_VOICE);
ok("only EL keyed, EL default → [primary, backup]",
  elOnly.ok && eq(elOnly.attempts, [
    { provider: "elevenlabs", model: EL_MODEL, voiceId: EL_PRIMARY },
    { provider: "elevenlabs", model: EL_MODEL, voiceId: EL_BACKUP },
  ]));
const elOnlyOa = planTtsSynthesis({ provider: "openai", id: "nova" });
ok("only EL keyed, OpenAI voice → [EL primary] last resort",
  elOnlyOa.ok && eq(elOnlyOa.attempts, [{ provider: "elevenlabs", model: EL_MODEL, voiceId: EL_PRIMARY }]));

// Both keyed: EL default → [EL primary, EL backup, OpenAI nova] (in-provider degrade first, §6).
env.OPENAI_API_KEY = "sk-test";
const both = planTtsSynthesis(DEFAULT_TTS_VOICE);
ok("both keyed, EL default → [primary, backup, openai/nova]",
  both.ok && eq(both.attempts, [
    { provider: "elevenlabs", model: EL_MODEL, voiceId: EL_PRIMARY },
    { provider: "elevenlabs", model: EL_MODEL, voiceId: EL_BACKUP },
    { provider: "openai", model: OA_MODEL, voice: "nova" },
  ]));
// A non-primary EL voice (male) does NOT force the backup — just [that voice, openai/nova].
const bothMale = planTtsSynthesis({ provider: "elevenlabs", id: EL_MALE });
ok("both keyed, EL male → [male, openai/nova] (no forced backup)",
  bothMale.ok && eq(bothMale.attempts, [
    { provider: "elevenlabs", model: EL_MODEL, voiceId: EL_MALE },
    { provider: "openai", model: OA_MODEL, voice: "nova" },
  ]));
// Explicit OpenAI voice honored first, EL primary as the last-resort tail.
const bothOa = planTtsSynthesis({ provider: "openai", id: "echo" });
ok("both keyed, OpenAI echo → [echo, EL primary]",
  bothOa.ok && eq(bothOa.attempts, [
    { provider: "openai", model: OA_MODEL, voice: "echo" },
    { provider: "elevenlabs", model: EL_MODEL, voiceId: EL_PRIMARY },
  ]));

// ── OPERATOR / PLATFORM-OWNER branch (§9/§51 — the P1 no-tenant fix) ──────────────────────────
// The platform owner (Super Admin) has NO tenant, so current_user_tenant_id() is null for them.
// paige-tts used to hard-400 (`workspace_unresolved`) → the operator's chat TTS broke. The fix: on
// a null tenant, gate on is_platform_admin (platform staff) and resolve a PLATFORM context (base voice, `_platform/`
// cache prefix, NO tenant meter) instead of 400ing; a genuine non-owner with no tenant STILL 400s.
//
// The gate logic lives in paige-tts/index.ts (§18 one home). It imports Deno's http server +
// supabase-js, so it can't be imported into Node here — this section (a) exercises the REAL pure
// functions the operator path relies on (resolveVoiceId, ttsCacheKey), and (b) traces the exact
// tenant-resolution DECISION TABLE via a small helper that MIRRORS index.ts's ternaries (honest §13:
// this mirrors, it does not import, index.ts — a drift there is owed to the peer read of the diff).
console.log("operator/platform-owner branch (§9/§51 no-tenant fix)");

// (a) VOICE: the operator has no playbook/plan, so resolveVoiceId({requested, null, null}) MUST land
//     on the base default — no tenant read required. A body voice_id still wins for the operator too.
ok("operator (no playbook/plan) voice → base default (EL primary)",
  eq(resolveVoiceId({ requested: null, playbookVoice: null, planSlug: null }).voice, DEFAULT_TTS_VOICE) &&
  resolveVoiceId({ requested: null, playbookVoice: null, planSlug: null }).source === "default");
ok("operator body voice_id still wins over base default",
  eq(resolveVoiceId({ requested: EL_MALE, playbookVoice: null, planSlug: null }).voice, { provider: "elevenlabs", id: EL_MALE }));

// (b) DECISION TABLE — mirrors paige-tts/index.ts: tenantId(trim) + isPlatformStaff → outcome.
//     outcome ∈ { "400", "tenant", "operator" }; storagePrefix + meterTenantId derived exactly as index.ts.
const decide = (resolvedTenant: string | null, isOwner: boolean) => {
  const tenantId = String(resolvedTenant ?? "").trim();
  if (!tenantId) {
    if (isOwner !== true) return { outcome: "400" as const };
    return { outcome: "operator" as const, storagePrefix: "_platform", meterTenantId: null as string | null };
  }
  return { outcome: "tenant" as const, storagePrefix: tenantId, meterTenantId: tenantId as string | null };
};
const TEN = "11111111-1111-1111-1111-111111111111";
// (a) operator: no tenant + is_platform_admin (platform staff) → operator path, `_platform` prefix, meter skipped.
ok("no-tenant + owner → operator path (_platform prefix, meter null)",
  eq(decide(null, true), { outcome: "operator", storagePrefix: "_platform", meterTenantId: null }));
ok("no-tenant + owner (empty-string tenant) → operator path too",
  eq(decide("", true), { outcome: "operator", storagePrefix: "_platform", meterTenantId: null }));
// (b) normal tenant → UNCHANGED (tenant prefix + tenant meter). No regression to the working path.
ok("real tenant + non-owner → tenant path UNCHANGED (tenant prefix + tenant meter)",
  eq(decide(TEN, false), { outcome: "tenant", storagePrefix: TEN, meterTenantId: TEN }));
ok("real tenant + owner → still the tenant path (owner with own tenant is a normal tenant here)",
  eq(decide(TEN, true), { outcome: "tenant", storagePrefix: TEN, meterTenantId: TEN }));
// (c) non-owner with no tenant → the honest 400 stays (§9 not loosened for real tenants).
ok("no-tenant + NON-owner → honest 400 (workspace_unresolved) preserved",
  decide(null, false).outcome === "400");

// (c) CACHE PATH SHAPE — the operator's mp3 lands under `_platform/<sha256>.mp3`, never a tenant folder.
const opKey = await ttsCacheKey("operator hello", "elevenlabs", EL_PRIMARY, EL_MODEL);
const opPath = `${decide(null, true).storagePrefix}/${opKey}.mp3`;
ok("operator cache path is _platform/<64hex>.mp3 (never a tenant folder)", /^_platform\/[0-9a-f]{64}\.mp3$/.test(opPath));

if (failures) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nAll tts-router pure checks passed.");
