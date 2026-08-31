#!/usr/bin/env node
/**
 * Authority before side effects, in the provider-connection edge function.
 *
 * WHY THIS EXISTS
 *
 * The same defect appeared three times in one change, in three different action branches,
 * and was found three different ways. `connect` accepted a provider it should not have and
 * overwrote the other provider's row — caught by reading the diff. `oauth_complete` did the
 * same thing in mirror — caught by an independent reviewer, after the first was fixed.
 * `disconnect` revoked a grant at the provider before the admin check, and `approve` spent
 * the workspace's credential on provider traffic before it — also caught by the reviewer.
 *
 * Each fix was correct and none of them stopped the next one, because the rule lived in
 * whoever happened to be reading. The rule is simple enough to check mechanically:
 *
 *   Inside one action branch, no service-role work and no outbound provider request may
 *   appear before the caller's authority has been established.
 *
 * WHAT THIS CHECKS, HONESTLY
 *
 * The ORDER of textual markers inside each `if (action === "...")` block. It is not a data
 * flow analysis: it cannot see authority established through a helper it does not know, and
 * a branch could satisfy it and still be wrong in some way this does not model. It catches
 * the shape that actually bit, four times, which is worth more than nothing and less than a
 * proof. An action that legitimately has no side effect before its own admin-gated write
 * declares that with `// authority-note:` and the reason.
 */
import { readFileSync } from "node:fs";

const FILE = "supabase/functions/tenant-mcp-connect/index.ts";

/** Establishing who the caller is. */
const AUTHORITY = ["is_current_user_tenant_admin"];

/** Things that must not happen before authority: service-role reads of tenant secrets,
 *  outbound requests carrying them, and spending a single-use flow. */
const SIDE_EFFECTS = [
  "resolveConnection(",
  "revokeGrant(",
  "mcpListToolFingerprints(",
  "probeAndRecord(",
  "consume_tenant_mcp_oauth_state",
];

const src = readFileSync(FILE, "utf8");
const branchRe = /if \(action === "([a-z_]+)"\) \{/g;
const starts = [];
for (const m of src.matchAll(branchRe)) starts.push({ action: m[1], at: m.index + m[0].length });

if (starts.length === 0) {
  console.error(`::error::action-authority-lint: no action branches found in ${FILE} — the shape changed and this guard is now blind.`);
  process.exit(1);
}

const failures = [];
starts.forEach((s, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
  const body = src.slice(s.at, end);

  const authorityAt = Math.min(...AUTHORITY.map((k) => body.indexOf(k)).filter((x) => x >= 0).concat([Infinity]));
  const effects = SIDE_EFFECTS.map((k) => ({ k, at: body.indexOf(k) })).filter((e) => e.at >= 0);
  const firstEffect = effects.length ? effects.reduce((a, b) => (a.at < b.at ? a : b)) : null;

  if (!firstEffect) return;                       // nothing to order against
  if (authorityAt < firstEffect.at) return;       // authority first — correct
  if (/\/\/ authority-note:/.test(body.slice(0, firstEffect.at))) return; // declared exemption

  failures.push(
    `${s.action}: \`${firstEffect.k}\` runs before any caller-authority check. ` +
    `Establish authority first, or explain the exemption with an inline \`// authority-note:\`.`,
  );
});

if (failures.length) {
  for (const f of failures) console.error(`::error::action-authority-lint: ${f}`);
  process.exit(1);
}
console.log(`action-authority-lint: ${starts.length} action branch(es); authority precedes every side effect.`);
