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
    expect(host.textContent).toContain("Marketplace owns governed Paige capabilities");
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
    expect(Array.from(host.querySelectorAll(".ss-state button")).map((node) => node.textContent)).toEqual(["Retry"]);
    expect(host.querySelector(".ss-state a")).toBeNull();
    await act(async () => root.unmount());
  });

  it("uses Zapier identity only when the safe MCP host proves Zapier", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "get_tenant_n8n_connection"
        ? { configured: false, status: "unconfigured" }
        : { configured: true, status: "connected", server_url_host: "https://mcp.zapier.com", label: "Automation bridge" },
      error: null,
    }));
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));
    const zapierCard = host.querySelector('[data-provider="zapier"]');
    expect(zapierCard?.textContent).toContain("Zapier MCP");
    expect(zapierCard?.querySelector('[data-provider-mark="zapier"]')?.textContent).toBe("zapier");
    expect(zapierCard?.querySelector('[data-truth="LIVE"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("keeps unknown MCP servers neutral and separate from Zapier branding", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "get_tenant_n8n_connection"
        ? { configured: false, status: "unconfigured" }
        : { configured: true, status: "connected", server_url_host: "https://tools.example.test", label: "Private tools" },
      error: null,
    }));
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));
    expect(host.querySelector('[data-provider="zapier"]')).toBeNull();
    const mcpCard = host.querySelector('[data-provider="mcp"]');
    expect(mcpCard?.textContent).toContain("Private tools");
    expect(mcpCard?.querySelector('[data-provider-mark="mcp"]')?.textContent).toBe("MCP");
    await act(async () => root.unmount());
  });

  it("labels recovered Version One surfaces as evidence, never tenant connection state", async () => {
    rpc.mockResolvedValue({ data: { configured: false, status: "unconfigured" }, error: null });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));
    const recovered = host.querySelector('[aria-labelledby="ss-recovered-title"]');
    expect(recovered?.textContent).toContain("Recovered, not connected");
    expect(recovered?.textContent).toContain("QuickBooks");
    expect(recovered?.textContent).toContain("Webhooks & direct API");
    expect(recovered?.textContent).toContain("No tenant connection is claimed");
    expect(recovered?.querySelector('[data-truth="LIVE"]')).toBeNull();
    expect(recovered?.querySelector("button")).toBeNull();
    expect(Array.from(recovered?.querySelectorAll("a") ?? []).map((link) => link.textContent?.trim())).toEqual([]);
    await act(async () => root.unmount());
  });

  it("removes the redundant hero and states the three product owners compactly", async () => {
    rpc.mockResolvedValue({ data: { configured: false, status: "unconfigured" }, error: null });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));

    expect(host.querySelector(".ss-integrations-intro")).toBeNull();
    expect(host.textContent).not.toContain("External tools and bridges");
    const boundary = host.querySelector('[aria-label="Product ownership"]');
    expect(boundary?.textContent).toContain("ConnectionsPhone, sending identity, delivery, and calendars");
    expect(boundary?.textContent).toContain("IntegrationsExternal data, workflow, and service bridges");
    expect(boundary?.textContent).toContain("MarketplaceGoverned Paige capability lifecycle");
    await act(async () => root.unmount());
  });

  it("filters the catalogue with accessible category controls", async () => {
    rpc.mockResolvedValue({ data: { configured: false, status: "unconfigured" }, error: null });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));

    const filters = host.querySelector('[role="group"][aria-label="Filter integration catalogue"]');
    const all = filters?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    expect(all?.textContent).toBe("All");
    const documents = Array.from(filters?.querySelectorAll("button") ?? []).find((button) => button.textContent === "Documents");
    await act(async () => documents?.click());
    expect(documents?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[data-provider="docusign"]')).not.toBeNull();
    expect(host.querySelector('[data-provider="quickbooks"]')).toBeNull();
    expect(host.querySelector('[data-provider="n8n"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it("admits only proven Solo destinations and never links Stripe Connect to Marketplace", async () => {
    rpc.mockResolvedValue({ data: { configured: false, status: "unconfigured" }, error: null });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter initialEntries={["/solo/1971670/settings/integrations"]}><SoloIntegrationsView /></MemoryRouter>));

    const destinations = Array.from(host.querySelectorAll("a")).map((link) => ({
      text: link.textContent?.trim(),
      href: link.getAttribute("href"),
    }));
    expect(destinations).toEqual([
      { text: "Open Automations", href: "/solo/1971670/automations" },
    ]);
    const stripe = host.querySelector('[data-provider="stripe"]');
    expect(stripe?.textContent).toContain("Integrations · commerce account");
    expect(stripe?.textContent).not.toContain("Marketplace / Storefront");
    expect(stripe?.querySelector("a")).toBeNull();
    const owners = Object.fromEntries(Array.from(host.querySelectorAll<HTMLElement>("[data-provider]"), (card) => [card.dataset.provider, card.dataset.owner]));
    expect(owners).toMatchObject({ n8n: "integrations", mcp: "integrations", quickbooks: "integrations", stripe: "integrations", docusign: "integrations", apollo: "integrations", plaid: "integrations", api: "integrations" });
    expect(host.textContent).toContain("Integrations · client data bridge");
    expect(host.textContent).toContain("Integrations · financial data bridge");
    expect(host.innerHTML).not.toContain("/admin/integrations");
    expect(host.innerHTML).not.toContain("/mcp/authorize");
    expect(host.textContent).toContain("No safe Solo configuration handoff is available yet.");
    await act(async () => root.unmount());
  });

  it("renders the catalogue as a labelled keyboard-scrollable browse region", async () => {
    rpc.mockResolvedValue({ data: { configured: false, status: "unconfigured" }, error: null });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));

    const catalogue = host.querySelector('[role="region"][aria-label="Integration catalogue"]');
    expect(catalogue).not.toBeNull();
    expect(catalogue?.getAttribute("tabindex")).toBe("0");
    expect(catalogue?.querySelectorAll("article")).toHaveLength(8);
    expect(catalogue?.textContent).toContain("Automation");
    expect(catalogue?.textContent).toContain("Financial tools");
    expect(catalogue?.textContent).toContain("Setup handoff unavailable");
    await act(async () => root.unmount());
  });

  it("exposes a visible browsing cue only when the catalogue overflows", async () => {
    rpc.mockResolvedValue({ data: { configured: false, status: "unconfigured" }, error: null });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));

    const catalogue = host.querySelector<HTMLElement>('[aria-label="Integration catalogue"]');
    expect(catalogue?.getAttribute("aria-describedby")).toBe("ss-catalogue-scroll-hint");
    expect(host.querySelector(".ss-catalogue-scroll-hint")?.textContent).toContain("All integrations visible");

    Object.defineProperty(catalogue, "clientHeight", { configurable: true, value: 420 });
    Object.defineProperty(catalogue, "scrollHeight", { configurable: true, value: 780 });
    await act(async () => window.dispatchEvent(new Event("resize")));

    expect(catalogue?.dataset.scrollable).toBe("true");
    expect(host.querySelector(".ss-catalogue-scroll-hint")?.textContent).toContain("Scroll to browse");
    await act(async () => root.unmount());
  });
});

