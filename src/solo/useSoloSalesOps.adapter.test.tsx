// The Sales-operations adapter, EXECUTED — not grepped.
//
// WHY THIS FILE EXISTS, in the words of the defect that created the pattern. `useCatalogOffers`
// once asked for `tenant_members.tenant_role`, but the COLUMN is `role` — `tenant_role` is the enum
// TYPE's name. PostgREST would have answered 42703, the error was not triaged, and `canManage`
// would have been false for every owner in every tenant, silently, while every static test stayed
// green: a `toContain("tenant_members")` passes whatever the column is called.
//
// `sales-ops.contract.test.tsx` mocks this hook outright so it can prove the SURFACE. That leaves
// the query shape unproven, so this file drives the REAL hook against a client that RECORDS what it
// was asked for. A renamed column, a dropped tenant filter, a swallowed error, or an rpc sent with
// the wrong expected tenant turns it red.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Call = { table: string; select: string; eq: Array<[string, unknown]>; single: boolean; limit: number | null };
type Rpc = { fn: string; args: Record<string, unknown> };

const calls: Call[] = [];
const rpcs: Rpc[] = [];
let results: Record<string, { data: unknown; error: unknown }> = {};
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
let tenant: { activeTenantId: string | null; accountContextLoading: boolean };
let currentUserId: string | null;

function makeChain(table: string) {
  const call: Call = { table, select: "", eq: [], single: false, limit: null };
  const chain: Record<string, unknown> = {};
  const settle = () => results[table] ?? { data: [], error: null };
  chain.select = (cols: string) => { call.select = cols; calls.push(call); return chain; };
  chain.eq = (k: string, v: unknown) => { call.eq.push([k, v]); return chain; };
  chain.order = () => chain;
  chain.limit = (n: number) => { call.limit = n; return chain; };
  chain.maybeSingle = () => { call.single = true; return Promise.resolve(settle()); };
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(settle()).then(resolve, reject);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeChain(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return Promise.resolve(rpcResult);
    },
    auth: { getUser: async () => ({ data: { user: currentUserId ? { id: currentUserId } : null } }) },
  },
}));

vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => tenant }));

const { useSoloSalesOps } = await import("./useSoloSalesOps");

let host: HTMLDivElement;
let root: Root;
let latest: ReturnType<typeof useSoloSalesOps> | null = null;
const renders: Array<ReturnType<typeof useSoloSalesOps>> = [];

function Probe() {
  latest = useSoloSalesOps();
  // EVERY render is recorded, not only the last. `act()` flushes effects before returning, so a
  // single read after `act` reflects the state the effect already corrected — which is exactly the
  // paint a synchronous-guard test has to inspect.
  renders.push(latest);
  return null;
}

async function run() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<Probe />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const call = (table: string) => calls.find((c) => c.table === table);

