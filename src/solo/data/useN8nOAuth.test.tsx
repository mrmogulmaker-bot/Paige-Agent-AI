// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), user: "owner-a", tenant: "tenant-a" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }));
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => ({ activeTenantId: h.tenant, activeUserId: h.user, loading: false }) }));
import { useN8nOAuth, readN8nReadiness, n8nMcpStateWords } from "./useN8nOAuth";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ready = (tenant = h.tenant, manage = true) => ({ tenant_id: tenant, can_manage: manage, api: { state: "connected_zero_workflows", workflow_count: 0 }, mcp: { state: "not_configured", oauth_readiness: "authorization_needed", approved_workflow_count: 0, approved_tool_count: 0 } });
let root: Root;
let value: ReturnType<typeof useN8nOAuth>;
function Probe() { value = useN8nOAuth(); return null; }
async function mount() { root = createRoot(document.createElement("div")); await act(async () => root.render(<Probe />)); }
beforeEach(() => { h.user = "owner-a"; h.tenant = "tenant-a"; h.rpc.mockImplementation(() => Promise.resolve({ data: ready(), error: null })); h.invoke.mockResolvedValue({ data: { ok: true }, error: null }); });
afterEach(() => { act(() => root?.unmount()); vi.clearAllMocks(); });
describe("n8n OAuth tenant-bound owner flow", () => {
 it("retains API zero separately from failed health and whitelists safe fields", () => {
   const input = ready();
   expect(readN8nReadiness({ ...input, secret: "never-show" }, "tenant-a")?.api.workflowCount).toBe(0);
   expect(readN8nReadiness({ ...input, api: { state: "health_failed", workflow_count: 0 } }, "tenant-a")?.api.workflowCount).toBeNull();
   expect(JSON.stringify(readN8nReadiness({ ...input, secret: "never-show" }, "tenant-a"))).not.toContain("never-show");
   expect(readN8nReadiness(input, "tenant-b")).toBeNull();
 });
 it("distinguishes authorization, no tools, expired and unavailable", () => {
   expect(n8nMcpStateWords("connected_no_approved_tools")).toContain("no approved");
   expect(n8nMcpStateWords("token_expired")).toContain("expired");
   expect(n8nMcpStateWords("consent_in_progress")).toContain("progress");
   expect(n8nMcpStateWords("provider_unavailable")).toContain("unavailable");
 });
 it("refuses non-owner mutations before invoking", async () => {
   h.rpc.mockResolvedValue({ data: ready("tenant-a", false), error: null }); await mount();
   await act(async () => { expect(await value.begin("https://n8n.example/mcp-server/http")).toBeNull(); });
   expect(h.invoke).not.toHaveBeenCalled();
 });
 it("binds start and cancellation to the workspace and returns only a launch URL", async () => {
   await mount(); h.invoke.mockResolvedValueOnce({ data: { launch_url: "https://paige.example/oauth/callback", launch_ticket: "fresh-ticket", launch_proof: "fresh-proof" }, error: null });
   await act(async () => { expect(await value.begin("https://n8n.example/mcp-server/http")).toEqual({ launchUrl: "https://paige.example/oauth/callback", launchTicket: "fresh-ticket", launchProof: "fresh-proof" }); });
   expect(h.invoke).toHaveBeenCalledWith("tenant-n8n-oauth", { body: { action: "begin", expected_tenant_id: "tenant-a", server_url: "https://n8n.example/mcp-server/http" } });
   await act(async () => { await value.cancel(); });
   expect(h.invoke.mock.calls.at(-1)?.[1].body).toEqual({ action: "cancel", expected_tenant_id: "tenant-a" });
 });
 it("drops late start responses after workspace switch so they cannot navigate", async () => {
   await mount(); let land!: (v: unknown) => void;
   h.invoke.mockReturnValueOnce(new Promise(resolve => { land = resolve; }));
   let start!: ReturnType<typeof value.begin>; act(() => { start = value.begin("https://n8n.example/mcp-server/http"); });
   h.tenant = "tenant-b"; await act(async () => root.render(<Probe />));
   land({ data: { launch_url: "https://paige.example/oauth/callback", launch_ticket: "old-ticket", launch_proof: "old-proof" }, error: null });
   await act(async () => { expect(await start).toBeNull(); });
   expect(value.readiness?.tenantId).toBe("tenant-b");
 });
 it("redacts provider errors and allows retry", async () => {
   await mount(); h.invoke.mockRejectedValueOnce(new Error("provider secret payload"));
   await act(async () => { await value.verify(); });
   expect(value.error).not.toContain("secret"); expect(value.busy).toBe(false);
   await act(async () => { expect(await value.verify()).toBe(true); });
 });
});


