import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edge = readFileSync("supabase/functions/crm-command/index.ts", "utf8");
const catalog = readFileSync("supabase/functions/_shared/crm-command/catalog.ts", "utf8");

describe("canonical CRM action door", () => {
  it("accepts no tenant, actor, role, or account identity from the request", () => {
    expect(edge).toContain("bodySchema");
    expect(edge).toContain("}).strict()");
    expect(edge).not.toMatch(/tenant_id:\s*z\./);
    expect(edge).not.toMatch(/actor_id:\s*z\./);
    expect(edge).not.toMatch(/actor_role:\s*z\./);
    expect(edge).toContain("owner_user_id: z.string().uuid().nullable().optional()");
    expect(edge).toContain("caller.auth.getUser()");
    expect(edge).toContain('caller.rpc("current_user_tenant_id")');
    expect(edge.match(/caller\.rpc\("current_user_tenant_id"\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(edge).toContain("CRM_ACTIVE_ACCOUNT_CHANGED");
  });

  it("binds each command to an existing classified capability", () => {
    for (const capability of ["crm_create_contact", "crm_update_contact", "crm_archive_contact", "crm_restore_contact", "crm_link_contact_company", "crm_unlink_contact_company", "crm_assign_coach", "crm_assign_contact_owner", "crm_merge_contacts", "crm_hard_delete_contact", "crm_bulk_update_contacts", "crm_create_company", "crm_update_company", "crm_archive_company", "crm_restore_company", "crm_create_task", "crm_update_task", "crm_assign_task", "crm_reschedule_task", "crm_complete_task", "crm_reopen_task", "crm_cancel_task", "crm_delete_task", "crm_log_activity", "deal_create", "crm_update_deal", "crm_assign_deal_owner", "crm_assign_deal_contact", "deal_move_stage", "crm_close_deal", "crm_reopen_deal", "crm_delete_deal"]) {
      expect(catalog).toContain(`"${capability}"`);
    }
    expect(edge).toContain("CRM_ACTION_CAPABILITY as ACTION_CAPABILITY");
    expect(edge).toContain("decideGovernedExecution({");
    expect(edge).toContain('outcomeChannel: "record_capability_run"');
  });

  it("resolves role and autonomy on the server and fails closed", () => {
    expect(edge).toContain('.from("tenant_members")');
    expect(edge).toContain('.eq("tenant_id", tenantId)');
    expect(edge).toContain('.eq("user_id", user.id)');
    expect(edge).toContain('.eq("status", "active")');
    expect(edge).toContain('caller.rpc("resolve_tool_autonomy"');
    expect(edge).toContain('let lane = "unresolved"');
  });

  it("reuses the canonical single-use confirmation store", () => {
    expect(edge).toContain('.from("paige_pending_confirmations")');
    expect(edge).toContain("consumed_at");
    expect(edge).toContain("server_issued_at");
    expect(edge).toContain("issued_in_request");
    expect(edge).toContain("confirmFingerprint(capability, proposalArgs)");
    expect(edge).toContain('admin.rpc("preview_crm_command"');
    expect(edge).toContain("command: { action: body.command.action, preview_id: preview.preview_id }");
    expect(edge).toContain('preview.ok === true && preview.outcome === "succeeded"');
    expect(edge).toContain("return successfulResultResponse(preview, body.command.action)");
    expect(edge).toContain('admin.rpc("read_crm_command_result"');
    expect(edge.indexOf('admin.rpc("read_crm_command_result"')).toBeLessThan(edge.indexOf('caller.rpc("resolve_tool_autonomy"'));
    expect(edge).toContain("if (cachedError) {");
    expect(edge).toContain('code === "CRM_FORBIDDEN"');
    expect(edge).toContain('"CRM_READBACK_UNAVAILABLE"');
    expect(edge).not.toMatch(/confirm:\s*z\.boolean/);
  });

  it("dispatches only to the service-only executor and returns its readback locator", () => {
    expect(edge).toContain('admin.rpc("execute_crm_command"');
    expect(edge).toContain("_tenant_id: tenantId");
    expect(edge).toContain("_actor_id: user.id");
    expect(edge).toContain("record_locator");
    expect(edge).toContain("const executionCommand = {");
    expect(edge).toContain('approval_channel: decision.audit.laneEffective');
    expect(edge).not.toContain('decidedCommand.action.startsWith("deal.")');
    expect(edge).toContain("readback");
    expect(edge).toContain('outcome: "setup_required"');
  });

  it("renders exact consequential approval summaries and only labels owned record routes exact", () => {
    for (const action of ["contact.assign_coach", "contact.assign_owner", "deal.assign_owner", "deal.assign_contact", "deal.move", "deal.close", "deal.reopen", "task.assign", "task.cancel"]) {
      expect(edge).toContain(`case "${action}"`);
    }
    expect(edge).toContain('recordId && action.startsWith("contact.")');
    expect(edge).not.toContain('action.startsWith("contact.") || action.startsWith("company.")');
    expect(edge).toContain('At least one reversible deal field is required for deal.update.');
    expect(edge).toContain('Contact tags must be an array of 1-80 character strings.');
    expect(edge).toContain('["contact.create", "contact.update", "contact.bulk_update"].includes(command.action)');
    expect(edge).toContain('Object.prototype.hasOwnProperty.call(command.patch, "tags")');
  });

  it("records the governed decision without CRM field values", () => {
    expect(edge).toContain('.from("paige_audit_log").insert({');
    expect(edge).toContain('action: "crm.governed_decision"');
    expect(edge).toContain("command_action");
    expect(edge).not.toMatch(/auditPayload\s*=\s*\{[^}]*patch/s);
  });
});