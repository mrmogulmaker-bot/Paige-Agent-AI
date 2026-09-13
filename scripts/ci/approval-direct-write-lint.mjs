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
 * row the DB direct-approve guard now throws 42501 on exactly this write.
 *
 * The mounted approve surfaces (ApprovalRow, DraftsAwaitingPanel, the Solo/Agency Command Center
 * hooks) already route approve through the seam. This guard LOCKS that in so it cannot silently
 * regress: it fails the build if any file under src/ performs a direct `paige_pending_approvals`
 * update that sets `status` to `'approved'`.
 *
 * IN SCOPE / OUT OF SCOPE:
 *   • Flags: a `supabase.from("paige_pending_approvals").update({ ... status: "approved" ... })`
 *     anywhere in src/ (the frontend). Use `supabase.functions.invoke("execute-approval", ...)`.
 *   • Does NOT flag a decline (`status: "rejected" | "skipped" | "escalated" | "changes_requested"`)
 *     — a decline executes nothing and is a decision write, not an execute (a unified decline seam
 *     is a separate, tracked follow-up).
 *   • Does NOT scan supabase/functions/** — the seam (execute-approval) and send-message are the
 *     ONE sanctioned server-side writers of `approved`.
 *   • Does NOT flag a different table's `status: "approved"` (e.g. readiness proposals) — the match
 *     is scoped to an update chained off `from("paige_pending_approvals")`.
 *
 * If you have a genuine exception, mark the offending line `// approval-write-exempt: <reason>`.
 *
 * FAIL-CLOSED (Codex peer-gate, 2026-09-13). The guard does NOT merely grep for the literal
 * "approved": that misses the payload-variable style (`const patch = { status: "approved" };
 * .update(patch)`) and the shorthand `.update({ status })`, both of which bypass execute-approval.
 * Instead, EVERY `from("paige_pending_approvals").update(<arg>)` in src/ is flagged UNLESS <arg> is
 * statically provable approve-free: a single inline object literal with no spread whose top-level
 * `status` is either absent (the update sets no status — e.g. a reassign) or a decline string
 * literal (rejected|skipped|escalated|changes_requested). A variable payload, a spread, a shorthand
 * `status`, a computed/ternary status, or a non-literal argument all FAIL.
 *
 * DEFENSE IN DEPTH, not the sole enforcement (§13 honesty about a text lint's limits). This is a
 * regression tripwire on the realistic frontend shape (`supabase.from(...).update(...)`). It cannot
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
const DECLINE = new Set(["rejected", "skipped", "escalated", "changes_requested"]);

// Locate `from("paige_pending_approvals")` immediately chained to `.update(`/`.upsert(`
// (whitespace/newlines only between them — a `.select()`/`.eq()` in between is a read, not this
// write, and the tight adjacency also means a read here + an approved-write to a DIFFERENT table
// nearby is NOT conflated). The capture ends at the `(` of the write; the argument is then
// extracted with a brace/paren/string-aware walker. Backtick table names are covered too.
const FROM_UPDATE = /from\(\s*["'`]paige_pending_approvals["'`]\s*\)\s*\.(?:update|upsert)\(/g;

// Comments are BLANKED, not deleted, so reported line numbers still match the real file.
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
   .replace(/^(\s*)\/\/.*$/gm, (_m, indent) => indent);

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

// From `text[open]` == "(" of `.update(`, return the argument source (between the parens),
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

// Split an object-literal body into its TOP-LEVEL entries (depth-0 commas), string/nesting-aware.
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

// PROVABLY approve-free? Only a single inline object literal, no spread, whose top-level `status`
// is absent or a decline string literal. Everything else is unprovable → caller flags it.
function isProvablyApproveFree(arg) {
  const a = arg.trim();
  if (!(a.startsWith("{") && a.endsWith("}"))) return false; // variable / call / non-literal
  const entries = topLevelEntries(a.slice(1, -1));
  for (const e of entries) {
    if (e.startsWith("...")) return false; // a spread could carry status:'approved'
    const kv = /^status\s*(?::\s*(.+))?$/s.exec(e);
    if (!kv) continue; // some other field — irrelevant
    const value = kv[1]?.trim();
    if (value === undefined) return false; // shorthand `{ status }` — the variable is unprovable
    const lit = /^["'`](rejected|skipped|escalated|changes_requested)["'`]$/.exec(value);
    if (!lit) return false; // approved, a variable, a ternary, a computed value — unprovable
  }
  return true; // no status entry, or every status entry is a decline literal
}

export function scan(files) {
  const problems = [];
  for (const [p, raw] of files) {
    const stripped = strip(raw);
    const rawLines = raw.split("\n");
    FROM_UPDATE.lastIndex = 0;
    let m;
    while ((m = FROM_UPDATE.exec(stripped)) !== null) {
      const openParen = m.index + m[0].length - 1; // the "(" of ".update("
      const arg = extractCallArg(stripped, openParen);
      if (arg === null) continue; // unbalanced — leave it to tsc/eslint
      if (isProvablyApproveFree(arg)) continue;
      const ln = lineAt(stripped, openParen);
      if ((rawLines[ln - 1] ?? "").includes(ESCAPE)) continue; // a deliberate, explained exception
      problems.push(
        `${p}:${ln} — a paige_pending_approvals .update()/.upsert() whose payload is not provably approve-free. ` +
        `Route approve through supabase.functions.invoke("execute-approval", { body: { approval_id } }) ` +
        `(§10/§18) — it re-scopes the id server-side, claims once, EXECUTES, and writes Rail + receipt. ` +
        `A direct status='approved' write bypasses the seam and silent-drops a message send. ` +
        `(Allowed: an inline literal whose status is absent or a decline — rejected/skipped/escalated/changes_requested.)`,
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
    ["ignores a decline (rejected) inline write",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: "rejected", reviewed_at: x }).eq("id", id);']], 0],
    ["ignores another decline state (skipped)",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: "skipped" }).eq("id", id);']], 0],
    ["ignores an update that sets NO status (e.g. a reassign)",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ assigned_to_user_id: u, reviewed_at: x }).eq("id", id);']], 0],
    ["ignores a different table's approved write (readiness proposals)",
      [["f.ts", 'supabase.from("readiness_proposals").update({ status: "approved", approved_by: u }).eq("id", id);']], 0],
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
