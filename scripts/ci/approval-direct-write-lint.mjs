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
 * a message row it marks the row approved WITHOUT SENDING (the silent-drop). For an orchestration
 * row the DB direct-approve guard throws 42501 on exactly this write — but ONLY on an UPDATE, so an
 * approved-row INSERT would slip past it; this lint covers the insert path too (§37 producer walk).
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
 * see through an aliased client, a table name held in a variable (`from(tbl)`), or a chain split
 * across statements (`const q = supabase.from(...); q.update(...)`). The REAL enforcement is the
 * server execute-approval seam + the DB direct-approve guard (which throws 42501 on an orchestration
 * row); this guard keeps the frontend honest so a regression surfaces in CI, not in production.
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
// the ` as <type>` up to the closing paren) — immediately chained to `.update(`/`.upsert(`/`.insert(`
// (whitespace/newlines only between the `)` and the write — a `.select()`/`.eq()` in between is a
// read, not this write, and the tight adjacency also means a read here + an approved-write to a
// DIFFERENT table nearby is NOT conflated). The capture ends at the `(` of the write; the argument
// list is then extracted with a brace/paren/string-aware walker. Backtick table names are covered too.
const FROM_WRITE = /from\(\s*["'`]paige_pending_approvals["'`][^)]*\)\s*\.(?:update|upsert|insert)\(/g;

// Comments are BLANKED, not deleted, so reported line numbers still match the real file.
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
   .replace(/^(\s*)\/\/.*$/gm, (_m, indent) => indent);

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
      if (argList === null) continue; // unbalanced — leave it to tsc/eslint
      const payload = topLevelEntries(argList)[0] ?? ""; // FIRST arg only — PostgREST options is the 2nd
      if (isProvablyApproveFree(payload)) continue;
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
