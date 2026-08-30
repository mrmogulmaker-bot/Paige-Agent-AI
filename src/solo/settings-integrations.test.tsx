import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloIntegrationsView } from "./settings-integrations";

const context = vi.hoisted(() => ({ tenantId: "tenant-a", loading: false }));
const rpc = vi.hoisted(() => vi.fn());

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: context.tenantId, loading: context.loading }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Solo Settings Integrations truth boundary", () => {
  beforeEach(() => {
    context.tenantId = "tenant-a";
    context.loading = false;
    rpc.mockReset();
  });

  it("calls only server-resolved safe status RPCs without tenant arguments", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "get_tenant_n8n_connection"
        ? { configured: true, status: "connected", label: "Workflow bridge", workflow_count: 3, last_sync_at: "2026-08-30T12:00:00Z", secret: "must-not-survive", raw_payload: "must-not-survive" }
        : { configured: false, status: "unconfigured" },
      error: null,
    }));
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));
    expect(rpc).toHaveBeenCalledWith("get_tenant_n8n_connection");
    expect(rpc).toHaveBeenCalledWith("get_tenant_mcp_connection");
    expect(rpc.mock.calls.every((call) => call.length === 1)).toBe(true);
    expect(host.textContent).toContain("Workflow bridge");
    expect(host.textContent).toContain("Connected");
    expect(host.textContent).toContain("Not configured");
    expect(host.textContent).not.toContain("must-not-survive");
    expect(host.textContent).toContain("A tenant-safe installed-capability handoff is not available");
    expect(host.querySelector('a[href*="marketplace"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it("clears the previous account immediately and rejects its late response", async () => {
    const firstN8n = deferred<{ data: unknown; error: null }>();
    const firstMcp = deferred<{ data: unknown; error: null }>();
    rpc.mockImplementationOnce(() => firstN8n.promise).mockImplementationOnce(() => firstMcp.promise);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));

    context.tenantId = "tenant-b";
    rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "get_tenant_n8n_connection"
        ? { configured: true, status: "connected", label: "Tenant B bridge", workflow_count: 1 }
        : { configured: false, status: "unconfigured" },
      error: null,
    }));
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));
    expect(host.textContent).toContain("Tenant B bridge");

    firstN8n.resolve({ data: { configured: true, status: "connected", label: "Late Tenant A bridge" }, error: null });
    firstMcp.resolve({ data: { configured: true, status: "connected", label: "Late Tenant A MCP" }, error: null });
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).not.toContain("Late Tenant A");
    expect(host.textContent).toContain("Tenant B bridge");
    await act(async () => root.unmount());
  });

  it("fails closed with a retry surface and no provider actions", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "internal provider detail" } });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));
    expect(host.textContent).toContain("Couldn’t read integration status");
    expect(host.textContent).not.toContain("internal provider detail");
    expect(Array.from(host.querySelectorAll("button")).map((node) => node.textContent)).toEqual(["Retry"]);
    await act(async () => root.unmount());
  });
});
