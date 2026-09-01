import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901001520_solo_team_workspace.sql"),
  "utf8",
);

describe("Solo Team migration security contract", () => {
  it("derives tenant and actor server-side for every callable function", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("current_user_tenant_id()");
    expect(sql).not.toMatch(/get_solo_team_workspace\s*\(\s*_tenant_id/i);
    expect(sql).not.toMatch(/get_paige_team_context\s*\(\s*_tenant_id/i);
  });

  it("protects owner permission and limits changes to Admin or Member", () => {
    expect(sql).toContain("only the tenant owner may change permission levels");
    expect(sql).toContain("the owner permission cannot be changed here");
    expect(sql).toContain("lower(trim(_new_permission)) NOT IN ('admin', 'member')");
  });

  it("keeps work profile fields out of authorization checks", () => {
    expect(sql).toContain("job_title");
    expect(sql).toContain("responsibilities");
    const permissionFunction = sql.split("CREATE OR REPLACE FUNCTION public.set_solo_team_member_permission")[1]
      .split("CREATE OR REPLACE FUNCTION public.create_solo_team_invite")[0];
    expect(permissionFunction).not.toContain("job_title");
    expect(permissionFunction).not.toContain("responsibilities");
  });

  it("exposes only active confirmed members to Paige and records truncation honestly", () => {
    expect(sql).toContain("get_paige_team_context");
    expect(sql).toContain("tm.status = 'active'");
    expect(sql).toContain("'truncated'");
  });

  it("keeps raw invitation tokens out of the roster response and hardens acceptance", () => {
    expect(sql).toContain("NULL::text AS token");
    expect(sql).toContain("team invitation belongs to a different email address");
    expect(sql).toContain("team invitation has already been accepted");
    expect(sql).toContain("WHERE id = _invite.id AND uses = 0");
    expect(sql).toContain("this account already belongs to the workspace");
    expect(sql).not.toContain("ON CONFLICT (tenant_id, user_id) DO UPDATE");
  });
});
