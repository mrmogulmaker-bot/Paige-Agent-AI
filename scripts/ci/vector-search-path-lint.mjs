#!/usr/bin/env node
/**
 * vector-search-path-lint — a similarity search that cannot resolve its own operator.
 *
 * WHAT THIS GUARDS, measured on production 2026-09-01. The `vector` type and all sixteen of its
 * operators (`<=>`, `<->`, `<#>`, …) live in the `extensions` schema; there are ZERO in `public`.
 * A function that pins `SET search_path = public` — correct security practice, and required of a
 * SECURITY DEFINER function — therefore cannot resolve `<=>` at all. Every call raises:
 *
 *     42883 operator does not exist: extensions.vector <=> extensions.vector
 *
 * Three shipped functions were in that state: `match_paige_memory` (semantic client memory),
 * `match_rag_documents` (document retrieval) and `match_prompt_memory` (the prompt-forge learning
 * loop). Driven as a fully authorised caller, so it was never about permissions.
 *
 * WHY NOBODY NOTICED, and why this is a lint rather than a note. Every call site wraps the RPC and
 * degrades to an empty result — the right shape for a retrieval that must never break a
 * conversation, and exactly what made this invisible: "no memories matched" and "this function
 * cannot execute" look identical from the outside. Meanwhile the two NEWEST siblings,
 * `match_paige_owner_memory` and `match_tenant_knowledge`, both carry `public, extensions` and both
 * work. Somebody hit this before, fixed the two they were writing, and did not backport it. A
 * divergence that silent needs a mechanical check, not a memory.
 *
 *   node scripts/ci/vector-search-path-lint.mjs
 *   node scripts/ci/vector-search-path-lint.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "supabase/migrations";

/** Split a migration into CREATE FUNCTION bodies, each with the header that configures it. */
export function functionsIn(sql) {
  const out = [];
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w".]+)\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const start = m.index;
    // A function ends at the terminator of its own dollar-quoted body. Taking the next CREATE
    // FUNCTION instead would let one function's search_path excuse the next one's.
    // Bounded window: a function definition is never megabytes long, and slicing the WHOLE file
    // per match is what turned this into a quadratic scan on a 400-file migration directory.
    const window = sql.slice(start, start + 20000);
    const tagMatch = window.match(/AS\s+(\$[A-Za-z_]*\$)/);
    let end;
    if (tagMatch) {
      const tag = tagMatch[1];
      const bodyStart = start + tagMatch.index + tagMatch[0].length;
      const close = sql.indexOf(tag, bodyStart);
      end = close < 0 ? Math.min(sql.length, start + 20000) : close + tag.length;
    } else {
      // Do NOT re-enter `re.exec` here: advancing (and then rewinding) lastIndex inside the loop
      // makes it non-terminating. Find the next definition positionally instead.
      const nextIdx = sql.slice(start + 1).search(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
      end = nextIdx < 0 ? Math.min(sql.length, start + 20000) : start + 1 + nextIdx;
    }
    out.push({ name: m[1].replace(/"/g, ""), text: sql.slice(start, end) });
  }
  return out;
}

/** An ALTER that fixes a path counts as a declaration for the function it names. */
export function alteredWithExtensions(sql) {
  const out = new Set();
  // Deliberately simple: no nested unbounded quantifiers, which is how the first version of this
  // guard became a catastrophic backtrack on the real migration directory.
  const re = /ALTER\s+FUNCTION\s+([\w".]+)[^;]{0,4000}?SET\s+search_path\s*=\s*([^;\n]+)/gi;
  let m;
  while ((m = re.exec(sql))) {
    if (/extensions/i.test(m[2])) out.add(m[1].replace(/"/g, ""));
  }
  return out;
}

export function findings(files) {
  const problems = [];
  let scanned = 0;
  const altered = new Set();
  for (const { sql } of files) for (const n of alteredWithExtensions(sql)) altered.add(n);

  for (const { file, sql } of files) {
    for (const fn of functionsIn(sql)) {
      // Only similarity search is affected: no vector operator, no problem.
      if (!/<=>|<->|<#>/.test(fn.text)) continue;
      scanned += 1;
      const pin = fn.text.match(/SET\s+search_path\s*(?:=|TO)\s*([^\n]+)/i);
      // A later ALTER clears BOTH shapes — the wrong pin and the missing one. The first version of
      // this guard only consulted `altered` on the wrong-pin branch, so a function fixed by an
      // ALTER still failed here if its original had no pin at all.
      if (altered.has(fn.name)) continue;
      if (!pin) {
        problems.push(`${file}: ${fn.name} uses a vector operator and pins NO search_path — it resolves against whatever the caller happens to have, which nothing guarantees.`);
        continue;
      }
      if (!/extensions/i.test(pin[1]) && !altered.has(fn.name)) {
        problems.push(`${file}: ${fn.name} uses a vector operator but its search_path (${pin[1].trim()}) excludes 'extensions', where the operator lives. Every call will raise 42883.`);
      }
    }
  }
  return { problems, scanned };
}

function selfTest() {
  const ok = (n, c) => { console.log(`${c ? "  ok  " : "  FAIL"} ${n}`); return c ? 0 : 1; };
  const f = (sql) => findings([{ file: "t.sql", sql }]);
  const body = (pin) => `CREATE FUNCTION public.m(a vector) RETURNS int LANGUAGE sql ${pin} AS $fn$ SELECT a <=> a $fn$;`;
  let bad = 0;
  bad += ok("a correct pin is clean", f(body("SET search_path = public, extensions")).problems.length === 0);
  bad += ok("a public-only pin is caught", f(body("SET search_path = public")).problems.length === 1);
  bad += ok("no pin at all is caught", f(body("")).problems.length === 1);
  bad += ok("a function with no vector operator is ignored",
    f(`CREATE FUNCTION public.q() RETURNS int LANGUAGE sql SET search_path = public AS $fn$ SELECT 1 $fn$;`).problems.length === 0);
  bad += ok("a later ALTER that fixes the path clears it",
    f(body("SET search_path = public") + `\nALTER FUNCTION public.m(vector) SET search_path = public, extensions;`).problems.length === 0);
  bad += ok("…including when the original pinned nothing at all",
    f(body("") + `\nALTER FUNCTION public.m(vector) SET search_path = public, extensions;`).problems.length === 0);
  bad += ok("…and an ALTER that does NOT add extensions does not clear it",
    f(body("SET search_path = public") + `\nALTER FUNCTION public.m(vector) SET search_path = public;`).problems.length === 1);
  bad += ok("one function's good pin does not excuse the next one",
    f(body("SET search_path = public, extensions") + "\n" + body("SET search_path = public").replace("public.m", "public.n")).problems.length === 1);
  bad += ok("the scan reports what it actually looked at", f(body("SET search_path = public")).scanned === 1);
  console.log(bad === 0 ? "\n✓ vector-search-path-lint self-test passed." : `\n✗ ${bad} self-test(s) failed.`);
  process.exit(bad === 0 ? 0 : 1);
}

if (process.argv.includes("--self-test")) selfTest();
else {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => ({ file: f, sql: fs.readFileSync(path.join(DIR, f), "utf8") }));
  const { problems, scanned } = findings(files);
  if (problems.length) {
    console.error(`✗ vector-search-path-lint: ${problems.length} problem(s).\n`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error(`\n  The vector operators live in 'extensions'. Pin 'public, extensions' — keep the pin,`);
    console.error(`  widen it. Removing the pin instead reintroduces a mutable search_path.`);
    process.exit(1);
  }
  console.log(`✓ vector-search-path-lint: ${scanned} similarity function(s) scanned, all resolve their operator.`);
}
