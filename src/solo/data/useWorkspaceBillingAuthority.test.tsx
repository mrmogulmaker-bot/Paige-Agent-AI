// @vitest-environment jsdom
//
// Billing Foundation A — the Solo-side authority read and the portal act.
//
// What must never happen (design v2 T9/C9): a previous workspace's billing authority painting
// under the next one, or a portal URL minted for workspace A being opened while the person is
// standing in workspace B. The hook stays MOUNTED across the switch — that is why these cases
// exist as a switch, not as a remount.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  tenantId: { current: "tenant-a" as string | null },
  open: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: harness.rpc, functions: { invoke: harness.invoke } },
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: harness.tenantId.current, loading: false }),
}));

import { decidePortalOpen, NO_WORKSPACE_AUTHORITY, PORTAL_REFUSAL_COPY, useWorkspaceBillingAuthority } from "./useWorkspaceBillingAuthority";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ownerRow = (tenant: string) => ({
  data: [{
    tenant_id: tenant, scope: "top_level_solo", role: "owner", can_manage_billing: true, billing_account_state: "mapped",
    can_view_billing: true, receives_billing_notices: true, billing_contact_state: "designated", paid_activation_ready: true,
  }],
  error: null,
});
// An admin who was designated a notice DELEGATE: receives notices, may neither view nor manage (R22).
const adminRow = (tenant: string) => ({
  data: [{
    tenant_id: tenant, scope: "top_level_solo", role: "admin", can_manage_billing: false, billing_account_state: "mapped",
    can_view_billing: false, receives_billing_notices: true, billing_contact_state: "designated", paid_activation_ready: true,
  }],
  error: null,
});

let root: Root | null = null;
let seen: Array<ReturnType<typeof useWorkspaceBillingAuthority>> = [];
function Probe() {
  const hook = useWorkspaceBillingAuthority();
  seen.push(hook);
  return null;
}
const latest = () => seen[seen.length - 1];
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => { root!.render(<Probe />); });
}
const switchWorkspaceTo = (id: string | null) => {
  harness.tenantId.current = id;
  act(() => { root!.render(<Probe />); });
};

beforeEach(() => {
  vi.stubGlobal("open", harness.open);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  seen = [];
  harness.rpc.mockReset();
  harness.invoke.mockReset();
  harness.open.mockReset();
  harness.tenantId.current = "tenant-a";
  vi.unstubAllGlobals();
});

describe("useWorkspaceBillingAuthority — the read", () => {
  it("a notice delegate receives notices and gains NO view or manage authority (R22)", async () => {
    harness.rpc.mockResolvedValueOnce(adminRow("tenant-a"));
    mount();
    await flush();
    expect(latest().authority?.receivesBillingNotices).toBe(true);
    expect(latest().authority?.canViewBilling).toBe(false);
    expect(latest().authority?.canManageBilling).toBe(false);
  });

  it("a row without the recipient fields parses to the safe defaults, never to an invented state", async () => {
    harness.rpc.mockResolvedValueOnce({
      data: [{ tenant_id: "tenant-a", scope: "top_level_solo", role: "owner", can_manage_billing: true, billing_account_state: "absent" }],
      error: null,
    });
    mount();
    await flush();
    expect(latest().authority?.canViewBilling).toBe(false);
    expect(latest().authority?.receivesBillingNotices).toBe(false);
    expect(latest().authority?.billingContactState).toBe("not_applicable");
    expect(latest().authority?.paidActivationReady).toBe(false);
  });

  it("starts loading, then reports the server's answer for the active workspace", async () => {
    harness.rpc.mockResolvedValueOnce(ownerRow("tenant-a"));
    mount();
    expect(latest().loading).toBe(true);
    expect(latest().authority).toBeNull();
    await flush();
    expect(latest().loading).toBe(false);
    expect(latest().authority).toEqual({
      tenantId: "tenant-a", scope: "top_level_solo", role: "owner", canManageBilling: true, billingAccountState: "mapped",
      canViewBilling: true, receivesBillingNotices: true, billingContactState: "designated", paidActivationReady: true,
    });
    expect(harness.rpc).toHaveBeenCalledWith("get_workspace_billing_authority");
  });

  it("a read failure is an error with retry, never an 'absent' or 'no subscription' state", async () => {
    harness.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    mount();
    await flush();
    expect(latest().error).toMatch(/could not be read/);
    expect(latest().authority).toBeNull();
    harness.rpc.mockResolvedValueOnce(ownerRow("tenant-a"));
    await act(async () => { await latest().refresh(); });
    expect(latest().error).toBeNull();
    expect(latest().authority?.canManageBilling).toBe(true);
  });

  it("switching workspace mid-flight drops the stale answer and never paints the previous workspace", async () => {
    let resolveA!: (v: unknown) => void;
    harness.rpc.mockImplementationOnce(() => new Promise((r) => { resolveA = r; }));
    mount();
    expect(latest().loading).toBe(true);
    harness.rpc.mockResolvedValueOnce(adminRow("tenant-b"));
    switchWorkspaceTo("tenant-b");
    expect(latest().loading).toBe(true);
    expect(latest().authority).toBeNull();
    await flush();
    expect(latest().authority?.tenantId).toBe("tenant-b");
    expect(latest().authority?.canManageBilling).toBe(false);
    // The late answer for tenant-a arrives now — it must be discarded.
    await act(async () => { resolveA(ownerRow("tenant-a")); await Promise.resolve(); });
    expect(latest().authority?.tenantId).toBe("tenant-b");
    expect(latest().authority?.canManageBilling).toBe(false);
  });

  it("with no active workspace the answer is 'none / not_applicable', not a guessed workspace", async () => {
    harness.tenantId.current = null;
    mount();
    await flush();
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(latest().authority).toEqual(NO_WORKSPACE_AUTHORITY);
  });
});

