// @vitest-environment jsdom
//
// The ceiling probe (`resolve_tool_autonomy`) can fail on a real permission problem. When it does,
// `deriveGovernance` falls back to the UNNARROWED stored mode — it fails toward MORE permissive. A
// surface that silently presented that fallback as fact would be telling the owner an action is
// unrestricted when the platform ceiling may actually be narrowing it (§13). These tests hold the
// hook to the honest contract: a failed probe raises `ceilingUnconfirmed`; a successful probe leaves
// it false and applies the real narrowing.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: harness.rpc } }));

import { useSoloToolGovernance, type SoloToolGovernance } from "./useSoloToolGovernance";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let seen: SoloToolGovernance[] = [];
function Probe() {
  seen.push(useSoloToolGovernance("tenant-a"));
  return null;
}
const latest = () => seen[seen.length - 1];

// One ordinary tool (crm_create_contact) stored at 'auto', in the shape list_tool_autonomy returns.
const listRows = [{ tool_key: "crm_create_contact", label: "Create contact", category: "crm", mode: "auto", is_default: false }];

/** list_tool_autonomy → the catalogue; resolve_tool_autonomy → whatever the test wires; the authority
 *  reads default to tenant-admin=true / platform-owner=false unless a test overrides them. `adminError`
 *  makes is_current_user_tenant_admin fail, to exercise the unproven-authority path. */
function wireRpc(
  resolve: (args?: Record<string, unknown>) => { data: unknown; error: { message: string } | null },
  opts: { admin?: boolean; owner?: boolean; adminError?: boolean } = {},
) {
  const admin = opts.admin ?? true;
  const owner = opts.owner ?? false;
  harness.rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
    if (fn === "list_tool_autonomy") return Promise.resolve({ data: listRows, error: null });
    if (fn === "resolve_tool_autonomy") return Promise.resolve(resolve(args));
    if (fn === "is_current_user_tenant_admin")
      return Promise.resolve(opts.adminError ? { data: null, error: { message: "boom" } } : { data: admin, error: null });
    if (fn === "is_platform_owner") return Promise.resolve({ data: owner, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  seen = [];
  harness.rpc.mockReset();
});

async function mountAndSettle() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(<Probe />); });
  // The effect awaits the list read, then the ceiling probes, then commits once — flush both.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("useSoloToolGovernance — ceiling probe honesty (§13)", () => {
  it("a FAILED ceiling probe flags ceilingUnconfirmed and never silently reads as unrestricted", async () => {
    wireRpc(() => ({ data: null, error: { message: "permission denied" } }));
    await mountAndSettle();
    const g = latest();
    expect(g.configured).toBe(true);
    expect(g.ceilingUnconfirmed).toBe(true);
    // Falls back to the unnarrowed stored mode — which is exactly what the flag exists to disclose.
    expect(g.byTool["crm_create_contact"].effective).toBe("auto");
    expect(g.ceilingLimiting).toBe(false);
  });

  it("a SUCCESSFUL ceiling probe leaves ceilingUnconfirmed false and applies the real narrowing", async () => {
    wireRpc(() => ({ data: "confirm", error: null }));
    await mountAndSettle();
    const g = latest();
    expect(g.configured).toBe(true);
    expect(g.ceilingUnconfirmed).toBe(false);
    expect(g.byTool["crm_create_contact"].effective).toBe("confirm");
    expect(g.ceilingLimiting).toBe(true);
  });
});

