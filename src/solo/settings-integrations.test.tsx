/**
 * Settings → Integrations.
 *
 * Two things are proven here. First the standing truth boundary: this surface
 * only ever calls server-resolved, tenant-scoped status RPCs, never passes a
 * tenant argument, never renders a payload, and never links anywhere. Second
 * the n8n connection flow end to end, through the rendered UI: connect from
 * empty, manage, reconnect, disconnect, reload, permission, invalid input,
 * retry, dirty abandonment, and tenant isolation.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloIntegrationsView } from "./settings-integrations";
import { n8nWriteMessage } from "./data/useN8nConnection";

const context = vi.hoisted(() => ({ tenantId: "tenant-a", loading: false }));
const rpc = vi.hoisted(() => vi.fn());

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: context.tenantId, loading: context.loading }),
}));
// `from` is stubbed as well as `rpc` because one test navigates to the
// Automations leaf, which mounts `useSoloAutomations` and reads real tables.
// Without it that hook throws asynchronously AFTER the test has passed, which
// vitest reports as an unhandled rejection and a non-zero exit while every
// test still shows green — a failure mode that is invisible unless the exit
// code is checked.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    // Defined inline: `vi.mock` is hoisted above any top-level const.
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/**
 * Default world: n8n API unconfigured, no MCP connection for any provider, caller
 * is a tenant admin. `mcp` is PROVIDER-KEYED because the registry is provider
 * scoped — one workspace may hold an n8n MCP endpoint and a Zapier one at once.
 */
