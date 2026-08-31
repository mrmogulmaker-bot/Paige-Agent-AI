import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/solo/growth2.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/solo/solo-campaigns.css"), "utf8");
const adapter = readFileSync(resolve(process.cwd(), "src/solo/useSoloCampaigns.ts"), "utf8");
const pipelineSettings = readFileSync(resolve(process.cwd(), "src/pages/admin/PipelineSettings.tsx"), "utf8");
const pipelineAdmin = readFileSync(resolve(process.cwd(), "src/pages/admin/PipelineAdmin.tsx"), "utf8");
const contactDeals = readFileSync(resolve(process.cwd(), "src/components/admin/contacts/ContactDealsSection.tsx"), "utf8");
const stageAutomationRules = readFileSync(resolve(process.cwd(), "src/pages/admin/StageAutomationRules.tsx"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831180000_solo_pipeline_board_contract.sql"), "utf8");
const routingMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831193000_solo_pipeline_routing_evidence.sql"), "utf8");
const dealGuardMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831194500_solo_pipeline_deal_tenant_guard.sql"), "utf8");
const taskGuardMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831195500_solo_pipeline_task_tenant_guard.sql"), "utf8");
const concurrencyMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831203500_solo_pipeline_concurrency_guards.sql"), "utf8");
const invariantMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831205000_solo_pipeline_invariant_guards.sql"), "utf8");
const archiveMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831210000_solo_pipeline_archive_serialization.sql"), "utf8");
const visibilityMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831211500_solo_pipeline_visibility_guard.sql"), "utf8");
const directArchiveMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831213000_solo_pipeline_direct_archive_guard.sql"), "utf8");
const reorderMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831214500_solo_pipeline_reorder_serialization.sql"), "utf8");
const defaultCreatorMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831220000_solo_pipeline_default_creator_lock.sql"), "utf8");
const defaultSetterMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831221500_solo_pipeline_default_setter_lock.sql"), "utf8");
const activeReorderMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831223000_solo_pipeline_active_reorder.sql"), "utf8");
const submissionProcessor = readFileSync(resolve(process.cwd(), "supabase/functions/growth-process-submission/index.ts"), "utf8");
const paigeChat = readFileSync(resolve(process.cwd(), "supabase/functions/paige-ai-chat/index.ts"), "utf8");
const paigeMcp = readFileSync(resolve(process.cwd(), "supabase/functions/paige-mcp/index.ts"), "utf8");

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
    expect(adapter).toContain('"Active + approval-gated" as const');
    expect(adapter).toContain('"Active + approval-gated + human-only" as const');
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
    expect(dealGuardMigration).toContain("c.id=d.contact_client_id and c.tenant_id=_tenant");
    expect(dealGuardMigration).toContain("DEAL_CLIENT_TENANT_MISMATCH");
    expect(dealGuardMigration).toContain("trg_validate_deal_tenant_links");
    expect(taskGuardMigration).toContain("t.tenant_id=_tenant");
    expect(taskGuardMigration).toContain("TASK_DEAL_TENANT_MISMATCH");
    expect(taskGuardMigration).toContain("trg_validate_task_deal_tenant_link");
    expect(concurrencyMigration).toContain("pg_advisory_xact_lock(hashtextextended('pipeline-default:'||_tenant::text,0))");
    expect(concurrencyMigration).toContain("pg_advisory_xact_lock(hashtextextended('pipeline-stage-order:'||_pipeline::text,0))");
    expect(invariantMigration).toContain("target.executor in ('contact_upsert','pipeline_attach','client_rail_event','notify_team') then 'auto'");
    expect(invariantMigration).toContain("s.archived_at is null");
    expect(invariantMigration).toContain("DEAL_STAGE_INVALID_OR_ARCHIVED");
    expect(invariantMigration).toContain("trg_serialize_pipeline_stage_insert");
    expect(invariantMigration).toContain("pg_advisory_xact_lock(hashtextextended('pipeline-stage-order:'||new.pipeline_id::text,0))");
    expect(archiveMigration).toContain("for share");
    expect(archiveMigration).toContain("where id=_stage_id for update");
    expect(submissionProcessor).toContain("deal_stage_update_failed");
    expect(submissionProcessor).toContain("submission_deal_link_failed");
    expect(submissionProcessor).toContain('.is("archived_at", null)');
    expect(visibilityMigration).toContain("_deal_admin or (_is_coach");
    expect(visibilityMigration).toContain("d.owner_user_id=_caller");
    expect(visibilityMigration).toContain("dc.assigned_coach_user_id=_caller");
    expect(visibilityMigration).toContain("_task_admin or t.user_id=_caller");
    expect(visibilityMigration).toContain("_client_admin or (_is_coach");
    expect(directArchiveMigration).toContain("_deal_admin:=public.is_platform_owner()");
    expect(directArchiveMigration).toContain("trg_prevent_occupied_stage_archive");
    expect(directArchiveMigration).toContain("old.archived_at is null and new.archived_at is not null");
    expect(directArchiveMigration).toContain("exists(select 1 from public.deals d where d.stage_id=old.id)");
    expect(reorderMigration).toContain("pg_advisory_xact_lock(hashtextextended('pipeline-stage-order:'||_pipeline_id::text,0))");
    expect(source).toContain("[data.tenantId]");
    expect(source).toContain('setNewPipeline({name:"",description:"",starter:"blank"})');
    expect(adapter).toContain("state.tenantId === synchronousTenantId");
    expect(adapter).toContain('synchronousTenantId ? "loading" as const');
    expect(pipelineSettings).toContain('rpc("reorder_pipeline_stages" as never');
    expect(pipelineSettings).not.toContain('supabase.from("pipeline_stages").update({ order_index:');
    expect(pipelineAdmin).toContain('.eq("pipeline_id", pid).is("archived_at", null).order("order_index")');
    expect(defaultCreatorMigration).toContain("create or replace function public.create_pipeline_with_stages");
    expect(defaultCreatorMigration).toContain("if _is_default then\n    perform pg_advisory_xact_lock(hashtextextended('pipeline-default:'||_tenant::text,0));");
    expect(pipelineSettings).toContain('rpc("set_default_pipeline" as never');
    expect(pipelineSettings).not.toContain("update({ is_default:");
    expect(defaultSetterMigration).toContain("pg_advisory_xact_lock(hashtextextended('pipeline-default:'||_tenant::text,0))");
    expect(contactDeals).toContain('from("pipeline_stages").select("*").is("archived_at", null)');
    expect(stageAutomationRules).toContain('.eq("pipeline_id", pid).is("archived_at", null)');
    expect(paigeChat.match(/\.is\("archived_at", null\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(paigeMcp).toContain('.eq("tenant_id", tenantId)\n        .is("archived_at", null)');
    expect(activeReorderMigration).toContain("array_agg(order_index order by order_index)");
    expect(activeReorderMigration).toContain("s.archived_at is null");
  });

  it("reduces only the Pipeline page title and preserves the board/card geometry", () => {
    expect(css).toContain('.solo-campaigns[data-campaigns-view="pipeline"] .campaigns-scroll>.pg-hd h1{font-size:20px}');
    expect(css).toContain(".pipeline-board{");
    expect(css).toContain(".pipeline-card{");
  });
});

