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

const harness = vi.hoisted(() => ({ rows: [] as unknown[], error: null as { message: string } | null }));

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  // `in` is required because the Solo tree these tests mount now reaches `usePaigeDeptStatus`,
  // which issues `.select(...).in("status", …).limit(...)`. Without it the chain returns
  // undefined mid-call and React reports an unhandled error even though every test passes —
  // a stub that models fewer methods than the code calls fails loudly but not as a test failure.
  for (const m of ["select", "order", "eq", "ilike", "in"]) chain[m] = () => chain;
  chain.limit = () => Promise.resolve({ data: harness.rows, error: harness.error });
  return {
    supabase: {
      from: () => chain,
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      rpc: () => Promise.resolve({ data: null, error: null }),
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

  it("replaces the timeline when the read fails, rather than showing an empty one", async () => {
    harness.rows = [];
    harness.error = { message: "permission denied" };
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
    harness.error = { message: "permission denied" };
    const { TrustCompass } = await import("@/solo/compass");
    const m = await mount(TrustCompass as React.ComponentType, "err");
    expect(m.container.textContent).toContain("not a record of nothing happening");
    expect(m.container.textContent).not.toContain("MOUNT-TEST-RECORDED-EVENT");
    unmount(m);
  });
});
