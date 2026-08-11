#!/usr/bin/env node
/**
 * view-security-invoker-lint.mjs — §9/§30 anti-recurrence guard (hotfix #116).
 *
 * WHY: A public Postgres view with `security_invoker=off` (the default) runs as its
 * OWNER (postgres) and BYPASSES row-level security on the base tables — a tenant-
 * isolation hole. `CREATE OR REPLACE VIEW` does NOT carry a prior `WITH (security_invoker
 * =true)` forward, so views silently drift back to invoker=off on a later replace. This
 * lint fails CI when any public view's FINAL state in the migrations is not invoker=true
 * and it is not explicitly exempted.
 *
 * MODEL: scan supabase/migrations/*.sql in chronological (filename) order and, per view,
 * track "last write wins":
 *   - CREATE [OR REPLACE] VIEW [public.]name ... WITH (security_invoker=true) -> ON
 *   - CREATE [OR REPLACE] VIEW [public.]name           (no such WITH)         -> OFF (drift)
 *   - ALTER VIEW [public.]name SET (security_invoker = true|on)               -> ON
 *   - ALTER VIEW [public.]name SET (security_invoker = false|off)             -> OFF
 *   - ALTER VIEW [public.]name RESET (security_invoker)                       -> OFF
 * A view is OK if its final state is ON, or it is EXEMPT.
 *
 * EXEMPT: a genuinely non-tenant / DEFINER-by-design view opts out with an inline comment
 *   -- security-invoker-exempt: <reason>
 * placed within ~400 chars before its CREATE ... VIEW statement (i.e. directly above it).
 * The reason is required (a bare marker does not exempt).
 *
 * Deliberately regex-based and dependency-free so it runs anywhere `node` runs.
 * Only the `public` schema is enforced (unqualified view names default to public).
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const EXEMPT_MARKER = /--\s*security-invoker-exempt\s*:\s*\S+/i;

// CREATE [OR REPLACE] VIEW [IF NOT EXISTS] [public.]"name"
const CREATE_VIEW_RE =
  /create\s+(?:or\s+replace\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:(public|"public")\s*\.\s*)?("?)([a-zA-Z_][a-zA-Z0-9_]*)\2/gi;
// ALTER VIEW [public.]"name" SET|RESET ( ... security_invoker ... )
const ALTER_VIEW_RE =
  /alter\s+view\s+(?:(public|"public")\s*\.\s*)?("?)([a-zA-Z_][a-zA-Z0-9_]*)\2\s+(set|reset)\s*\(([^)]*security_invoker[^)]*)\)/gi;

/** Does a CREATE VIEW statement (from its match to the terminating `;`) declare invoker=true inline? */
function createDeclaresInvokerTrue(fullText, matchIndex) {
  const semi = fullText.indexOf(";", matchIndex);
  const stmt = fullText.slice(matchIndex, semi === -1 ? fullText.length : semi);
  return /security_invoker\s*=\s*(true|on)\b/i.test(stmt);
}

/** Is there an exempt marker in the window immediately preceding the CREATE? */
function hasExemptMarkerBefore(fullText, matchIndex) {
  const window = fullText.slice(Math.max(0, matchIndex - 400), matchIndex);
  return EXEMPT_MARKER.test(window);
}

function schemaIsPublic(schemaGroup) {
  // undefined schema => unqualified => defaults to public (search_path). Only "public" enforced.
  if (schemaGroup == null) return true;
  return schemaGroup.replace(/"/g, "").toLowerCase() === "public";
}

function main() {
  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.toLowerCase().endsWith(".sql"))
      .sort(); // timestamp-prefixed => lexicographic == chronological
  } catch (e) {
    console.error(`[view-invoker-lint] cannot read ${MIGRATIONS_DIR}: ${e.message}`);
    process.exit(1);
  }

  /** @type {Map<string, {state:'on'|'off', exempt:boolean, lastFile:string}>} */
  const views = new Map();

  for (const file of files) {
    const abs = join(MIGRATIONS_DIR, file);
    const text = readFileSync(abs, "utf8");

    // Collect statement events with their position so we can order within a file.
    const events = [];

    for (const m of text.matchAll(CREATE_VIEW_RE)) {
      if (!schemaIsPublic(m[1])) continue;
      const name = m[3];
      const idx = m.index ?? 0;
      const invokerTrue = createDeclaresInvokerTrue(text, idx);
      const exempt = hasExemptMarkerBefore(text, idx);
      events.push({ idx, name, kind: "create", on: invokerTrue, exempt });
    }
    for (const m of text.matchAll(ALTER_VIEW_RE)) {
      if (!schemaIsPublic(m[1])) continue;
      const name = m[3];
      const idx = m.index ?? 0;
      const op = m[4].toLowerCase();
      const body = m[5];
      let on;
      if (op === "reset") on = false;
      else on = /security_invoker\s*=\s*(true|on)\b/i.test(body); // set false/off => off
      events.push({ idx, name, kind: "alter", on, exempt: false });
    }

    events.sort((a, b) => a.idx - b.idx);
    for (const ev of events) {
      const prev = views.get(ev.name) || { state: "off", exempt: false, lastFile: file };
      const next = { state: ev.on ? "on" : "off", exempt: prev.exempt, lastFile: file };
      // CREATE resets the invoker state (drift) but an exempt marker on that CREATE
      // (or a prior one) keeps the view exempt.
      if (ev.kind === "create") next.exempt = ev.exempt;
      views.set(ev.name, next);
    }
  }

  const offenders = [];
  for (const [name, info] of views) {
    if (info.state === "on") continue;
    if (info.exempt) continue;
    offenders.push({ name, lastFile: info.lastFile });
  }

  if (offenders.length > 0) {
    console.error("");
    console.error("✗ view-security-invoker-lint FAILED — public view(s) missing security_invoker=true (§9/§30):");
    for (const o of offenders) {
      console.error(
        `    • public.${o.name}   (last touched in ${relative(REPO_ROOT, join(MIGRATIONS_DIR, o.lastFile))})`,
      );
    }
    console.error("");
    console.error("  A public view runs as its OWNER when security_invoker is off and BYPASSES RLS.");
    console.error("  Fix one of:");
    console.error("    1) add `WITH (security_invoker = true)` to the CREATE VIEW, or");
    console.error("    2) add `ALTER VIEW public.<name> SET (security_invoker = true);` in the same migration, or");
    console.error("    3) if it is a genuinely non-tenant / DEFINER-by-design view, put");
    console.error("       `-- security-invoker-exempt: <reason>` directly above the CREATE VIEW.");
    console.error("");
    process.exit(1);
  }

  console.log(`✓ view-security-invoker-lint: ${views.size} public view(s) checked, all invoker=true or exempt.`);
  process.exit(0);
}

main();
