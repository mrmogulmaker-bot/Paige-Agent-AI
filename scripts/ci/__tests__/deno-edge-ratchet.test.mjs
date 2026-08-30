/**
 * Contract tests for the Deno edge-function ratchet.
 *
 *   node scripts/ci/__tests__/deno-edge-ratchet.test.mjs
 *
 * Two layers, because one alone proved insufficient.
 *
 *   1. COMPARATOR tests drive the pure decision function against synthetic legs, so each
 *      rule is proven in isolation and a regression in one cannot be masked by another.
 *   2. RUNNER tests execute the real script end to end against a DISPOSABLE git repository
 *      holding a real edge-function candidate, with a controlled check tool on PATH. The
 *      first version of this gate passed its comparator tests while the runner it shipped
 *      with classified an unexplained nonzero exit as clean — a defect no comparator-only
 *      suite could see, because the runner is what builds the leg records the comparator
 *      is handed. A gate is only proven by the path that actually runs.
 *
 * The module is imported as a NAMESPACE on purpose: a missing export must surface as a
 * named failing assertion, not as a link-time crash that takes the whole suite with it.
 */
import * as R from "../deno-edge-ratchet.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "deno-edge-ratchet.mjs");

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
}
/** A required export that does not exist yet is a FAILING assertion, never a skip. */
function requireExport(name) {
  const present = typeof R[name] === "function";
  check(`export ${name}() exists`, present);
  return present ? R[name] : null;
}

// ---------------------------------------------------------------------------
// Comparator layer
// ---------------------------------------------------------------------------

const FN = "demo-fn";
const ENTRY = `supabase/functions/${FN}/index.ts`;
const SHARED = "supabase/functions/_shared/helper.ts";

const d = (file, code, message = "boom") => ({ file, code, message });

/** A leg must state its outcome explicitly. There is no defaulting to clean. */
const clean = (extra = {}) => ({ ran: true, present: true, outcome: "clean", diagnostics: [], ...extra });
const dirty = (diagnostics, extra = {}) => ({ ran: true, present: true, outcome: "diagnostics", diagnostics, ...extra });
const resolutionFailure = (extra = {}) => ({ ran: true, present: true, outcome: "resolution-failure", diagnostics: [], ...extra });
const unclassified = (extra = {}) => ({ ran: true, present: true, outcome: "unclassified", exit: 1, diagnostics: [], raw: "error: Exiting due to internal failure", ...extra });
const absent = (extra = {}) => ({ ran: true, present: false, outcome: "absent", diagnostics: [], ...extra });
const abandoned = (extra = {}) => ({ ran: false, present: true, outcome: "abandoned", diagnostics: [], ...extra });

const run = (base, head, changedFiles = [], depsMatch = true) =>
  typeof R.compareFunction === "function" ? R.compareFunction({ fn: FN, base, head, changedFiles, depsMatch }) : ["compareFunction missing"];

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
  const parsed = R.normalizeDiagnostics(raw);
  check("parses both diagnostics", parsed.length === 2, JSON.stringify(parsed));
  check("attributes each to its ORIGIN file, not the entry",
    parsed[0].file === SHARED && parsed[1].file === ENTRY, JSON.stringify(parsed.map((x) => x.file)));
  check("drops line and column so unrelated edits do not read as new",
    !JSON.stringify(parsed).includes("650") && !JSON.stringify(parsed).includes(":12:"), JSON.stringify(parsed));
  check("recognises a resolution failure",
    R.looksLikeResolutionFailure("error: Could not find a matching package for 'npm:zod@3.23.8'"));
  check("does not mistake an ordinary type error for one",
    !R.looksLikeResolutionFailure("TS2769 [ERROR]: No overload matches this call."));

  // An unattributed diagnostic must never inherit another unattributed diagnostic.
  const noLoc = ["TS2769 [ERROR]: No overload matches this call.", "", "TS2769 [ERROR]: No overload matches this call."].join("\n");
  const un = R.normalizeDiagnostics(noLoc);
  check("two unattributed diagnostics do not collapse onto one key",
    un.length === 2 && un[0].file !== un[1].file, JSON.stringify(un));

  // Both legs live under different worktree roots, so a repo file outside supabase/functions/
  // must key identically on each side or it always reads as NEW.
  const outsideBase = R.normalizeDiagnostics("TS2304 [ERROR]: Cannot find name 'z'.\n    at file:///tmp/wt/base/src/lib/x.ts:3:4", "/tmp/wt/base");
  const outsideHead = R.normalizeDiagnostics("TS2304 [ERROR]: Cannot find name 'z'.\n    at file:///tmp/wt/head/src/lib/x.ts:9:4", "/tmp/wt/head");
  check("a repo file outside supabase/functions keys the same under both worktree roots",
    outsideBase[0]?.file === outsideHead[0]?.file && outsideBase[0]?.file === "src/lib/x.ts",
    JSON.stringify([outsideBase[0], outsideHead[0]]));

  const parseReportedErrorCount = requireExport("parseReportedErrorCount");
  if (parseReportedErrorCount) {
    check("reads deno's own error tally", parseReportedErrorCount(raw) === 2, String(parseReportedErrorCount(raw)));
    check("reads the singular form", parseReportedErrorCount("Found 1 error.") === 1);
    check("returns null when deno reported no tally", parseReportedErrorCount("boom") === null);
  }
}

