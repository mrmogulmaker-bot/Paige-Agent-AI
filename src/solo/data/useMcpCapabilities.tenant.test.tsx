// @vitest-environment jsdom
//
// One workspace's discovered capabilities must never be on screen under another's identity.
//
// The panel stays MOUNTED across a workspace switch — that is the whole point, and it is
// why unmounting between workspaces would not reproduce this. Without a reset and a
// request gate, the first workspace's tool list stayed visible, and a discovery already in
// flight for it landed afterwards and overwrote whatever the second one had. Two
// workspaces whose providers expose the same tool names and the same schema hashes would
// then let an Approve click apply a selection read for one of them to the other.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  invoke: vi.fn(),
  tenantId: { current: "tenant-a" as string | null },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: harness.invoke }, rpc: vi.fn() },
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: harness.tenantId.current, loading: false }),
}));

import { useMcpCapabilities } from "./useMcpCapabilities";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const tools = (names: string[]) => ({
  data: { ok: true, tools: names.map((n) => ({ name: n, description: "", pin: "a".repeat(64), approved: false })) },
  error: null,
});

let root: Root | null = null;
let seen: Array<ReturnType<typeof useMcpCapabilities>> = [];

function Probe() {
  const hook = useMcpCapabilities("zapier");
  seen.push(hook);
  return null;
}

const latest = () => seen[seen.length - 1];
/** The workspace switch, with the panel left mounted: same component, new tenant. */
const switchWorkspaceTo = (id: string) => {
  harness.tenantId.current = id;
  act(() => { root!.render(<Probe />); });
};

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  seen = [];
  harness.invoke.mockReset();
  harness.tenantId.current = "tenant-a";
});

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(<Probe />); });
}

describe("capability discovery across a workspace switch", () => {
  it("drops the previous workspace's tools when the active workspace changes", async () => {
    harness.invoke.mockResolvedValueOnce(tools(["gmail_send_email"]));
    mount();

    await act(async () => { await latest().discover(); });
    expect(latest().tools?.map((t) => t.name)).toEqual(["gmail_send_email"]);

    switchWorkspaceTo("tenant-b");
    expect(latest().tools).toBeNull();
  });

  it("ignores a discovery that lands after the workspace changed", async () => {
    // In flight for tenant-a, resolving only AFTER the switch to tenant-b.
    let land!: (v: unknown) => void;
    harness.invoke.mockReturnValueOnce(new Promise((r) => { land = r; }));
    mount();

    const inFlight = act(async () => { await latest().discover(); });
    switchWorkspaceTo("tenant-b");

    land(tools(["gmail_send_email"]));
    await inFlight;
    await act(async () => { await Promise.resolve(); });

    // The stale response must not be accepted for the workspace now on screen.
    expect(latest().tools).toBeNull();
  });

  // The server resolves the tenant itself; this value only lets it REFUSE. Without it, a
  // request started for one workspace and landing after a switch is silently rebound to
  // whichever workspace is active by then — the approval applies to the wrong book.
  it("tells the server which workspace the request was started for", async () => {
    harness.invoke.mockResolvedValueOnce(tools(["gmail_send_email"]));
    mount();
    await act(async () => { await latest().discover(); });

    expect(harness.invoke).toHaveBeenCalledWith("tenant-mcp-connect", {
      body: { provider: "zapier", action: "discover", expected_tenant_id: "tenant-a" },
    });
  });

  it("...and sends it when approving, which is the mutation that matters", async () => {
    harness.invoke.mockResolvedValueOnce(tools(["gmail_send_email"]));
    mount();
    await act(async () => { await latest().discover(); });
    harness.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await act(async () => { await latest().approve(["gmail_send_email"]); });

    const approve = harness.invoke.mock.calls.at(-1);
    expect(approve?.[1]?.body?.expected_tenant_id).toBe("tenant-a");
  });

  it("ignores an approval that lands after the workspace changed", async () => {
    harness.invoke.mockResolvedValueOnce(tools(["gmail_send_email"]));
    mount();
    await act(async () => { await latest().discover(); });

    // Started for tenant-a and left in flight. Not wrapped in `act`: the point is that it
    // is still outstanding while other work happens, and nesting act scopes around it
    // makes the interleaving the test is about impossible to arrange.
    let land!: (v: unknown) => void;
    harness.invoke.mockReturnValueOnce(new Promise((r) => { land = r; }));
    const saving = latest().approve(["gmail_send_email"]);

    // Tenant B is switched to AND has loaded its own list before A's approval returns.
    // Without this, the reset alone satisfies the assertion — tools are null either way —
    // and the gate passes for free.
    switchWorkspaceTo("tenant-b");
    harness.invoke.mockResolvedValueOnce(tools(["gmail_send_email", "slack_post"]));
    await act(async () => { await latest().discover(); });
    expect(latest().tools?.map((t) => t.name)).toEqual(["gmail_send_email", "slack_post"]);

    land({ data: { ok: true }, error: null });
    await act(async () => { await saving; });

    // The write was confined to tenant-a by `expected_tenant_id`. The SCREEN must not now
    // show tenant-a's approval applied to tenant-b's list.
    expect(latest().tools?.map((t) => t.name)).toEqual(["gmail_send_email", "slack_post"]);
    expect(latest().tools?.every((t) => t.approved === false)).toBe(true);
  });

  // The case the reset alone cannot cover, and therefore the one that proves the gate is
  // load-bearing rather than decorative: two discoveries in flight for the SAME workspace,
  // the OLDER one answering last. No tenant changes, so nothing clears state — only the
  // epoch check can tell which answer is still the current question.
  it("keeps the newest discovery when an older one answers last", async () => {
    let landFirst!: (v: unknown) => void;
    let landSecond!: (v: unknown) => void;
    harness.invoke.mockReturnValueOnce(new Promise((r) => { landFirst = r; }));
    harness.invoke.mockReturnValueOnce(new Promise((r) => { landSecond = r; }));
    mount();

    const first = act(async () => { await latest().discover(); });
    const second = act(async () => { await latest().discover(); });

    landSecond(tools(["current_tool"]));
    await second;
    landFirst(tools(["superseded_tool"]));
    await first;
    await act(async () => { await Promise.resolve(); });

    expect(latest().tools?.map((t) => t.name)).toEqual(["current_tool"]);
  });
});
