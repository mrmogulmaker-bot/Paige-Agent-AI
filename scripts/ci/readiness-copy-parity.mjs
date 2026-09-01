#!/usr/bin/env node
/**
 * readiness-copy-parity.mjs — every reason a tenant is BLOCKED has a next step.
 *
 * WHY. `tenant_comms_readiness()` decides why a business cannot text yet and
 * returns one `blocked_reason`. Connections renders that reason through
 * `READINESS_COPY`, whose entries carry a headline AND a `next` — the one thing
 * the person can actually do. Where the map has no entry, the surface falls back
 * to "Some setup is still outstanding.", which is honest and names no next step.
 * That is a dead end: the tenant is told they are blocked and not told by what.
 *
 * The two halves live in different trees — a SQL migration and a React surface —
 * reviewed at different times by different eyes. Nothing today connects them.
 * They are in exact parity as of this guard's first run, and that parity is held
 * by hand, which is precisely the arrangement this repo has decided does not
 * scale (cf. lint:views #116, lint:definer-fns #117, lint:tier-features §60).
 *
 * WHAT IT CHECKS, in both directions:
 *   1. EMITTED BUT UNCOVERED — the resolver can return a reason the map lacks.
 *      This is the dead end. A person hits it in production; nothing else warns.
 *   2. COVERED BUT NEVER EMITTED — the map carries a reason the resolver cannot
 *      return. Not user-visible, but it is dead copy that reads as coverage, and
 *      it makes the map an unreliable answer to "what can a tenant be told?".
 *
 * SCOPE, stated honestly. This proves the two VOCABULARIES agree. It does not
 * prove the copy is good, and it does not judge it — wording is Claude Design's
 * (§00). It also does not read the deployed function: it reads the migration
 * that defines it, so a resolver changed on prod without a migration is outside
 * what this can see (as is every other static gate here).
 *
 * Regex-based and dependency-free, like its sibling gates, so it runs anywhere
 * node runs. `--self-test` drives fixtures for both failure directions plus the
 * passing case, because a parity checker that cannot fail is not a checker.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SURFACE = "src/solo/settings.tsx";
const MIGRATIONS = "supabase/migrations";
const FN = "tenant_comms_readiness";

/**
 * The reasons the resolver can return.
 *
 * Read from the `v_blocked := case … end;` assignment rather than from every
 * quoted literal in the file: the function also builds `subaccount`, `number`,
 * `a2p`, `consent` and `delivery` vocabularies, and sweeping all literals would
 * demand copy for words that are not blocking reasons at all.
 *
 * The LAST migration that defines the function wins, so a later redefinition is
 * what gets graded — migrations are ordered by filename, which is the same order
 * Postgres applies them in.
 */
export function resolverReasons(sqlByFile) {
  const defining = Object.keys(sqlByFile)
    .filter((f) => new RegExp(`function\\s+(public\\.)?${FN}\\b`).test(sqlByFile[f]))
    .sort();
  if (defining.length === 0) return { error: `no migration defines ${FN}()` };

  const sql = sqlByFile[defining[defining.length - 1]];
  const m = sql.match(/v_blocked\s*:=\s*case([\s\S]*?)\bend\s*;/);
  if (!m) {
    // Never treat "I could not find it" as "there are none": that would pass the
    // gate by failing to look, which is the failure mode it exists to prevent.
    return { error: `found ${FN}() in ${path.basename(defining.at(-1))} but could not read its "v_blocked := case … end;" assignment` };
  }
  const reasons = [...m[1].matchAll(/then\s+'([a-z0-9_]+)'/g)].map((x) => x[1]);
  return { reasons: [...new Set(reasons)].sort(), file: path.basename(defining.at(-1)) };
}

