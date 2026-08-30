import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/solo/growth2.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/solo/solo-campaigns.css"), "utf8");
const adapter = readFileSync(resolve(process.cwd(), "src/solo/useSoloCampaigns.ts"), "utf8");

describe("Solo Campaigns approved contract", () => {
  it("renders exactly the approved six tabs in order", () => {
    const tabBlock = /const tabs=\[([\s\S]*?)\];/.exec(source)?.[1] ?? "";
    expect([...tabBlock.matchAll(/\['([^']+)','([^']+)'/g)].map((match) => match.slice(1, 3))).toEqual([
      ["ov", "Overview"],
      ["catalog", "Catalog"],
      ["sales", "Sales"],
      ["pipeline", "Pipeline"],
      ["social", "Social"],
      ["performance", "Performance"],
    ]);
    expect(tabBlock).not.toMatch(/Active|Brand Kit|Pages|Funnels|Forms|Builders/);
  });

  it("keeps creative ownership in the existing generic Vibe Studio seam", () => {
    expect(source).toContain("detail:{returnFocus:event.currentTarget}");
    expect(source).toContain("data-solo-vibe-studio-launcher");
    expect(source).toContain(">Vibe Studio</button>");
    expect(source).not.toMatch(/initialSection|assetId|studioMode|returnRoute/);
    expect(source).not.toMatch(/New campaign|New post|New form|Publish now|Edit creative/);
  });

  it("owns truthful compatibility landings for every retired creative address", () => {
    for (const slug of ["brand-kit", "pages", "funnels", "forms", "builders"]) {
      expect(source).toMatch(new RegExp(`(?:"${slug}"|\\b${slug}:)`));
    }
    expect(source).toContain("This address moved");
    expect(source).toContain("Return to Catalog");
    expect(source).toContain("Your workspace and account stay selected");
  });

  it("does not render the retired Campaigns fixture data", () => {
    expect(source).not.toContain("DATA.campaigns");
    expect(source).not.toContain("DATA.pipeline");
    expect(source).not.toContain("$8,400");
    for (const label of ["LIVE", "PARTIAL", "UNAVAILABLE", "PROPOSED"]) expect(source).toContain(label);
  });

  it("fails closed on tenant identity and contains read-only tenant filters", () => {
    expect(adapter).toContain("accountContextLoading");
    expect(adapter).toContain("if (!activeTenantId)");
    expect(adapter.match(/\.eq\("tenant_id", activeTenantId\)/g)).toHaveLength(6);
    expect(adapter).not.toContain('functions.invoke("tenant-campaigns"');
    expect(adapter).toContain('from("growth_form_automations")');
    expect(adapter).toContain('from("growth_submission_dispatches")');
    expect(adapter).toContain("if (!current) return");
    expect(adapter).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("contains keyboard, reduced-motion, forced-colors, and overflow safeguards", () => {
    expect(source).toContain("event.key === \"Escape\"");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('setAttribute("inert", "")');
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("forced-colors");
    expect(css).toContain("overflow-x: clip");
  });

  it("keeps Campaigns navigation and heading bands on the shared theme canvas", () => {
    expect(css).toMatch(/\.solo-campaigns\{[^}]*background:var\(--pg-canvas\)/);
    expect(css).toMatch(/\.campaigns-nav\{[^}]*background:var\(--pg-canvas\)/);
    expect(css).toMatch(/\.campaigns-scroll>\.pg-hd\{[^}]*background:transparent/);
  });
});
