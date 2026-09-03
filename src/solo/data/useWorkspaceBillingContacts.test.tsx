// @vitest-environment jsdom
//
// Billing Foundation A — the Owner's contacts read and the designate / revoke acts (R18–R26).
// The hook stays MOUNTED across a workspace switch, exactly like the authority hook's tests.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rpc: vi.fn(),
  tenantId: { current: "tenant-a" as string | null },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: harness.rpc } }));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: harness.tenantId.current, loading: false }),
}));

import { BILLING_CONTACT_REFUSAL_COPY, refusalFromError, useWorkspaceBillingContacts } from "./useWorkspaceBillingContacts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const row = (id: string, user: string, designation: string, extra: Record<string, unknown> = {}) => ({
  id, user_id: user, designation, role: designation === "primary_contact" ? "owner" : "admin",
  display_name: "Person " + user, email_verified: true, still_eligible: true,
  designated_at: "2026-09-02T00:00:00Z", designated_by: "u-owner", ...extra,
});
const list = (rows: unknown[]) => ({ data: rows, error: null });
const refused = (code: string) => ({ data: null, error: { message: code } });

let root: Root | null = null;
let seen: Array<ReturnType<typeof useWorkspaceBillingContacts>> = [];
function Probe() {
  const hook = useWorkspaceBillingContacts();
  seen.push(hook);
  return null;
}
const latest = () => seen[seen.length - 1];
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };
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

beforeEach(() => {});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  seen = [];
  harness.rpc.mockReset();
  harness.tenantId.current = "tenant-a";
});

