/* eslint-disable @typescript-eslint/no-explicit-any -- Executes real Deno handlers with injected DB/model ports. */
// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect, vi } from "vitest";

function harness(kind: "draft" | "submit", options: { owner?: boolean; tenantAdmin?: string; switchDuringModel?: boolean } = {}) {
  let tenant = "tenant-a";
  const saved: any[] = [];
  const reads: any[] = [];
  const draft = { use_case: "Reminders", campaign_description: "Appointment reminders", sample_messages: ["Reminder one", "Reminder two"] };
  const model = vi.fn(async (..._args: any[]) => {
    if (options.switchDuringModel) tenant = "tenant-b";
    return { choices: [{ message: { content: JSON.stringify(draft) } }] };
  });
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from: (table: string) => ({ select: () => ({ eq: (column: string, value: string) => { reads.push({ table, column, value }); return table === "user_roles"
      ? Promise.resolve({ data: options.owner === false ? [] : [{ role: "admin" }] })
      : { maybeSingle: async () => ({ data: table === "tenant_legal_profile" ? { legal_business_name: "Workspace A LLC" } : table === "tenants" ? { features: { playbook_config: { persona: { domain: "Workspace A context" } } } } : null }) }; } }) }),
    rpc: async (name: string, args?: any) => {
      if (name === "current_user_tenant_id") return { data: tenant };
      if (name === "is_tenant_admin_as") return { data: options.tenantAdmin === args?._tenant };
      if (name === "get_paige_persona_context") return { data: { tenant_id: "tenant-b", playbook_config: { persona: { domain: "Workspace B private context" } } } };
      if (name === "is_platform_owner") return { data: false };
      if (name === "tenant_a2p_registration_save_draft") {
        saved.push(args);
        return args.p_tenant_id !== tenant
          ? { error: { hint: "WORKSPACE_CHANGED", message: "Workspace changed", code: "42501" } }
          : { data: { ok: true } };
      }
      return { data: null };
    },
  };
  let handler!: (request: Request) => Promise<Response>;
  const js = ts.transpileModule(readFileSync(`supabase/functions/comms-a2p-${kind}/index.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", "Deno", js)((name: string) => {
    if (name.startsWith("https://esm.sh/@supabase/supabase-js")) return { createClient: () => db };
    if (name === "../_shared/model-router.ts") return { routedChatCompletion: model };
    throw new Error(`Unmocked port: ${name}`);
  }, {}, { env: { get: () => "test-port" }, serve: (fn: typeof handler) => { handler = fn; } });
  const post = (extra: Record<string, unknown> = {}) => handler(new Request("https://example.com", {
    method: "POST", headers: { authorization: "Bearer fixture-jwt", "content-type": "application/json" },
    body: JSON.stringify({ legal_business_name: "Workspace A LLC", ...draft, ...extra }),
  }));
  return { post, model, saved, reads };
}

describe("A2P real-handler workspace preconditions", () => {
  it.each(["draft", "submit"] as const)("%s refuses stale workspace before model or write", async kind => {
    const h = harness(kind);
    const response = await h.post({ expected_tenant_id: "tenant-b" });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("WORKSPACE_CHANGED");
    expect(h.model).not.toHaveBeenCalled();
    expect(h.saved).toEqual([]);
  });
  it.each(["draft", "submit"] as const)("%s does not let tenant expectation bypass authorization", async kind => {
    const h = harness(kind, { owner: false });
    expect((await h.post({ expected_tenant_id: "tenant-a" })).status).toBe(403);
    expect(h.saved).toEqual([]);
  });
  it.each(["draft", "submit"] as const)("%s pins the server-resolved workspace even for older callers", async kind => {
    const h = harness(kind);
    const response = await h.post({ tenant_id: "tenant-b" });
    expect(response.status).toBe(200);
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0].p_tenant_id).toBe("tenant-a");
  });
  it.each(["draft", "submit"] as const)("%s permits a scoped Solo owner without global roles", async kind => {
    const h = harness(kind, { owner: false, tenantAdmin: "tenant-a" });
    expect((await h.post({ expected_tenant_id: "tenant-a" })).status).toBe(200);
  });
  it.each(["draft", "submit"] as const)("%s refuses an owner of another workspace", async kind => {
    const h = harness(kind, { owner: false, tenantAdmin: "tenant-b" });
    expect((await h.post({ expected_tenant_id: "tenant-a" })).status).toBe(403);
    expect(h.model).not.toHaveBeenCalled();
    expect(h.saved).toEqual([]);
  });
  it("builds the model prompt only from the captured tenant, never linked-client persona context", async () => {
    const h = harness("draft");
    expect((await h.post({ expected_tenant_id: "tenant-a" })).status).toBe(200);
    const prompt = JSON.stringify(h.model.mock.calls);
    expect(prompt).toContain("Workspace A context");
    expect(prompt).not.toContain("Workspace B private context");
    expect(h.reads).toContainEqual({ table: "tenants", column: "id", value: "tenant-a" });
  });
  it("draft returns the atomic save refusal after a switch during model generation", async () => {
    const h = harness("draft", { switchDuringModel: true });
    const response = await h.post({ expected_tenant_id: "tenant-a" });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("WORKSPACE_CHANGED");
    expect(h.saved[0].p_tenant_id).toBe("tenant-a");
  });
});
