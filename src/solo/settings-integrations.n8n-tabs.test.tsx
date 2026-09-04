// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), tenant: "workspace-a", user: "user-a", loading: false, api: { configured: true, status: "error", workflow_count: 0, last_sync_at: "2026-09-03T12:00:00Z", base_url: "https://example.invalid" } as Record<string, unknown>, mcp: { configured: true, enabled: true, status: "error", auth_kind: "bearer", tool_count: null, approved_capabilities: [], pinned_count: 0 } as Record<string, unknown>, admin: true, apiError: false, mcpError: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }));
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => ({ activeTenantId: h.tenant, activeUserId: h.user, loading: h.loading }) }));
import { SoloIntegrationsView } from "./settings-integrations";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const click = async (element: Element | null | undefined) => { expect(element).toBeTruthy(); await act(async () => element!.dispatchEvent(new MouseEvent("click", { bubbles: true }))); };
const button = (text: string) => Array.from(host.querySelectorAll("button")).find(el => el.textContent?.trim() === text);
async function mount() { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>)); }
async function open() { await click(host.querySelector('[data-provider="n8n"].ig-card')); }
async function type(input: HTMLInputElement, text: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
beforeEach(() => { h.tenant = "workspace-a"; h.user = "user-a"; h.loading = false; h.admin = true; h.apiError = false; h.mcpError = false; h.api = { configured: true, status: "error", workflow_count: 0, last_sync_at: "2026-09-03T12:00:00Z", base_url: "https://example.invalid" }; h.mcp = { configured: true, enabled: true, status: "error", auth_kind: "bearer", tool_count: null, approved_capabilities: [], pinned_count: 0 }; h.rpc.mockImplementation((name: string) => { if (name === "get_tenant_n8n_api_readiness") return Promise.resolve({ data: { tenant_id: h.tenant, can_write: h.admin, health: h.api.status === "error" ? "needs_attention" : "saved_unverified", failure_code: h.api.status === "error" ? "authentication_rejected" : null, checked_at: null, last_success_at: null, ...h.api }, error: h.apiError ? { message: "private provider error" } : null }); if (name === "get_tenant_mcp_connections") return Promise.resolve({ data: { n8n: h.mcp }, error: h.mcpError ? { message: "private provider error" } : null }); if (name === "is_current_user_tenant_admin") return Promise.resolve({ data: h.admin, error: null }); return Promise.resolve({ data: null, error: null }); }); h.invoke.mockResolvedValue({ data: { ok: true }, error: null }); });
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
describe("approved n8n independent connection tabs", () => {
 it("shows both tile and overview states with no credential field by default", async () => { await mount(); const tile = host.querySelector('.ig-card[data-provider="n8n"]')!; expect(tile.textContent).toContain("API connection"); expect(tile.textContent).toContain("Paige tools (MCP)"); await open(); expect(host.querySelector('input[type="password"]')).toBeNull(); expect(host.querySelectorAll('[role="tab"]').length).toBeGreaterThanOrEqual(2); expect(host.textContent).toContain("Let Paige see the n8n workspace and its available workflows."); });
 it("keeps OAuth blocked and never displays a bearer or OAuth action", async () => { await mount(); await open(); await click(button("Paige tools (MCP)")); expect(host.textContent).toContain("OAuth setup is temporarily unavailable while the secure connection path is being completed."); expect(host.textContent).toContain("not OAuth"); expect(host.querySelector("form")).toBeNull(); expect(button("Connect n8n with OAuth")).toBeUndefined(); expect(h.invoke).not.toHaveBeenCalled(); });
 it("never infers successful API health or zero from a saved connected record", async () => { h.api.status = "connected"; await mount(); await open(); expect(host.textContent).toContain("health has not been verified"); expect(host.textContent).not.toContain("0 workflows seen"); expect(host.textContent).not.toContain("Last successful check"); });
 it.each(["api", "mcp"])("keeps other connection readable when %s read fails", async which => { h.apiError = which === "api"; h.mcpError = which === "mcp"; await mount(); await open(); expect(host.textContent).toContain("Status unavailable"); expect(host.textContent).toContain(which === "api" ? "OAuth setup unavailable" : "Needs attention"); expect(host.textContent).not.toContain("private provider error"); });
 it("refreshes MCP through reads only", async () => { await mount(); await open(); await click(button("Paige tools (MCP)")); const before = h.rpc.mock.calls.length; await click(button("Refresh status")); expect(h.rpc.mock.calls.length).toBeGreaterThan(before); expect(h.invoke).not.toHaveBeenCalled(); });
 it("guards dirty API details on tab change", async () => { await mount(); await open(); await click(button("Reconnect API")); await type(host.querySelector('input[type="password"]')!, "local-draft"); await click(button("Paige tools (MCP)")); expect(host.textContent).toContain("unsaved API details"); await click(button("Keep editing")); expect(host.querySelector('input[type="password"]')).toBeTruthy(); await click(button("Paige tools (MCP)")); await click(button("Discard changes")); expect(host.querySelector('input[type="password"]')).toBeNull(); expect(host.textContent).toContain("Let Paige use the n8n tools and workflows you explicitly authorize."); });
 it("shows legacy connected tools as non-OAuth and Manage access never grants or discovers", async () => { h.mcp = { ...h.mcp, status: "connected", tool_count: 2, approved_capabilities: ["read_workflows"], pinned_count: 1 }; await mount(); await open(); await click(button("Paige tools (MCP)")); expect(host.textContent).toContain("not OAuth"); await click(button("Manage access")); expect(host.textContent).toContain("read-only"); expect(h.invoke).not.toHaveBeenCalled(); });
 it("requires confirmation before removing MCP and leaves API intact", async () => { await mount(); await open(); await click(button("Paige tools (MCP)")); await click(button("Remove saved MCP connection")); expect(h.invoke).not.toHaveBeenCalled(); await click(button("Confirm removal")); expect(h.invoke.mock.calls.at(-1)?.[1].body.action).toBe("disconnect"); expect(h.rpc.mock.calls.some(c => c[0] === "clear_tenant_n8n_connection")).toBe(false); });
 it("closes and drops drafts immediately on workspace change", async () => { await mount(); await open(); await click(button("Reconnect API")); await type(host.querySelector('input[type="password"]')!, "local-draft"); h.tenant = "workspace-b"; await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>)); expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(host.innerHTML).not.toContain("local-draft"); });
 it("lets a viewer read both tabs without mutations", async () => { h.admin = false; await mount(); await open(); expect(button("Reconnect API")).toBeUndefined(); await click(button("Paige tools (MCP)")); expect(button("Remove saved MCP connection")).toBeUndefined(); expect(button("Refresh status")).toBeTruthy(); });
});

