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
});
