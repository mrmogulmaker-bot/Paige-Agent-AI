/**
 * Integrations → Paige's tools (the MCP gateway section).
 *
 * Driven through the rendered DOM, not through the hook: the §70 question is whether a
 * human can FINISH the job, and only the surface can answer that. Covered here are first
 * use from a genuinely empty account, the add path through the one catalogue, the honest
 * stops for a tool whose connect step is not wired, re-key, both disconnect shapes,
 * permission refusal, a failed read kept distinct from an empty account, and the truth
 * boundary — a tool is never shown as ready before the server proves it.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationsGatewaySection } from "./settings-integrations-gateway";
import { useMcpGateway } from "./data/useMcpGateway";

/** The Automation group heading the parent surface hands the gateway in production. */
const GROUP = { label: "Automation", accent: "var(--k-automation)", blurb: "Run workflows and reach other apps." };
/**
 * The surface owns the one gateway hook instance and hands it down, so the filter bar can count
 * the same tools the group renders. These tests stand in for that owner: the hook is the REAL
 * one, running against the mocked RPC exactly as before — only who calls it moved.
 */
function Section({ onOpenLegacy }: { onOpenLegacy?: (which: "n8n" | "zapier" | "social") => void }) {
  const gw = useMcpGateway();
  return <IntegrationsGatewaySection onOpenLegacy={onOpenLegacy} gw={gw} group={GROUP} tiles={null} />;
}

const context = vi.hoisted(() => ({ tenantId: "tenant-a" as string | null, loading: false }));
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: context.tenantId, activeUserId: "user-a", loading: context.loading }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke } } }));

/**
 * The REAL `supabase.rpc()` returns a PostgrestFilterBuilder: a thenable that has `then` and
 * **no `.catch`**. A double that returns a plain Promise hides any code calling `.catch` on the
 * builder directly — which is how a `TypeError` that killed every write on this surface once sat
 * behind a green `tsc` and a green suite. Every double here returns the real shape, so the whole
 * file guards that class.
 */
const builder = <T,>(value: T) => ({
  then: <R1, R2>(ok?: ((v: T) => R1 | PromiseLike<R1>) | null, err?: ((e: unknown) => R2 | PromiseLike<R2>) | null) =>
    Promise.resolve(value).then(ok, err),
});

/** One row as `get_mcp_connections_v2` returns it. No secret is ever in this shape. */
const row = (over: Record<string, unknown> = {}) => ({
  connection_id: "conn-1",
  provider_key: "generic-remote",
  label: "Scheduling tool",
  transport: "http",
  auth_kind: "bearer",
  configured: true,
  enabled: true,
  status: "connected",
  health: "healthy",
  last_checked_at: "2026-09-20T10:00:00Z",
  server_url_host: "services.example.com",
  tool_count: 6,
  approved_count: 2,
  ...over,
});

/**
 * Default world: the caller may write and the account holds whatever rows are passed.
 * `write` decides what every write RPC returns, so a refusal can be driven end to end.
 */
function world(over: {
  rows?: Record<string, unknown>[];
  admin?: boolean;
  /** What a WRITE answers. Writes now go to the gateway edge, so this is an invoke() answer. */
  write?: { data?: unknown; error?: unknown };
  /** What a WRITE answers on the RETAINED rpc lane (re-key, disconnect) — still a builder answer. */
  rpcWrite?: { data?: unknown; error?: unknown };
} = {}) {
  rpc.mockImplementation((name: string) => {
    if (name === "get_mcp_connections_v2") return builder({ data: over.rows ?? [], error: null });
    if (name === "is_current_user_tenant_admin") return builder({ data: over.admin !== false, error: null });
    return builder(over.rpcWrite ?? { data: { connection_id: "conn-new", status: "pending_verification" }, error: null });
  });
  invoke.mockResolvedValue(over.write ?? { data: { connection_id: "conn-new", status: "pending_verification" }, error: null });
}

/** The body of the last gateway call, for asserting what actually went over the wire. */
const lastEdgeBody = () => (invoke.mock.calls.at(-1)?.[1]?.body ?? {}) as Record<string, unknown>;
/** Every gateway call made with a given action. */
const edgeCalls = (action: string) =>
  invoke.mock.calls.filter((c) => (c[1]?.body as Record<string, unknown> | undefined)?.action === action);
/** A non-2xx edge refusal, in supabase-js's real shape (code lives on error.context, not on data). */
const edgeRefusal = (code: string, status = 400) => ({
  data: null,
  error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: { status, json: async () => ({ error: code }) } },
});

async function render(onOpenLegacy?: (which: "n8n" | "zapier" | "social") => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<Section onOpenLegacy={onOpenLegacy} />));
  await act(async () => { await Promise.resolve(); });
  return { host, root };
}

