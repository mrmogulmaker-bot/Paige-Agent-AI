import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260902004019_paige_spine_foundation.sql"), "utf8");

function spineSqlFindings(sql: string): string[] {
  const required = [
    "create or replace function public.get_pipeline_spine_evidence",
    "security definer",
    "v_uid uuid := auth.uid()",
    "v_tenant uuid := public.current_user_tenant_id()",
    "public.has_any_role(v_uid, array['admin','super_admin','coach'])",
    "e.tenant_id = v_tenant",
    "upper(c.account_number) = upper(btrim(p_client_ref))",
    "e.event_kind = 'owner.crm_mutation'",
    "e.surface = 'campaigns_pipeline'",
    "e.ref_table = 'deals'",
    "e.payload->>'policy_result' = 'allowed'",
    "e.occurred_at >= now() - interval '365 days'",
    "revoke all on function public.get_pipeline_spine_evidence(text,integer) from public, anon, service_role",
    "grant execute on function public.get_pipeline_spine_evidence(text,integer) to authenticated",
  ];
  return required.filter((needle) => !sql.toLowerCase().includes(needle));
}

describe("Pipeline Spine SQL evidence boundary", () => {
  it("is a hardened RPC-only lens with server tenant and staff gates", () => {
    expect(spineSqlFindings(migration)).toEqual([]);
    expect(migration).toContain("if v_uid is null or v_tenant is null then return; end if;");
    expect(migration).toContain("least(greatest(coalesce(p_limit, 50), 1), 100)");
    expect(migration).not.toMatch(/grant\s+select\s+on\s+public\.paige_client_events\s+to\s+authenticated/i);
  });

  it("returns a fixed safe envelope and never raw Rail content", () => {
    const returnsBlock = migration.match(/returns table\s*\(([\s\S]*?)\)\s*language/i)?.[1] ?? "";
    for (const field of [
      "signal_id uuid", "kind text", "tenant_id uuid", "subject_ref text",
      "safe_summary text", "source_record_ref text", "availability text",
      "classification text", "lifecycle text", "facts jsonb",
      "expires_at timestamptz", "outcome_ref text",
    ]) expect(returnsBlock.toLowerCase()).toContain(field);
    const fields = returnsBlock.toLowerCase().split("\n").map((line) => line.trim().replace(/,$/, ""));
    for (const forbidden of ["title text", "summary text", "payload jsonb", "actor_user_id uuid", "ref_id uuid"]) expect(fields).not.toContain(forbidden);
    expect(migration).not.toContain("e.title");
    expect(migration).not.toContain("e.summary");
    expect(migration).not.toContain("e.payload,");
  });

  it("mutation proof detects removal of tenant, role, and allowlist guards", () => {
    expect(spineSqlFindings(migration.replace("e.tenant_id = v_tenant", "true"))).toContain("e.tenant_id = v_tenant");
    expect(spineSqlFindings(migration.replace("public.has_any_role(v_uid, array['admin','super_admin','coach'])", "true"))).toContain("public.has_any_role(v_uid, array['admin','super_admin','coach'])");
    expect(spineSqlFindings(migration.replace("e.payload->>'policy_result' = 'allowed'", "true"))).toContain("e.payload->>'policy_result' = 'allowed'");
  });
});
