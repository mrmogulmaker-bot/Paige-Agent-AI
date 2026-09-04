#!/usr/bin/env node
/**
 * action-risk-lint — a write tool that nobody classified must not reach production.
 *
 * WHAT THIS GUARDS. `supabase/functions/_shared/action-risk.ts` decides how much proof each
 * mutation needs: `ordinary` (a compact confirmation), `high` (the rendered approval card, whose
 * fingerprint travels in the request body and so cannot be produced by the model), or `owner_only`
 * (not a chat action at any approval strength). The handler gates on that file and nothing else.
 *
 * The failure mode this exists to stop is not malice, it is arithmetic. Someone adds the fifty-
 * second write tool, does not know this file exists, and the tool ships. Before the policy, the
 * default for an unlisted tool was permissive; now the default is inert, and the runtime refuses it
 * — but "inert in production" is a bad way to find out. This finds out in CI instead.
 *
 * It also guards the reverse: a classification for a tool that no longer exists is a line nobody
 * will ever delete, and a policy full of ghosts stops being read.
 *
 *   node scripts/ci/action-risk-lint.mjs
 *   node scripts/ci/action-risk-lint.mjs --self-test
 */
import fs from "node:fs";

const POLICY = "supabase/functions/_shared/action-risk.ts";
const CHAT = "supabase/functions/paige-ai-chat/index.ts";

