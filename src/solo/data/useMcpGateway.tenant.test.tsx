import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), tenant: "a" as string | null, user: "owner" as string | null, loading: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: h.tenant, activeUserId: h.user, loading: h.loading }),
}));

import { useMcpGateway, type UseMcpGateway } from "./useMcpGateway";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let seen: UseMcpGateway[] = [];
function Probe() {
  seen.push(useMcpGateway());
  return null;
}
const latest = () => seen.at(-1)!;

/** One registry row as get_mcp_connections_v2 returns it (host + aggregates, NEVER a secret). */
const row = (label: string, over: Record<string, unknown> = {}) => ({
  connection_id: `id-${label}`,
  provider_key: "generic-remote",
  label,
  transport: "http",
  auth_kind: "bearer",
  configured: true,
  enabled: true,
  status: "pending_verification",
  health: "unknown",
  last_checked_at: null,
  granted_scopes: [],
  visibility: "tenant",
  server_url_host: "services.example.com",
  tool_count: 0,
  approved_count: 0,
  ...over,
});

const listOk = (labels: string[]) => ({ data: labels.map((l) => row(l)), error: null });

function defaultRpc(over: Partial<Record<string, unknown>> = {}) {
  return (name: string) => {
    if (name === "get_mcp_connections_v2") return Promise.resolve(over.list ?? listOk(["A"]));
    if (name === "is_current_user_tenant_admin") return Promise.resolve(over.admin ?? { data: true, error: null });
    return Promise.resolve({ data: {}, error: null });
  };
}

async function mount() {
  h.rpc.mockImplementation(defaultRpc());
  const host = document.createElement("div");
  root = createRoot(host);
  await act(async () => {
    root!.render(<Probe />);
  });
  await act(async () => {}); // flush the load resolution
}
async function rerender() {
  await act(async () => {
    root!.render(<Probe />);
  });
  await act(async () => {});
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  seen = [];
  h.rpc.mockReset();
  h.invoke.mockReset();
  h.tenant = "a";
  h.user = "owner";
  h.loading = false;
});

describe("useMcpGateway", () => {
  it("reads the list with NO tenant argument (server-derived tenant)", async () => {
    await mount();
    const listCalls = h.rpc.mock.calls.filter((c) => c[0] === "get_mcp_connections_v2");
    expect(listCalls.length).toBeGreaterThan(0);
    // The truth-boundary seam: a get_* read carries only its own name, no args object.
    for (const call of listCalls) expect(call.length).toBe(1);
    expect(latest().connections.map((c) => c.label)).toEqual(["A"]);
    expect(latest().canWrite).toBe(true);
    expect(latest().error).toBe(false);
  });

  it("parses host + aggregates only and never surfaces a secret shape", async () => {
    await mount();
    const c = latest().connections[0];
    expect(c.serverUrlHost).toBe("services.example.com");
    expect(c.status).toBe("pending_verification");
    // No credential field of any kind is present on a rendered connection.
    expect(Object.keys(c)).not.toContain("authToken");
    expect(Object.keys(c)).not.toContain("last4");
    expect(JSON.stringify(latest())).not.toContain("secret");
  });

  it("masks another workspace's rows across a switch, then loads the new tenant", async () => {
    await mount();
    expect(latest().connections.map((c) => c.label)).toEqual(["A"]);
    const from = seen.length;
    h.rpc.mockImplementation(defaultRpc({ list: listOk(["B"]) }));
    h.tenant = "b";
    await rerender();
    // Every interim render between the switch and the new load is masked — never tenant A's rows.
    const interim = seen.slice(from);
    expect(interim.some((s) => s.connections.length === 0 && s.loading)).toBe(true);
    expect(interim.every((s) => !s.connections.some((c) => c.label === "A"))).toBe(true);
    expect(latest().connections.map((c) => c.label)).toEqual(["B"]);
  });

  it("distinguishes a failed READ from an empty account", async () => {
    h.rpc.mockImplementation(defaultRpc({ list: { data: null, error: { message: "boom" } } }));
    const host = document.createElement("div");
    root = createRoot(host);
    await act(async () => {
      root!.render(<Probe />);
    });
    await act(async () => {});
    expect(latest().error).toBe(true);
    expect(latest().connections).toEqual([]);
    expect(latest().canWrite).toBe(false);
  });

  it("refuses a write for a non-admin caller with the closed-set forbidden message", async () => {
    h.rpc.mockImplementation(defaultRpc({ admin: { data: false, error: null } }));
    const host = document.createElement("div");
    root = createRoot(host);
    await act(async () => {
      root!.render(<Probe />);
    });
    await act(async () => {});
    expect(latest().canWrite).toBe(false);
    let result: Awaited<ReturnType<UseMcpGateway["createRest"]>> | null = null;
    await act(async () => {
      result = await latest().createRest({ label: "n8n", baseUrl: "https://x.app.n8n.cloud", apiKey: "n8n_api_abc123" });
    });
    expect(result!.ok).toBe(false);
    expect(result!.code).toBe("MCP_FORBIDDEN");
    expect(result!.message).toMatch(/permission/i);
  });

  it("creates a REST connection with NAMED params and the expected-tenant guard", async () => {
    await mount();
    h.rpc.mockImplementation((name: string) => {
      if (name === "create_mcp_rest_connection") {
        return Promise.resolve({ data: { connection_id: "id-new", status: "pending_verification", auth_token_last4: null }, error: null });
      }
      return defaultRpc()(name);
    });
    let result: Awaited<ReturnType<UseMcpGateway["createRest"]>> | null = null;
    await act(async () => {
      result = await latest().createRest({ label: "n8n workflows", baseUrl: "https://x.app.n8n.cloud", apiKey: "n8n_api_abc123456" });
    });
    expect(result!.ok).toBe(true);
    expect(result!.status).toBe("pending_verification");
    const createCall = h.rpc.mock.calls.find((c) => c[0] === "create_mcp_rest_connection");
    expect(createCall).toBeTruthy();
    const params = createCall![1] as Record<string, unknown>;
    // Named binding: label must land on _label, never on the defaulted _provider_key.
    expect(params._provider_key).toBe("n8n");
    expect(params._label).toBe("n8n workflows");
    expect(params._base_url).toBe("https://x.app.n8n.cloud");
    expect(params._api_key).toBe("n8n_api_abc123456");
    expect(params._tenant_id).toBe("a");
  });

  it("maps a duplicate-label refusal to owner-language copy", async () => {
    await mount();
    h.rpc.mockImplementation((name: string) => {
      if (name === "create_mcp_connection") {
        return Promise.resolve({ data: null, error: { message: "MCP_DUPLICATE_LABEL", code: "22023" } });
      }
      return defaultRpc()(name);
    });
    let result: Awaited<ReturnType<UseMcpGateway["createMcp"]>> | null = null;
    await act(async () => {
      result = await latest().createMcp({ providerKey: "generic-remote", label: "A", serverUrl: "https://services.example.com/mcp", authKind: "bearer", authToken: "bearer-token-123456" });
    });
    expect(result!.ok).toBe(false);
    expect(result!.code).toBe("MCP_DUPLICATE_LABEL");
    expect(result!.message).toMatch(/already have a connection with that name/i);
    expect(latest().writeError).toMatch(/already have a connection with that name/i);
  });
});
