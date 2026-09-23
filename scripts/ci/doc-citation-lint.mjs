#!/usr/bin/env node
/**
 * doc-citation-lint — verify that `file:line` citations in a doc say what the doc claims.
 *
 * WHY THIS EXISTS. The Solo metric dictionary asserts facts about the codebase and anchors each one
 * to a `file:line`. Twice while writing it the same defect shipped: a migration was cited for
 * behaviour a LATER migration had already repealed.
 *
 *   - `20260711180000` seeded a default pipeline on tenant insert  →  repealed by `20260915000000`
 *   - `20260710200000` fell back to five default stages            →  repealed by `20260831224500`
 *
 * Both readings were correct about the file cited and wrong about the live schema, because Postgres
 * migrations are append-only: `create or replace function` means the newest definition wins and
 * every older one is a historical artefact that still greps cleanly. A prose rule ("check for a
 * later migration") already failed twice, so this is the assertion the build runs instead.
 *
 * THREE CHECKS:
 *   1. RESOLVES  — the cited file exists and actually has that many lines.
 *   2. STALE     — a citation into a migration that defines a function/table, where a LATER
 *                  migration redefines the same identifier. This is the class that bit us.
 *   3. QUOTED    — where the doc quotes code in backticks next to a citation, that text appears
 *                  within a small window of the cited line.
 *
 * Exit 1 on any RESOLVES or STALE failure. QUOTED mismatches warn: prose legitimately paraphrases.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase/migrations");
const docs = process.argv.slice(2);
if (!docs.length) {
  console.error("usage: doc-citation-lint.mjs <doc.md> [doc.md...]");
  process.exit(2);
}

const migrationFiles = existsSync(MIGRATIONS)
  ? readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()
  : [];

/** `20260713152601` -> `supabase/migrations/20260713152601_tier_dashboard_metrics.sql` */
function resolveMigration(prefix) {
  const hit = migrationFiles.find((f) => f.startsWith(prefix));
  return hit ? join("supabase/migrations", hit) : null;
}

/** A citation is `<path-or-14-digit-prefix>:<line>` or `...:<line>-<line>`, inside backticks. */
const CITATION = /`([A-Za-z0-9_./-]+?):(\d+)(?:-(\d+))?`/g;

/** Identifiers a migration line DEFINES — the things a later migration can silently supersede. */
const DEFINES = [
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/i,
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/i,
  /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:public\.)?([a-z0-9_]+)/i,
  /create\s+trigger\s+([a-z0-9_]+)/i,
];

const fileCache = new Map();
function lines(path) {
  if (!fileCache.has(path)) {
    fileCache.set(path, existsSync(path) ? readFileSync(path, "utf8").split("\n") : null);
  }
  return fileCache.get(path);
}

let failures = 0;
let warnings = 0;
let checked = 0;

for (const doc of docs) {
  if (!existsSync(doc)) {
    console.error(`✗ doc not found: ${doc}`);
    failures++;
    continue;
  }
  const text = readFileSync(doc, "utf8");
  const docLines = text.split("\n");

  for (const m of text.matchAll(CITATION)) {
    const [raw, ref, startStr, endStr] = m;
    const start = Number(startStr);
    const end = endStr ? Number(endStr) : start;
    // Which doc line is this on? (for a useful error)
    const docLine = text.slice(0, m.index).split("\n").length;

    const isMigrationPrefix = /^\d{14}$/.test(ref);
    const path = isMigrationPrefix ? resolveMigration(ref) : ref;

    if (!path) {
      console.error(`✗ ${doc}:${docLine}  ${raw} — no migration starts with ${ref}`);
      failures++;
      continue;
    }
    const body = lines(path);
    if (!body) {
      // Not every backticked `word:123` is a file reference; only fail when it looks like a path.
      if (ref.includes("/") || isMigrationPrefix) {
        console.error(`✗ ${doc}:${docLine}  ${raw} — file does not exist: ${path}`);
        failures++;
      }
      continue;
    }
    checked++;

    // (1) RESOLVES
    if (end > body.length) {
      console.error(`✗ ${doc}:${docLine}  ${raw} — ${path} has only ${body.length} lines`);
      failures++;
      continue;
    }

    // (2) STALE — only meaningful for migrations.
    // Walk BACKWARD from the cited line to the enclosing definition. Citing line 67 of a function
    // declared on line 26 is the normal case and the one that bit us twice — a check that only
    // fired on the declaration line would have passed on both real defects.
    if (path.startsWith("supabase/migrations/")) {
      let enclosing = null;
      for (let i = end - 1; i >= 0 && i > end - 400; i--) {
        for (const re of DEFINES) {
          const hit = body[i].match(re);
          if (hit) { enclosing = { ident: hit[1], at: i + 1 }; break; }
        }
        if (enclosing) break;
      }
      const cited = enclosing ? body[enclosing.at - 1] : "";
      for (const re of DEFINES) {
        const def = cited.match(re);
        if (!def) continue;
        const ident = def[1].toLowerCase();
        const thisFile = path.split("/").pop();
        // A definition is repealed by a later REDEFINITION *or* by a later DROP. The starter
        // auto-provisioner was removed by `drop function`, not replaced — so checking only for
        // redefinition would have missed one of the two defects that motivated this lint.
        const drops = new RegExp(
          String.raw`drop\s+(?:function|table|view|materialized\s+view|trigger)\s+(?:if\s+exists\s+)?(?:public\.)?` +
            ident.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            String.raw`\b`,
          "i",
        );
        const later = migrationFiles.filter((f) => f > thisFile).filter((f) => {
          const other = readFileSync(join(MIGRATIONS, f), "utf8");
          if (drops.test(other)) return true;
          return DEFINES.some((r) => {
            const g = new RegExp(r.source, "gi");
            for (const hit of other.matchAll(g)) if (hit[1].toLowerCase() === ident) return true;
            return false;
          });
        });
        if (later.length) {
          console.error(
            `✗ STALE  ${doc}:${docLine}  ${raw} sits inside \`${ident}\` (declared ${thisFile}:${enclosing.at}), which is redefined later by:\n` +
              later.map((f) => `           ${f}`).join("\n") +
              `\n           The cited migration is history; the newest definition is what runs.`,
          );
          failures++;
        }
        break;
      }
    }

    // (3) QUOTED — a backticked snippet on the same doc line should appear near the cited line
    const docLineText = docLines[docLine - 1] ?? "";
    const snippets = [...docLineText.matchAll(/`([^`]{12,})`/g)]
      .map((s) => s[1])
      .filter((s) => s !== raw.slice(1, -1) && !s.includes(":") && /[a-z_]/.test(s));
    if (snippets.length) {
      const windowText = body.slice(Math.max(0, start - 4), end + 3).join("\n");
      for (const snip of snippets) {
        const needle = snip.replace(/\s+/g, " ").trim();
        const hay = windowText.replace(/\s+/g, " ");
        if (needle.length >= 12 && !hay.includes(needle)) {
          console.warn(`⚠ QUOTED ${doc}:${docLine}  ${raw} — \`${needle.slice(0, 60)}\` not found within ±3 lines`);
          warnings++;
        }
      }
    }
  }
}

const verdict = failures ? "FAIL" : "PASS";
console.log(`\ndoc-citation-lint: ${verdict} — ${checked} citations resolved, ${failures} failure(s), ${warnings} warning(s).`);
process.exit(failures ? 1 : 0);
