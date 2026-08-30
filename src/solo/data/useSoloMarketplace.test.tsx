import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ context: { activeTenantId: "tenant-a", loading: false, accountContextLoading: false }, rpc: vi.fn() }));
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => harness.context }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: harness.rpc } }));
import { useSoloMarketplace, type SoloMarketplaceRead } from "./useSoloMarketplace";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement; let root: Root; let latest: SoloMarketplaceRead | null = null;
function Probe() { latest = useSoloMarketplace(); return <span>{latest.state}</span>; }
beforeEach(() => { vi.clearAllMocks(); harness.context.activeTenantId = "tenant-a"; harness.context.loading = false; harness.context.accountContextLoading = false; latest = null; host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const row = { slug: "safe-item", item_type: "playbook", name: "Safe item", tagline: null, description: null, category: "Operations", icon: null, pricing_model: "free", price_cents: 0, requires_embedding: false, installed: false, install_status: null, version: "1.0.0" };

describe("useSoloMarketplace", () => {
  it("does not read while identity is resolving or absent", () => {
    harness.context.accountContextLoading = true; act(() => root.render(<Probe />)); expect(harness.rpc).not.toHaveBeenCalled(); expect(latest?.state).toBe("resolving");
    harness.context.accountContextLoading = false; harness.context.activeTenantId = null as unknown as string; act(() => root.render(<Probe />)); expect(harness.rpc).not.toHaveBeenCalled(); expect(latest?.state).toBe("unavailable");
  });

  it("uses only the tenant-validated catalogue RPC and exposes no fallback on failure", async () => {
    harness.rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    await act(async () => { root.render(<Probe />); });
    expect(harness.rpc).toHaveBeenCalledWith("marketplace_catalog_for_tenant", { _tenant_id: "tenant-a" });
    expect(latest?.state).toBe("error"); expect(latest?.items).toEqual([]);
  });

  it("discards a late response after the account address changes", async () => {
    let resolveA!: (value: { data: typeof row[]; error: null }) => void;
    harness.rpc.mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; })).mockResolvedValueOnce({ data: [{ ...row, slug: "tenant-b-item", name: "Tenant B item" }], error: null });
    act(() => root.render(<Probe />));
    harness.context.activeTenantId = "tenant-b"; await act(async () => { root.render(<Probe />); });
    expect(latest?.items[0]?.slug).toBe("tenant-b-item");
    await act(async () => { resolveA({ data: [{ ...row, slug: "tenant-a-item", name: "Tenant A item" }], error: null }); });
    expect(latest?.items[0]?.slug).toBe("tenant-b-item");
  });

  it("fails the full read closed on malformed or duplicate identity", async () => {
    harness.rpc.mockResolvedValue({ data: [row, { ...row }], error: null });
    await act(async () => { root.render(<Probe />); });
    expect(latest?.state).toBe("error");
    expect(latest?.items).toEqual([]);
  });
});
