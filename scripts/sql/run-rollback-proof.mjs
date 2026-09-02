#!/usr/bin/env node
// Expand a rollback proof's `\i <path>` lines (psql meta-commands) into one plain SQL batch so
// the proof can be executed by anything that speaks SQL but not psql — the Supabase MCP
// execute_sql tool included. Prints the batch to stdout; writes nothing.
//   node scripts/sql/run-rollback-proof.mjs scripts/sql/platform-billing-account-proof.sql > /tmp/proof.sql
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const file = process.argv[2];
if (!file) { console.error("usage: run-rollback-proof.mjs <proof.sql>"); process.exit(2); }
const out = readFileSync(resolve(file), "utf8").split("\n").map((line) => {
  const m = line.match(/^\\i\s+(\S+)\s*$/);
  if (!m) return line;
  return `-- ── expanded from \\i ${m[1]} ──\n${readFileSync(resolve(m[1]), "utf8")}\n-- ── end ${m[1]} ──`;
}).join("\n");
process.stdout.write(out);
