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
// The MCP connection writes through an edge function, not an RPC, because only a
// server-side probe may move a connection to `connected`.
const invoke = vi.hoisted(() => vi.fn());

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: context.tenantId, activeUserId: "user-a", loading: context.loading }),
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
      select: () => {
        // `.is` is here because the REAL chain has it: `useSoloAutomations` reads
        // pipeline_stages as .eq(...).is("archived_at", null).order(...). Without it the
        // read throws inside a `Promise.all`, which surfaces as an UNHANDLED REJECTION —
        // every assertion in this file still passes and the run still fails, which is a
        // worse failure mode than a red assertion because the summary reads green.
        const ordered = { order: () => Promise.resolve({ data: [], error: null }) };
        return { eq: () => ({ ...ordered, is: () => ordered }) };
      },
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
  zapierApi?: Record<string, unknown>;
  admin?: boolean;
  writeError?: { message: string } | null;
} = {}) {
  let api: Record<string, unknown> = { tenant_id: context.tenantId, can_write: over.admin !== false, label: null, base_url: null, checked_at: null, last_success_at: null, failure_code: over.n8n?.status === "error" ? "authentication_rejected" : null, health: over.n8n?.configured ? over.n8n.status === "error" ? "needs_attention" : "saved_unverified" : "not_configured", configured: false, workflow_count: null, ...over.n8n };
  const zapierApi = { tenant_id: context.tenantId, can_manage: over.admin !== false, state: "not_connected", failure_code: null, accessible_zap_count: null, last_checked_at: null, last_success_at: null, capabilities: [], limitations: [], ...over.zapierApi };
  rpc.mockImplementation((name: string) => {
    if (name === "get_tenant_n8n_api_readiness") return Promise.resolve({ data: api, error: null });
    if (name === "get_tenant_mcp_connections") return Promise.resolve({ data: over.mcp ?? {}, error: null });
    if (name === "is_current_user_tenant_admin") return Promise.resolve({ data: over.admin !== false, error: null });
    return Promise.resolve({ data: null, error: null });
  });
  invoke.mockImplementation((name: string, options: { body: Record<string, unknown> }) => {
    if (name === "tenant-zapier-api-connect" && options.body.action === "status") return Promise.resolve({ data: { ok: true, connection: zapierApi }, error: null });
    if (name !== "tenant-n8n-api-connect") return Promise.resolve({ data: { ok: true, status: "connected", toolCount: 4 }, error: null });
    if (over.writeError) return Promise.resolve({ data: { error: over.writeError.message }, error: {} });
    const disconnected = options.body.action === "disconnect";
    api = { ...api, configured: !disconnected, health: disconnected ? "not_configured" : "connected", failure_code: null, workflow_count: disconnected ? null : 0, checked_at: disconnected ? null : "2026-09-03T12:00:00Z", last_success_at: disconnected ? null : "2026-09-03T12:00:00Z" };
    return Promise.resolve({ data: { ok: true, saved: options.body.action === "save" ? true : undefined, outcome: disconnected ? "disconnected" : "connected", connection: api }, error: null });
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
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true, status: "connected", toolCount: 4 }, error: null });
  document.body.innerHTML = "";
});

