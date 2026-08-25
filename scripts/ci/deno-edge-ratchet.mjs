#!/usr/bin/env node
/**
 * Deno edge-function diagnostic ratchet.
 *
 * The plain `deno check` gate is all-or-nothing: the first PR to touch a function
 * carrying inherited debt goes red for errors it did not write, and the pressure is then
 * to weaken the gate. This compares the SAME pinned check on the PR base against the PR
 * head and fails only on new or increased diagnostics — without ever skipping, disabling,
 * or advisory-greening a check.
 *
 * Two rules keep it from becoming a rubber stamp:
 *
 *   - A module-resolution failure is NEVER ratchetable. It is not a type-check result; it
 *     means the file was not checked at all, so it could hide anything added to that file
 *     later. On the HEAD that is fatal. On the BASE it means the baseline is unknowable,
 *     so the base is credited with NOTHING and the head must be clean - stricter than
 *     ratcheting, and it does not punish the PR that repairs the import.
 *   - An inherited diagnostic is only inherited while the file it originates in is
 *     unchanged. A CHANGED shared dependency is changed code: its diagnostics are the
 *     candidate's to answer for, not baseline to be waved through.
 *
 * The comparator below is pure and separately tested; the runner half executes the two
 * legs and writes both as inspectable evidence.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// -- pure comparator ---------------------------------------------------------

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

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

const keyOf = (d) => JSON.stringify([d.file, d.code, d.message]);

function tally(list) {
  const m = new Map();
  for (const d of list) m.set(keyOf(d), (m.get(keyOf(d)) ?? 0) + 1);
  return m;
}

/**
 * Compare one function's two legs.
 * @returns {string[]} failure reasons; empty means this function passes the ratchet.
 */
export function compareFunction({ fn, base, head, changedFiles = [] }) {
  const fail = [];
  const entry = `supabase/functions/${fn}/index.ts`;
  const changed = new Set(changedFiles);

  // Either leg must have actually executed. No evidence is never a pass.
  if (!base || base.ran !== true) fail.push(`${fn}: BASE evidence missing - the base leg did not execute`);
  if (!head || head.ran !== true) fail.push(`${fn}: HEAD evidence missing - the head leg did not execute`);
  if (fail.length) return fail;

  // A HEAD resolution failure is fatal: the candidate was not checked at all, so it could
  // be hiding anything. This is never ratcheted and never excused.
  if (head.resolutionFailure) {
    fail.push(`${fn}: HEAD could not resolve its module graph - not ratchetable, nothing was checked`);
    return fail;
  }

  // A BASE resolution failure means the baseline is UNKNOWABLE, not that the candidate is
  // guilty. Failing outright would punish the PR that repairs the import - and would
  // deadlock, since the repair can only ever land on a base that still carries the break.
  // So the base is credited with NOTHING: no inherited diagnostics, head must be clean.
  // Strictly stricter than ratcheting, never weaker.
  const baseUnknowable = base.resolutionFailure === true;
  if (baseUnknowable) {
    console.log(`    note: ${fn} base could not resolve - no baseline credited, head must be clean`);
  }

  const baseDiags = baseUnknowable ? [] : (base.diagnostics ?? []);
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
  for (const rec of evidence.functions ?? []) failures.push(...compareFunction(rec));
  return { ok: failures.length === 0, failures };
}

// -- runner ------------------------------------------------------------------

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function runCheck(cwd, entry) {
  if (!existsSync(path.join(cwd, entry))) {
    return { ran: true, present: false, resolutionFailure: false, diagnostics: [], raw: "" };
  }
  let raw = "";
  let exit = 0;
  try {
    raw = execFileSync("deno", ["check", "--no-lock", entry], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    exit = e.status ?? 1;
    raw = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
    if (e.status === undefined && !e.stdout && !e.stderr) {
      // deno itself never ran (missing binary, killed process). Not a diagnostic - no evidence.
      return { ran: false, present: true, resolutionFailure: false, diagnostics: [], raw: String(e.message ?? e) };
    }
  }
  const diagnostics = normalizeDiagnostics(raw);
  const resolutionFailure = exit !== 0 && diagnostics.length === 0 && looksLikeResolutionFailure(raw);
  return { ran: true, present: true, exit, resolutionFailure, diagnostics, raw: raw.slice(0, 200_000) };
}

function main() {
  const baseRef = arg("base");
  const headRef = arg("head", "HEAD");
  const fnsArg = arg("functions", "");
  const outDir = arg("out", "deno-ratchet-evidence");
  const fns = fnsArg.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

  if (!baseRef) { console.error("deno-edge-ratchet: --base <ref> is required"); process.exit(2); }
  if (fns.length === 0) { console.log("deno-edge-ratchet: no affected functions - nothing to compare."); return; }

  const repo = process.cwd();
  const changedFiles = execFileSync("git", ["diff", "--name-only", `${baseRef}...${headRef}`], { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);

  // The base leg runs in a detached worktree of the base ref with the SAME node_modules the
  // head leg uses; otherwise the two legs are not comparable.
  const tmp = mkdtempSync(path.join(tmpdir(), "deno-ratchet-base-"));
  const baseTree = path.join(tmp, "base");
  execFileSync("git", ["worktree", "add", "--detach", baseTree, baseRef], { cwd: repo, stdio: "inherit" });
  const nm = path.join(repo, "node_modules");
  if (existsSync(nm)) {
    try { symlinkSync(nm, path.join(baseTree, "node_modules"), "dir"); } catch { /* already present */ }
  }

  const evidence = { baseRef, headRef, changedFiles, functions: [] };
  try {
    for (const fn of fns) {
      const entry = `supabase/functions/${fn}/index.ts`;
      console.log(`--- ratchet ${fn}`);
      const base = runCheck(baseTree, entry);
      const head = runCheck(repo, entry);
      const say = (leg) => leg.present
        ? `${leg.diagnostics.length} diagnostic(s)${leg.resolutionFailure ? " + RESOLUTION FAILURE" : ""}`
        : "absent";
      console.log(`    base: ${say(base)}`);
      console.log(`    head: ${say(head)}`);
      evidence.functions.push({ fn, base, head, changedFiles });
    }
  } finally {
    try { execFileSync("git", ["worktree", "remove", "--force", baseTree], { cwd: repo, stdio: "ignore" }); } catch { /* best effort */ }
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));
  for (const rec of evidence.functions) {
    writeFileSync(path.join(outDir, `${rec.fn}.base.txt`), rec.base.raw ?? "");
    writeFileSync(path.join(outDir, `${rec.fn}.head.txt`), rec.head.raw ?? "");
  }

  const { ok, failures } = compareAll(evidence);
  if (!ok) {
    for (const f of failures) console.log(`::error::${f}`);
    console.log(`\ndeno edge ratchet: ${failures.length} blocking finding(s). Evidence in ${outDir}/.`);
    process.exit(1);
  }
  console.log(`\ndeno edge ratchet: no new or increased diagnostics across ${fns.length} function(s). Evidence in ${outDir}/.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
