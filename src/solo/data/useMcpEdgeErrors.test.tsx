// @vitest-environment jsdom
//
// What an admin is told when a write is refused.
//
// `supabase.functions.invoke()` sets `data = null` on ANY non-2xx and puts the function's
// own JSON body on `error.context` (a `Response`). Every refusal these surfaces exist to
// explain — a caller who is not a tenant admin, an address the setter rejects, an
// authorization that expired, a tool list that moved under an approval — arrives as a
// non-2xx. So a call site that reads the reason from `data` reads it from the one place it
// is never present, and the specific message it was written to show is unreachable.
//
// FAILING FIRST: `--baseline` has no meaning for a unit test, so the equivalent is the
// `readsOnlyData` control below. It is the shipped reader, and it is asserted to return
// nothing for the same responses — the defect, demonstrated next to the fix rather than
// described.
import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: harness.invoke }, rpc: vi.fn() },
}));

import { readFunctionErrorBody } from "@/lib/integrations/connectError";

/** What `invoke()` really returns for a non-2xx, including the one-shot body read. */
function nonOk(status: number, body: unknown) {
  const response = { json: async () => body, status } as unknown as Response;
  return {
    data: null,
    error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: response }),
  };
}

/** The reader that shipped: the reason, taken from `data`. */
const readsOnlyData = (r: { data: unknown }) => (r.data as { error?: string; code?: string } | null);

afterEach(() => { harness.invoke.mockReset(); });

describe("a refusal from tenant-mcp-connect", () => {
  it("is unreadable from `data`, which is where the call sites were looking", () => {
    const r = nonOk(403, { error: "write_failed", code: "MCP_FORBIDDEN" });
    expect(readsOnlyData(r)).toBeNull();
  });

  it("is readable from the error body, with the code the message depends on", async () => {
    const r = nonOk(403, { error: "write_failed", code: "MCP_FORBIDDEN" });
    const body = await readFunctionErrorBody(r.error, r.data);
    expect(body).toEqual({ error: "write_failed", code: "MCP_FORBIDDEN" });
  });

  it("carries the reason a stale approval list depends on", async () => {
    const r = nonOk(409, { error: "capabilities_changed" });
    expect((await readFunctionErrorBody(r.error, r.data))?.error).toBe("capabilities_changed");
  });

  it("still reads a 2xx-with-error, so the fix does not trade one shape for the other", async () => {
    const body = await readFunctionErrorBody(null, { error: "not_connected" });
    expect(body?.error).toBe("not_connected");
  });

  it("returns null rather than throwing when the body is not JSON", async () => {
    const response = { json: async () => { throw new SyntaxError("<html>"); } } as unknown as Response;
    expect(await readFunctionErrorBody(Object.assign(new Error("x"), { context: response }), null)).toBeNull();
  });

  it("returns null for a success, so a caller cannot mistake one for a refusal", async () => {
    expect(await readFunctionErrorBody(null, { ok: true, status: "connected" })).toBeNull();
  });
});
