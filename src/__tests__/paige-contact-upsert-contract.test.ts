import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PAIGE contact upsert contract", () => {
  it("binds confirmation to the client reference and every writable patch field", () => {
    const confirmation = readFileSync("supabase/functions/_shared/toolConfirmation.ts", "utf8");
    const binding = confirmation.slice(confirmation.indexOf("crm_update_contact:"), confirmation.indexOf("n8n_delete_workflow:"));
    expect(binding).toContain('"client_ref"');
    for (const field of ["website", "linkedin_url", "street_address", "tags", "assigned_coach_user_id", "do_not_contact"]) {
      expect(binding).toContain(`"${field}"`);
    }
    const summaryStart = chat.indexOf('case "crm_update_contact": {');
    const summary = chat.slice(summaryStart, chat.indexOf('case "crm_delete_contact"', summaryStart));
    expect(summary).toContain('a?.client_ref');
    expect(summary).toContain('Object.keys(labels)');
  });

  it("uses the tenant-scoped assignee roster and enforces it again at the database seam", () => {
    const editor = readFileSync("src/components/tenant-relationships/PeopleContactEditor.tsx", "utf8");
    const migration = readFileSync("supabase/migrations/20260901035325_solo_people_contact_upsert_hotfix.sql", "utf8");
    expect(editor).toContain('rpc("get_tenant_assignable_members")');
    expect(editor).not.toContain('.from("user_roles")');
    expect(migration).toContain("CONTACT_ASSIGNEE_FORBIDDEN");
    expect(migration).toContain("FROM public.tenant_members AS tm");
    expect(migration).toContain("tm.tenant_id = _tenant");
    expect(migration).toContain("tm.status = 'active'");
    expect(migration).toContain("public.has_any_role(tm.user_id, ARRAY['admin','super_admin','coach'])");
    expect(migration).toContain("FROM PUBLIC, anon, service_role");
  });

  it("never turns New contact into an implicit overwrite and displays company-only businesses by company", () => {
    const migration = readFileSync("supabase/migrations/20260901035325_solo_people_contact_upsert_hotfix.sql", "utf8");
    const mapper = readFileSync("src/components/tenant-relationships/useTenantRelationshipsData.ts", "utf8");
    expect(migration).not.toContain("lower(c.email) = lower(_email)");
    expect(mapper).toContain("if (company && (Boolean(row.entity_type?.trim()) || !full)) return company;");
  });

  const chat = readFileSync(resolve("supabase/functions/paige-ai-chat/index.ts"), "utf8");

  it("offers the same owner-editable profile fields through governed chat", () => {
    const tool = chat.slice(chat.indexOf('name: "crm_update_contact"'), chat.indexOf('name: "crm_delete_contact"'));
    for (const field of [
      "entity_type", "website", "linkedin_url", "street_address", "city", "state", "zip_code",
      "source", "tags", "do_not_contact",
    ]) expect(tool).toContain(field);
    expect(tool).toContain("new_lead");
    expect(tool).toContain("client_active");
  });

  it("executes chat edits through the tenant-pinned shared upsert RPC", () => {
    const start = chat.lastIndexOf('} else if (tc.function.name === "crm_update_contact")');
    const handler = chat.slice(start, chat.indexOf('} else if (tc.function.name === "propose_business_brief_update")', start));
    expect(handler).toContain('rpc("upsert_contact"');
    expect(handler).toContain("resolveClientReference(admin, crmTenantId, args.client_ref)");
    expect(handler).toContain("p_contact_id: contactId");
    expect(handler).toContain("p_tenant_id: crmTenantId");
    expect(handler).toContain("p_actor_user_id: user.id");
    expect(handler).toContain("client_ref: args.client_ref");
    expect(handler).not.toContain("args.contact_id");
    expect(handler).not.toContain('rpc("update_contact"');
  });
});
