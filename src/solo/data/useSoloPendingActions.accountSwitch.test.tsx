import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach } from "vitest";

// React only flushes effects inside `act` when it is told it is in a test environment. Without
// this the effect under test never runs and the suite would pass vacuously.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * WHAT IS WAITING ON *THIS* ACCOUNT — AND NOTHING ELSE.
 *
 * `paige_actions` rows carry the title Paige filed, her summary, her drafted artefact and her
 * reason for stopping. The Trust Compass modals render all four. The hook that feeds them re-ran
 * only on a manual refresh counter, while the compass itself survives an account switch that stays
 * on the same route — so after switching accounts the operator went on reading the PREVIOUS
 * tenant's drafts, rationales and summaries, indefinitely, with the new account's name in the
 * chrome around them.
 *
 * That is a tenant-isolation failure, not a staleness one. RLS scoped the READ correctly; what
 * leaked is that nothing re-asked when the account changed, so correctly-scoped rows for account A
 * stayed on screen under account B.
 *
 * Two properties, and the first is the one that matters most: the prior account's rows must be
 * gone the INSTANT the account changes — not once the replacement read comes back. A read can be
 * slow, or fail; neither is a licence to keep showing another account's drafts in the meantime.
 */

type Resolver = (v: { data: unknown[] | null; error: { message: string } | null }) => void;

let reads: Array<{ resolve: Resolver }>;
let activeTenantId: string | null;

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      then: (ok: (v: never) => unknown, err?: (e: unknown) => unknown) =>
        new Promise<never>((resolve) => {
          reads.push({ resolve: resolve as unknown as Resolver });
        }).then(ok, err),
    };
    return b;
  };
  return { supabase: { from: () => builder() } };
});

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId }),
}));

const { useSoloPendingActions } = await import("./useSoloPendingActions");

function action(id: string, title: string) {
  return {
    id, title, summary: "A summary", draft_content: "A drafted note.",
    decision_rationale: "It goes to a client, so it waits for you.",
    from_department: "marketing", created_at: "2026-09-01T11:00:00.000Z",
  };
}

async function flush() { for (let i = 0; i < 4; i++) await Promise.resolve(); }

async function mountHook() {
  const seen: Array<ReturnType<typeof useSoloPendingActions>> = [];
  function Probe() { seen.push(useSoloPendingActions()); return null; }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<Probe />); await flush(); });
  return {
    latest: () => seen[seen.length - 1],
    // Change the active account the way the provider does, then let the tree re-render.
    switchAccount: async (id: string | null) => {
      activeTenantId = id;
      await act(async () => { root.render(<Probe />); await flush(); });
    },
  };
}

async function settle(index: number, rows: unknown[]) {
  const hit = reads[index];
  if (!hit) throw new Error(`no read at index ${index}; there are ${reads.length}`);
  await act(async () => { hit.resolve({ data: rows, error: null }); await flush(); });
}

beforeEach(() => { reads = []; activeTenantId = "tenant-A"; });

describe("useSoloPendingActions — an account switch clears and re-asks", () => {
  it("shows what the current account has waiting", async () => {
    const h = await mountHook();
    await settle(0, [action("a-1", "A's renewal note")]);
    expect(h.latest().items.map((i) => i.title)).toEqual(["A's renewal note"]);
    expect(h.latest().loading).toBe(false);
  });

  it("clears the previous account's items IMMEDIATELY on switch, before any new read returns", async () => {
    const h = await mountHook();
    await settle(0, [action("a-1", "A's renewal note")]);
    expect(h.latest().items).toHaveLength(1);

    await h.switchAccount("tenant-B");

    // Nothing has come back for B yet. Rendering A's drafts here is the leak.
    expect(h.latest().items).toEqual([]);
    expect(h.latest().loading).toBe(true);
  });

  it("re-queries for the new account", async () => {
    const h = await mountHook();
    await settle(0, [action("a-1", "A's renewal note")]);
    const before = reads.length;

    await h.switchAccount("tenant-B");
    expect(reads.length).toBe(before + 1);

    await settle(before, [action("b-1", "B's dunning draft")]);
    expect(h.latest().items.map((i) => i.title)).toEqual(["B's dunning draft"]);
  });

  it("carries no field of the previous account's action across the switch", async () => {
    const h = await mountHook();
    await settle(0, [action("a-1", "A's renewal note")]);

    await h.switchAccount("tenant-B");
    await settle(1, []);

    const rendered = JSON.stringify(h.latest().items);
    for (const leak of ["A's renewal note", "A summary", "A drafted note.", "It goes to a client"]) {
      expect(rendered).not.toContain(leak);
    }
    expect(h.latest().items).toEqual([]);
    expect(h.latest().error).toBeNull();
  });

  it("does not let the PREVIOUS account's in-flight read populate the new account", async () => {
    const h = await mountHook();               // read 0 → tenant-A, left in flight
    await h.switchAccount("tenant-B");         // read 1 → tenant-B
    await settle(1, [action("b-1", "B's dunning draft")]);
    await settle(0, [action("a-1", "A's renewal note")]);   // A answers late

    expect(h.latest().items.map((i) => i.title)).toEqual(["B's dunning draft"]);
  });

  it("does not let the PREVIOUS account's failed read stamp an error on the new account", async () => {
    const h = await mountHook();
    await h.switchAccount("tenant-B");
    await settle(1, []);
    await act(async () => {
      reads[0].resolve({ data: null, error: { message: "A's read blew up" } });
      await flush();
    });
    expect(h.latest().error).toBeNull();
    expect(h.latest().loading).toBe(false);
  });

  it("still reports a failed read for the CURRENT account rather than an empty list (§13)", async () => {
    const h = await mountHook();
    await act(async () => {
      reads[0].resolve({ data: null, error: { message: "policy refused" } });
      await flush();
    });
    expect(h.latest().error).toBe("policy refused");
    expect(h.latest().items).toEqual([]);
  });

  it("manual refresh still re-reads without changing account", async () => {
    const h = await mountHook();
    await settle(0, [action("a-1", "A's renewal note")]);
    const before = reads.length;
    await act(async () => { h.latest().refresh(); await flush(); });
    expect(reads.length).toBe(before + 1);
  });
});
