import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// Resolved by SUFFIX rather than by a pinned version. This migration has now been renumbered
// twice as main and a sibling branch took its number in turn, and a hard-coded path turns every
// renumber into an unrelated red test that says "file not found" instead of anything useful.
// Exactly one match is asserted, so a duplicate copy of this migration is still caught here
// rather than at deploy, where a reused version is silently skipped.
const migrationMatches = readdirSync(resolve(process.cwd(), "supabase/migrations")).filter((name) =>
  name.endsWith("_solo_zapier_api_mcp_and_skool_intake.sql"),
);
const migrationPath = `supabase/migrations/${migrationMatches[0] ?? "__missing__"}`;
const readMigration = () => {
  expect(migrationMatches).toHaveLength(1);
  return read(migrationPath);
};

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
    const sql = readMigration();
    expect(api).toContain('["cancel", "disconnect", "oauth_refuse", "provision_intake_route"]');
    expect(api).toContain("retainedRefresh");
    expect(api).toContain("String(data.refresh_token)");
    expect(api).toContain("_expected_generation: expectedGeneration");
    expect(api).toContain("null, String(data.generation)");
    expect(api).toContain('.eq("tenant_id", tenantId).in("status", ["pending", "exchanging"])');
    expect(api).toContain('admin.rpc("zapier_api_begin_oauth"');
    expect(sql).toContain("tenant_zapier_api_one_active_oauth");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("FUNCTION public.zapier_api_begin_oauth");
  });
  it("makes OAuth finalization and local disconnect transactional", () => {
    const api = read("supabase/functions/tenant-zapier-api-connect/index.ts");
    const sql = readMigration();
    expect(api).toContain('_attempt: attemptId');
    expect(api).toContain('admin.rpc("zapier_api_disconnect"');
    expect(sql).toContain("status='exchanging' AND expires_at>clock_timestamp()");
    expect(sql).toContain("FUNCTION public.zapier_api_disconnect");
    expect(api).toContain('admin.rpc("zapier_api_record_check"');
    expect(api).toContain('_generation: result.generation');
    expect(api).toContain('error: "rail_unavailable"');
    expect(sql).toContain("FUNCTION public.zapier_api_record_check");
    expect(sql).toContain("tenant_id=_tenant AND generation=_generation");
    expect(sql).toContain("tenant_id=_tenant AND generation=_expected_generation");
    expect(sql).toContain("ZAPIER_GRANT_STALE");
    expect(sql).toContain("FUNCTION public.set_tenant_zapier_mcp_connection");
    expect(sql).toContain("auth_kind='oauth'");
    expect(sql).toContain("auth_header_name=NULL");
    expect(sql).toContain("approved_capabilities='[]'::jsonb");
    expect(sql).toContain("capability_pins='{}'::jsonb");
    expect(sql).toContain("tools_cache=NULL");
    expect(sql).toContain("'auth_kind','oauth'");
  });
  it("binds inbound routes on the server and deduplicates per tenant", () => {
    const intake = read("supabase/functions/zapier-skool-intake/index.ts");
    const sql = readMigration();
    const api = read("supabase/functions/tenant-zapier-api-connect/index.ts");
    expect(intake).toContain("route_token_hash");
    expect(intake).not.toMatch(/body\.(tenant_id|tenantId)/);
    expect(intake).toContain("idempotency_key");
    expect(intake).toContain("req.body.getReader()");
    expect(intake).toContain("total > MAX_BYTES");
    expect(intake).not.toContain("await req.text()");
    expect(sql).toMatch(/UNIQUE\s*\(tenant_id,\s*route_id,\s*idempotency_key\)/i);
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL");
    expect(sql).toContain("SELECT tm.user_id INTO operator_id");
    expect(sql).toContain("operator_id,r.tenant_id,'integration'");
    expect(sql).not.toContain("contact:=public.create_contact");
    expect(sql).toContain("c.tenant_id=r.tenant_id AND lower(btrim(c.email))=email");
    expect(sql).toContain("INSERT INTO public.clients(first_name,last_name,email,phone");
    expect(sql).toContain("EXCEPTION WHEN unique_violation");
    expect(sql).toContain("FUNCTION public.zapier_intake_route_create");
    expect(sql).toContain("route_token_hash");
    expect(api).toContain("route_token: routeToken");
    expect(api).toContain("one_time_secret: true");
    const ui = read("src/solo/settings-integrations.tsx");
    expect(ui).not.toContain("route_token");
    expect(ui).not.toContain("x-paige-route-token");
  });
  it("records bounded outcomes in Rail", () => {
    const sql = readMigration();
    expect(sql).toContain("existing.status='failed'");
    expect(sql).toContain("'ok',false,'outcome','failed'");
    expect(sql).toContain("zapier_api_test_succeeded");
    expect(sql).toContain("zapier_api_test_failed");
    expect(sql).toContain("zapier_api_oauth_refused");
    expect(sql).toContain("Zapier API authorization declined");
    expect(sql).toContain("FUNCTION public.get_zapier_rail_activity");
    expect(sql).toContain("w.source_kind IN ('zapier_api_oauth','zapier_api_connection','zapier_mcp_connection','zapier_skool_intake')");
    const ui = read("src/solo/settings-integrations.tsx");
    expect(ui).toContain('rpc("get_zapier_rail_activity",{p_limit:5})');
    expect(ui).not.toContain('rpc("get_solo_rail_activity",{p_limit:50})');
    expect(sql).toContain("zapier_mcp_test_succeeded");
    expect(sql).toContain("zapier_mcp_test_failed");
    expect(sql).toContain("zapier_skool_intake_received");
    expect(sql).toContain("zapier_skool_intake_duplicate");
    expect(sql).not.toMatch(/provider_payload|raw_payload/);
  });
  it("routes the PAIGE connection test through the governed existing tool", () => {
    const chat = read("supabase/functions/paige-ai-chat/index.ts");
    const wrapper = read("supabase/functions/call-zapier-action/index.ts");
    const sql = readMigration();
    expect(chat).not.toContain('name: "zapier_connection_test"');
    expect(chat).toContain("When the owner asks for a Zapier connection test, use zapier_list_actions");
    expect(wrapper).toContain('admin.rpc("record_zapier_mcp_connection_test"');
    expect(wrapper).toContain('error: "rail_unavailable"');
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.record_zapier_mcp_connection_test");
    expect(sql).toContain("TO service_role");
  });
  it("persists denied OAuth before reporting it", () => {
    const callback = read("src/pages/ZapierOAuthCallback.tsx");
    const api = read("supabase/functions/tenant-zapier-api-connect/index.ts");
    const sql = readMigration();
    expect(callback).toContain('action:"oauth_refuse",state');
    expect(api).toContain('admin.rpc("zapier_api_refuse"');
    expect(sql).toContain("status='refused'");
    expect(sql).toContain("'zapier_api_oauth',attempt_id,0,'zapier_api_oauth_refused'");
  });
  it("distinguishes refresh rejection from transient provider failure", () => {
    const api = read("supabase/functions/tenant-zapier-api-connect/index.ts");
    expect(api).toContain('oauthError === "invalid_grant"');
    expect(api).toContain('oauthError === "invalid_client" ? "configuration"');
    expect(api).toContain('response.status === 429 || response.status >= 500');
    expect(api).toContain('next.kind === "authorization" ? "authorization_expired"');
    expect(api).toContain('next.kind === "provider" ? "provider_unavailable"');
  });
  it("clears the cross-tenant contact collision the intake insert would hit", () => {
    const sql = readMigration();
    // The creator-wide index spans tenants, so an operator who already holds this email in
    // another workspace makes every delivery fail contact_write_failed. The tenant-scoped
    // uq_clients_tenant_email (20260817010000) keeps same-tenant duplicates blocked.
    expect(sql).toContain("DROP INDEX IF EXISTS public.clients_created_by_email_unique;");
    expect(sql).toContain("WHERE c.tenant_id=r.tenant_id AND lower(btrim(c.email))=email");
  });
  it("keeps the duplicate-email message once the tenant-scoped index is the one that raises", () => {
    for (const surface of [
      "src/components/dashboard/AddInternalClientDialog.tsx",
      "src/components/dashboard/ClientManagementDashboard.tsx",
    ]) {
      expect(read(surface)).toContain('msg.includes("uq_clients_tenant_email")');
    }
  });
  it("pins the authority a capability was approved with, not only its input schema", () => {
    const client = read("supabase/functions/_shared/mcp-client.ts");
    const outcome = read("supabase/functions/_shared/mcp-outcome.ts");
    const connect = read("supabase/functions/tenant-mcp-connect/index.ts");
    const n8n = read("supabase/functions/_shared/n8n-oauth.ts");
    expect(client).toContain("export async function fingerprintAuthority");
    expect(client).toContain("export async function fingerprintCapability");
    // Effects are a SET the provider happens to order; reordering must not read as drift.
    expect(client).toContain("[...new Set(a.effects)].sort()");
    expect(outcome).toContain("current.pin !== pinned");
    expect(outcome).not.toContain("current.schemaHash !== pinned");
    expect(connect).toContain("[t.name, t.pin]");
    // n8n's discovery pin MUST stay schema-only: the probe RPC wipes every approved
    // workflow when it moves, so widening it would revoke n8n approvals platform-wide.
    expect(n8n).toContain("search.schemaHash");
  });
});
