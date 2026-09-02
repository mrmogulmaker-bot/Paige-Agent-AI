import { act, useLayoutEffect } from "react";
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

let reads: Array<{ resolve: Resolver; filters: Array<[string, unknown]>; columns: string }>;
let activeTenantId: string | null;
let accountContextStatus: "resolving" | "signed_out" | "error" | "ready";

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const filters: Array<[string, unknown]> = [];
    let columns = "";
    const b = {
      select: (c: string) => { columns = c; return b; },
      eq: (col: string, val: unknown) => { filters.push([col, val]); return b; },
      order: () => b,
      limit: () => b,
      then: (ok: (v: never) => unknown, err?: (e: unknown) => unknown) =>
        new Promise<never>((resolve) => {
          reads.push({ resolve: resolve as unknown as Resolver, filters, columns });
        }).then(ok, err),
    };
    return b;
  };
  return { supabase: { from: () => builder() } };
});

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId, accountContextStatus }),
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
  /**
   * COMMITTED frames only. `useLayoutEffect` runs after a commit and never for a render React
   * discarded, so this records exactly the frames a person could have been shown. Asserting on the
   * settled result cannot tell a render-phase clear from an effect-phase one — independent review
   * rebuilt this hook with the clear moved into an effect and the earlier version of this suite
   * passed 8/8. That false green is what this probe closes.
   */
  const committed: Array<{ items: string[]; loading: boolean }> = [];
  function Probe() {
    const r = useSoloPendingActions();
    seen.push(r);
    useLayoutEffect(() => {
      committed.push({ items: r.items.map((i) => i.title), loading: r.loading });
    });
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<Probe />); await flush(); });
  return {
    latest: () => seen[seen.length - 1],
    commits: () => committed,
    // Change the active account the way the provider does, then let the tree re-render.
    switchAccount: async (id: string | null, status?: typeof accountContextStatus) => {
      activeTenantId = id;
      if (status) accountContextStatus = status;
      await act(async () => { root.render(<Probe />); await flush(); });
    },
  };
}

async function settle(index: number, rows: unknown[]) {
  const hit = reads[index];
  if (!hit) throw new Error(`no read at index ${index}; there are ${reads.length}`);
  await act(async () => { hit.resolve({ data: rows, error: null }); await flush(); });
}

beforeEach(() => { reads = []; activeTenantId = "tenant-A"; accountContextStatus = "ready"; });

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

    const before = h.commits().length;
    await h.switchAccount("tenant-B");

    // Nothing has come back for B yet. Rendering A's drafts here is the leak — and it must be
    // absent from EVERY committed frame after the switch, not merely once things settle.
    for (const frame of h.commits().slice(before)) {
      expect(frame.items).not.toContain("A's renewal note");
    }
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

  it("asks nothing until the account is actually resolved, and asks once when it is", async () => {
    // A null id means two different things — "still resolving" and "platform tier" — so reading on
    // the id alone fired a query at a scope nobody was on, then treated the resolution as a switch
    // and fired a second, discarding the first.
    accountContextStatus = "resolving";
    activeTenantId = null;
    const h = await mountHook();
    expect(reads).toHaveLength(0);
    expect(h.latest().loading).toBe(true);
    expect(h.latest().error).toBeNull();   // not yet asked is not "nothing is waiting" (§13)

    await h.switchAccount("tenant-A", "ready");
    expect(reads).toHaveLength(1);
    await settle(0, [action("a-1", "A's renewal note")]);
    expect(h.latest().items.map((i) => i.title)).toEqual(["A's renewal note"]);
  });

  it("reads nothing when no account is in scope, and says so rather than showing an empty list", async () => {
    // §9 — the `paige_actions` policy is `(tenant = current_user_tenant_id() AND role) OR
    // is_platform_owner()`, so for the operator tier it short-circuits and an unfiltered read
    // returns EVERY tenant's filed work. A cross-tenant union inside a modal that names one
    // account is the leak; an empty list would be a different false claim (§13).
    accountContextStatus = "ready";
    activeTenantId = null;
    const h = await mountHook();
    expect(reads).toHaveLength(0);
    expect(h.latest().items).toEqual([]);
    expect(h.latest().loading).toBe(false);
    expect(h.latest().error).toMatch(/no account is selected/);
  });

  it("narrows the read to the active account, and can be seen to do so", async () => {
    await mountHook();
    expect(reads[0].filters).toContainEqual(["tenant_id", "tenant-A"]);
    expect(reads[0].columns).toContain("tenant_id");
  });

  it("re-narrows to the NEW account after a switch", async () => {
    const h = await mountHook();
    await settle(0, [action("a-1", "A's renewal note")]);
    await h.switchAccount("tenant-B");
    expect(reads[1].filters).toContainEqual(["tenant_id", "tenant-B"]);
  });

  it("manual refresh still re-reads without changing account", async () => {
    const h = await mountHook();
    await settle(0, [action("a-1", "A's renewal note")]);
    const before = reads.length;
    await act(async () => { h.latest().refresh(); await flush(); });
    expect(reads.length).toBe(before + 1);
  });
});