describe("Truth boundary", () => {
  it("calls only server-resolved safe status RPCs, with no tenant argument, and renders no payload", async () => {
    world({ n8n: { configured: true, status: "connected", label: "Workflow bridge", workflow_count: 3, secret: "must-not-survive", raw_payload: "must-not-survive", last_error: "must-not-survive" } });
    const { host } = await render();
    expect(rpc).toHaveBeenCalledWith("get_tenant_n8n_api_readiness");
    expect(rpc).toHaveBeenCalledWith("get_tenant_mcp_connections");
    // No status read may carry a tenant argument: the seam derives it.
    for (const call of rpc.mock.calls.filter((c) => String(c[0]).startsWith("get_"))) {
      expect(call.length).toBe(1);
    }
    expect(host.textContent).toContain("Needs attention");
    expect(host.textContent).not.toContain("must-not-survive");
  });

  it("links nowhere at all — not to Automations, Command Center, Marketplace or a provider", async () => {
    world({ n8n: { configured: true, status: "connected" } });
    const { host } = await render();
    // The owner's rule, enforced structurally: an integration card operates its
    // own integration and never navigates.
    expect(host.querySelectorAll("a").length).toBe(0);
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
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
    expect(host.querySelector(".ig-grid")).toBeTruthy();
    expect(host.textContent).toContain("Status unavailable");
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

  it("names the card for the provider AND says which kind of connection it is", async () => {
    // The slot can only ever hold Zapier — the setter writes that provider and that
    // endpoint, and the registry's CHECK refuses a Zapier row that is not OAuth. The
    // name used to be derived by sniffing the connected host, which meant an owner saw
    // a different card depending on state. It is now what the card IS.
    //
    // "MCP" WAS BANNED HERE AND IS NOW REQUIRED. Owner ruling, 2026-08-31: the old rule
    // treated the term as protocol jargon and hid it, which is defensible in the abstract
    // and failed the actual person. Someone who came looking for an MCP connection stood
    // on this screen and could not tell whether they had one. A sentence can be correct
    // and still leave a reader unable to recognise the thing in front of them; recognition
    // wins. The rest of the protocol vocabulary stays out — those are implementation
    // details a workspace never asked about, whereas "MCP" is the name of the thing they
    // came to connect.
    world();
    const { host } = await render();
    const card = host.querySelector('.ig-card[data-provider="mcp"]');
    expect(card?.textContent).toContain("Zapier");
    expect(card?.textContent).toContain("Automation");
    for (const jargon of ["bridge", "transport", "SSE", "Bearer", "JSON-RPC"]) {
      expect(card?.textContent).not.toContain(jargon);
    }
  });

  it("never reads one MCP provider's state onto the other", async () => {
    // The registry is provider-scoped. With BOTH connected and in deliberately
    // DIFFERENT states, a card that picked an arbitrary row would show the wrong
    // one — the frontend half of the same nondeterminism fixed in the systems
    // check. The Zapier card reports Zapier; n8n's registry state is not its own.
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
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    expect(host.querySelector('[role="dialog"]')?.textContent).toMatch(/never displayed after this/i);

    const [url, key, label] = fields(host);
    await type(url, "https://mine.app.n8n.cloud");
    await type(key, "n8n_api_SUPERSECRET");
    await type(label, "My instance");
    await submit(host);

    const call = invoke.mock.calls.find((c) => c[0] === "tenant-n8n-api-connect");
    expect(call?.[1].body).toEqual({ action: "save", expected_tenant_id: "tenant-a", base_url: "https://mine.app.n8n.cloud", api_key: "n8n_api_SUPERSECRET", label: "My instance" });
    // The write carries no tenant argument: the seam derives and enforces it.
    expect(call?.[1]?.body.expected_tenant_id).toBe("tenant-a");
    // The key must be gone from the document the moment it is submitted.
    expect(host.innerHTML).not.toContain("SUPERSECRET");
    expect(fields(host).some((f) => f.value.includes("SUPERSECRET"))).toBe(false);
  });

  it("blocks submission until both the address and a key are present", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    const connect = byText(host, "Save and check connection");
    expect((connect as HTMLButtonElement).disabled).toBe(true);
    await type(fields(host)[0], "https://mine.app.n8n.cloud");
    expect((byText(host, "Save and check connection") as HTMLButtonElement).disabled).toBe(true);
    await type(fields(host)[1], "k");
    expect((byText(host, "Save and check connection") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows an existing connection as stored, never the key", async () => {
    world({ n8n: { configured: true, status: "connected", label: "Ops", base_url: "https://ops.app.n8n.cloud", api_key_last4: "9f2a", workflow_count: 7 } });
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    const panel = host.querySelector('[role="dialog"]')?.textContent ?? "";
    expect(panel).toContain("ops.app.n8n.cloud");
    expect(panel).toContain("Stored");
    expect(panel).not.toContain("9f2a");

    expect(byText(host, "Reconnect API")).toBeTruthy();
    expect(byText(host, "Disconnect")).toBeTruthy();
  });

  it("reconnects a broken connection with the address prefilled and the key required again", async () => {
    world({ n8n: { configured: true, status: "error", base_url: "https://ops.app.n8n.cloud", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    expect(byText(host, "Reconnect")).toBeTruthy();
    await click(byText(host, "Reconnect"));
    const [url, key] = fields(host);
    expect(url.value).toBe("https://ops.app.n8n.cloud");
    expect(key.value).toBe("");
    expect((byText(host, "Save and check connection") as HTMLButtonElement).disabled).toBe(true);
  });

  it("disconnects only after an explicit confirmation", async () => {
    world({ n8n: { configured: true, status: "connected", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    await click(byText(host, "Disconnect"));
    expect(invoke.mock.calls.some((c) => c[0] === "tenant-n8n-api-connect" && c[1].body.action === "disconnect")).toBe(false);
    await click(byText(host, "Confirm disconnect"));
    expect(invoke.mock.calls.some((c) => c[0] === "tenant-n8n-api-connect" && c[1].body.action === "disconnect")).toBe(true);
  });

  it("re-reads the connection after a write so the panel reflects what persisted", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    const before = rpc.mock.calls.filter((c) => c[0] === "get_tenant_n8n_api_readiness").length;
    await type(fields(host)[0], "https://mine.app.n8n.cloud");
    await type(fields(host)[1], "key");
    await submit(host);
    const after = rpc.mock.calls.filter((c) => c[0] === "get_tenant_n8n_api_readiness").length;
    expect(after).toBeGreaterThan(before);
  });

  it("denies a non-admin the controls and says who can change it", async () => {
    world({ admin: false, n8n: { configured: true, status: "connected", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    expect(host.querySelector('[role="dialog"]')?.textContent).toMatch(/only a workspace admin/i);
    expect(host.querySelector(".ig-form")).toBeNull();
    expect(byText(host, "Disconnect")).toBeFalsy();
    expect(byText(host, "Reconnect API")).toBeFalsy();
  });

  it("denies a non-admin the connect form on an unconfigured workspace", async () => {
    // The case where only the permission gate stands between a reader and the
    // form: with nothing configured, the form is what would otherwise render.
    world({ admin: false, n8n: { configured: false, status: "unconfigured" } });
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    expect(host.querySelector(".ig-form")).toBeNull();
    expect(fields(host).length).toBe(0);
    expect(byText(host, "Save and check connection")).toBeFalsy();
    expect(host.querySelector('[role="dialog"]')?.textContent).toMatch(/only a workspace admin/i);
  });

  it("reports a rejected write in the product's own words, never the database's", async () => {
    world({ writeError: { message: 'N8N_INSECURE_URL: instance URL must be https:// (SQLSTATE 22023) column "base_url_ct"' } });
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    await type(fields(host)[0], "http://mine.example");
    await type(fields(host)[1], "key");
    await submit(host);
    const panel = host.querySelector('[role="dialog"]')?.textContent ?? "";
    expect(panel).toMatch(/could not confirm the result/i);
    expect(panel).not.toMatch(/SQLSTATE|column "|N8N_INSECURE_URL/);
  });

  it("lets the owner retry after a failure, and clears the key on the failed attempt too", async () => {
    world({ writeError: { message: "forbidden" } });
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    await type(fields(host)[0], "https://mine.app.n8n.cloud");
    await type(fields(host)[1], "FAILEDSECRET");
    await submit(host);
    expect(host.querySelector('[role="dialog"]')?.textContent).toMatch(/only a workspace admin/i);
    // A failed save must not leave the secret sitting in the field.
    expect(host.innerHTML).not.toContain("FAILEDSECRET");

    world();
    await click(byText(host, "Try again"));
    await click(byText(host, "Connect API"));
    await type(fields(host)[0], "https://mine.app.n8n.cloud");
    await type(fields(host)[1], "goodkey");
    await submit(host);
    expect(invoke.mock.calls.some((c) => c[0] === "tenant-n8n-api-connect" && c[1].body.api_key === "goodkey")).toBe(true);
  });

  it("asks before discarding half-entered connection details", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    await type(fields(host)[0], "https://half-typed.example");
    await click(host.querySelector(".ig-close") ?? undefined);
    // Still open, with an explicit choice.
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.textContent).toMatch(/unsaved API details/i);
    await click(byText(host, "Keep editing"));
    expect(host.querySelector(".ig-form")).toBeTruthy();
    await click(host.querySelector(".ig-close") ?? undefined);
    await click(byText(host, "Discard changes"));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("closes without a prompt when nothing was typed", async () => {
    world();
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
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
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
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
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    await click(byText(host, "Disconnect"));
    world();
    await click(byText(host, "Confirm disconnect"));
    await act(async () => { await Promise.resolve(); });
    expect(host.querySelector('.ig-card[data-provider="n8n"]')?.textContent).toContain("Not connected");
  });

  it("does not offer to remove a name the seam cannot clear", async () => {
    world({ n8n: { configured: true, status: "connected", label: "Ops", base_url: "https://ops.app.n8n.cloud", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    await click(byText(host, "Reconnect API"));
    await type(fields(host)[2], "");
    expect(host.querySelector(".ig-form")?.textContent).toMatch(/changed here but not removed/i);

    // The load-bearing part: an emptied name is not a pending change, so
    // closing does not claim there are unsaved details. (Asserting the Save
    // button here would be vacuous — it is disabled anyway while the key is
    // blank, so it passes with or without the fix.)
    await click(host.querySelector(".ig-close") ?? undefined);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).not.toMatch(/unsaved API details/i);
  });

  it("still treats a genuine name change as a pending change", async () => {
    world({ n8n: { configured: true, status: "connected", label: "Ops", base_url: "https://ops.app.n8n.cloud", api_key_last4: "9f2a" } });
    const { host } = await render();
    await openCard(host, "n8n");
    if (byText(host, "Connect API")) await click(byText(host, "Connect API"));
    await click(byText(host, "Reconnect API"));
    await type(fields(host)[2], "Ops renamed");
    await click(host.querySelector(".ig-close") ?? undefined);
    expect(host.textContent).toMatch(/unsaved API details/i);
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
      ["forbidden", /workspace admin/i], ["unauthorized", /sign in again/i],
      ["tenant_changed", /workspace changed/i], ["not_configured", /save an n8n api/i],
      ["validation_busy", /already in progress/i],
      ['duplicate key value violates unique constraint "uniq_x"', /could not confirm/i],
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
// The approved n8n tabs replace the static-credential setup flow; coverage lives in settings-integrations.n8n-tabs.test.tsx.

describe("Zapier API and PAIGE tools are independent", () => {
  const panel = (host: HTMLElement) => host.querySelector<HTMLElement>(".ig-panel")!;
  const panelButton = (host: HTMLElement, text: string) => Array.from(panel(host).querySelectorAll("button")).find((b) => b.textContent?.includes(text));
  let assigned: string[] = [];
  beforeEach(() => {
    assigned = [];
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign: (url: string) => assigned.push(url) } });
  });

  it("shows two independent card states and two manage tabs", async () => {
    world({ zapierApi: { state: "connected", accessible_zap_count: 3, last_checked_at: "2026-09-04T12:00:00Z", last_success_at: "2026-09-04T12:00:00Z" },
      mcp: { zapier: { configured: true, enabled: true, status: "error", auth_kind: "oauth" } } });
    const { host } = await render();
    const card = host.querySelector('.ig-card[data-provider="mcp"]')!;
    expect(card.textContent).toContain("API connectionConnected");
    expect(card.textContent).toContain("Paige tools (MCP)Needs attention");
    await openCard(host, "mcp");
    expect(panelButton(host, "API connection")?.getAttribute("aria-selected")).toBe("true");
    expect(panelButton(host, "Paige tools (MCP)")).toBeTruthy();
  });

  it("starts the provider API OAuth flow and sends no credential", async () => {
    world();
    invoke.mockImplementation((name: string, options: { body: Record<string, unknown> }) => {
      if (name === "tenant-zapier-api-connect" && options.body.action === "status") return Promise.resolve({ data: { ok: true, connection: { tenant_id: "tenant-a", can_manage: true, state: "not_connected", failure_code: null, accessible_zap_count: null, last_checked_at: null, last_success_at: null, capabilities: [], limitations: [] } }, error: null });
      if (name === "tenant-zapier-api-connect" && options.body.action === "oauth_begin") return Promise.resolve({ data: { ok: true, authorize_url: "https://api.zapier.com/v2/authorize?state=bound" }, error: null });
      return Promise.resolve({ data: { ok: true }, error: null });
    });
    const { host } = await render(); await openCard(host, "mcp"); await click(panelButton(host, "Connect API"));
    const body = invoke.mock.calls.at(-1)![1].body;
    expect(body).toEqual({ action: "oauth_begin", expected_tenant_id: "tenant-a" });
    expect(Object.keys(body).join(",")).not.toMatch(/token|secret|key|verifier/i);
    expect(assigned).toEqual(["https://api.zapier.com/v2/authorize?state=bound"]);
  });

  it("starts MCP OAuth from the exact Zapier server and clears it", async () => {
    world();
    invoke.mockResolvedValue({ data: { ok: true, authorize_url: "https://zapier.com/oauth/authorize?state=mcp" }, error: null });
    const { host } = await render(); await openCard(host, "mcp"); await click(panelButton(host, "Paige tools (MCP)"));
    const field=panel(host).querySelector<HTMLInputElement>('input[type="url"]')!;const address="https://mcp.zapier.com/api/mcp/s/server-id/mcp";await type(field,address);await submit(host);
    expect(invoke.mock.calls.at(-1)![1].body).toEqual({ provider:"zapier",action:"oauth_begin",server_url:address,expected_tenant_id:"tenant-a" });
    expect(field.value).toBe("");expect(assigned).toEqual(["https://zapier.com/oauth/authorize?state=mcp"]);
  });

  it("keeps MCP disconnect independent from the API connection", async () => {
    world({ zapierApi: { state:"connected",accessible_zap_count:1,last_checked_at:"2026-09-04T12:00:00Z",last_success_at:"2026-09-04T12:00:00Z" },
      mcp:{zapier:{configured:true,enabled:true,status:"connected",auth_kind:"oauth",approved_capabilities:[]}} });
    const {host}=await render();await openCard(host,"mcp");await click(panelButton(host,"Paige tools (MCP)"));await click(panelButton(host,"Disconnect"));await click(panelButton(host,"Disconnect"));
    expect([...invoke.mock.calls].reverse().find((call)=>call[1].body.action==="disconnect")![1].body).toEqual({provider:"zapier",expected_tenant_id:"tenant-a",action:"disconnect"});
    expect(invoke.mock.calls.some((c)=>c[0]==="tenant-zapier-api-connect"&&c[1].body.action==="disconnect")).toBe(false);
  });

  it("uses the same two-tab keyboard behavior as n8n", async () => {
    world();
    const { host } = await render(); await openCard(host, "mcp");
    const apiTab = panelButton(host, "API connection")!; apiTab.focus();
    await act(async () => apiTab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(panelButton(host, "Paige tools (MCP)")?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(panelButton(host, "Paige tools (MCP)"));
  });

  it("lets the owner cancel an in-progress API authorization", async () => {
    world({ zapierApi: { state: "connecting" } });
    const { host } = await render(); await openCard(host, "mcp");
    await click(panelButton(host, "Cancel authorization"));
    expect(invoke.mock.calls.some((call) => call[0] === "tenant-zapier-api-connect" && call[1].body.action === "cancel")).toBe(true);
  });
});

describe("Capability approval", () => {
  const connected = (over = {}) => ({
    zapier: { configured: true, enabled: true, status: "connected", auth_kind: "oauth", auth_token_last4: "aaaa",
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
    await click(capsButton(host, "Paige tools (MCP)"));
    expect(panel(host).querySelector(".ig-capability-approval")).toBeNull();
  });

  it("says plainly that nothing is approved, and does not call the provider until asked", async () => {
    world({ mcp: connected() });
    const { host } = await render();
    await openCard(host, "mcp");
    await click(capsButton(host, "Paige tools (MCP)"));
    expect(panel(host).textContent).toContain("Nothing is approved yet");
    // Discovery is an outbound request; it does not happen just because a panel opened.
    expect(invoke.mock.calls.some((c) => c[1].body.action === "discover")).toBe(false);

    invoke.mockResolvedValue({ data: { ok: true, tools: TOOLS }, error: null });
    await click(capsButton(host, "See what is available"));
    expect(invoke.mock.calls.at(-1)![1].body).toEqual({ provider: "zapier", action: "discover", expected_tenant_id: "tenant-a" });
    expect(capRows(host).map((b) => b.textContent)).toHaveLength(2);
    expect(capRows(host).every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("approves a name together with the contract it was shown with", async () => {
    world({ mcp: connected() });
    invoke.mockResolvedValue({ data: { ok: true, tools: TOOLS }, error: null });
    const { host } = await render();
    await openCard(host, "mcp");
    await click(capsButton(host, "Paige tools (MCP)"));
    await click(capsButton(host, "See what is available"));

    await click(capRows(host)[0]);
    invoke.mockResolvedValue({ data: { ok: true, approved_count: 1, pinned_count: 1 }, error: null });
    await click(capsButton(host, "Approve 1 of 2"));

    const body = [...invoke.mock.calls].reverse().find((call) => call[1].body.action === "approve")![1].body;
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
    await click(capsButton(host, "Paige tools (MCP)"));
    await click(capsButton(host, "See what is available"));
    expect(capRows(host).every((b) => b.getAttribute("aria-pressed") === "true")).toBe(true);

    await click(capRows(host)[1]);
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await click(capsButton(host, "Approve 1 of 2"));
    // A statement of the whole set, not an addition to it.
    expect([...invoke.mock.calls].reverse().find((call) => call[1].body.action === "approve")![1].body.capabilities).toEqual(["send_email"]);
  });

  it("refuses to record consent to a list that moved, and reloads it", async () => {
    world({ mcp: connected() });
    invoke.mockResolvedValue({ data: { ok: true, tools: TOOLS }, error: null });
    const { host } = await render();
    await openCard(host, "mcp");
    await click(capsButton(host, "Paige tools (MCP)"));
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
    await click(capsButton(host, "Paige tools (MCP)"));
    await click(capsButton(host, "See what is available"));
    expect((capsButton(host, "Approve 0 of 2") as HTMLButtonElement).disabled).toBe(true);
    await click(capRows(host)[0]);
    expect((capsButton(host, "Approve 1 of 2") as HTMLButtonElement).disabled).toBe(false);
  });

  it("is not offered to someone who cannot grant it", async () => {
    world({ admin: false, mcp: connected() });
    const { host } = await render();
    await openCard(host, "mcp");
    await click(capsButton(host, "Paige tools (MCP)"));
    expect(panel(host).querySelector(".ig-capability-approval")).toBeNull();
  });
});