console.log("\nleg classification (the runner's half of the contract)");
{
  const classifyLeg = requireExport("classifyLeg");
  if (classifyLeg) {
    const tsRaw = "TS2304 [ERROR]: Cannot find name 'ghost'.\n    at file:///r/supabase/functions/demo-fn/index.ts:1:1\nFound 1 error.";

    check("exit 0 with no output is clean",
      classifyLeg({ present: true, exit: 0, raw: "" }).outcome === "clean");

    check("nonzero exit with parsed diagnostics matching deno's tally is `diagnostics`",
      classifyLeg({ present: true, exit: 1, raw: tsRaw }).outcome === "diagnostics");

    check("nonzero exit with a resolution marker is `resolution-failure`",
      classifyLeg({ present: true, exit: 1, raw: "error: Could not find a matching package for 'npm:zod'" }).outcome === "resolution-failure");

    // THE DEFECT. An unexplained nonzero exit means the check did not produce a verdict we
    // understand. Anything but `unclassified` here is a fail-open.
    check("an UNEXPLAINED nonzero exit is `unclassified`, never clean",
      classifyLeg({ present: true, exit: 1, raw: "error: Exiting due to internal failure" }).outcome === "unclassified",
      JSON.stringify(classifyLeg({ present: true, exit: 1, raw: "error: Exiting due to internal failure" })));

    check("a nonzero exit with NO output at all is `unclassified`, never clean",
      classifyLeg({ present: true, exit: 2, raw: "" }).outcome === "unclassified");

    check("exit 0 that nonetheless emitted diagnostics is `unclassified` (a contradiction is not a pass)",
      classifyLeg({ present: true, exit: 0, raw: tsRaw }).outcome === "unclassified");

    check("a parsed count that disagrees with deno's tally is `unclassified`",
      classifyLeg({ present: true, exit: 1, raw: tsRaw.replace("Found 1 error.", "Found 7 errors.") }).outcome === "unclassified");

    check("a signal-killed run is `abandoned` and did not run",
      (() => { const l = classifyLeg({ present: true, exit: null, signal: "SIGKILL", raw: "partial" }); return l.outcome === "abandoned" && l.ran === false; })());

    check("a spawn failure is `abandoned` and did not run",
      (() => { const l = classifyLeg({ present: true, spawnFailed: true, raw: "ENOENT" }); return l.outcome === "abandoned" && l.ran === false; })());

    check("a tree/worktree presence disagreement is `unclassified`, never `absent`",
      classifyLeg({ present: true, mismatch: "tree says present, worktree says absent" }).outcome === "unclassified");

    check("a missing entry file is `absent`, and absent is not clean",
      (() => { const l = classifyLeg({ present: false }); return l.outcome === "absent" && l.present === false; })());
  }
}

console.log("\npass conditions");
{
  const same = [d(SHARED, "TS2769"), d(SHARED, "TS2769", "other")];
  check("identical baseline passes", run(dirty(same), dirty([...same])).length === 0);
  check("reduced baseline passes", run(dirty(same), dirty([same[0]])).length === 0);
  check("clean base and clean head passes", run(clean(), clean()).length === 0);
  check("absent on both sides passes (function deleted before this PR)", run(absent(), absent()).length === 0);
}

console.log("\nfail conditions");
{
  const baseOne = [d(SHARED, "TS2769")];

  const newErr = run(dirty(baseOne), dirty([...baseOne, d(ENTRY, "TS2304", "Cannot find name 'ghost'.")]));
  check("a NEW diagnostic fails", newErr.some((f) => f.includes("NEW diagnostic TS2304")), JSON.stringify(newErr));

  check("an INCREASED count for an existing diagnostic fails",
    run(dirty(baseOne), dirty([...baseOne, d(SHARED, "TS2769")])).some((f) => f.includes("INCREASED")));

  check("clean base, dirty head fails",
    run(clean(), dirty([d(ENTRY, "TS2304")])).some((f) => f.includes("CLEAN")));

  check("a HEAD resolution failure fails and is never ratcheted",
    run(dirty(baseOne), resolutionFailure()).some((f) => f.includes("HEAD could not resolve")));

  const resBaseClean = run(resolutionFailure(), clean());
  check("an unknowable BASE with a CLEAN head passes (the repair case)",
    resBaseClean.length === 0, JSON.stringify(resBaseClean));

  check("an unknowable BASE credits NO baseline - a dirty head still fails",
    run(resolutionFailure({ diagnostics: [d(SHARED, "TS2769")] }), dirty([d(SHARED, "TS2769")])).length > 0);

  check("missing BASE evidence fails", run(undefined, clean()).some((f) => f.includes("BASE evidence missing")));
  check("missing HEAD evidence fails", run(clean(), { ran: false }).some((f) => f.includes("HEAD evidence missing")));
  check("a leg that did not execute is not treated as clean", run(clean(), { ran: false, diagnostics: [] }).length > 0);
}

console.log("\nunclassified exits fail closed (the repaired defect)");
{
  const baseOne = [d(SHARED, "TS2769")];

  // 1. Every unclassified nonzero head exit fails closed.
  const headU = run(dirty(baseOne), unclassified());
  check("an UNCLASSIFIED head fails closed",
    headU.length > 0 && headU.some((f) => /unclassified/i.test(f)), JSON.stringify(headU));

  check("an UNCLASSIFIED head fails even when the base is clean",
    run(clean(), unclassified()).length > 0);

  check("an UNCLASSIFIED head fails even when the base is also unclassified",
    run(unclassified(), unclassified()).length > 0);

  check("an ABANDONED head fails closed", run(clean(), abandoned()).length > 0);

  // 2. An unclassified base earns no baseline credit and needs a genuinely clean head.
  check("an UNCLASSIFIED base credits NO baseline - an inherited-looking head still fails",
    run(unclassified({ diagnostics: baseOne }), dirty([...baseOne])).length > 0,
    JSON.stringify(run(unclassified({ diagnostics: baseOne }), dirty([...baseOne]))));

  const uBaseClean = run(unclassified(), clean());
  check("an UNCLASSIFIED base with a genuinely CLEAN head passes",
    uBaseClean.length === 0, JSON.stringify(uBaseClean));

  check("an UNCLASSIFIED base names itself in the verdict so a reviewer can see the credit was withheld",
    run(unclassified(), dirty([d(ENTRY, "TS2304")])).some((f) => /unclassified|no baseline/i.test(f)));

  check("an ABANDONED base fails closed rather than crediting nothing and passing",
    run(abandoned(), clean()).length > 0);

  // 3. A leg record with no stated outcome is never assumed clean.
  check("a leg with NO stated outcome fails closed",
    run({ ran: true, present: true, diagnostics: [] }, clean()).length > 0,
    JSON.stringify(run({ ran: true, present: true, diagnostics: [] }, clean())));

  check("a leg with an UNRECOGNISED outcome fails closed",
    run(clean(), { ran: true, present: true, outcome: "something-new", diagnostics: [] }).length > 0);
}

