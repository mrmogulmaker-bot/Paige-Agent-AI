import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260907155052_paige_live_conversation_control_plane.sql"),
  "utf8",
);

describe("Paige voice profile SQL contract", () => {
  it("keeps the resolver and writer service-only", () => {
    expect(sql).toMatch(/auth\.role\(\) <> 'service_role'/);
    expect(sql).toContain("'cgSgspJ2msm6clMCkdW9'");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.set_paige_voice_profile_internal[\s\S]*authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.resolve_paige_voice_profile_internal[\s\S]*authenticated/);
  });

  it("stores only session snapshots and keeps browser roles away from the internal table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.paige_live_sessions");
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.paige_live_sessions FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/\b(raw_audio|audio_blob|transcript)\s+(text|bytea|jsonb)\b/i);
    expect(sql).toContain("'raw_audio_stored',false");
    expect(sql).toContain("'durable_memory_written',false");
  });

  it("requires a fresh provider-reference verification receipt", () => {
    expect(sql).toContain("PAIGE_VOICE_PROFILE_UNVERIFIED");
    expect(sql).toContain("provider_verification_receipt_ref");
    expect(sql).toContain("interval '5 minutes'");
  });

  it("returns no provider identity from the write seam and snapshots a revision for new sessions", () => {
    expect(sql).toMatch(/'paige_facing_name',\s*_paige_facing_name/);
    expect(sql).toMatch(/'revision',\s*_revision/);
    expect(sql).toContain("_session_started_at");
  });
});