function world(over: {
  n8n?: Record<string, unknown> | null;
  mcp?: Partial<Record<"n8n" | "zapier", Record<string, unknown>>> | null;
  admin?: boolean;
  writeError?: { message: string } | null;
} = {}) {
  rpc.mockImplementation((name: string) => {
    if (name === "get_tenant_n8n_connection") return Promise.resolve({ data: over.n8n ?? { configured: false, status: "unconfigured" }, error: null });
    if (name === "get_tenant_mcp_connections") return Promise.resolve({ data: over.mcp ?? {}, error: null });
    if (name === "is_current_user_tenant_admin") return Promise.resolve({ data: over.admin !== false, error: null });
    if (name === "set_tenant_n8n_connection" || name === "clear_tenant_n8n_connection") {
      return Promise.resolve({ data: null, error: over.writeError ?? null });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

async function render() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={["/solo/1971670/settings/integrations"]}><SoloIntegrationsView /></MemoryRouter>));
  await act(async () => { await Promise.resolve(); });
  return { host, root };
}

const buttons = (host: HTMLElement) => Array.from(host.querySelectorAll("button"));
const byText = (host: HTMLElement, text: string) => buttons(host).find((b) => b.textContent?.includes(text));
const click = async (el: Element | undefined) => { await act(async () => { el?.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
const openCard = async (host: HTMLElement, provider: string) => {
  await click(host.querySelector(`.ig-card[data-provider="${provider}"]`) ?? undefined);
};
const type = async (input: Element | null | undefined, value: string) => {
  const field = input as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const fields = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLInputElement>(".ig-field input"));
const submit = async (host: HTMLElement) => {
  await act(async () => { host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  context.tenantId = "tenant-a";
  context.loading = false;
  rpc.mockReset();
  document.body.innerHTML = "";
});

describe("Truth boundary", () => {
  it("calls only server-resolved safe status RPCs, with no tenant argument, and renders no payload", async () => {
    world({ n8n: { configured: true, status: "connected", label: "Workflow bridge", workflow_count: 3, secret: "must-not-survive", raw_payload: "must-not-survive", last_error: "must-not-survive" } });
    const { host } = await render();
    expect(rpc).toHaveBeenCalledWith("get_tenant_n8n_connection");
    expect(rpc).toHaveBeenCalledWith("get_tenant_mcp_connections");
    // No status read may carry a tenant argument: the seam derives it.
    for (const call of rpc.mock.calls.filter((c) => String(c[0]).startsWith("get_"))) {
      expect(call.length).toBe(1);
    }
    expect(host.textContent).toContain("Connected");
    expect(host.textContent).not.toContain("must-not-survive");
  });

  it("links nowhere at all — not to Automations, Command Center, Marketplace or a provider", async () => {
    world({ n8n: { configured: true, status: "connected" } });
    const { host } = await render();
    // The owner's rule, enforced structurally: an integration card operates its
    // own integration and never navigates.
    expect(host.querySelectorAll("a").length).toBe(0);
    await openCard(host, "n8n");
    expect(host.querySelectorAll("a").length).toBe(0);
    const labels = buttons(host).map((b) => b.textContent ?? "");
    expect(labels.some((l) => /open automations|command center|marketplace|systems check|mind/i.test(l))).toBe(false);
  });

  it("fails closed with a retry surface and claims no connection state", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve({
      data: null,
      error: name.startsWith("get_") ? { message: "read failed" } : null,
    }));
    const { host } = await render();
    expect(host.textContent).toMatch(/could not be read/i);
    expect(host.textContent).not.toMatch(/connected/i);
    expect(host.querySelector(".ig-grid")).toBeNull();
    expect(byText(host, "Try again")).toBeTruthy();
  });

  it("clears the previous account immediately and rejects its late response", async () => {
    const first = deferred<{ data: unknown; error: null }>();
    rpc.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => first.promise);
    const { host, root } = await render();

    context.tenantId = "tenant-b";
    world({ n8n: { configured: true, status: "connected", label: "Tenant B bridge" } });
    await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));
    await act(async () => { await Promise.resolve(); });

    first.resolve({ data: { configured: true, status: "connected", label: "Late tenant A bridge" }, error: null });
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).not.toContain("Late tenant A bridge");
  });

  it("uses Zapier identity only when the safe MCP host proves Zapier", async () => {
    world({ mcp: { zapier: { configured: true, status: "connected", server_url_host: "https://mcp.zapier.com/x" } } });
    const { host } = await render();
    expect(host.textContent).toContain("Zapier MCP");
  });

  it("keeps an unknown MCP server neutral rather than branding it", async () => {
    world({ mcp: { zapier: { configured: true, status: "connected", server_url_host: "https://mcp.example.dev/x" } } });
    const { host } = await render();
    expect(host.textContent).toContain("MCP bridge");
    expect(host.textContent).not.toContain("Zapier");
  });

  it("never reads one MCP provider's state onto the other", async () => {
    // The registry is provider-scoped. With BOTH connected and in deliberately
    // DIFFERENT states, a card that picked an arbitrary row would show the wrong
    // one — the frontend half of the same nondeterminism fixed in the systems
    // check. The MCP bridge card reports Zapier; n8n's MCP state is not its own.
    world({
      mcp: {
        zapier: { configured: true, status: "error", server_url_host: "https://mcp.zapier.com/x" },
        n8n: { configured: true, status: "connected", server_url_host: "https://harness.app.n8n.cloud" },
      },
    });
    const { host } = await render();
    const bridge = host.querySelector('.ig-card[data-provider="mcp"]');
    // Provider identity is resolved from ZAPIER's host. Reading n8n's row instead
    // would fail `isZapierMcpHost` and render the generic "MCP bridge", so this
    // name is the observable proof that the right provider row was selected.
    expect(bridge?.textContent).toContain("Zapier MCP");
    expect(bridge?.textContent).not.toContain("n8n");
    // The n8n card reports the shipped API-key connection, never n8n's MCP row —
    // that row is connected here, and the card must still say Not connected.
    expect(host.querySelector('.ig-card[data-provider="n8n"]')?.textContent).toContain("Not connected");
  });

  it("filters the catalogue with accessible pressed controls", async () => {
    world();
    const { host } = await render();
    const all = host.querySelectorAll(".ig-card").length;
    expect(all).toBeGreaterThan(1);
    await click(byText(host, "Documents"));
    expect(host.querySelectorAll(".ig-card").length).toBeLessThan(all);
    expect(host.querySelector('.ig-bar button[aria-pressed="true"]')?.textContent).toBe("Documents");
  });

  it("offers no setup for a provider with no tenant-safe contract, and says so plainly", async () => {
    world();
    const { host } = await render();
    await openCard(host, "stripe");
    expect(host.querySelector('[role="dialog"]')?.textContent).toMatch(/not claimed|not offered here yet/i);
    expect(host.querySelector(".ig-form")).toBeNull();
    // Opening a card that owns no n8n seam must not read the n8n connection.
    const n8nAdminReads = rpc.mock.calls.filter((c) => c[0] === "is_current_user_tenant_admin");
    expect(n8nAdminReads.length).toBe(0);
  });
});