console.log("\nnewly added and deleted functions");
{
  check("a NEW function (absent on base) that is clean on head passes",
    run(absent(), clean()).length === 0);

  const newDirty = run(absent(), dirty([d(ENTRY, "TS2304", "Cannot find name 'ghost'.")]));
  check("a NEW function that arrives with diagnostics fails",
    newDirty.length > 0, JSON.stringify(newDirty));
  check("and the verdict says the function is new rather than mislabelling the base as clean",
    newDirty.some((f) => /did not exist|new function/i.test(f)), JSON.stringify(newDirty));

  check("a DELETED function (absent on head) passes even when the base was dirty",
    run(dirty([d(ENTRY, "TS2304")]), absent()).length === 0);

  check("a NEW function whose head could not resolve still fails",
    run(absent(), resolutionFailure()).length > 0);

  check("a NEW function whose head is unclassified still fails",
    run(absent(), unclassified()).length > 0);
}

console.log("\nshared-dependency policy");
{
  const inherited = [d(SHARED, "TS2769")];

  check("an UNCHANGED shared import's diagnostics are inherited and pass",
    run(dirty(inherited), dirty([...inherited]), [ENTRY]).length === 0);

  check("a CHANGED shared import is evaluated as candidate code, not baseline",
    run(dirty(inherited), dirty([...inherited]), [ENTRY, SHARED]).some((f) => f.includes("cannot be inherited")));

  const both = run(dirty(inherited), dirty([...inherited, d(ENTRY, "TS2304", "Cannot find name 'ghost'.")]), [ENTRY]);
  check("an unchanged shared baseline does NOT hide a new candidate-file error",
    both.some((f) => f.includes("NEW diagnostic TS2304") && f.includes(ENTRY)), JSON.stringify(both));
  check("and the inherited diagnostic is not reported as new",
    !both.some((f) => f.includes("TS2769")), JSON.stringify(both));
}

console.log("\ndependency-input parity");
{
  const inherited = [d(SHARED, "TS2769")];
  check("matching dependency inputs allow inheritance",
    run(dirty(inherited), dirty([...inherited]), [ENTRY], true).length === 0);
  const drift = run(dirty(inherited), dirty([...inherited]), [ENTRY], false);
  check("DIFFERING dependency inputs credit no baseline - the same diagnostic no longer inherits",
    drift.length > 0, JSON.stringify(drift));
  check("and the verdict names the dependency drift",
    drift.some((f) => /dependency inputs/i.test(f)), JSON.stringify(drift));
  check("differing dependency inputs with a genuinely clean head still passes",
    run(dirty(inherited), clean(), [ENTRY], false).length === 0);
}

