import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901150000_solo_paige_team_invitation_context.sql"),
  "utf8",
);

describe("Paige Team invitation context migration", () => {
  it("derives actor and tenant server-side without accepting selectors", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("current_user_tenant_id()");
    expect(sql).not.toMatch(/get_paige_team_context\s*\([^)]*_tenant/i);
  });

  it("exposes invitation lifecycle only to an existing Team manager", () => {
    expect(sql).toContain("_can_manage_invitations");
    expect(sql).toContain("_viewer_role = 'admin'::public.tenant_role");
    expect(sql).toContain("CASE WHEN _can_manage_invitations");
    expect(sql).toContain("WHEN ti.uses > 0 THEN 'accepted'");
    expect(sql).toContain("WHEN ti.revoked_at IS NOT NULL THEN 'revoked'");
    expect(sql).toContain("WHEN ti.expires_at <= now() THEN 'expired'");
    expect(sql).toContain("ELSE 'pending'");
  });

  it("never returns an invitation token and keeps Team authority unchanged", () => {
    expect(sql).not.toMatch(/jsonb_build_object\([^;]*'token'/is);
    expect(sql).toContain("'external_or_permission_changes_require_owner_confirmation', true");
    expect(sql).toContain("'custom_work_identity_changes_authority', false");
  });
});
