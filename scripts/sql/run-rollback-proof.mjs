#!/usr/bin/env node
// Expand a rollback proof's `\i <path>` lines (psql meta-commands) into one plain SQL batch so
// the proof can be executed by anything that speaks SQL but not psql — the Supabase MCP
// execute_sql tool included. Prints the batch to stdout; writes nothing.
//   node scripts/sql/run-rollback-proof.mjs scripts/sql/platform-billing-account-proof.sql > /tmp/proof.sql
//   node scripts/sql/run-rollback-proof.mjs --mcp scripts/sql/platform-billing-account-proof.sql > /tmp/proof-mcp.sql
// `--mcp` derives the batch for a runner that returns ONLY result sets (the Supabase MCP tool):
// the migration's final `DO … RAISE NOTICE` reconcile block becomes a capture into the report
// row (ord 0, res 'info'), and the report's `failed` count excludes that row. Nothing else differs,
// so the batch that runs IS the committed file — never a hand-edited copy (lessons-learned 0d).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const mcp = args.includes("--mcp");
// `--lean` drops whole-line `--` comments and blank lines from the DERIVED batch so a large proof
// fits a transport with a payload ceiling. It is a scripted derivation of the committed file, never
// a hand-trimmed copy (lessons-learned 0d): the SQL is byte-identical, only non-executing lines go.
// A `--` inside a string literal would be mangled, so a line is dropped ONLY when the whole line is
// a comment, and the count of dropped lines is printed to stderr so the trim is visible.
const lean = args.includes("--lean");
const file = args.find((a) => !a.startsWith("--"));
if (!file) { console.error("usage: run-rollback-proof.mjs [--mcp] [--lean] <proof.sql>"); process.exit(2); }
let out = readFileSync(resolve(file), "utf8").split("\n").map((line) => {
  const m = line.match(/^\\i\s+(\S+)\s*$/);
  if (!m) return line;
  return `-- ── expanded from \\i ${m[1]} ──\n${readFileSync(resolve(m[1]), "utf8")}\n-- ── end ${m[1]} ──`;
}).join("\n");
if (mcp) {
  const notice = /DO \$\$\nDECLARE _r jsonb;\nBEGIN\n  _r := public\.platform_billing_account_reconcile\(\);\n  RAISE NOTICE 'platform_billing_account_reconcile: %', _r;\nEND \$\$;/;
  if (!notice.test(out)) { console.error("--mcp: the migration's RAISE NOTICE reconcile block was not found"); process.exit(2); }
  out = out.replace(notice,
    "CREATE TEMP TABLE _first ON COMMIT DROP AS SELECT public.platform_billing_account_reconcile() AS r;\n" +
    "INSERT INTO _p SELECT 0, 'info', 'first reconcile: ' || (SELECT r::text FROM _first);");
  out = out.replace("count(*) FILTER (WHERE res<>'ok') AS failed", "count(*) FILTER (WHERE res NOT IN ('ok','info')) AS failed");
}
if (lean) {
  const before = out.split("\n").length;
  out = out.split("\n").filter((l) => l.trim() !== "" && !l.trimStart().startsWith("--")).join("\n");
  console.error(`--lean: ${before - out.split("\n").length} comment/blank lines dropped; SQL unchanged`);
}
process.stdout.write(out);
