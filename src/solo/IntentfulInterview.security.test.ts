import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Intentful Interview security contract", () => {
  it("keeps workflow state outside Memory and denies browser table writes", () => {
    const migration = source("supabase/migrations/20260907033040_paige_intentful_interview_mvp.sql");
    expect(migration).toContain("revoke all on public.paige_intentful_interview_sessions from public, anon, authenticated");
    expect(migration).toContain("public.current_user_tenant_id()");
    expect(migration).toContain("public.paige_interview_assert_thread");
    expect(migration).toContain("p_selected_ids text[]");
    expect(migration).toContain("perform public.record_capability_run");
    expect(migration).not.toContain("record_paige_memory");
    expect(migration).not.toContain("client_memory");
    expect(migration).not.toContain("paige_owner_memory");
  });

  it("uses the Action Bus for topic-specific defer and suppression", () => {
    const migration = source("supabase/migrations/20260907033040_paige_intentful_interview_mvp.sql");
    expect(migration).toContain("'owner.discussion_needed'");
    expect(migration).toContain("'blocked'");
    expect(migration).toContain("clock_timestamp()+interval '7 days'");
    expect(migration).toContain("result=jsonb_build_object('suppressed',true,'topic_key'");
    expect(migration).toContain("payload->>'source_id'=p_mission_id::text");
  });

  it("blocks legacy automatic memory writes for selected-play working turns", () => {
    const chat = source("supabase/functions/paige-ai-chat/index.ts");
    expect(chat).toContain("const skipScopedMemoryWrites = clientScopeDenied || Boolean(payloadBusinessMissionAsk);");
    expect(chat).toContain("matched && !clientScopeDenied && !payloadBusinessMissionAsk");
    expect(chat).toContain('z.enum(["plan_with_paige", "resolve_missing_information"])');
  });
});
