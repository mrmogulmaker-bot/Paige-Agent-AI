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
 *   node scripts/ci/approval-direct-write-lint.mjs
 *   node scripts/ci/approval-direct-write-lint.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "src";
const ESCAPE = "approval-write-exempt:";

// A direct `from("paige_pending_approvals") ... .update({ ... status: <expr containing "approved"> })`.
// The `[^,}]*` after `status:` lets the literal be reached past a ternary (status: x ? "approved" : "rejected")
// while still stopping at the field boundary, so a sibling `status: "rejected"` field never matches.
const APPROVED_WRITE =
  /from\(\s*["']paige_pending_approvals["']\s*\)[\s\S]{0,400}?\.update\(\s*\{[\s\S]{0,400}?status\s*:\s*[^,}]*["']approved["']/g;

// Comments are BLANKED, not deleted, so reported line numbers still match the real file.
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
   .replace(/^(\s*)\/\/.*$/gm, (_m, indent) => indent);

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

export function scan(files) {
  const problems = [];
  for (const [p, raw] of files) {
    const stripped = strip(raw);
    const rawLines = raw.split("\n");
    APPROVED_WRITE.lastIndex = 0;
    let m;
    while ((m = APPROVED_WRITE.exec(stripped)) !== null) {
      // Report the line of the offending status literal (end of the match).
      const ln = lineAt(stripped, m.index + m[0].length);
      if ((rawLines[ln - 1] ?? "").includes(ESCAPE)) continue; // a deliberate, explained exception
      problems.push(
        `${p}:${ln} — direct paige_pending_approvals write of status='approved'. ` +
        `Route approve through supabase.functions.invoke("execute-approval", { body: { approval_id } }) ` +
        `(§10/§18) — it re-scopes the id server-side, claims once, EXECUTES, and writes Rail + receipt. ` +
        `A direct approved write bypasses the seam and silent-drops a message send.`,
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
    ["catches a direct approved write",
      [["f.ts", 'await supabase.from("paige_pending_approvals").update({ status: "approved", reviewed_at: x }).in("id", ids);']], 1],
    ["catches a ternary that can produce approved",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: decision === "approve" ? "approved" : "rejected" }).eq("id", id);']], 1],
    ["catches approved even when status is not the first field",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ reviewed_at: now, status: "approved" }).eq("id", id);']], 1],
    ["ignores a decline (rejected) write",
      [["f.ts", 'supabase.from("paige_pending_approvals").update({ status: "rejected", reviewed_at: x }).eq("id", id);']], 0],
    ["ignores a different table's approved write (readiness proposals)",
      [["f.ts", 'supabase.from("readiness_proposals").update({ status: "approved", approved_by: u }).eq("id", id);']], 0],
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
