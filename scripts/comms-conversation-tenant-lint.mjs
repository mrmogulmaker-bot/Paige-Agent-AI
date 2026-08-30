#!/usr/bin/env node
/**
 * Every writer of `paige_conversations` stamps a tenant — checked at the source.
 *
 * WHY A SOURCE CHECK AND NOT A DRIVEN ONE. Three edge functions insert into this
 * table. The tenant-scope smoke drives `handle-inbound-sms` and covers its stamp,
 * but `handle-inbound-email` and `send-message` are not bundled there — and an
 * independent review proved it: deleting BOTH of their newly-added stamps left
 * all 40 smoke assertions and all 188 unit tests green. Two thirds of the C-7
 * write-side fix could be reverted by a refactor with nothing turning red.
 *
 * Driving those two would mean bundling a very large function and its whole
 * dependency graph for one assertion. This is the cheaper guard that still fails:
 * it reads the shipped source, finds every insert into the table, and requires a
 * `tenant_id` in the inserted object. It cannot prove the VALUE is the right
 * tenant — the smoke does that for the SMS path, and the reviewer verified the
 * other two call sites by hand — but it does prove the column is not silently
 * dropped, which is the failure mode that actually happened.
 *
 * It also fails when a NEW writer appears without a stamp, which is the case no
 * amount of driving the existing three would have caught.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "supabase/functions";
const TABLE = "paige_conversations";

/** Every .ts under supabase/functions, so a new writer cannot hide from this. */
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Balanced-brace slice of the object literal passed to .insert( — regex cannot do this. */
function insertPayload(src, from) {
  const open = src.indexOf("{", from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
}

/** Top-level `{...}` elements of the array literal starting at `from`, or null. */
function arrayElements(src, from) {
  if (src[from] !== "[") return null;
  const out = [];
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return out; }
    else if (c === "{" && depth === 1) {
      const obj = insertPayload(src, i);
      if (!obj) return null;
      out.push(obj);
      i += obj.length - 1;
    }
  }
  return null;
}

/**
 * A `tenant_id` nested inside another object does NOT count.
 *
 * `handle-inbound-email` writes `metadata: { from, to, tenant_id }`, and a naive
 * substring test accepted that as the stamp — so deleting the real column still
 * passed. Only a key at brace-depth 1 of the inserted object is the column.
 */