console.log("\ndependency fingerprint is coupled to the flags the check actually passes");
{
  // The fingerprint must list ONLY inputs the invocation consumes. Fingerprinting an input the
  // command explicitly disables withdraws inherited credit for a file the compiler never reads,
  // failing a legitimate PR. Fingerprinting one it DOES consume too little would let a real
  // dependency change be waved through as inherited. Both directions are pinned here so a
  // future edit to either side cannot silently change how anything is graded.
  const DEP_INPUTS = R.DEP_INPUTS;
  const CHECK_FLAGS = R.CHECK_FLAGS;

  check("export DEP_INPUTS exists", Array.isArray(DEP_INPUTS), JSON.stringify(DEP_INPUTS));
  check("export CHECK_FLAGS exists", Array.isArray(CHECK_FLAGS), JSON.stringify(CHECK_FLAGS));
  check("export checkArgv() exists", typeof R.checkArgv === "function");

  if (Array.isArray(DEP_INPUTS) && Array.isArray(CHECK_FLAGS)) {
    check("the check still runs with --no-lock (behaviour preserved)",
      CHECK_FLAGS.includes("--no-lock"), JSON.stringify(CHECK_FLAGS));

    // THE INVARIANT, stated in both directions.
    const lockDisabled = CHECK_FLAGS.includes("--no-lock");
    const lockFingerprinted = DEP_INPUTS.includes("deno.lock");
    check("deno.lock is fingerprinted IF AND ONLY IF the lockfile is not disabled",
      lockFingerprinted === !lockDisabled,
      `--no-lock=${lockDisabled} but deno.lock in DEP_INPUTS=${lockFingerprinted}`);

    // Exact set, so any future add or removal has to be a deliberate edit here too.
    check("DEP_INPUTS is exactly the consumed Deno config inputs",
      JSON.stringify(DEP_INPUTS) === JSON.stringify(["deno.json", "deno.jsonc", "import_map.json"]),
      JSON.stringify(DEP_INPUTS));

    check("no npm lockfile is fingerprinted (edge functions carry no node_modules)",
      !DEP_INPUTS.includes("package-lock.json") && !DEP_INPUTS.includes("package.json"),
      JSON.stringify(DEP_INPUTS));
  }

  if (typeof R.checkArgv === "function") {
    check("checkArgv() is built from CHECK_FLAGS and ends with the entry",
      JSON.stringify(R.checkArgv("supabase/functions/x/index.ts")) ===
        JSON.stringify(["check", ...(R.CHECK_FLAGS ?? []), "supabase/functions/x/index.ts"]),
      JSON.stringify(R.checkArgv("supabase/functions/x/index.ts")));

    // The runner must invoke through checkArgv, not a second inlined copy of the flags -
    // otherwise the invariant above guards a constant nothing actually uses.
    const src = readFileSync(SCRIPT, "utf8");
    check("the runner spawns via checkArgv(), with no inlined second copy of the flags",
      /spawnSync\("deno", checkArgv\(entry\)/.test(src) && (src.match(/"--no-lock"/g) ?? []).length === 1,
      `inlined --no-lock occurrences: ${(src.match(/"--no-lock"/g) ?? []).length}`);
  }
}

console.log("\nentry-file inheritance is deliberate and bounded");
{
  // The entry file is EXEMPT from the changed-file rule on purpose: making whoever touches a
  // debt-carrying index.ts clear that debt is exactly the tax this ratchet exists to remove.
  // Pinned here so the exemption is a decision on record, not an accident nobody tested.
  const own = [d(ENTRY, "TS2304", "Cannot find name 'x'.")];
  check("an entry-file diagnostic is inherited even though the entry file changed",
    run(dirty(own), dirty([...own]), [ENTRY]).length === 0);
  check("but a SECOND copy of it still fails the count rule",
    run(dirty(own), dirty([...own, d(ENTRY, "TS2304", "Cannot find name 'x'.")]), [ENTRY])
      .some((f) => f.includes("INCREASED")));
  check("and a different diagnostic in the same changed entry file is NEW",
    run(dirty(own), dirty([...own, d(ENTRY, "TS2322", "Type 'a' is not assignable to type 'b'.")]), [ENTRY])
      .some((f) => f.includes("NEW diagnostic TS2322")));
}

console.log("\nmultiple affected functions");
{
  if (typeof R.compareAll === "function") {
    const rec = (fn, base, head) => ({ fn, base, head, changedFiles: [] });
    const many = R.compareAll({ functions: [
      rec("fn-a", clean(), clean()),
      rec("fn-b", dirty([d(SHARED, "TS2769")]), dirty([d(SHARED, "TS2769")])),
      rec("fn-c", clean(), dirty([d("supabase/functions/fn-c/index.ts", "TS2304", "Cannot find name 'ghost'.")])),
    ] });
    check("one failing function among several fails the whole run", many.ok === false);
    check("and the failing function is named", many.failures.some((f) => f.startsWith("fn-c:")), JSON.stringify(many.failures));
    check("while the passing ones are not", !many.failures.some((f) => f.startsWith("fn-a:") || f.startsWith("fn-b:")), JSON.stringify(many.failures));

    const oneUnclassified = R.compareAll({ functions: [rec("fn-a", clean(), clean()), rec("fn-b", clean(), unclassified())] });
    check("a single unclassified function among several fails the whole run", oneUnclassified.ok === false);

    check("an empty function list is vacuously ok HERE - the set-size binding lives in main(), not the comparator",
      R.compareAll({ functions: [] }).ok === true);
  }
}

console.log("\nevidence artifacts must exist");
{
  const verifyEvidenceArtifacts = requireExport("verifyEvidenceArtifacts");
  if (verifyEvidenceArtifacts) {
    const dir = mkdtempSync(path.join(tmpdir(), "ratchet-evidence-"));
    const evidence = { baseRef: "a", headRef: "b", functions: [{ fn: "fn-a", base: clean(), head: clean() }] };
    try {
      check("missing evidence.json FAILS rather than warning",
        verifyEvidenceArtifacts(dir, evidence).length > 0, JSON.stringify(verifyEvidenceArtifacts(dir, evidence)));

      writeFileSync(path.join(dir, "evidence.json"), JSON.stringify(evidence));
      check("a missing per-leg transcript FAILS",
        verifyEvidenceArtifacts(dir, evidence).some((f) => /fn-a/.test(f)), JSON.stringify(verifyEvidenceArtifacts(dir, evidence)));

      writeFileSync(path.join(dir, "fn-a.base.txt"), "");
      check("one present transcript is not enough - the other is still missing",
        verifyEvidenceArtifacts(dir, evidence).length > 0);

      writeFileSync(path.join(dir, "fn-a.head.txt"), "");
      check("a complete evidence set passes",
        verifyEvidenceArtifacts(dir, evidence).length === 0, JSON.stringify(verifyEvidenceArtifacts(dir, evidence)));

      writeFileSync(path.join(dir, "evidence.json"), "{not json");
      check("an unreadable evidence.json FAILS",
        verifyEvidenceArtifacts(dir, evidence).some((f) => /parse|read/i.test(f)));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
}

// ---------------------------------------------------------------------------
// Runner layer — the real script, a disposable repository, a real candidate.
// ---------------------------------------------------------------------------

const SHIM = `#!/usr/bin/env node
// Controlled stand-in for \`deno check\`. Scenarios are keyed per leg by the marker the
// candidate file carries, so base and head can behave differently in one run.
const fs = require("fs");
const args = process.argv.slice(2);
const entry = args[args.length - 1];
let body = "";
try { body = fs.readFileSync(entry, "utf8"); } catch { }
const marker = (/\\/\\/ MARKER:(\\S+)/.exec(body) || [])[1] || "none";
fs.appendFileSync(process.env.RATCHET_SHIM_LOG, entry + " :: " + marker + "\\n");
const plan = JSON.parse(process.env.RATCHET_SHIM_PLAN || "{}")[marker] || { exit: 0, out: "" };
if (plan.signal) { process.kill(process.pid, plan.signal); }
if (plan.out) process.stderr.write(plan.out + "\\n");
process.exit(plan.exit || 0);
`;

function makeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "ratchet-repo-"));
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  return { root, git };
}
function writeFn(root, fn, marker, extra = "") {
  const dir = path.join(root, "supabase", "functions", fn);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.ts"), `// MARKER:${marker}\nexport const handler = () => new Response("ok");\n${extra}\n`);
}
function makeShim(withDeno = true) {
  const dir = mkdtempSync(path.join(tmpdir(), "ratchet-shim-"));
  if (withDeno) {
    const p = path.join(dir, "deno");
    writeFileSync(p, SHIM);
    chmodSync(p, 0o755);
  }
  return dir;
}
/** Run the real runner. Returns { status, stdout, out } — never throws on a nonzero exit. */
function runRunner({ repo, base, head, fns, plan, shimDir, out, extraEnv = {}, cwd, expect }) {
  const outDir = out ?? path.join(repo, "evidence");
  const log = path.join(repo, "shim.log");
  writeFileSync(log, "");
  const args = [SCRIPT, "--base", base, "--head", head, "--functions", fns.join(","), "--out", outDir];
  if (expect !== undefined) args.push("--expect", expect);
  const env = {
    ...process.env,
    PATH: `${shimDir}${path.delimiter}${process.env.PATH}`,
    RATCHET_SHIM_PLAN: JSON.stringify(plan ?? {}),
    RATCHET_SHIM_LOG: log,
    ...extraEnv,
  };
  let status = 0, stdout = "", stderr = "";
  try {
    stdout = execFileSync(process.execPath, args, { cwd: cwd ?? repo, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    status = e.status ?? -1; stdout = e.stdout ?? ""; stderr = e.stderr ?? "";
  }
  let evidence = null;
  try { evidence = JSON.parse(readFileSync(path.join(outDir, "evidence.json"), "utf8")); } catch { }
  return { status, stdout, stderr, outDir, evidence, shimLog: existsSync(log) ? readFileSync(log, "utf8") : "" };
}

console.log("\nrunner — real script, disposable repository, real candidate");
{
  const FNX = "disposable-ratchet-probe";
  const shim = makeShim();
  const repos = [];
  const build = (headMarker = "head", baseMarker = "base", opts = {}) => {
    const { root, git } = makeRepo();
    repos.push(root);
    writeFn(root, FNX, baseMarker);
    git("add", "-A"); git("commit", "-qm", "base");
    const baseSha = git("rev-parse", "HEAD").trim();
    if (opts.deleteOnHead) rmSync(path.join(root, "supabase", "functions", FNX), { recursive: true, force: true });
    else writeFn(root, FNX, headMarker, opts.extra ?? "");
    git("add", "-A"); git("commit", "-qm", "head");
    const headSha = git("rev-parse", "HEAD").trim();
    return { root, git, baseSha, headSha };
  };

  try {
    // -- clean / clean -----------------------------------------------------
    {
      const { root, baseSha, headSha } = build();
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], plan: {}, shimDir: shim });
      check("runner: clean base and clean head exits 0", r.status === 0, `status=${r.status} ${r.stdout}${r.stderr}`);
      check("runner: writes evidence.json", r.evidence !== null);
      check("runner: writes both per-leg transcripts",
        existsSync(path.join(r.outDir, `${FNX}.base.txt`)) && existsSync(path.join(r.outDir, `${FNX}.head.txt`)));
      check("runner: checked the candidate on both legs", (r.shimLog.match(/MARKER|::/g) ?? []).length >= 2, r.shimLog);
    }

    // -- THE DEFECT: unexplained nonzero head exit -------------------------
    {
      const { root, baseSha, headSha } = build();
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], shimDir: shim,
        plan: { head: { exit: 1, out: "error: Exiting due to internal failure" } } });
      check("runner: an UNEXPLAINED nonzero head exit FAILS (does not pass)",
        r.status !== 0, `status=${r.status}\n${r.stdout}\n${r.stderr}`);
      check("runner: and says the head was unclassified",
        /unclassified/i.test(r.stdout + r.stderr), r.stdout + r.stderr);
      check("runner: and records the head outcome in the evidence",
        r.evidence?.functions?.[0]?.head?.outcome === "unclassified", JSON.stringify(r.evidence?.functions?.[0]?.head));
    }

    {
      const { root, baseSha, headSha } = build();
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], shimDir: shim,
        plan: { head: { exit: 3, out: "" } } });
      check("runner: a silent nonzero head exit FAILS", r.status !== 0, `status=${r.status}\n${r.stdout}`);
    }

    // -- unclassified base -------------------------------------------------
    {
      const { root, baseSha, headSha } = build();
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], shimDir: shim,
        plan: { base: { exit: 1, out: "error: Exiting due to internal failure" } } });
      check("runner: an unclassified BASE with a genuinely clean head passes",
        r.status === 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
      check("runner: and the withheld credit is recorded",
        r.evidence?.functions?.[0]?.base?.outcome === "unclassified", JSON.stringify(r.evidence?.functions?.[0]?.base));
    }
    {
      const { root, baseSha, headSha } = build();
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], shimDir: shim,
        plan: {
          base: { exit: 1, out: "error: Exiting due to internal failure" },
          head: { exit: 1, out: `TS2304 [ERROR]: Cannot find name 'ghost'.\n    at file:///x/supabase/functions/${FNX}/index.ts:1:1\nFound 1 error.` },
        } });
      check("runner: an unclassified BASE gives NO credit - a dirty head fails",
        r.status !== 0, `status=${r.status}\n${r.stdout}`);
    }

    // -- abandonment -------------------------------------------------------
    {
      // A PATH carrying git and node but NO deno, so the check tool genuinely cannot spawn.
      // Built explicitly rather than by emptying PATH, which would also hide git and prove
      // nothing about how a missing CHECK TOOL is classified.
      const { root, baseSha, headSha } = build();
      const bare = makeShim(false);
      let gitDir = "/usr/bin";
      try { gitDir = path.dirname(execFileSync("which", ["git"], { encoding: "utf8" }).trim()); } catch { }
      const noDenoPath = [bare, gitDir, path.dirname(process.execPath)].join(path.delimiter);
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], shimDir: bare,
        extraEnv: { PATH: noDenoPath } });
      check("runner: a missing check tool FAILS rather than passing as clean",
        r.status !== 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
      check("runner: and the leg is recorded abandoned, never clean",
        r.evidence?.functions?.[0]?.head?.outcome === "abandoned",
        JSON.stringify(r.evidence?.functions?.[0]?.head?.outcome));
      rmSync(bare, { recursive: true, force: true });
    }
    {
      const { root, baseSha, headSha } = build();
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], shimDir: shim,
        plan: { head: { signal: "SIGKILL" } } });
      check("runner: a signal-killed head leg FAILS as abandoned",
        r.status !== 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
      check("runner: evidence is still written for an abandoned leg", r.evidence !== null);
      check("runner: and it is recorded as abandoned, not clean",
        r.evidence?.functions?.[0]?.head?.outcome === "abandoned",
        JSON.stringify(r.evidence?.functions?.[0]?.head));
    }

    // -- exact-head binding ------------------------------------------------
    {
      const { root, git, baseSha, headSha } = build("head", "base");
      // Simulate GitHub's default pull_request checkout: the working tree is a THIRD commit
      // (the merge commit), not the PR head. The head leg must still check the head SHA.
      writeFn(root, FNX, "mergecommit");
      git("add", "-A"); git("commit", "-qm", "merge commit");
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], shimDir: shim,
        plan: { mergecommit: { exit: 1, out: "error: Exiting due to internal failure" } } });
      check("runner: binds the head leg to the named SHA, not the working tree",
        !/mergecommit/.test(r.shimLog), r.shimLog);
      check("runner: and the head leg saw the head commit's content",
        /:: head/.test(r.shimLog), r.shimLog);
      // Without this, a regression that checked the HEAD tree for BOTH legs would make every
      // leg pair identical, turn every real regression into an inherited-looking pass, and
      // leave the whole suite green.
      check("runner: and the base leg saw the BASE commit's content",
        /:: base/.test(r.shimLog), r.shimLog);
      check("runner: exactly one base leg and one head leg ran, base first",
        (r.shimLog.match(/:: (base|head)/g) ?? []).join(",") === ":: base,:: head", r.shimLog);
      check("runner: records the resolved head SHA in the evidence",
        r.evidence?.headSha === headSha, `${r.evidence?.headSha} vs ${headSha}`);
      check("runner: records the resolved base SHA in the evidence",
        r.evidence?.baseSha === baseSha, `${r.evidence?.baseSha} vs ${baseSha}`);
      check("runner: exits 0 because the merge-commit content was never what got judged",
        r.status === 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
    }
    {
      const { root, baseSha, headSha } = build();
      const r = runRunner({ repo: root, base: baseSha, head: "0000000000000000000000000000000000000000", fns: [FNX], plan: {}, shimDir: shim });
      check("runner: an unresolvable head ref FAILS", r.status !== 0, `status=${r.status}`);
    }

    // -- newly added / deleted ---------------------------------------------
    {
      const { root, git } = makeRepo();
      repos.push(root);
      writeFileSync(path.join(root, "README.md"), "x");
      git("add", "-A"); git("commit", "-qm", "base without the function");
      const baseSha = git("rev-parse", "HEAD").trim();
      writeFn(root, FNX, "head");
      git("add", "-A"); git("commit", "-qm", "add the function");
      const headSha = git("rev-parse", "HEAD").trim();

      const okRun = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], plan: {}, shimDir: shim });
      check("runner: a NEW clean function passes", okRun.status === 0, `${okRun.status}\n${okRun.stdout}`);
      check("runner: and the base leg is recorded absent, not clean",
        okRun.evidence?.functions?.[0]?.base?.outcome === "absent", JSON.stringify(okRun.evidence?.functions?.[0]?.base));

      const badRun = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], shimDir: shim,
        plan: { head: { exit: 1, out: `TS2304 [ERROR]: Cannot find name 'ghost'.\n    at file:///x/supabase/functions/${FNX}/index.ts:1:1\nFound 1 error.` } } });
      check("runner: a NEW function arriving with diagnostics FAILS", badRun.status !== 0, `${badRun.status}\n${badRun.stdout}`);
    }
    {
      const { root, baseSha, headSha } = build("head", "base", { deleteOnHead: true });
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], plan: {}, shimDir: shim });
      check("runner: a DELETED function passes", r.status === 0, `${r.status}\n${r.stdout}`);
      check("runner: and the head leg is recorded absent",
        r.evidence?.functions?.[0]?.head?.outcome === "absent", JSON.stringify(r.evidence?.functions?.[0]?.head));
    }

    // -- multiple affected functions ---------------------------------------
    {
      const { root, git } = makeRepo();
      repos.push(root);
      for (const f of ["fn-alpha", "fn-beta", "fn-gamma"]) writeFn(root, f, `base-${f}`);
      git("add", "-A"); git("commit", "-qm", "base");
      const baseSha = git("rev-parse", "HEAD").trim();
      for (const f of ["fn-alpha", "fn-beta", "fn-gamma"]) writeFn(root, f, `head-${f}`);
      git("add", "-A"); git("commit", "-qm", "head");
      const headSha = git("rev-parse", "HEAD").trim();

      const all = runRunner({ repo: root, base: baseSha, head: headSha, fns: ["fn-alpha", "fn-beta", "fn-gamma"], plan: {}, shimDir: shim });
      check("runner: three clean functions pass", all.status === 0, `${all.status}\n${all.stdout}`);
      check("runner: evidence covers every function", all.evidence?.functions?.length === 3);
      check("runner: a transcript exists per function per leg",
        ["fn-alpha", "fn-beta", "fn-gamma"].every((f) =>
          existsSync(path.join(all.outDir, `${f}.base.txt`)) && existsSync(path.join(all.outDir, `${f}.head.txt`))));

      const one = runRunner({ repo: root, base: baseSha, head: headSha, fns: ["fn-alpha", "fn-beta", "fn-gamma"], shimDir: shim,
        plan: { "head-fn-beta": { exit: 1, out: "error: Exiting due to internal failure" } } });
      check("runner: ONE unclassified function among three fails the run", one.status !== 0, `${one.status}\n${one.stdout}`);
      check("runner: and names the offending function", /fn-beta/.test(one.stdout + one.stderr), one.stdout + one.stderr);
      check("runner: while still producing evidence for the others",
        existsSync(path.join(one.outDir, "fn-alpha.head.txt")) && existsSync(path.join(one.outDir, "fn-gamma.head.txt")));
    }

    // -- THE SECOND DEFECT: a zero exit that still reported errors ---------
    // `deno check` writes diagnostics to STDERR. execFileSync returns only stdout on a zero
    // exit, so the classifier was handed "" and the contradiction guard could never fire.
    {
      const { root, baseSha, headSha } = build();
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], shimDir: shim,
        plan: { head: { exit: 0, out: `TS2304 [ERROR]: Cannot find name 'ghost'.\n    at file:///x/supabase/functions/${FNX}/index.ts:1:1\nFound 1 error.` } } });
      check("runner: a ZERO exit that still reported errors FAILS as unclassified",
        r.status !== 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
      check("runner: and the head outcome is unclassified, not clean",
        r.evidence?.functions?.[0]?.head?.outcome === "unclassified",
        JSON.stringify(r.evidence?.functions?.[0]?.head?.outcome));
    }
    {
      // Diagnostics on stderr with a NONZERO exit must be read normally, not lost.
      const { root, baseSha, headSha } = build();
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], shimDir: shim,
        plan: { head: { exit: 1, out: `TS2304 [ERROR]: Cannot find name 'ghost'.\n    at file:///x/supabase/functions/${FNX}/index.ts:1:1\nFound 1 error.` } } });
      check("runner: stderr diagnostics are captured and classified",
        r.evidence?.functions?.[0]?.head?.outcome === "diagnostics" && r.status !== 0,
        JSON.stringify(r.evidence?.functions?.[0]?.head?.outcome));
      check("runner: and the transcript a reviewer downloads is NOT empty",
        (readFileSync(path.join(r.outDir, `${FNX}.head.txt`), "utf8") || "").includes("TS2304"),
        JSON.stringify(readFileSync(path.join(r.outDir, `${FNX}.head.txt`), "utf8").slice(0, 120)));
    }

    // -- illegal function names must not escape the evidence directory -----
    {
      // The evidence dir is nested two deep inside the disposable repo, so the escape target
      // `../../etc.base.txt` lands INSIDE that repo. The assertion is then hermetic rather than
      // depending on whatever happens to be sitting in the system temp directory.
      const { root, baseSha, headSha } = build();
      const nested = path.join(root, "ev", "inner");
      const escapeTarget = path.resolve(nested, "..", "..", "etc.base.txt");
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: ["../../etc"], plan: {}, shimDir: shim, out: nested });
      check("runner: a function name that is not a single path segment FAILS",
        r.status !== 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
      check("runner: and no transcript escapes the evidence directory",
        !existsSync(escapeTarget), escapeTarget);
    }

    // -- expected-count binding (an empty set is not a silent pass) --------
    {
      const { root, baseSha, headSha } = build();
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [], plan: {}, shimDir: shim,
        extraEnv: { RATCHET_EXPECT: "2" } });
      check("runner: fewer functions than CI resolved FAILS (env form)", r.status !== 0, `${r.status}\n${r.stdout}${r.stderr}`);
      check("runner: and the abort reason is written as evidence, not left to the upload step",
        r.evidence?.aborted !== undefined, JSON.stringify(r.evidence));
    }
    {
      // The FLAG is what CI actually passes; it had no coverage at all.
      const { root, baseSha, headSha } = build();
      const mismatch = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], plan: {}, shimDir: shim, expect: "3" });
      check("runner: --expect mismatch FAILS (flag form)", mismatch.status !== 0, `${mismatch.status}\n${mismatch.stdout}`);

      const empty = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], plan: {}, shimDir: shim, expect: "" });
      check("runner: an explicitly EMPTY --expect FAILS rather than disabling the guard",
        empty.status !== 0, `${empty.status}\n${empty.stdout}${empty.stderr}`);

      const nan = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], plan: {}, shimDir: shim, expect: "abc" });
      check("runner: a non-numeric --expect FAILS", nan.status !== 0, `${nan.status}\n${nan.stdout}`);

      const good = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNX], plan: {}, shimDir: shim, expect: "1" });
      check("runner: a matching --expect passes", good.status === 0, `${good.status}\n${good.stdout}${good.stderr}`);
    }

    // -- the entry point must actually run from any path -------------------
    {
      const spaced = mkdtempSync(path.join(tmpdir(), "ratchet space "));
      const copy = path.join(spaced, "r.mjs");
      writeFileSync(copy, readFileSync(SCRIPT, "utf8"));
      let status = 0;
      try { execFileSync(process.execPath, [copy], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
      catch (e) { status = e.status ?? -1; }
      check("runner: main() still runs from a path containing a space (percent-encoding guard)",
        status === 2, `status=${status} (expected 2 - '--base is required')`);
      rmSync(spaced, { recursive: true, force: true });
    }
  } finally {
    for (const r of repos) { try { rmSync(r, { recursive: true, force: true }); } catch { } }
    rmSync(shim, { recursive: true, force: true });
  }
}

