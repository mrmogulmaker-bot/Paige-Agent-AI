/**
 * Contract tests for the Deno edge-function ratchet.
 *
 *   node scripts/ci/__tests__/deno-edge-ratchet.test.mjs
 *
 * These exercise the pure comparator against synthetic legs, so each rule is proven in
 * isolation and a regression in one cannot be masked by another. The two that matter most
 * are the ones that keep a ratchet from becoming a rubber stamp: a resolution failure is
 * never ratchetable, and a candidate-file error is never hidden by an unchanged shared
 * import's inherited baseline.
 */
import { compareFunction, normalizeDiagnostics, looksLikeResolutionFailure } from "../deno-edge-ratchet.mjs";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
}

const FN = "demo-fn";
const ENTRY = `supabase/functions/${FN}/index.ts`;
const SHARED = "supabase/functions/_shared/helper.ts";

const d = (file, code, message = "boom") => ({ file, code, message });
const leg = (diagnostics = [], extra = {}) => ({ ran: true, present: true, resolutionFailure: false, diagnostics, ...extra });
const run = (base, head, changedFiles = []) => compareFunction({ fn: FN, base, head, changedFiles });

console.log("\ndiagnostic parsing");
{
  const raw = [
    "TS2769 [ERROR]: No overload matches this call.",
    "  Overload 1 of 2 gave the following error.",
    "    at file:///home/runner/work/repo/repo/supabase/functions/_shared/helper.ts:650:41",
    "",
    "TS2304 [ERROR]: Cannot find name 'ghost'.",
    "    at file:///home/runner/work/repo/repo/supabase/functions/demo-fn/index.ts:12:5",
    "Found 2 errors.",
  ].join("\n");
  const parsed = normalizeDiagnostics(raw);
  check("parses both diagnostics", parsed.length === 2, JSON.stringify(parsed));
  check("attributes each to its ORIGIN file, not the entry",
    parsed[0].file === SHARED && parsed[1].file === ENTRY, JSON.stringify(parsed.map((x) => x.file)));
  check("drops line and column so unrelated edits do not read as new",
    !JSON.stringify(parsed).includes("650") && !JSON.stringify(parsed).includes(":12:"), JSON.stringify(parsed));
  check("recognises a resolution failure",
    looksLikeResolutionFailure("error: Could not find a matching package for 'npm:zod@3.23.8'"));
  check("does not mistake an ordinary type error for one",
    !looksLikeResolutionFailure("TS2769 [ERROR]: No overload matches this call."));
}

console.log("\npass conditions");
{
  const same = [d(SHARED, "TS2769"), d(SHARED, "TS2769", "other")];
  check("identical baseline passes", run(leg(same), leg([...same])).length === 0);
  check("reduced baseline passes", run(leg(same), leg([same[0]])).length === 0);
  check("clean base and clean head passes", run(leg([]), leg([])).length === 0);
  check("absent on both sides passes (function deleted)",
    run({ ran: true, present: false, diagnostics: [] }, { ran: true, present: false, diagnostics: [] }).length === 0);
}

console.log("\nfail conditions");
{
  const baseOne = [d(SHARED, "TS2769")];

  const newErr = run(leg(baseOne), leg([...baseOne, d(ENTRY, "TS2304", "Cannot find name 'ghost'.")]));
  check("a NEW diagnostic fails", newErr.length > 0 && newErr.some((f) => f.includes("NEW diagnostic TS2304")), JSON.stringify(newErr));

  const more = run(leg(baseOne), leg([...baseOne, d(SHARED, "TS2769")]));
  check("an INCREASED count for an existing diagnostic fails",
    more.some((f) => f.includes("INCREASED")), JSON.stringify(more));

  const dirty = run(leg([]), leg([d(ENTRY, "TS2304")]));
  check("clean base, dirty head fails",
    dirty.some((f) => f.includes("base was CLEAN")), JSON.stringify(dirty));

  const resHead = run(leg(baseOne), leg([], { resolutionFailure: true }));
  check("a HEAD resolution failure fails and is never ratcheted",
    resHead.some((f) => f.includes("HEAD could not resolve")), JSON.stringify(resHead));

  // A BASE resolution failure means the baseline is unknowable. Crediting the base with
  // nothing is stricter than ratcheting: the head must be clean on its own merits. Failing
  // outright instead would deadlock - the repair can only ever land on a broken base.
  const resBaseClean = run(leg([], { resolutionFailure: true }), leg([]));
  check("an unknowable BASE with a CLEAN head passes (the repair case)",
    resBaseClean.length === 0, JSON.stringify(resBaseClean));

  const resBaseDirty = run(leg([d(SHARED, "TS2769")], { resolutionFailure: true }), leg([d(SHARED, "TS2769")]));
  check("an unknowable BASE credits NO baseline - a dirty head still fails",
    resBaseDirty.some((f) => f.includes("NEW diagnostic") || f.includes("base was CLEAN")), JSON.stringify(resBaseDirty));

  check("missing BASE evidence fails",
    run(undefined, leg([])).some((f) => f.includes("BASE evidence missing")));
  check("missing HEAD evidence fails",
    run(leg([]), { ran: false }).some((f) => f.includes("HEAD evidence missing")));
  check("a leg that did not execute is not treated as clean",
    run(leg([]), { ran: false, diagnostics: [] }).length > 0);
}

console.log("\nshared-dependency policy");
{
  const inherited = [d(SHARED, "TS2769")];

  check("an UNCHANGED shared import's diagnostics are inherited and pass",
    run(leg(inherited), leg([...inherited]), [ENTRY]).length === 0);

  const changedShared = run(leg(inherited), leg([...inherited]), [ENTRY, SHARED]);
  check("a CHANGED shared import is evaluated as candidate code, not baseline",
    changedShared.some((f) => f.includes("cannot be inherited")), JSON.stringify(changedShared));

  // The one that matters: an inherited baseline must never swallow a NEW error in the
  // candidate file itself.
  const both = run(leg(inherited), leg([...inherited, d(ENTRY, "TS2304", "Cannot find name 'ghost'.")]), [ENTRY]);
  check("an unchanged shared baseline does NOT hide a new candidate-file error",
    both.some((f) => f.includes("NEW diagnostic TS2304") && f.includes(ENTRY)), JSON.stringify(both));

  // ...and the inherited one is not itself reported, so the message stays actionable.
  check("and the inherited diagnostic is not reported as new",
    !both.some((f) => f.includes("TS2769")), JSON.stringify(both));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
