import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/paige-mcp/index.ts", "utf8");
const between = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const compiled = (code: string) => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function harness(tier: string, scopes = ["admin.read", "admin.write"]) {
  const audit = vi.fn(async () => undefined);
  const database = vi.fn();
  const code = between("const MASTER_ONLY_TOOLS =", "// Doctrine §9/§25")
    + between("function toolTier(", "// Branding shown")
    + between("async function enforceTierAndScope(", "// ── Paige Context Rail — MCP producer");
  const gate = new Function("deriveTier", "actorStore", "audit", "TOOL_SCOPE", "AGENCY_TOOLS", "TIER_RANK",
    compiled(code) + "; return enforceTierAndScope;")(
    async () => tier, { run: (_actor: unknown, run: () => unknown) => run() }, audit,
    { list_admin_notifications: "admin.read", create_admin_notification: "admin.write", search_contacts: "crm.read" },
    new Set(), { client: 0, tenant: 1, agency: 2, god: 3 },
  );
  const keepCode = between("const keep = (t: any)", "const cloned = res.clone()");
  const visible = new Function("tier", "isUser", "scopeSet", "TOOL_SCOPE", "AGENCY_TOOLS", "TIER_RANK",
    compiled(between("const MASTER_ONLY_TOOLS =", "// Doctrine §9/§25") + between("function toolTier(", "// Branding shown") + keepCode) + ";return keep;")(
    tier, true, new Set(scopes),
    { list_admin_notifications: "admin.read", create_admin_notification: "admin.write", search_contacts: "crm.read" },
    new Set(), { client: 0, tenant: 1, agency: 2, god: 3 },
  );
  const call = async (name: string) => {
    const result = await gate({ method: "tools/call", params: { name } }, { kind: "user", scopes });
    if (result.ok) database();
    return result;
  };
  return { call, visible, database, audit };
}

describe("operator notification tools use the real MCP discovery and invocation gates", () => {
  it("checks the gate before transport dispatch", () => {
    expect(source.indexOf("const gate = await enforceTierAndScope(peekedBody, actor)")).toBeLessThan(source.indexOf("const res = await actorStore.run(actor, () => httpHandler(c.req.raw))"));
  });
  for (const name of ["list_admin_notifications", "create_admin_notification"]) {
    it.each(["client", "tenant", "agency"])(`${name}: %s cannot discover, invoke, or emit a named denial`, async tier => {
      const h = harness(tier);
      expect(h.visible({ name })).toBe(false);
      // `code` is asserted alongside the sentence, and it must stay GENERIC for these two: the
      // whole point of this branch is that a non-operator learns nothing about what exists. A code
      // of `tier_forbidden` or the tool's own name here would be the named denial this test bans,
      // moved into a machine-readable field where it is easier to miss.
      expect(await h.call(name)).toEqual({ ok: false, status: 403, code: "unavailable", error: "This action is unavailable." });
      expect(h.database).not.toHaveBeenCalled();
      expect(h.audit).not.toHaveBeenCalled();
    });
    it(`${name}: verified operator retains scoped access`, async () => {
      const h = harness("god");
      expect(h.visible({ name })).toBe(true);
      expect(await h.call(name)).toEqual({ ok: true });
      expect(h.database).toHaveBeenCalledOnce();
    });
    it(`${name}: missing operator scope fails safely`, async () => {
      const h = harness("god", []);
      expect(h.visible({ name })).toBe(false);
      expect(await h.call(name)).toEqual({ ok: false, status: 403, code: "unavailable", error: "This action is unavailable." });
      expect(h.database).not.toHaveBeenCalled();
    });
  }
  it("leaves unrelated tenant discovery and execution unchanged", async () => {
    const h = harness("tenant", ["crm.read"]);
    expect(h.visible({ name: "search_contacts" })).toBe(true);
    expect(await h.call("search_contacts")).toEqual({ ok: true });
  });
});
