import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PAIGE contact upsert contract", () => {
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