const buttons = (host: HTMLElement) => Array.from(host.querySelectorAll("button"));
const byText = (host: HTMLElement, text: string) => buttons(host).find((b) => b.textContent?.includes(text));
const click = async (el: Element | undefined | null) => {
  await act(async () => { el?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => { await Promise.resolve(); });
};
const type = async (input: Element | null | undefined, value: string) => {
  const field = input as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const dialog = (host: HTMLElement) => host.querySelector<HTMLElement>('[role="dialog"]');
const fieldFor = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll<HTMLLabelElement>("label.ig-field"))
    .find((l) => l.querySelector("span")?.textContent === label)
    ?.querySelector("input");
const tile = (host: HTMLElement, name: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>(".ig-gw-tile"))
    .find((b) => b.querySelector(".ig-gw-tile-name")?.textContent === name);
/** The repeatable "MCP server" tile — the one way in, always present, never only when empty
 *  (owner ruling 2026-09-22). Matched on its own hook so the catalogue's "Any MCP server" tile
 *  inside the open drawer can never be mistaken for it. */
const addTile = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.ig-card[data-provider="mcp-add"]');
/** Open the add drawer (the catalogue IS the add path). */
const openCatalogue = async (host: HTMLElement) => { await click(addTile(host)); };
/** Open the add FORM through the catalogue's generic entry, the way a human reaches it. */
const openAddForm = async (host: HTMLElement) => {
  await openCatalogue(host);
  await click(tile(host, "Any MCP server"));
};

beforeEach(() => {
  context.tenantId = "tenant-a";
  context.loading = false;
  rpc.mockReset();
  invoke.mockReset();
  document.body.innerHTML = "";
});

describe("Truth boundary", () => {
  it("reads with no tenant argument and renders no payload of its own", async () => {
    world({ rows: [row({ label: "Scheduling tool" })] });
    const { host } = await render();
    expect(rpc).toHaveBeenCalledWith("get_mcp_connections_v2");
    for (const call of rpc.mock.calls.filter((c) => String(c[0]).startsWith("get_"))) {
      expect(call.length).toBe(1);
    }
    expect(host.textContent).toContain("Scheduling tool");
  });

  it("never says a tool is ready before the server has proven it", async () => {
    // A row that exists is not a row that works. The probe that promotes a row is a later slice,
    // so nothing is checking it yet — and the label must not imply that something is.
    world({ rows: [row({ status: "pending_verification", health: "unknown" })] });
    const { host } = await render();
    expect(host.textContent).toContain("Not checked yet");
    expect(host.textContent).not.toMatch(/\bReady\b/);
    expect(host.textContent).not.toMatch(/Checking…/);
    expect(host.textContent).toContain("not usable yet");
  });

  it("keeps a failed read distinct from an account with no tools", async () => {
    rpc.mockImplementation((name: string) =>
      builder({ data: null, error: name === "get_mcp_connections_v2" ? { message: "read failed" } : null }));
    const { host } = await render();
    expect(host.textContent).toMatch(/couldn’t be read/i);
    expect(addTile(host)).toBeNull();
    expect(host.querySelectorAll(".ig-card").length).toBe(0);
    expect(byText(host, "Try again")).toBeTruthy();
  });

  it("drops the previous workspace's tools immediately and rejects its late answer", async () => {
    let resolveFirst!: (value: { data: unknown; error: null }) => void;
    const first = new Promise<{ data: unknown; error: null }>((done) => { resolveFirst = done; });
    rpc.mockImplementationOnce(() => first).mockImplementation(() => builder({ data: [], error: null }));
    const { host, root } = await render();

    context.tenantId = "tenant-b";
    world({ rows: [row({ connection_id: "conn-b", label: "Tenant B tool" })] });
    await act(async () => root.render(<Section />));
    await act(async () => { await Promise.resolve(); });

    resolveFirst({ data: [row({ label: "Late tenant A tool" })], error: null });
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).not.toContain("Late tenant A tool");
  });

  it("never renders a secret, and shows only the endpoint host", async () => {
    world({ rows: [row({ auth_token: "must-not-survive", api_key: "must-not-survive" })] });
    const { host } = await render();
    expect(host.textContent).not.toContain("must-not-survive");
    expect(host.textContent).toContain("services.example.com");
  });
});

describe("First use", () => {
  it("offers the add path from a genuinely empty account", async () => {
    world({ rows: [] });
    const { host } = await render();
    expect(host.textContent).not.toMatch(/couldn’t be read/i);
    const add = addTile(host);
    expect(add).toBeTruthy();
    // The way in says it may be taken more than once, because it may.
    expect(add?.textContent).toMatch(/repeatable/i);
    await click(add);
    expect(dialog(host)).toBeTruthy();
  });

  it("offers no add path to someone who cannot write, and claims nothing about why", async () => {
    world({ rows: [], admin: false });
    const { host } = await render();
    expect(addTile(host)).toBeNull();
  });
});

