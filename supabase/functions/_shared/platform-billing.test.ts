// deno test supabase/functions/_shared/platform-billing.test.ts
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { classifyMapping, decideLegacyPortal, isPlatformCustomer, upsertBillingAccount } from "./platform-billing.ts";

Deno.test("classifyMapping: no row → insert", () => {
  assertEquals(classifyMapping(null, { stripeCustomerId: "cus_a", stripeAccount: "legacy" }), "insert");
});

Deno.test("classifyMapping: same customer, same account → already_mapped (replay-safe)", () => {
  assertEquals(
    classifyMapping({ stripe_customer_id: "cus_a", stripe_account: "legacy" }, { stripeCustomerId: "cus_a", stripeAccount: "legacy" }),
    "already_mapped",
  );
});

Deno.test("classifyMapping: different customer → conflict, never overwrite", () => {
  assertEquals(
    classifyMapping({ stripe_customer_id: "cus_a", stripe_account: "legacy" }, { stripeCustomerId: "cus_b", stripeAccount: "legacy" }),
    "conflict",
  );
});

Deno.test("classifyMapping: same id on the OTHER Stripe account is a conflict too", () => {
  assertEquals(
    classifyMapping({ stripe_customer_id: "cus_a", stripe_account: "legacy" }, { stripeCustomerId: "cus_a", stripeAccount: "v2" }),
    "conflict",
  );
});

Deno.test("decideLegacyPortal: platform customer is refused 409; unknown check fails closed 503; legacy allowed", () => {
  assertEquals(decideLegacyPortal(true), { allow: false, status: 409, code: "platform_customer_use_workspace_billing" });
  assertEquals(decideLegacyPortal(null), { allow: false, status: 503, code: "platform_customer_check_failed" });
  assertEquals(decideLegacyPortal(false), { allow: true });
});

// A tiny in-memory stand-in for the three reads; the shape is what supabase-js returns.
function fakeAdmin(rows: Record<string, Array<Record<string, unknown>>>, failing: string[] = []) {
  const table = (name: string) => {
    const filters: Array<[string, unknown]> = [];
    // deno-lint-ignore no-explicit-any
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      limit: () => Promise.resolve(
        failing.includes(name)
          ? { data: null, error: { code: "boom" } }
          : { data: (rows[name] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v)), error: null },
      ),
      maybeSingle: () => Promise.resolve(
        failing.includes(name)
          ? { data: null, error: { code: "boom" } }
          : { data: (rows[name] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))[0] ?? null, error: null },
      ),
      insert: (row: Record<string, unknown>) => {
        if (name === "platform_billing_accounts") {
          const all = rows[name] ?? [];
          // Mirror the two real uniques: tenant_id, and (stripe_account, stripe_customer_id).
          if (all.some((r) => r.tenant_id === row.tenant_id) ||
              all.some((r) => r.stripe_account === row.stripe_account && r.stripe_customer_id === row.stripe_customer_id)) {
            return Promise.resolve({ error: { code: "23505" } });
          }
        }
        (rows[name] ??= []).push(row);
        return Promise.resolve({ error: null });
      },
    };
    return q;
  };
  return { from: table, rows };
}

Deno.test("isPlatformCustomer: referenced only via platform_subscriptions (unmapped, ambiguous tenant) still counts", async () => {
  const admin = fakeAdmin({ platform_subscriptions: [{ tenant_id: "t1", stripe_customer_id: "cus_x" }] });
  assertEquals(await isPlatformCustomer(admin, "cus_x"), true);
});

Deno.test("isPlatformCustomer: referenced only via tenants.stripe_customer_id counts", async () => {
  const admin = fakeAdmin({ tenants: [{ id: "t1", stripe_customer_id: "cus_y" }] });
  assertEquals(await isPlatformCustomer(admin, "cus_y"), true);
});

Deno.test("isPlatformCustomer: a legacy consumer customer is not a platform customer", async () => {
  const admin = fakeAdmin({ platform_subscriptions: [{ tenant_id: "t1", stripe_customer_id: "cus_x" }] });
  assertEquals(await isPlatformCustomer(admin, "cus_legacy"), false);
});