function hasTopLevelTenantId(payload) {
  let depth = 0;
  for (let i = 0; i < payload.length; i++) {
    const c = payload[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (depth === 1 && payload.startsWith("tenant_id", i)) {
      const before = i === 0 ? "" : payload[i - 1];
      if (/[A-Za-z0-9_$]/.test(before)) continue;
      const rest = payload.slice(i + "tenant_id".length);
      if (/^\s*:/.test(rest)) return true;
    }
  }
  return false;
}

/**
 * Resolve a `.from(X)` target to a table name where X is a literal, or a local
 * const bound to a literal or to a template made only of literals.
 *
 * Why: an earlier version gated the whole file on `src.includes("paige_conversations")`,
 * so a writer that built the name — `const T = \`paige_${"conversations"}\`` — never
 * contained the literal and was skipped entirely. Returns null when it genuinely
 * cannot tell, and the caller decides what to do with that.
 */
function resolveTarget(src, target, at) {
  const lit = target.match(/^["'`]([^"'`${}]+)["'`]$/);
  if (lit) return lit[1];
  if (!/^[A-Za-z_$][\w$]*$/.test(target)) return null;

  // NEAREST PRECEDING declaration, not the first in the file.
  //
  // Taking the first made the check worse than useless when a name is reused:
  //
  //   function one() { const T = "unrelated_table"; return T; }
  //   function two(a) { const T = "paige_conversations"; return a.from(T).insert({}); }
  //
  // resolved to `unrelated_table`, so the write was skipped — AND because the
  // result was non-null, the `src.includes(TABLE)` safety net below never ran.
  // A wrong answer disabled the fallback that exists for having no answer.
  const decls = [...src.matchAll(new RegExp(`(?:const|let|var)\\s+${target}\\s*=\\s*([^;\\n]+)`, "g"))]
    .filter((d) => d.index < at);
  if (!decls.length) return null;
  const values = new Set(decls.map((d) => literalOf(d[1].trim())).map((v) => v ?? "\u0000unresolved"));
  // Two different bindings in scope-ambiguous positions: refuse to guess. null
  // sends this through the safety net rather than silently picking one.
  if (values.size > 1) return null;
  return literalOf(decls[decls.length - 1][1].trim());
}

/** A string literal, or a template whose every interpolation is itself a literal. */
function literalOf(rhs) {
  const rl = rhs.match(/^["'`]([^"'`${}]+)["'`]$/);
  if (rl) return rl[1];
  const tpl = rhs.match(/^`([^`]*)`$/);
  if (tpl) {
    const collapsed = tpl[1].replace(/\$\{\s*["'`]([^"'`]*)["'`]\s*\}/g, "$1");
    if (!collapsed.includes("${")) return collapsed;
  }
  return null;
}

/** Skip whitespace and // and block comments, walking BACKWARDS from `i`. */
function skipBackTrivia(src, i) {
  for (;;) {
    while (i > 0 && /\s/.test(src[i - 1])) i--;
    if (i >= 2 && src[i - 2] === "*" && src[i - 1] === "/") {
      const open = src.lastIndexOf("/*", i - 2);
      if (open === -1) return i;
      i = open;
      continue;
    }
    // A trailing line comment ends at the newline, which the whitespace loop
    // already consumed, so what sits before `i` is the comment body.
    const nl = src.lastIndexOf("\n", i - 1);
    const lineStart = nl + 1;
    const slashes = src.indexOf("//", lineStart);
    if (slashes !== -1 && slashes < i && !/["'`]/.test(src.slice(lineStart, slashes))) {
      i = slashes;
      continue;
    }
    return i;
  }
}

/** Index of the `(` matching the `)` at `close`, or -1. */
function matchBackParen(src, close) {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (src[i] === ")") depth++;
    else if (src[i] === "(") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * Resolve the RECEIVER of a write, by walking its expression chain backwards.
 *
 * THIS REPLACES "the nearest `from(` within N characters", which was wrong in
 * three ways an independent review demonstrated with ordinary code:
 *
 *   1. A gap larger than the window skipped the write with no record. Widening
 *      400 to 600 moved the boundary; it did not remove one.
 *   2. `const conv = admin.from("paige_conversations");
 *       const { data } = await admin.from("tenants").select("id");
 *       await conv.insert({ ... });`
 *      attributed the write to `tenants` — the nearest `from(` simply belonged
 *      to a different statement. No adversarial intent required.
 *   3. Both failures were SILENT: a miss looked exactly like a file with no
 *      writes.
 *
 * Walking the chain has no window and cannot cross a statement boundary. It
 * returns the `from(...)` argument text, or a root identifier to resolve, or
 * null when it genuinely cannot tell — and the caller treats null as a finding
 * rather than as an absence.
 */
function receiverTarget(src, at, depth = 0) {
  if (depth > 4) return { kind: "unknown" };
  let i = at; // index of the '.' beginning `.insert(`
  for (;;) {
    i = skipBackTrivia(src, i);
    if (i <= 0) return { kind: "unknown" };
    const ch = src[i - 1];

    if (ch === ")") {
      const open = matchBackParen(src, i - 1);
      if (open < 0) return { kind: "unknown" };
      const nameEnd = skipBackTrivia(src, open);
      let j = nameEnd;
      while (j > 0 && /[\w$]/.test(src[j - 1])) j--;
      const name = src.slice(j, nameEnd);
      if (name === "from") return { kind: "target", target: src.slice(open + 1, i - 1).trim() };
      if (!name) return { kind: "unknown" };
      const k = skipBackTrivia(src, j);
      if (src[k - 1] !== ".") return { kind: "unknown" }; // a bare call, not a chain
      i = k - 1;
      continue;
    }

    if (/[\w$]/.test(ch)) {
      let j = i;
      while (j > 0 && /[\w$]/.test(src[j - 1])) j--;
      const name = src.slice(j, i);
      const k = skipBackTrivia(src, j);
      if (src[k - 1] === ".") { i = k - 1; continue; } // a property in the chain
      // Chain root: a variable. Follow its nearest preceding binding.
      const decls = [...src.matchAll(new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`, "g"))]
        .filter((d) => d.index < at);
      if (!decls.length) return { kind: "unknown" };
      const d = decls[decls.length - 1];
      const rhsStart = d.index + d[0].length;
      const stmtEnd = (() => {
        const semi = src.indexOf(";", rhsStart);
        const nl = src.indexOf("\n", rhsStart);
        const ends = [semi, nl].filter((n) => n !== -1);
        return ends.length ? Math.min(...ends) : src.length;
      })();
      // Re-enter at the END of the binding's own expression, so `const conv =
      // admin.from("x")` resolves through the same chain walk.
      return receiverTarget(src, stmtEnd, depth + 1);
    }

    return { kind: "unknown" };
  }
}

let checked = 0;
const missing = [];
const WRITE_VERBS = ["insert", "upsert"];

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  // Not gated on the literal table name any more: a writer that builds the name
  // from a constant or a template never contained it, and was skipped entirely.
  for (const verb of WRITE_VERBS) {
    const call = `.${verb}(`;
    let at = -1;
    while ((at = src.indexOf(call, at + 1)) !== -1) {
      // Resolve the receiver by walking its chain — no window, no cross-statement
      // attribution. See receiverTarget for the three bypasses this closes.
      const recv = receiverTarget(src, at);
      const resolved = recv.kind === "target" ? resolveTarget(src, recv.target, at) : null;
      // A receiver this cannot resolve is only interesting if the file plausibly
      // touches the table; otherwise every dynamic-table write in the tree is a
      // hit. Stated as a limit rather than pretended away — see LIMITS below.
      const isTable = resolved === TABLE || (resolved === null && src.includes(TABLE));
      if (!isTable) continue;

      checked++;
      const line = src.slice(0, at).split("\n").length;
      // Name what was actually established. When the receiver did not resolve and
      // this file merely MENTIONS the table, saying "into paige_conversations" is
      // a claim the check has not earned — the write may be into something else
      // entirely. Report the uncertainty as uncertainty.
      const where = resolved === TABLE ? `into ${TABLE}` : `into an unresolved table in a file that references ${TABLE}`;
      // The payload must be the literal passed to THIS call — `indexOf("{")` used
      // to scan forward to the next brace anywhere in the file, so an unrelated
      // object with a tenant_id satisfied the check for `.insert(variable)`.
      const argStart = at + call.length;
      const firstNonSpace = src.slice(argStart).match(/^\s*/)[0].length;
      const ch = src[argStart + firstNonSpace];

      // A BULK insert is ordinary supabase-js and was being failed outright:
      // `.insert([{ …, tenant_id: t }])` is not a `{`, so it was reported as an
      // unverifiable payload. It fails loud rather than silent, so it was never a
      // hole — but it would have broken CI for correctly-stamped code, and the
      // message would have been wrong about why. Every element must carry the
      // stamp; one unstamped row in the array is still an unscopeable row.
      if (ch === "[") {
        const rows = arrayElements(src, argStart + firstNonSpace);
        if (!rows) {
          missing.push(`${file}:${line} — ${verb} ${where} with an array payload this cannot parse`);
        } else if (!rows.length) {
          // An empty literal array writes nothing; nothing to stamp.
        } else {
          const bad = rows.filter((r) => !hasTopLevelTenantId(r)).length;
          if (bad) missing.push(`${file}:${line} — ${verb} ${where}: ${bad} of ${rows.length} array element(s) carry no top-level tenant_id`);
        }
        continue;
      }

      if (ch !== "{") {
        missing.push(`${file}:${line} — ${verb} ${where} with a non-literal payload; a tenant cannot be verified statically`);
        continue;
      }
      const payload = insertPayload(src, argStart + firstNonSpace);
      if (!payload || !hasTopLevelTenantId(payload)) {
        missing.push(`${file}:${line} — ${verb} ${where} with no top-level tenant_id`);
      }
    }
  }
}

if (checked === 0) {
  console.error(`FAILED: found no ${TABLE} writes at all — the matcher is broken, not the code.`);
  process.exit(1);
}
if (missing.length) {
  console.error(`\n${missing.length} untenanted write(s) into ${TABLE}:\n`);
  for (const m of missing) console.error("  " + m);
  console.error("\nAn untenanted row is one no RLS policy can scope (C-7). Stamp the tenant at the write.\n");
  process.exit(1);
}
console.log(`ok — all ${checked} ${TABLE} write(s) stamp a tenant.`);

// LIMITS, stated rather than implied. This reads source; it cannot prove the
// VALUE stamped is the right tenant (the tenant-scope smoke does that for the SMS
// path), and a write whose table is resolved at runtime in a file that never
// names the table is out of its reach. It catches the failure that actually
// happened — a stamp deleted from a known writer — and a new writer arriving
// unstamped, which is what nothing else covered.
//
// WHAT AN INDEPENDENT REVIEW FOUND AFTER THE FIRST FOUR BYPASSES WERE CLOSED, and
// what changed here. Three ordinary write shapes were still skipped SILENTLY, and
// a silent skip is indistinguishable from a clean file — which is the whole
// failure mode this guard exists to end:
//
//   · a `.from()` further back than the fixed character window (the first fix
//     moved that window from 400 to 600; it did not remove one)
//   · a same-named `const` earlier in the file, because the resolver took the
//     FIRST declaration in the whole file rather than the nearest preceding one
//     — and returning a WRONG table also disabled the `includes(TABLE)` net that
//     exists for returning no table
//   · a nearer `.from()` belonging to a different statement, which attached the
//     write to the wrong table with no adversarial intent required
//
// The window is gone: receiverTarget walks the expression chain, which cannot
// cross a statement boundary and has no length. The resolver takes the nearest
// preceding binding and returns null on ambiguity. Two false POSITIVES found in
// the same review are fixed too — a bulk `.insert([{…}])` of correctly-stamped
// rows no longer fails, and a finding whose table did not resolve no longer
// asserts it was "into paige_conversations".
//
// All three bypasses were reproduced against the previous matcher (it reported
// "ok — all 1 write(s) stamp a tenant", exit 0) and re-run against this one.
