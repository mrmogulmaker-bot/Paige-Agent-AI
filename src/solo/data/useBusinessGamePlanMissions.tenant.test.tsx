import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: api.rpc, functions: { invoke: api.invoke } } }));

import { useBusinessGamePlanMissions } from "./useBusinessGamePlanMissions";

let host: HTMLDivElement;
let root: Root;
let snapshots: Array<{ status: string; titles: string[]; error: string | null }>;

function Probe({ workspace }: { workspace: string }) {
  const result = useBusinessGamePlanMissions(workspace);
  React.useEffect(() => {
    snapshots.push({ status: result.status, titles: result.items.map((item) => item.title), error: result.errorCode });
  }, [result.status, result.items, result.errorCode]);
  return null;
}

beforeEach(() => {
  api.rpc.mockReset(); api.invoke.mockReset(); snapshots = [];
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const envelope = (tenant: string, title: string) => ({
  data: { resolved_tenant_id: tenant, missions: [{
    id: "11111111-1111-4111-8111-111111111111", title, state: "active", state_reason: null,
    next_action: null, revision: 1, created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z",
    deadline_on: null, desired_outcome: "Outcome", success_definition: "Success", brief_version: 1,
    closure_outcome: null, outcome_summary: null, request_source: "owner_ui",
  }] },
  error: null,
});

describe("Business Game Plan tenant read fence", () => {
  it("discards a late result after workspace switching", async () => {
    let resolveA!: (value: unknown) => void;
    let resolveB!: (value: unknown) => void;
    api.rpc
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve; }));
    await act(async () => { root.render(<Probe workspace="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" />); });
    await act(async () => { root.render(<Probe workspace="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" />); });
    await act(async () => { resolveA(envelope("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Old workspace")); await Promise.resolve(); });
    expect(snapshots.some((item) => item.titles.includes("Old workspace"))).toBe(false);
    await act(async () => { resolveB(envelope("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Current workspace")); await Promise.resolve(); });
    expect(snapshots.at(-1)).toMatchObject({ status: "ready", titles: ["Current workspace"] });
  });

  it("refuses a list whose server-resolved tenant differs from the active workspace", async () => {
    api.rpc.mockResolvedValue(envelope("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Foreign"));
    await act(async () => { root.render(<Probe workspace="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" />); await Promise.resolve(); });
    expect(snapshots.at(-1)).toMatchObject({ status: "error", titles: [], error: "ACTIVE_ACCOUNT_CHANGED" });
  });
});
