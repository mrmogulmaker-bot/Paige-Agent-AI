#!/usr/bin/env node
/**
 * mind-contract-lint.mjs — the three-state Mind evidence contract guard (§18/§13/§00).
 *
 * WHY: The "Mind" surface (the tenant-scoped 3D mind feed, and the Chat handler that
 * shares its projection) presents what Paige actually KNOWS. Everything it shows must
 * resolve to exactly one of three honest states — RECORDED (a verified outcome, with a
 * citation), NO_EVIDENCE (the safe projection found nothing — NOT proof none happened),
 * or UNAVAILABLE (we could not resolve it — infer nothing). That three-state contract is
 * the honesty invariant of the whole vertical: it is what stops a rendered orb from
 * implying activity that did not happen. It lives in ONE projection home
 * (`supabase/functions/_shared/paige-spine/mindEvidence.ts`), and Chat is a CALLER of it,
 * never a second author of the same account (§18 one home).
 *
 * This guard is DEPLOYMENT-INERT. It edits no runtime file, changes no bundle, and asserts
 * only STRUCTURAL facts about the Spine projection + its Chat adapter as they already exist
 * on main. It exists so a later edit cannot silently: add a fourth Mind state, rename or
 * drop one, make the projector return a partial answer instead of failing closed, mis-word
 * or swap an absence honesty block, stand up a SECOND Mind projection without a Spine Change
 * Request, or let Chat re-derive the states itself and drift from Mind.
 *
 * WHAT IT CHECKS (violation codes):
 *   MC1  every candidate Mind projection's state union is EXACTLY {recorded, no_evidence,
 *        unavailable}. (Candidates are discovered independently of their state set, so a
 *        second projection that OMITS or RENAMES a state cannot evade detection.)
 *   MC2  the projector is FAIL-CLOSED, tied to its RETURN branches: non-available ->
 *        return unavailable, empty -> return no_evidence, any un-projectable signal ->
 *        return unavailable (never a partial "recorded").
 *   MC3  the honesty guardrail copy is bound to the RIGHT state: the "infer nothing" line
 *        renders under UNAVAILABLE and the "not proof of none" line under NO_EVIDENCE
 *        (swapping or dropping either is caught).
 *   MC4  there is ONE Mind projection home (the explicit canonical path). Every OTHER
 *        candidate projection must declare a Spine Change Request marker
 *        (`sharedPrimitiveChange: "SCR-..."` or `// mind-projection-scr: <ref>`).
 *   MC5  the Chat adapter must EXIST and RETURN via the Mind projection
 *        (`return render*MindEvidence(...)`), in code (comments stripped), and must not
 *        re-derive a Mind state literal itself.
 *
 * SCOPE (§00): this guard's jurisdiction is correctness and honesty of the data contract.
 * It has zero opinion about how the Mind surface LOOKS. It only proves the states stay
 * three, stay fail-closed, and stay honestly worded.
 *
 * HONEST LIMIT (§13): this is a static text guard, not an interpreter. MC2/MC5 bind tokens
 * to `return` sites and MC3 binds copy to the nearest state, which defeats the realistic
 * evasions (a token in a log line, a swapped constant, a comment-only match) — but a guard
 * that does not execute the code can never be as strong as running it. The vitest file and
 * the projector's own unit tests exercise behaviour; this guard is the structural tripwire.
 *
 * Deliberately regex/text-based and dependency-free so it runs anywhere `node` runs — the
 * same shape as view-security-invoker-lint / definer-fn-lint / tier-feature-lint.
 * `--self-test` runs the compliant + one-per-code non-compliant fixtures.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const SPINE_DIR = join(REPO_ROOT, "supabase", "functions", "_shared", "paige-spine");
const CHAT_ADAPTER_REL = "supabase/functions/_shared/paige-spine/chatEvidence.ts";
/** The one true Mind projection home. Extended only by an owner-approved Spine Change Request. */
export const CANONICAL_PROJECTION = "supabase/functions/_shared/paige-spine/mindEvidence.ts";
const FIXTURE_DIR = join(REPO_ROOT, "scripts", "fixtures", "mind-contract");

/** The one true set of Mind states. Extended only by an owner-approved Spine Change Request. */
export const CANONICAL_MIND_STATES = Object.freeze(["no_evidence", "recorded", "unavailable"]);

