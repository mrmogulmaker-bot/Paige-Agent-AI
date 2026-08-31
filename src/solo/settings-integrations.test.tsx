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
import { mcpWriteMessage } from "./data/useMcpConnection";

const context = vi.hoisted(() => ({ tenantId: "tenant-a", loading: false }));
const rpc = vi.hoisted(() => vi.fn());
// The MCP connection writes through an edge function, not an RPC, because only a
// server-side probe may move a connection to `connected`.
const invoke = vi.hoisted(() => vi.fn());

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
    functions: { invoke },
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

/* The n8n drawer holds two independent connections, so every MCP assertion is scoped
   to its own section. An unscoped selector would silently read the API section and
   pass for the wrong reason. */
const mcpSection = (host: HTMLElement) => {
  const section = host.querySelector<HTMLElement>('section[aria-labelledby="ig-sec-mcp"]');
  if (!section) throw new Error("the tool bridge section is not rendered");
  return section;
};
const mcpFields = (host: HTMLElement) => Array.from(mcpSection(host).querySelectorAll<HTMLInputElement>(".ig-field input"));
const mcpButton = (host: HTMLElement, text: string) =>
  Array.from(mcpSection(host).querySelectorAll("button")).find((b) => b.textContent?.includes(text));
const submitMcp = async (host: HTMLElement) => {
  await act(async () => { mcpSection(host).querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await act(async () => { await Promise.resolve(); });
};
/** Connects the bridge with a credential the assertions can then hunt for. */
const connectBridge = async (host: HTMLElement, credential = "bridge-secret-9876") => {
  await type(mcpFields(host)[0], "https://acme.app.n8n.cloud/mcp/9f3a-secret-path");
  await type(mcpFields(host)[1], credential);
  await submitMcp(host);
};
const submit = async (host: HTMLElement) => {
  await act(async () => { host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  context.tenantId = "tenant-a";
  context.loading = false;
  rpc.mockReset();
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true, status: "connected", toolCount: 4 }, error: null });
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
    expect(host.textContent).toContain("Zapier");
  });

  it("never says a connection is live on the card before it has been proven", async () => {
    // A grant is not a working connection. Between the consent completing and the probe
    // succeeding the row is `pending_verification`, and the card must not read as active
    // in that window — nor fall back to a status code the owner has to interpret.
    world({ mcp: { zapier: { configured: true, enabled: true, status: "pending_verification", auth_token_last4: "aaaa" } } });
    const { host } = await render();
    const card = host.querySelector('.ig-card[data-provider="mcp"]');
    expect(card?.textContent).toContain("Setup not finished");
    expect(card?.textContent).not.toContain("Connected");
    expect(card?.textContent).not.toContain("Status not reported");
  });

  it("names the card for the provider, not for the protocol under it", async () => {
    // The slot can only ever hold Zapier — the setter writes that provider and that
    // endpoint, and the registry's CHECK refuses a Zapier row that is not OAuth. The
    // name used to be derived by sniffing the connected host, which meant an owner saw
    // a different card depending on state. It is now what the card IS.
    world();
    const { host } = await render();
    const card = host.querySelector('.ig-card[data-provider="mcp"]');
    expect(card?.textContent).toContain("Zapier");
    // None of the protocol vocabulary belongs on an owner-facing card.
    for (const jargon of ["MCP", "bridge", "transport", "SSE", "Bearer"]) {
      expect(card?.textContent).not.toContain(jargon);
    }
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
    // The card's NAME is now static, so it can no longer serve as the proof that the
    // right row was read. Its STATE can, and is the stronger signal anyway: the two
    // rows are in deliberately different states, so a card reading the wrong one shows
    // the wrong words. Zapier is in error; n8n's MCP row is connected.
    expect(bridge?.textContent).toContain("Needs attention");
    expect(bridge?.textContent).not.toContain("Connected");
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

/**
 * The tool bridge — n8n's second, independent connection.
 *
 * The property under test throughout is that a SAVED connection and a PROVEN one are
 * never shown as the same thing. Every other connection surface on this platform has
 * been able to imply a working integration it never tested; this one cannot, because
 * only a server-side probe writes `connected` and the UI has separate words for every
 * state in between.
 */
describe("n8n tool bridge (MCP)", () => {
  it("offers a connect form when nothing is set up, and claims nothing", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    const section = mcpSection(host);
    expect(section.textContent).toContain("If your n8n instance publishes its own tools");
    expect(section.querySelector("form")).toBeTruthy();
    // "Not connected" and "connected" are the only two claims available before a probe,
    // and neither of the misleading middle states may appear.
    expect(section.textContent).not.toContain("Connected");
  });

  it("saves and PROVES a connection in one act, and reports the proven state", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    await connectBridge(host);

    // The write goes to the probing edge function — never straight to the setter RPC,
    // which can only ever leave a row unproven.
    expect(invoke).toHaveBeenCalledWith("tenant-mcp-connect", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("set_tenant_n8n_mcp_connection", expect.anything());
    const [, options] = invoke.mock.calls.at(-1)!;
    expect(options.body.action).toBe("connect");
    expect(options.body.provider).toBe("n8n");
    // The tenant is resolved server-side from the caller's JWT. Sending one from here
    // would be the argument the server is required to ignore.
    expect(Object.keys(options.body)).not.toContain("tenant_id");
  });

  it("says 'saved, not working' when the probe fails — never 'nothing changed'", async () => {
    world();
    // The row IS stored; the server just rejected the credential. Reporting that as a
    // failed save would tell an admin to retype something that is already correct.
    invoke.mockResolvedValue({ data: { ok: true, status: "error", code: "mcp_http_error" }, error: null });
    const { host } = await render();
    await openCard(host, "n8n");
    await connectBridge(host);
    expect(mcpSection(host).textContent ?? "").toContain("saved but not working");
    expect(mcpSection(host).textContent ?? "").not.toContain("nothing was changed");
  });

  it("still says 'saved' when the probe fails for a reason we do not recognise", async () => {
    // A code with its own sentence reads correctly whichever family it is handed to, so
    // it cannot detect the two being confused. An UNRECOGNISED code can: it falls to the
    // default, where the write family says "nothing was changed" and the probe family
    // says the opposite. This is the case that catches the wiring, and the reason the
    // previous test alone was not enough.
    world();
    invoke.mockResolvedValue({ data: { ok: true, status: "error", code: "some_unmodelled_failure" }, error: null });
    const { host } = await render();
    await openCard(host, "n8n");
    await connectBridge(host);
    const text = mcpSection(host).textContent ?? "";
    expect(text).toContain("It was saved");
    expect(text).not.toContain("nothing was changed");
  });

  it("distinguishes a refused save from a failed probe", async () => {
    // Two different situations, two different sentences. A refused save changed
    // nothing; a failed probe changed something that does not work.
    expect(mcpWriteMessage("MCP_INSECURE_URL", "write")).toContain("https://");
    expect(mcpWriteMessage("mcp_http_error", "probe")).toContain("saved but not working");
    expect(mcpWriteMessage("MCP_FORBIDDEN", "write")).toContain("admin");
    // An unrecognised code still degrades into the right family rather than guessing.
    expect(mcpWriteMessage("something-new", "write")).toContain("nothing was changed");
    expect(mcpWriteMessage("something-new", "probe")).not.toContain("nothing was changed");
  });

  it("never renders a stored connection as connected until a probe has said so", async () => {
    world({ mcp: { n8n: { configured: true, enabled: true, status: "pending_verification", auth_token_last4: "9876", transport: "http", server_url_host: "acme.app.n8n.cloud" } } });
    const { host } = await render();
    await openCard(host, "n8n");
    const text = mcpSection(host).textContent ?? "";
    expect(text).toContain("Saved, not checked yet");
    expect(text).not.toContain("Connected");
  });

  it("never renders the credential or the full server address", async () => {
    const credential = "bridge-secret-9876";
    world({ mcp: { n8n: { configured: true, enabled: true, status: "connected", auth_token_last4: "9876", transport: "http", server_url_host: "acme.app.n8n.cloud" } } });
    const { host } = await render();
    await openCard(host, "n8n");
    await click(mcpButton(host, "Manage"));
    await connectBridge(host, credential);

    // The credential was typed into this document and submitted. After the submit it
    // must exist nowhere in it — not in a value, not in an error, not in the markup.
    expect(host.innerHTML).not.toContain(credential);
    expect(mcpFields(host).map((f) => f.value)).not.toContain(credential);
    // An n8n MCP path is itself a capability, so only the host is ever shown back.
    const text = mcpSection(host).textContent ?? "";
    expect(text).toContain("acme.app.n8n.cloud");
    expect(text).not.toContain("9f3a-secret-path");
  });

  it("re-checks a stored connection without re-sending a credential", async () => {
    world({ mcp: { n8n: { configured: true, enabled: true, status: "error", auth_token_last4: "9876", transport: "http", server_url_host: "acme.app.n8n.cloud" } } });
    const { host } = await render();
    await openCard(host, "n8n");
    await click(mcpButton(host, "Check it again"));
    const [, options] = invoke.mock.calls.at(-1)!;
    expect(options.body.action).toBe("verify");
    // The whole point of a re-check: nothing secret leaves the browser, because
    // nothing secret is in the browser to send.
    expect(Object.keys(options.body)).not.toContain("auth_token");
  });

  it("requires a header name before it will send header authentication", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    const section = mcpSection(host);
    const select = section.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(select, "header");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await type(mcpFields(host)[0], "https://acme.app.n8n.cloud/mcp/x");
    await type(mcpFields(host)[1], "tok");
    const submitButton = mcpButton(host, "Connect the bridge") as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
    // …and becomes possible once the header is named.
    await type(mcpFields(host)[2], "X-N8N-Api-Key");
    expect((mcpButton(host, "Connect the bridge") as HTMLButtonElement).disabled).toBe(false);
  });

  it("lets a non-admin see the state but not change it", async () => {
    world({ admin: false, mcp: { n8n: { configured: true, enabled: true, status: "connected", auth_token_last4: "9876", transport: "http", server_url_host: "acme.app.n8n.cloud" } } });
    const { host } = await render();
    await openCard(host, "n8n");
    const section = mcpSection(host);
    expect(section.textContent).toContain("Connected");
    expect(section.textContent).toContain("Only a workspace admin");
    // The form is the thing that must be absent — not merely disabled.
    expect(section.querySelector("form")).toBeNull();
    expect(mcpButton(host, "Disconnect")).toBeUndefined();
  });

  it("does not claim either way when the connection cannot be read", async () => {
    // The catalogue and this section read the same RPC, so a failure at mount shows
    // the page-level error and no card opens at all. The section's own error branch
    // is reached when the read starts failing AFTER a good mount — a transient fault
    // between opening the page and opening the drawer — so that is what is driven.
    world();
    const { host } = await render();
    rpc.mockImplementation((name: string) => {
      if (name === "get_tenant_mcp_connections") return Promise.resolve({ data: null, error: { message: "boom" } });
      if (name === "get_tenant_n8n_connection") return Promise.resolve({ data: { configured: false }, error: null });
      if (name === "is_current_user_tenant_admin") return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    await openCard(host, "n8n");
    const text = mcpSection(host).textContent ?? "";
    expect(text).toContain("could not be read");
    // Neither "not connected" nor "connected" — an unreadable connection is a third
    // state, and collapsing it into either of the other two would be a claim.
    expect(text).not.toContain("Connected");
    expect(text).not.toContain("If your n8n instance exposes an MCP server");
    expect(mcpSection(host).querySelector("form")).toBeNull();
  });

  it("keeps the two providers' connections apart", async () => {
    // The registry is provider-scoped, so a workspace may hold both at once. Reading
    // one must never surface the other's state — the mislabel this whole slice guards.
    world({ mcp: {
      n8n: { configured: true, enabled: true, status: "error", auth_token_last4: "1111", transport: "sse", server_url_host: "acme.app.n8n.cloud" },
      zapier: { configured: true, enabled: true, status: "connected", auth_token_last4: "2222", transport: "http", server_url_host: "mcp.zapier.com" },
    } });
    const { host } = await render();
    await openCard(host, "n8n");
    const text = mcpSection(host).textContent ?? "";
    expect(text).toContain("Saved, not working");
    expect(text).toContain("1111");
    expect(text).toContain("acme.app.n8n.cloud");
    // Zapier's row is connected. None of it may appear in n8n's section.
    expect(text).not.toContain("2222");
    expect(text).not.toContain("mcp.zapier.com");
    expect(text).not.toContain("Connected");
  });

  it("guards a close from either section, not just the first", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    // Unsaved input in the SECOND section only. A single shared dirty flag would let
    // the untouched first section report clean and discard this silently.
    await type(mcpFields(host)[1], "half-typed-credential");
    await click(byText(host, "Close n8n") ?? host.querySelector(".ig-close") ?? undefined);
    expect(host.textContent).toContain("You have unsaved details here");
    expect(host.querySelector(".ig-panel")).toBeTruthy();
  });
});

/**
 * Zapier — connected by consent, never by a pasted credential.
 *
 * The property that matters most here is a NEGATIVE one: this panel must offer no way to
 * type a secret. A field would invite somebody to paste a long-lived Zapier token, which
 * is a permanent credential in our custody that nobody can rotate and the workspace
 * cannot withdraw from their side. The schema refuses to store one; this proves the
 * surface never asks.
 */
describe("Zapier (consent, not credentials)", () => {
  const zapierSection = (host: HTMLElement) => {
    const panel = host.querySelector<HTMLElement>(".ig-panel");
    if (!panel) throw new Error("the Zapier panel is not open");
    return panel;
  };
  const zapierButton = (host: HTMLElement, text: string) =>
    Array.from(zapierSection(host).querySelectorAll("button")).find((b) => b.textContent?.includes(text));

  let assigned: string[] = [];
  beforeEach(() => {
    assigned = [];
    // jsdom refuses a real navigation, and the assertion is about WHERE we send the
    // person rather than about navigating, so the call is captured.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: (url: string) => assigned.push(url) },
    });
  });

  it("offers no field in which a credential could be typed", async () => {
    world();
    const { host } = await render();
    await openCard(host, "mcp");
    const panel = zapierSection(host);
    expect(panel.querySelector("input")).toBeNull();
    expect(panel.querySelector("form")).toBeNull();
    expect(panel.textContent).toContain("Nothing is pasted here");
    expect(zapierButton(host, "Connect Zapier")).toBeTruthy();
  });

  it("asks the server where to send the person, and never builds that address itself", async () => {
    world();
    invoke.mockResolvedValue({ data: { ok: true, authorize_url: "https://as.zapier.example/authorize?code_challenge=abc&state=xyz" }, error: null });
    const { host } = await render();
    await openCard(host, "mcp");
    await click(zapierButton(host, "Connect Zapier"));

    const [, options] = invoke.mock.calls.at(-1)!;
    expect(options.body).toEqual({ provider: "zapier", action: "oauth_begin" });
    // Everything about the consent URL — the issuer, the client, the challenge — is
    // discovered and composed server-side. The browser only follows.
    expect(assigned).toEqual(["https://as.zapier.example/authorize?code_challenge=abc&state=xyz"]);
  });

  it("says so plainly when the connection cannot be started", async () => {
    world();
    invoke.mockResolvedValue({ data: { error: "oauth_begin_failed", code: "discovery_failed" }, error: null });
    const { host } = await render();
    await openCard(host, "mcp");
    await click(zapierButton(host, "Connect Zapier"));
    expect(zapierSection(host).textContent).toContain("could not be reached");
    // Nowhere to go is better than somewhere wrong.
    expect(assigned).toEqual([]);
  });

  it("separates being connected from having approved anything", async () => {
    // A granted connection lets Paige SEE what exists. It does not let her run any of it,
    // and a workspace that thinks otherwise has been misled by this screen.
    world({ mcp: { zapier: { configured: true, enabled: true, status: "connected", auth_token_last4: "aaaa", transport: "http", server_url_host: "mcp.zapier.com", approved_capabilities: [] } } });
    const { host } = await render();
    await openCard(host, "mcp");
    const text = zapierSection(host).textContent ?? "";
    expect(text).toContain("Connected");
    expect(text).toContain("She runs nothing until you approve");
  });

  it("never renders a stored grant as connected before the probe says so", async () => {
    world({ mcp: { zapier: { configured: true, enabled: true, status: "pending_verification", auth_token_last4: "aaaa", transport: "http", server_url_host: "mcp.zapier.com" } } });
    const { host } = await render();
    await openCard(host, "mcp");
    const text = zapierSection(host).textContent ?? "";
    expect(text).toContain("Saved, not checked yet");
    expect(text).not.toContain("Connected");
  });

  it("re-checks and disconnects without ever sending a credential", async () => {
    world({ mcp: { zapier: { configured: true, enabled: true, status: "error", auth_token_last4: "aaaa", transport: "http", server_url_host: "mcp.zapier.com" } } });
    const { host } = await render();
    await openCard(host, "mcp");

    await click(zapierButton(host, "Check it again"));
    expect(invoke.mock.calls.at(-1)![1].body).toEqual({ provider: "zapier", action: "verify" });

    await click(zapierButton(host, "Disconnect"));
    await click(zapierButton(host, "Disconnect it"));
    expect(invoke.mock.calls.at(-1)![1].body).toEqual({ provider: "zapier", action: "disconnect" });
    // No token, no key, no client secret — this browser has never held one.
    for (const [, options] of invoke.mock.calls) {
      expect(Object.keys(options.body).join(",")).not.toMatch(/token|secret|key|verifier/i);
    }
  });

  it("lets a non-admin see the state but not grant anything", async () => {
    world({ admin: false, mcp: { zapier: { configured: true, enabled: true, status: "connected", auth_token_last4: "aaaa", transport: "http", server_url_host: "mcp.zapier.com" } } });
    const { host } = await render();
    await openCard(host, "mcp");
    const panel = zapierSection(host);
    expect(panel.textContent).toContain("Connected");
    expect(panel.textContent).toContain("Only a workspace admin");
    expect(zapierButton(host, "Connect Zapier")).toBeUndefined();
    expect(zapierButton(host, "Disconnect")).toBeUndefined();
  });

  it("keeps n8n's own connections out of Zapier's panel", async () => {
    world({ mcp: {
      n8n: { configured: true, enabled: true, status: "connected", auth_token_last4: "1111", transport: "sse", server_url_host: "acme.app.n8n.cloud" },
      zapier: { configured: true, enabled: true, status: "error", auth_token_last4: "2222", transport: "http", server_url_host: "mcp.zapier.com" },
    } });
    const { host } = await render();
    await openCard(host, "mcp");
    const text = zapierSection(host).textContent ?? "";
    // The address is no longer shown on this panel, so state is the discriminator: the
    // two rows are in deliberately opposite states, and a panel reading n8n's would say
    // Connected. It must say Zapier's.
    expect(text).toContain("Saved, not working");
    expect(text).not.toContain("Connected");
    expect(text).not.toContain("acme.app.n8n.cloud");
    expect(text).not.toContain("1111");
  });
});

