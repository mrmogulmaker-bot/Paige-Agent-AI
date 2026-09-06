import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const sql=read("supabase/migrations/20260905221203_business_mission_foundation.sql");

describe("Business Mission durable contract",()=>{
  it("resolves the current top-level Solo tenant through the canonical multi-owner predicate",()=>{
    expect(sql).toContain("t:=public.current_user_tenant_id()");
    expect(sql).toContain("x.account_type='standalone'");
    expect(sql).toContain("x.parent_tenant_id is null");
    expect(sql).toContain("public.is_tenant_owner(a,t)");
    expect(sql).not.toContain("m.owner_user_id=a");
    expect(sql).not.toContain("m.role='owner'");
  });
  it("keeps all three Mission tables out of direct browser access",()=>{
    expect(sql.match(/enable row level security/g)?.length).toBe(3);
    expect(sql).toContain("public.business_mission_mutation_receipts from public,anon,authenticated");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all).*authenticated/i);
  });
  it("serializes duplicate delivery and rejects absent or stale revisions",()=>{
    expect(sql).toContain("unique (tenant_id,actor_user_id,request_key)");
    expect(sql).toContain("on conflict do nothing");
    expect(sql).toContain("r.result||jsonb_build_object('replayed',true)");
    expect(sql).toContain("p_expected_revision is null or p_expected_revision<1");
    expect(sql).toContain("m.revision is distinct from p_expected_revision");
    expect(sql).toContain("for update");
  });
  it("requires coherent owner-chat provenance and never wires Rail",()=>{
    expect(sql).toContain("p_request_source='paige_chat' and p_request_thread_id is null");
    expect(sql).toContain("ct.contact_id is null");
    expect(sql).toContain("ct.tenant_id=t and ct.caller_user_id=a and ct.lens='coach'");
    expect(sql).not.toMatch(/rail_event|rail_write|activity_rail/i);
    expect(read("supabase/functions/_shared/action-risk.ts")).toMatch(/mission_create[\s\S]{0,200}"high"/);
  });
  it("keeps briefs immutable and arrays bounded",()=>{
    expect(sql).toContain("business_mission_brief_immutable");
    expect(sql).toContain("MISSION_BRIEF_IMMUTABLE");
    expect(sql).toContain("business_mission_text_array_valid(constraints,30,600)");
    expect(sql).not.toContain("business_mission_evidence_refs");
    expect(sql).not.toContain("linked_plan_id");
  });
  it("keeps the presentation seam limited to typed projections and server RPCs",()=>{
    const types=read("src/types/businessMission.ts");
    expect(types).toContain("BusinessMissionSummary");
    expect(types).toContain("BusinessMissionDetail");
    expect(types).not.toMatch(/className|CSSProperties|ReactNode|useQuery/);
    expect(read("supabase/functions/_shared/paige-spine/domains/business_mission.ts"))
      .toContain("/solo/:account/command-center/business-game-plan");
  });
  it("requires honest close-out, permits blocked closure, and records safe audit attribution",()=>{
    expect(sql).toContain("MISSION_OUTCOME_REQUIRED");
    expect(sql).toContain("closure_outcome is not null and outcome_summary is not null");
    expect(sql).toContain("m.lifecycle_state='blocked' and p_to_state in ('active','paused','completed','stopped')");
    expect(sql).toContain("m.lifecycle_state='paused' and p_to_state in ('active','completed','stopped')");
    expect(sql).toContain("business_mission.transitioned");

    expect(read("supabase/functions/paige-ai-chat/index.ts")).toContain("replayed_no_change");
  });
});