/** An SCR marker permits a second Mind projection home (the §18 escape, made explicit). */
const SCR_MARKER = /sharedPrimitiveChange\s*:\s*["'`]SCR-|\/\/\s*mind-projection-scr\s*:\s*\S+/;

/** Remove block and line comments so a comment-only token cannot satisfy a check. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** A file DECLARES a Mind-evidence union type (the strongest projection signal). */
function hasMindUnion(content) {
  return /export\s+type\s+\w*MindEvidence\s*=/.test(content);
}

/**
 * A file is a CANDIDATE Mind projection if it declares a `*MindEvidence` union type OR exports
 * a `project`- or `render`-prefixed `*MindEvidence` callable — a `function` declaration OR a
 * function-valued `const` (`export const projectFooMindEvidence = (...) => ...`). This is
 * deliberately independent of whether the union carries all three states, so a second projection
 * that omits or renames a state — even one that reuses the canonical type and is written as an
 * arrow const — is still DISCOVERED here and then judged by MC1/MC4. This closes both the
 * `export function` gap (PR-A) and the `export const` gap (PR-A2).
 */
export function isMindProjectionCandidate(content) {
  return (
    hasMindUnion(content) ||
    /export\s+(?:function|const)\s+(?:project|render)\w*MindEvidence\b/.test(content)
  );
}

/**
 * Extract the `status` string literals from the exported `*MindEvidence` union, scoped to the
 * union members (lines that, trimmed, start with `|` or `{`) so projector/return-site literals do
 * not leak in. Returns a sorted, de-duplicated array.
 */
export function extractMindStateLiterals(content) {
  const lines = content.split(/\r?\n/);
  const states = new Set();
  let inUnion = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^export\s+type\s+\w*MindEvidence\s*=/.test(line)) {
      inUnion = true;
      for (const m of line.matchAll(/status\s*:\s*["']([a-z_]+)["']/g)) states.add(m[1]);
      if (line.endsWith(";") && line.includes("|")) inUnion = false;
      continue;
    }
    if (!inUnion) continue;
    if (line.startsWith("|") || line.startsWith("{")) {
      for (const m of line.matchAll(/status\s*:\s*["']([a-z_]+)["']/g)) states.add(m[1]);
      if (line.endsWith(";")) inUnion = false;
      continue;
    }
    if (line.length > 0) inUnion = false;
  }
  return [...states].sort();
}

/** The state keyword nearest-BEFORE an index (used to bind honesty copy to its own state). */
function nearestStateBefore(content, idx) {
  const region = content.slice(Math.max(0, idx - 400), idx);
  const matches = [...region.matchAll(/(unavailable|no_evidence|recorded)/gi)];
  return matches.length ? matches[matches.length - 1][1].toLowerCase() : null;
}

/** Slice a balanced `{...}` block starting at the `{` at openIdx (returns the block incl. braces). */
function sliceBalancedBlock(source, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(openIdx, i + 1);
    }
  }
  return source.slice(openIdx);
}

/**
 * Extract the BODIES of exported callables — `export [async] function NAME(...) {…}` and
 * `export const NAME = (...) => {…}` / `=> expr;`. Used to scope MC5 to the Chat adapter's exported
 * entry points, so an unused or non-exported helper cannot satisfy the render check for an exported
 * entry point that actually re-implements the states (PR-A2 fix). Pass comment-stripped source.
 */
export function exportedCallableBodies(content) {
  const out = [];
  const fnRe = /export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::[^{]+?)?\{/g;
  for (let m; (m = fnRe.exec(content)); ) {
    const openIdx = m.index + m[0].length - 1; // the `{`
    out.push({ name: m[1], body: sliceBalancedBlock(content, openIdx) });
  }
  const constRe = /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::[^=]+?)?=>\s*/g;
  for (let m; (m = constRe.exec(content)); ) {
    const rest = content.slice(m.index + m[0].length);
    if (rest[0] === "{") {
      out.push({ name: m[1], body: sliceBalancedBlock(content, m.index + m[0].length) });
    } else {
      const end = rest.search(/;\s*(?:\n|$)/);
      out.push({ name: m[1], body: end >= 0 ? rest.slice(0, end) : rest });
    }
  }
  return out;
}

/**
 * The whole check, as a pure function of file contents, so a test can drive it with fixtures.
 * @param {{ projections: {path:string, content:string}[], chatAdapter?: {path:string, content:string}, canonicalPath?: string }} inputs
 * @returns {{ code:string, path:string, message:string }[]}
 */
export function analyzeMindContract(inputs) {
  const violations = [];
  const projections = inputs.projections ?? [];
  const chat = inputs.chatAdapter;
  const canonicalPath = inputs.canonicalPath ?? CANONICAL_PROJECTION;

  // MC4 — one home. No projection at all; the canonical home missing; or a second one without SCR.
  if (projections.length === 0) {
    violations.push({
      code: "MC4",
      path: relative(REPO_ROOT, SPINE_DIR),
      message: "No Mind projection found. The three-state Mind contract must live in exactly one projection module (the canonical path).",
    });
  } else if (!projections.some((proj) => proj.path === canonicalPath)) {
    // The canonical home must EXIST — otherwise a marked replacement could silently stand in for a
    // deleted/moved `mindEvidence.ts` and the analysis would return clean (PR-A2 fix).
    violations.push({
      code: "MC4",
      path: canonicalPath,
      message: `The canonical Mind projection home is missing at ${canonicalPath}. A Spine Change Request may add a SECOND projection, but it may never replace the one canonical home — restore it or relocate the canonical path deliberately (§18).`,
    });
  }
  for (const proj of projections) {
    if (proj.path === canonicalPath) continue; // the known canonical home needs no marker
    if (!SCR_MARKER.test(proj.content)) {
      violations.push({
        code: "MC4",
        path: proj.path,
        message:
          `A Mind projection exists outside the canonical home (${canonicalPath}) without a Spine Change Request. Generalising Mind retrieval is a shared-primitive change — declare \`sharedPrimitiveChange: "SCR-<ref>"\` or \`// mind-projection-scr: <ref>\`, or fold it back into the one home (§18).`,
      });
    }
  }

  // MC1/MC2/MC3 run against every candidate that declares a union (there is normally exactly one).
  for (const proj of projections) {
    if (!hasMindUnion(proj.content)) continue;
    const states = extractMindStateLiterals(proj.content);
    const canonical = [...CANONICAL_MIND_STATES].sort();
    if (states.length !== canonical.length || states.some((s, i) => s !== canonical[i])) {
      violations.push({
        code: "MC1",
        path: proj.path,
        message: `Mind state union is {${states.join(", ") || "∅"}} but must be exactly {${canonical.join(", ")}}. A fourth, missing, or renamed state silently changes what the Mind surface can honestly claim.`,
      });
    }

    // MC2 — fail-closed, tied to the RETURN branch (not mere token proximity).
    const nonAvailableClosed = /status\s*!==\s*["']available["'][\s\S]{0,80}?return\s*\{[^{}]*status:\s*["']unavailable["']/.test(proj.content);
    const emptyIsNoEvidence = /\.signals\.length[\s\S]{0,80}?return\s*\{[^{}]*status:\s*["']no_evidence["']/.test(proj.content);
    const unprojectableClosed = /===\s*null[\s\S]{0,80}?return\s*\{[^{}]*status:\s*["']unavailable["']/.test(proj.content);
    if (!nonAvailableClosed || !emptyIsNoEvidence || !unprojectableClosed) {
      const missing = [
        nonAvailableClosed ? null : "non-available resolver result must `return { status: \"unavailable\" }`",
        emptyIsNoEvidence ? null : "empty signal set must `return { status: \"no_evidence\" }`",
        unprojectableClosed ? null : "any un-projectable signal must `return { status: \"unavailable\" }` (no partial answer)",
      ].filter(Boolean);
      violations.push({
        code: "MC2",
        path: proj.path,
        message: `Mind projector is not provably fail-closed. Missing return-bound branch: ${missing.join("; ")}. A projector that returns a partial answer can imply activity it never verified (§13).`,
      });
    }

    // MC3 — honesty copy bound to the RIGHT state (defeats a swapped/dropped block).
    const inferIdx = proj.content.search(/infer\s+(?:nothing|activity)/i);
    const notProofIdx = proj.content.search(/(?:not\s+(?:treat\s+that\s+as\s+proof|proof)|no\s+activity\s+occurred)/i);
    const mc3 = [];
    if (inferIdx < 0) mc3.push("UNAVAILABLE must tell the reader to infer nothing");
    else if (nearestStateBefore(proj.content, inferIdx) !== "unavailable") mc3.push("the 'infer nothing' line is not bound to the UNAVAILABLE state");
    if (notProofIdx < 0) mc3.push("NO_EVIDENCE must say absence is not proof that nothing happened");
    else if (nearestStateBefore(proj.content, notProofIdx) !== "no_evidence") mc3.push("the 'not proof of none' line is not bound to the NO_EVIDENCE state");
    if (mc3.length) {
      violations.push({
        code: "MC3",
        path: proj.path,
        message: `An absence render block's honesty guardrail is missing or mis-bound: ${mc3.join("; ")}. Absence must never read as activity, or as proof of none, and never under the wrong state (§13/§00).`,
      });
    }
  }

  // MC5 — the Chat adapter must exist, and EACH exported entry point must return via the projection,
  // not re-derive states. Scoped to the exported callable BODIES (PR-A2 fix) so an unused/non-entry
  // helper's render call can no longer mask an exported entry point that re-implements the states.
  if (!chat) {
    violations.push({
      code: "MC5",
      path: CHAT_ADAPTER_REL,
      message: "The configured Chat adapter was not found. Chat must exist and render via the Mind projection; a missing adapter is not a silently-passing state (§18/§13).",
    });
  } else {
    const bodies = exportedCallableBodies(stripComments(chat.content));
    if (bodies.length === 0) {
      violations.push({
        code: "MC5",
        path: chat.path,
        message: "The Chat adapter exports no entry point. Chat must expose an exported function that returns via the Mind projection (§18).",
      });
    }
    for (const fn of bodies) {
      const rendersViaProjection = /(?:return|=>)\s*(?:await\s+)?render\w*MindEvidence\s*\(/.test(fn.body);
      const rederivesStates = /["']no_evidence["']/.test(fn.body); // the one Mind state literal unique enough to be a re-derivation tell
      if (!rendersViaProjection || rederivesStates) {
        const why = !rendersViaProjection
          ? "does not RETURN via the Mind projection (return render*MindEvidence(…))"
          : "constructs the no_evidence state literal itself";
        violations.push({
          code: "MC5",
          path: chat.path,
          message: `The exported Chat entry point \`${fn.name}\` re-derives Mind evidence (${why}). Every exported Chat entry point must be a caller of the one projection so Chat and Mind cannot drift into two accounts of the same record (§18).`,
        });
      }
    }
  }

  return violations;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      out.push(...walk(abs));
    } else if (/\.ts$/.test(entry) && !/\.d\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      out.push(abs);
    }
  }
  return out;
}

/** Read the real Spine projection candidates + the Chat adapter into `analyzeMindContract` inputs. */
export function readRealSpineInputs() {
  const files = walk(SPINE_DIR).map((abs) => ({
    path: relative(REPO_ROOT, abs).split(sep).join("/"),
    content: readFileSync(abs, "utf8"),
  }));
  const projections = files.filter((f) => isMindProjectionCandidate(f.content));
  const chatAbs = join(REPO_ROOT, CHAT_ADAPTER_REL);
  let chatAdapter;
  try {
    chatAdapter = { path: CHAT_ADAPTER_REL, content: readFileSync(chatAbs, "utf8") };
  } catch {
    chatAdapter = undefined; // MC5 treats a missing configured adapter as a violation
  }
  return { projections, chatAdapter, canonicalPath: CANONICAL_PROJECTION };
}

const FIXTURE_DIR_REL = "scripts/fixtures/mind-contract";
function loadFixture(name) {
  return { path: `${FIXTURE_DIR_REL}/${name}`, content: readFileSync(join(FIXTURE_DIR, name), "utf8") };
}

function selfTest() {
  let ok = true;
  const fail = (msg) => {
    ok = false;
    console.error(`SELF-TEST FAIL: ${msg}`);
  };

  const good = loadFixture("good-projection.ts");
  const goodChat = loadFixture("good-chat.ts");
  const canon = good.path; // treat the good fixture as the canonical home for the fixture set

  // 0) The compliant fixtures must produce zero violations.
  const clean = analyzeMindContract({ projections: [good], chatAdapter: goodChat, canonicalPath: canon });
  if (clean.length !== 0) fail(`compliant fixtures produced ${clean.length} violation(s): ${clean.map((v) => v.code).join(", ")}`);
  else console.log("SELF-TEST: compliant fixtures produced 0 violations.");

  // 1) One planted violation per code must be caught.
  const mc1 = loadFixture("bad-mc1-projection.ts");
  const mc2 = loadFixture("bad-mc2-projection.ts");
  const mc3 = loadFixture("bad-mc3-projection.ts");
  const twoState = loadFixture("bad-p1-twostate-second.ts");
  const cases = [
    // canonicalPath is set to the SINGLE projection's own path so the isolated MC1/MC2/MC3 cases
    // do not also trip MC4 (a non-canonical projection without an SCR marker).
    { code: "MC1", inputs: { projections: [mc1], chatAdapter: goodChat, canonicalPath: mc1.path } },
    // P1 regression: a SECOND two-state projection is DISCOVERED and flagged (MC1 for its bad
    // states AND MC4 for being a second home) — the evasion Codex found, now closed.
    { code: "MC1", inputs: { projections: [good, twoState], chatAdapter: goodChat, canonicalPath: canon } },
    { code: "MC4", inputs: { projections: [good, twoState], chatAdapter: goodChat, canonicalPath: canon } },
    { code: "MC2", inputs: { projections: [mc2], chatAdapter: goodChat, canonicalPath: mc2.path } },
    { code: "MC3", inputs: { projections: [mc3], chatAdapter: goodChat, canonicalPath: mc3.path } },
    { code: "MC4", inputs: { projections: [good, loadFixture("bad-mc4-second-projection.ts")], chatAdapter: goodChat, canonicalPath: canon } },
    // PR-A2 (a): a SECOND projection written as `export const project*MindEvidence = (...) =>`,
    // reusing the canonical type (no own union), is now DISCOVERED as a candidate → MC4.
    { code: "MC4", inputs: { projections: [good, loadFixture("bad-p1b-const-projection.ts")], chatAdapter: goodChat, canonicalPath: canon } },
    // PR-A2 (b): the canonical home is MISSING (only a marked replacement remains) → MC4, even
    // though the replacement carries a valid SCR marker.
    { code: "MC4", inputs: { projections: [loadFixture("scr-marked-projection.ts")], chatAdapter: goodChat, canonicalPath: "supabase/functions/_shared/paige-spine/mindEvidence.ts" } },
    { code: "MC5", inputs: { projections: [good], chatAdapter: loadFixture("bad-mc5-chat.ts"), canonicalPath: canon } },
    // PR-A2 (c): the exported entry point re-implements the states while an UNUSED helper carries
    // the render call — the whole-file check missed this; the exported-body scope catches it → MC5.
    { code: "MC5", inputs: { projections: [good], chatAdapter: loadFixture("bad-mc5b-chat-scoped.ts"), canonicalPath: canon } },
    // MC5: a missing configured adapter is a violation, not a silent pass.
    { code: "MC5", inputs: { projections: [good], chatAdapter: undefined, canonicalPath: canon } },
  ];
  for (const c of cases) {
    const codes = analyzeMindContract(c.inputs).map((v) => v.code);
    if (!codes.includes(c.code)) fail(`${c.code} case was NOT flagged (got: ${codes.join(", ") || "none"}).`);
    else console.log(`SELF-TEST: ${c.code} case correctly flagged.`);
  }

  // 2) PR-A2 (a) — the DETECTOR itself (used by readRealSpineInputs to FILTER real files) must
  // recognize a function-valued `export const` projection, and NOT the Chat adapter or a plain file.
  if (!isMindProjectionCandidate(loadFixture("bad-p1b-const-projection.ts").content)) fail("PR-A2(a): export-const projection NOT detected as a candidate.");
  else console.log("SELF-TEST: PR-A2(a) export-const projection detected as a candidate.");
  if (isMindProjectionCandidate(goodChat.content)) fail("PR-A2(a): the Chat adapter was wrongly detected as a projection candidate.");
  else console.log("SELF-TEST: PR-A2(a) Chat adapter correctly NOT a candidate.");

  console.log(ok ? "SELF-TEST: PASS — the Mind-contract guard behaves correctly." : "SELF-TEST: FAIL.");
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    process.exit(selfTest() ? 0 : 1);
  }

  let inputs;
  try {
    inputs = readRealSpineInputs();
  } catch (e) {
    console.error(`[mind-contract-lint] cannot read ${relative(REPO_ROOT, SPINE_DIR)}: ${e.message}`);
    process.exit(1);
  }

  const violations = analyzeMindContract(inputs);
  if (violations.length > 0) {
    console.error("");
    console.error("✗ mind-contract-lint FAILED — the three-state Mind evidence contract regressed:");
    for (const v of violations) {
      console.error(`    • [${v.code}] ${v.path}`);
      console.error(`        ${v.message}`);
    }
    console.error("");
    console.error("  The Mind surface (3D feed + Chat) must resolve everything to exactly");
    console.error("  recorded | no_evidence | unavailable, fail closed, and word absence honestly,");
    console.error("  from ONE projection home. See mindEvidence.ts and §18/§13/§00.");
    console.error("");
    process.exit(1);
  }

  console.log(
    `✓ mind-contract-lint: ${inputs.projections.length} Mind projection(s) honor the three-state contract; Chat renders via it.`,
  );
  process.exit(0);
}

// Run as CLI only when invoked directly (not when imported by a test).
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
