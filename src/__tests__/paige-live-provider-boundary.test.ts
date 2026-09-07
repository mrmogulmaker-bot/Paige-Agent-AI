import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync("supabase/functions/_shared/model-router.ts", "utf8");
const tts = readFileSync("supabase/functions/paige-tts/index.ts", "utf8");
const session = readFileSync("supabase/functions/paige-live-session/index.ts", "utf8");
const operator = readFileSync("supabase/functions/paige-voice-profile-admin/index.ts", "utf8");

describe("Paige voice provider boundary", () => {
  it("cannot route a caller-selected voice from the shared model router", () => {
    const voiceCell = router.slice(router.indexOf("const voiceCell"), router.indexOf("const docRenderCell"));
    expect(voiceCell).not.toMatch(/voiceId|voice_id|elevenlabsTts|ELEVENLABS_API_KEY/);
    expect(voiceCell).toContain("paige_voice_profile:studio_adapter");
  });

  it("resolves the server profile before the only Paige TTS provider adapter call", () => {
    expect(tts.indexOf('rpc("resolve_paige_voice_profile_internal"')).toBeGreaterThan(-1);
    expect(tts.indexOf('rpc("resolve_paige_voice_profile_internal"')).toBeLessThan(tts.indexOf("elevenlabsTts({"));
    expect(tts).toContain("voice_override_not_allowed");
  });

  it("requires scope on every transition and permits stale cleanup only for explicit end", () => {
    expect(session).toContain("thread_id: z.string().uuid()");
    expect(session).toContain("context_epoch: z.string().min(1).max(512)");
    expect(session).toContain('parsed.data.transition !== "end"');
    expect(session).toContain("paige_live_session_transition_internal");
  });

  it("uses platform-owner authority and canonical proof without provider calls", () => {
    expect(operator).toContain('rpc("is_platform_owner")');
    expect(operator).toContain('from("paige_voice_provider_verifications")');
    expect(operator).not.toMatch(/elevenlabsTts|api\.elevenlabs|fetch\(/);
    expect(operator).not.toMatch(/console\.(log|error).*provider_voice_ref/);
  });
});
