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

/**
 * Chainable stand-in for the two reads this runner makes. No I/O.
 *
 * IT RECORDS THE FILTERS, and that is the whole point of it. The first version of this double
 * declared `eq() { return builder; }` — arguments discarded — and `then()` branched only on the
 * table name. Every one of the seven tests below passed with BOTH `.eq("tenant_id", tenantId)`
 * calls AND `.eq("stage_type", "won")` deleted from the runner: proven by mutation, 7/7 green,
 * under CI's exact flags. A suite that cannot fail on a deleted §9 tenant filter is not a test of
 * this runner, and the §39 peer gate caught it — three reviewers independently.
 *
 * So: `eq()` captures, and `calls` is asserted. Anything that reads tenant data and is not scoped
 * by tenant_id is the single most expensive mistake this codebase makes (#86, #130, #172, #588),
 * and a service-role runner has no RLS underneath it to catch the omission.
 */
type Recorded = { table: string; filters: Array<[string, unknown]> };

// deno-lint-ignore no-explicit-any
function fakeAdmin(
  stages: Row[],
  dealCount: number,
  opts?: { stagesError?: unknown; calls?: Recorded[] },
): any {
  return {
    from(table: string) {
      const record: Recorded = { table, filters: [] };
      opts?.calls?.push(record);
      const builder = {
        select() { return builder; },
        eq(column: string, value: unknown) { record.filters.push([column, value]); return builder; },
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

/** Every read the runner made against `table`, as [column, value] pairs. */
const filtersOn = (calls: Recorded[], table: string): Array<[string, unknown]> =>
  calls.filter((c) => c.table === table).flatMap((c) => c.filters);

const hasFilter = (calls: Recorded[], table: string, column: string, value: unknown): boolean =>
  filtersOn(calls, table).some(([c, v]) => c === column && v === value);

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

// ─── The query shape itself. Everything above asserts what the runner CONCLUDES; these assert what
// it ASKED FOR, which is the half that was untested and the half where §9 lives. ────────────────

Deno.test("§9: EVERY read is scoped to the caller's tenant — the scan is service-role, so nothing else is", async () => {
  const calls: Recorded[] = [];
  await run(ctx(fakeAdmin([LIVE], 4, { calls })), {} as never);

  // Both tables, explicitly. The runner runs with the service-role key and therefore bypasses RLS
  // entirely: an unscoped read here returns every tenant's rows, and nothing downstream would say so.
  assertEquals(hasFilter(calls, "pipeline_stages", "tenant_id", "tenant-1"), true);
  assertEquals(hasFilter(calls, "deals", "tenant_id", "tenant-1"), true);

  // And no read may reach a table this check has no business in.
  assertEquals(
    calls.map((c) => c.table).filter((t, i, a) => a.indexOf(t) === i).sort(),
    ["deals", "pipeline_stages"],
  );
});

Deno.test("the stage read asks the database for won stages — it does not fetch everything and sort it out here", async () => {
  const calls: Recorded[] = [];
  await run(ctx(fakeAdmin([LIVE], 0, { calls })), {} as never);

  // Deleting this predicate would make every open stage count as a closing stage, and every tenant
  // with any pipeline at all would pass. The fixtures alone cannot catch that — they only ever
  // contain won stages, because the double answers by table name.
  assertEquals(hasFilter(calls, "pipeline_stages", "stage_type", "won"), true);
});
