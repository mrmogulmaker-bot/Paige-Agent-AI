import { describe, it, expect } from "vitest";
import {
  TOOL_MAP,
  UNMAPPED_CATALOGUE_TOOLS,
  CAPABILITY_DOMAINS,
  toolsForCapability,
  maxModeForRisk,
  clampModeToRisk,
  postureOf,
} from "./capabilityTools";
// The ONE source of truth for action risk. Importing it here (test-only, never in the app bundle)
// is what makes the copied classes in capabilityTools.ts a guarded copy rather than a second source.
import { classifyAction } from "../../../supabase/functions/_shared/action-risk";

// The catalogue `list_tool_autonomy` exposes, verbatim from
// supabase/migrations/20261040000000_the_catalogue_carries_the_team_tools.sql. If a migration adds a
// governed tool, this list must grow and the tool must be mapped or explicitly excluded — otherwise
// the surface would govern it invisibly (the exact failure that migration's header warns about).
const CATALOGUE_KEYS: readonly string[] = [
  "crm_update_contact", "crm_create_contact", "crm_delete_contact", "crm_update_pipeline_stage",
  "crm_assign_coach", "crm_assign_contact", "crm_create_task", "crm_log_activity", "crm_add_note",
  "crm_file_document", "pipeline_create", "pipeline_add_stage", "member_grant_role",
  "member_revoke_role", "calendar_book_meeting", "program_enroll", "draft_marketing_content",
  "generate_image", "content_save", "growth_page_save", "growth_page_publish", "growth_funnel_build",
  "growth_funnel_publish", "action_file", "action_advance", "update_client_data",
  "delegate_to_subagent", "forge_subagent", "save_to_knowledge_base", "update_business_profile",
  "deal_create", "deal_move_stage", "document_generate", "author_event_kind", "n8n_run_workflow",
  "n8n_activate_workflow", "n8n_deactivate_workflow", "n8n_create_workflow", "n8n_update_workflow",
  "n8n_archive_workflow", "n8n_delete_workflow", "zapier_run_action", "plan_set_reminder",
  "plan_create", "plan_add_milestone", "plan_assign_task", "plan_update_item", "plan_remove_item",
  "automation_draft", "automation_set_grant", "automation_set_state", "marketplace_install",
  "marketplace_uninstall", "propose_business_brief_update", "pipeline_configure", "comms_buy_number",
  "comms_set_primary_number", "comms_name_number", "comms_draft_registration", "team_set_work_profile",
  "team_set_permission", "team_invite_member", "team_invite_resend", "team_invite_revoke",
];

describe("capabilityTools — no drift from the action-risk policy (§18)", () => {
  it("every mapped tool's copied risk class matches action-risk.ts exactly", () => {
    for (const [tool, { risk }] of Object.entries(TOOL_MAP)) {
      expect({ tool, risk: classifyAction(tool) }).toEqual({ tool, risk });
    }
  });

  it("no mapped tool is unclassified (a knob must front a real, runnable action)", () => {
    for (const tool of Object.keys(TOOL_MAP)) {
      expect(classifyAction(tool)).not.toBe("unclassified");
    }
  });

  it("the deliberately-unmapped catalogue tools are indeed unclassified phantoms", () => {
    for (const tool of UNMAPPED_CATALOGUE_TOOLS) {
      expect(classifyAction(tool)).toBe("unclassified");
    }
  });

  it("covers exactly the catalogue: every catalogue tool is mapped or explicitly excluded", () => {
    const accountedFor = new Set([...Object.keys(TOOL_MAP), ...UNMAPPED_CATALOGUE_TOOLS]);
    const catalogue = new Set(CATALOGUE_KEYS);
    // No catalogue tool is governed invisibly (present in the catalogue, absent from the surface).
    for (const tool of catalogue) expect(accountedFor.has(tool)).toBe(true);
    // No mapped tool is a ghost that the catalogue does not actually expose.
    for (const tool of Object.keys(TOOL_MAP)) expect(catalogue.has(tool)).toBe(true);
    for (const tool of UNMAPPED_CATALOGUE_TOOLS) expect(catalogue.has(tool)).toBe(true);
  });
});

describe("capabilityTools — domains and clamps", () => {
  it("every capability domain has at least one real tool", () => {
    for (const d of CAPABILITY_DOMAINS) expect(toolsForCapability(d.key).length).toBeGreaterThan(0);
  });

  it("every mapped tool belongs to a real domain key", () => {
    const keys = new Set(CAPABILITY_DOMAINS.map((d) => d.key));
    for (const { capability } of Object.values(TOOL_MAP)) expect(keys.has(capability)).toBe(true);
  });

  it("risk ceilings: ordinary→auto, high→confirm, owner_only→off", () => {
    expect(maxModeForRisk("ordinary")).toBe("auto");
    expect(maxModeForRisk("high")).toBe("confirm");
    expect(maxModeForRisk("owner_only")).toBe("off");
  });

  it("clamp never lets a mode exceed its risk ceiling (no false affordance §70.1)", () => {
    expect(clampModeToRisk("auto", "high")).toBe("confirm");
    expect(clampModeToRisk("auto", "owner_only")).toBe("off");
    expect(clampModeToRisk("confirm", "owner_only")).toBe("off");
    expect(clampModeToRisk("auto", "ordinary")).toBe("auto");
    expect(clampModeToRisk("off", "ordinary")).toBe("off");
  });

  it("owner_only always reads as 'Your call' regardless of stored mode", () => {
    expect(postureOf("auto", "owner_only")).toBe("your_call");
    expect(postureOf("off", "owner_only")).toBe("your_call");
    expect(postureOf("auto", "ordinary")).toBe("guardrails");
    expect(postureOf("confirm", "high")).toBe("asks");
    expect(postureOf("off", "ordinary")).toBe("held");
  });
});
