#!/usr/bin/env node
/**
 * Deno edge-function diagnostic ratchet.
 *
 * The plain `deno check` gate is all-or-nothing: the first PR to touch a function carrying
 * inherited debt goes red for errors it did not write, and the pressure is then to weaken the
 * gate. This compares the SAME pinned check on the PR base against the PR head and fails only
 * on new or increased diagnostics — without ever skipping, disabling, or advisory-greening a
 * check.
 *
 * Three rules keep it from becoming a rubber stamp.
 *
 *   1. EVERY LEG STATES ITS OUTCOME, AND AN UNSTATED OUTCOME IS NEVER CLEAN. A check run is
 *      classified into exactly one of `clean`, `diagnostics`, `resolution-failure`, `absent`,
 *      `abandoned`, or `unclassified`, and the comparator refuses to grade a leg that carries
 *      anything else. The first version of this gate derived "clean" from the ABSENCE of
 *      parsed diagnostics, so a nonzero exit the parser did not recognise — a compiler panic,
 *      an OOM kill, a changed output format, a config error — produced an empty diagnostic
 *      list and sailed through as a pass. That is the fail-open this file exists to close:
 *      an unexplained nonzero exit means nothing was verified, and nothing verified fails.
 *   2. AN UNKNOWABLE BASE EARNS NO CREDIT. A module-resolution failure is not a type-check
 *      result; it means the file was not checked at all. On the HEAD that is fatal. On the
 *      BASE it means the baseline is unknowable, so the base is credited with NOTHING and the
 *      head must be clean on its own merits — stricter than ratcheting, and it does not punish
 *      the PR that repairs the import. An UNCLASSIFIED base is treated identically: an
 *      uninterpretable baseline is not a baseline.
 *   3. AN INHERITED DIAGNOSTIC IS ONLY INHERITED WHILE ITS ORIGIN FILE IS UNCHANGED. A CHANGED
 *      shared dependency is changed code: its diagnostics are the candidate's to answer for,
 *      not baseline to be waved through.
 *
 * Both legs run in DETACHED WORKTREES at the exact resolved SHAs. On `pull_request`,
 * `actions/checkout` materialises the MERGE COMMIT, not the PR head — so a head leg run in the
 * runner's working directory judges a tree that is not the SHA the verdict is reported against.
 * Binding each leg to its own worktree removes that gap by construction, and the resolved SHAs
 * are recorded in the evidence so a reviewer can confirm what was actually checked.
 *
 * The comparator below is pure and separately tested; the runner half executes the two legs and
 * writes both as inspectable evidence, which is then re-read from disk before any verdict is
 * reported. Missing evidence is a failure, never a warning.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// -- pure comparator ---------------------------------------------------------

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

/** Cap on stored transcript per leg, so evidence stays readable and uploadable. */
const RAW_LIMIT = 200_000;

/** The outcomes a leg may report. Anything else is refused rather than assumed benign. */
export const LEG_OUTCOMES = Object.freeze([
  "clean",              // the check ran and found nothing
  "diagnostics",        // the check ran and reported type errors we parsed and agree on
  "resolution-failure", // the module graph could not be built; nothing was type-checked
  "absent",             // the entry file does not exist at this revision
  "abandoned",          // the check never completed (spawn failure, signal, killed)
  "unclassified",       // it exited in a way this gate cannot interpret — never a pass
]);
const KNOWN_OUTCOMES = new Set(LEG_OUTCOMES);

/** Substrings meaning "the module graph could not be built", i.e. nothing was checked. */
const RESOLUTION_MARKERS = [
  "could not find a matching package",
  "could not find",
  "module not found",
  "error sending request",
  "relative import path",
  "failed to fetch",
  "did you forget to run",
];

export function looksLikeResolutionFailure(raw) {
  const s = String(raw ?? "").replace(ANSI, "").toLowerCase();
  return RESOLUTION_MARKERS.some((m) => s.includes(m));
}

/** Absolute runner paths differ between legs and machines; compare repo-relative. */
export function repoRelative(file) {
  const i = file.indexOf("supabase/functions/");
  if (i >= 0) return file.slice(i);
  const j = file.indexOf("/scripts/");
  if (j >= 0) return file.slice(j + 1);
  return file;
}

/**
 * Parse `deno check` output into deterministic diagnostic keys.
 *
 * Line and column are deliberately DROPPED. An unrelated edit shifts every line below it,
 * and a ratchet that counted those as new diagnostics would be useless. Identity is
 * (origin file, error code, message), kept as a multiset so a SECOND copy of an existing
 * error still fails the count rule.
 */
