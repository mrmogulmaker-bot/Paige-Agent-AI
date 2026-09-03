// @vitest-environment jsdom
//
// Billing Experience item 4 — the pure decision behind the payment-method connect act, plus the
// hook's own guard against opening a URL minted for a workspace the person has since left.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ invoke: vi.fn(), assign: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: harness.invoke } },
}));

import { decideConnectOpen, usePlatformBillingConnect } from "./usePlatformBillingConnect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const httpRefusal = (code: string, status = 403) => ({
  data: null,
  error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code",
           context: new Response(JSON.stringify({ error: code }), { status, headers: { "content-type": "application/json" } }) },
});

describe("decideConnectOpen — the pure contract", () => {
  it("needs both a url and the matching tenant id", async () => {
    expect(await decideConnectOpen("t1", { data: { url: "https://x", tenant_id: "t1" }, error: null })).toEqual({ open: "https://x" });
    expect(await decideConnectOpen("t1", { data: { url: "https://x" }, error: null })).toEqual({ refuse: "network" });
    expect(await decideConnectOpen(null, { data: { url: "https://x", tenant_id: "t1" }, error: null })).toEqual({ refuse: "workspace_changed" });
    expect(await decideConnectOpen("t1", { data: { url: "https://x", tenant_id: "t2" }, error: null })).toEqual({ refuse: "workspace_changed" });
  });

  it("reads the refusal code from the non-2xx BODY, never from the generic error message", async () => {
    expect(await decideConnectOpen("t1", httpRefusal("owner_only"))).toEqual({ refuse: "owner_only" });
    expect(await decideConnectOpen("t1", { data: null, error: { message: "owner_only" } })).toEqual({ refuse: "network" });
  });

  it("still accepts a 2xx-with-error body, and an unknown code is network, never an access decision", async () => {
    expect(await decideConnectOpen("t1", { data: { error: "billing_account_ambiguous" }, error: null })).toEqual({ refuse: "billing_account_ambiguous" });
    expect(await decideConnectOpen("t1", { data: { error: "something_new" }, error: null })).toEqual({ refuse: "network" });
    expect(await decideConnectOpen("t1", httpRefusal("something_new", 418))).toEqual({ refuse: "network" });
  });
});

describe("usePlatformBillingConnect — openPaymentSetup", () => {
  let host: HTMLDivElement;
  let root: Root;
  const originalLocation = Object.getOwnPropertyDescriptor(window, "location")!;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    harness.invoke.mockReset();
    harness.assign.mockReset();
    // jsdom's window.location is not directly spy-able (its `assign` is non-configurable), so the
    // whole property is replaced with a plain object carrying a mock `assign`, restored after.
    Object.defineProperty(window, "location", { value: { assign: harness.assign }, writable: true, configurable: true });
  });
  afterEach(() => {
    act(() => root.unmount()); host.remove(); vi.restoreAllMocks();
    Object.defineProperty(window, "location", originalLocation);
  });

  function Harness({ tenantId, onResult }: { tenantId: string | null; onResult: (r: unknown) => void }) {
    const { openPaymentSetup } = usePlatformBillingConnect(tenantId);
    (window as unknown as { __open: () => void }).__open = () => { void openPaymentSetup().then(onResult); };
    return null;
  }

  it("navigates exactly once when the response names the workspace the click was made in", async () => {
    harness.invoke.mockResolvedValueOnce({ data: { url: "https://checkout.example/setup", tenant_id: "t1" }, error: null });
    let result: unknown;
    await act(async () => { root.render(<Harness tenantId="t1" onResult={(r) => { result = r; }} />); });
    await act(async () => { (window as unknown as { __open: () => void }).__open(); await Promise.resolve(); await Promise.resolve(); });
    expect(result).toEqual({ ok: true });
    expect(harness.assign).toHaveBeenCalledTimes(1);
    expect(harness.assign).toHaveBeenCalledWith("https://checkout.example/setup");
  });

  it("refuses to navigate to a URL minted for a different workspace than the one clicked in", async () => {
    harness.invoke.mockResolvedValueOnce({ data: { url: "https://checkout.example/setup", tenant_id: "t-OTHER" }, error: null });
    let result: unknown;
    await act(async () => { root.render(<Harness tenantId="t1" onResult={(r) => { result = r; }} />); });
    await act(async () => { (window as unknown as { __open: () => void }).__open(); await Promise.resolve(); await Promise.resolve(); });
    expect(result).toEqual({ ok: false, reason: "workspace_changed" });
    expect(harness.assign).not.toHaveBeenCalled();
  });

  it("maps every server refusal to a typed reason and navigates nowhere", async () => {
    for (const code of ["owner_only", "billing_account_ambiguous", "needs_config", "no_active_workspace"]) {
      harness.invoke.mockReset();
      harness.assign.mockReset();
      harness.invoke.mockResolvedValueOnce(httpRefusal(code));
      let result: unknown;
      await act(async () => { root.render(<Harness tenantId="t1" onResult={(r) => { result = r; }} />); });
      await act(async () => { (window as unknown as { __open: () => void }).__open(); await Promise.resolve(); await Promise.resolve(); });
      expect(result, code).toEqual({ ok: false, reason: code });
      expect(harness.assign).not.toHaveBeenCalled();
    }
  });

  it("a transport failure is 'network' with retry copy, never a guessed refusal", async () => {
    harness.invoke.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    let result: unknown;
    await act(async () => { root.render(<Harness tenantId="t1" onResult={(r) => { result = r; }} />); });
    await act(async () => { (window as unknown as { __open: () => void }).__open(); await Promise.resolve(); await Promise.resolve(); });
    expect(result).toEqual({ ok: false, reason: "network" });
    expect(harness.assign).not.toHaveBeenCalled();
  });
});
