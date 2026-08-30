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
function resolveTarget(src, target) {
  const lit = target.match(/^["'`]([^"'`${}]+)["'`]$/);
  if (lit) return lit[1];
  if (/^[A-Za-z_$][\w$]*$/.test(target)) {
    const decl = new RegExp(`(?:const|let|var)\\s+${target}\\s*=\\s*([^;\\n]+)`).exec(src);
    if (decl) {
      const rhs = decl[1].trim();
      const rl = rhs.match(/^["'`]([^"'`${}]+)["'`]$/);
      if (rl) return rl[1];
      // A template whose every interpolation is itself a string literal.
      const tpl = rhs.match(/^`([^`]*)`$/);
      if (tpl) {
        const collapsed = tpl[1].replace(/\$\{\s*["'`]([^"'`]*)["'`]\s*\}/g, "$1");
        if (!collapsed.includes("${")) return collapsed;
      }
    }
  }
  return null;
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
      // Walk BACK from the write to its `.from(...)`, instead of forward from
      // `.from` within a fixed 400-char window — a long comment or a chained
      // builder pushed the write out of that window and it was never checked.
      const head = src.slice(Math.max(0, at - 600), at);
      const m = [...head.matchAll(/from\(\s*([^)]*?)\s*\)/g)].pop();
      if (!m) continue;
      const target = m[1];
      const resolved = resolveTarget(src, target);
      // A target this cannot resolve is only interesting if the file plausibly
      // touches the table; otherwise every dynamic-table write in the tree is a
      // hit. Stated as a limit rather than pretended away — see LIMITS below.
      const isTable = resolved === TABLE || (resolved === null && src.includes(TABLE));
      if (!isTable) continue;

      checked++;
      const line = src.slice(0, at).split("\n").length;
      // The payload must be the literal passed to THIS call — `indexOf("{")` used
      // to scan forward to the next brace anywhere in the file, so an unrelated
      // object with a tenant_id satisfied the check for `.insert(variable)`.
      const argStart = at + call.length;
      const firstNonSpace = src.slice(argStart).match(/^\s*/)[0].length;
      const ch = src[argStart + firstNonSpace];
      if (ch !== "{") {
        missing.push(`${file}:${line} — ${verb} into ${TABLE} with a non-literal payload; a tenant cannot be verified statically`);
        continue;
      }
      const payload = insertPayload(src, argStart + firstNonSpace);
      if (!payload || !hasTopLevelTenantId(payload)) {
        missing.push(`${file}:${line} — ${verb} into ${TABLE} with no top-level tenant_id`);
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
