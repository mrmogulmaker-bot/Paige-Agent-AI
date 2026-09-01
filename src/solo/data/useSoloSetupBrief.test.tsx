import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useSoloSetupBrief } from "./useSoloSetupBrief";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  tenantId: "tenant-a",
  pending: [] as Array<{ tenantId: string; resolve: (value: unknown) => void }>,
}));

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: testState.tenantId }),
}));

vi.mock("./useSoloPeople", () => ({
  useSoloPeople: () => ({ loading: false, error: null, people: [], refresh: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn((name: string) => {
      if (name === "resolve_tenant_domain_identity") return Promise.resolve({ data: null, error: null });
      if (name === "get_solo_setup_identity") {
        const tenantId = testState.tenantId;
        return new Promise((resolve) => testState.pending.push({ tenantId, resolve }));
      }
      return Promise.resolve({ data: null, error: null });
    }),
  },
}));

function Probe() {
  const data = useSoloSetupBrief();
  return <button type="button" disabled={!data.canEdit}>{data.brief.publicName || "Unresolved"}</button>;
}

describe("useSoloSetupBrief tenant gate", () => {
  it("drops a late prior-tenant response and enables editing only after the current tenant resolves", async () => {
    testState.tenantId = "tenant-a";
    testState.pending.length = 0;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => root.render(<Probe />));
    expect(testState.pending.map((item) => item.tenantId)).toEqual(["tenant-a"]);

    testState.tenantId = "tenant-b";
    await act(async () => root.render(<Probe />));
    expect(testState.pending.map((item) => item.tenantId)).toEqual(["tenant-a", "tenant-b"]);
    expect(host.querySelector("button")?.disabled).toBe(true);

    await act(async () => {
      testState.pending[0].resolve({
        data: { tenant_id: "tenant-a", tenant_name: "Business A", business_brief: { publicName: "Business A" }, can_edit: true },
        error: null,
      });
      await Promise.resolve();
    });
    expect(host.textContent).toBe("Unresolved");
    expect(host.querySelector("button")?.disabled).toBe(true);

    await act(async () => {
      testState.pending[1].resolve({
        data: { tenant_id: "tenant-b", tenant_name: "Business B", business_brief: { publicName: "Business B" }, can_edit: true },
        error: null,
      });
      await Promise.resolve();
    });
    expect(host.textContent).toBe("Business B");
    expect(host.querySelector("button")?.disabled).toBe(false);

    await act(async () => root.unmount());
    host.remove();
  });
});
