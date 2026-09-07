import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260907155052_paige_live_conversation_control_plane.sql"),
  "utf8",
);

describe("Paige voice profile SQL contract", () => {
  it("keeps the resolver and writer service-only", () => {
    expect(sql).toMatch(/auth\.role\(\)\s*<>\s*'service_role'/);
    expect(sql).toContain("'cgSgspJ2msm6clMCkdW9'");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.set_paige_voice_profile_internal[\s\S]*authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.activate_paige_voice_profile_internal[\s\S]*authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.resolve_paige_voice_profile_internal[\s\S]*authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.paige_voice_provider_verifications, public\.paige_voice_profiles, public\.paige_voice_readiness, public\.paige_voice_cost_reservations FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toContain("admin_app_settings");
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
    expect(sql).toContain("PAIGE_VOICE_PROFILE_CANONICAL_PROOF_REQUIRED");
    expect(sql).toContain("PAIGE_VOICE_READINESS_CANONICAL_PROOF_REQUIRED");
    expect(sql).toContain("PAIGE_VOICE_PROVIDER_PROOF_OWED");
    expect(sql).toMatch(/NOT _verification\.key_scope_verified[\s\S]*NOT _verification\.voice_authorized[\s\S]*NOT _verification\.retention_policy_approved[\s\S]*NOT _verification\.zero_retention_confirmed[\s\S]*NOT _verification\.quota_verified/);
    expect(sql).toContain("_verification.hard_cost_limit_usd<>_ready.hard_cost_limit_usd");
    expect(sql).toContain("_verification.max_usd_per_1000_chars<>_ready.max_usd_per_1000_chars");
  });

  it("enforces an atomic hard-cost reservation before provider work", () => {
    const costTable = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS public.paige_voice_cost_reservations"), sql.indexOf("ALTER TABLE public.paige_voice_provider_verifications"));
    expect(costTable).toContain("CREATE TABLE IF NOT EXISTS public.paige_voice_cost_reservations");
    expect(costTable).not.toMatch(/actor_user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("_used+_reserve>_ready.hard_cost_limit_usd");
    expect(sql).toContain("PAIGE_VOICE_HARD_COST_LIMIT");
    expect(sql).toContain("state IN ('reserved','committed')");
    expect(sql).toContain("_outcome NOT IN ('committed','released')");
    expect(sql).toMatch(/activate_paige_voice_profile_internal[\s\S]*set_paige_voice_readiness_internal[\s\S]*set_paige_voice_profile_internal/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]*public\.paige_voice_cost_reservations[\s\S]*authenticated/);
  });

  it("rejects approved profiles without a current effective time", () => {
    expect(sql).toContain("PAIGE_VOICE_PROFILE_INVALID_EFFECTIVE_TIME");
    expect(sql).toMatch(/_approved AND \(_effective_at IS NULL OR _effective_at>now\(\)\+interval '1 minute'\)/);
    expect(sql).toMatch(/_profile\.effective_at IS NULL OR _profile\.effective_at>_session_started_at/);
  });

  it("rechecks tenant, thread and epoch for transitions and isolates stale cleanup to end", () => {
    expect(sql).toContain("_session.tenant_id<>_tenant_id OR _session.thread_id<>_thread_id OR _session.context_epoch<>_context_epoch");
    expect(sql).toContain("paige_live_session_end_stale_internal");
    expect(sql).toContain("stale_context_closed");
  });

  it("returns no provider identity from the write seam and snapshots a revision for new sessions", () => {
    expect(sql).toMatch(/'paige_facing_name',\s*_paige_facing_name/);
    expect(sql).toMatch(/'revision',\s*_revision/);
    expect(sql).toContain("_session_started_at");
  });
});
