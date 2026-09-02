// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The two Solo surfaces that used to invent activity, driven for real.
 *
 * A source-only assertion ("the fixture const is gone") is not enough on its own: the point is
 * not that a variable was deleted, it is that the panel now shows what the Rail recorded and
 * says so honestly when it cannot. So this drives the hook through a mocked client and reads
 * the rendered text — while ALSO pinning the source, because a future edit could reintroduce a
 * plausible-looking constant and every render assertion below would keep passing on it.
 */

type SelectResult = { data: unknown[] | null; error: { message: string } | null };
const harness = vi.hoisted(() => ({ result: null as SelectResult | null }));

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "order", "eq", "ilike"]) chain[m] = () => chain;
    chain.limit = () => Promise.resolve(harness.result ?? { data: [], error: null });
    return chain;
  };
  return {
    supabase: {
      from: () => builder(),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      // #746 — THE DOUBLE FOLLOWS THE SEAM. The feed used to read the relation through
      // `.from(...).limit(...)`; it now calls the `get_solo_rail_activity` resolver, because the
      // browser has no SELECT privilege on `paige_client_events` and never did after
      // `20260712200000:25`. This mock returned a hardcoded `{data:null,error:null}`, so once the
      // hook moved, `harness.result` was ignored and the error case silently rendered as EMPTY —
      // which is the exact confusion these tests exist to forbid. Routing the RPC through the
      // same `harness.result` keeps the assertions honest at the new seam.
      rpc: (fn: string) =>
        fn === "get_solo_rail_activity"
          ? Promise.resolve(harness.result ?? { data: [], error: null })
          : Promise.resolve({ data: null, error: null }),
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    },
  };
});

import { useSoloActivityFeed, departmentLabel, elapsedLabel } from "./useSoloActivityFeed";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** A minimal consumer that renders exactly the decisions the two surfaces make. */
function Probe() {
  const activity = useSoloActivityFeed();
  const state = activity.loading ? "loading" : activity.error ? "error" : activity.items.length ? "ok" : "empty";
  return (
    <div>
      <span data-testid="state">{state}</span>
      {state === "error" && <span data-testid="copy">This timeline could not be loaded, so it is not a record of nothing happening.</span>}
      {state === "empty" && <span data-testid="copy">Nothing recorded yet.</span>}
      {activity.items.map((a) => (
        <div key={a.id} data-testid="row">
          {a.title} · {departmentLabel(a.departmentSlug)} · {a.byPaige ? "Paige" : "Person"} · {elapsedLabel(a.occurredAt, Date.parse("2026-09-01T12:00:00Z"))}
        </div>
      ))}
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  harness.result = null;
});

const render = async () => {
  await act(async () => {
    root.render(<Probe />);
    await Promise.resolve();
  });
};

describe("the activity feed renders what was recorded", () => {
  it("shows the recorded events, attributed to the desk and the actor the row names", async () => {
    harness.result = {
      data: [
        {
          id: "aaaaaaaa-0000-4000-8000-000000000001",
          title: "Filed a document on a client's record",
          summary: "Internal only.",
          actor_type: "paige_agent",
          from_department: null,
          to_department: "client_experience",
          occurred_at: "2026-09-01T11:58:00.000Z",
        },
        {
          id: "aaaaaaaa-0000-4000-8000-000000000002",
          title: "Updated a contact",
          summary: null,
          actor_type: "owner_staff",
          from_department: "owner_ops",
          to_department: null,
          occurred_at: "2026-09-01T11:00:00.000Z",
        },
      ],
      error: null,
    };
    await render();
    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe("ok");
    const rows = Array.from(container.querySelectorAll('[data-testid="row"]')).map((n) => n.textContent);
    expect(rows[0]).toBe("Filed a document on a client's record · Client Success · Paige · 2m ago");
    // The actor separation is the whole meaning of the surface's Paige/People filter.
    expect(rows[1]).toBe("Updated a contact · Owner Ops · Person · 1h ago");
  });

  it("says a FAILED read is not a record of nothing happening", async () => {
    harness.result = { data: null, error: { message: "permission denied for table paige_client_events" } };
    await render();
    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe("error");
    // The exact failure this guards: rendering a failed read as an empty timeline, which told an
    // operator with confidence that Paige had done nothing.
    expect(container.querySelector('[data-testid="copy"]')?.textContent)
      .toContain("not a record of nothing happening");
    expect(container.querySelectorAll('[data-testid="row"]').length).toBe(0);
  });

  it("distinguishes a genuinely empty feed from a failed one", async () => {
    harness.result = { data: [], error: null };
    await render();
    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe("empty");
    expect(container.querySelector('[data-testid="copy"]')?.textContent).toContain("Nothing recorded yet");
  });
});

describe("the fabricated feeds are gone from the surfaces", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("the Trust Compass no longer carries invented activity, and reads the Rail instead", () => {
    const src = read("src/solo/compass.tsx");
    // The invented customers, by name, anywhere in the file.
    //
    // The first version of this assertion looked for `t:'Bellweather` — the fixture's own key
    // prefix — and would have passed against the UNMODIFIED file, because the names sit mid-title
    // ("Answered Bellweather on the invoice question"). A test that cannot fail on the defect it
    // names is worse than no test, so it checks for the bare name now, and the removal comment
    // left in compass.tsx deliberately does not repeat any of them.
    for (const invented of ["Bellweather", "Sarah Nnadi", "Ridgeline", "Northwind", "Cairn Advisory", "Verity Partners"]) {
      expect(src.includes(invented)).toBe(false);
    }
    expect(src).toContain("useSoloActivityFeed");
    // The green "Live" pill must be conditional now — an unconditional one is a claim about a
    // read that may have failed.
    expect(src).not.toContain('<span className="pill pill-ok"><span className="dot"/>Live</span>');
  });

  it("the Team hub timeline reads the Rail and its Paige/People filter means actor_type", () => {
    const src = read("src/solo/team.tsx");
    expect(src).toContain("useSoloActivityFeed");
    expect(src).not.toContain("Sent the Ridgeline dunning reminder");
    expect(src).not.toContain("Reconnected the HubSpot sync");
    expect(src).toContain("ai:a.byPaige");
  });
});
