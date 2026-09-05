// deno test supabase/functions/_shared/systems-check-runners/revenue_tracking_configured.test.ts
//
// Deno-native for the same reason `_business-context-readiness.test.ts` is: this module lives in
// the Deno edge graph, and importing it from vitest would drag that graph into the browser
// tsconfig the tsc ratchet compiles.
//
// WHAT THESE PIN. This check was rewritten because it had been pointed at an owner-gated platform
// audit and therefore answered NOTHING for every tenant, forever. The two assertions most worth
// keeping are the ones that would let that class of mistake back in: the verdict must never read
// the deals table (a workspace that tracks correctly and has sold nothing must PASS), and an
// ARCHIVED won stage must FAIL (a stage no deal can enter is not revenue tracking, and it is the
// silent failure this check exists to catch).
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { run } from "./revenue_tracking_configured.ts";

type Row = { id: string; archived_at: string | null };

/** Minimal chainable stand-in for the two reads this runner makes. No I/O. */
// deno-lint-ignore no-explicit-any
function fakeAdmin(stages: Row[], dealCount: number, opts?: { stagesError?: unknown }): any {
  return {
    from(table: string) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        then(resolve: (v: unknown) => void) {
          if (table === "pipeline_stages") {
            resolve({ data: stages, error: opts?.stagesError ?? null });
          } else {
            resolve({ data: null, count: dealCount, error: null });
          }
        },
      };
      return builder;
    },
  };
}

// deno-lint-ignore no-explicit-any
const ctx = (admin: any): any => ({ admin, tenantId: "tenant-1", scope: "tenant" });
const LIVE: Row = { id: "s1", archived_at: null };
const ARCHIVED: Row = { id: "s2", archived_at: "2026-09-01T00:00:00Z" };

Deno.test("a live won stage passes", async () => {
  const r = await run(ctx(fakeAdmin([LIVE], 0)), {} as never);
  assertEquals(r.status, "pass");
  assertEquals((r.evidence as Record<string, unknown>).live_won_stages, 1);
});

Deno.test("THE HARD RULE: zero deals still passes — tracking correctly and having sold nothing is not a fault", async () => {
  const r = await run(ctx(fakeAdmin([LIVE], 0)), {} as never);
  assertEquals(r.status, "pass");
  // And the copy must not promise a figure: won_value_cents also needs actual_close_date and is a
  // 30-day rolling window, so a live won stage does not guarantee a non-zero number appears.
  assertEquals(/will fill in|as you win/i.test(r.interpretation ?? ""), false);
});

Deno.test("an ARCHIVED won stage fails — no deal can enter it, so no revenue can be recorded", async () => {
  const r = await run(ctx(fakeAdmin([ARCHIVED], 0)), {} as never);
  assertEquals(r.status, "fail");
  const ev = r.evidence as Record<string, unknown>;
  assertEquals(ev.live_won_stages, 0);
  assertEquals(ev.archived_won_stages, 1);
  assertEquals(/archived/i.test(r.interpretation ?? ""), true);
});

Deno.test("a live stage alongside an archived one still passes", async () => {
  const r = await run(ctx(fakeAdmin([ARCHIVED, LIVE], 3)), {} as never);
  assertEquals(r.status, "pass");
  const ev = r.evidence as Record<string, unknown>;
  assertEquals(ev.live_won_stages, 1);
  assertEquals(ev.archived_won_stages, 1);
  assertEquals(ev.deal_count, 3);
});

Deno.test("no won stage at all fails, and says so distinctly from the archived case", async () => {
  const r = await run(ctx(fakeAdmin([], 0)), {} as never);
  assertEquals(r.status, "fail");
  assertEquals((r.evidence as Record<string, unknown>).archived_won_stages, 0);
  assertEquals(/archived/i.test(r.interpretation ?? ""), false);
});

Deno.test("a db error fails LOUD as 'error', never a silent pass (§32)", async () => {
  const r = await run(ctx(fakeAdmin([], 0, { stagesError: { message: "boom", code: "42P01" } })), {} as never);
  assertEquals(r.status, "error");
  assertEquals((r.evidence as Record<string, unknown>).code, "42P01");
});

Deno.test("the verdict never reads the deals table — a huge deal count cannot rescue a missing stage", async () => {
  const r = await run(ctx(fakeAdmin([], 9999)), {} as never);
  assertEquals(r.status, "fail");
});