describe("Adding a tool", () => {
  it("browses one catalogue and adds a pasted-key tool end to end", async () => {
    world({ rows: [] });
    const { host } = await render();
    await openCatalogue(host);
    expect(dialog(host)).toBeTruthy();
    // The catalogue IS the add path — there is no separate browse surface and no type picker.
    expect(host.querySelectorAll(".ig-gw-tile").length).toBeGreaterThan(20);

    await click(tile(host, "Any MCP server"));
    await type(fieldFor(host, "Name"), "Scheduling tool");
    await type(fieldFor(host, "Server URL"), "https://services.example.com/mcp");
    await type(fieldFor(host, "Bearer token"), "tok_live_value_123");
    await click(byText(host, "Add tool"));

    // The write goes to the ONE gateway door, dispatched on action — not to the writer RPC.
    expect(edgeCalls("create").length).toBe(1);
    expect(lastEdgeBody()).toMatchObject({ action: "create", facet: "mcp", label: "Scheduling tool", server_url: "https://services.example.com/mcp" });
    // The write carries the caller's own tenant as an expected-tenant guard.
    expect(lastEdgeBody().expected_tenant_id).toBe("tenant-a");
    // Success closes the drawer and the list is re-read from the server, never patched locally.
    expect(dialog(host)).toBeNull();
    expect(rpc.mock.calls.filter((c) => c[0] === "get_mcp_connections_v2").length).toBeGreaterThan(1);
  });

  it("refuses a private or non-HTTPS address instead of letting the server reject it", async () => {
    world({ rows: [] });
    const { host } = await render();
    await openAddForm(host);
    await type(fieldFor(host, "Name"), "Internal tool");
    await type(fieldFor(host, "Server URL"), "http://localhost:5678/mcp");
    await type(fieldFor(host, "Bearer token"), "tok");
    await click(byText(host, "Add tool"));
    expect(host.textContent).toMatch(/public https:\/\/ address/i);
    expect(rpc.mock.calls.some((c) => c[0] === "create_mcp_connection")).toBe(false);
  });

  it("blocks submission until every detail the chosen shape needs is present", async () => {
    world({ rows: [] });
    const { host } = await render();
    await openAddForm(host);
    await click(byText(host, "Add tool"));
    expect(host.textContent).toMatch(/enter a name/i);
    expect(rpc.mock.calls.some((c) => c[0] === "create_mcp_connection")).toBe(false);
    // aria-invalid says THAT a field is wrong; the message has to be reachable from it, or a
    // screen-reader user is told something is broken and never told what.
    const name = fieldFor(host, "Name") as HTMLInputElement;
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const described = name.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    const messages = described!.split(" ").map((id) => host.querySelector(`#${id}`)?.textContent ?? "");
    expect(messages.join(" ")).toMatch(/enter a name/i);
  });

  it("sends the n8n API-key shape through the REST writer with named parameters", async () => {
    world({ rows: [] });
    const { host } = await render();
    await openAddForm(host);
    await click(byText(host, "n8n — API key"));
    await type(fieldFor(host, "Name"), "Workflow bridge");
    await type(fieldFor(host, "Base URL"), "https://team.app.n8n.cloud");
    await type(fieldFor(host, "API key"), "n8n_api_value_1");
    await click(byText(host, "Add tool"));
    // The REST facet is named explicitly — never inferred from the auth kind.
    expect(lastEdgeBody()).toMatchObject({ action: "create", facet: "rest", provider_key: "n8n", label: "Workflow bridge", base_url: "https://team.app.n8n.cloud" });
  });

  it("reports a refused write in the product's own words and keeps the details on screen", async () => {
    world({ rows: [], write: edgeRefusal("MCP_FORBIDDEN", 403) });
    const { host } = await render();
    await openAddForm(host);
    await type(fieldFor(host, "Name"), "Scheduling tool");
    await type(fieldFor(host, "Server URL"), "https://services.example.com/mcp");
    await type(fieldFor(host, "Bearer token"), "tok_live_value_123");
    await click(byText(host, "Add tool"));
    expect(dialog(host)).toBeTruthy();
    expect(host.textContent).not.toContain("42501");
    expect(host.textContent).not.toContain("permission denied for function");
    expect((fieldFor(host, "Name") as HTMLInputElement).value).toBe("Scheduling tool");
  });

  it("runs a REAL sign-in for a connect provider — the honest stop is no longer the answer", async () => {
    // This test used to assert "Sign-in coming soon". The gateway's oauth_begin door is reachable
    // from the browser now, so the stop would be a lie about our own capability. What it guards
    // instead is the two-step shape the door actually requires.
    world({ rows: [] });
    const { host } = await render();
    await openCatalogue(host);
    const connectTile = host.querySelector<HTMLButtonElement>('.ig-gw-tile[data-mode="connect"]');
    expect(connectTile).toBeTruthy();
    await click(connectTile);
    expect(dialog(host)?.textContent).toMatch(/sign in to/i);
    expect(dialog(host)?.textContent).not.toMatch(/coming soon/i);
  });

  it("creates the row as `none` first, because an oauth row cannot exist before its token does", async () => {
    world({ rows: [] });
    const { host } = await render();
    await openCatalogue(host);
    await click(host.querySelector<HTMLButtonElement>('.ig-gw-tile[data-mode="connect"]'));
    // Two answers in order: the create, then the flow.
    invoke
      .mockResolvedValueOnce({ data: { connection_id: "conn-oauth", status: "pending_verification" }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, authorize_url: "https://provider.example/authorize" }, error: null });
    await click(host.querySelector(".ig-gw-actions button[data-primary]"));

    const create = edgeCalls("create")[0]?.[1].body as Record<string, unknown>;
    expect(create).toMatchObject({ action: "create", facet: "mcp" });
    // `none` is what makes the row creatable before sign-in AND configured enough for oauth_begin.
    // Creating it as `oauth` is impossible: that bundle requires the very token sign-in produces.
    expect(create.auth_kind).toBe("none");
    expect(create.auth_token).toBeNull();
    // Then the flow, on the row that now exists.
    expect((edgeCalls("oauth_begin")[0]?.[1].body as Record<string, unknown>)?.connection_id).toBe("conn-oauth");
  });

  it("keeps the tool it just made when the provider offers no usable sign-in", async () => {
    world({ rows: [] });
    const { host } = await render();
    await openCatalogue(host);
    await click(host.querySelector<HTMLButtonElement>('.ig-gw-tile[data-mode="connect"]'));
    invoke
      .mockResolvedValueOnce({ data: { connection_id: "conn-oauth", status: "pending_verification" }, error: null })
      .mockResolvedValueOnce(edgeRefusal("oauth_begin_failed", 502));
    await click(host.querySelector(".ig-gw-actions button[data-primary]"));
    // The row EXISTS either way, so the copy must not imply nothing happened — it points at the
    // thing the owner can still do with it.
    expect(dialog(host)?.textContent).toMatch(/didn.t offer a sign-in/i);
    // …and it must NOT point at a control this row does not have. The row was created with no
    // credential, Re-key renders no key field for a credential-less tool, and re-keying cannot
    // change a tool's sign-in type — so "add a key instead" was an instruction with nothing behind
    // it (§70.1). The peer-gate caught it; this pins the fix.
    expect(dialog(host)?.textContent).not.toMatch(/add a key/i);
    expect(dialog(host)?.textContent).toMatch(/check the address and try again, or remove it/i);
  });

  it("narrows the catalogue by search and still leaves a way to finish", async () => {
    world({ rows: [] });
    const { host } = await render();
    await openCatalogue(host);
    const search = host.querySelector<HTMLInputElement>('input[type="search"]');
    await type(search, "zzzzznotarealtool");
    // A tool we do not list is not a dead end: the generic entry survives every filter,
    // and the empty note points at it by the name it actually carries.
    expect(Array.from(host.querySelectorAll(".ig-gw-tile-name")).map((n) => n.textContent)).toEqual(["Any MCP server"]);
    expect(host.textContent).toMatch(/no listed tool matches/i);
    expect(tile(host, "Any MCP server")).toBeTruthy();
  });

  it("adds a tool it does not list, by address, with nothing prefilled", async () => {
    world({ rows: [] });
    const { host } = await render();
    await openAddForm(host);
    // The generic entry names no vendor, so it must not seed the name with its own label.
    expect((fieldFor(host, "Name") as HTMLInputElement).value).toBe("");
    await type(fieldFor(host, "Name"), "Ops server");
    await type(fieldFor(host, "Server URL"), "https://ops.example.com/mcp");
    await type(fieldFor(host, "Bearer token"), "tok_value_123456");
    await click(byText(host, "Add tool"));
    expect(lastEdgeBody()).toMatchObject({ action: "create", label: "Ops server" });
  });
});

