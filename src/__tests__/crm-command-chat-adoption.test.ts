import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CRM_ACTION_CAPABILITY, CRM_COMMAND_TOOLS, CRM_TOOL_TO_ACTION, crmApprovalSubject } from "../../supabase/functions/_shared/crm-command/catalog.ts";

const chat = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

describe("Paige Chat canonical CRM adoption", () => {
  it("exposes every supported operation from one shared catalogue", () => {
    expect(Object.keys(CRM_ACTION_CAPABILITY)).toHaveLength(32);
    expect(CRM_COMMAND_TOOLS).toHaveLength(32);
    expect(new Set(CRM_COMMAND_TOOLS.map((tool) => tool.function.name)).size).toBe(32);
    for (const [action, tool] of Object.entries(CRM_ACTION_CAPABILITY)) expect(CRM_TOOL_TO_ACTION[tool]).toBe(action);
    expect(chat).toContain("toolDefs.push(...CRM_COMMAND_TOOLS as any)");
    const dealUpdate = CRM_COMMAND_TOOLS.find((tool) => tool.function.name === "crm_update_deal");
    expect(dealUpdate?.function.parameters).toMatchObject({
      type: "object",
      required: ["deal_id", "expected_version"],
      properties: expect.objectContaining({
        title: expect.any(Object),
        value_cents: expect.any(Object),
        stage_id: expect.any(Object),
        expected_close_date: expect.any(Object),
        contact_id: expect.any(Object),
        owner_user_id: expect.any(Object),
        currency: expect.any(Object),
      }),
    });
    expect(dealUpdate?.function.parameters).not.toHaveProperty("anyOf");
  });

  it("uses one stable record subject to disambiguate same-tool approval batches", async () => {
    const first = await crmApprovalSubject("task.cancel", { action: "task.cancel", task_id: "task-a", expected_updated_at: "v1" });
    const reordered = await crmApprovalSubject("task.cancel", { expected_updated_at: "v1", task_id: "task-a", action: "task.cancel" });
    const second = await crmApprovalSubject("task.cancel", { action: "task.cancel", task_id: "task-b", expected_updated_at: "v1" });
    const changedVersion = await crmApprovalSubject("task.cancel", { action: "task.cancel", task_id: "task-a", expected_updated_at: "v2" });
    expect(first).toBe(reordered);
    expect(first).not.toBe(second);
    expect(first).toBe(changedVersion);
    expect(first).toMatch(/^[0-9a-f]{16}$/);
  });
  it("does not accept tenant, actor, role, account, approval, or authority as model arguments", () => {
    const serialized = JSON.stringify(CRM_COMMAND_TOOLS);
    for (const forbidden of ["tenant_id", "actor_id", "actor_role", "account_id", "approved_fingerprint", "authority"]) {
      expect(serialized).not.toContain(`\\"${forbidden}\\":`);
    }
  });

  it("removes legacy model exposure and routes canonical tools only through crm-command", () => {
    expect(chat).toContain("legacyCrmMutationTools");
    expect(chat).toContain('functions.invoke("crm-command"');
    expect(chat).toContain("headers: { Authorization: authHeader }");
    expect(chat).toContain("CRM_COMMAND_TOOL_NAMES.has(tc.function.name as any)");
    expect(chat).toContain("&& !CRM_COMMAND_TOOL_NAMES.has(tc.function.name as any)");
  });

  it("adopts the command door approval and truthful result contract", () => {
    expect(chat).toContain('crmBody.outcome === "approval_required"');
    expect(chat).toContain("confirm_fingerprint: crmBody.fingerprint");
    expect(chat).toContain('.in("tool_name", [...CRM_COMMAND_TOOL_NAMES])');
    expect(chat).toContain("Nothing changed yet");
    expect(chat).toContain("external_effect: false");
    expect(chat).toContain("No email or SMS was sent and no call was placed");
    expect(chat).toContain("paige_crm_result");
    expect(chat).toContain("crmResultTrace");
    expect(chat).toContain("paige_crm_result: crmResultTrace.map");
    // Success and interrupted Live now share this one projection, before convo.
    const persistedCrmProjection = chat.slice(chat.indexOf("paige_crm_result: crmResultTrace.map"), chat.indexOf("const convo:", chat.indexOf("paige_crm_result: crmResultTrace.map")));
    expect(persistedCrmProjection).not.toContain("readback:");
    expect(persistedCrmProjection).not.toContain("record_locator:");
    expect(chat).toContain("receipt_recorded: parsed.receipt_recorded === true");
    expect(chat).toContain('confirmFingerprint("crm_command_idempotency"');
    expect(chat).toContain("user_turn_ordinal: userTurns.length");
    expect(chat).toContain("user_turn: currentUserTurn?.content ?? null");
    expect(chat).not.toContain("tool_index: toolIndex");
    expect(chat).not.toContain("thread_id: payloadThreadId ?? null,\n            messages,");
    expect(chat).toContain("for (const src of [out?.readback, out, args])");
    expect(chat).toContain('crm_log_activity: "client_notes"');
    expect(chat).toContain('.filter("args->>approval_subject", "eq", approvalSubject)');
    expect(chat).toContain("approvedRows?.length === 1");
    expect(chat).not.toContain("const idempotencyKey = suppliedKey || crypto.randomUUID()");
  });
});
