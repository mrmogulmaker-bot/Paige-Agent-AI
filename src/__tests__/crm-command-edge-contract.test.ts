import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edge = readFileSync("supabase/functions/crm-command/index.ts", "utf8");

describe("canonical CRM action door", () => {
  it("accepts no tenant, actor, role, or account identity from the request", () => {
    expect(edge).toContain("bodySchema");
    expect(edge).toContain("}).strict()");
    expect(edge).not.toMatch(/tenant_id:\s*z\./);
    expect(edge).not.toMatch(/actor_id:\s*z\./);
    expect(edge).not.toMatch(/actor_role:\s*z\./);
    expect(edge).toContain("owner_user_id: z.string().uuid().optional()");
    expect(edge).toContain("caller.auth.getUser()");
    expect(edge).toContain('caller.rpc("current_user_tenant_id")');
  });

  it("binds each command to an existing classified capability", () => {
    for (const capability of ["crm_create_contact", "crm_update_contact", "business_create", "business_update", "crm_create_task", "crm_update_task", "plan_assign_task", "crm_log_activity", "deal_move_stage"]) {
      expect(edge).toContain(`"${capability}"`);
    }
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
    expect(edge).toContain("confirmFingerprint(capability, requestArgs)");
    expect(edge).not.toMatch(/confirm:\s*z\.boolean/);
  });

  it("dispatches only to the service-only executor and returns its readback locator", () => {
    expect(edge).toContain('admin.rpc("execute_crm_command"');
    expect(edge).toContain("_tenant_id: tenantId");
    expect(edge).toContain("_actor_id: user.id");
    expect(edge).toContain("record_locator");
    expect(edge).toContain('approval_channel: decision.audit.laneEffective');
    expect(edge).toContain("readback");
  });

  it("records the governed decision without CRM field values", () => {
    expect(edge).toContain('.from("paige_audit_log").insert({');
    expect(edge).toContain('action: "crm.governed_decision"');
    expect(edge).toContain("command_action");
    expect(edge).not.toMatch(/auditPayload\s*=\s*\{[^}]*patch/s);
  });
});