export function normalizeDiagnostics(raw) {
  const text = String(raw ?? "").replace(ANSI, "");
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(TS\d+)\s*\[ERROR\]:\s*(.*)$/.exec(lines[i].trim());
    if (!m) continue;
    const [, code, message] = m;
    let file = "unknown";
    for (let j = i + 1; j < lines.length && j < i + 60; j++) {
      if (/^TS\d+\s*\[ERROR\]/.test(lines[j].trim())) break;
      const at = /at file:\/\/\/(\S+?):\d+:\d+/.exec(lines[j]);
      if (at) { file = at[1]; break; }
    }
    out.push({ code, message: message.trim(), file: repoRelative(file) });
  }
  return out;
}

/**
 * Deno's own tally line ("Found 3 errors."). It is the compiler's count, independent of our
 * parser — so a disagreement between the two means our parse is incomplete and the leg cannot
 * be graded on it. Returns null when deno printed no tally.
 */
export function parseReportedErrorCount(raw) {
  const m = /^Found (\d+) errors?\./m.exec(String(raw ?? "").replace(ANSI, ""));
  return m ? Number(m[1]) : null;
}

/**
 * Turn one raw check invocation into a leg record with an EXPLICIT outcome.
 *
 * This is where the fail-open was. Every path that does not positively establish "the check
 * ran to completion and we understand its result" lands on `unclassified` or `abandoned`,
 * both of which the comparator fails closed on.
 */
export function classifyLeg({ present, exit, raw, signal = null, spawnFailed = false, attempts = 1 }) {
  if (present === false) {
    return { ran: true, present: false, outcome: "absent", exit: null, diagnostics: [], reportedCount: null, attempts, raw: "" };
  }
  const text = String(raw ?? "");
  const trimmedRaw = text.slice(0, RAW_LIMIT);

  // The tool never completed. There is no result to interpret, so there is no evidence.
  if (spawnFailed || signal) {
    return {
      ran: false, present: true, outcome: "abandoned", exit: exit ?? null, signal,
      diagnostics: [], reportedCount: null, attempts, raw: trimmedRaw,
      unclassifiedReason: signal ? `the check was killed by ${signal}` : "the check process could not be started",
    };
  }

  const diagnostics = normalizeDiagnostics(text);
  const reportedCount = parseReportedErrorCount(text);
  const leg = { ran: true, present: true, exit, diagnostics, reportedCount, attempts, raw: trimmedRaw };
  const unclassified = (reason) => ({ ...leg, outcome: "unclassified", unclassifiedReason: reason });

  if (exit === 0) {
    // A zero exit that nonetheless carries errors is a contradiction, not a pass.
    if (diagnostics.length > 0) return unclassified(`exit 0 but ${diagnostics.length} diagnostic(s) were emitted`);
    if (reportedCount !== null && reportedCount > 0) return unclassified(`exit 0 but deno reported ${reportedCount} error(s)`);
    return { ...leg, outcome: "clean" };
  }

  if (diagnostics.length > 0) {
    // Our parse must agree with deno's own count, or we are grading a partial reading.
    if (reportedCount !== null && reportedCount !== diagnostics.length) {
      return unclassified(`deno reported ${reportedCount} error(s) but this gate parsed ${diagnostics.length}`);
    }
    return { ...leg, outcome: "diagnostics" };
  }

  if (looksLikeResolutionFailure(text)) return { ...leg, outcome: "resolution-failure" };

  // THE CLOSED DOOR: a nonzero exit with nothing this gate can read. Nothing was verified.
  return unclassified(`exit ${exit} produced no diagnostic this gate could parse and no module-resolution marker`);
}

const keyOf = (d) => JSON.stringify([d.file, d.code, d.message]);

function tally(list) {
  const m = new Map();
  for (const d of list) m.set(keyOf(d), (m.get(keyOf(d)) ?? 0) + 1);
  return m;
}

