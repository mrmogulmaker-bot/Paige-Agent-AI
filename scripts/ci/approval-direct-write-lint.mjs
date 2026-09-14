#!/usr/bin/env node
/**
 * approval-direct-write-lint — the FRONTEND never marks an approval `approved` itself.
 *
 * WHAT THIS GUARDS, AND WHY IT IS NOT A STYLE RULE. An approval in `paige_pending_approvals`
 * becomes `approved` only through the canonical `execute-approval` seam (§10/§18): the seam
 * re-scopes the opaque approval id to the caller's server-derived tenant/role, claims it once,
 * and then EXECUTES the consequence — sends the comms draft, runs the held Layer-C act, or
 * acknowledges — before writing readback + Rail + receipt. A browser that writes
 * `status: 'approved'` DIRECTLY bypasses all of that: no execution, no claim, no receipt, and for
 * a message row it marks the row approved WITHOUT SENDING (the silent-drop). For an ORCHESTRATION
 * row the DB direct-approve guard throws 42501 on exactly this write on BOTH the INSERT (create-
 * already-approved) and the UPDATE (transition-to-approved) path (migration 20270317000000). This
 * lint is the FRONTEND regression tripwire on top of that: it covers the insert path too and, unlike
 * the DB guard, it fires for EVERY approval write (not only source='paige_orchestration' rows) —
 * because a NON-orchestration approved write is not blocked by the DB today (that broader
 * approvals-RLS redesign is the next, separate slice), so the frontend must not author it (§37 walk).
 *
 * The mounted approve surfaces (ApprovalRow, DraftsAwaitingPanel, the Solo/Agency Command Center
 * hooks) already route approve through the seam. This guard LOCKS that in so it cannot silently
 * regress: it fails the build if any file under src/ performs a direct `paige_pending_approvals`
 * write (update / upsert / insert) that could set `status` to `'approved'`.
 *
 * IN SCOPE / OUT OF SCOPE:
 *   • Flags: a `supabase.from("paige_pending_approvals").update|upsert|insert({ ... })` anywhere in
 *     src/ (the frontend) whose payload is not statically provable approve-free. Use
 *     `supabase.functions.invoke("execute-approval", ...)` to approve.
 *   • Does NOT flag a decline (`status: "rejected" | "skipped" | "escalated" | "changes_requested"`)
 *     or an initial `status: "pending"` — none of those is the execute transition (a decline
 *     executes nothing; pending is the not-yet-decided state a mint lands in). A unified decline
 *     seam is a separate, tracked follow-up.
 *   • Does NOT scan supabase/functions/** — the seam (execute-approval) and send-message are the
 *     ONE sanctioned server-side writers of `approved`.
 *   • Does NOT flag a different table's `status: "approved"` (e.g. readiness proposals) — the match
 *     is scoped to a write chained off `from("paige_pending_approvals")`.
 *
 * If you have a genuine exception, mark the offending line `// approval-write-exempt: <reason>`.
 *
 * FAIL-CLOSED (Codex peer-gate, 2026-09-13, hardened again same day). The guard does NOT merely
 * grep for the literal "approved": that misses the payload-variable style (`const patch = { status:
 * "approved" }; .update(patch)`), the shorthand `.update({ status })`, a QUOTED key
 * (`.update({ "status": "approved" })`), and a computed-static key (`.update({ ["status"]: ... })`)
 * — all of which bypass execute-approval. Instead, EVERY `from("paige_pending_approvals")
 * .update|upsert|insert(<payload>, …)` in src/ is flagged UNLESS its FIRST argument (the payload —
 * PostgREST's optional second `{ count }` options arg is never the payload) is statically provable
 * approve-free: a single inline object literal with no spread, no dynamic (`[expr]`) key, whose
 * top-level `status` — recognised as a bare, quoted, OR computed-static-string key (an ESCAPED key
 * such as `"\x73tatus"` fails closed; a real column key never carries an escape) — is either absent
 * or a NON-APPROVE string literal (rejected|skipped|escalated|changes_requested|pending). A variable
 * payload, a spread, a dynamic computed key, a shorthand/computed/ternary status, or an `approved`
 * literal all FAIL.
 *
 * DEFENSE IN DEPTH, not the sole enforcement (§13 honesty about a text lint's limits). This is a
 * regression tripwire on the realistic frontend shape (`supabase.from(...).write(...)`). It cannot
 * see through an aliased client, a table name held in a variable (`from(tbl)`), a chain split
 * across statements (`const q = supabase.from(...); q.update(...)`), or a table name spelled with a
 * JS string escape that decodes to the real name (`from("paige_pending_\x61pprovals")` / `a`) —
 * a deliberate obfuscation no honest column/table reference uses, the same documented structural
 * class as the variable/aliased-table limits above (owner ruling 2026: the mini-lexer's scope is
 * sufficient and these limits are the accepted defense-in-depth boundary — it is NOT to grow into a
 * partial TS parser). The REAL enforcement is the server execute-approval seam + the DB direct-approve
 * guard (which throws 42501 on an orchestration row, INSERT and UPDATE, regardless of how the frontend
 * spelled the table); this guard keeps the frontend honest so an ACCIDENTAL regression surfaces in CI,
 * not in production. Closing the escaped-literal + non-orchestration write at the DB layer is the §59
 * next slice (task #18), where the enforcement belongs.
 *
 *   node scripts/ci/approval-direct-write-lint.mjs
 *   node scripts/ci/approval-direct-write-lint.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "src";
const ESCAPE = "approval-write-exempt:";

// Statuses the frontend MAY write directly — none is the execute transition. A decline executes
// nothing; `pending` is the initial not-yet-decided state (the default a mint lands in). `approved`
// is the ONE the frontend must never write itself (it bypasses execution + Rail/receipt).
const SAFE_STATUS = new Set(["rejected", "skipped", "escalated", "changes_requested", "pending"]);

// Locate `from("paige_pending_approvals")` — tolerating a TS assertion on the table argument
// (`from("paige_pending_approvals" as any)`, the repo's common untyped-Supabase idiom; `[^)]*` spans
// the ` as <type>` up to the closing paren), whitespace before EITHER call paren (`from (…)`,
// `.update (…)` — JS allows it and no lint forbids it), and an explicit TS generic type argument on
// either call (`from<T>(…)`, `.update<any>(…)` — the PostgREST client exposes generic update/insert/
// upsert; `<[^(]*>` spans the type arg, backtracking so nested generics like `<Foo<Bar>>` still
// match) and optional chaining on the write (`.from(…)?.update(…)`) — immediately chained to
// `.update(`/`.upsert(`/`.insert(` (whitespace/newlines only between
// the `)` and the write — a `.select()`/`.eq()` in between is a read, not this write, and the tight
// adjacency also means a read here + an approved-write to a DIFFERENT table nearby is NOT conflated).
// The capture ends at the `(` of the write; the argument list is then extracted with a
// brace/paren/string-aware walker. Backtick table names are covered too.
const FROM_WRITE = /from(?:\s*<[^(]*>)?\s*\(\s*["'`]paige_pending_approvals["'`][^)]*\)\s*\??\.\s*(?:update|upsert|insert)(?:\s*<[^(]*>)?\s*\(/g;

// Comments are BLANKED to spaces (newlines kept), not deleted, so reported line numbers still match
// the real file. This is a mini-LEXER for the three constructs that contain a `/` ambiguously —
// string/template literals, comments, and REGEX literals — so none of them can be mis-read as the
// other: a `//`/`/*` inside a string or a regex is left intact (Codex round 8), and a regex literal
// whose body contains `/*` (e.g. `/[/*]/`) is NOT mistaken for an unterminated block comment that
// would blank the rest of the file (Codex round 9). A TRAILING line comment (not just a line-start
// one) is blanked so a comment between a `from(...)` and its chained `.update(...)` can never split
// the match. A `${…}` interpolation is treated as part of its template literal (no from()->write
// chain is ever authored inside one — irrelevant to scope).
//
// regex-vs-division: a `/` begins a regex literal when an expression is expected — i.e. the previous
// significant char is a punctuator that cannot end a value, or the preceding token is a keyword
// (return/typeof/…). Otherwise it is the division operator (or a comment, handled above). This is the
// standard tokenizer heuristic; an imperfect call only matters here if it changed a
// paige_pending_approvals from()->write match, which a `/`-token never participates in.
const EXPR_BEFORE_REGEX = new Set([..."(,=:[!&|?{;<>+-*%^~"]);
const REGEX_KEYWORD = /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|do|else|yield|await|case)$/;
function strip(t) {
  let out = "";
  let str = null; // active string delimiter: ' " or `
  const lastSignificant = () => {
    for (let k = out.length - 1; k >= 0; k--) if (!/\s/.test(out[k])) return out[k];
    return "";
  };
  for (let i = 0; i < t.length; ) {
    const c = t[i];
    if (str) {
      out += c;
      if (c === "\\") { if (i + 1 < t.length) out += t[i + 1]; i += 2; continue; } // escape: copy next verbatim
      if (c === str) str = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { str = c; out += c; i += 1; continue; }
    if (c === "/" && t[i + 1] === "/") { // line comment → blank to EOL, keep the newline
      while (i < t.length && t[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (c === "/" && t[i + 1] === "*") { // block comment → blank to */, keep newlines
      out += "  "; i += 2;
      while (i < t.length && !(t[i] === "*" && t[i + 1] === "/")) { out += t[i] === "\n" ? "\n" : " "; i += 1; }
      if (i < t.length) { out += "  "; i += 2; }
      continue;
    }
    if (c === "/") { // a lone `/` — regex literal or division?
      const p = lastSignificant();
      if (p === "" || EXPR_BEFORE_REGEX.has(p) || REGEX_KEYWORD.test(out)) {
        // regex literal: copy verbatim, respecting \ escapes and [...] classes (a `/` inside a class
        // does not close it); bail on a newline (a regex literal cannot span lines).
        out += c; i += 1;
        let inClass = false;
        while (i < t.length) {
          const rc = t[i];
          if (rc === "\n") break;
          out += rc;
          if (rc === "\\") { if (i + 1 < t.length) out += t[i + 1]; i += 2; continue; }
          if (rc === "[") inClass = true;
          else if (rc === "]") inClass = false;
          else if (rc === "/" && !inClass) { i += 1; break; }
          i += 1;
        }
        continue;
      }
      out += c; i += 1; continue; // division operator
    }
    out += c;
    i += 1;
  }
  return out;
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

