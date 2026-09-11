// Render tests for the Approvals workspace (Command Center destination, #20 ⑤).
// House idiom: createRoot + act + direct DOM. The queue ROW is the proven
// ApprovalRow — these tests own the DESTINATION: states, scoping, refresh wiring.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SoloApprovalsWorkspace } from "./SoloApprovalsWorkspace";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string; type: string; category: string | null; status: string; summary: string | null; contact_first_name?: string | null; contact_last_name?: string | null };

const state: {
  items?: Row[];
  loading?: boolean;
  error?: string | null;
  refresh?: ReturnType<typeof vi.fn>;
  tenant?: string | null;
} = {};

vi.mock("@/hooks/usePendingApprovals", () => ({
  usePendingApprovals: () => ({
    items: state.items ?? [],
    loading: state.loading ?? false,
    error: state.error ?? null,
    refresh: state.refresh ?? vi.fn(),
  }),
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: state.tenant ?? "t-1", activeUserId: "u-1" }),
}));
vi.mock("@/components/paige/ApprovalRow", () => ({
  ApprovalRow: ({ a }: { a: Row }) => <div data-testid="approval-row">{a.summary ?? a.id}</div>,
}));

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  state.items = [];
  state.loading = false;
  state.error = null;
  state.refresh = vi.fn();
  state.tenant = "t-1";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render_(workspaceId: string | null = "t-1") {
  act(() => root.render(<SoloApprovalsWorkspace accountContext={null} openPaige={undefined} workspaceId={workspaceId} />));
}
async function settle() {
  await act(async () => {});
}

it("renders the queue from the hook with one row per pending approval", async () => {
  state.items = [
    { id: "a1", type: "comms_draft", category: "email", status: "pending", summary: "Re-engagement: Lavelle" },
    { id: "a2", type: "comms_draft", category: "email", status: "pending", summary: "Re-engagement: Marcus" },
  ];
  render_();
  await settle();
  const rows = host.querySelectorAll('[data-testid="approval-row"]');
  expect(rows.length).toBe(2);
  expect(host.textContent ?? "").toContain("Re-engagement: Lavelle");
});

it("empty is honest and inviting — never a fake queue", async () => {
  render_();
  await settle();
  expect(host.textContent ?? "").toMatch(/Nothing is waiting on you/i);
  expect(host.querySelectorAll('[data-testid="approval-row"]').length).toBe(0);
});

it("a load error offers Retry wired to the hook's refresh — never fabricated rows", async () => {
  state.error = "rls blew up";
  render_();
  await settle();
  expect(host.textContent ?? "").toMatch(/Couldn't load the approvals queue/i);
  const retry = [...host.querySelectorAll("button")].find((b) => b.textContent === "Retry")!;
  expect(retry).toBeTruthy();
  await act(async () => { retry.click(); });
  expect(state.refresh).toHaveBeenCalled();
});

it("loading shows a live status, and a foreign workspace scope shows loading rather than another tenant's queue", async () => {
  state.loading = true;
  render_();
  await settle();
  expect(host.textContent ?? "").toMatch(/Loading the approvals queue/i);

  state.loading = false;
  state.items = [{ id: "a1", type: "t", category: null, status: "pending", summary: "should not show" }];
  render_("t-OTHER"); // panel mounted for a different workspace id
  await settle();
  expect(host.textContent ?? "").toMatch(/Loading the approvals queue/i);
  expect(host.textContent ?? "").not.toContain("should not show");
});