/** Every classified action, as `[tool, class, reason]`, read from the policy's own table. */
export function parsePolicy(src) {
  const at = src.indexOf("const RISK: ReadonlyArray<readonly [string, ActionRisk, string]> = [");
  if (at < 0) return null;
  const end = src.indexOf("\n];", at);
  if (end < 0) return null;
  return [...src.slice(at, end).matchAll(
    /\[\s*"([a-z0-9_]+)"\s*,\s*"(ordinary|high|owner_only)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]/g,
  )].map((m) => ({ tool: m[1], risk: m[2], reason: m[3] }));
}

/** The tools the handler declares to the model, with the exempt list it honours. */
export function parseChat(src, importedTools = []) {
  return {
    declared: [...new Set([...src.matchAll(/\n\s*name: "([a-z0-9_]+)",/g)].map((m) => m[1]).concat(importedTools))],
    // The handler must gate on the policy, not on a literal of its own. A re-introduced hand-list
    // is the exact drift the policy replaced, so it fails here rather than being merged and
    // discovered later by a reviewer who happens to look.
    hasHandList: /const MUTATING_TOOLS = new Set<string>\(\[/.test(src),
    gatesOnPolicy: /const MUTATING_TOOLS = mutatingTools\(\);/.test(src),
  };
}

export function parseExemptions(src) {
  const at = src.indexOf("const NON_MUTATING_EXEMPT: ReadonlyMap<string, string> = new Map([");
  if (at < 0) return null;
  const end = src.indexOf("\n]);", at);
  if (end < 0) return null;
  return [...src.slice(at, end).matchAll(/\[\s*"([a-z0-9_]+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]/g)]
    .map((m) => ({ tool: m[1], reason: m[2] }));
}

/** Kept in step with `MUTATION_VERB` in the policy by `checkVerbParity` below. */
const MUTATION_VERB = /(^|_)(create|update|delete|remove|save|send|publish|install|uninstall|grant|revoke|run|assign|enroll|book|set|draft|generate|file|advance|forge|archive|activate|deactivate|move|add|build|log|author|enable|disable|invite|upload|apply|approve|reject|import|export|sync|write|post|schedule|cancel|start|stop|trigger|fire|configure|buy|purchase|name|rename|propose|provision|claim|release)(_|$)/;

/** The rule: destroys, changes permissions, or goes public ⇒ never `ordinary`. */
const IRREVERSIBLE_OR_OUTWARD = /(^|_)(delete|remove|revoke|publish|uninstall|install)(_|$)|(^|_)grant(_|$)/;

export function findings({ policy, exemptions, chat, verbSourceMatches }) {
  const out = [];
  const classified = new Map(policy.map((p) => [p.tool, p.risk]));
  const exempt = new Set(exemptions.map((e) => e.tool));

  // A regex that matches nothing reports a clean bill of health, which is indistinguishable from
  // a clean bill of health. Prove the subject was found before grading it.
  if (policy.length < 40) out.push(`the policy parsed only ${policy.length} classifications — the table shape changed, so this guard is reading nothing`);
  if (chat.declared.length < 50) out.push(`only ${chat.declared.length} tool names were found in the handler — this guard is reading nothing`);

  if (chat.hasHandList) out.push(`${CHAT} declares its own MUTATING_TOOLS literal again — the gated set must come from the policy, or the two lists will drift exactly as they did before`);
  if (!chat.gatesOnPolicy) out.push(`${CHAT} no longer derives MUTATING_TOOLS from mutatingTools() — the handler must gate on the policy`);

  // 1. Every declared tool that reads as a write is classified, or exempted with a reason.
  for (const tool of chat.declared) {
    if (classified.has(tool) || exempt.has(tool)) continue;
    if (!MUTATION_VERB.test(tool)) continue;
    out.push(`${tool} reads as a write but has no entry in ${POLICY}. Classify it (ordinary | high | owner_only), or add it to NON_MUTATING_EXEMPT with the reason it persists nothing.`);
  }

  // 2. No ghosts: a classification for a tool the handler no longer offers.
  const declared = new Set(chat.declared);
  for (const { tool } of policy) {
    // Containment tombstones are deliberately classified while not being dispatched, so a future
    // accidental re-registration cannot inherit read semantics. They are named here rather than
    // silently tolerated.
    if (tool === "marketplace_install" || tool === "marketplace_uninstall" || tool === "n8n_delete_workflow") continue;
    if (!declared.has(tool)) out.push(`${tool} is classified in ${POLICY} but the handler no longer declares it — remove the entry, or the policy fills with lines nobody reads.`);
  }

  // 3. The membership rule, not a hand-list: anything that destroys, changes who may do what, or
  //    goes public is at least `high`. `owner_only` is stronger, so it satisfies this too.
  for (const { tool, risk } of policy) {
    if (IRREVERSIBLE_OR_OUTWARD.test(tool) && risk === "ordinary") {
      out.push(`${tool} is classified ordinary, but its name says it destroys, changes permissions, or goes public. That needs the approval card at minimum.`);
    }
  }

  // 4. Every entry states WHY. The reason is the rubric a later reader argues with and the next
  //    tool is placed against; an entry without one is a guess that will be copied.
  for (const { tool, reason } of policy) {
    if (!reason || reason.trim().length < 12) out.push(`${tool} carries no usable reason for its classification.`);
  }
  for (const { tool, reason } of exemptions) {
    if (!reason || reason.trim().length < 20) out.push(`${tool} is exempted from classification without saying why it persists nothing.`);
  }

  // 5. This file's copy of the verb pattern must be the policy's. Two regexes that must agree are
  //    two regexes that eventually will not, and the divergence would show up as CI passing a tool
  //    the runtime then refuses.
  if (!verbSourceMatches) out.push(`the MUTATION_VERB pattern in this guard no longer matches the one in ${POLICY} — they must be identical or CI and the runtime will disagree about what counts as a write.`);

  return out;
}

function selfTest() {
  const ok = (name, cond) => { console.log(`${cond ? "  ok  " : "  FAIL"} ${name}`); return cond ? 0 : 1; };
  const base = {
    policy: Array.from({ length: 60 }, (_, i) => ({ tool: `t_create_${i}`, risk: "ordinary", reason: "a sufficiently long reason" })),
    exemptions: [],
    chat: { declared: Array.from({ length: 60 }, (_, i) => `t_create_${i}`), hasHandList: false, gatesOnPolicy: true },
    verbSourceMatches: true,
  };
  let bad = 0;
  bad += ok("imported catalog mutations are included", parseChat('', ['widget_delete_thing']).declared.includes('widget_delete_thing'));
  bad += ok("an unclassified imported write fails", findings({...base, chat:{...base.chat, declared:[...base.chat.declared,...parseChat('', ['widget_delete_thing']).declared]}}).some(f=>f.includes('widget_delete_thing')));

  bad += ok("a fully classified handler is clean", findings(base).length === 0);
  bad += ok("an unclassified write is caught",
    findings({ ...base, chat: { ...base.chat, declared: [...base.chat.declared, "widget_delete_thing"] } })
      .some((f) => f.includes("widget_delete_thing")));
  bad += ok("a read-only tool is not caught",
    !findings({ ...base, chat: { ...base.chat, declared: [...base.chat.declared, "widget_list_things"] } })
      .some((f) => f.includes("widget_list_things")));
  bad += ok("an exempted write is not caught",
    !findings({ ...base, exemptions: [{ tool: "widget_generate_preview", reason: "returns it in memory and persists nothing at all" }],
      chat: { ...base.chat, declared: [...base.chat.declared, "widget_generate_preview"] } })
      .some((f) => f.includes("widget_generate_preview")));
  bad += ok("an exemption with no reason is caught",
    findings({ ...base, exemptions: [{ tool: "widget_generate_preview", reason: "fine" }],
      chat: { ...base.chat, declared: [...base.chat.declared, "widget_generate_preview"] } })
      .some((f) => f.includes("without saying why")));
  bad += ok("a delete classified ordinary is caught",
    findings({ ...base, policy: [...base.policy, { tool: "widget_delete_thing", risk: "ordinary", reason: "a sufficiently long reason" }],
      chat: { ...base.chat, declared: [...base.chat.declared, "widget_delete_thing"] } })
      .some((f) => f.includes("approval card at minimum")));
  bad += ok("a delete classified owner_only is NOT caught",
    !findings({ ...base, policy: [...base.policy, { tool: "widget_delete_thing", risk: "owner_only", reason: "a sufficiently long reason" }],
      chat: { ...base.chat, declared: [...base.chat.declared, "widget_delete_thing"] } })
      .some((f) => f.includes("approval card at minimum")));
  bad += ok("a ghost classification is caught",
    findings({ ...base, policy: [...base.policy, { tool: "gone_create_thing", risk: "ordinary", reason: "a sufficiently long reason" }] })
      .some((f) => f.includes("gone_create_thing")));
  bad += ok("a re-introduced hand-list is caught",
    findings({ ...base, chat: { ...base.chat, hasHandList: true } }).some((f) => f.includes("drift")));
  bad += ok("a handler that stopped gating on the policy is caught",
    findings({ ...base, chat: { ...base.chat, gatesOnPolicy: false } }).some((f) => f.includes("must gate on the policy")));
  bad += ok("a policy this guard could not parse is caught, not passed",
    findings({ ...base, policy: [] }).some((f) => f.includes("reading nothing")));
  bad += ok("a diverged verb pattern is caught",
    findings({ ...base, verbSourceMatches: false }).some((f) => f.includes("disagree about what counts")));
  console.log(bad === 0 ? "\n✓ action-risk-lint self-test passed." : `\n✗ ${bad} self-test(s) failed.`);
  process.exit(bad === 0 ? 0 : 1);
}

// Only run the guard when this file IS the command. Importing it for its `findings` — which the
// self-test and any future harness does — must not fire the real lint as a side effect.
import { pathToFileURL } from "node:url";
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (process.argv.includes("--self-test")) selfTest();
if (!invokedDirectly) { /* imported for its exports */ } else {

const policySrc = fs.readFileSync(POLICY, "utf8");
const chatSrc = fs.readFileSync(CHAT, "utf8");
const policy = parsePolicy(policySrc);
const exemptions = parseExemptions(policySrc);
if (!policy || !exemptions) {
  console.error(`✗ action-risk-lint: could not read the policy table in ${POLICY}. It moved or changed shape — fix this guard rather than deleting it.`);
  process.exit(1);
}
const verbSourceMatches = policySrc.includes(`export const MUTATION_VERB = ${MUTATION_VERB.toString()};`);
// Follow the mounted domain-owned catalog; imported mutations receive the same policy checks.
let importedTools = [];
if (chatSrc.includes('...N8N_MANAGEMENT_TOOLS')) {
  if (!/import\s*\{[^}]*N8N_MANAGEMENT_TOOLS[^}]*\}\s*from\s*['"]\.\.\/_shared\/n8n-management\.ts['"]/.test(chatSrc)) throw new Error('Unresolved n8n catalog import');
  const source = fs.readFileSync('supabase/functions/_shared/n8n-management.ts', 'utf8');
  importedTools = [...source.matchAll(/^\s*(n8n_[a-z_]+):\{provider:/gm)].map(m => m[1]);
  if (!importedTools.length) throw new Error('n8n catalog could not be parsed');
}
const problems = findings({ policy, exemptions, chat: parseChat(chatSrc, importedTools), verbSourceMatches });

if (problems.length) {
  console.error(`✗ action-risk-lint: ${problems.length} problem(s).\n`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error(`\n  The policy is ${POLICY}. An action with no classification cannot run, on purpose:`);
  console.error(`  the permissive default is what let a hand-maintained list go quietly out of date.`);
  process.exit(1);
}
const by = (r) => policy.filter((p) => p.risk === r).length;
console.log(`✓ action-risk-lint: ${policy.length} classified action(s) — ${by("ordinary")} ordinary · ${by("high")} high · ${by("owner_only")} owner-only · ${exemptions.length} exempted · 0 unclassified writes.`);
}