// From `text[open]` == "(" of the write, return the FULL argument-list source (between the parens),
// respecting nested (){}[] and string literals. Returns null if unbalanced.
function extractCallArg(text, openParen) {
  let depth = 0, i = openParen, str = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (str) { if (c === "\\") i++; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; continue; }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") { depth--; if (depth === 0) return text.slice(openParen + 1, i); }
  }
  return null;
}

// Split a source fragment into its TOP-LEVEL entries (depth-0 commas), string/nesting-aware.
// Used both to peel the first (payload) argument off the arg list AND to walk an object literal's
// own top-level members.
function topLevelEntries(body) {
  const entries = [];
  let depth = 0, str = null, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (str) { if (c === "\\") i++; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; continue; }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) { entries.push(body.slice(start, i)); start = i + 1; }
  }
  entries.push(body.slice(start));
  return entries.map((e) => e.trim()).filter(Boolean);
}

// Classify one top-level object-literal entry's KEY, and (when it is the status column) its VALUE.
//   key: "status"  — the status column, written as a bare / quoted / computed-static-string key
//        "unknown" — a dynamic computed key (`[expr]`) that COULD be status → unprovable
//        "other"   — a provably-different field
//   value: the raw value source when key === "status" (null for a shorthand `{ status }`).
function classifyEntry(entry) {
  const e = entry.trim();
  // computed key: [ ... ] : value
  if (e.startsWith("[")) {
    const mStatic = /^\[\s*(["'`])([^"'`]*)\1\s*\]\s*:\s*([\s\S]+)$/.exec(e);
    if (mStatic) {
      // A backslash escape (e.g. ["status"]) decodes to a real key we don't cheaply resolve —
      // it could BE status, so fail closed. A genuine column key never contains an escape.
      if (mStatic[2].includes("\\")) return { key: "unknown", value: null };
      return { key: mStatic[2] === "status" ? "status" : "other", value: mStatic[3].trim() };
    }
    return { key: "unknown", value: null }; // dynamic computed key — could BE status
  }
  // quoted key: "status": value | 'status': value | `status`: value
  const mQuoted = /^(["'`])([^"'`]*)\1\s*:\s*([\s\S]+)$/.exec(e);
  if (mQuoted) {
    if (mQuoted[2].includes("\\")) return { key: "unknown", value: null }; // escaped key (e.g. "\x73tatus") could decode to status
    return { key: mQuoted[2] === "status" ? "status" : "other", value: mQuoted[3].trim() };
  }
  // bare identifier: status: value | status (shorthand) | otherName: value | otherName
  const mBare = /^([A-Za-z_$][\w$]*)\s*(?::\s*([\s\S]+))?$/.exec(e);
  if (mBare) {
    if (mBare[1] !== "status") return { key: "other", value: null };
    return { key: "status", value: mBare[2] === undefined ? null : mBare[2].trim() };
  }
  return { key: "unknown", value: null }; // unparseable — be conservative
}

// A NON-APPROVE status literal: a quoted lowercase word in the SAFE_STATUS set. A trailing TS
// assertion (`as const`, `as SomeType`) is tolerated — it is idiomatic for status literals. Anything
// non-literal (a variable, a ternary, a computed value) returns false → the caller fails closed.
function isSafeStatusLiteral(value) {
  const bare = value.replace(/\s+as\s+[A-Za-z_$][\w$.]*$/, "").trim();
  const m = /^(["'`])([a-z_]+)\1$/.exec(bare);
  return m ? SAFE_STATUS.has(m[2]) : false;
}

// PROVABLY approve-free? Only a single inline object literal, no spread, no dynamic key, whose
// top-level `status` (bare/quoted/computed-static) is absent or a NON-APPROVE literal. Else false.
function isProvablyApproveFree(payload) {
  const a = payload.trim();
  if (!(a.startsWith("{") && a.endsWith("}"))) return false; // variable / array / call / non-literal
  const entries = topLevelEntries(a.slice(1, -1));
  for (const e of entries) {
    if (e.startsWith("...")) return false; // a spread could carry status:'approved'
    const { key, value } = classifyEntry(e);
    if (key === "other") continue;         // a provably-non-status field — irrelevant
    if (key === "unknown") return false;   // a dynamic computed key could BE status — unprovable
    if (value === null) return false;      // shorthand `{ status }` — the variable is unprovable
    if (!isSafeStatusLiteral(value)) return false; // approved, a variable, a ternary, computed — unprovable
  }
  return true; // no status entry, or every status entry is a non-approve literal
}

export function scan(files) {
  const problems = [];
  for (const [p, raw] of files) {
    const stripped = strip(raw);
    const rawLines = raw.split("\n");
    FROM_WRITE.lastIndex = 0;
    let m;
    while ((m = FROM_WRITE.exec(stripped)) !== null) {
      const openParen = m.index + m[0].length - 1; // the "(" of the write call
      const argList = extractCallArg(stripped, openParen);
      // FAIL-CLOSED (owner ruling 2026-09-13): if the guard cannot confidently CLASSIFY the payload — the
      // arg walker could not balance it (e.g. a regex literal inside the args throws off the paren count) —
      // it must FLAG the write, not skip it. A null payload is therefore unprovable, so it falls through to
      // the ESCAPE check + problems.push below rather than being silently allowed. This keeps the mini-lexer's
      // documented structural limits as a defense-in-depth boundary (an explained `approval-write-exempt:`
      // marker still lets a human clear a genuinely-safe unparseable line), never a silent bypass.
      const payload = argList === null ? null : (topLevelEntries(argList)[0] ?? ""); // FIRST arg only — PostgREST options is the 2nd
      if (payload !== null && isProvablyApproveFree(payload)) continue;
      const ln = lineAt(stripped, openParen);
      if ((rawLines[ln - 1] ?? "").includes(ESCAPE)) continue; // a deliberate, explained exception
      problems.push(
        `${p}:${ln} — a paige_pending_approvals .update()/.upsert()/.insert() whose payload is not provably approve-free. ` +
        `Route approve through supabase.functions.invoke("execute-approval", { body: { approval_id } }) ` +
        `(§10/§18) — it re-scopes the id server-side, claims once, EXECUTES, and writes Rail + receipt. ` +
        `A direct status='approved' write bypasses the seam and silent-drops a message send. ` +
        `(Allowed: an inline literal whose status is absent or a non-approve literal — rejected/skipped/escalated/changes_requested/pending.)`,
      );
    }
  }
  return problems;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { out.push(...walk(full)); continue; }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue; // tests don't ship to users
    out.push(full);
  }
  return out;
}

if (process.argv.includes("--self-test")) {
  const cases = [
    ["catches a direct approved write (inline literal)",
      [["f.ts", 'await supabase.from("paige_pending_approvals").update({ status: "approved", reviewed_at: x }).in("id", ids);']], 1],
    ["catches a ternary that can produce approved",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: decision === "approve" ? "approved" : "rejected" }).eq("id", id);']], 1],
    ["catches approved even when status is not the first field",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ reviewed_at: now, status: "approved" }).eq("id", id);']], 1],
    ["FAIL-CLOSED: catches a variable payload (.update(patch))",
      [["f.ts", 'const patch = { status: "approved" };\nsupabase.from("paige_pending_approvals").update(patch).eq("id", id);']], 1],
    ["FAIL-CLOSED: catches a variable/computed status",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: st }).eq("id", id);']], 1],
    ["FAIL-CLOSED: catches shorthand status",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status }).eq("id", id);']], 1],
    ["FAIL-CLOSED: catches a spread payload (could carry approved)",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ ...base, reviewed_at: now }).eq("id", id);']], 1],
    ["FAIL-CLOSED: catches .upsert",
      [["f.ts", 'supabase.from("paige_pending_approvals").upsert({ status: "approved" });']], 1],
    ["FAIL-CLOSED: catches a backtick table + backtick approved literal",
      [["f.ts", 'supabase.from(`paige_pending_approvals`).update({ status: `approved` });']], 1],
    // Codex 2026-09-13 P2 #1 — a QUOTED status key must not read as absent.
    ["FAIL-CLOSED: catches a QUOTED status key ({ \"status\": \"approved\" })",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ "status": "approved" }).eq("id", id);']], 1],
    ["FAIL-CLOSED: catches a computed-static status key ({ [\"status\"]: \"approved\" })",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ ["status"]: "approved" }).eq("id", id);']], 1],
    ["FAIL-CLOSED: catches a DYNAMIC computed key (could be status)",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ [col]: val }).eq("id", id);']], 1],
    // Codex 2026-09-13 round 3 P2 — an escaped static key decodes to `status` but reads differently raw.
    ["FAIL-CLOSED: catches an escaped quoted status key (\\x escape decodes to status)",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ "\\x73tatus": "approved" }).eq("id", id);']], 1],
    ["FAIL-CLOSED: catches an escaped computed-static status key (\\u escape)",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ ["\\u0073tatus"]: "approved" }).eq("id", id);']], 1],
    ["allows a QUOTED status key with a decline literal ({ \"status\": \"rejected\" })",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ "status": "rejected" }).eq("id", id);']], 0],
    // Codex 2026-09-13 P2 #3 — the insert path.
    ["catches an approved INSERT",
      [["f.ts", 'supabase.from("paige_pending_approvals").insert({ status: "approved", tenant_id: t });']], 1],
    ["allows an insert with NO status (defaults to pending)",
      [["f.ts", 'supabase.from("paige_pending_approvals").insert({ tenant_id: t, summary: s });']], 0],
    ["allows an insert with an explicit pending status",
      [["f.ts", 'supabase.from("paige_pending_approvals").insert({ status: "pending", tenant_id: t });']], 0],
    ["allows an insert with a decline status",
      [["f.ts", 'supabase.from("paige_pending_approvals").insert({ status: "rejected", tenant_id: t });']], 0],
    // Codex 2026-09-13 P2 #2 — the PostgREST options 2nd arg must not corrupt payload parsing.
    ["allows a decline WITH a PostgREST options arg (options is not the payload)",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: "rejected" }, { count: "exact" }).eq("id", id);']], 0],
    ["catches an approved write even WITH an options arg",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: "approved" }, { count: "exact" }).eq("id", id);']], 1],
    // Codex 2026-09-13 round 4 P2 — a TS assertion on the table arg (`from("..." as any)`) must not evade the match.
    ["catches an approved write with an `as any` table assertion",
      [["f.ts", 'supabase.from("paige_pending_approvals" as any).update({ status: "approved" }).eq("id", id);']], 1],
    ["ignores a decline with an `as any` table assertion",
      [["f.ts", 'supabase.from("paige_pending_approvals" as any).update({ status: "rejected" }).eq("id", id);']], 0],
    // Codex 2026-09-13 round 5 P2 — whitespace before either call paren must not evade the match.
    ["catches an approved write with a space before from(",
      [["f.ts", 'supabase.from ("paige_pending_approvals").update({ status: "approved" }).eq("id", id);']], 1],
    ["catches an approved write with a space before update(",
      [["f.ts", 'supabase.from("paige_pending_approvals").update ({ status: "approved" }).eq("id", id);']], 1],
    // Codex 2026-09-13 round 7 P2 — an explicit TS generic type arg on the method must not evade the match.
    ["catches an approved write with a generic type arg (.update<any>(…))",
      [["f.ts", 'supabase.from("paige_pending_approvals").update<any>({ status: "approved" }).eq("id", id);']], 1],
    ["ignores a decline with a generic type arg (.update<Row>(…))",
      [["f.ts", 'supabase.from("paige_pending_approvals").update<Row>({ status: "rejected" }).eq("id", id);']], 0],
    // Preemptive (round-7 hardening): optional chaining on the write must not evade the match.
    ["catches an approved write via optional chaining (.from(…)?.update(…))",
      [["f.ts", 'supabase.from("paige_pending_approvals")?.update({ status: "approved" }).eq("id", id);']], 1],
    // Codex 2026-09-13 round 8 P2 — a TRAILING line comment between from() and the write must be blanked.
    ["catches an approved write with a trailing comment between from() and .update()",
      [["f.ts", 'supabase.from("paige_pending_approvals") // target queue\n  .update({ status: "approved" }).eq("id", id);']], 1],
    ["does NOT blank a // that lives inside the table string literal",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: "approved", note: "see http://x" }).eq("id", id);']], 1],
    // Codex 2026-09-13 round 9 P2 — a regex literal containing /* must NOT be read as a block comment.
    ["a regex literal containing /* does not blank a later approved write",
      [["f.ts", 'const separator = /[/*]/;\nsupabase.from("paige_pending_approvals").update({ status: "approved" }).eq("id", id);']], 1],
    ["a regex with an escaped slash does not swallow a later approved write",
      [["f.ts", 'const re = /a\\/\\*b/;\nsupabase.from("paige_pending_approvals").update({ status: "approved" });']], 1],
    // Owner ruling 2026-09-13 — FAIL-CLOSED on an unparseable payload: a regex literal INSIDE the write
    // args ( /[(]/ ) leaves the arg walker's paren count unbalanced, so extractCallArg returns null. This
    // ternary genuinely produces "approved", so skipping it would be a real bypass — it must be FLAGGED.
    ["FAIL-CLOSED: an unparseable payload (regex literal confuses the arg walker) is flagged, not skipped",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: /[(]/.test(x) ? "approved" : "rejected" }).eq("id", id);']], 1],
    // And a genuinely-safe-but-unparseable line can still be cleared with an explained exemption.
    ["allows an unparseable-payload write that carries an explained exemption",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ note: /[(]/.source }).eq("id", id); // approval-write-exempt: no status field, regex is data']], 0],
    // TS `as const` / `as T` assertions on the status literal must be tolerated (idiomatic here).
    ["allows a decline literal with an `as const` assertion",
      [["f.ts", 'supabase.from("paige_pending_approvals").insert({ status: "pending" as const, tenant_id: t });']], 0],
    ["catches an approved literal even with an `as const` assertion",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: "approved" as const }).eq("id", id);']], 1],
    ["ignores a decline (rejected) inline write",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: "rejected", reviewed_at: x }).eq("id", id);']], 0],
    ["ignores another decline state (skipped)",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: "skipped" }).eq("id", id);']], 0],
    ["ignores an update that sets NO status (e.g. a reassign)",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ assigned_to_user_id: u, reviewed_at: x }).eq("id", id);']], 0],
    ["ignores a different table's approved write (readiness proposals)",
      [["f.ts", 'supabase.from("readiness_proposals").update({ status: "approved", approved_by: u }).eq("id", id);']], 0],
    ["ignores a different table's approved INSERT",
      [["f.ts", 'supabase.from("readiness_proposals").insert({ status: "approved", approved_by: u });']], 0],
    ["ignores a READ on the table then an approved write to a DIFFERENT table nearby (no cross-statement conflation)",
      [["f.ts", 'const { data } = await supabase.from("paige_pending_approvals").select("id").eq("id", id);\nawait supabase.from("readiness_proposals").update({ status: "approved" }).eq("id", id);']], 0],
    ["ignores the canonical execute-approval seam call",
      [["f.ts", 'await supabase.functions.invoke("execute-approval", { body: { approval_id: id } });']], 0],
    ["ignores its own explanatory comment",
      [["f.ts", '// never write from("paige_pending_approvals").update({ status: "approved" }) directly']], 0],
    ["allows an explained exemption",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: "approved" }).eq("id", id); // approval-write-exempt: service-role backfill test double']], 0],
    ["reports the REAL line number, not a comment-stripped one",
      [["f.ts", '// pad\n/* pad\n   pad */\nsupabase.from("paige_pending_approvals").update({ status: "approved" }).eq("id", id);']], "f.ts:4"],
  ];
  let bad = 0;
  for (const [name, files, want] of cases) {
    const found = scan(files);
    const ok = typeof want === "string" ? found.some((p) => p.includes(want)) : found.length === want;
    if (ok) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} — expected ${JSON.stringify(want)}, got ${JSON.stringify(found)}`); bad++; }
  }
  console.log(bad ? `\n✗ approval-direct-write-lint self-test: ${bad} failure(s).` : "\n✓ approval-direct-write-lint self-test passed.");
  process.exit(bad ? 1 : 0);
}

if (!fs.existsSync(ROOT)) {
  console.log(`✗ approval-direct-write-lint: '${ROOT}/' not found — that is a resolver failure, not a pass.`);
  process.exit(1);
}
const files = walk(ROOT).map((f) => [f, fs.readFileSync(f, "utf8")]);
const problems = scan(files);
if (problems.length) {
  console.log(`✗ approval-direct-write-lint: ${problems.length} direct approved-write(s) to paige_pending_approvals.\n`);
  for (const p of problems) console.log(`  • ${p}`);
  console.log("\n  The approve path is the canonical execute-approval seam (§10/§18); a direct status='approved'");
  console.log("  write bypasses execution + Rail/receipt and silent-drops a message send. See docs/doctrine/one-approval-gate.md.");
  process.exit(1);
}
console.log(`✓ approval-direct-write-lint: ${files.length} src file(s) checked, no direct approved-write to paige_pending_approvals.`);