console.log("\nrunner — a lockfile the check ignores must not change grading");
{
  // The behavioural half of the coupling proof. Two legs carrying the SAME inherited
  // diagnostic must still pass when the only other difference is a file `--no-lock` makes
  // inert. With deno.lock fingerprinted this run fails for a file the compiler never read.
  const FNL = "disposable-lockfile-probe";
  const shim = makeShim();
  const repos = [];
  const DIAG = `TS2769 [ERROR]: No overload matches this call.\n    at file:///x/supabase/functions/_shared/helper.ts:1:1\nFound 1 error.`;

  /** base and head differ only in the named root files; the function itself is untouched. */
  const buildWithRootFiles = (baseFiles, headFiles) => {
    const { root, git } = makeRepo();
    repos.push(root);
    writeFn(root, FNL, "base");
    for (const [f, v] of Object.entries(baseFiles)) writeFileSync(path.join(root, f), v);
    git("add", "-A"); git("commit", "-qm", "base");
    const baseSha = git("rev-parse", "HEAD").trim();
    writeFn(root, FNL, "head");
    for (const [f, v] of Object.entries(headFiles)) writeFileSync(path.join(root, f), v);
    git("add", "-A"); git("commit", "-qm", "head");
    return { root, baseSha, headSha: git("rev-parse", "HEAD").trim() };
  };

  try {
    // Control: no root config at all, identical inherited diagnostic -> inherited, passes.
    {
      const { root, baseSha, headSha } = buildWithRootFiles({}, {});
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNL], shimDir: shim,
        plan: { base: { exit: 1, out: DIAG }, head: { exit: 1, out: DIAG } } });
      check("runner: an identical inherited diagnostic passes with no config present",
        r.status === 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
    }

    // THE REGRESSION: only deno.lock changed. --no-lock means the compiler never reads it.
    {
      const { root, baseSha, headSha } = buildWithRootFiles(
        { "deno.lock": '{"version":"3","packages":{}}' },
        { "deno.lock": '{"version":"4","packages":{"npm:zod@3.23.8":{}}}' });
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNL], shimDir: shim,
        plan: { base: { exit: 1, out: DIAG }, head: { exit: 1, out: DIAG } } });
      check("runner: a CHANGED deno.lock alone does NOT withdraw inherited credit",
        r.status === 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
      check("runner: and no dependency-drift note is emitted for it",
        !/dependency inputs differ/i.test(r.stdout + r.stderr), r.stdout + r.stderr);
    }

    // ...and an ADDED deno.lock is equally inert.
    {
      const { root, baseSha, headSha } = buildWithRootFiles({}, { "deno.lock": '{"version":"4"}' });
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNL], shimDir: shim,
        plan: { base: { exit: 1, out: DIAG }, head: { exit: 1, out: DIAG } } });
      check("runner: an ADDED deno.lock alone does NOT withdraw inherited credit",
        r.status === 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
    }

    // The mechanism is intact: a config the check DOES consume still withdraws credit.
    {
      const { root, baseSha, headSha } = buildWithRootFiles(
        { "deno.json": '{"imports":{"@x/":"https://example.test/a/"}}' },
        { "deno.json": '{"imports":{"@x/":"https://example.test/b/"}}' });
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNL], shimDir: shim,
        plan: { base: { exit: 1, out: DIAG }, head: { exit: 1, out: DIAG } } });
      check("runner: a CHANGED deno.json DOES withdraw inherited credit",
        r.status !== 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
      check("runner: and says so, naming the dependency drift",
        /dependency inputs/i.test(r.stdout + r.stderr), r.stdout + r.stderr);
    }

    // A changed consumed config with a genuinely clean head is still fine.
    {
      const { root, baseSha, headSha } = buildWithRootFiles(
        { "import_map.json": '{"imports":{"a":"./a.ts"}}' },
        { "import_map.json": '{"imports":{"a":"./b.ts"}}' });
      const r = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNL], plan: {}, shimDir: shim });
      check("runner: a changed import_map with a clean head still passes",
        r.status === 0, `status=${r.status}\n${r.stdout}${r.stderr}`);
    }
  } finally {
    for (const r of repos) { try { rmSync(r, { recursive: true, force: true }); } catch { } }
    rmSync(shim, { recursive: true, force: true });
  }
}