beforeEach(() => {
  calls.length = 0;
  rpcs.length = 0;
  renders.length = 0;
  latest = null;
  currentUserId = "user-1";
  tenant = { activeTenantId: "tenant-1", accountContextLoading: false };
  rpcResult = { data: { tenant_id: "tenant-1" }, error: null };
  results = {
    tenants: { data: { id: "tenant-1", payment_processor_declared: "square", payment_methods_declared: ["cards", "ach"] }, error: null },
    tenant_orders: { data: [
      { id: "o1", product_id: null, customer_name: "A client", customer_email: null,
        amount_total: 45000, currency: "usd", status: "complete", created_at: "2026-08-20T12:00:00Z" },
    ], error: null },
    tenant_members: { data: { role: "owner" }, error: null },
  };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("useSoloSalesOps — the query it actually issues", () => {
  it("scopes every read to the resolved workspace, by the real column names", async () => {
    await run();

    // The workspace's own row is scoped by its primary key — that IS the tenant scope here.
    expect(call("tenants")?.eq).toEqual([["id", "tenant-1"]]);
    expect(call("tenants")?.select).toContain("payment_processor_declared");
    expect(call("tenants")?.select).toContain("payment_methods_declared");

    expect(call("tenant_orders")?.eq).toEqual([["tenant_id", "tenant-1"]]);
    // Bounded deliberately: a recent-activity list, not a ledger presented as one.
    expect(call("tenant_orders")?.limit).toBe(50);

    // Authority is asked about THIS workspace and about the CALLER's own row — the column is
    // `role`; `tenant_role` is the enum TYPE's name, which is the exact defect this file exists for.
    expect(call("tenant_members")?.select).toBe("role");
    expect(call("tenant_members")?.eq).toEqual([
      ["tenant_id", "tenant-1"],
      ["user_id", "user-1"],
      ["status", "active"],
    ]);
    expect(call("tenant_members")?.single).toBe(true);

    expect(latest?.phase).toBe("ready");
    expect(latest?.canManage).toBe(true);
    expect(latest?.processor).toBe("square");
    expect(latest?.methods).toEqual(["cards", "ach"]);
    expect(latest?.orders).toHaveLength(1);
    expect(latest?.orders[0].amountTotal).toBe(45000);
  });

  it("reads nothing at all before the workspace resolves", async () => {
    tenant = { activeTenantId: null, accountContextLoading: true };
    await run();
    expect(calls).toHaveLength(0);
    expect(latest?.phase).toBe("resolving");
  });

  it("reads nothing and reports unavailable when there is no workspace", async () => {
    tenant = { activeTenantId: null, accountContextLoading: false };
    await run();
    expect(calls).toHaveLength(0);
    expect(latest?.phase).toBe("unavailable");
    expect(latest?.canManage).toBe(false);
  });

  it("treats an unreadable activity table as unknown, not as an empty one", async () => {
    // THE INPUT THIS CASE ORIGINALLY USED COULD NOT HAPPEN. It faked the denial as
    // `{data: null, error: {code: "42501"}}` — but `tenant_orders` GRANTs SELECT to
    // `authenticated`, so no caller ever sees 42501. The only gate is the RLS policy
    // `torders_admin_read USING (is_tenant_admin(tenant_id) OR is_platform_owner())`, and RLS is a
    // ROW FILTER: a plain member's read returns 200 with an EMPTY array and NO error. Modelled
    // wrongly, the test passed while `ordersReadable = !error` could never be false, so a member of
    // a workspace WITH payments would have been told in a definite sentence that it had none.
    results.tenant_orders = { data: [], error: null };
    results.tenant_members = { data: { role: "member" }, error: null };
    await run();
    expect(latest?.phase).toBe("ready");
    expect(latest?.canManage).toBe(false);
    expect(latest?.ordersReadable).toBe(false);
    expect(latest?.orders).toEqual([]);
  });

  it("does not tell a platform operator their own successful read failed", async () => {
    // A platform operator satisfies the policy through `is_platform_owner()` and has NO
    // `tenant_members` row, so authority alone would wrongly mark their read unreadable. A
    // non-empty result is its own proof that the policy admitted them.
    results.tenant_members = { data: null, error: null };
    await run();
    expect(latest?.canManage).toBe(false);
    expect(latest?.orders).toHaveLength(1);
    expect(latest?.ordersReadable).toBe(true);
  });

  it("still reports an actual read failure as unreadable", async () => {
    results.tenant_orders = { data: null, error: { message: "boom" } };
    await run();
    expect(latest?.phase).toBe("ready");
    expect(latest?.ordersReadable).toBe(false);
  });

  it("reports a failed authority read as unknown, never as a refusal", async () => {
    results.tenant_members = { data: null, error: { message: "boom" } };
    await run();
    // "I could not check whether you may edit" is not "you may not edit". Collapsing them is how
    // an owner gets locked out of their own workspace.
    expect(latest?.canManage).toBe(false);
    expect(latest?.authorityUnknown).toBe(true);
  });

  it("errors the surface when the workspace row itself cannot be read", async () => {
    results.tenants = { data: null, error: { message: "boom" } };
    await run();
    expect(latest?.phase).toBe("error");
  });

  it("narrows an unreadable processor rather than coercing it to a neighbour", async () => {
    results.tenants = {
      data: { id: "tenant-1", payment_processor_declared: "some_future_processor", payment_methods_declared: ["cards", "moon_rocks"] },
      error: null,
    };
    await run();
    expect(latest?.processor).toBeNull();
    // The distinguishing flag: the column HELD something, this build could not read it. Rendering
    // that as "not stated" would be indistinguishable from a workspace that never answered.
    expect(latest?.processorUnrecognised).toBe(true);
    // An unreadable method is dropped, never passed through to a label lookup that has no entry.
    expect(latest?.methods).toEqual(["cards"]);
  });

  it("narrows an unrecognised order status instead of calling it pending", async () => {
    results.tenant_orders = { data: [
      { id: "o1", product_id: null, customer_name: null, customer_email: null,
        amount_total: null, currency: null, status: "chargeback", created_at: null },
    ], error: null };
    await run();
    expect(latest?.orders[0].status).toBe("unrecognised");
    // An absent amount stays null so the surface renders an em-dash, never a zero.
    expect(latest?.orders[0].amountTotal).toBeNull();
  });

  it("sends the caller's own resolved workspace as the refusal-only expected tenant", async () => {
    await run();
    await act(async () => { await latest?.declarePaymentHandling("paypal", ["cards"]); });
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].fn).toBe("declare_client_payment_handling");
    expect(rpcs[0].args._expected_tenant_id).toBe("tenant-1");
    expect(rpcs[0].args._processor).toBe("paypal");
    expect(rpcs[0].args._methods).toEqual(["cards"]);
  });

  it("keeps null methods distinct from empty methods", async () => {
    await run();
    // null means "leave the list alone"; [] means "clear it". Collapsing them would make it
    // impossible to change the processor without wiping a list nobody touched.
    await act(async () => { await latest?.declarePaymentHandling("manual", null); });
    expect(rpcs[0].args._methods).toBeNull();
    await act(async () => { await latest?.declarePaymentHandling("manual", []); });
    expect(rpcs[1].args._methods).toEqual([]);
  });

  it("reports a refused write honestly and writes nothing", async () => {
    await run();
    rpcResult = { data: null, error: { code: "42501", message: "your active workspace changed before this could save; nothing was written" } };
    let outcome: { ok: boolean; message?: string } | undefined;
    await act(async () => { outcome = await latest?.declarePaymentHandling("stripe", ["cards"]); });
    expect(outcome?.ok).toBe(false);
    // The server's own sentence reaches the person, rather than a generic failure.
    expect(outcome?.message).toContain("nothing was written");
  });

  it("refuses to write at all when the workspace is unresolved", async () => {
    tenant = { activeTenantId: null, accountContextLoading: false };
    await run();
    let outcome: { ok: boolean; message?: string } | undefined;
    await act(async () => { outcome = await latest?.declarePaymentHandling("stripe", ["cards"]); });
    expect(outcome?.ok).toBe(false);
    expect(rpcs).toHaveLength(0);
  });

  it("never paints one workspace's money under another's name", async () => {
    await run();
    // A workspace switch changes `activeTenantId` IN PLACE without remounting, because GrowthHub is
    // keyed by route and not by tenant. `setState` in the effect runs AFTER paint, so without the
    // synchronous guard there is one frame showing the PREVIOUS workspace's customer names and
    // amounts under the newly selected one.
    tenant = { activeTenantId: "tenant-2", accountContextLoading: false };
    renders.length = 0;
    await act(async () => { root.render(<Probe />); });

    const firstPaint = renders[0];
    expect(firstPaint.tenantId).toBe("tenant-2");
    expect(firstPaint.orders).toEqual([]);
    expect(firstPaint.processor).toBeNull();
    expect(firstPaint.canManage).toBe(false);
    // And every recorded paint of the switch, not just the first — a later one leaking is the same
    // defect one frame further along.
    for (const paint of renders) {
      if (paint.tenantId === "tenant-2" && paint.phase !== "ready") {
        expect(paint.orders).toEqual([]);
      }
    }
  });
});
