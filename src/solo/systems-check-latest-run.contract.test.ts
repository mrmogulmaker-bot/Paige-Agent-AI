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

/** TypeScript with comments removed. The SQL helper above strips `--`; TS comments are `//` and
 *  `/* *\/`, so using the SQL one on a .ts file lets an assertion be satisfied by the very prose
 *  that describes the clause it is checking for. That is not hypothetical: the §39 pass on this
 *  file caught exactly that mistake in the SQL assertions, and writing these TS assertions against
 *  `codeOnly` reintroduced it verbatim one commit later. Block comments go first, then whole-line
 *  and trailing `//` — the trailing strip deliberately runs only on lines with no quote character,
 *  so a `https://` inside a string literal survives. */
function tsCodeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .map((line) => (/["'`]/.test(line) ? line : line.replace(/\/\/.*$/, "")))
    .join("\n");
}


/** SQL with every `--` line comment removed, so an assertion cannot be satisfied by prose that
 *  merely QUOTES the clause it is checking for. The §39 pass on this file found exactly that: an
 *  assertion for `r.completed_at IS NOT NULL` passed with the executable clause deleted, because
 *  the migration's own explanatory comment contains the same words. */
function codeOnly(sql: string): string {
  return sql.split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");
}

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
    // ALL THREE return paths carry the key — has-a-run, no-run-yet, and the no-tenant early return.
    // A caller that gets it on only some branches has to treat `undefined` as meaningful, which is
    // how a missing signal becomes a false one. An earlier version of this assertion pinned exactly
    // two and would therefore have FAILED the fix that added the third: an assertion that blocks
    // its own repair. It now counts the key however it is supplied.
    expect(codeOnly(body).match(/'scan_in_progress'/g)).toHaveLength(3);
    expect(codeOnly(body)).toContain("'scan_in_progress', v_scan_in_progress");
  });

  it("carries the in-flight run's START TIME, not a bare boolean", () => {
    // Two shipped surfaces already say something about an in-flight run and both need the time to
    // say it. A boolean would have made the signal unusable without new copy, which is not this
    // seam's call to write (§00).
    expect(body).toContain("v_scan_in_progress timestamptz");
    expect(codeOnly(body)).toContain("SELECT r.started_at");
  });

  it("time-bounds the in-flight lookup so a crashed run cannot claim to be running forever", () => {
    const code = codeOnly(body);
    const lookup = code.slice(code.indexOf("INTO v_scan_in_progress"), code.indexOf("IF v_run_id IS NULL"));
    expect(lookup).toContain("r.completed_at IS NULL");
    expect(lookup).toContain("r.started_at >= now() - interval '15 minutes'");
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
    //
    // THE LEADING `AND` IS LOAD-BEARING and this assertion is why the whole file is comment-stripped
    // below. `r.completed_at IS NOT NULL` occurs twice in this function: once as executable SQL and
    // once inside a comment this same migration added to explain it. Asserting the bare string
    // passed even with the executable clause deleted — the comment defended itself. Verified by
    // mutation after the fix: deleting the clause now fails.
    expect(codeOnly(body)).toContain("AND r.completed_at IS NOT NULL");
    expect(codeOnly(body)).toContain("AND latest.completed_at IS NOT NULL");
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

  it("uses the SAME guard expression in the marker as in the catalog filter", () => {
    // Named for what it checks. It previously claimed to compare the two expressions and only
    // asserted that the filter's `if` existed.
    const guard = "opts.runnerKeys && opts.runnerKeys.length > 0";
    expect(runner, "the catalog filter must still be length-guarded").toContain(`if (${guard}) {`);
    expect(runner, "the marker must reuse that same guard").toContain(`${guard} ? opts.runnerKeys : null`);
  });
});

