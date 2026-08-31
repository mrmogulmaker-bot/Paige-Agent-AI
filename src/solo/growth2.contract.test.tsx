import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/solo/growth2.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/solo/solo-campaigns.css"), "utf8");
const adapter = readFileSync(resolve(process.cwd(), "src/solo/useSoloCampaigns.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831180000_solo_pipeline_board_contract.sql"), "utf8");
const routingMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831193000_solo_pipeline_routing_evidence.sql"), "utf8");

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
    expect(adapter.match(/\.eq\("tenant_id", activeTenantId\)/g)).toHaveLength(4);
    expect(adapter).not.toContain('functions.invoke("tenant-campaigns"');
    expect(adapter).toContain('rpc("get_pipeline_routing_evidence"');
    expect(routingMigration).toContain("from public.growth_form_automations a");
    expect(routingMigration).toContain("from public.growth_submission_dispatches d");
    expect(routingMigration).toContain("a.autonomy_lane");
    expect(routingMigration).not.toMatch(/limit\s+200/i);
    expect(adapter).toContain('effective_autonomy_lane === "confirm"');
    expect(adapter).toContain('effective_autonomy_lane === "off"');
    expect(adapter).toContain('"Human-only" as const');
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

  it("implements the approved tenant-owned Pipeline contract without a fixed campaign or sales taxonomy", () => {
    expect(source).toContain('title="Deal workspace"');
    expect(source).toContain("New pipeline");
    expect(source).toContain("Blank pipeline");
    expect(source).toContain("Simple starter stages");
    expect(source).toContain("Configure stages");
    expect(source).toContain("Add a stage");
    expect(source).toContain("Focused stage");
    expect(source).toContain("??workspace.pipelines[0]");
    expect(source).toContain("Routing, approvals, and repair evidence");
    expect(source).not.toMatch(/pipeline.*revenue|pipeline.*ROI|pipeline.*payment/i);
  });

  it("uses callable tenant-safe reads and writes for the complete stage lifecycle", () => {
    for (const contract of ["get_pipeline_workspace", "get_pipeline_routing_evidence", "create_tenant_pipeline", "update_pipeline_details", "manage_pipeline_stage", "reorder_pipeline_stages"]) {
      expect(adapter + migration + routingMigration).toContain(contract);
    }
    for (const action of ["create", "update", "archive", "restore"]) expect(migration).toContain(`_action='${action}'`);
    expect(migration).toContain("PIPELINE_STAGE_OCCUPIED");
    expect(migration).toContain("public.is_tenant_admin(_tenant)");
    expect(migration).toContain("revoke all on function public.get_pipeline_workspace(uuid) from public,anon");
  });

  it("reduces only the Pipeline page title and preserves the board/card geometry", () => {
    expect(css).toContain('.solo-campaigns[data-campaigns-view="pipeline"] .campaigns-scroll>.pg-hd h1{font-size:20px}');
    expect(css).toContain(".pipeline-board{");
    expect(css).toContain(".pipeline-card{");
  });
});

