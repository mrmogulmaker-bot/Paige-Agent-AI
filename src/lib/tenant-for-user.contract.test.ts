/**
 * resolveTenantForUser — the resolution that four connect flows got wrong.
 *
 * This decides WHICH TENANT a newly-connected sending account, calendar, Zoom
 * account or SMTP server is attached to. Getting it wrong is not a cosmetic bug:
 * too permissive is a §9 cross-tenant write, too strict is the
 * `no_tenant_for_user` dead end that made all four flows unusable.
 *
 * WHY IT LIVES HERE rather than in `scripts/` as a standalone smoke. It was one,
 * run by `node --experimental-strip-types`, and wired into CI — where it could
 * never have executed: that flag landed in Node 22.6 and the `verify` job pins
 * Node 20, so the step would have failed on every push while advertising itself
 * as the safety net for these assertions. The repo's one other strip-types script
 * is deliberately NOT in CI for the same reason. Vitest already runs on Node 20
 * and already transforms TypeScript, so the checks now execute inside the suite
 * that actually runs, instead of a gate that could not.
 *
 * It exercises the REAL module. Only the Supabase client is substituted.
 *
 * Every assertion here is paired with the fact that it FAILS against the previous
 * implementation, which read a non-existent `profiles.tenant_id` column keyed on a
 * surrogate `profiles.id` and discarded the error — it returned null for every
 * input, so every "resolves" case below would have failed and every "refuses" case
 * would have passed for the wrong reason.
 *
 *   node --experimental-strip-types scripts/tenant-for-user-smoke.mts
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { resolveTenantForUser } from "../../supabase/functions/_shared/tenant-for-user.ts";

const USER = "11111111-1111-1111-1111-111111111111";
const PRIMARY = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/**
 * A Supabase double narrow enough to be honest about what it stands in for: the
 * `tenant_members` membership probe and the `get_user_primary_tenant` RPC. It
 * records the filters it was given so a test can prove the query was SCOPED, not
 * merely that it returned something.
 */
function client(opts: {
  memberships?: Array<{ tenant_id: string; user_id: string; status: string }>;
  primary?: string | null;
  membershipError?: string;
  rpcError?: string;
}) {
  const calls: { filters: Record<string, unknown>; rpc: string[] } = { filters: {}, rpc: [] };
  return {
    calls,
    from(_table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => { filters[col] = val; return builder; },
        maybeSingle: async () => {
          calls.filters = filters;
          if (opts.membershipError) return { data: null, error: { message: opts.membershipError } };
          const hit = (opts.memberships ?? []).find((m) =>
            m.user_id === filters.user_id && m.tenant_id === filters.tenant_id && m.status === filters.status,
          );
          return { data: hit ? { tenant_id: hit.tenant_id } : null, error: null };
        },
      };
      return builder;
    },
    async rpc(name: string, _args: unknown) {
      calls.rpc.push(name);
      if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
      // get_user_primary_tenant RETURNS TABLE, so supabase-js yields an array.
      return { data: opts.primary ? [{ tenant_id: opts.primary }] : [], error: null };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

function check(name: string, fn: () => Promise<void>) {
  it(name, fn);
}

describe("resolveTenantForUser — which tenant a connect flow attaches to", () => {
  // 1. The plain case the old code could never satisfy.
  check("resolves the primary tenant when no preference is given", async () => {
    const c = client({ primary: PRIMARY });
    const r = await resolveTenantForUser(c, USER);
    assert.equal(r.tenantId, PRIMARY);
    assert.equal(r.source, "primary");
    assert.equal(r.error, null);
    assert.deepEqual(c.calls.rpc, ["get_user_primary_tenant"]);
  });

  // 2. The active-workspace case: a member of two tenants lands where they stood.
  check("honours a signed workspace preference the user is a member of", async () => {
    const c = client({
      primary: PRIMARY,
      memberships: [{ tenant_id: OTHER, user_id: USER, status: "active" }],
    });
    const r = await resolveTenantForUser(c, USER, OTHER);
    assert.equal(r.tenantId, OTHER, "preference must win over the primary ranking");
    assert.equal(r.source, "preferred");
    // The membership probe must be scoped by all three, or it is not a check.
    assert.deepEqual(c.calls.filters, { user_id: USER, tenant_id: OTHER, status: "active" });
  });

  // 3. THE SECURITY ROW. A preference the user does not belong to must never win.
  check("REFUSES a workspace preference the user is not a member of", async () => {
    const c = client({ primary: PRIMARY, memberships: [] });
    const r = await resolveTenantForUser(c, USER, OTHER);
    assert.notEqual(r.tenantId, OTHER, "a non-member preference would be a cross-tenant write");
    assert.equal(r.tenantId, PRIMARY, "and it degrades to the real primary rather than dead-ending");
    assert.equal(r.source, "primary");
  });

  // 4. An INACTIVE membership is not a membership.
  check("REFUSES a workspace the user's membership is not active in", async () => {
    const c = client({
      primary: PRIMARY,
      memberships: [{ tenant_id: OTHER, user_id: USER, status: "invited" }],
    });
    const r = await resolveTenantForUser(c, USER, OTHER);
    assert.equal(r.tenantId, PRIMARY);
    assert.equal(r.source, "primary");
  });

  // 5. A failed membership read must not be silently read as "not a member" — that
  //    swallow is exactly what hid the original defect.
  check("surfaces a membership-read failure instead of swallowing it", async () => {
    const c = client({ primary: PRIMARY, membershipError: "boom" });
    const r = await resolveTenantForUser(c, USER, OTHER);
    assert.equal(r.tenantId, PRIMARY, "it still resolves usefully");
    assert.match(String(r.error), /membership_check_failed: boom/, "and it says what went wrong");
  });

  // 6. A user in no tenant resolves to null WITH no error — an honest absence, not
  //    a failure. The caller turns this into its own 400/redirect.
  check("returns a clean null for a user who belongs to no tenant", async () => {
    const r = await resolveTenantForUser(client({ primary: null }), USER);
    assert.equal(r.tenantId, null);
    assert.equal(r.source, "none");
    assert.equal(r.error, null);
  });

  // 7. An RPC failure is reported as a failure, distinct from case 6.
  check("distinguishes an RPC failure from an honest absence", async () => {
    const r = await resolveTenantForUser(client({ rpcError: "denied" }), USER);
    assert.equal(r.tenantId, null);
    assert.match(String(r.error), /primary_tenant_failed: denied/);
  });

  // 8. No user id is refused before any query runs.
  check("refuses an empty user id without querying", async () => {
    const c = client({ primary: PRIMARY });
    const r = await resolveTenantForUser(c, "");
    assert.equal(r.tenantId, null);
    assert.equal(r.error, "missing_user_id");
    assert.deepEqual(c.calls.rpc, [], "it must not reach the database at all");
  });

});