/** The reasons the surface can explain. */
export function copyKeys(tsx) {
  const m = tsx.match(/READINESS_COPY\s*:\s*Record<[^>]*>\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return { error: `could not read the READINESS_COPY map in ${SURFACE}` };
  const keys = [...m[1].matchAll(/^\s*([a-z0-9_]+)\s*:\s*\{/gm)].map((x) => x[1]);
  // An entry without a `next` is covered in name only — it renders a headline and
  // leaves the person exactly where the fallback would.
  const withoutNext = [...m[1].matchAll(/^\s*([a-z0-9_]+)\s*:\s*\{([^}]*)\}/gm)]
    .filter((x) => !/\bnext\s*:/.test(x[2])).map((x) => x[1]);
  return { keys: [...new Set(keys)].sort(), withoutNext };
}

export function compare(reasons, keys) {
  return {
    uncovered: reasons.filter((r) => !keys.includes(r)),
    deadCopy: keys.filter((k) => !reasons.includes(k)),
  };
}

/* ---------------------------------------------------------------- self-test */

const PASS_SQL = `create or replace function public.${FN}() returns jsonb as $$
  v_blocked := case
    when a then 'alpha'
    when b then 'beta'
    else null
  end;
$$;`;
const PASS_TSX = `export const READINESS_COPY: Record<string, { headline: string; next: string }> = {
  alpha: { headline: "H", next: "N" },
  beta:  { headline: "H", next: "N" },
};`;

function selfTest() {
  let failed = 0;
  const check = (name, ok, detail = "") => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
    if (!ok) failed++;
  };

  const r = resolverReasons({ "a.sql": PASS_SQL });
  check("reads the resolver's reasons", JSON.stringify(r.reasons) === '["alpha","beta"]', JSON.stringify(r));

  const k = copyKeys(PASS_TSX);
  check("reads the surface's covered reasons", JSON.stringify(k.keys) === '["alpha","beta"]', JSON.stringify(k));

  const clean = compare(r.reasons, k.keys);
  check("parity passes when they agree", clean.uncovered.length === 0 && clean.deadCopy.length === 0);

  // Direction 1 — the dead end. This is the case that reaches a person.
  const gained = resolverReasons({ "a.sql": PASS_SQL.replace("else null", "when c then 'gamma'\n    else null") });
  const d1 = compare(gained.reasons, k.keys);
  check("FAILS when the resolver gains a reason the surface cannot explain",
    d1.uncovered.length === 1 && d1.uncovered[0] === "gamma", JSON.stringify(d1));

  // Direction 2 — dead copy that reads as coverage.
  const extra = copyKeys(PASS_TSX.replace("};", '  delta: { headline: "H", next: "N" },\n};'));
  const d2 = compare(r.reasons, extra.keys);
  check("FAILS when the surface carries a reason the resolver cannot return",
    d2.deadCopy.length === 1 && d2.deadCopy[0] === "delta", JSON.stringify(d2));

  // An entry with a headline and no `next` is coverage in name only.
  const noNext = copyKeys(PASS_TSX.replace('beta:  { headline: "H", next: "N" },', 'beta:  { headline: "H" },'));
  check("FLAGS an entry that has no next step", JSON.stringify(noNext.withoutNext) === '["beta"]', JSON.stringify(noNext));

  // A checker that cannot find its input must SAY so, never report parity.
  check("refuses to pass when the resolver cannot be read",
    Boolean(resolverReasons({ "a.sql": "create function public.other() ..." }).error));
  check("refuses to pass when the assignment cannot be read",
    Boolean(resolverReasons({ "a.sql": `create or replace function public.${FN}() returns jsonb as $$ select 1 $$;` }).error));
  check("refuses to pass when the map cannot be read",
    Boolean(copyKeys("export const SOMETHING_ELSE = {};").error));

  console.log(failed === 0 ? "\nself-test: all passed." : `\nself-test: ${failed} FAILED.`);
  return failed === 0 ? 0 : 1;
}

/* -------------------------------------------------------------------- main */

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  const dir = path.join(ROOT, MIGRATIONS);
  const sqlByFile = Object.fromEntries(
    fs.readdirSync(dir).filter((f) => f.endsWith(".sql"))
      .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]),
  );

  const r = resolverReasons(sqlByFile);
  if (r.error) { console.error(`readiness-copy-parity: ${r.error}`); return 1; }

  const k = copyKeys(fs.readFileSync(path.join(ROOT, SURFACE), "utf8"));
  if (k.error) { console.error(`readiness-copy-parity: ${k.error}`); return 1; }

  const { uncovered, deadCopy } = compare(r.reasons, k.keys);
  let failed = false;

  if (uncovered.length) {
    failed = true;
    console.error(
      `\n❌ ${uncovered.length} blocking reason(s) the resolver can return have NO entry in READINESS_COPY:\n` +
      uncovered.map((x) => `   - ${x}`).join("\n") +
      `\n\n   A tenant in that state is told "Some setup is still outstanding." and not what to do.` +
      `\n   Add an entry with a headline AND a next step in ${SURFACE}.\n`);
  }
  if (k.withoutNext.length) {
    failed = true;
    console.error(
      `\n❌ ${k.withoutNext.length} READINESS_COPY entr(ies) have no next step:\n` +
      k.withoutNext.map((x) => `   - ${x}`).join("\n") +
      `\n\n   A headline without a next step leaves the person where the fallback would.\n`);
  }
  if (deadCopy.length) {
    failed = true;
    console.error(
      `\n❌ ${deadCopy.length} READINESS_COPY entr(ies) name a reason the resolver cannot return:\n` +
      deadCopy.map((x) => `   - ${x}`).join("\n") +
      `\n\n   Remove them, or fix the name. Dead copy reads as coverage.\n`);
  }

  if (failed) return 1;
  console.log(`ok — all ${r.reasons.length} blocking reason(s) in ${r.file} carry a next step in ${path.basename(SURFACE)}.`);
  return 0;
}

process.exit(main());
