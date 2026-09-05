import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract: a run that never finished is not the latest reading.
 *
 * These assertions exist because the clauses they pin are INVISIBLE TO EVERY OTHER GATE. Dropping
 * `completed_at IS NOT NULL` from either resolver still compiles, still replays in
 * `database-contract`, still passes every render test, and produces no error at runtime — it just
 * quietly makes the console blank itself during a scan and kills Approve until the scan ends, or
 * forever if the scan dies. That failure mode is the reason migration 20261203000000 shipped without
 * the clause in the first place.
 *
 * Both functions are replaced with `create or replace` in every migration that touches them, so the
 * live definition is whatever the newest migration says. A future replacement that copies from an
 * older file re-opens the hole. These tests fail if that happens.
 */

const latestRunMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261213000000_a_run_that_never_finished_is_not_the_latest_reading.sql"),
  "utf8",
);
const runner = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/systems-check-runner.ts"), "utf8");
const hook = readFileSync(resolve(process.cwd(), "src/hooks/useSystemsCheck.ts"), "utf8");
const tierMatrix = readFileSync(resolve(process.cwd(), "docs/doctrine/tier-matrix.md"), "utf8");

/** The body of one CREATE OR REPLACE FUNCTION block, so an assertion cannot be satisfied by a
 *  matching string that happens to live in the OTHER function or in a header comment. */
function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} must be declared in this migration`).toBeGreaterThan(-1);
  const end = sql.indexOf("$function$;", start);
  expect(end, `${name} must be terminated`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("systems_check_snapshot skips a run that never finished", () => {
  const body = functionBody(latestRunMigration, "systems_check_snapshot");

  it("requires the latest full sweep to have completed", () => {
    expect(body).toContain("AND completed_at IS NOT NULL");
  });

  it("keeps the completed filter INSIDE the latest-run subquery, alongside the other two conjuncts", () => {
    // Ordering is what makes it a filter on the pick rather than a filter on the result. All three
    // conjuncts must sit between the scope test and the ORDER BY that resolves "latest".
    const subquery = body.slice(body.indexOf("FROM public.paige_systems_check_run"), body.indexOf("LIMIT 1"));
    expect(subquery).toContain("selected_runner_keys IS NULL");
    expect(subquery).toContain("scan_flavor <> 'change_triggered'");
    expect(subquery).toContain("completed_at IS NOT NULL");
    expect(subquery).toContain("ORDER BY started_at DESC, created_at DESC, id DESC");
  });

  it("reports an in-flight scan instead of leaving the caller to infer it from silence", () => {
    expect(body).toContain("'scan_in_progress', v_scan_in_progress");
    // BOTH return paths — the has-a-run one and the no-run-yet one. A caller that only gets the key
    // on one branch has to treat `undefined` as meaningful, which is how a missing signal becomes a
    // false negative.
    expect(body.match(/'scan_in_progress', v_scan_in_progress/g)).toHaveLength(2);
  });

  it("time-bounds the in-flight test so a crashed run cannot claim to be running forever", () => {
    const exists = body.slice(body.indexOf("SELECT EXISTS ("), body.indexOf("INTO v_scan_in_progress"));
    expect(exists).toContain("completed_at IS NULL");
    expect(exists).toContain("started_at >= now() - interval '15 minutes'");
  });

  it("is a replace, not a drop — the ACLs and REVOKEs on these functions must survive", () => {
    expect(latestRunMigration).not.toMatch(/drop\s+function\s+public\.(systems_check_snapshot|approve_systems_check_finding)/i);
  });
});

describe("approve_systems_check_finding resolves latest the same way (§57)", () => {
  const body = functionBody(latestRunMigration, "approve_systems_check_finding");

  it("requires the run it resolves as latest to have completed", () => {
    expect(body).toContain("AND latest.completed_at IS NOT NULL");
  });

  it("still requires the finding's OWN run to have completed — the outer check is not replaced by the inner one", () => {
    // These guard different rows. The outer one asks whether the finding being approved belongs to a
    // finished run; the inner one asks which run is currently authoritative. Losing either re-opens a
    // different half of the bug.
    expect(body).toContain("r.completed_at IS NOT NULL");
    expect(body).toContain("AND latest.completed_at IS NOT NULL");
  });

  it("carries the identical three-conjunct predicate as the console, so the two cannot disagree", () => {
    const subquery = body.slice(body.indexOf("FROM public.paige_systems_check_run latest"), body.indexOf("LIMIT 1", body.indexOf("latest")));
    expect(subquery).toContain("latest.selected_runner_keys IS NULL");
    expect(subquery).toContain("latest.scan_flavor <> 'change_triggered'");
    expect(subquery).toContain("latest.completed_at IS NOT NULL");
  });
});

describe("the runner records partiality from the condition that causes it", () => {
  it("writes selected_runner_keys — the column existed for two weeks with nothing ever writing it", () => {
    expect(runner).toContain("selected_runner_keys:");
  });

  it("derives the marker from the same length guard that applies the filter, NOT from ?? null", () => {
    // `opts.runnerKeys ?? null` writes `[]` for an empty array. `[]` is falsy for the `.in(...)`
    // filter but non-NULL for the SQL predicate, so a run that scanned the FULL catalog would be
    // marked partial and become permanently invisible to both resolvers.
    expect(runner).toContain("opts.runnerKeys && opts.runnerKeys.length > 0 ? opts.runnerKeys : null");
    expect(runner).not.toContain("selected_runner_keys: opts.runnerKeys ?? null");
  });

  it("keeps the marker expression and the filter condition textually identical", () => {
    const filter = /if \(opts\.runnerKeys && opts\.runnerKeys\.length > 0\) \{/.test(runner);
    expect(filter, "the catalog filter must still be length-guarded").toBe(true);
  });
});

describe("the delta baseline ignores a run that never finished", () => {
  it("filters completed_at on the previous-run lookup", () => {
    const baseline = runner.slice(runner.indexOf("if (actionFiling === \"delta\")"), runner.indexOf("// Insert the run row up-front"));
    expect(baseline).toContain('.neq("scan_flavor", "change_triggered")');
    expect(baseline).toContain('.not("completed_at", "is", null)');
  });
});

describe("the hook plumbs the in-flight signal honestly", () => {
  it("exposes scanInProgress", () => {
    expect(hook).toContain("scanInProgress: boolean;");
    expect(hook).toContain("scanInProgress: query.data?.scanInProgress ?? false");
  });

  it("defaults a missing scan_in_progress to false, never to true", () => {
    // A database that has not taken 20261213000000 omits the key. Absence of evidence that a scan is
    // running must not render as a claim that one is (§13).
    expect(hook).toContain("scanInProgress: snap.scan_in_progress ?? false");
  });

  it("keeps scanPending distinct — it answers a different question", () => {
    expect(hook).toContain("scanPending: boolean;");
    expect(hook).toContain("scanPending,");
  });
});

describe("the tier matrix records who actually reaches the console (§66)", () => {
  it("no longer claims Sub-account reaches the five-part console", () => {
    const row = tierMatrix
      .split("\n")
      .find((l) => l.includes("The five-part console (attention"));
    expect(row, "the console row must exist").toBeTruthy();
    expect(row).toContain("— (tile)");
    expect(row).not.toMatch(/\|\s*✓\s*\|\s*✓\s*\|\s*—\s*\|\s*403\s*\|/);
  });

  it("records the surface a sub-account does reach", () => {
    expect(tierMatrix).toContain("`SystemsCheckTile` (the compact panel");
  });
});
