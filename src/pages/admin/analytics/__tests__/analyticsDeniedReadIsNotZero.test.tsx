// @vitest-environment jsdom
import React, { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #802 — a refused read must never be reported as a measurement.
 *
 * The two Analytics surfaces that read `paige_client_events` used to destructure only `{ data }`.
 * Because `authenticated` holds no SELECT on that table in production, the refusal arrived as
 * `data = null` and each surface turned it into a confident answer:
 *
 *   - Client engagement built a DENSE series of zeros and rendered "Insufficient data".
 *   - Cohort retention kept the (readable) `clients` cohorts and showed them at 0% D1/D7/D30 —
 *     real cohort rows, real sizes, a retention number that measured a permission error.
 *
 * These drive the real components through a mocked client and read the rendered text. A
 * source-only assertion would not do: the point is not that an `error` variable is now bound, it
 * is that a person is no longer shown a number that means "we were refused".
 */

type Result = { data: unknown[] | null; error: { message: string } | null };
const harness = vi.hoisted(() => ({
  byTable: {} as Record<string, Result>,
  /** Tables whose read never settles — lets a test observe the PENDING render. */
  hang: new Set<string>(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "gte", "lte", "eq", "not", "order"]) chain[m] = () => chain;
    chain.limit = () =>
      harness.hang.has(table)
        ? new Promise(() => {})
        : Promise.resolve(harness.byTable[table] ?? { data: [], error: null });
    return chain;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

import { ClientEngagementSection } from "../sections/ClientEngagementSection";
import { CohortRetentionTable } from "../CohortRetentionTable";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  harness.byTable = {};
  harness.hang = new Set();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const DENIED = { data: null, error: { message: "permission denied for table paige_client_events" } };

async function render(node: React.ReactElement) {
  await act(async () => { root.render(node); });
  await act(async () => { await Promise.resolve(); });
}

describe("#802 — client engagement", () => {
  it("a REFUSED read is not reported as insufficient data", async () => {
    harness.byTable["paige_client_events"] = DENIED;
    await render(<ClientEngagementSection start="2026-08-01" end="2026-08-10" />);
    const text = host.textContent ?? "";
    expect(text).not.toMatch(/Insufficient data/i);
    expect(text).toMatch(/unavailable/i);
    expect(text).toMatch(/not a record of no engagement/i);
  });

  it("a SUCCEEDED but genuinely quiet read still reads as insufficient data", async () => {
    // The states must stay distinguishable in BOTH directions — collapsing them the other way
    // would be the same defect wearing the opposite mask.
    harness.byTable["paige_client_events"] = { data: [], error: null };
    await render(<ClientEngagementSection start="2026-08-01" end="2026-08-10" />);
    const text = host.textContent ?? "";
    expect(text).toMatch(/Insufficient data/i);
    expect(text).not.toMatch(/unavailable/i);
  });

  it("does not render engagement metrics built from a refusal", async () => {
    harness.byTable["paige_client_events"] = DENIED;
    await render(<ClientEngagementSection start="2026-08-01" end="2026-08-10" />);
    const text = host.textContent ?? "";
    expect(text).not.toMatch(/Client events/);
    expect(text).not.toMatch(/Active clients/);
  });
});

describe("#802 — cohort retention", () => {
  it("a refused ACTIVITY read does not become 0% retention on real cohorts", async () => {
    // The worse shape: cohorts are readable, activity is not.
    harness.byTable["clients"] = {
      data: [
        { id: "c1", created_at: "2026-07-10T00:00:00Z" },
        { id: "c2", created_at: "2026-07-10T00:00:00Z" },
      ],
      error: null,
    };
    harness.byTable["paige_client_events"] = DENIED;

    await render(<CohortRetentionTable mode="client_lifecycle" />);
    const text = host.textContent ?? "";

    expect(text).toMatch(/could not be loaded/i);
    expect(text).toMatch(/not a record of clients failing to return/i);
    // No retention percentage may be shown at all — 0% is the lie this slice removes.
    expect(text).not.toMatch(/\d+%/);
    // And it must not fall through to copy that blames the clients.
    expect(text).not.toMatch(/accumulate 30 days/i);
  });

  it("a genuinely empty tenant still reads as not-enough-data, not unavailable", async () => {
    harness.byTable["clients"] = { data: [], error: null };
    harness.byTable["paige_client_events"] = { data: [], error: null };

    await render(<CohortRetentionTable mode="client_lifecycle" />);
    const text = host.textContent ?? "";

    expect(text).toMatch(/accumulate 30 days/i);
    expect(text).not.toMatch(/could not be loaded/i);
  });
});

describe("#802 — a mode switch must not paint the previous run's answer", () => {
  it("re-enters loading and drops prior rows when mode changes on the same instance", async () => {
    // A populated PLATFORM run first.
    harness.byTable["profiles"] = [
      { user_id: "u1", created_at: "2026-07-10T00:00:00Z" },
      { user_id: "u2", created_at: "2026-07-10T00:00:00Z" },
    ].length
      ? {
          data: [
            { user_id: "u1", created_at: "2026-07-10T00:00:00Z" },
            { user_id: "u2", created_at: "2026-07-10T00:00:00Z" },
          ],
          error: null,
        }
      : { data: [], error: null };
    harness.byTable["analytics_events"] = {
      data: [{ user_id: "u1", created_at: "2026-07-12T00:00:00Z" }],
      error: null,
    };

    await render(<CohortRetentionTable mode="platform_signup" />);
    const first = host.textContent ?? "";
    expect(first).not.toMatch(/Loading cohorts/i);

    // Now switch modes on the SAME instance, with the new mode's reads left PENDING.
    harness.hang.add("clients");
    harness.hang.add("paige_client_events");
    await render(<CohortRetentionTable mode="client_lifecycle" />);
    const during = host.textContent ?? "";

    // The window this pins: between the switch and the new reads resolving, the component must
    // NOT still be showing the previous run's answer under the new mode's title.
    expect(during).toMatch(/Loading cohorts/i);
    expect(during).not.toMatch(/\d+%/);
    expect(during).not.toMatch(/accumulate 30 days/i);
    expect(during).toMatch(/Client Retention/i);
  });
});

describe("#802 — the stale frame itself, observed", () => {
  /**
   * The previous test flushes effects via `act()` before asserting, so it cannot see the frame
   * React commits BEFORE passive effects run — which is exactly where a stale answer would be
   * painted. A `useLayoutEffect` probe runs after the DOM is mutated and before passive effects,
   * so mounting one after the table captures precisely that committed-but-unflushed DOM.
   */
  function Probe({ sink }: { sink: string[] }) {
    useLayoutEffect(() => {
      sink.push(document.body.textContent ?? "");
    });
    return null;
  }

  it("never commits the previous mode's answer under the new mode's title", async () => {
    harness.byTable["profiles"] = {
      data: [
        { user_id: "u1", created_at: "2026-07-10T00:00:00Z" },
        { user_id: "u2", created_at: "2026-07-10T00:00:00Z" },
      ],
      error: null,
    };
    harness.byTable["analytics_events"] = {
      data: [{ user_id: "u1", created_at: "2026-07-12T00:00:00Z" }],
      error: null,
    };

    const frames: string[] = [];
    await render(
      <>
        <CohortRetentionTable mode="platform_signup" />
        <Probe sink={frames} />
      </>,
    );
    // A populated platform run is on screen.
    expect(host.textContent ?? "").not.toMatch(/Loading cohorts/i);

    frames.length = 0;
    harness.hang.add("clients");
    harness.hang.add("paige_client_events");
    await render(
      <>
        <CohortRetentionTable mode="client_lifecycle" />
        <Probe sink={frames} />
      </>,
    );

    expect(frames.length).toBeGreaterThan(0);
    // EVERY committed frame during the switch — including the pre-passive-effect one — must
    // already be showing loading, never a retention figure or the prior mode's copy.
    for (const f of frames) {
      expect(f).toMatch(/Loading cohorts/i);
      expect(f).not.toMatch(/\d+%/);
      expect(f).not.toMatch(/Retention data populates/i);
    }
  });
});

describe("#802 — the engagement range has the same frame, and the same guard", () => {
  function Probe({ sink }: { sink: string[] }) {
    useLayoutEffect(() => {
      sink.push(document.body.textContent ?? "");
    });
    return null;
  }

  it("never commits one range's totals beside another range's dates", async () => {
    // A populated first range.
    harness.byTable["paige_client_events"] = {
      data: [
        { occurred_at: "2026-08-02T10:00:00Z", contact_id: "c1" },
        { occurred_at: "2026-08-03T10:00:00Z", contact_id: "c2" },
      ],
      error: null,
    };
    const frames: string[] = [];
    await render(
      <>
        <ClientEngagementSection start="2026-08-01" end="2026-08-10" />
        <Probe sink={frames} />
      </>,
    );
    expect(host.textContent ?? "").toMatch(/Client events/);

    // Change the range; leave the new read unsettled.
    frames.length = 0;
    harness.hang.add("paige_client_events");
    await render(
      <>
        <ClientEngagementSection start="2026-09-01" end="2026-09-10" />
        <Probe sink={frames} />
      </>,
    );

    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      // The previous range's totals must not survive into a frame rendered for the new one.
      expect(f).not.toMatch(/Client events/);
      expect(f).not.toMatch(/Active clients/);
      expect(f).not.toMatch(/Insufficient data/i);
    }
  });
});
