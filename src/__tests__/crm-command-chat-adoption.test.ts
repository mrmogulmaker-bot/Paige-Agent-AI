import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CRM_ACTION_CAPABILITY, CRM_COMMAND_TOOLS, CRM_TOOL_TO_ACTION } from "../../supabase/functions/_shared/crm-command/catalog.ts";

const chat = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

describe("Paige Chat canonical CRM adoption", () => {
  it("exposes every supported operation from one shared catalogue", () => {
    expect(Object.keys(CRM_ACTION_CAPABILITY)).toHaveLength(32);
    expect(CRM_COMMAND_TOOLS).toHaveLength(32);
    expect(new Set(CRM_COMMAND_TOOLS.map((tool) => tool.function.name)).size).toBe(32);
    for (const [action, tool] of Object.entries(CRM_ACTION_CAPABILITY)) expect(CRM_TOOL_TO_ACTION[tool]).toBe(action);
    expect(chat).toContain("toolDefs.push(...CRM_COMMAND_TOOLS as any)");
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
    expect(chat).toContain("receipt_recorded: parsed.receipt_recorded === true");
  });
});