describe("a draft budget may never silently pause remediation filing", () => {
  // OWNER CONDITION, 2026-09-05: "confirming shouldFileAction stays derived from a source that is
  // NOT shouldDraft under the new budget — a paused draft must not silently pause remediation
  // filing. If your backstop enforces that split, ship #944."
  //
  // This IS that backstop, placed in code rather than promised in a task description.
  //
  // Today's coupling at systems-check-runner.ts:418 is
  //     const shouldFileAction = shouldDraft && scope === "tenant";
  // and it is harmless ONLY because nothing can currently switch `shouldDraft` off for cost
  // reasons. It is false exactly when the finding is not a new or newly-degraded fail — and in
  // that case no action is wanted either, so the two agree by accident of what they mean.
  //
  // The moment task #37 introduces a per-invocation draft budget, that same line silently converts
  // "we ran out of LLM budget" into "file no remediation" — a §58 removal wearing a cost control's
  // clothes, and invisible in review because not one character of it changed.
  //
  // ONE assertion, two branches, deliberately. It must NOT fail merely because a budget arrives —
  // that would block the very work it exists to protect. It fails only if a budget arrives AND the
  // coupling survives. While dormant it pins the exact line under guard, so a rename or refactor
  // trips it and forces a human to re-read this note rather than letting the check rot silently.

  const BUDGET_MARKERS = /draftBudget|draftsRemaining|DRAFT_BUDGET|draftsUsed|budgetExhausted/;

  it("keeps action filing independent of whether a draft was produced", () => {
    if (BUDGET_MARKERS.test(runner)) {
      expect(
        runner,
        "a draft budget now exists, so filing must gate on the finding's own status — never on shouldDraft",
      ).not.toMatch(/const\s+shouldFileAction\s*=\s*shouldDraft\b/);
      return;
    }
    // Dormant: no budget yet. Pin the guarded line so this cannot quietly stop checking.
    expect(
      runner,
      "the guarded line moved or changed shape — re-read the note above before adjusting this test",
    ).toContain('const shouldFileAction = shouldDraft && scope === "tenant";');
  });
});

describe("the delta baseline prefers a completed run but never degrades to nothing", () => {
  const baseline = runner.slice(
    runner.indexOf('if (actionFiling === "delta")'),
    runner.indexOf("// Insert the run row up-front"),
  );

  it("filters completed_at on the preferred lookup", () => {
    expect(baseline).toContain('.neq("scan_flavor", "change_triggered")');
    expect(baseline).toContain('.not("completed_at", "is", null)');
  });

  it("falls back to ANY run when no completed one exists, rather than to an empty baseline", () => {
    // An empty prevStatus makes every check read as newly-failing, so delta files a duplicate
    // remediation action for EVERY fail — the maximum, not a reduction. A partial map suppresses
    // some. Preferring completed and degrading to partial is strictly better than degrading to
    // nothing, and the degrade is reachable on the next new tenant whose onboarding run crashes.
    expect(baseline).toContain("baselineQuery(true)");
    expect(baseline).toContain("baselineQuery(false)");
    expect(baseline).toContain("if (!prevRun)");
  });
});

