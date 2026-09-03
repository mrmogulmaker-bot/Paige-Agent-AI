// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

/**
 * The two REAL components, mounted.
 *
 * WHY THIS EXISTS ALONGSIDE `data/soloActivityFeed.render.test.tsx`. That file drives the hook
 * through a small Probe that reproduces the decisions these surfaces make — which proves the hook,
 * and proves nothing about the surfaces. A green build proves the JSX parses. Neither proves that
 * `TrustCompass` and `TeamHub` still mount and put the recorded events on screen, and the edits
 * that wired them were surgery on two dense `@ts-nocheck` files: a ternary inserted into a
 * timeline, closing tags rebalanced by hand, a department lookup swapped for a label. That is
 * exactly the shape that compiles, builds, and renders nothing.
 *
 * So this mounts the actual exports and reads the actual text. It also asserts the failure path
 * REPLACES the feed rather than appearing beside it — a surface that shows both "could not load"
 * and a list of events is worse than either alone.
 */

const harness = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { code?: string; message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => {
    // The chain is a Proxy rather than an enumerated method list. Enumerating meant every new
  // builder method the Solo tree reached for ('in' for usePaigeDeptStatus, then 'is' for the
  // platform-default filter in useSoloTrust) returned undefined mid-call and surfaced as an
  // UNHANDLED ERROR while every test still passed — a failure shape that is easy to miss and
  // that has now been paid for twice. Anything but the terminal `limit` chains.
  const chain: Record<string, unknown> = new Proxy({}, {
    get: (_t, k) => {
      if (typeof k !== "string" || k === "then") return undefined;
      if (k === "limit") return () => Promise.resolve({ data: harness.rows, error: harness.error });
      return () => chain;
    },
  });
  return {
    supabase: {
      from: () => chain,
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      // The activity feed now reads the DEPLOYED resolver rather than the table, so the harness
      // answers by RPC NAME. Dispatching on the name matters: this Solo tree issues other RPCs,
      // and a blanket answer would feed this fixture to all of them.
      rpc: (fn: string) =>
        fn === "get_solo_rail_activity"
          ? Promise.resolve({ data: harness.rows, error: harness.error })
          : Promise.resolve({ data: null, error: null }),
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    },
  };
});
// The Team hub opens on its roster tab; 'act' is the Activity tab this test is about.
vi.mock("@/lib/routing/useSubtabRoute", () => ({ useSubtabRoute: () => ["act", () => {}] }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mount = async (Component: React.ComponentType, key?: string) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => { root.render(<Component key={key} />); await Promise.resolve(); });
  return { container, root };
};

const unmount = ({ container, root }: { container: HTMLDivElement; root: Root }) => {
  act(() => root.unmount());
  container.remove();
};

const RECORDED = {
  id: "cccccccc-0000-4000-8000-000000000001",
  title: "MOUNT-TEST-RECORDED-EVENT",
  summary: "MOUNT-TEST-SUMMARY",
  actor_type: "paige_agent",
  from_department: null,
  to_department: "operations_pmo",
  occurred_at: new Date().toISOString(),
};

describe("TeamHub — the Activity tab", () => {
  it("puts a recorded event on screen", async () => {
    harness.rows = [RECORDED];
    harness.error = null;
    const { TeamHub } = await import("@/solo/team");
    const m = await mount(TeamHub as React.ComponentType);
    expect(m.container.textContent).toContain("MOUNT-TEST-RECORDED-EVENT");
    expect(m.container.textContent).toContain("MOUNT-TEST-SUMMARY");
    // The desk comes from the event's own department slug, not from a lookup table of ids.
    expect(m.container.textContent).toContain("Operations / PMO");
    unmount(m);
  });

  it("replaces the timeline when the DATABASE REFUSES, rather than showing an empty one", async () => {
    harness.rows = [];
    // What the deployed resolver actually raises when the caller is not entitled to this
    // workspace's rail. Before this slice a refusal rendered as an empty timeline, which told the
    // operator their team had done nothing all week.
    harness.error = { code: "42501", message: "RAIL_FORBIDDEN" };
    const { TeamHub } = await import("@/solo/team");
    const m = await mount(TeamHub as React.ComponentType, "err");
    expect(m.container.textContent).toContain("not a record of nothing happening");
    unmount(m);
  });
});

describe("TrustCompass — the 'Working now' panel", () => {
  it("puts a recorded event on screen with its desk", async () => {
    harness.rows = [RECORDED];
    harness.error = null;
    const { TrustCompass } = await import("@/solo/compass");
    const m = await mount(TrustCompass as React.ComponentType);
    expect(m.container.textContent).toContain("MOUNT-TEST-RECORDED-EVENT");
    expect(m.container.textContent).toContain("Operations / PMO");
    unmount(m);
  });

  it("says the read failed INSTEAD of listing events, not alongside them", async () => {
    harness.rows = [];
    harness.error = { code: "42501", message: "RAIL_FORBIDDEN" };
    const { TrustCompass } = await import("@/solo/compass");
    const m = await mount(TrustCompass as React.ComponentType, "err");
    expect(m.container.textContent).toContain("not a record of nothing happening");
    expect(m.container.textContent).not.toContain("MOUNT-TEST-RECORDED-EVENT");
    unmount(m);
  });
});