Deno.test("isPlatformCustomer: a failed read answers null, never false", async () => {
  const admin = fakeAdmin({}, ["tenants"]);
  assertEquals(await isPlatformCustomer(admin, "cus_x"), null);
});

Deno.test("upsertBillingAccount: inserts when absent; replay is already_mapped; a different id is a conflict that writes an audit row and leaves the mapping alone", async () => {
  const admin = fakeAdmin({});
  const first = await upsertBillingAccount(admin, { tenantId: "t1", stripeCustomerId: "cus_a", stripeAccount: "legacy", source: "checkout" });
  assertEquals(first, { outcome: "inserted" });
  const replay = await upsertBillingAccount(admin, { tenantId: "t1", stripeCustomerId: "cus_a", stripeAccount: "legacy", source: "checkout" });
  assertEquals(replay, { outcome: "already_mapped" });
  const conflict = await upsertBillingAccount(admin, { tenantId: "t1", stripeCustomerId: "cus_b", stripeAccount: "legacy", source: "checkout" });
  assertEquals(conflict, { outcome: "conflict", existingAccount: "legacy" });
  assertEquals(admin.rows.platform_billing_accounts.length, 1);
  assertEquals(admin.rows.platform_billing_accounts[0].stripe_customer_id, "cus_a");
  assertEquals(admin.rows.paige_audit_log.length, 1);
  assertEquals(admin.rows.paige_audit_log[0].action, "platform_billing_account_conflict");
  // The audit payload names accounts and source only — never the customer ids.
  assertEquals(JSON.stringify(admin.rows.paige_audit_log[0].payload).includes("cus_"), false);
});

Deno.test("upsertBillingAccount: a concurrent replay that lost the insert race re-reads and answers already_mapped", async () => {
  const admin = fakeAdmin({});
  // Simulate the race: the first read sees nothing, but the row lands before our insert.
  const realFrom = admin.from;
  let reads = 0;
  admin.from = (name: string) => {
    const q = realFrom(name);
    if (name === "platform_billing_accounts") {
      const realMaybeSingle = q.maybeSingle;
      q.maybeSingle = () => {
        reads++;
        if (reads === 1) {
          (admin.rows.platform_billing_accounts ??= []).push({ tenant_id: "t1", stripe_customer_id: "cus_a", stripe_account: "legacy" });
          return Promise.resolve({ data: null, error: null });
        }
        return realMaybeSingle();
      };
    }
    return q;
  };
  assertEquals(await upsertBillingAccount(admin, { tenantId: "t1", stripeCustomerId: "cus_a", stripeAccount: "legacy", source: "checkout" }), { outcome: "already_mapped" });
  assertEquals(admin.rows.paige_audit_log, undefined);
});

Deno.test("upsertBillingAccount: a customer already mapped to ANOTHER workspace is refused and audited as shared, ids out of the payload", async () => {
  const admin = fakeAdmin({ platform_billing_accounts: [{ tenant_id: "t-other", stripe_customer_id: "cus_a", stripe_account: "legacy" }] });
  const r = await upsertBillingAccount(admin, { tenantId: "t1", stripeCustomerId: "cus_a", stripeAccount: "legacy", source: "checkout" });
  assertEquals(r, { outcome: "error", code: "mapping_customer_shared_across_workspaces" });
  assertEquals(admin.rows.platform_billing_accounts.length, 1);
  assertEquals(admin.rows.paige_audit_log.length, 1);
  assertEquals((admin.rows.paige_audit_log[0].payload as { kind: string }).kind, "customer_shared_across_workspaces");
  assertEquals(JSON.stringify(admin.rows.paige_audit_log[0].payload).includes("cus_"), false);
});

Deno.test("upsertBillingAccount: a client that THROWS is an error outcome, never a throw past the webhook", async () => {
  const admin = { from: () => { throw new Error("boom"); } };
  assertEquals(await upsertBillingAccount(admin, { tenantId: "t1", stripeCustomerId: "cus_a", stripeAccount: "legacy", source: "checkout" }), { outcome: "error", code: "mapping_threw" });
});
