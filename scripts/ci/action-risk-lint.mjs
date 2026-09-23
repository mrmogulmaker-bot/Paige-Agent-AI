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
 * TWO SURFACES DECLARE ACTS, NOT ONE — added 2026-09-05 with the governed MCP door. The policy was
 * written when Chat was the only caller, so "does the handler still declare this?" meant one file.
 * `paige-mcp` now maps its 119 tools onto canonical keys in
 * `_shared/paige-mcp/capability-policy.ts`, forty-nine of which exist for that door alone. Those
 * are not ghosts — a live registry points at every one of them — and the ghost rule had to learn
 * the second surface or it would have demanded the deletion of the classifications that make the
 * MCP door work. The rule itself is unchanged in spirit: a classified key that NO surface points
 * at is still a line nobody reads.
 *
 * ONE KEY, ONE LINE — added 2026-09-23. `RISK` is a hand-maintained array and every map derived from
 * it folds repeats, so a second tuple for a key already present is a classification settled by fold
 * order rather than by a person. `crm_update_task` carried two until #1383. That fold now keeps the
 * MOST RESTRICTIVE class, so a repeat can only raise authority and never lower it — which means this
 * check is the WARNING that the table contradicts itself, not the thing that makes it safe. It says
 * whether the repeated classes agree, because "duplicate key" alone leaves the reader to go and look.
 *
 *   node scripts/ci/action-risk-lint.mjs
 *   node scripts/ci/action-risk-lint.mjs --self-test
 */
import fs from "node:fs";

const POLICY = "supabase/functions/_shared/action-risk.ts";
const CHAT = "supabase/functions/paige-ai-chat/index.ts";
const MCP_POLICY = "supabase/functions/_shared/paige-mcp/capability-policy.ts";
const SOCIAL_HANDLER = "supabase/functions/paige-social/index.ts";
const CONTACT_SCOPED_EDGE_HANDLERS = [
  "supabase/functions/_shared/nav-pull-profile/governed-adapter.ts",
  "supabase/functions/smartcredit-pull-snapshot/index.ts",
];
const CRM_CATALOG = "supabase/functions/_shared/crm-command/catalog.ts";

/** The RISK array's source text, or null if the table's declaration has moved. */
function policyBlock(src) {
  const at = src.indexOf("const RISK: ReadonlyArray<readonly [string, ActionRisk, string]> = [");
  if (at < 0) return null;
  const end = src.indexOf("\n];", at);
  if (end < 0) return null;
  return src.slice(at, end);
}

/**
 * A tuple in any quoting style TypeScript accepts. The delimiter is captured and back-referenced
 * per position, so `'x'` and `"x"` both parse while `"x'` does not. This started life
 * double-quote-only, and a reviewer proved that mattered: a duplicate written with a single-quoted
 * reason was invisible to the duplicate check below, AND to the parse-vs-runtime cross-check in
 * `capability-kit.test.mjs`, because the skipped tuple and the collapsed duplicate each removed one
 * from their respective counts and the equality survived. Two blind spots cancelling is worse than
 * either alone, because the guard reports success.
 */
