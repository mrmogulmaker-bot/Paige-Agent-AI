import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Solo Zapier API and MCP release contract", () => {
  it("renders two independent card states and two manage tabs", () => {
    const ui = read("src/solo/settings-integrations.tsx");
    expect(ui).toContain("API connection");
    expect(ui).toContain("Paige tools (MCP)");
    expect(ui).toContain('`ig-zapier-tab-${value}`');
    expect(ui).toContain('`ig-zapier-panel-${value}`');
  });
  it("uses provider OAuth with read-only scopes", () => {
    const api = read("supabase/functions/tenant-zapier-api-connect/index.ts");
    expect(api).toContain("https://api.zapier.com/v2/authorize");
    expect(api).toContain("https://zapier.com/oauth/token/");
    expect(api).toMatch(/profile[\s\S]*zap:account:all/);
    expect(api).not.toMatch(/scope[^\n]*(zap:write|zap:all|action:run)/);
    expect(api).toContain("current_user_tenant_id");
    expect(api).toContain("expected_tenant_id");
  });
  it("keeps local cleanup available and preserves non-rotating refresh tokens", () => {
    const api = read("supabase/functions/tenant-zapier-api-connect/index.ts");
    expect(api).toContain('action !== "cancel" && action !== "disconnect"');
    expect(api).toContain("retainedRefresh");
    expect(api).toContain("String(data.refresh_token)");
  });
  it("binds inbound routes on the server and deduplicates per tenant", () => {
    const intake = read("supabase/functions/zapier-skool-intake/index.ts");
    const sql = read("supabase/migrations/20261201000600_solo_zapier_api_mcp_and_skool_intake.sql");
    expect(intake).toContain("route_token_hash");
    expect(intake).not.toMatch(/body\.(tenant_id|tenantId)/);
    expect(intake).toContain("idempotency_key");
    expect(sql).toMatch(/UNIQUE\s*\(tenant_id,\s*route_id,\s*idempotency_key\)/i);
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL");
  });
  it("records bounded outcomes in Rail", () => {
    const sql = read("supabase/migrations/20261201000600_solo_zapier_api_mcp_and_skool_intake.sql");
    expect(sql).toContain("existing.status='failed'");
    expect(sql).toContain("'ok',false,'outcome','failed'");
    expect(sql).toContain("zapier_api_test_succeeded");
    expect(sql).toContain("zapier_api_test_failed");
    expect(sql).toContain("zapier_mcp_test_succeeded");
    expect(sql).toContain("zapier_mcp_test_failed");
    expect(sql).toContain("zapier_skool_intake_received");
    expect(sql).toContain("zapier_skool_intake_duplicate");
    expect(sql).not.toMatch(/provider_payload|raw_payload/);
  });
  it("routes the PAIGE connection test through the governed existing tool", () => {
    const chat = read("supabase/functions/paige-ai-chat/index.ts");
    const wrapper = read("supabase/functions/call-zapier-action/index.ts");
    const sql = read("supabase/migrations/20261201000600_solo_zapier_api_mcp_and_skool_intake.sql");
    expect(chat).not.toContain('name: "zapier_connection_test"');
    expect(chat).toContain("When the owner asks for a Zapier connection test, use zapier_list_actions");
    expect(wrapper).toContain('admin.rpc("record_zapier_mcp_connection_test"');
    expect(wrapper).toContain('error: "rail_unavailable"');
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.record_zapier_mcp_connection_test");
    expect(sql).toContain("TO service_role");
  });
});