/** A short, quoted tail of a transcript, so a failure message is actionable on its own. */
function excerpt(raw, lines = 6) {
  return String(raw ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(-lines).join(" | ").slice(0, 400);
}

/**
 * Compare one function's two legs.
 * @returns {string[]} failure reasons; empty means this function passes the ratchet.
 */
export function compareFunction({ fn, base, head, changedFiles = [] }) {
  const fail = [];
  const entry = `supabase/functions/${fn}/index.ts`;
  const changed = new Set(changedFiles);

  // Every leg must have executed AND must say what happened. A leg that cannot state its own
  // outcome is never read as clean — that inference is precisely the fail-open being closed.
  for (const [label, leg] of [["BASE", base], ["HEAD", head]]) {
    const lower = label.toLowerCase();
    if (!leg || typeof leg !== "object") {
      fail.push(`${fn}: ${label} evidence missing - the ${lower} leg did not execute`);
      continue;
    }
    if (leg.ran !== true) {
      const why = leg.unclassifiedReason ?? leg.outcome ?? "no outcome recorded";
      fail.push(`${fn}: ${label} evidence missing - the ${lower} leg did not execute (${why})`);
      continue;
    }
    if (!KNOWN_OUTCOMES.has(leg.outcome)) {
      fail.push(`${fn}: ${label} leg recorded no recognised outcome (${JSON.stringify(leg.outcome ?? null)}) - a leg that cannot state what happened is never credited as clean`);
    }
  }
  if (fail.length) return [...new Set(fail)];

  // --- head-side fatals: nothing was verified, so nothing is ratcheted ---------------------

  if (head.outcome === "unclassified") {
    return [`${fn}: HEAD check outcome is UNCLASSIFIED (exit ${head.exit ?? "?"}) - ${head.unclassifiedReason ?? "the gate could not interpret the result"}. Nothing was verified, so this fails closed. Transcript tail: ${excerpt(head.raw)}`];
  }
  if (head.outcome === "resolution-failure") {
    return [`${fn}: HEAD could not resolve its module graph - not ratchetable, nothing was checked`];
  }
  // The function is gone at head. There is no candidate left to judge.
  if (head.outcome === "absent") return [];

  // --- base-side credit -------------------------------------------------------------------

  // An unknowable base means the baseline cannot be established, NOT that the candidate is
  // guilty. Failing outright would punish the PR that repairs the import and would deadlock,
  // since the repair can only ever land on a base that still carries the break. So the base is
  // credited with NOTHING and the head must be clean on its own merits. Strictly stricter than
  // ratcheting, never weaker. An UNCLASSIFIED base is the same situation with a different
  // cause, and gets the same treatment rather than being mistaken for a clean baseline.
  if (base.outcome === "resolution-failure" || base.outcome === "unclassified") {
    const why = base.outcome === "unclassified"
      ? `BASE check outcome is UNCLASSIFIED (exit ${base.exit ?? "?"}) - ${base.unclassifiedReason ?? "the gate could not interpret the result"}`
      : "BASE could not resolve its module graph";
    if (head.outcome === "clean") {
      console.log(`    note: ${fn} - ${why}; NO baseline credited, head is clean on its own merits`);
      return [];
    }
    return [`${fn}: ${why} - NO baseline credited, so the head must be clean on its own merits; it reported ${head.diagnostics?.length ?? 0} diagnostic(s): ${excerpt(head.raw)}`];
  }

  // A function that did not exist on the base has no baseline to inherit. It must arrive clean.
  if (base.outcome === "absent") {
    if (head.outcome === "clean") return [];
    return [`${fn}: this function did not exist on the base (new function), so there is no baseline to inherit - it must arrive clean; head reported ${head.diagnostics?.length ?? 0} diagnostic(s)`];
  }

  // A base that did not complete is caught above by the `ran !== true` guard; anything reaching
  // here is `clean` or `diagnostics` on both legs.
  const baseDiags = base.diagnostics ?? [];
  const headDiags = head.diagnostics ?? [];
  const b = tally(baseDiags);
  const h = tally(headDiags);

  // An inherited diagnostic is only inherited while its origin file is unchanged.
  for (const d of headDiags) {
    if (d.file !== entry && changed.has(d.file)) {
      fail.push(`${fn}: diagnostic ${d.code} in ${d.file} cannot be inherited - that file CHANGED in this PR, so it is candidate code`);
    }
  }

  // Clean base, dirty head. Implied by the count rule below, but named for a clear message.
  if (b.size === 0 && h.size > 0) {
    fail.push(`${fn}: base was CLEAN and head has ${headDiags.length} diagnostic(s) - a clean function may not regress`);
  }

  // New key, or an increased count for an existing key.
  for (const [k, n] of h) {
    const prior = b.get(k) ?? 0;
    const [file, code, message] = JSON.parse(k);
    if (prior === 0) {
      fail.push(`${fn}: NEW diagnostic ${code} in ${file} - ${message}`);
    } else if (n > prior) {
      fail.push(`${fn}: diagnostic count INCREASED for ${code} in ${file} (${prior} to ${n})`);
    }
  }
  return [...new Set(fail)];
}

export function compareAll(evidence) {
  const failures = [];
  for (const rec of evidence?.functions ?? []) failures.push(...compareFunction(rec));
  return { ok: failures.length === 0, failures };
}

/**
 * Evidence a reviewer cannot read is not evidence. Both legs of every function must exist on
 * disk and `evidence.json` must parse; anything missing is a FAILURE, never a warning.
 */
export function verifyEvidenceArtifacts(outDir, evidence) {
  const problems = [];
  const jsonPath = path.join(outDir, "evidence.json");
  if (!existsSync(jsonPath)) {
    problems.push(`evidence artifact missing: ${jsonPath}`);
  } else {
    try { JSON.parse(readFileSync(jsonPath, "utf8")); }
    catch (e) { problems.push(`evidence artifact unreadable: could not parse ${jsonPath} (${e.message})`); }
  }
  for (const rec of evidence?.functions ?? []) {
    for (const leg of ["base", "head"]) {
      const p = path.join(outDir, `${rec.fn}.${leg}.txt`);
      if (!existsSync(p)) problems.push(`evidence artifact missing: ${rec.fn} ${leg} transcript (${p})`);
    }
  }
  return problems;
}

// -- runner ------------------------------------------------------------------

/** Abandonment is infrastructure noise and may be retried. A diagnostic never is. */
const MAX_ATTEMPTS = 2;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** One raw invocation. Distinguishes "exited with a status" from "never completed". */
function invokeCheck(cwd, entry) {
  try {
    const raw = execFileSync("deno", ["check", "--no-lock", entry], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024,
    });
    return { exit: 0, raw };
  } catch (e) {
    const out = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
    if (e.signal) return { signal: e.signal, raw: out };
    if (e.status === null || e.status === undefined) {
      return { spawnFailed: true, raw: `${out}\n${e.code ?? ""} ${e.message ?? e}`.trim() };
    }
    return { exit: e.status, raw: out };
  }
}

