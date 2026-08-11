#!/usr/bin/env node
/**
 * definer-fn-lint.mjs — §9/§37 anti-recurrence guard (hotfix #117).
 *
 * WHY: A `SECURITY DEFINER` function runs as its OWNER (postgres) and BYPASSES row-level
 * security. If such a function is ALSO granted EXECUTE to `anon` or `PUBLIC`, an
 * unauthenticated caller can invoke privileged, RLS-bypassing logic — a tenant-isolation
 * hole (the #117 class). This lint fails CI when a migration both DEFINES a public
 * SECURITY DEFINER function AND grants EXECUTE on that same function to anon/PUBLIC,
 * unless an explicit inline exemption documents why that is safe.
 *
 * MODEL: scan supabase/migrations/*.sql. Within each file:
 *   - collect the names of functions CREATE[d] with `... SECURITY DEFINER ...`, and
 *   - collect the names granted `GRANT EXECUTE ON FUNCTION public.<name> ... TO anon|public`.
 * A file OFFENDS if any name appears in BOTH sets — i.e. the migration itself hands a
 * DEFINER function to anon/PUBLIC. (Cross-migration grants are intentionally out of scope:
 * this is a per-migration drift-guard, the same shape as view-security-invoker-lint.)
 *
 * EXEMPT: a genuinely-safe DEFINER function that must be anon/PUBLIC-callable (e.g. a
 * read of platform-public, non-tenant data) opts out with an inline comment anywhere in
 * the same migration file:
 *   -- definer-anon-exempt: <reason>
 * The reason is required (a bare marker does not exempt). One marker exempts the whole
 * file — keep such migrations small and single-purpose.
 *
 * Deliberately regex-based and dependency-free so it runs anywhere `node` runs.
 * Only the `public` schema is enforced (unqualified names default to public).
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const EXEMPT_MARKER = /--\s*definer-anon-exempt\s*:\s*\S+/i;

// CREATE [OR REPLACE] FUNCTION [public.]"name" ( ... )  — capture the name.
const CREATE_FN_RE =
  /create\s+(?:or\s+replace\s+)?function\s+(?:(public|"public")\s*\.\s*)?("?)([a-zA-Z_][a-zA-Z0-9_]*)\2\s*\(/gi;

// GRANT EXECUTE ON FUNCTION [public.]"name" ( ... ) ... TO ... anon|public ...
const GRANT_FN_RE =
  /grant\s+execute\s+on\s+function\s+(?:(public|"public")\s*\.\s*)?("?)([a-zA-Z_][a-zA-Z0-9_]*)\2\s*\(([^)]*)\)\s+to\s+([^;]+);/gi;

function schemaIsPublic(schemaGroup) {
  if (schemaGroup == null) return true; // unqualified => public via search_path
  return schemaGroup.replace(/"/g, "").toLowerCase() === "public";
}

/** Does the CREATE FUNCTION statement (from its match to the terminating `$function$;`
 *  / `$$;` / `;`) declare SECURITY DEFINER? Scan a generous window forward from the match. */
function createIsSecurityDefiner(fullText, matchIndex) {
  // A function body can contain semicolons, so look at a bounded header window
  // (SECURITY DEFINER always appears in the header, before the AS $...$ body).
  const window = fullText.slice(matchIndex, matchIndex + 2000);
  const asIdx = window.search(/\bas\s+(\$[a-zA-Z0-9_]*\$|')/i);
  const header = asIdx === -1 ? window : window.slice(0, asIdx);
  return /\bsecurity\s+definer\b/i.test(header);
}

function main() {
  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.toLowerCase().endsWith(".sql"))
      .sort();
  } catch (e) {
    console.error(`[definer-fn-lint] cannot read ${MIGRATIONS_DIR}: ${e.message}`);
    process.exit(1);
  }

  const offenders = [];

  for (const file of files) {
    const abs = join(MIGRATIONS_DIR, file);
    const text = readFileSync(abs, "utf8");

    if (EXEMPT_MARKER.test(text)) continue; // whole-file exemption

    const definerFns = new Set();
    for (const m of text.matchAll(CREATE_FN_RE)) {
      if (!schemaIsPublic(m[1])) continue;
      const idx = m.index ?? 0;
      if (createIsSecurityDefiner(text, idx)) definerFns.add(m[3].toLowerCase());
    }
    if (definerFns.size === 0) continue;

    for (const m of text.matchAll(GRANT_FN_RE)) {
      if (!schemaIsPublic(m[1])) continue;
      const name = m[3].toLowerCase();
      if (!definerFns.has(name)) continue;
      const grantees = m[5].toLowerCase();
      if (/\b(anon|public)\b/.test(grantees)) {
        offenders.push({ file, name, grantees: m[5].trim() });
      }
    }
  }

  if (offenders.length > 0) {
    console.error("");
    console.error("✗ definer-fn-lint FAILED — SECURITY DEFINER function(s) granted to anon/PUBLIC (§9/§37 #117):");
    for (const o of offenders) {
      console.error(
        `    • public.${o.name}  granted TO ${o.grantees}  (in ${relative(REPO_ROOT, join(MIGRATIONS_DIR, o.file))})`,
      );
    }
    console.error("");
    console.error("  A SECURITY DEFINER function runs as its OWNER and BYPASSES RLS. Granting it to");
    console.error("  anon/PUBLIC lets an unauthenticated caller invoke RLS-bypassing logic.");
    console.error("  Fix one of:");
    console.error("    1) GRANT EXECUTE only TO authenticated and/or service_role (never anon/public), or");
    console.error("    2) if the function is genuinely safe to expose (platform-public, non-tenant data),");
    console.error("       add `-- definer-anon-exempt: <reason>` in the same migration file.");
    console.error("");
    process.exit(1);
  }

  console.log("✓ definer-fn-lint: no public SECURITY DEFINER function is granted to anon/PUBLIC.");
  process.exit(0);
}

main();