describe("Writes reach the server", () => {
  it("sends the write through the gateway edge and closes on a confirmed answer", async () => {
    // The builder-shape regression this once guarded now lives on the RETAINED rpc lane (re-key and
    // disconnect), which still calls `supabase.rpc()` directly — see the disconnect test below and
    // the hook suite. Creates no longer touch the builder at all.
    world({ rows: [] });
    const { host } = await render();
    await openAddForm(host);
    await type(fieldFor(host, "Name"), "Ops server");
    await type(fieldFor(host, "Server URL"), "https://ops.example.com/mcp");
    await type(fieldFor(host, "Bearer token"), "tok_value_123456");
    await click(byText(host, "Add tool"));
    expect(edgeCalls("create").length).toBe(1);
    expect(dialog(host)).toBeNull();
  });

  it("never renders a tool whose identity the server did not state", async () => {
    // An id-only row used to be accepted and its identity invented — "generic-remote", "Tool", a
    // default status — rendering a tool the owner never added, described in words the server never
    // said. Fabricated state is worse than a visible read failure: nothing marks it as a guess.
    world({ rows: [] });
    rpc.mockImplementation((name: string) =>
      name === "get_mcp_connections_v2"
        ? builder({ data: [{ connection_id: "conn-id-only" }], error: null })
        : builder({ data: true, error: null }));
    const { host } = await render();
    expect(host.textContent).toMatch(/couldn’t be read/i);
    expect(host.textContent).not.toContain("Tool");
    expect(host.querySelectorAll(".ig-card").length).toBe(0);
  });

  it("fails the whole read when ANY row is unreadable, never a quietly short list", async () => {
    // Dropping the bad rows and rendering the rest is the quieter lie: the list looks complete
    // while silently missing whatever did not parse, and the owner cannot tell.
    world({ rows: [] });
    rpc.mockImplementation((name: string) =>
      name === "get_mcp_connections_v2"
        ? builder({ data: [row({ connection_id: "conn-good", label: "Readable tool" }), { connection_id: "conn-broken" }], error: null })
        : builder({ data: true, error: null }));
    const { host } = await render();
    expect(host.textContent).toMatch(/couldn’t be read/i);
    expect(host.textContent).not.toContain("Readable tool");
  });

  it("never reports a write as done on an envelope carrying no acknowledgement", async () => {
    // `{data: null, error: null}` is a VALID envelope with no confirmation in it. Every shipped
    // writer acknowledges with `connection_id`, so an answer without one did not confirm the write.
    world({ rows: [] });
    const { host } = await render();
    await openAddForm(host);
    await type(fieldFor(host, "Name"), "Unacknowledged tool");
    await type(fieldFor(host, "Server URL"), "https://unacked.example.com/mcp");
    await type(fieldFor(host, "Bearer token"), "harness-token-not-a-real-secret");
    // A VALID envelope with no confirmation in it: 2xx, no error, and a body carrying no
    // connection_id. Every create acknowledges with one, so this did not confirm the write.
    invoke.mockResolvedValue({ data: {}, error: null });
    await click(byText(host, "Add tool"));
    expect(dialog(host)).toBeTruthy();
  });

  it("never reports a write as done on an answer that confirms nothing", async () => {
    // An adapter that resolves `{}` carries no acknowledgement that anything happened. Treating the
    // absent `error` key as success would close the drawer on a write the server never confirmed,
    // and a later reload cannot make that success true (§13).
    world({ rows: [] });
    const { host } = await render();
    await openAddForm(host);
    await type(fieldFor(host, "Name"), "Unconfirmed tool");
    await type(fieldFor(host, "Server URL"), "https://unconfirmed.example.com/mcp");
    await type(fieldFor(host, "Bearer token"), "harness-token-not-a-real-secret");
    // An adapter that resolves with a non-object carries no acknowledgement at all.
    invoke.mockResolvedValue(undefined);
    await click(byText(host, "Add tool"));
    // The drawer stays open on the details, and the owner is told it did not go through.
    expect(dialog(host)).toBeTruthy();
    expect(host.textContent).not.toMatch(/Unconfirmed tool.*added/i);
  });

  it("leaves the owner able to try again after a refused write", async () => {
    world({ rows: [], write: edgeRefusal("MCP_FORBIDDEN", 403) });
    const { host } = await render();
    await openAddForm(host);
    await type(fieldFor(host, "Name"), "Ops server");
    await type(fieldFor(host, "Server URL"), "https://ops.example.com/mcp");
    await type(fieldFor(host, "Bearer token"), "tok_value_123456");
    await click(byText(host, "Add tool"));
    // The submit control must come back — a write that failed once must not disable the surface.
    const submit = byText(host, "Add tool") as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("accepts a public address that merely contains private-looking digits", async () => {
    world({ rows: [] });
    const { host } = await render();
    await openAddForm(host);
    await type(fieldFor(host, "Name"), "Versioned tool");
    await type(fieldFor(host, "Server URL"), "https://api.example.com/v1.10.2/mcp");
    await type(fieldFor(host, "Bearer token"), "tok_value_123456");
    await click(byText(host, "Add tool"));
    expect(edgeCalls("create").length).toBe(1);
  });
});

describe("The open drawer tells one story", () => {
  it("re-reads the row from the live list after a check, instead of contradicting itself", async () => {
    // Slice ④ added the first write that leaves this drawer OPEN. Re-key and disconnect both close
    // it, so a frozen snapshot never had a way to show. After "Check now" reloads the list, a
    // snapshot would leave the facts list reading "Not checked yet" with no last-checked time,
    // directly above a banner saying Paige had just reached it.
    let listed = [row({ status: "pending_verification", health: "unknown", last_checked_at: null, tool_count: 0 })];
    rpc.mockImplementation((name: string) => {
      if (name === "get_mcp_connections_v2") return builder({ data: listed, error: null });
      if (name === "is_current_user_tenant_admin") return builder({ data: true, error: null });
      return builder({ data: { connection_id: "conn-1" }, error: null });
    });
    invoke.mockResolvedValue({ data: { ok: true, status: "connected", health: "healthy", tool_count: 11, error_code: null }, error: null });

    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    expect(dialog(host)?.textContent).toMatch(/not checked yet/i);

    // The server's own answer to the probe: the row is now connected and healthy.
    listed = [row({ status: "connected", health: "healthy", last_checked_at: "2026-09-23T17:00:00Z", tool_count: 11 })];
    await click(byText(host, "Check now"));

    const text = dialog(host)!.textContent!;
    expect(text).toMatch(/checked just now/i);
    // The decisive assertions: the facts list moved WITH the verdict. A frozen snapshot fails both
    // — it would still read "Not checked yet" and "No successful check yet" under the banner.
    // Matched without \b, since textContent concatenates the <dt>/<dd> pair into "StatusReady".
    expect(text).toMatch(/StatusReady/);
    expect(text).not.toMatch(/not checked yet/i);
    expect(text).not.toMatch(/no successful check yet/i);
  });
});

describe("A turned-off tool offers only the recovery it actually has", () => {
  it("hides Check now and Sign in again, which could only refuse", async () => {
    world({ rows: [row({ enabled: false, status: "unconfigured", auth_kind: "oauth" })] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    // Both actions answer connection_disabled on a turned-off row. A control whose only outcome is
    // a refusal is the §70.1 failure, not a safety net.
    expect(byText(host, "Check now")).toBeUndefined();
    expect(byText(host, "Sign in again")).toBeUndefined();
    expect(byText(host, "Disconnect")).toBeTruthy();
  });

  it("tells an OAuth tool the truth: it cannot be re-keyed back on", async () => {
    // Soft-disable nulls the credential and never changes auth_kind, so an OAuth row stays OAuth,
    // `rekeyable` stays false, and Re-key never renders. Naming it would be an instruction with
    // nothing behind it — the exact defect the first fix for this string introduced.
    world({ rows: [row({ enabled: false, status: "unconfigured", auth_kind: "oauth" })] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    expect(byText(host, "Re-key")).toBeUndefined();
    expect(dialog(host)?.textContent).toMatch(/removing it and adding it again/i);
    expect(dialog(host)?.textContent).not.toMatch(/Re-key it to switch it back on/i);
  });

  it("names Re-key for a turned-off tool that genuinely has it", async () => {
    // A successful re-key restores enabled=true, so for a re-keyable row this really is the path.
    world({ rows: [row({ enabled: false, status: "unconfigured", auth_kind: "bearer" })] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    expect(byText(host, "Re-key")).toBeTruthy();
    expect(dialog(host)?.textContent).toMatch(/Re-key it to switch it back on/i);
  });
});

describe("Listed is never connected", () => {
  it("stops honestly on a provider with no capability record instead of opening a prefilled form", async () => {
    // A tile that opens a real connection form prefilled with that provider's endpoint asserts
    // authority, ownership and cost the Integration Capability Registry has never recorded.
    world({ rows: [] });
    const { host } = await render();
    await openCatalogue(host);
    await click(tile(host, "Buffer"));
    expect(dialog(host)?.textContent).toMatch(/isn’t cleared for use yet/i);
    // No form, no prefilled endpoint, and nothing sent.
    expect(fieldFor(host, "Server URL")).toBeUndefined();
    expect(rpc.mock.calls.some((c) => String(c[0]).startsWith("create_"))).toBe(false);
    // The neutral path stays open, so the capability is not lost.
    expect(dialog(host)?.textContent).toMatch(/Any MCP server/);
  });

  it("still opens the real form for the provider-neutral entry", async () => {
    world({ rows: [] });
    const { host } = await render();
    await openAddForm(host);
    expect(fieldFor(host, "Server URL")).toBeTruthy();
  });
});

describe("An unreadable account is never rendered as an empty one", () => {
  it("treats a payload it cannot parse as a failed read, not as zero tools", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "get_mcp_connections_v2") return builder({ data: { unexpected: "shape" }, error: null });
      if (name === "is_current_user_tenant_admin") return builder({ data: true, error: null });
      return builder({ data: null, error: null });
    });
    const { host } = await render();
    expect(host.textContent).toMatch(/couldn’t be read/i);
    expect(host.querySelectorAll(".ig-card").length).toBe(0);
  });

  it("treats rows that all fail to parse as a failed read", async () => {
    world({ rows: [{ nothing: "useful" }, { also: "bad" }] });
    const { host } = await render();
    expect(host.textContent).toMatch(/couldn’t be read/i);
    expect(host.querySelectorAll(".ig-card").length).toBe(0);
  });

  it("still offers the add path for a genuinely empty account", async () => {
    world({ rows: [] });
    const { host } = await render();
    expect(addTile(host)).toBeTruthy();
    expect(host.textContent).not.toMatch(/couldn’t be read/i);
  });
});

describe("A failure belongs to the tool it happened on", () => {
  it("does not replay one tool's refusal as a live alert on the next tool opened", async () => {
    world({
      rows: [row(), row({ connection_id: "conn-2", label: "Docs tool" })],
      // Disconnect is on the RETAINED rpc lane (the gateway edge has no disconnect action), so its
      // refusal is still a Postgres error, not an edge body.
      rpcWrite: { data: null, error: { code: "42501", message: "MCP_FORBIDDEN: not permitted" } },
    });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    await click(byText(host, "Disconnect"));
    await click(host.querySelector(".ig-gw-actions button[data-danger]"));
    // One operation, one alert — the same refusal must not render twice in the same drawer.
    const shown = dialog(host)!.textContent!.match(/don't have permission/gi) ?? [];
    expect(shown.length).toBe(1);
    await click(host.querySelector(".ig-close"));
    await click(host.querySelector('[data-gateway-tool="conn-2"]'));
    // The second tool has done nothing wrong; the first tool's refusal must not follow it here.
    expect(dialog(host)?.textContent).toContain("Docs tool");
    expect(dialog(host)?.textContent).not.toMatch(/don't have permission/i);
  });
});

describe("Shipped flows are routed, never reimplemented", () => {
  it("sends the n8n and Zapier tiles to their existing drawers instead of the gateway form", async () => {
    world({ rows: [] });
    const seen: string[] = [];
    const { host } = await render((which) => seen.push(which));
    await openCatalogue(host);
    await click(tile(host, "n8n"));
    expect(seen).toEqual(["n8n"]);
    // Routing closes this drawer so the shipped one owns the screen.
    expect(dialog(host)).toBeNull();

    await openCatalogue(host);
    await click(tile(host, "Zapier"));
    expect(seen).toEqual(["n8n", "zapier"]);
  });
});

describe("Managing a tool", () => {
  it("opens a tool and re-keys it, warning that approvals are cleared", async () => {
    world({ rows: [row()] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    expect(dialog(host)?.textContent).toContain("services.example.com");

    await click(byText(host, "Re-key"));
    expect(host.textContent).toMatch(/approvals are cleared/i);
    await type(fieldFor(host, "New key / value"), "new_token_value");
    await click(byText(host, "Save & re-check"));
    const write = rpc.mock.calls.find((c) => c[0] === "set_mcp_connection_endpoint");
    expect(write?.[1]).toMatchObject({ _connection_id: "conn-1", _tenant_id: "tenant-a" });
  });

  it("will not re-key on an empty value", async () => {
    world({ rows: [row()] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    await click(byText(host, "Re-key"));
    await click(byText(host, "Save & re-check"));
    expect(host.textContent).toMatch(/enter the new value/i);
    expect(rpc.mock.calls.some((c) => c[0] === "set_mcp_connection_endpoint")).toBe(false);
  });

  it("disconnects only after an explicit choice, and defaults to the reversible one", async () => {
    world({ rows: [row()] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    await click(byText(host, "Disconnect"));
    expect(rpc.mock.calls.some((c) => c[0] === "disconnect_mcp_connection")).toBe(false);
    await click(host.querySelector(".ig-gw-actions button[data-danger]"));
    expect(rpc.mock.calls.find((c) => c[0] === "disconnect_mcp_connection")?.[1]).toMatchObject({ _connection_id: "conn-1", _hard: false });
  });

  it("deletes permanently only when that shape is chosen deliberately", async () => {
    world({ rows: [row()] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    await click(byText(host, "Disconnect"));
    await click(byText(host, "Delete it"));
    await click(host.querySelector(".ig-gw-actions button[data-danger]"));
    expect(rpc.mock.calls.find((c) => c[0] === "disconnect_mcp_connection")?.[1]).toMatchObject({ _hard: true });
  });

  it("offers no re-key or disconnect to someone who cannot write", async () => {
    world({ rows: [row()], admin: false });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    expect(dialog(host)).toBeTruthy();
    expect(byText(host, "Re-key")).toBeUndefined();
    expect(byText(host, "Disconnect")).toBeUndefined();
  });

  it("asks before discarding a half-entered key, and lets the owner keep editing", async () => {
    world({ rows: [row()] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    await click(byText(host, "Re-key"));
    await type(fieldFor(host, "New key / value"), "half-typed");
    await click(host.querySelector(".ig-close"));
    expect(host.querySelector('[role="alertdialog"]')).toBeTruthy();
    await click(byText(host, "Keep editing"));
    expect(dialog(host)).toBeTruthy();
    await click(host.querySelector(".ig-close"));
    await click(byText(host, "Discard them"));
    expect(dialog(host)).toBeNull();
  });

  it("closes a tool with Escape when nothing has been typed", async () => {
    world({ rows: [row()] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(dialog(host)).toBeNull();
  });

  it("re-keys to the address the owner confirms, never a truncated host", async () => {
    // The read returns the HOST only by design, so rebuilding the address from it would silently
    // re-point a working tool at its bare host and clear its approvals.
    world({ rows: [row()] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    await click(byText(host, "Re-key"));
    const address = fieldFor(host, "Full address") as HTMLInputElement;
    expect(address).toBeTruthy();
    await type(address, "https://services.example.com/mcp/v2");
    await type(fieldFor(host, "New key / value"), "new_token_value");
    await click(byText(host, "Save & re-check"));
    expect(rpc.mock.calls.find((c) => c[0] === "set_mcp_connection_endpoint")?.[1])
      .toMatchObject({ _server_url: "https://services.example.com/mcp/v2" });
  });

  it("carries the header name when the tool authenticates with a custom header", async () => {
    world({ rows: [row({ auth_kind: "header" })] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    await click(byText(host, "Re-key"));
    await type(fieldFor(host, "Header name"), "X-Api-Key");
    await type(fieldFor(host, "New key / value"), "new_value");
    await click(byText(host, "Save & re-check"));
    // Without the header name the server refuses the bundle every time and the typed key is lost.
    expect(rpc.mock.calls.find((c) => c[0] === "set_mcp_connection_endpoint")?.[1])
      .toMatchObject({ _auth_header_name: "X-Api-Key", _auth_token: "new_value" });
  });

  it("offers no re-key for a tool whose credential is issued by a provider sign-in", async () => {
    world({ rows: [row({ auth_kind: "oauth" })] });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    expect(byText(host, "Re-key")).toBeUndefined();
    expect(byText(host, "Disconnect")).toBeTruthy();
  });

  it("drops an open tool when the workspace changes under it", async () => {
    world({ rows: [row({ label: "Tenant A tool" })] });
    const { host, root } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    expect(dialog(host)?.textContent).toContain("Tenant A tool");
    context.tenantId = "tenant-b";
    world({ rows: [] });
    await act(async () => root.render(<Section />));
    await act(async () => { await Promise.resolve(); });
    // The drawer holds one workspace's facts; it must not keep painting them over another's.
    expect(dialog(host)).toBeNull();
    expect(host.textContent).not.toContain("Tenant A tool");
  });

  it("says plainly that a tool the shipped path owns is changed on its own card", async () => {
    world({ rows: [row()], rpcWrite: { data: null, error: { code: "42501", message: "MCP_LEGACY_CONNECTION_READONLY: managed by the legacy connection path" } } });
    const { host } = await render();
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    await click(byText(host, "Disconnect"));
    await click(host.querySelector(".ig-gw-actions button[data-danger]"));
    // A refused disconnect must say something — and must not tell the owner to do it here.
    expect(dialog(host)?.textContent).toMatch(/integration card below/i);
    expect(dialog(host)?.textContent).not.toMatch(/disconnect it and add it again/i);
  });

  it("says a broken tool is broken, and offers the fix rather than a status code", async () => {
    world({ rows: [row({ status: "error", health: "needs_attention" })] });
    const { host } = await render();
    expect(host.textContent).toContain("Couldn’t reach it");
    await click(host.querySelector('[data-gateway-tool="conn-1"]'));
    expect(dialog(host)?.textContent).toMatch(/fix the address or re-key/i);
  });
});
