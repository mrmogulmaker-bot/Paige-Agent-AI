#!/usr/bin/env node
/**
 * rail-browser-grant-lint.mjs — §9/§58 anti-recurrence guard (recovery lane, Release B).
 *
 * WHY: PAIGE's raw Context Rail (`public.paige_client_events`) and its workspace-outcome
 * sibling (`public.paige_workspace_events`) carry attributable, audience-scoped, sometimes
 * free-text rows. The browser must NEVER read them directly — every owner-facing read goes
 * through a SECURITY DEFINER resolver (`get_solo_rail_activity`, `get_client_rail`) and every
 * Mind read through the safe SpineSignal projection. The single most expensive Rail defect on
 * record (#746 / #794) was a migration that GRANTed `SELECT` on `paige_client_events` to
 * `authenticated`; a later migration revoked it, and the whole "the Rail is empty" saga
 * followed from the window in between. Re-granting it would re-open the defective, still-present
 * `pce_staff_read` policy (the §59 global-role trap) that the table-privilege revoke is the only
 * thing containing. This lint fails CI if the NET effective grant state leaves ANY browser role
 * (`authenticated`, `anon`, `PUBLIC`) holding ANY privilege on a protected Rail table.
 *
 * NET STATE, not per-migration: migrations are replayed in filename order and each GRANT/REVOKE
 * that NAMES a protected table is applied, so the historical grant in `20260712190000` — which
 * two later migrations revoke — is correctly NOT flagged, while a NEW grant with no following
 * revoke IS. This is the honest check ("does the browser currently have raw-Rail access?"), and
 * it is why this guard is net-state where `definer-fn-lint`/`view-security-invoker-lint` are
 * per-migration: their hole is a single migration; this one is a grant-then-forget across two.
 *
 * NO EXEMPT MARKER, deliberately (unlike definer-fn-lint): there is no legitimate reason to grant
 * a browser role a privilege on the raw Rail — the resolvers are the only sanctioned path (§18).
 * Re-opening that hole should cost a reviewed edit to THIS guard with a written rationale, not an
 * inline bypass comment a busy migration can carry by accident.
 *
 * SCOPE (honest, §13): it parses GRANT/REVOKE statements that NAME a protected table (with or
 * without the `public.` qualifier and an optional `TABLE` keyword). It does NOT model blanket
 * `GRANT ... ON ALL TABLES IN SCHEMA public` — verified 2026-09-05 that no such browser-role
 * blanket grant exists in this repo; if one is ever added, extend this guard. Dependency-free
 * and regex-based so it runs anywhere `node` runs.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

export const PROTECTED_TABLES = new Set(["paige_client_events", "paige_workspace_events"]);
const BROWSER_ROLES = new Set(["authenticated", "anon", "public"]);

// GRANT|REVOKE <privs> ON [TABLE] [public.]<ident> TO|FROM <roles>;
// Privileges are a comma/space word list ("SELECT", "INSERT, UPDATE, DELETE", "ALL", "ALL PRIVILEGES").
const STMT_RE =
  /\b(grant|revoke)\s+([a-z ,]+?)\s+on\s+(?:table\s+)?(?:(?:"?public"?)\s*\.\s*)?("?)([a-z_][a-z0-9_$]*)\3\s+(to|from)\s+([^;]+);/gi;

function parseRoles(roleList) {
  return roleList
    .split(",")
    .map((r) => r.trim().replace(/"/g, "").toLowerCase())
    .filter((r) => BROWSER_ROLES.has(r));
}

function privSet(privString) {
  const s = privString.toLowerCase();
  if (/\ball\b/.test(s)) return new Set(["ALL"]);
  return new Set(
    s
      .split(/[, ]+/)
      .map((p) => p.trim())
      .filter(Boolean),
  );
}

/**
 * Pure core: replay a list of { file, text } migrations (already in apply order) and return the
 * browser roles still holding a privilege on each protected table at the end.
 *
 * @returns {{ offenders: Array<{table:string, role:string, privileges:string[], grantedIn:string}>, tablesSeen:number }}
 */
export function auditRailBrowserGrants(migrations) {
  // table -> role -> { privs:Set<string>, grantedIn:string }
  const state = new Map();
  for (const t of PROTECTED_TABLES) state.set(t, new Map());

  for (const { file, text } of migrations) {
    for (const m of text.matchAll(STMT_RE)) {
      const op = m[1].toLowerCase();
      const table = m[4].toLowerCase();
      if (!PROTECTED_TABLES.has(table)) continue;
      const direction = m[5].toLowerCase(); // to | from
      // A GRANT uses TO; a REVOKE uses FROM. A malformed pairing is ignored rather than guessed.
      if (op === "grant" && direction !== "to") continue;
      if (op === "revoke" && direction !== "from") continue;

      const roles = parseRoles(m[6]);
      if (roles.length === 0) continue; // no browser role named
      const privs = privSet(m[2]);
      const perRole = state.get(table);

      for (const role of roles) {
        const cur = perRole.get(role) ?? { privs: new Set(), grantedIn: null };
        if (op === "grant") {
          for (const p of privs) cur.privs.add(p);
          if (cur.privs.size > 0) cur.grantedIn = file;
          perRole.set(role, cur);
        } else {
          // REVOKE
          if (privs.has("ALL")) {
            cur.privs.clear();
          } else {
            for (const p of privs) cur.privs.delete(p);
          }
          if (cur.privs.size === 0) cur.grantedIn = null;
          perRole.set(role, cur);
        }
      }
    }
  }

  const offenders = [];
  for (const [table, perRole] of state) {
    for (const [role, cur] of perRole) {
      if (cur.privs.size > 0) {
        offenders.push({
          table,
          role,
          privileges: [...cur.privs].sort(),
          grantedIn: cur.grantedIn ?? "(unknown)",
        });
      }
    }
  }
  return { offenders, tablesSeen: PROTECTED_TABLES.size };
}

function loadMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .sort();
  return files.map((file) => ({ file, text: readFileSync(join(MIGRATIONS_DIR, file), "utf8") }));
}

function runMain() {
  let migrations;
  try {
    migrations = loadMigrations();
  } catch (e) {
    console.error(`[rail-browser-grant-lint] cannot read ${MIGRATIONS_DIR}: ${e.message}`);
    process.exit(1);
  }
  const { offenders } = auditRailBrowserGrants(migrations);
  if (offenders.length > 0) {
    console.error("");
    console.error("✗ rail-browser-grant-lint FAILED — a browser role holds a privilege on the raw Rail (§9/§58, #746 class):");
    for (const o of offenders) {
      console.error(
        `    • ${o.role} holds ${o.privileges.join(",")} on public.${o.table}  (last granted in ${o.grantedIn})`,
      );
    }
    console.error("");
    console.error("  The raw Rail is browser-DENIED by construction: every owner-facing read goes through a");
    console.error("  SECURITY DEFINER resolver (get_solo_rail_activity / get_client_rail) and every Mind read");
    console.error("  through the safe SpineSignal projection. Re-granting browser SELECT re-opens the");
    console.error("  defective pce_staff_read policy the table-privilege revoke is the only thing containing.");
    console.error("  Fix: REVOKE the grant (browser roles hold NOTHING on these tables); read via the resolver.");
    console.error("");
    process.exit(1);
  }
  console.log(`✓ rail-browser-grant-lint: no browser role holds any privilege on the raw Rail (${[...PROTECTED_TABLES].map((t) => `public.${t}`).join(", ")}).`);
  process.exit(0);
}

function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const failures = [];
  const check = (name, cond, detail = "") => {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
  };
  const audit = (migs) => auditRailBrowserGrants(migs);

  // 1. The real shipped history: one grant, two revokes → NET clean.
  const history = audit([
    { file: "20260712190000_x.sql", text: "REVOKE INSERT, UPDATE, DELETE ON public.paige_client_events FROM authenticated, anon;\nGRANT SELECT ON public.paige_client_events TO authenticated;" },
    { file: "20260712200000_x.sql", text: "REVOKE SELECT ON public.paige_client_events FROM authenticated;" },
    { file: "20261042000000_x.sql", text: "REVOKE SELECT ON public.paige_client_events FROM authenticated, anon;" },
    { file: "20261201000200_x.sql", text: "REVOKE ALL ON public.paige_workspace_events FROM PUBLIC,anon,authenticated;\nGRANT ALL ON public.paige_workspace_events TO service_role;" },
  ]);
  check("1 the real grant-then-revoke history is NET clean (no offenders)", history.offenders.length === 0, JSON.stringify(history.offenders));

  // 2. A NEW browser grant with no following revoke is caught.
  const regrant = audit([
    { file: "20260712200000_x.sql", text: "REVOKE SELECT ON public.paige_client_events FROM authenticated;" },
    { file: "20270101000000_regression.sql", text: "GRANT SELECT ON public.paige_client_events TO authenticated;" },
  ]);
  check("2 a new browser GRANT with no following revoke FAILS", regrant.offenders.length === 1
    && regrant.offenders[0].table === "paige_client_events"
    && regrant.offenders[0].role === "authenticated"
    && regrant.offenders[0].grantedIn === "20270101000000_regression.sql", JSON.stringify(regrant.offenders));

  // 3. A grant to PUBLIC is caught (the worst case), unqualified table name, TABLE keyword.
  const toPublic = audit([{ file: "20270101000001_x.sql", text: "GRANT SELECT ON TABLE paige_workspace_events TO PUBLIC;" }]);
  check("3 a grant TO PUBLIC on an unqualified/`TABLE` name FAILS", toPublic.offenders.some((o) => o.role === "public" && o.table === "paige_workspace_events"), JSON.stringify(toPublic.offenders));

  // 4. Grant + revoke in the SAME migration nets clean.
  const sameFile = audit([{ file: "20270101000002_x.sql", text: "GRANT SELECT ON public.paige_client_events TO authenticated;\nREVOKE SELECT ON public.paige_client_events FROM authenticated;" }]);
  check("4 a grant immediately revoked in the same migration is clean", sameFile.offenders.length === 0, JSON.stringify(sameFile.offenders));

  // 5. A grant to a NON-browser role (service_role) is never an offender.
  const serviceOnly = audit([{ file: "20270101000003_x.sql", text: "GRANT ALL ON public.paige_client_events TO service_role;" }]);
  check("5 a grant to service_role only is not an offender", serviceOnly.offenders.length === 0, JSON.stringify(serviceOnly.offenders));

  // 6. A REVOKE ALL clears a prior specific grant.
  const revokeAll = audit([{ file: "20270101000004_x.sql", text: "GRANT SELECT ON public.paige_client_events TO authenticated;\nREVOKE ALL ON public.paige_client_events FROM authenticated;" }]);
  check("6 REVOKE ALL clears a prior specific browser grant", revokeAll.offenders.length === 0, JSON.stringify(revokeAll.offenders));

  // 7. A grant to a DIFFERENT (unprotected) table is ignored.
  const otherTable = audit([{ file: "20270101000005_x.sql", text: "GRANT SELECT ON public.knowledge_base TO authenticated;" }]);
  check("7 a grant on an unprotected table is ignored", otherTable.offenders.length === 0, JSON.stringify(otherTable.offenders));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else runMain();
}
