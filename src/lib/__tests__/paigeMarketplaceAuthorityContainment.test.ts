import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalDirectFunctionName,
  isMarketplaceDirectFunctionBlocked,
  retainActiveMarketplaceTenant,
  resolveActiveMarketplaceTenant,
} from "../../../supabase/functions/_shared/marketplace-authority-containment";

const chat = readFileSync(
  resolve(process.cwd(), "supabase/functions/paige-ai-chat/index.ts"),
  "utf8",
);
const mcp = readFileSync(
  resolve(process.cwd(), "supabase/functions/paige-mcp/index.ts"),
  "utf8",
);
const workflowDispatch = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/workflowDispatch.ts"),
  "utf8",
);
const triggerWorkflow = readFileSync(
  resolve(process.cwd(), "supabase/functions/trigger-workflow/index.ts"),
  "utf8",
);

const prohibitedTools = [
  "marketplace_recommend",
  "marketplace_install",
  "marketplace_uninstall",
  "marketplace_my_capabilities",
] as const;

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("PAIGE Marketplace authority containment", () => {
  const tenantA = "11111111-1111-4111-8111-111111111111";
  const tenantB = "22222222-2222-4222-8222-222222222222";

  it("fails Marketplace browse closed unless the current active account is authoritatively resolved", () => {
    expect(resolveActiveMarketplaceTenant({
      activeAccountTenantId: null,
      expectedTenantId: tenantA,
      authorizedTenantIds: [tenantA],
    })).toBeNull();
    expect(resolveActiveMarketplaceTenant({
      activeAccountTenantId: tenantA,
      expectedTenantId: tenantB,
      authorizedTenantIds: [tenantA, tenantB],
    })).toBeNull();
    expect(resolveActiveMarketplaceTenant({
      activeAccountTenantId: tenantA,
      expectedTenantId: tenantA,
      authorizedTenantIds: [tenantB, tenantA],
    })).toBe(tenantA);
    expect(resolveActiveMarketplaceTenant({
      activeAccountTenantId: tenantA,
      expectedTenantId: tenantA,
      authorizedTenantIds: [tenantB],
    })).toBeNull();
    expect(resolveActiveMarketplaceTenant({
      activeAccountTenantId: "not-a-tenant-id",
      expectedTenantId: tenantA,
      authorizedTenantIds: [tenantA],
    })).toBeNull();
  });

  it("uses exact active-account authorization instead of first-membership fallback", () => {
    const chatAccountResolution = between(
      chat,
      "const resolveCurrentMarketplaceTenant",
      "// ── §16 department registry",
    );
    const mcpAccountResolution = between(
      mcp,
      "async function marketplaceActorTenantId()",
      "// ── Tier derivation",
    );
    const chatMarketplace = between(
      chat,
      'tc.function.name === "marketplace_browse"',
      'tc.function.name === "search_funding_marketplace"',
    );
    const mcpMarketplace = between(
      mcp,
      'mcp.tool("marketplace_browse"',
      "// ============================================================================\n// Stage Automation Rules",
    );
    expect(chatMarketplace).toContain("marketplaceTenantId");
    expect(chatMarketplace).toContain("await resolveCurrentMarketplaceTenant()");
    expect(chatMarketplace).toContain("retainActiveMarketplaceTenant");
    expect(chatMarketplace).not.toContain("personaCtx.tenant_id");
    expect(mcpMarketplace).toContain("marketplaceActorTenantId");
    expect(mcpMarketplace).not.toContain("await actorTenantId()");
    expect(chatMarketplace.match(/resolveCurrentMarketplaceTenant\(\)/g)).toHaveLength(2);
    expect(mcpMarketplace.match(/marketplaceActorTenantId\(\)/g)).toHaveLength(2);
    for (const resolution of [chatAccountResolution, mcpAccountResolution]) {
      expect(resolution).toContain('.eq("tenant_id", structurallyCurrentTenant)');
      expect(resolution).toContain('.eq("status", "active")');
      expect(resolution).not.toContain(".limit(1)");
    }
  });

  it("rejects an account switch or membership revocation before browse dispatch", () => {
    expect(retainActiveMarketplaceTenant(tenantA, tenantB)).toBeNull();
    expect(retainActiveMarketplaceTenant(tenantA, null)).toBeNull();
    expect(retainActiveMarketplaceTenant(tenantA, tenantA)).toBe(tenantA);
  });

  it("exposes only curated Marketplace browse to Chat and MCP", () => {
    expect(mcp).toContain('from "https://esm.sh/@supabase/supabase-js@2.45.0"');
    expect(mcp).not.toContain('from "npm:@supabase/supabase-js');
    expect(mcp).toContain('from "https://esm.sh/zod@3.25.76"');
    expect(mcp).not.toContain('from "npm:zod');
    expect(mcp).toContain('import type {} from "https://esm.sh/@types/node@22.15.15/index.d.ts"');
    expect(mcp).toContain('from "https://esm.sh/hono@4.13.5"');
    expect(mcp).toContain('from "https://esm.sh/mcp-lite@0.10.0"');
    expect(mcp).not.toContain('from "npm:');
    expect(mcp).toContain('Legacy send_sms stays fail-closed until governed outbound authorization exists.');
    expect(mcp).not.toContain('Authorization: authHeader');
    expect(chat).toContain('name: "marketplace_browse"');
    expect(mcp).toContain('mcp.tool("marketplace_browse"');
    for (const tool of prohibitedTools) {
      expect(chat).not.toContain(`name: "${tool}"`);
      expect(chat).not.toContain(`tc.function.name === "${tool}"`);
      expect(mcp).not.toContain(`mcp.tool("${tool}"`);
    }
  });

  it("leaves no Marketplace mutation or checkout sink reachable from Chat or MCP", () => {
    for (const source of [chat, mcp]) {
      expect(source).not.toContain('functions.invoke("marketplace-install"');
      expect(source).not.toContain('rpc("install_marketplace_item"');
      expect(source).not.toContain('rpc("uninstall_marketplace_item"');
      expect(source).not.toContain("marketplace-checkout-session");
    }
  });

  it("blocks indirect Marketplace Edge Function dispatch for new and existing workflows", () => {
    expect(mcp).toContain("isMarketplaceDirectFunctionBlocked");
    expect(mcp).toMatch(/provider === "direct_edge_function"[\s\S]*isMarketplaceDirectFunctionBlocked/);

    const directDispatch = between(
      workflowDispatch,
      'if (provider === "direct_edge_function")',
      'const url = `${SUPABASE_URL}/functions/v1/${directFunctionName}`',
    );
    expect(directDispatch).toContain("canonicalDirectFunctionName(opts.directFunctionName)");
    expect(directDispatch).toContain("isMarketplaceDirectFunctionBlocked(directFunctionName)");
    expect(directDispatch).toContain("direct_function_not_allowed");

    const authenticatedDispatch = between(
      triggerWorkflow,
      'registry.provider === "direct_edge_function"',
      "const { data: run",
    );
    expect(triggerWorkflow).toContain("isMarketplaceDirectFunctionBlocked");
    expect(authenticatedDispatch).toContain("direct_function_not_allowed");

    for (const allowed of ["send-message", "credit-verification-initiate"]) {
      expect(canonicalDirectFunctionName(allowed)).toBe(allowed);
      expect(isMarketplaceDirectFunctionBlocked(allowed)).toBe(false);
    }
    for (const blocked of ["marketplace", "marketplace-install", "marketplace-checkout-session"]) {
      expect(canonicalDirectFunctionName(blocked)).toBe(blocked);
      expect(isMarketplaceDirectFunctionBlocked(blocked)).toBe(true);
    }
    for (const blockedAlias of [
      "Marketplace-Install",
      "marketplace_install",
      "marketplace%2dinstall",
      "marketplace%252dinstall",
      "../marketplace-install",
      "..\\marketplace-install",
      "safe/../marketplace-install",
      "marketplace-install?mode=auto",
      "marketplace-install#confirm",
      "marketplace–install",
      " marketplace-install",
    ]) {
      expect(canonicalDirectFunctionName(blockedAlias)).toBeNull();
      expect(isMarketplaceDirectFunctionBlocked(blockedAlias)).toBe(true);
    }
  });

  it("cannot restore Marketplace mutation through generic auto or confirm policy", () => {
    const autonomy = between(
      chat,
      "const MUTATING_TOOLS",
      "const TOOL_LABELS",
    );
    // Install/remove remain fail-safe mutation tombstones, but have no registered
    // schema or dispatch branch for either `auto` or confirmed execution to reach.
    expect(autonomy).toContain('"marketplace_install"');
    expect(autonomy).toContain('"marketplace_uninstall"');
    expect(autonomy).not.toContain("marketplace_recommend");
    expect(autonomy).not.toContain("marketplace_my_capabilities");

    const chatMarketplace = between(
      chat,
      'name: "marketplace_browse"',
      'name: "web_search"',
    );
    const mcpMarketplace = between(
      mcp,
      'mcp.tool("marketplace_browse"',
      "// ============================================================================\n// Stage Automation Rules",
    );
    expect(chatMarketplace).not.toContain("confirm");
    expect(mcpMarketplace).not.toContain("confirm");
  });

  it("projects only safe identity, category, and explicit availability to the model", () => {
    const chatDispatch = between(
      chat,
      'tc.function.name === "marketplace_browse"',
      'tc.function.name === "search_funding_marketplace"',
    );
    const mcpBrowse = between(
      mcp,
      'mcp.tool("marketplace_browse"',
      "// ============================================================================\n// Stage Automation Rules",
    );

    for (const browse of [chatDispatch, mcpBrowse]) {
      expect(browse).toContain('availability: "listed_for_workspace"');
      expect(browse).toContain("does not prove installability, entitlement, connection, or runtime readiness");
      expect(browse).not.toMatch(/\bi\.(tagline|description|price_cents|pricing_model|manifest|installed|install_status|refcount|recommendation)\b/);
      expect(browse).not.toMatch(/\b(tagline|price_cents|pricing_model|manifest|installed|install_status|refcount|recommendation):/);
    }

    expect(chatDispatch).toContain('supabase.rpc("marketplace_catalog_for_tenant"');
    expect(chatDispatch).toContain("_actor_user_id: user.id");
    expect(chatDispatch).not.toContain('supabaseClient.rpc("marketplace_catalog_for_tenant"');
    expect(mcpBrowse).toContain("_actor_user_id: actorUserId");
  });
});
