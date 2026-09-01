import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901140000_solo_team_access_profiles.sql"),
  "utf8",
);

describe("Solo Team access-profile migration", () => {
  it("stores only tenant-scoped Admin and Member profiles and keeps Owner fixed", () => {
    expect(sql).toContain("tenant_id uuid NOT NULL");
    expect(sql).toContain("permission public.tenant_role NOT NULL");
    expect(sql).toContain("permission IN ('admin'::public.tenant_role, 'member'::public.tenant_role)");
    expect(sql).toContain("Owner access is fixed");
  });

  it("derives actor and tenant server-side and permits only the current tenant owner to save", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("current_user_tenant_id()");
    expect(sql).toContain("is_tenant_owner(_actor, _tenant)");
    expect(sql).not.toMatch(/set_solo_team_access_profile\s*\(\s*_tenant_id/i);
  });

  it("enforces role ceilings in the database and rejects stale writes", () => {
    expect(sql).toContain("solo_team_access_ceiling");
    expect(sql).toContain("access level exceeds the role ceiling");
    expect(sql).toContain("access profile changed since it was loaded");
    expect(sql).toContain("FOR UPDATE");
  });

  it("returns effective access to Team and Paige without accepting tenant or user selectors", () => {
    expect(sql).toContain("get_solo_team_access_profiles()");
    expect(sql).toContain("get_current_solo_access()");
    expect(sql).toContain("get_paige_team_context()");
    expect(sql).not.toMatch(/get_current_solo_access\s*\([^)]*_tenant/i);
    expect(sql).not.toMatch(/get_paige_team_context\s*\([^)]*_tenant/i);
  });

  it("keeps direct table access closed and records attributable before/after audit evidence", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.solo_team_access_profiles FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("'before'");
    expect(sql).toContain("'after'");
    expect(sql).toContain("'version'");
  });
});
