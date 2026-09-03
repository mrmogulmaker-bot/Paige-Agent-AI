// The adapter, EXECUTED — not grepped.
//
// WHY THIS FILE EXISTS. `catalog-offers.contract.test.tsx` mocks `useCatalogOffers` outright, so
// every claim it makes about the read is a `toContain` over the adapter's own source. An
// adversarial review of the pushed diff proved what that can miss: the membership read asked for
// `tenant_members.tenant_role`, but the COLUMN is `role` (`tenant_role` is the enum type's name).
// PostgREST would have answered 42703, the error was not triaged, and `canManage` would have been
// `false` for every owner in every tenant — silently, while 24 tests stayed green and `tsc` stayed
// clean, because a `toContain("tenant_members")` passes whatever the column is called.
//
// So this file drives the real hook against a fake client that RECORDS the query it was given, and
// asserts the query shape and the resolved authority. A column rename, a dropped filter, or a
// swallowed error turns it red.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Call = { table: string; select: string; eq: Array<[string, unknown]>; single: boolean };

const calls: Call[] = [];
/** Per-table canned results, keyed by table name. */
let results: Record<string, { data: unknown; error: unknown }> = {};
let tenant: { activeTenantId: string | null; accountContextLoading: boolean };
let currentUserId: string | null;

function makeChain(table: string) {
  const call: Call = { table, select: "", eq: [], single: false };
  const chain: Record<string, unknown> = {};
  const settle = () => results[table] ?? { data: [], error: null };
  chain.select = (cols: string) => { call.select = cols; calls.push(call); return chain; };
  chain.eq = (k: string, v: unknown) => { call.eq.push([k, v]); return chain; };
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = () => { call.single = true; return Promise.resolve(settle()); };
  // Awaiting the chain itself resolves the query, as supabase-js does.
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(settle()).then(resolve, reject);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeChain(table),
    auth: { getUser: async () => ({ data: { user: currentUserId ? { id: currentUserId } : null } }) },
  },
}));

vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => tenant }));

const { useCatalogOffers } = await import("./useCatalogOffers");

let host: HTMLDivElement;
let root: Root;
let latest: ReturnType<typeof useCatalogOffers> | null = null;
const renders: Array<ReturnType<typeof useCatalogOffers>> = [];

function Probe() {
  latest = useCatalogOffers();
  // Every render is recorded, not only the last one. `act()` flushes effects before it returns, so
  // a single `latest` read after `act` reflects the state the effect already corrected — which is
  // exactly the paint a synchronous-guard test needs to inspect. The first version of this guard
  // read `latest` and passed with the defect reintroduced.
  renders.push(latest);
  return null;
}

async function run() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<Probe />); });
  // let the async effect settle
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const call = (table: string) => calls.find((c) => c.table === table);