describe("useWorkspaceBillingContacts — the read", () => {
  it("starts loading, then carries the server's list with its eligibility flags", async () => {
    harness.rpc.mockResolvedValueOnce(list([row("r1", "u-owner", "primary_contact"), row("r2", "u-admin", "delegate", { still_eligible: false })]));
    mount();
    expect(latest().loading).toBe(true);
    expect(latest().contacts).toBeNull();
    await flush();
    expect(latest().loading).toBe(false);
    expect(latest().contacts?.map((r) => [r.id, r.designation, r.stillEligible])).toEqual([
      ["r1", "primary_contact", true],
      ["r2", "delegate", false],
    ]);
    expect(harness.rpc).toHaveBeenCalledWith("get_workspace_billing_contacts");
  });

  it("an owner-only refusal is a refusal state, never an empty 'no contacts' list (R8)", async () => {
    harness.rpc.mockResolvedValueOnce(refused("billing_workspace_owner_only"));
    mount();
    await flush();
    expect(latest().refusal).toBe("billing_workspace_owner_only");
    expect(latest().contacts).toBeNull();
    expect(BILLING_CONTACT_REFUSAL_COPY[latest().refusal!]).toMatch(/owner/);
  });

  it("no active workspace is reported as such", async () => {
    harness.tenantId.current = null;
    mount();
    await flush();
    expect(latest().refusal).toBe("no_active_workspace");
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("a switch mid-flight drops the previous workspace's answer and never paints it", async () => {
    let resolveA!: (v: unknown) => void;
    harness.rpc.mockImplementationOnce(() => new Promise((r) => { resolveA = r; }));
    harness.rpc.mockResolvedValueOnce(list([row("rb", "u-b", "primary_contact")]));
    mount();
    switchWorkspaceTo("tenant-b");
    expect(latest().loading).toBe(true);
    expect(latest().contacts).toBeNull();
    await act(async () => { resolveA(list([row("ra", "u-a", "primary_contact")])); await Promise.resolve(); });
    await flush();
    expect(latest().contacts?.map((r) => r.id)).toEqual(["rb"]);
  });
});

describe("useWorkspaceBillingContacts — the acts", () => {
  it("designate calls the server seam with the chosen person and kind, then re-reads the list", async () => {
    harness.rpc
      .mockResolvedValueOnce(list([]))
      .mockResolvedValueOnce({ data: { id: "r9", designation: "delegate" }, error: null })
      .mockResolvedValueOnce(list([row("r9", "u-admin", "delegate")]));
    mount();
    await flush();
    let result: unknown;
    await act(async () => { result = await latest().designate("u-admin", "delegate"); });
    await flush();
    expect(result).toEqual({ ok: true });
    expect(harness.rpc).toHaveBeenNthCalledWith(2, "platform_billing_contact_designate", { p_user_id: "u-admin", p_designation: "delegate" });
    expect(latest().contacts?.map((r) => r.id)).toEqual(["r9"]);
    expect(latest().lastAct).toEqual({ ok: true });
  });

  it("a server refusal is carried by its code and does not touch the list", async () => {
    harness.rpc
      .mockResolvedValueOnce(list([row("r1", "u-owner", "primary_contact")]))
      .mockResolvedValueOnce(refused("billing_contact_email_unverified"));
    mount();
    await flush();
    let result: unknown;
    await act(async () => { result = await latest().designate("u-new", "delegate"); });
    expect(result).toEqual({ ok: false, reason: "billing_contact_email_unverified" });
    expect(latest().contacts?.map((r) => r.id)).toEqual(["r1"]);
    expect(harness.rpc).toHaveBeenCalledTimes(2);
  });

  it("revoke calls the server seam and reports the last-owner refusal verbatim", async () => {
    harness.rpc
      .mockResolvedValueOnce(list([row("r1", "u-owner", "primary_contact")]))
      .mockResolvedValueOnce(refused("billing_primary_contact_required_while_subscribed"));
    mount();
    await flush();
    let result: unknown;
    await act(async () => { result = await latest().revoke("r1"); });
    expect(result).toEqual({ ok: false, reason: "billing_primary_contact_required_while_subscribed" });
    expect(harness.rpc).toHaveBeenNthCalledWith(2, "platform_billing_contact_revoke", { p_contact_id: "r1" });
  });

  it("an act whose answer lands after a workspace switch is reported as workspace_changed and reloads nothing", async () => {
    let resolveAct!: (v: unknown) => void;
    harness.rpc
      .mockResolvedValueOnce(list([row("r1", "u-owner", "primary_contact")]))
      .mockImplementationOnce(() => new Promise((r) => { resolveAct = r; }))
      .mockResolvedValueOnce(list([row("rb", "u-b", "primary_contact")]));
    mount();
    await flush();
    let pending!: Promise<unknown>;
    act(() => { pending = latest().revoke("r1"); });
    switchWorkspaceTo("tenant-b");
    await flush();
    await act(async () => { resolveAct({ data: { id: "r1", revoked: true }, error: null }); });
    expect(await pending).toEqual({ ok: false, reason: "workspace_changed" });
    expect(harness.rpc).toHaveBeenCalledTimes(3); // read A, the act, read B — no extra reload for A
    expect(latest().contacts?.map((r) => r.id)).toEqual(["rb"]);
  });

  it("an act started while the read is in flight never orphans the read", async () => {
    let resolveRead!: (v: unknown) => void;
    harness.rpc
      .mockImplementationOnce(() => new Promise((r) => { resolveRead = r; }))
      .mockResolvedValueOnce(refused("billing_contact_delegate_requires_admin"));
    mount();
    expect(latest().loading).toBe(true);
    let result: unknown;
    await act(async () => { result = await latest().designate("u-member", "delegate"); });
    expect(result).toEqual({ ok: false, reason: "billing_contact_delegate_requires_admin" });
    await act(async () => { resolveRead(list([row("r1", "u-owner", "primary_contact")])); await Promise.resolve(); });
    await flush();
    expect(latest().loading).toBe(false);
    expect(latest().contacts?.map((r) => r.id)).toEqual(["r1"]);
  });

  it("refusalFromError maps known RAISE messages and nothing else", () => {
    expect(refusalFromError({ message: "billing_contact_delegate_requires_admin" })).toBe("billing_contact_delegate_requires_admin");
    expect(refusalFromError({ message: "something new" })).toBe("network");
    expect(refusalFromError(undefined)).toBe("network");
  });
});
