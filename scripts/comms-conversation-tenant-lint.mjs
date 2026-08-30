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

let checked = 0;
const missing = [];
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes(TABLE)) continue;
  const re = new RegExp(`from\\(\\s*["'\`]${TABLE}["'\`]\\s*\\)`, "g");
  let m;
  while ((m = re.exec(src))) {
    // Only INSERTs carry a payload; updates are keyed by filters and are out of scope here.
    const after = src.slice(m.index, m.index + 400);
    const ins = after.indexOf(".insert(");
    if (ins === -1) continue;
    checked++;
    const payload = insertPayload(src, m.index + ins);
    const line = src.slice(0, m.index).split("\n").length;
    if (!payload || !hasTopLevelTenantId(payload)) {
      missing.push(`${file}:${line} — insert into ${TABLE} with no tenant_id`);
    }
  }
}

if (checked === 0) {
  console.error(`FAILED: found no ${TABLE} inserts at all — the matcher is broken, not the code.`);
  process.exit(1);
}
if (missing.length) {
  console.error(`\n${missing.length} untenanted insert(s) into ${TABLE}:\n`);
  for (const m of missing) console.error("  " + m);
  console.error("\nAn untenanted row is one no RLS policy can scope (C-7). Stamp the tenant at the write.\n");
  process.exit(1);
}
console.log(`ok — all ${checked} ${TABLE} insert(s) stamp a tenant.`);
