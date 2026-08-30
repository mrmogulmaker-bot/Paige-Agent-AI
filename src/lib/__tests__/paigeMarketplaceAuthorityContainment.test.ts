import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalDirectFunctionName,
  isMarketplaceDirectFunctionBlocked,
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
  it("exposes only curated Marketplace browse to Chat and MCP", () => {
    for (const source of [chat, mcp]) {
      expect(source).toContain("marketplace_browse");
      for (const tool of prohibitedTools) expect(source).not.toContain(tool);
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
    for (const tool of prohibitedTools) expect(autonomy).not.toContain(tool);

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
