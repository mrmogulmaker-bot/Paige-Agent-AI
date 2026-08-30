import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/solo/marketplace.tsx"), "utf8");

describe("Solo Marketplace recovery contract", () => {
  it("preserves the four discovery and management tabs", () => {
    expect(source).toMatch(/Today[\s\S]*Browse[\s\S]*Installed[\s\S]*Updates/);
  });

  it("removes fixture catalogue and simulated entitlement behavior", () => {
    expect(source).not.toMatch(/(?:const|export const)\s+(?:MK|FEAT)\b|setInterval|setTimeout|Installing|already using it/i);
    expect(source).not.toMatch(/Editors.? pick|Most installed|Top charts|Recommended for you|ratings?|customer reviews?/i);
  });

  it("contains no Marketplace mutation or unsafe detail seam", () => {
    expect(source).not.toMatch(/marketplace_item_detail|marketplace_install|marketplace_uninstall|checkout|start a listing/i);
    expect(source).not.toMatch(/onClick={[^}]*\b(install|update|remove|purchase|activate|publish|execute)\b/i);
    expect(source).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.delete\(/);
  });

  it("uses the existing PAIGE workspace without mounting another one", () => {
    expect(source).toContain("expandRail");
    expect(source).not.toMatch(/SoloPaigeWorkspace|AgentRail|paige-ai-chat|paige-mcp/);
  });
});
