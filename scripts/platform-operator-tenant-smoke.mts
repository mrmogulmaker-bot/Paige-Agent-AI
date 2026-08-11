// Headless §32 smoke for the platform-operator-tenant resolver (#578 / §200).
// Run: node --experimental-strip-types scripts/platform-operator-tenant-smoke.mts
//
// A green build proves nothing about whether the resolver actually fails CLOSED.
// This exercises the REAL shipped helper against a programmable mock admin client
// (that also COUNTS queries) and asserts: valid UUID resolves, unset/malformed/
// error all return null (never the phantom), and the TTL cache behaves.
import {
  platformOperatorTenantId,
  resetPlatformOperatorTenantCache,
} from "../supabase/functions/_shared/platform-operator-tenant.ts";

let failures = 0;
function assert(cond: unknown, msg: string) {
  if (cond) console.log(`  ok   — ${msg}`);
  else { console.error(`  FAIL — ${msg}`); failures++; }
}

const PHANTOM = "a25194e0-93c4-4e2c-91d0-66ea012660b2";
const VALID = "d8a0a880-1bed-43af-9b5d-e23c4db93106";

// A mock admin whose single-row read is programmable, and which counts how many
// times the query actually hit the "DB" (to prove the cache).
function mockAdmin(result: { data: { value?: unknown } | null; error: { message?: string } | null }) {
  const counter = { queries: 0 };
  const admin = {
    from(_t: string) {
      return {
        select(_c: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async maybeSingle() { counter.queries++; return result; },
              };
            },
          };
        },
      };
    },
  };
  return { admin, counter };
}

async function run() {
  // 1. UNSET (no row) => null.
  resetPlatformOperatorTenantCache();
  {
    const { admin } = mockAdmin({ data: null, error: null });
    const r = await platformOperatorTenantId(admin);
    assert(r === null, "unset (no row) => null (fail closed)");
  }

  // 2. VALID uuid string => returns that exact uuid.
  resetPlatformOperatorTenantCache();
  {
    const { admin } = mockAdmin({ data: { value: VALID }, error: null });
    const r = await platformOperatorTenantId(admin);
    assert(r === VALID, "valid uuid string => that uuid");
  }

  // 3. MALFORMED object => null (scalar-string contract).
  resetPlatformOperatorTenantCache();
  {
    const { admin } = mockAdmin({ data: { value: { tenant_id: VALID } }, error: null });
    const r = await platformOperatorTenantId(admin);
    assert(r === null, "object value => null (rejects non-scalar)");
  }

  // 4. MALFORMED string (not a uuid) => null.
  resetPlatformOperatorTenantCache();
  {
    const { admin } = mockAdmin({ data: { value: "not-a-uuid" }, error: null });
    const r = await platformOperatorTenantId(admin);
    assert(r === null, "non-uuid string => null (UUID regex)");
  }

  // 5. ERROR => null, does not throw, and is NOT cached.
  resetPlatformOperatorTenantCache();
  {
    const { admin, counter } = mockAdmin({ data: null, error: { message: "boom" } });
    let threw = false;
    let r: string | null = "x";
    try { r = await platformOperatorTenantId(admin); } catch { threw = true; }
    assert(!threw, "error path does not throw");
    assert(r === null, "error => null");
    // 8 (folded in): a second call after an error still re-queries (error not cached).
    await platformOperatorTenantId(admin);
    assert(counter.queries === 2, "errored null is NOT cached (re-queries next call)");
  }

  // 6. NEVER-PHANTOM: no input ever yields the stale phantom id.
  resetPlatformOperatorTenantCache();
  {
    const { admin } = mockAdmin({ data: { value: PHANTOM }, error: null });
    // The phantom happens to be a valid UUID shape, so the resolver WOULD return it
    // if it were the designated value — but it can only ever be returned if an
    // operator explicitly designates it, never as a code default. The guarantee we
    // assert is that the const is gone from the code (grep in verify step) and that
    // an UNSET/ERROR never yields it.
    const { admin: unsetAdmin } = mockAdmin({ data: null, error: null });
    resetPlatformOperatorTenantCache();
    const rUnset = await platformOperatorTenantId(unsetAdmin);
    assert(rUnset !== PHANTOM, "unset never yields the phantom id (no code default)");
    resetPlatformOperatorTenantCache();
    const { admin: errAdmin } = mockAdmin({ data: null, error: { message: "x" } });
    const rErr = await platformOperatorTenantId(errAdmin);
    assert(rErr !== PHANTOM, "error never yields the phantom id");
    void admin;
  }

  // 7. CACHE HIT: a valid resolve is served from cache within TTL (no re-query);
  //    reset forces a re-query.
  resetPlatformOperatorTenantCache();
  {
    const { admin, counter } = mockAdmin({ data: { value: VALID }, error: null });
    const a = await platformOperatorTenantId(admin);
    const b = await platformOperatorTenantId(admin);
    assert(a === VALID && b === VALID, "cache hit returns the same value");
    assert(counter.queries === 1, "cache hit does not re-query within TTL");
    resetPlatformOperatorTenantCache();
    await platformOperatorTenantId(admin);
    assert(counter.queries === 2, "reset forces a re-query");
  }

  if (failures > 0) { console.error(`\n${failures} assertion(s) FAILED`); process.exit(1); }
  console.log("\nAll platform-operator-tenant resolver smoke assertions passed.");
}

run();