const POLICY_TUPLE = /\[\s*(['"`])([a-z0-9_]+)\1\s*,\s*(['"`])(ordinary|high|owner_only)\3\s*,\s*(['"`])((?:\\.|(?!\5)[^\\])*)\5\s*\]/g;

/** Every classified action, as `[tool, class, reason]`, read from the policy's own table. */
export function parsePolicy(src) {
  const block = policyBlock(src);
  if (block === null) return null;
  return [...block.matchAll(POLICY_TUPLE)].map((m) => ({ tool: m[2], risk: m[4], reason: m[6] }));
}

/**
 * How many tuples the table CONTAINS, counted without understanding any of them — one per line that
 * opens with a bracket and a quote. This exists to be compared against `parsePolicy()`'s output so
 * that a tuple the parser cannot read fails LOUDLY instead of vanishing.
 *
 * Widening the parser above fixes the shapes we know about. This fixes the ones we do not: every
 * check in this guard is built on `parsePolicy()`, so a silently dropped tuple under-reports the
 * duplicate check, the unclassified-write check and the reason check at once, and each of them
 * still prints a tick. Measured when written: 156 tuples, 156 tuple-opening lines, zero anchored
 * lines the strict regex missed, and no reason containing a `["` sequence that could inflate it.
 */
export function countPolicyTupleLines(src) {
  const block = policyBlock(src);
  if (block === null) return null;
  return block.split("\n").filter((line) => /^\s*\[\s*['"`]/.test(line)).length;
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

/**
 * The canonical keys the MCP door points at, read from its capability policy. That file holds no
 * classification of its own — it is a tool-name → key mapping — so this only asks WHICH keys are
 * referenced, never what they are worth.
 */
export function parseMcpCanonicals(src) {
  const start = src.indexOf("export const MCP_CAPABILITY_POLICY");
  if (start === -1) return [];
  return [...src.slice(start).matchAll(/^\s*canonical:\s*"([a-z0-9_]+)",/gm)].map((m) => m[1]);
}

/** Domain-owned edge mutations that enter the same governed decision seam. */
export function parseGovernedEdgeActions(src) {
  return [...new Set([...src.matchAll(/await govern\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]))];
}

/** Canonical capability constants used by governed, contact-scoped Edge adapters. */
export function parseCapabilityConstants(src) {
  return [...src.matchAll(/const (?:[A-Z0-9_]*CAPABILITY) = "([a-z0-9_]+)"/g)].map((m) => m[1]);
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
const MUTATION_VERB = /(^|_)(create|update|delete|remove|save|send|publish|install|uninstall|grant|revoke|run|assign|enroll|book|set|draft|generate|file|advance|forge|archive|activate|deactivate|move|add|build|log|author|enable|disable|invite|upload|apply|approve|reject|decide|import|export|sync|write|post|schedule|cancel|start|stop|trigger|fire|configure|buy|purchase|pull|name|rename|propose|provision|claim|release)(_|$)/;

/** The rule: destroys, changes permissions, or goes public ⇒ never `ordinary`. */
const IRREVERSIBLE_OR_OUTWARD = /(^|_)(delete|remove|revoke|publish|uninstall|install)(_|$)|(^|_)grant(_|$)/;

export function findings({ policy, exemptions, chat, verbSourceMatches, mcpCanonicals = [], governedEdgeActions = [], policyTupleLines = null }) {
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
  for (const tool of new Set([...chat.declared, ...mcpCanonicals, ...governedEdgeActions])) {
    if (classified.has(tool) || exempt.has(tool)) continue;
    if (!MUTATION_VERB.test(tool)) continue;
    out.push(`${tool} reads as a write but has no entry in ${POLICY}. Classify it (ordinary | high | owner_only), or add it to NON_MUTATING_EXEMPT with the reason it persists nothing.`);
  }

  // 2. No ghosts: a classification NO surface points at. Chat declares tools by name; the MCP door
  //    declares them indirectly, by mapping a tool onto a canonical key. Either reference keeps a
  //    classification alive — an entry with neither is the line nobody deletes.
  const declared = new Set([...chat.declared, ...mcpCanonicals, ...governedEdgeActions]);
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

  // 6. One key, one line. Two tuples for the same key is a classification the fold picks, not a
  //    person — and the reader of a bare "duplicate key" cannot tell whether they just created a
  //    downgrade or restated something harmlessly, so the classes are named. Agreeing repeats are
  //    the case that actually happened; disagreeing ones are a policy arguing with itself.
  const classesByTool = new Map();
  for (const { tool, risk } of policy) {
    const held = classesByTool.get(tool);
    if (held) held.push(risk);
    else classesByTool.set(tool, [risk]);
  }
  for (const [tool, classes] of classesByTool) {
    if (classes.length < 2) continue;
    out.push(
      `${tool} is classified ${classes.length} times in ${POLICY} — as ${classes.join(", ")}. ` +
      (new Set(classes).size === 1
        ? `The classes agree, so nothing is mis-classified today, but one key on two lines means the next edit to either can disagree with the other. Keep exactly one.`
        : `The classes DISAGREE, so the table contradicts itself and the fold picks the winner instead of a person. Keep exactly one, and make it the class you mean.`),
    );
  }

  // 7. The parser must have read the WHOLE table. Every check above is built on `policy`, so a tuple
  //    `parsePolicy()` cannot match does not merely go ungraded — it silently shrinks the input to
  //    the duplicate check, the unclassified-write check and the reason check at once, and all three
  //    then print a tick. A reviewer proved this was not theoretical: a duplicate whose reason used
  //    single quotes was invisible here AND to the parse-vs-runtime cross-check, because the dropped
  //    tuple and the folded duplicate each removed one from their counts and the equality held.
  //
  //    Both directions fail, and they mean different things, so they say different things.
  if (policyTupleLines !== null && policyTupleLines !== policy.length) {
    out.push(
      policyTupleLines > policy.length
        ? `${POLICY} contains ${policyTupleLines} tuples but this guard could only parse ${policy.length} — ${policyTupleLines - policy.length} tuple(s) use a shape the parser does not read, so every check in this guard is grading an incomplete table and reporting success. Fix the parser or the tuple; do not leave them disagreeing.`
        : `this guard parsed ${policy.length} tuples from ${POLICY} but only ${policyTupleLines} line(s) open one — the table's shape changed (a tuple spanning lines, most likely), so the tuple counter no longer sees what the parser does and can no longer back it up. Update the counter.`,
    );
  }

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
  bad += ok("a key only the MCP door points at is NOT a ghost",
    !findings({ ...base, policy: [...base.policy, { tool: "mcp_only_create_thing", risk: "ordinary", reason: "a sufficiently long reason" }],
      mcpCanonicals: ["mcp_only_create_thing"] })
      .some((f) => f.includes("mcp_only_create_thing")));
  bad += ok("a key NEITHER surface points at is still a ghost",
    findings({ ...base, policy: [...base.policy, { tool: "orphan_create_thing", risk: "ordinary", reason: "a sufficiently long reason" }],
      mcpCanonicals: ["something_else"] })
      .some((f) => f.includes("orphan_create_thing")));
  bad += ok("the MCP canonical parser reads a real-shaped table",
    parseMcpCanonicals('export const MCP_CAPABILITY_POLICY = {\n  a: {\n    canonical: "x_create_y",\n  },\n};')
      .join() === "x_create_y");
  bad += ok("the MCP canonical parser does not invent keys from an absent table",
    parseMcpCanonicals("no table here").length === 0);
  bad += ok("contact-scoped Edge capability constants are discovered",
    parseCapabilityConstants('export const NAV_PULL_CAPABILITY = "nav_pull_business_credit";').join() === "nav_pull_business_credit");
  bad += ok("a governed edge action is a real declaring surface",
    parseGovernedEdgeActions('const result = await govern(\n  "widget_create_thing",\n  args,\n);').join() === "widget_create_thing");
  bad += ok("a re-introduced hand-list is caught",
    findings({ ...base, chat: { ...base.chat, hasHandList: true } }).some((f) => f.includes("drift")));
  bad += ok("a handler that stopped gating on the policy is caught",
    findings({ ...base, chat: { ...base.chat, gatesOnPolicy: false } }).some((f) => f.includes("must gate on the policy")));
  bad += ok("a policy this guard could not parse is caught, not passed",
    findings({ ...base, policy: [] }).some((f) => f.includes("reading nothing")));
  bad += ok("a diverged verb pattern is caught",
    findings({ ...base, verbSourceMatches: false }).some((f) => f.includes("disagree about what counts")));
  // The duplicate rule, both directions. The clean fixture declares 60 distinct keys, so its silence
  // is the no-false-positive half; the two repeats below are the real defect (`crm_update_task` held
  // two `ordinary` tuples until #1383) and the worse hypothetical (classes that disagree).
  bad += ok("a repeated key whose classes DISAGREE is caught, naming both classes",
    findings({ ...base, policy: [...base.policy, { tool: "t_create_0", risk: "high", reason: "a sufficiently long reason" }] })
      .some((f) => f.includes("t_create_0 is classified 2 times") && f.includes("as ordinary, high") && f.includes("DISAGREE")));
  bad += ok("a repeated key whose classes AGREE is caught too, named as a restatement",
    findings({ ...base, policy: [...base.policy, { tool: "t_create_0", risk: "ordinary", reason: "a sufficiently long reason" }] })
      .some((f) => f.includes("t_create_0 is classified 2 times") && f.includes("as ordinary, ordinary") && f.includes("classes agree")));

  // The parser's own reach, and the backstop for where it does not reach. A reviewer showed that a
  // duplicate with a single-quoted reason was invisible to BOTH the rule above and the cross-check
  // in capability-kit.test.mjs — the dropped tuple and the folded duplicate cancelled, so the
  // guard reported success. These four cases are that defect, restored.
  const BLOCK = (...tuples) =>
    `const RISK: ReadonlyArray<readonly [string, ActionRisk, string]> = [\n${tuples.map((t) => `  ${t},`).join("\n")}\n];\n`;
  bad += ok("a single-quoted tuple parses (it did not, and a duplicate hid in the gap)",
    parsePolicy(BLOCK(`['a_create_x', 'ordinary', 'a sufficiently long reason']`))?.[0]?.tool === "a_create_x");
  bad += ok("a backtick tuple parses",
    parsePolicy(BLOCK("[`a_create_x`, `high`, `a sufficiently long reason`]"))?.[0]?.risk === "high");
  // Delimiters may differ BETWEEN positions — `["a", 'b', "c"]` is legal TypeScript — but each
  // string's own pair must match. The first version of this case asserted the opposite and failed;
  // the regex was right and the test was wrong.
  bad += ok("delimiters that differ between positions parse, because that is valid source",
    parsePolicy(BLOCK(`["a_create_x", 'ordinary', "a sufficiently long reason"]`))?.length === 1);
  bad += ok("a string whose own quotes do not match does NOT parse (widened is not loose)",
    parsePolicy(BLOCK(`["a_create_x", "ordinary', "a sufficiently long reason"]`))?.length === 0);
  bad += ok("the tuple counter counts shapes the parser cannot read",
    countPolicyTupleLines(BLOCK(`["a_create_x", "ordinary", "a sufficiently long reason"]`, `["aCreateX", "ordinary", "an unreadable key"]`)) === 2);
  bad += ok("a tuple the parser silently skipped is caught, not passed",
    findings({ ...base, policyTupleLines: base.policy.length + 1 })
      .some((f) => f.includes("could only parse") && f.includes("grading an incomplete table")));
  bad += ok("a counter that has fallen behind the parser is caught too, and says so differently",
    findings({ ...base, policyTupleLines: base.policy.length - 1 })
      .some((f) => f.includes("Update the counter")));
  bad += ok("a table whose counts agree stays silent",
    findings({ ...base, policyTupleLines: base.policy.length }).length === 0);
  bad += ok("a policy that declares each key exactly once reports no duplicate",
    !findings(base).some((f) => /is classified \d+ times/.test(f)));
  // 2026-09-12 regression: `decide` must read as a mutation verb, so an unclassified `*_decide`
  // write (the `improvement_decide` bypass) is caught as a write rather than sailing through as a
  // query. Guards the lint's own copy of MUTATION_VERB; `checkVerbParity` guards it against the policy.
  bad += ok("`decide` reads as a mutation verb (the improvement_decide bypass stays closed)",
    MUTATION_VERB.test("improvement_decide") && MUTATION_VERB.test("x_decide") && !MUTATION_VERB.test("decided_list"));
  bad += ok("`pull` reads as a mutation verb for paid provider actions",
    MUTATION_VERB.test("nav_pull_business_credit") && MUTATION_VERB.test("smartcredit_pull_snapshot"));
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
if (chatSrc.includes('...BUSINESS_MISSION_TOOLS')) {
  if (!/import\s*\{[^}]*BUSINESS_MISSION_TOOLS[^}]*\}\s*from\s*['"]\.\.\/_shared\/paige-spine\/domains\/business_mission\.ts['"]/.test(chatSrc)) throw new Error('Unresolved Business Mission catalog import');
  const source = fs.readFileSync('supabase/functions/_shared/paige-spine/domains/business_mission.ts', 'utf8');
  const missionTools = [...source.matchAll(/\bname:\s*"(mission_[a-z_]+)"/g)].map(m => m[1]);
  if (!missionTools.length) throw new Error('Business Mission catalog could not be parsed');
  importedTools.push(...missionTools);
}
if (chatSrc.includes('...CAMPAIGN_BRIEF_TOOLS')) {
  if (!/import\s*\{[^}]*CAMPAIGN_BRIEF_TOOLS[^}]*\}\s*from\s*['"]\.\.\/_shared\/paige-spine\/domains\/campaigns\.ts['"]/.test(chatSrc)) throw new Error('Unresolved Campaign Brief catalog import');
  const source = fs.readFileSync('supabase/functions/_shared/paige-spine/domains/campaigns.ts', 'utf8');
  const campaignTools = [...source.matchAll(/\bname:\s*"(campaign_brief_[a-z_]+)"/g)].map(m => m[1]);
  if (!campaignTools.length) throw new Error('Campaign Brief catalog could not be parsed');
  importedTools.push(...campaignTools);
}
if (chatSrc.includes('...CALENDAR_PRESET_TOOLS')) {
  if (!/import\s*\{[^}]*CALENDAR_PRESET_TOOLS[^}]*\}\s*from\s*['"]\.\.\/_shared\/paige-spine\/domains\/calendar_preset\.ts['"]/.test(chatSrc)) throw new Error('Unresolved Calendar Preset catalog import');
  const source = fs.readFileSync('supabase/functions/_shared/paige-spine/domains/calendar_preset.ts', 'utf8');
  const calendarTools = [...source.matchAll(/\bname:\s*"(booking_preset_[a-z_]+)"/g)].map(m => m[1]);
  if (!calendarTools.length) throw new Error('Calendar Preset catalog could not be parsed');
  importedTools.push(...calendarTools);
}
if (chatSrc.includes('...CALENDAR_LINK_TOOLS')) {
  if (!/import\s*\{[^}]*CALENDAR_LINK_TOOLS[^}]*\}\s*from\s*['"]\.\.\/_shared\/paige-spine\/domains\/calendar_link\.ts['"]/.test(chatSrc)) throw new Error('Unresolved Calendar Link catalog import');
  const source = fs.readFileSync('supabase/functions/_shared/paige-spine/domains/calendar_link.ts', 'utf8');
  const linkTools = [...source.matchAll(/\bname:\s*"(calendar_link_[a-z_]+)"/g)].map(m => m[1]);
  if (!linkTools.length) throw new Error('Calendar Link catalog could not be parsed');
  importedTools.push(...linkTools);
}
if (chatSrc.includes('...AGREEMENT_TOOLS')) {
  if (!/import\s*\{[^}]*AGREEMENT_TOOLS[^}]*\}\s*from\s*['"]\.\.\/_shared\/paige-spine\/domains\/agreement\.ts['"]/.test(chatSrc)) throw new Error('Unresolved Agreement catalog import');
  const source = fs.readFileSync('supabase/functions/_shared/paige-spine/domains/agreement.ts', 'utf8');
  const agreementTools = [...source.matchAll(/\bname:\s*"(agreement_[a-z_]+)"/g)].map(m => m[1]);
  if (!agreementTools.length) throw new Error('Agreement catalog could not be parsed');
  importedTools.push(...agreementTools);
}
if (chatSrc.includes('...CRM_COMMAND_TOOLS')) {
  if (!/import\s*\{[^}]*CRM_COMMAND_TOOLS[^}]*\}\s*from\s*['"]\.\.\/_shared\/crm-command\/catalog\.ts['"]/.test(chatSrc)) throw new Error('Unresolved CRM command catalog import');
  const source = fs.readFileSync(CRM_CATALOG, 'utf8');
  const mapStart = source.indexOf("export const CRM_ACTION_CAPABILITY");
  const mapEnd = source.indexOf("} as const;", mapStart);
  const crmTools = [...source.slice(mapStart, mapEnd).matchAll(/"[a-z._]+":\s*"([a-z0-9_]+)"/g)].map(m => m[1]);
  if (!crmTools.length) throw new Error('CRM command catalog could not be parsed');
  importedTools.push(...crmTools);
}
const mcpCanonicals = parseMcpCanonicals(fs.readFileSync(MCP_POLICY, "utf8"));
const governedEdgeActions = [
  ...parseGovernedEdgeActions(fs.readFileSync(SOCIAL_HANDLER, "utf8")),
  ...CONTACT_SCOPED_EDGE_HANDLERS.flatMap((path) => parseCapabilityConstants(fs.readFileSync(path, "utf8"))),
];
if (!mcpCanonicals.length) {
  console.error(`✗ action-risk-lint: read no canonical keys out of ${MCP_POLICY}. That file is the MCP door's second declaring surface, so an empty read would silently condemn every MCP-only classification as a ghost. Fix this guard rather than letting it pass.`);
  process.exit(1);
}
const problems = findings({
  policy,
  exemptions,
  chat: parseChat(chatSrc, importedTools),
  verbSourceMatches,
  mcpCanonicals,
  governedEdgeActions,
  policyTupleLines: countPolicyTupleLines(policySrc),
});

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