describe("the hook plumbs the in-flight signal honestly", () => {
  it("exposes the in-flight start time, typed as nullable rather than boolean", () => {
    expect(hook).toContain("scanInProgressSince: string | null;");
    expect(hook).toContain("scanInProgressSince: query.data?.scanInProgressSince ?? null");
  });

  it("defaults a missing scan_in_progress to null, never to a truthy value", () => {
    // A database that has not taken 20261213000000 omits the key. Absence of evidence that a scan is
    // running must not render as a claim that one is (§13).
    expect(hook).toContain("scanInProgressSince: snap.scan_in_progress ?? null");
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

/**
 * Contract: the draft budget bounds TIME inside the loop, and bounds nothing else.
 *
 * Every assertion here pins a decision that a measurement forced, and that a plausible-looking
 * refactor would quietly undo. Like the block above, none of them is covered by any other gate:
 * each mistake still compiles, still replays, still renders, and only shows up as a sweep that
 * dies mid-fleet again — the failure this work exists to end, which took five weeks to notice the
 * first time because nothing reads the response.
 *
 * The runner source is read as TEXT because the behaviour lives in an edge bundle that the browser
 * test runner cannot import. That is a real limit, so these are shape assertions, not behavioural
 * ones; the behavioural proof is the post-deploy drive.
 */
describe("the draft budget is a deadline inside the loop, not a count between tenants", () => {
  const code = tsCodeOnly(runner);

  it("charges the budget in elapsed milliseconds, never in draft count", () => {
    // 40 fast provider rejections cost 23.3s in total on prod while 4 real drafts cost 110s. A
    // count budget cannot tell those apart and would be wrong by ~200x in the direction that
    // defers cheap work while still admitting three thirty-second calls.
    expect(code, "the budget must be denominated in ms").toContain("draftBudgetMs");
    expect(code, "spend must accumulate as elapsed time").toContain("draftMsSpent +=");
    expect(code, "spend must be measured around the forge call").toContain("Date.now() - forgeStartedAt");
  });

  it("charges the budget in a finally, so a thrown forge still pays for the time it burned", () => {
    // Without this, a provider that fails slowly is free, and the budget is unbounded in exactly
    // the case it most needs to bind.
    expect(code).toMatch(/}\s*finally\s*{\s*draftMsSpent \+=/);
  });

  it("checks the budget before each forge rather than only between tenants", () => {
    // On 2026-08-12 the sweep STARTED the tenant that killed the invocation at elapsed 2.1s, so a
    // between-tenant threshold would never have fired. The check has to be per-check, in the loop.
    const loop = code.slice(code.indexOf("for (const row of rows)"));
    expect(loop, "the spend check must live inside the per-check loop").toContain("draftBudgetSpent");
    expect(loop).toContain("draftMsSpent >= draftBudgetMs");
  });

  it("never budgets an operator scan", () => {
    // An operator scan cannot call forge at all (prompt-forge is tenant-scoped), so it stores the
    // registry brief for free. Budgeting it would suppress a zero-cost brief for no saving — and
    // because operator findings also never file an action, the finding would end up with neither.
    expect(code).toMatch(/scope === "tenant" \? opts\.draftBudgetMs : undefined/);
  });

  it("leaves the budget opt-in, so every unbudgeted caller is unchanged", () => {
    // onboarding, change-triggered and operator all pass nothing and must stay byte-identical.
    expect(code).toMatch(/draftBudgetMs\?: number/);
    expect(code).toContain("draftBudgetMs !== undefined && draftMsSpent >= draftBudgetMs");
  });

  it("writes a deferred marker that carries no brief", () => {
    // SystemsCheckTile resolves `brief` ahead of `content`, so a marker carrying it would render an
    // internal instruction addressed to Paige under the heading "Paige drafted this fix". The tile
    // is fixed too; the marker omits the key so neither renderer can misread it if one regresses.
    const marker = code.slice(code.indexOf("draftedFix = { deferred: true"));
    const firstLine = marker.slice(0, marker.indexOf("\n"));
    expect(firstLine).toContain("deferred: true");
    expect(firstLine, "the deferred marker must not carry the internal brief").not.toContain("brief");
  });

  it("counts what it deferred, so a silent backlog is a number that moves", () => {
    // The first version of this asserted the FIELD NAMES, which the interface declaration and the
    // `: 0` initialisers keep alive whether or not anything ever increments them. Deleting all three
    // increments passed it — a test titled "a number that moves" that could not tell whether the
    // number moved. Pin the statements that do the moving.
    expect(code).toContain("summary.drafts_deferred++");
    expect(code).toContain("summary.drafts_attempted++");
    expect(code).toContain("summary.draft_ms_spent = draftMsSpent");
  });
});

describe("the scheduled sweep reports what it did not do", () => {
  const sweep = tsCodeOnly(
    readFileSync(resolve(process.cwd(), "supabase/functions/systems-check-run-scheduled/index.ts"), "utf8"),
  );

  it("keeps a fleet-wide draft pool, not only a per-tenant cap", () => {
    // The two kills were breached ACROSS tenants (08-11 spent ~181s on 3 drafts each for two
    // tenants), so a per-tenant cap alone cannot bound the invocation.
    expect(sweep).toContain("SWEEP_DRAFT_BUDGET_MS");
    expect(sweep).toContain("draftMsRemaining -= s.draft_ms_spent");
    expect(sweep).toMatch(/Math\.min\(TENANT_DRAFT_BUDGET_MS, draftMsRemaining\)/);
  });

  it("defers tenants it never started instead of being killed holding them", () => {
    expect(sweep).toContain("deferred_tenant_ids");
    expect(sweep).toContain("tenants_deferred");
    // Pin the GUARD, not the identifier. Wrapping it as `if (false && …)` left the constant
    // declaration and both response keys in place and passed the first version of this test, so the
    // one bound the whole worst case rests on could be disabled with the suite still green.
    expect(sweep).toContain("if (Date.now() - startedAt >= SWEEP_ELAPSED_BUDGET_MS) {");
    expect(sweep).toContain("deferredTenantIds.push(t.id);");
  });

  it("pins the three constants, because the worst case is arithmetic over their values", () => {
    // Unpinned, SWEEP_ELAPSED_BUDGET_MS could go 105_000 -> 175_000 and SWEEP_DRAFT_BUDGET_MS
    // 120_000 -> 600_000 with everything green, each breaking the stated worst case outright. A
    // deliberate change updates these lines and the comment block above them together.
    expect(sweep).toContain("const TENANT_DRAFT_BUDGET_MS = 30_000;");
    expect(sweep).toContain("const SWEEP_DRAFT_BUDGET_MS = 120_000;");
    expect(sweep).toContain("const SWEEP_ELAPSED_BUDGET_MS = 105_000;");
  });

  it("charges the fleet pool when a tenant throws, not only when it succeeds", () => {
    // The decrement lives in the try. A tenant that forges 63s and then throws would contribute
    // nothing, and the next tenant would receive a full grant — the pool would stop meaning what
    // its own comment says.
    expect(sweep).toContain("draftMsRemaining -= Date.now() - tenantStartedAt;");
  });

  it("bounds the single-tenant branch too, not just the batch", () => {
    // Same invocation, same ceiling, ten checks. Latent rather than live, but it is the one
    // remaining service-role-reachable way to kill this function.
    const single = sweep.slice(sweep.indexOf("if (body.tenant_id)"), sweep.indexOf("Batch mode"));
    expect(single).toContain("draftBudgetMs: SOLE_RUN_DRAFT_BUDGET_MS");
  });

  it("logs both truncations, because nothing reads the response body", () => {
    // Both producers are pg_net fire-and-forget; the response is discarded. A field only present
    // there is unobservable, so the edge log is the one place a human can currently see this.
    expect(sweep).toContain("console.warn");
    expect(sweep.match(/console\.warn/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // §13: a deferral fires on EITHER the per-tenant cap or the shared pool, and the commoner case
    // is the former — so the log must not announce the fleet pool as exhausted while most of it is
    // unspent, and must not claim "their actions were still filed", which is false on a retry tick.
    expect(sweep, "must not claim the fleet pool is exhausted").not.toContain("fleet draft budget exhausted");
    expect(sweep, "must not claim filing happened on a retry tick").not.toContain("Their actions were still filed.");
  });

  it("does not redefine tenants_scanned", () => {
    // It already means "tenants that completed a scan this tick", which stays true under an early
    // stop. Redefining it would silently change the meaning of the only field anyone might read.
    expect(sweep).toContain("tenants_scanned: scanned");
  });
});

describe("a deferred draft is postponed, not cancelled", () => {
  const code = tsCodeOnly(runner);

  it("carries the previous drafted-fix on the same baseline read", () => {
    // A second per-check lookup could resolve to a different run than the delta snapshot and the
    // two would disagree about the previous state — a false green, not a second opinion.
    const baseline = code.slice(
      code.indexOf('if (actionFiling === "delta")'),
      code.indexOf("const { data: runRow, error: runErr }"),
    );
    expect(baseline).toContain('.select("check_id, status, paige_drafted_fix")');
    expect(baseline).toContain("prevDraft[f.check_id]");
  });

  it("retries a draft the budget deferred last tick", () => {
    expect(code).toContain("previousDraftDeferred");
    expect(code).toMatch(/prevDraft\[row\.check_id\]\?\.deferred === true/);
    expect(code).toMatch(/prevStatus\[row\.check_id\] !== "fail" \|\| previousDraftDeferred/);
  });

  it("does NOT widen filing to match — a retry must never file a second action", () => {
    // THE defect this whole split exists to avoid. file_action does not dedupe, nothing drains the
    // queue, and prod already carries 8 duplicate (tenant, check) pairs from before any of this.
    // If filing followed the retry gate, every deferred check would file again on every tick.
    expect(code).toContain('const shouldFileAction = remediationNeeded && scope === "tenant";');
    expect(code, "filing must not key on the retry gate").not.toMatch(
      /shouldFileAction\s*=\s*draftNeeded/,
    );
    expect(code, "filing must not key on the deferral").not.toMatch(
      /shouldFileAction[^;]*previousDraftDeferred/,
    );
  });

  it("re-marks a still-deferred check so the chain survives another tick", () => {
    // Written on draftNeeded, not remediationNeeded: a check deferred twice must keep its marker,
    // or the second tick silently drops it out of the retry set.
    expect(code).toContain("if (draftNeeded && draftBudgetSpent) {");
  });
});

describe("every entry point that can forge more than once is bounded", () => {
  const onboarding = tsCodeOnly(
    readFileSync(resolve(process.cwd(), "supabase/functions/systems-check-run-onboarding/index.ts"), "utf8"),
  );
  const change = tsCodeOnly(
    readFileSync(resolve(process.cwd(), "supabase/functions/systems-check-run-change/index.ts"), "utf8"),
  );

  it("bounds onboarding, which forges the most per invocation of any flavour", () => {
    // Full 10-check catalog, actionFiling 'all', on a tenant where most checks fail. 3 of the 4
    // onboarding runs ever executed on prod died mid-loop.
    expect(onboarding).toContain("draftBudgetMs: SOLE_RUN_DRAFT_BUDGET_MS");
  });

  it("bounds change-triggered as well, because one surface does map to two runners", () => {
    // Written first as "leaves this unbounded on purpose, it cannot forge twice" — and it failed on
    // the first run, which is the only reason the claim was caught. `payments` maps to
    // ["payment_processor_connected", "payment_methods_declared"]; 16 of 17 surfaces are single, one
    // is not, and the generalisation came from reading the first few lines of the map.
    expect(change).toContain("draftBudgetMs: SOLE_RUN_DRAFT_BUDGET_MS");
  });

  it("keeps the map's shape visible, so a growing fan-out is never silent", () => {
    const entries = change.match(/^\s{2}[a-z_]+: \[[^\]]*\],$/gm) ?? [];
    expect(entries.length, "SURFACE_TO_RUNNERS should still be populated").toBeGreaterThan(5);
    const multi = entries.filter((e) => e.includes('", "'));
    expect(
      multi.map((e) => e.trim()),
      "a new multi-runner surface changes the per-invocation forge ceiling — re-check the budget",
    ).toEqual(['payments: ["payment_processor_connected", "payment_methods_declared"],']);
  });
});