describe("n8n connection flow", () => {
  it("connects from empty and never keeps the key after submitting", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    expect(host.querySelector('[role="dialog"]')?.textContent).toMatch(/never shown again/i);

    const [url, key, label] = fields(host);
    await type(url, "https://mine.app.n8n.cloud");
    await type(key, "n8n_api_SUPERSECRET");
    await type(label, "My instance");
    await submit(host);

    const call = rpc.mock.calls.find((c) => c[0] === "set_tenant_n8n_connection");
    expect(call?.[1]).toEqual({ _base_url: "https://mine.app.n8n.cloud", _api_key: "n8n_api_SUPERSECRET", _label: "My instance" });
    // The write carries no tenant argument: the seam derives and enforces it.
    expect(Object.keys(call?.[1] ?? {})).not.toContain("_tenant_id");
    // The key must be gone from the document the moment it is submitted.
    expect(host.innerHTML).not.toContain("SUPERSECRET");
    expect(fields(host).some((f) => f.value.includes("SUPERSECRET"))).toBe(false);
  });

  it("blocks submission until both the address and a key are present", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    const connect = byText(host, "Connect n8n");
    expect((connect as HTMLButtonElement).disabled).toBe(true);
    await type(fields(host)[0], "https://mine.app.n8n.cloud");
    expect((byText(host, "Connect n8n") as HTMLButtonElement).disabled).toBe(true);
    await type(fields(host)[1], "k");
    expect((byText(host, "Connect n8n") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows an existing connection by its last four only, never the key", async () => {
    world({ n8n: { configured: true, status: "connected", label: "Ops", base_url: "https://ops.app.n8n.cloud", api_key_last4: "9f2a", workflow_count: 7 } });
    const { host } = await render();
    await openCard(host, "n8n");
    const panel = host.querySelector('[role="dialog"]')?.textContent ?? "";
    expect(panel).toContain("ops.app.n8n.cloud");
    expect(panel).toContain("••••••••9f2a");
    expect(panel).toContain("Ops");
    expect(byText(host, "Manage")).toBeTruthy();
    expect(byText(host, "Disconnect")).toBeTruthy();
  });

  it("reconnects a broken connection with the address prefilled and the key required again", async () => {
    world({ n8n: { configured: true, status: "error", base_url: "https://ops.app.n8n.cloud", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    expect(byText(host, "Reconnect")).toBeTruthy();
    await click(byText(host, "Reconnect"));
    const [url, key] = fields(host);
    expect(url.value).toBe("https://ops.app.n8n.cloud");
    expect(key.value).toBe("");
    expect((byText(host, "Save changes") as HTMLButtonElement).disabled).toBe(true);
  });

  it("disconnects only after an explicit confirmation", async () => {
    world({ n8n: { configured: true, status: "connected", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    await click(byText(host, "Disconnect"));
    expect(rpc.mock.calls.some((c) => c[0] === "clear_tenant_n8n_connection")).toBe(false);
    await click(byText(host, "Disconnect it"));
    expect(rpc.mock.calls.some((c) => c[0] === "clear_tenant_n8n_connection")).toBe(true);
  });

  it("re-reads the connection after a write so the panel reflects what persisted", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    const before = rpc.mock.calls.filter((c) => c[0] === "get_tenant_n8n_connection").length;
    await type(fields(host)[0], "https://mine.app.n8n.cloud");
    await type(fields(host)[1], "key");
    await submit(host);
    const after = rpc.mock.calls.filter((c) => c[0] === "get_tenant_n8n_connection").length;
    expect(after).toBeGreaterThan(before);
  });

  it("denies a non-admin the controls and says who can change it", async () => {
    world({ admin: false, n8n: { configured: true, status: "connected", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    expect(host.querySelector('[role="dialog"]')?.textContent).toMatch(/only a workspace admin/i);
    expect(host.querySelector(".ig-form")).toBeNull();
    expect(byText(host, "Disconnect")).toBeFalsy();
    expect(byText(host, "Manage")).toBeFalsy();
  });

  it("denies a non-admin the connect form on an unconfigured workspace", async () => {
    // The case where only the permission gate stands between a reader and the
    // form: with nothing configured, the form is what would otherwise render.
    world({ admin: false, n8n: { configured: false, status: "unconfigured" } });
    const { host } = await render();
    await openCard(host, "n8n");
    expect(host.querySelector(".ig-form")).toBeNull();
    expect(fields(host).length).toBe(0);
    expect(byText(host, "Connect n8n")).toBeFalsy();
    expect(host.querySelector('[role="dialog"]')?.textContent).toMatch(/only a workspace admin/i);
  });

  it("reports a rejected write in the product's own words, never the database's", async () => {
    world({ writeError: { message: 'N8N_INSECURE_URL: instance URL must be https:// (SQLSTATE 22023) column "base_url_ct"' } });
    const { host } = await render();
    await openCard(host, "n8n");
    await type(fields(host)[0], "http://mine.example");
    await type(fields(host)[1], "key");
    await submit(host);
    const panel = host.querySelector('[role="dialog"]')?.textContent ?? "";
    expect(panel).toMatch(/has to start with https/i);
    expect(panel).not.toMatch(/SQLSTATE|column "|N8N_INSECURE_URL/);
  });

  it("lets the owner retry after a failure, and clears the key on the failed attempt too", async () => {
    world({ writeError: { message: "N8N_FORBIDDEN: admin required" } });
    const { host } = await render();
    await openCard(host, "n8n");
    await type(fields(host)[0], "https://mine.app.n8n.cloud");
    await type(fields(host)[1], "FAILEDSECRET");
    await submit(host);
    expect(host.querySelector('[role="dialog"]')?.textContent).toMatch(/only a workspace admin/i);
    // A failed save must not leave the secret sitting in the field.
    expect(host.innerHTML).not.toContain("FAILEDSECRET");

    world();
    await type(fields(host)[1], "goodkey");
    await submit(host);
    expect(rpc.mock.calls.some((c) => c[0] === "set_tenant_n8n_connection" && (c[1] as Record<string, unknown>)?._api_key === "goodkey")).toBe(true);
  });

  it("asks before discarding half-entered connection details", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    await type(fields(host)[0], "https://half-typed.example");
    await click(host.querySelector(".ig-close") ?? undefined);
    // Still open, with an explicit choice.
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.textContent).toMatch(/unsaved details/i);
    await click(byText(host, "Keep editing"));
    expect(host.querySelector(".ig-form")).toBeTruthy();
    await click(host.querySelector(".ig-close") ?? undefined);
    await click(byText(host, "Discard them"));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("closes without a prompt when nothing was typed", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    await click(host.querySelector(".ig-close") ?? undefined);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("Review findings", () => {
  it("keeps the Automations tab reachable from an unknown legacy leaf", async () => {
    world();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/solo/1971670/settings/integrations/something-retired"]}>
        <SoloIntegrationsView />
      </MemoryRouter>,
    ));
    await act(async () => { await Promise.resolve(); });
    // Falls back to the catalogue...
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Integrations");
    // ...and the other tab still opens, rather than navigating to
    // `…/something-retired/automations`, which reads as the catalogue again.
    await click(byText(host, "Automations"));
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Automations");
    expect(host.querySelector(".ig-grid")).toBeNull();
  });

  it("refreshes the card grid after a connection is made", async () => {
    world();
    const { host } = await render();
    expect(host.querySelector('.ig-card[data-provider="n8n"]')?.textContent).toContain("Not connected");

    await openCard(host, "n8n");
    await type(fields(host)[0], "https://mine.app.n8n.cloud");
    await type(fields(host)[1], "key");
    // The catalogue read must run again on success, or the card behind the
    // panel keeps claiming the old state.
    world({ n8n: { configured: true, status: "connected", api_key_last4: "9f2a" } });
    const before = rpc.mock.calls.filter((c) => c[0] === "get_tenant_mcp_connections").length;
    await submit(host);
    const after = rpc.mock.calls.filter((c) => c[0] === "get_tenant_mcp_connections").length;
    expect(after).toBeGreaterThan(before);
    expect(host.querySelector('.ig-card[data-provider="n8n"]')?.textContent).toContain("Connected");
  });

  it("refreshes the card grid after a disconnection", async () => {
    world({ n8n: { configured: true, status: "connected", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    await click(byText(host, "Disconnect"));
    world();
    await click(byText(host, "Disconnect it"));
    await act(async () => { await Promise.resolve(); });
    expect(host.querySelector('.ig-card[data-provider="n8n"]')?.textContent).toContain("Not connected");
  });

  it("does not offer to remove a name the seam cannot clear", async () => {
    world({ n8n: { configured: true, status: "connected", label: "Ops", base_url: "https://ops.app.n8n.cloud", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    await click(byText(host, "Manage"));
    await type(fields(host)[2], "");
    expect(host.querySelector(".ig-form")?.textContent).toMatch(/changed here but not removed/i);

    // The load-bearing part: an emptied name is not a pending change, so
    // closing does not claim there are unsaved details. (Asserting the Save
    // button here would be vacuous — it is disabled anyway while the key is
    // blank, so it passes with or without the fix.)
    await click(host.querySelector(".ig-close") ?? undefined);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).not.toMatch(/unsaved details/i);
  });

  it("still treats a genuine name change as a pending change", async () => {
    world({ n8n: { configured: true, status: "connected", label: "Ops", base_url: "https://ops.app.n8n.cloud", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    await click(byText(host, "Manage"));
    await type(fields(host)[2], "Ops renamed");
    await click(host.querySelector(".ig-close") ?? undefined);
    expect(host.textContent).toMatch(/unsaved details/i);
  });

  it("returns focus to the card that opened the panel", async () => {
    world();
    const { host } = await render();
    const card = host.querySelector<HTMLButtonElement>('.ig-card[data-provider="stripe"]');
    card?.focus();
    await click(card ?? undefined);
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    await click(host.querySelector(".ig-close") ?? undefined);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(card);
  });
});

describe("Write-error language", () => {
  it("maps every modelled rejection without leaking its code", () => {
    const cases: Array<[string, RegExp]> = [
      ["N8N_FORBIDDEN: admin required", /workspace admin/i],
      ["N8N_INSECURE_URL: must be https", /https/i],
      ["N8N_NO_URL: required", /address/i],
      ["N8N_NO_KEY: required", /api key/i],
      ["N8N_NO_TENANT", /workspace could not be identified/i],
      ['duplicate key value violates unique constraint "uniq_x"', /did not save/i],
    ];
    for (const [raw, expected] of cases) {
      const message = n8nWriteMessage(raw);
      expect(message).toMatch(expected);
      expect(message).not.toMatch(/N8N_|SQLSTATE|constraint|violates|column "/);
    }
  });
});