describe("useWorkspaceBillingAuthority — openPortal", () => {
  it("opens the URL exactly once when the response names the workspace the click was made in, and stores nothing", async () => {
    harness.rpc.mockResolvedValue(ownerRow("tenant-a"));
    harness.invoke.mockResolvedValueOnce({ data: { url: "https://billing.stripe.com/p/session/x", tenant_id: "tenant-a" }, error: null });
    mount();
    await flush();
    let result: unknown;
    await act(async () => { result = await latest().openPortal(); });
    expect(result).toEqual({ ok: true });
    expect(harness.invoke).toHaveBeenCalledWith("platform-billing-portal");
    expect(harness.open).toHaveBeenCalledTimes(1);
    expect(harness.open).toHaveBeenCalledWith("https://billing.stripe.com/p/session/x", "_blank", "noopener");
    // The URL is not kept anywhere on the hook's surface.
    expect(JSON.stringify(latest())).not.toContain("billing.stripe.com");
  });

  it("refuses to open a URL minted for a different workspace than the one clicked in", async () => {
    harness.rpc.mockResolvedValue(ownerRow("tenant-a"));
    harness.invoke.mockResolvedValueOnce({ data: { url: "https://billing.stripe.com/p/session/y", tenant_id: "tenant-b" }, error: null });
    mount();
    await flush();
    let result: unknown;
    await act(async () => { result = await latest().openPortal(); });
    expect(result).toEqual({ ok: false, reason: "workspace_changed" });
    expect(harness.open).not.toHaveBeenCalled();
  });

  it("a switch while the portal request is in flight discards the response even if it names the old workspace", async () => {
    harness.rpc.mockResolvedValue(ownerRow("tenant-a"));
    let resolvePortal!: (v: unknown) => void;
    harness.invoke.mockImplementationOnce(() => new Promise((r) => { resolvePortal = r; }));
    mount();
    await flush();
    let pending!: Promise<unknown>;
    act(() => { pending = latest().openPortal(); });
    harness.rpc.mockResolvedValue(adminRow("tenant-b"));
    switchWorkspaceTo("tenant-b");
    await flush();
    let result: unknown;
    await act(async () => { resolvePortal({ data: { url: "https://billing.stripe.com/p/session/z", tenant_id: "tenant-a" }, error: null }); result = await pending; });
    expect(result).toEqual({ ok: false, reason: "workspace_changed" });
    expect(harness.open).not.toHaveBeenCalled();
  });

  it("maps every server refusal to owner copy and opens nothing", async () => {
    harness.rpc.mockResolvedValue(adminRow("tenant-a"));
    mount();
    await flush();
    for (const code of ["owner_only", "not_applicable_scope", "billing_account_absent", "billing_account_ambiguous", "not_enabled", "needs_config", "audit_failed", "billing_account_unresolvable"] as const) {
      harness.invoke.mockResolvedValueOnce({ data: { error: code }, error: null });
      let result: unknown;
      await act(async () => { result = await latest().openPortal(); });
      expect(result).toEqual({ ok: false, reason: code });
      expect(PORTAL_REFUSAL_COPY[code]).toMatch(/\S/);
    }
    expect(harness.open).not.toHaveBeenCalled();
  });

  it("a transport failure is 'network' with retry copy, never a guessed refusal", async () => {
    harness.rpc.mockResolvedValue(ownerRow("tenant-a"));
    harness.invoke.mockResolvedValueOnce({ data: null, error: { message: "FunctionsFetchError" } });
    mount();
    await flush();
    let result: unknown;
    await act(async () => { result = await latest().openPortal(); });
    expect(result).toEqual({ ok: false, reason: "network" });
    expect(PORTAL_REFUSAL_COPY.network).toMatch(/Try again/);
  });
});

describe("decidePortalOpen — the pure contract", () => {
  it("needs both a url and the matching tenant id", () => {
    expect(decidePortalOpen("t1", { data: { url: "https://x", tenant_id: "t1" }, error: null })).toEqual({ open: "https://x" });
    expect(decidePortalOpen("t1", { data: { url: "https://x" }, error: null })).toEqual({ refuse: "network" });
    expect(decidePortalOpen(null, { data: { url: "https://x", tenant_id: "t1" }, error: null })).toEqual({ refuse: "workspace_changed" });
  });
  it("an unknown error code is reported as network, never as an access decision", () => {
    expect(decidePortalOpen("t1", { data: { error: "something_new" }, error: null })).toEqual({ refuse: "network" });
  });
});