it("does not describe an in-flight save as discardable or canceled by closing", async () => {
  await mount(); await open(); await click(button("Reconnect API"));
  await type(host.querySelector('input[type="password"]')!, "local-only-draft");
  const ordinary = h.rpc.getMockImplementation()!;
  let finish!: (result: unknown) => void;
  h.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(host.textContent).toContain("Saving and checking this connection…");
  expect((button("Paige tools (MCP)") as HTMLButtonElement).disabled).toBe(true);
  await click(host.querySelector('button[aria-label="Close n8n"]'));
  expect(host.textContent).toContain("Saving is still in progress. Closing will not cancel it.");
  expect(button("Discard changes")).toBeUndefined();
  await click(button("Close while saving"));
  finish({ data: null, error: null }); await act(async () => { await Promise.resolve(); });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.innerHTML).not.toContain("local-only-draft");
});

it.each(["user", "loading"])("drops the drawer on a same-workspace %s identity boundary", async change => {
  await mount(); await open(); await click(button("Reconnect API"));
  await type(host.querySelector('input[type="password"]')!, "local-only-draft");
  if (change === "user") h.user = "user-b"; else h.loading = true;
  await act(async () => root.render(<MemoryRouter><SoloIntegrationsView /></MemoryRouter>));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.innerHTML).not.toContain("local-only-draft");
});

it("uses arrow keys for the two connection tabs without changing authority", async () => {
  await mount(); await open();
  const apiTab = button("API connection")!; apiTab.focus();
  await act(async () => apiTab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(button("Paige tools (MCP)")?.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(button("Paige tools (MCP)"));
  expect(h.invoke).not.toHaveBeenCalled();
});
it("shows verified zero-workflow health independently of blocked MCP", async()=>{ h.api={...h.api,status:undefined,health:"connected",checked_at:"2026-09-03T12:00:00Z",last_success_at:"2026-09-03T12:00:00Z",workflow_count:0}; await mount();await open();expect(host.querySelector('.ig-n8n-summary')?.textContent).toContain("Connected");expect(host.textContent).toContain("0 workflows available");expect(host.textContent).toContain("Last successful check");expect(host.textContent).toContain("OAuth setup unavailable");});
 it("closes a saved but refused draft, clears the key, and offers reconnect",async()=>{await mount();await open();await click(button("Reconnect API"));await type(host.querySelector('input[type="password"]')!,"local-draft");h.invoke.mockResolvedValue({data:{ok:true,saved:true,outcome:"needs_attention",connection:{tenant_id:h.tenant,can_write:true,...h.api,health:"needs_attention",failure_code:"authentication_rejected",checked_at:"2026-09-03T12:00:00Z",last_success_at:null,workflow_count:null}},error:null});await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.querySelector('form')).toBeNull();expect(host.textContent).toContain("The saved n8n connection needs attention. Check the API key or its access in n8n, then reconnect.");expect(button("Reconnect API")).toBeTruthy();expect(host.innerHTML).not.toContain("local-draft");});
 it("checks the saved API key again through the server without a credential form",async()=>{await mount();await open();h.invoke.mockResolvedValue({data:{ok:true,outcome:"connected",connection:{tenant_id:h.tenant,can_write:true,...h.api,health:"connected",failure_code:null,checked_at:"2026-09-03T12:00:00Z",last_success_at:"2026-09-03T12:00:00Z",workflow_count:0}},error:null});await click(button("Refresh status"));expect(h.invoke).toHaveBeenCalledWith("tenant-n8n-api-connect",{body:{action:"validate",expected_tenant_id:h.tenant}});expect(host.querySelector('input[type="password"]')).toBeNull();expect(host.textContent).toContain("0 workflows available");});