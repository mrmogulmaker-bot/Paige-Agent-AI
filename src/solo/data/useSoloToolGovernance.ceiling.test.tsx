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

/** list_tool_autonomy → the catalogue; resolve_tool_autonomy → whatever the test wires. */
function wireRpc(resolve: () => { data: unknown; error: { message: string } | null }) {
  harness.rpc.mockImplementation((fn: string) => {
    if (fn === "list_tool_autonomy") return Promise.resolve({ data: listRows, error: null });
    if (fn === "resolve_tool_autonomy") return Promise.resolve(resolve());
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
