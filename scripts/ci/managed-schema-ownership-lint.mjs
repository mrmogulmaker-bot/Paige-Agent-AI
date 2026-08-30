#!/usr/bin/env node
/**
 * managed-schema-ownership-lint.mjs — fresh-replay anti-recurrence guard (#643).
 *
 * WHY: Supabase owns the objects in its platform schemas. `realtime.messages` is owned by
 * `supabase_realtime_admin`; the role migrations replay as (`postgres`) is NOT a member of
 * it and is NOT a superuser. Postgres requires table OWNERSHIP for ALTER TABLE / DROP
 * TABLE, so such a statement aimed at a managed schema fails a fresh replay with
 *
 *     ERROR: must be owner of table <t> (SQLSTATE 42501)
 *
 * On production these migrations were applied through the dashboard/MCP as a more
 * privileged role, so the statement "worked" there and the defect stayed invisible — until
 * a Supabase Preview branch replays the history as `postgres` and dies on it. That is
 * exactly how 20260419181105 broke the fresh replay: its
 * `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` was both unauthorized AND
 * redundant, because Supabase already ships that table with RLS enabled.
 *
 * SCOPE IS DELIBERATELY NARROW — every rule here is MEASURED on preview branch
 * `zinrefueodvexodnfstm`, not inferred. What was actually observed:
 *
 *   REFUSED   ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY   -> 42501
 *   ALLOWED   CREATE POLICY ... ON realtime.messages ...                -> succeeded
 *   ALLOWED   DROP POLICY ... ON realtime.messages                      -> succeeded
 *   ALLOWED   CREATE TRIGGER ... ON auth.users                          -> succeeded
 *             (on_auth_user_created and trg_handle_new_user_referral both exist there)
 *
 * So policies and triggers on managed schemas are NOT flagged: they demonstrably work, and
 * policies are the SUPPORTED Realtime Authorization mechanism. 114 CREATE/DROP POLICY
 * statements against managed schemas exist across the history and every one is legitimate.
 * Guarding them would red-light working migrations, which is worse than no guard at all.
 *
 * DROP TABLE is included alongside ALTER TABLE because Postgres imposes the identical
 * ownership requirement. There are currently zero instances, so it costs nothing and
 * closes the same hole.
 *
 * ANCHORING: patterns match only when the managed schema is the statement's TARGET, at the
 * start of a statement. A `public` table merely REFERENCING a managed one — e.g.
 * `alter table public.clients add column x uuid references auth.users(id)`, a real and
 * legal pattern in this repo — is NOT flagged.
 *
 * EXEMPT: a statement that genuinely must run against a managed schema opts out with an
 * inline comment anywhere in the same migration file:
 *   -- managed-schema-exempt: <reason>
 * The reason is required (a bare marker does not exempt).
 *
 * Deliberately regex-based and dependency-free so it runs anywhere `node` runs — the same
 * shape as view-security-invoker-lint.mjs and definer-fn-lint.mjs.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const EXEMPT_MARKER = /--\s*managed-schema-exempt\s*:\s*\S+/i;

/** Schemas Supabase provisions and owns. Migrations replay as `postgres`, which owns none. */
const MANAGED = [
  "realtime",
  "storage",
  "auth",
  "vault",
  "cron",
  "net",
  "graphql",
  "graphql_public",
  "supabase_functions",
  "pgmq",
  "pgsodium",
];
const SCHEMA = `(?:${MANAGED.join("|")})`;

/** Statement-anchored, ownership-requiring DDL. No cross-statement matching. */
const OFFENCES = [
  {
    what: "ALTER TABLE on a Supabase-managed schema",
    re: new RegExp(
      `^[ \\t]*alter[ \\t]+table[ \\t]+(?:if[ \\t]+exists[ \\t]+)?(?:only[ \\t]+)?(${SCHEMA})[ \\t]*\\.[ \\t]*("?)([a-zA-Z_]\\w*)\\2`,
      "gim",
    ),
  },
  {
    what: "DROP TABLE on a Supabase-managed schema",
    re: new RegExp(
      `^[ \\t]*drop[ \\t]+table[ \\t]+(?:if[ \\t]+exists[ \\t]+)?(${SCHEMA})[ \\t]*\\.[ \\t]*("?)([a-zA-Z_]\\w*)\\2`,
      "gim",
    ),
  },
];

/** Strip `--` line comments so a commented-out example never trips the lint. */
function stripLineComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      let inSingle = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === "'") inSingle = !inSingle;
        if (!inSingle && ch === "-" && line[i + 1] === "-") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const findings = [];
let exempted = 0;

for (const file of files) {
  const abs = join(MIGRATIONS_DIR, file);
  const raw = readFileSync(abs, "utf8");
  const sql = stripLineComments(raw);
  const isExempt = EXEMPT_MARKER.test(raw);

  for (const { what, re } of OFFENCES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(sql)) !== null) {
      if (isExempt) {
        exempted += 1;
        continue;
      }
      findings.push({
        file: relative(REPO_ROOT, abs),
        line: lineOf(sql, m.index),
        what,
        target: `${m[1]}.${m[3]}`,
        snippet: m[0].replace(/\s+/g, " ").trim().slice(0, 100),
      });
    }
  }
}

if (findings.length > 0) {
  console.error(
    `\n✗ managed-schema-ownership-lint: ${findings.length} statement(s) require ownership of a Supabase-managed object.\n` +
      `  Migrations replay as \`postgres\`, which owns none of these schemas, so a fresh\n` +
      `  database (every Supabase Preview branch) fails with 42501 "must be owner of table".\n`,
  );
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.what} -> ${f.target}`);
    console.error(`    ${f.snippet}`);
  }
  console.error(
    `\n  Fix: express the intent through a mechanism that does not require ownership.\n` +
      `  For Realtime authorization that means CREATE POLICY / DROP POLICY on realtime.messages,\n` +
      `  which is the supported path and is verified to succeed as \`postgres\`. Supabase already\n` +
      `  ships realtime.messages with RLS enabled, so ENABLE ROW LEVEL SECURITY is redundant as\n` +
      `  well as unauthorized.\n` +
      `  If a statement genuinely must stay, document it in the migration:\n` +
      `    -- managed-schema-exempt: <reason>\n`,
  );
  process.exit(1);
}

console.log(
  `✓ managed-schema-ownership-lint: ${files.length} migration(s) checked, ` +
    `no ownership-requiring statement targets a Supabase-managed schema` +
    (exempted > 0 ? ` (${exempted} exempted)` : "") +
    `.`,
);