/**
 * Approving what Paige may run.
 *
 * Connecting is reachability; this is authority. The properties worth holding are the ones
 * that would let authority widen by accident: approving against a stale list, approving a
 * contract nobody looked at, or offering the choice at all against a connection that has
 * never been proven to work.
 */
describe("Capability approval", () => {
  const connected = (over = {}) => ({
    zapier: { configured: true, enabled: true, status: "connected", auth_token_last4: "aaaa",
              transport: "http", server_url_host: "mcp.zapier.com", approved_capabilities: [], ...over },
  });
  const panel = (host: HTMLElement) => host.querySelector<HTMLElement>(".ig-panel")!;
  const capsButton = (host: HTMLElement, text: string) =>
    Array.from(panel(host).querySelectorAll("button")).find((b) => b.textContent?.includes(text));
  const capRows = (host: HTMLElement) =>
    Array.from(panel(host).querySelectorAll<HTMLButtonElement>(".ig-caplist button"));

  const TOOLS = [
    { name: "send_email", description: "Send an email", schema_hash: "a".repeat(64), approved: false },
    { name: "delete_row", description: "Delete a row", schema_hash: "b".repeat(64), approved: false },
  ];

  it("is not offered until the connection has been PROVEN", async () => {
    // Offering approvals against an unproven connection would show a list that cannot
    // load — or record approvals for a provider we have never successfully reached.
    world({ mcp: connected({ status: "pending_verification" }) });
    const { host } = await render();
    await openCard(host, "mcp");
    expect(panel(host).querySelector(".ig-caps")).toBeNull();
  });

  it("says plainly that nothing is approved, and does not call the provider until asked", async () => {
    world({ mcp: connected() });
    const { host } = await render();
    await openCard(host, "mcp");
    expect(panel(host).textContent).toContain("Nothing is approved yet");
    // Discovery is an outbound request; it does not happen just because a panel opened.
    expect(invoke.mock.calls.some((c) => c[1].body.action === "discover")).toBe(false);

    invoke.mockResolvedValue({ data: { ok: true, tools: TOOLS }, error: null });
    await click(capsButton(host, "See what is available"));
    expect(invoke.mock.calls.at(-1)![1].body).toEqual({ provider: "zapier", action: "discover" });
    expect(capRows(host).map((b) => b.textContent)).toHaveLength(2);
    expect(capRows(host).every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("approves a name together with the contract it was shown with", async () => {
    world({ mcp: connected() });
    invoke.mockResolvedValue({ data: { ok: true, tools: TOOLS }, error: null });
    const { host } = await render();
    await openCard(host, "mcp");
    await click(capsButton(host, "See what is available"));

    await click(capRows(host)[0]);
    invoke.mockResolvedValue({ data: { ok: true, approved_count: 1, pinned_count: 1 }, error: null });
    await click(capsButton(host, "Approve 1 of 2"));

    const body = invoke.mock.calls.at(-1)![1].body;
    expect(body.action).toBe("approve");
    expect(body.capabilities).toEqual(["send_email"]);
    // The pin is the fingerprint of the contract on screen. Without it the server has no
    // way to tell the provider changed between looking and approving.
    expect(body.pins).toEqual({ send_email: "a".repeat(64) });
    // And nothing was approved that was never ticked.
    expect(body.capabilities).not.toContain("delete_row");
  });

  it("approves the whole list, so unticking withdraws", async () => {
    world({ mcp: connected() });
    invoke.mockResolvedValue({ data: { ok: true, tools: TOOLS.map((t) => ({ ...t, approved: true })) }, error: null });
    const { host } = await render();
    await openCard(host, "mcp");
    await click(capsButton(host, "See what is available"));
    expect(capRows(host).every((b) => b.getAttribute("aria-pressed") === "true")).toBe(true);

    await click(capRows(host)[1]);
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await click(capsButton(host, "Approve 1 of 2"));
    // A statement of the whole set, not an addition to it.
    expect(invoke.mock.calls.at(-1)![1].body.capabilities).toEqual(["send_email"]);
  });

  it("refuses to record consent to a list that moved, and reloads it", async () => {
    world({ mcp: connected() });
    invoke.mockResolvedValue({ data: { ok: true, tools: TOOLS }, error: null });
    const { host } = await render();
    await openCard(host, "mcp");
    await click(capsButton(host, "See what is available"));
    await click(capRows(host)[0]);

    invoke.mockResolvedValue({ data: { error: "capabilities_changed", changed: ["send_email"] }, error: null });
    await click(capsButton(host, "Approve 1 of 2"));

    expect(panel(host).textContent).toContain("changed while you were choosing");
    expect(panel(host).textContent).toContain("nothing was approved");
    // The list on screen is stale; leaving it up would invite approving it again.
    expect(invoke.mock.calls.at(-1)![1].body.action).toBe("discover");
  });

  it("cannot save until something actually changed", async () => {
    world({ mcp: connected() });
    invoke.mockResolvedValue({ data: { ok: true, tools: TOOLS }, error: null });
    const { host } = await render();
    await openCard(host, "mcp");
    await click(capsButton(host, "See what is available"));
    expect((capsButton(host, "Approve 0 of 2") as HTMLButtonElement).disabled).toBe(true);
    await click(capRows(host)[0]);
    expect((capsButton(host, "Approve 1 of 2") as HTMLButtonElement).disabled).toBe(false);
  });

  it("is not offered to someone who cannot grant it", async () => {
    world({ admin: false, mcp: connected() });
    const { host } = await render();
    await openCard(host, "mcp");
    expect(panel(host).querySelector(".ig-caps")).toBeNull();
  });
});
