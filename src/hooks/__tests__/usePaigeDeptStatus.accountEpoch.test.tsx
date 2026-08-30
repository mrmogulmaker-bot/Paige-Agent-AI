import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown[]; error: null };
type Deferred = { promise: Promise<Result>; resolve: (value: Result) => void };

const deferred = (): Deferred => {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((done) => { resolve = done; });
  return { promise, resolve };
};

const harness = vi.hoisted(() => ({
  departments: [] as Array<Promise<unknown>>,
  actions: [] as Array<Promise<unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => table === "paige_departments"
        ? {
            eq: () => {
              const call = harness.departments.shift();
              if (!call) throw new Error("No department response queued");
              return call;
            },
          }
        : {
            in: () => ({
              limit: () => {
                const call = harness.actions.shift();
                if (!call) throw new Error("No action response queued");
                return call;
              },
            }),
          },
    }),
  },
}));

import { usePaigeDeptStatus } from "../usePaigeDeptStatus";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const renderedSnapshots: string[] = [];

function Probe({ epoch }: { epoch?: string | null }) {
  const result = usePaigeDeptStatus(epoch);
  renderedSnapshots.push(result.departments.map((department) => department.name).join(","));
  return (
    <output data-loading={String(result.loading)} data-configured={String(result.configured)}>
      {result.departments.map((department) => `${department.name}:${department.openCount}`).join(",")}
    </output>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  harness.departments = [];
  harness.actions = [];
  renderedSnapshots.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("usePaigeDeptStatus account epoch", () => {
  it("clears account A immediately and rejects its late department response", async () => {
    const deptsA = deferred();
    const actionsA = deferred();
    const deptsB = deferred();
    const actionsB = deferred();
    harness.departments = [deptsA.promise, deptsB.promise];
    harness.actions = [actionsA.promise, actionsB.promise];

    await act(async () => { root.render(<Probe epoch="account-a" />); await Promise.resolve(); });
    await act(async () => { root.render(<Probe epoch="account-b" />); await Promise.resolve(); });
    expect(container.textContent).toBe("");
    expect(container.querySelector("output")?.dataset.loading).toBe("true");

    await act(async () => {
      deptsB.resolve({ data: [{ slug: "operations", name: "Operations B", display_order: 1 }], error: null });
      actionsB.resolve({ data: [{ to_department: "operations", status: "drafting", filed_at: "2026-08-27T12:00:00Z" }], error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toBe("Operations B:1");

    await act(async () => {
      deptsA.resolve({ data: [{ slug: "finance", name: "Finance A", display_order: 1 }], error: null });
      actionsA.resolve({ data: [{ to_department: "finance", status: "drafting", filed_at: "2026-08-27T11:00:00Z" }], error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toBe("Operations B:1");
    expect(container.textContent).not.toContain("Finance A");
  });

  it("clears accepted departments while the epoch is unresolved", async () => {
    const depts = deferred();
    const actions = deferred();
    harness.departments = [depts.promise];
    harness.actions = [actions.promise];
    await act(async () => { root.render(<Probe epoch="account-a" />); await Promise.resolve(); });
    await act(async () => {
      depts.resolve({ data: [{ slug: "finance", name: "Finance", display_order: 1 }], error: null });
      actions.resolve({ data: [], error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toBe("Finance:0");

    renderedSnapshots.length = 0;
    await act(async () => { root.render(<Probe epoch={null} />); await Promise.resolve(); });
    expect(renderedSnapshots[0]).toBe("");
    expect(container.textContent).toBe("");
    expect(container.querySelector("output")?.dataset.loading).toBe("true");
  });

  it("never exposes accepted account A departments during account B's first render", async () => {
    const deptsB = deferred();
    const actionsB = deferred();
    harness.departments = [
      Promise.resolve({ data: [{ slug: "finance", name: "Finance A", display_order: 1 }], error: null }),
      deptsB.promise,
    ];
    harness.actions = [Promise.resolve({ data: [], error: null }), actionsB.promise];
    await act(async () => { root.render(<Probe epoch="account-a" />); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toBe("Finance A:0");

    renderedSnapshots.length = 0;
    await act(async () => { root.render(<Probe epoch="account-b" />); await Promise.resolve(); });
    expect(renderedSnapshots[0]).toBe("");
    expect(container.textContent).toBe("");
  });
});
