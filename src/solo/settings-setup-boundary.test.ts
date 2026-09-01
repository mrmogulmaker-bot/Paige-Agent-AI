import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Solo Setup architecture boundary", () => {
  it("stages Paige changes for owner review instead of directly changing business truth", () => {
    const source = readFileSync(path.join(root, "supabase/functions/paige-ai-chat/index.ts"), "utf8");
    const start = source.indexOf('} else if (tc.function.name === "propose_business_brief_update")');
    const end = source.indexOf('} else if (tc.function.name === "update_business_profile")', start);
    const block = source.slice(start, end);

    expect(block).toContain('admin.rpc("stage_solo_business_brief_proposal"');
    expect(block).toContain("persisted: false");
    expect(block).not.toContain('.from("tenants").update');
    expect(block).toContain('owner_confirmation_required: true');
    expect(block).toContain("representativeUserIds");
    expect(source).toContain("Resolve a named representative with crm_list_team");
  });

  it("keeps legacy email configuration out of chat and limits the legacy direct write to brand assets", () => {
    const source = readFileSync(path.join(root, "supabase/functions/paige-ai-chat/index.ts"), "utf8");
    const start = source.indexOf('} else if (tc.function.name === "update_business_profile")');
    const end = source.indexOf('} else if (tc.function.name === "pipeline_create")', start);
    const block = source.slice(start, end);

    expect(block).toContain('configuration_handoff: "connections"');
    expect(block).toContain('const BRAND_KEYS = ["logo_url", "primary_color", "accent_color"]');
    expect(block).toContain('admin.rpc("stage_solo_business_brief_proposal"');
    expect(block).toContain('scope: "brand_assets_only"');
    expect(block).not.toContain('const BRAND_KEYS = ["website"');
  });

  it("keeps representatives Team-backed and records owner saves on the Paige audit rail", () => {
    const migration = readFileSync(path.join(root, "supabase/migrations/20261019000000_solo_setup_business_brief.sql"), "utf8");
    expect(migration).toContain("every business representative must be an active Team member");
    expect(migration).toContain("public.tenant_members");
    expect(migration).toContain("solo_setup.owner_saved");
    expect(migration).toContain("solo_setup.owner_approved_proposal");
    expect(migration).toContain("stage_solo_business_brief_proposal");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("proposal patch must include at least one field");
    expect(migration).toContain("actor is not an active workspace member");
    expect(migration).toContain("tm.status = 'active'");
  });

  it("validates Paige-proposed representatives against active Team membership before staging", () => {
    const migration = readFileSync(path.join(root, "supabase/migrations/20261019010000_solo_setup_representative_proposals.sql"), "utf8");
    expect(migration).toContain("representativeUserIds");
    expect(migration).toContain("every proposed business representative must be an active Team member");
    expect(migration).toContain("public.tenant_members");
    expect(migration).toContain("tm.status = 'active'");
    expect(migration).toContain("to service_role");
  });
});
