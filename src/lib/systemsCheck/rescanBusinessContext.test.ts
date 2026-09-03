import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  calls: [] as Array<{ fn: string; body: unknown }>,
  invoke: vi.fn(async (fn: string, opts: { body: unknown }) => {
    harness.calls.push({ fn, body: opts.body });
    return { data: { ok: true }, error: null };
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: harness.invoke } },
}));

import { rescanBusinessContext } from "./rescanBusinessContext";

describe("rescanBusinessContext — Setup's post-save trigger into Systems Check", () => {
  it("fires the change-triggered rescan for exactly the three Setup-fed surfaces, never a tenant id", async () => {
    rescanBusinessContext();
    // fire-and-forget: let the microtask queue drain before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.invoke).toHaveBeenCalledTimes(3);
    const surfaces = harness.calls.map((c) => (c.body as { changed_surface: string }).changed_surface).sort();
    expect(surfaces).toEqual(["comms", "company_info", "website"]);
    for (const call of harness.calls) {
      expect(call.fn).toBe("systems-check-run-change");
      expect(call.body).not.toHaveProperty("tenant_id");
    }
  });

  it("never throws even when every rescan call fails (§13 — Setup's own save result must never be affected)", async () => {
    harness.invoke.mockImplementationOnce(async () => ({ data: null, error: { message: "boom" } }));
    harness.invoke.mockImplementationOnce(async () => { throw new Error("network"); });
    harness.invoke.mockImplementationOnce(async () => ({ data: null, error: { message: "boom2" } }));

    expect(() => rescanBusinessContext()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("never throws even when accessing supabase.functions.invoke itself throws synchronously", async () => {
    // Mirrors the exact shape a caller's own mock (e.g. useSoloSetupBrief.test.tsx's client mock)
    // can take: no `functions` key at all, so `supabase.functions.invoke` throws BEFORE any
    // promise chain exists — the failure mode a bare `.invoke().catch()` cannot guard against.
    harness.invoke.mockImplementationOnce(() => { throw new TypeError("Cannot read properties of undefined (reading 'invoke')"); });
    expect(() => rescanBusinessContext()).not.toThrow();
  });
});
