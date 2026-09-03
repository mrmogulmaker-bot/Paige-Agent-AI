// deno test supabase/functions/_shared/systems-check-runners/_business-context-readiness.test.ts
//
// Deno-native (not vitest): this module transitively imports systems-check-runner.ts's own
// import graph (elevenlabs/model-router/etc via _kit.ts's CheckResult type), which is fine under
// `deno check`/`deno test` but would drag the whole Deno-only edge-function graph into the
// browser tsconfig a vitest `@/../supabase/functions/...` import compiles under — that cascade is
// exactly what made the tsc-ratchet gate fail when this was first written as a vitest test. This
// stays a Deno test instead, in its own runtime, exactly where the module actually runs.
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { isConfirmed, readBusinessContextReadiness, type BusinessContextFieldStatus } from "./_business-context-readiness.ts";

const ROWS = [
  { field_key: "website", status: "owner_confirmed", source: "setup", as_of: "2026-09-01T00:00:00Z", reason: null },
  { field_key: "business_phone", status: "invalid_format", source: "setup", as_of: null, reason: null },
  { field_key: "industry", status: "needs_confirmation", source: null, as_of: null, reason: null },
  { field_key: "primary_business_email", status: "connection_sourced", source: "connections", as_of: null, reason: null },
];

// deno-lint-ignore no-explicit-any
function fakeAdmin(data: unknown, error: unknown = null): any {
  return { rpc: async () => ({ data, error }) };
}

Deno.test("readBusinessContextReadiness indexes rows by field_key", async () => {
  const readiness = await readBusinessContextReadiness(fakeAdmin(ROWS), "tenant-1");
  assertEquals(readiness.website.status, "owner_confirmed");
  assertEquals(readiness.business_phone.status, "invalid_format");
  assertEquals(readiness.industry.status, "needs_confirmation");
  assertEquals(readiness.primary_business_email.status, "connection_sourced");
});

Deno.test("readBusinessContextReadiness degrades to unavailable on a null tenantId, without calling the RPC", async () => {
  let called = false;
  // deno-lint-ignore no-explicit-any
  const admin: any = { rpc: async () => { called = true; return { data: ROWS, error: null }; } };
  const readiness = await readBusinessContextReadiness(admin, null);
  assertEquals(called, false);
  assertEquals(readiness.website.status, "unavailable");
  assertEquals(readiness.website.reason, "workspace not resolved");
  assertEquals(readiness.business_phone.status, "unavailable");
  assertEquals(readiness.industry.status, "unavailable");
  assertEquals(readiness.primary_business_email.status, "unavailable");
});

Deno.test("readBusinessContextReadiness throws on a real db error (§32 fail-loud)", async () => {
  let threw = false;
  try {
    await readBusinessContextReadiness(fakeAdmin(null, { message: "boom" }), "tenant-1");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("isConfirmed is true only for owner_confirmed", () => {
  const statuses: BusinessContextFieldStatus[] = [
    "owner_confirmed", "connection_sourced", "needs_confirmation", "invalid_format", "unavailable",
  ];
  assertEquals(statuses.map(isConfirmed), [true, false, false, false, false]);
});
