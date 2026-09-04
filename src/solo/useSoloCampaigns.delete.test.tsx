import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSoloCampaigns, type PipelineAction, type SoloCampaignsState } from "./useSoloCampaigns";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = vi.hoisted(() => ({ tenant: "a", rpc: vi.fn(), reads: 0 }));
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => ({ activeTenantId: fixture.tenant, activeTenant: { slug: "test" }, accountContextLoading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...args: unknown[]) => fixture.rpc(...args),
  from: () => { fixture.reads++; const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, then: (resolve: (data: unknown) => void) => Promise.resolve({data: [], error: null}).then(resolve) }; return query; },
} }));
let host: HTMLDivElement, root: Root, state: SoloCampaignsState;
function Probe() { state = useSoloCampaigns(); return null; }
const command: PipelineAction = { type: "delete-empty-pipeline", pipelineId: "exact-id", pipelineRef: "PPL-AAAAA", expectedVersion: 3, expectedStageCount: 2, idempotencyKey: "repeat-this" };
beforeEach(async () => {
  fixture.tenant = "a"; fixture.reads = 0; fixture.rpc.mockReset().mockResolvedValue({data: {}, error: null});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Probe/>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
it("passes exact identity and a context assertion to the dedicated server-owned delete contract", async () => {
  fixture.rpc.mockResolvedValue({data: {ok: true, message: "Deleted"}, error: null});
  await act(async () => { const result = await state.pipelineAction(command); expect(result.ok).toBe(true); });
  expect(fixture.rpc).toHaveBeenCalledWith("delete_empty_pipeline", {
    _expected_tenant_id: "a", _pipeline_id: "exact-id", _pipeline_ref: "PPL-AAAAA", _expected_version: 3, _expected_stage_count: 2, _idempotency_key: "repeat-this",
  });
});
it("does not refresh or publish an old completion after A to B to A", async () => {
  let finish!: (value: unknown) => void;
  fixture.rpc.mockImplementation((name: string) => name === "delete_empty_pipeline" ? new Promise(resolve => {finish = resolve;}) : Promise.resolve({data: {}, error: null}));
  const request = state.pipelineAction(command);
  fixture.tenant = "b"; await act(async () => root.render(<Probe/>));
  fixture.tenant = "a"; await act(async () => root.render(<Probe/>));
  const readsBefore = fixture.reads;
  let outcome;
  await act(async () => { finish({data: {ok: true, message: "Deleted old workspace"}, error: null}); outcome = await request; });
  expect(outcome).toMatchObject({ok: false}); expect(fixture.reads).toBe(readsBefore);
});
it("does not send an old closure into a different workspace", async () => {
  const oldAction = state.pipelineAction;
  fixture.tenant = "b"; await act(async () => root.render(<Probe/>));
  fixture.rpc.mockClear();
  expect((await oldAction(command)).ok).toBe(false); expect(fixture.rpc).not.toHaveBeenCalled();
});
it("keeps refusal and uncertain transport results honest", async () => {
  fixture.rpc.mockResolvedValue({data: {ok: false, message: "3 deals remain."}, error: null});
  expect(await state.pipelineAction(command)).toMatchObject({ok: false, message: "3 deals remain."});
  fixture.rpc.mockResolvedValue({data: null, error: {message: "network interrupted"}});
  expect((await state.pipelineAction(command)).message).toContain("could not be confirmed");
});