describe("useSoloToolGovernance — write authority + workspace binding (§70.1/§9)", () => {
  it("a non-admin viewer is read-only: canWrite false and no tool is settable (§70.1)", async () => {
    wireRpc(() => ({ data: "auto", error: null }), { admin: false });
    await mountAndSettle();
    const g = latest();
    expect(g.configured).toBe(true);
    expect(g.canWrite).toBe(false);
    // Even an ordinary tool is NOT an active control for a non-admin — the server would refuse it.
    expect(g.byTool["crm_create_contact"].settable).toBe(false);
  });

  it("an admin viewer can write: canWrite true and an ordinary tool is settable", async () => {
    wireRpc(() => ({ data: "auto", error: null }), { admin: true });
    await mountAndSettle();
    const g = latest();
    expect(g.canWrite).toBe(true);
    expect(g.byTool["crm_create_contact"].settable).toBe(true);
  });

  it("binds each write to the initiating workspace via _tenant_id (so a stale cross-workspace write is server-rejected)", async () => {
    wireRpc(() => ({ data: "auto", error: null }), { admin: true });
    await mountAndSettle();
    await act(async () => { await latest().setToolMode("crm_create_contact", "confirm"); });
    const call = harness.rpc.mock.calls.find((c) => c[0] === "set_tool_autonomy");
    // The Probe reads for "tenant-a"; set_tool_autonomy must carry it so the RPC's tenant-mismatch
    // guard rejects a write that lands after the admin switched workspaces (§9/§51).
    expect(call?.[1]).toMatchObject({ _tool_key: "crm_create_contact", _mode: "confirm", _tenant_id: "tenant-a" });
  });

  it("a platform owner with NO tenant_members row can still write — canWrite mirrors the full server predicate (§53)", async () => {
    // is_current_user_tenant_admin=false (act-as → no membership) but is_platform_owner=true; the
    // write contract authorises is_platform_owner, so the surface must NOT render read-only.
    wireRpc(() => ({ data: "auto", error: null }), { admin: false, owner: true });
    await mountAndSettle();
    const g = latest();
    expect(g.canWrite).toBe(true);
    expect(g.authorityUnconfirmed).toBe(false);
    expect(g.byTool["crm_create_contact"].settable).toBe(true);
  });

  it("a FAILED authority read is unproven, not a confirmed read-only (§13): authorityUnconfirmed + fail-closed", async () => {
    wireRpc(() => ({ data: "auto", error: null }), { adminError: true, owner: false });
    await mountAndSettle();
    const g = latest();
    expect(g.configured).toBe(true);
    expect(g.canWrite).toBe(false);               // still fail-closed — no active control
    expect(g.authorityUnconfirmed).toBe(true);    // but the surface says so + offers retry, not "read-only" as fact
  });

  it("binds the CEILING probe to the initiating workspace too, so a platform-owner act-as reads the tenant's real ceiling (§13)", async () => {
    // resolve_tool_autonomy does NOT pin a platform owner to current_user_tenant_id; a null tenant
    // there returns the 'confirm' fallback and misreports the ceiling. The probe must pass the epoch.
    wireRpc(() => ({ data: "auto", error: null }), { admin: true });
    await mountAndSettle();
    const probe = harness.rpc.mock.calls.find((c) => c[0] === "resolve_tool_autonomy");
    expect(probe?.[1]).toMatchObject({ _tenant_id: "tenant-a" });
  });

  it("serializes writes to the SAME tool across setDomainMode and setToolMode — no overlap, last wins (§70.1)", async () => {
    wireRpc(() => ({ data: "auto", error: null }), { admin: true });
    await mountAndSettle();
    const g = latest();
    // Gate the FIRST set_tool_autonomy for crm_create_contact; capture its modes in order.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const modes: string[] = [];
    let gated = true;
    harness.rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn === "set_tool_autonomy" && args?._tool_key === "crm_create_contact") {
        modes.push(String(args?._mode));
        if (gated) { gated = false; return gate.then(() => ({ data: null, error: null })); }
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === "set_tool_autonomy") return Promise.resolve({ data: null, error: null });
      if (fn === "list_tool_autonomy") return Promise.resolve({ data: listRows, error: null });
      if (fn === "resolve_tool_autonomy") return Promise.resolve({ data: "auto", error: null });
      if (fn === "is_current_user_tenant_admin") return Promise.resolve({ data: true, error: null });
      if (fn === "is_platform_owner") return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    // A bulk domain write (crm) AND a child write to crm_create_contact, the child while the bulk's
    // write to that tool is still in flight. Without per-tool serialization they'd race on the tool.
    let dom!: Promise<unknown>, child!: Promise<unknown>;
    await act(async () => {
      dom = g.setDomainMode("crm", "off");
      child = g.setToolMode("crm_create_contact", "auto");
      await Promise.resolve();
    });
    expect(modes).toEqual(["off"]); // only ONE write in flight for the shared tool — the child is queued
    await act(async () => { release(); await dom; await child; await Promise.resolve(); });
    expect(modes).toEqual(["off", "auto"]); // the queued last choice wins, written after the first settles
  });

  it("a FAILED in-flight write still pursues the newer queued choice, and the coalesced caller gets the REAL result — never a premature ok (§70.1/§13)", async () => {
    wireRpc(() => ({ data: "auto", error: null }), { admin: true });
    await mountAndSettle();
    const g = latest();
    // Gate the FIRST set_tool_autonomy for crm_create_contact and make it FAIL on release; later writes
    // to that tool succeed. This is the exact failure branch of the serializer.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const modes: string[] = [];
    let firstGated = true;
    harness.rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn === "set_tool_autonomy" && args?._tool_key === "crm_create_contact") {
        modes.push(String(args?._mode));
        if (firstGated) { firstGated = false; return gate.then(() => ({ data: null, error: { message: "denied" } })); }
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === "set_tool_autonomy") return Promise.resolve({ data: null, error: null });
      if (fn === "list_tool_autonomy") return Promise.resolve({ data: listRows, error: null });
      if (fn === "resolve_tool_autonomy") return Promise.resolve({ data: "auto", error: null });
      if (fn === "is_current_user_tenant_admin") return Promise.resolve({ data: true, error: null });
      if (fn === "is_platform_owner") return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    // A domain write (auto) gates on crm_create_contact; a child write then queues the FINAL choice off.
    let dom!: Promise<{ ok: boolean }>, child!: Promise<{ ok: boolean }>;
    await act(async () => {
      dom = g.setDomainMode("crm", "auto") as Promise<{ ok: boolean }>;
      child = g.setToolMode("crm_create_contact", "off") as Promise<{ ok: boolean }>;
      await Promise.resolve();
    });
    expect(modes).toEqual(["auto"]); // only the first (gated) write is in flight
    let childRes!: { ok: boolean };
    await act(async () => { release(); childRes = (await child) as { ok: boolean }; await dom; await Promise.resolve(); });
    // The first (auto) write FAILED, but the drain then pursued the newer queued value (off) — the user's
    // final, MORE-restrictive choice is never stranded behind a superseded write's failure.
    expect(modes).toEqual(["auto", "off"]);
    // The coalesced child caller's promise reflects the REAL settlement of its final choice (off), not a
    // premature ok returned before its write ran.
    expect(childRes.ok).toBe(true);
  });

  it("reports a FAILED final choice as failed to the coalesced caller — no premature ok when the last write genuinely fails (§13)", async () => {
    wireRpc(() => ({ data: "auto", error: null }), { admin: true });
    await mountAndSettle();
    const g = latest();
    // Every crm_create_contact write FAILS; capture the modes and the result the coalesced caller gets.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let firstGated = true;
    harness.rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn === "set_tool_autonomy" && args?._tool_key === "crm_create_contact") {
        if (firstGated) { firstGated = false; return gate.then(() => ({ data: null, error: { message: "denied" } })); }
        return Promise.resolve({ data: null, error: { message: "denied" } });
      }
      if (fn === "set_tool_autonomy") return Promise.resolve({ data: null, error: null });
      if (fn === "list_tool_autonomy") return Promise.resolve({ data: listRows, error: null });
      if (fn === "resolve_tool_autonomy") return Promise.resolve({ data: "auto", error: null });
      if (fn === "is_current_user_tenant_admin") return Promise.resolve({ data: true, error: null });
      if (fn === "is_platform_owner") return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let child!: Promise<{ ok: boolean }>;
    await act(async () => {
      void g.setDomainMode("crm", "auto");
      child = g.setToolMode("crm_create_contact", "off") as Promise<{ ok: boolean }>;
      await Promise.resolve();
    });
    let childRes!: { ok: boolean };
    await act(async () => { release(); childRes = (await child) as { ok: boolean }; await Promise.resolve(); });
    // The final choice (off) genuinely failed, so the caller is told the truth — the queue never turns a
    // failed restrictive write into a false success.
    expect(childRes.ok).toBe(false);
  });
});