it("does not invent empty inventory or a provider outage from malformed readiness", () => {
  const input = ready();
  const result = readN8nReadiness({ ...input, mcp: { state: "future_state", approved_workflow_count: null, approved_tool_count: "0" } }, "tenant-a");
  expect(result?.mcp.approvedWorkflowCount).toBeNull();
  expect(result?.mcp.approvedToolCount).toBeNull();
  expect(result?.mcp.state).toBe("unavailable");
  expect(n8nMcpStateWords(result!.mcp.state)).toBe("Connection status unavailable");
});

it("refreshes server evidence after a refused check records token expiry", async () => {
  await mount();
  h.invoke.mockResolvedValueOnce({ data: { error: "token_expired" }, error: null });
  h.rpc.mockResolvedValueOnce({ data: { ...ready(), mcp: { ...ready().mcp, state: "token_expired" } }, error: null });
  await act(async () => { expect(await value.verify()).toBe(false); });
  expect(value.readiness?.mcp.state).toBe("token_expired");
  expect(value.busy).toBe(false);
});

it("drops a late OAuth launch after a same-workspace owner switch", async () => {
 await mount(); let finish!: (v: unknown) => void;
 h.invoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
 let start!: ReturnType<typeof value.begin>; act(() => { start = value.begin("https://tenant.example/mcp-server/http"); });
 h.user = "owner-b"; await act(async () => root.render(<Probe />));
 finish({ data: { launch_url: "https://paige.example/oauth/callback", launch_ticket: "old-ticket", launch_proof: "old-proof" }, error: null });
 await act(async () => { expect(await start).toBeNull(); });
 expect(value.busy).toBe(false);
});
it("keeps partial discovery counts scoped and drops late workspace responses", async () => {
 await mount(); h.invoke.mockResolvedValueOnce({data:{workflows:[{id:"a",name:"Visible",approved:false}],inventory_complete:false,total_count:350,discovery_id:"snapshot"},error:null});
 await act(async()=>value.discover()); expect(value.inventory).toEqual({complete:false,totalCount:350});expect(value.workflows).toHaveLength(1);
 let finish!: (v:unknown)=>void;h.invoke.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));let pending!:Promise<void>;act(()=>{pending=value.discover();});expect(value.inventory).toBeNull();
 h.tenant="tenant-b";await act(async()=>root.render(<Probe/>));finish({data:{workflows:[],inventory_complete:true,total_count:0},error:null});await act(async()=>pending);expect(value.inventory).toBeNull();expect(value.workflows).toBeNull();
});
it("never treats absent completeness or malformed count as complete zero",async()=>{
 await mount();h.invoke.mockResolvedValueOnce({data:{workflows:[],total_count:-1},error:null});await act(async()=>value.discover());expect(value.inventory).toEqual({complete:false,totalCount:null});
});
it.each([{workflows:[],total_count:null},{workflows:[{id:"a",name:"A"}],total_count:0},{workflows:null,total_count:0},{workflows:[{}],total_count:1}])("rejects inconsistent complete inventory %#",async(payload)=>{
 await mount();h.invoke.mockResolvedValueOnce({data:{...payload,inventory_complete:true},error:null});await act(async()=>value.discover());expect(value.inventory?.complete).toBe(false);
});
it("a retained old-workspace discover callback cannot clear the new inventory",async()=>{
 await mount();const previous=value.discover;h.tenant="tenant-b";await act(async()=>root.render(<Probe/>));h.invoke.mockResolvedValueOnce({data:{workflows:[{id:"b",name:"B"}],total_count:1,inventory_complete:true},error:null});await act(async()=>value.discover());const calls=h.invoke.mock.calls.length;await act(async()=>previous());expect(value.workflows?.[0].id).toBe("b");expect(value.inventory).toEqual({complete:true,totalCount:1});expect(h.invoke).toHaveBeenCalledTimes(calls);
});