console.log("\nrunner — against a real deno");
{
  let denoPresent = false;
  try { execFileSync("deno", ["--version"], { stdio: "ignore" }); denoPresent = true; } catch { }

  if (!denoPresent) {
    if (process.env.RATCHET_REQUIRE_DENO === "1") {
      check("real deno is available (RATCHET_REQUIRE_DENO=1)", false, "deno is not on PATH");
    } else {
      console.log("  UNVERIFIED  real-deno leg - deno is not on PATH in this environment.");
      console.log("              CI sets RATCHET_REQUIRE_DENO=1, where this is a hard failure.");
    }
  } else {
    const FNY = "disposable-ratchet-deno-probe";
    const { root, git } = makeRepo();
    try {
      writeFn(root, FNY, "base");
      git("add", "-A"); git("commit", "-qm", "base");
      const baseSha = git("rev-parse", "HEAD").trim();
      // A genuine type error the real compiler must report.
      writeFn(root, FNY, "head", "const n: number = \"definitely not a number\";\nexport const unused = n;");
      git("add", "-A"); git("commit", "-qm", "head");
      const headSha = git("rev-parse", "HEAD").trim();

      const bare = mkdtempSync(path.join(tmpdir(), "ratchet-noshim-"));
      const clean0 = runRunner({ repo: root, base: baseSha, head: baseSha, fns: [FNY], plan: {}, shimDir: bare });
      check("real deno: an unchanged candidate passes", clean0.status === 0, `${clean0.status}\n${clean0.stdout}${clean0.stderr}`);

      const regressed = runRunner({ repo: root, base: baseSha, head: headSha, fns: [FNY], plan: {}, shimDir: bare });
      check("real deno: a genuine NEW type error fails", regressed.status !== 0, `${regressed.status}\n${regressed.stdout}${regressed.stderr}`);
      check("real deno: and the head leg is classified `diagnostics`",
        regressed.evidence?.functions?.[0]?.head?.outcome === "diagnostics",
        JSON.stringify(regressed.evidence?.functions?.[0]?.head?.outcome));
      rmSync(bare, { recursive: true, force: true });
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