function runCheck(cwd, entry) {
  if (!existsSync(path.join(cwd, entry))) return classifyLeg({ present: false });
  let leg;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    leg = classifyLeg({ present: true, ...invokeCheck(cwd, entry), attempts: attempt });
    if (leg.outcome !== "abandoned") return leg;
    if (attempt < MAX_ATTEMPTS) {
      console.log(`    retry: ${entry} leg abandoned (${leg.signal ?? "spawn failure"}) - attempt ${attempt + 1}/${MAX_ATTEMPTS}`);
    }
  }
  // Every attempt was abandoned. It stays abandoned, and the comparator fails it closed.
  return leg;
}

function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function main() {
  const baseRef = arg("base");
  const headRef = arg("head", "HEAD");
  const fnsArg = arg("functions", "");
  const outDir = arg("out", "deno-ratchet-evidence");
  const expectRaw = arg("expect", process.env.RATCHET_EXPECT ?? null);
  const fns = [...new Set(fnsArg.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];

  if (!baseRef) { console.error("::error::deno-edge-ratchet: --base <ref> is required"); process.exit(2); }

  // The set CI resolved and the set the ratchet graded must be the same set. Silently grading
  // fewer functions than were affected is a pass nobody asked for.
  const expect = expectRaw === null || expectRaw === "" ? null : Number(expectRaw);
  if (expect !== null && Number.isFinite(expect) && fns.length !== expect) {
    console.error(`::error::deno-edge-ratchet: CI resolved ${expect} affected function(s) but ${fns.length} reached the ratchet - refusing to report a verdict on a set that does not match.`);
    process.exit(1);
  }

  const repo = process.cwd();

  // Bind each leg to an exact commit. On `pull_request`, the runner's working tree is the MERGE
  // COMMIT, not the PR head, so "check what is checked out" grades a tree the verdict does not
  // name. Resolving both refs up front also turns a bad ref into a loud failure, not a silent one.
  let baseSha, headSha;
  try { baseSha = git(repo, "rev-parse", "--verify", `${baseRef}^{commit}`); }
  catch { console.error(`::error::deno-edge-ratchet: base ref '${baseRef}' does not resolve to a commit`); process.exit(2); }
  try { headSha = git(repo, "rev-parse", "--verify", `${headRef}^{commit}`); }
  catch { console.error(`::error::deno-edge-ratchet: head ref '${headRef}' does not resolve to a commit`); process.exit(2); }

  let runnerCheckout = null;
  try { runnerCheckout = git(repo, "rev-parse", "HEAD"); } catch { /* not fatal; recorded as null */ }
  if (runnerCheckout && runnerCheckout !== headSha) {
    console.log(`note: the runner's working tree is ${runnerCheckout}, not the PR head ${headSha}.`);
    console.log("      both legs are checked in detached worktrees at their exact SHAs, so the verdict is bound to the head named above.");
  }

  const evidence = {
    baseRef, headRef, baseSha, headSha, runnerCheckout,
    changedFiles: [], functions: [],
  };

  if (fns.length === 0) {
    console.log("deno-edge-ratchet: no affected functions - nothing to compare.");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));
    return;
  }

  evidence.changedFiles = git(repo, "diff", "--name-only", `${baseSha}...${headSha}`)
    .split("\n").map((s) => s.trim()).filter(Boolean);
  const changedFiles = evidence.changedFiles;

  // Both legs run in detached worktrees at their exact SHAs, sharing the head's node_modules so
  // the two runs are otherwise identical.
  const tmp = mkdtempSync(path.join(tmpdir(), "deno-ratchet-"));
  const trees = {};
  const nm = path.join(repo, "node_modules");
  try {
    for (const [label, sha] of [["base", baseSha], ["head", headSha]]) {
      const dir = path.join(tmp, label);
      // Captured, not inherited: checking out a 3000-file tree prints a progress line per
      // percent, twice per run, which buries the verdict. A failure still throws with its
      // stderr attached.
      try {
        execFileSync("git", ["worktree", "add", "--detach", dir, sha], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
      } catch (e) {
        throw new Error(`could not create the ${label} worktree at ${sha}: ${e.stderr ?? e.message ?? e}`);
      }
      const got = git(dir, "rev-parse", "HEAD");
      if (got !== sha) {
        throw new Error(`${label} worktree resolved to ${got} but ${sha} was requested - refusing to grade an unbound tree`);
      }
      if (existsSync(nm)) {
        try { symlinkSync(nm, path.join(dir, "node_modules"), "dir"); } catch { /* already present */ }
      }
      trees[label] = dir;
    }

    for (const fn of fns) {
      const entry = `supabase/functions/${fn}/index.ts`;
      console.log(`--- ratchet ${fn}`);
      const base = runCheck(trees.base, entry);
      const head = runCheck(trees.head, entry);
      const say = (leg) => `${leg.outcome}${leg.diagnostics?.length ? ` (${leg.diagnostics.length} diagnostic(s))` : ""}${leg.unclassifiedReason ? ` - ${leg.unclassifiedReason}` : ""}`;
      console.log(`    base @ ${baseSha.slice(0, 8)}: ${say(base)}`);
      console.log(`    head @ ${headSha.slice(0, 8)}: ${say(head)}`);
      evidence.functions.push({ fn, base, head, changedFiles });
    }
  } finally {
    for (const dir of Object.values(trees)) {
      try { execFileSync("git", ["worktree", "remove", "--force", dir], { cwd: repo, stdio: "ignore" }); } catch { /* best effort */ }
    }
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));
  for (const rec of evidence.functions) {
    writeFileSync(path.join(outDir, `${rec.fn}.base.txt`), rec.base.raw ?? "");
    writeFileSync(path.join(outDir, `${rec.fn}.head.txt`), rec.head.raw ?? "");
  }

  // Re-read from disk: a verdict backed by evidence nobody can open is not a verdict.
  const missing = verifyEvidenceArtifacts(outDir, evidence);
  if (missing.length) {
    for (const m of missing) console.log(`::error::${m}`);
    console.log(`\ndeno edge ratchet: evidence is incomplete, so no verdict is reported. ${missing.length} artifact problem(s).`);
    process.exit(1);
  }

  const { ok, failures } = compareAll(evidence);
  if (!ok) {
    for (const f of failures) console.log(`::error::${f}`);
    console.log(`\ndeno edge ratchet: ${failures.length} blocking finding(s). Evidence in ${outDir}/.`);
    process.exit(1);
  }
  console.log(`\ndeno edge ratchet: no new or increased diagnostics across ${fns.length} function(s). Evidence in ${outDir}/.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); }
  catch (e) {
    // An unexpected throw is not a pass. Say what happened and fail closed.
    console.log(`::error::deno-edge-ratchet aborted: ${e?.message ?? e}`);
    if (e?.stack) console.log(e.stack);
    process.exit(1);
  }
}