beforeEach(() => {
  calls.length = 0;
  renders.length = 0;
  latest = null;
  currentUserId = "user-1";
  tenant = { activeTenantId: "tenant-1", accountContextLoading: false };
  results = {
    tenant_products: { data: [], error: null },
    tenant_prices: { data: [], error: null },
    tenant_members: { data: { role: "owner" }, error: null },
  };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("useCatalogOffers — the query it actually issues", () => {
  it("asks tenant_members for the column that exists, scoped to the caller and an active seat", async () => {
    await run();
    const members = call("tenant_members");
    expect(members).toBeDefined();
    // `role` is the column. `tenant_role` is the ENUM TYPE — asking for it returns 42703.
    expect(members!.select).toBe("role");
    expect(members!.select).not.toContain("tenant_role");
    expect(members!.eq).toEqual(
      expect.arrayContaining([["tenant_id", "tenant-1"], ["user_id", "user-1"], ["status", "active"]]),
    );
    expect(members!.single).toBe(true);
  });

  it("scopes the offer and price reads to the resolved tenant", async () => {
    await run();
    expect(call("tenant_products")!.eq).toEqual([["tenant_id", "tenant-1"]]);
    expect(call("tenant_prices")!.eq).toEqual([["tenant_id", "tenant-1"]]);
  });

  it("selects the offer columns the surface renders", async () => {
    await run();
    const select = call("tenant_products")!.select;
    for (const column of ["offer_kind", "summary", "delivery_shape", "price_presentation", "customer_action", "category"]) {
      expect(select).toContain(column);
    }
    expect(call("tenant_prices")!.select).toContain("installments_total");
  });
});

describe("useCatalogOffers — resolved authority", () => {
  it("grants manage to an owner", async () => {
    results.tenant_members = { data: { role: "owner" }, error: null };
    await run();
    expect(latest!.canManage).toBe(true);
    expect(latest!.authorityUnknown).toBe(false);
  });

  it("grants manage to an admin", async () => {
    results.tenant_members = { data: { role: "admin" }, error: null };
    await run();
    expect(latest!.canManage).toBe(true);
  });

  it("withholds manage from a plain member", async () => {
    results.tenant_members = { data: { role: "member" }, error: null };
    await run();
    expect(latest!.canManage).toBe(false);
    expect(latest!.authorityUnknown).toBe(false);
  });

  it("does not claim 'you may not edit' when the authority read itself failed", async () => {
    results.tenant_members = { data: null, error: { code: "42703", message: "column does not exist" } };
    await run();
    expect(latest!.canManage).toBe(false);
    // The distinction that matters: unknown is not the same as denied.
    expect(latest!.authorityUnknown).toBe(true);
    // …and the offers still load; a failed authority read must not blank the catalog.
    expect(latest!.phase).toBe("ready");
  });
});

describe("useCatalogOffers — identity and failure", () => {
  it("reads nothing at all until the account context resolves", async () => {
    tenant = { activeTenantId: null, accountContextLoading: true };
    await run();
    expect(latest!.phase).toBe("resolving");
    expect(calls).toHaveLength(0);
  });

  it("reads nothing and reports unavailable when there is no tenant", async () => {
    tenant = { activeTenantId: null, accountContextLoading: false };
    await run();
    expect(latest!.phase).toBe("unavailable");
    expect(calls).toHaveLength(0);
  });

  it("falls back to the base columns only on an undefined-column error", async () => {
    let attempt = 0;
    results.tenant_products = { data: [], error: { code: "42703", message: "column does not exist" } };
    const original = results.tenant_products;
    // Second attempt succeeds with the base shape.
    Object.defineProperty(results, "tenant_products", {
      configurable: true,
      get() { attempt += 1; return attempt === 1 ? original : { data: [], error: null }; },
    });
    await run();
    expect(latest!.phase).toBe("ready");
    expect(latest!.fieldsUnavailable).toBe(true);
    const productReads = calls.filter((c) => c.table === "tenant_products");
    expect(productReads).toHaveLength(2);
    expect(productReads[1].select).not.toContain("offer_kind");
  });

  it("does NOT retry on an undefined-table error — that is a real failure", async () => {
    results.tenant_products = { data: null, error: { code: "42P01", message: 'relation "x" does not exist' } };
    await run();
    expect(latest!.phase).toBe("error");
    expect(calls.filter((c) => c.table === "tenant_products")).toHaveLength(1);
  });
});

describe("useCatalogOffers — what it makes of a row", () => {
  it("never reads product_type as the commercial kind", async () => {
    results.tenant_products = {
      data: [{ id: "o1", name: "Monthly Advisory", status: "active", product_type: "recurring", offer_kind: null }],
      error: null,
    };
    await run();
    const offer = latest!.offers[0];
    expect(offer.billingCadence).toBe("recurring");
    // The record does not say what kind it is, so neither does the adapter.
    expect(offer.kind).toBeNull();
  });

  it("carries the recorded kind through when the tenant stated it", async () => {
    results.tenant_products = {
      data: [{ id: "o1", name: "Fade", status: "active", product_type: "one_time", offer_kind: "service" }],
      error: null,
    };
    await run();
    expect(latest!.offers[0].kind).toBe("service");
  });

  it("says an unreadable status is unread rather than relabelling it a draft", async () => {
    // It used to coerce to "draft". Safe — a draft is shown to nobody — but it ASSERTED a state
    // the record does not prove, which is the same class of lie as a price the record does not
    // prove. A value this build has no reading for now reads as exactly that.
    results.tenant_products = { data: [{ id: "o1", name: "X", status: "nonsense" }], error: null };
    await run();
    expect(latest!.offers[0].availability).toBe("unrecognised");
  });

  it("still claims no conflict for a state it cannot read", async () => {
    // `conflictOf` fires only on "active", so an unreadable state asserts nothing about whether
    // the offer is sellable — which is the point of not calling it a draft OR an active offer.
    results.tenant_products = {
      data: [{ id: "o1", name: "X", status: "future_state", price_presentation: "fixed" }],
      error: null,
    };
    await run();
    expect(latest!.offers[0].availability).toBe("unrecognised");
  });

  it("narrows an unreadable plan kind instead of passing it through raw", async () => {
    // `kind` was the ONE classified field the adapter did not allow-list. An unmapped value reached
    // the surface, produced no sub-label, and fell through to the presentation fallback — printing
    // "Fixed amount" over a per-period figure. Only tenant_prices_kind_check stood in the way: a
    // DATABASE constraint guarding a rendering decision, with nothing linking the two.
    results.tenant_products = { data: [{ id: "o1", name: "X", status: "active" }], error: null };
    results.tenant_prices = {
      data: [
        { id: "p1", product_id: "o1", unit_amount: 9900, kind: "subscription", billing_interval: "month", active: true },
        { id: "p2", product_id: "o1", unit_amount: 9900, kind: "constructor", billing_interval: "month", active: true },
        { id: "p3", product_id: "o1", unit_amount: 9900, kind: "recurring", billing_interval: "month", active: true },
      ],
      error: null,
    };
    await run();
    const kinds = latest!.offers[0].prices.map((p) => p.kind);
    expect(kinds).toEqual([null, null, "recurring"]);
  });

  it("stops showing the previous tenant's offers on the render the tenant changes", async () => {
    // `switchTenant` changes `activeTenantId` IN PLACE for an operator session, and `GrowthHub` is
    // keyed by route rather than tenant, so the hook is NOT remounted. `setState` inside the effect
    // runs after paint, so without a synchronous guard the first render after the switch still
    // returns the previous workspace's `ready` offers — another tenant's names, descriptions and
    // prices under the newly selected workspace, for one paint.
    results.tenant_products = { data: [{ id: "o1", name: "Tenant One Programme", status: "active" }], error: null };
    await run();
    expect(latest!.tenantId).toBe("tenant-1");
    expect(latest!.offers.map((o) => o.name)).toEqual(["Tenant One Programme"]);

    // Re-render under the new tenant and inspect the FIRST render that followed — the single paint
    // between the tenant changing and the effect correcting the state. Reading the final value
    // instead would inspect the already-corrected state and pass either way.
    const before = renders.length;
    tenant = { activeTenantId: "tenant-2", accountContextLoading: false };
    act(() => { root.render(<Probe />); });

    const firstPaint = renders[before];
    expect(firstPaint).toBeDefined();
    expect(firstPaint.tenantId).toBe("tenant-2");
    expect(firstPaint.offers).toEqual([]);
    expect(firstPaint.phase).toBe("loading");
    expect(firstPaint.canManage).toBe(false);
    // And it must never have shown the other workspace's record, on any paint after the switch.
    for (const paint of renders.slice(before)) {
      expect(paint.offers.map((o) => o.name)).not.toContain("Tenant One Programme");
    }
  });

  it("reports resolving, not loading, when the account context itself is still resolving", async () => {
    await run();
    const before = renders.length;
    tenant = { activeTenantId: null, accountContextLoading: true };
    act(() => { root.render(<Probe />); });
    expect(renders[before].phase).toBe("resolving");
    expect(renders[before].offers).toEqual([]);
  });

  it("keeps every recorded plan rather than collapsing to one", async () => {
    results.tenant_products = { data: [{ id: "o1", name: "Program", status: "active" }], error: null };
    results.tenant_prices = {
      data: [
        { id: "p1", product_id: "o1", unit_amount: 50000, kind: "installment", installments_total: 6, active: true },
        { id: "p2", product_id: "o1", unit_amount: 300000, kind: "one_time", active: true },
      ],
      error: null,
    };
    await run();
    expect(latest!.offers[0].prices).toHaveLength(2);
    expect(latest!.offers[0].prices[0].installmentsTotal).toBe(6);
  });
});
