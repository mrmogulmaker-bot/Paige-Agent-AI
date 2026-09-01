import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function identityMigration(): string {
  const dir = join(root, "supabase", "migrations");
  const name = readdirSync(dir).find((file) => file.endsWith("_client_identity_contract.sql"));
  expect(name, "client identity migration must exist").toBeTruthy();
  return readFileSync(join(dir, name!), "utf8");
}

describe("immutable tenant-scoped client identity contract", () => {
  it("fails closed on tenantless history and makes tenant/reference mandatory", () => {
    const sql = identityMigration();
    expect(sql).toMatch(/historical_client_missing_tenant/i);
    expect(sql).toMatch(/ALTER COLUMN tenant_id SET NOT NULL/i);
    expect(sql).toMatch(/ALTER COLUMN account_number SET NOT NULL/i);
  });

  it("allocates nonsequential CLT references and makes identity immutable", () => {
    const sql = identityMigration();
    expect(sql).toMatch(/CLT-/);
    expect(sql).toMatch(/gen_random_uuid\(\)/i);
    expect(sql).toMatch(/client_identity_immutable/i);
    expect(sql).toMatch(/OLD\.tenant_id IS DISTINCT FROM NEW\.tenant_id/i);
    expect(sql).toMatch(/OLD\.account_number IS DISTINCT FROM NEW\.account_number/i);
  });

  it("server-derives JWT tenant and scopes deduplication to that tenant", () => {
    const sql = identityMigration();
    expect(sql).toMatch(/CASE\s+WHEN auth\.uid\(\) IS NOT NULL[\s\S]*current_user_tenant_id\(\)/i);
    expect(sql).toMatch(/WHERE tenant_id = _tenant[\s\S]*lower\(email\)/i);
  });

  it("gives Paige safe references instead of raw client UUIDs", () => {
    const chat = read("supabase/functions/paige-ai-chat/index.ts");
    expect(chat).toContain("client_ref");
    expect(chat).toContain("resolveClientReference");
    expect(chat).not.toContain("Use to resolve names/emails to client_id");
    expect(chat).not.toMatch(/contacts:\s*data\s*\|\|\s*\[\]/);
  });

  it("keeps MCP contact reads tenant-scoped and metadata-limited", () => {
    const mcp = read("supabase/functions/paige-mcp/index.ts");
    expect(mcp).toContain("client_ref");
    expect(mcp).toContain('.select("account_number, first_name, last_name, email, phone, entity_name');
  });

  it("routes authenticated manual creates through the server contract", () => {
    for (const file of [
      "src/components/admin/contacts/NewContactDialog.tsx",
      "src/components/dashboard/AddInternalClientDialog.tsx",
      "src/components/dashboard/ClientManagementDashboard.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toContain('.rpc("create_contact"');
    }
  });
});
