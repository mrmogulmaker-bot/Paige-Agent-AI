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
 * on main. It exists so a later edit cannot silently: add a fourth Mind state, make the
 * projector return a partial answer instead of failing closed, drop the "infer nothing"
 * honesty copy from an absence block, stand up a SECOND Mind projection without a Spine
 * Change Request, or let Chat re-derive the states itself and drift from Mind.
 *
 * WHAT IT CHECKS (violation codes):
 *   MC1  the Mind projection's state union is EXACTLY {recorded, no_evidence, unavailable}.
 *   MC2  the projector is FAIL-CLOSED: non-available -> unavailable, empty -> no_evidence,
 *        any un-projectable signal -> unavailable (never a partial "recorded").
 *   MC3  the UNAVAILABLE and NO_EVIDENCE render blocks carry their honesty guardrail copy
 *        ("infer nothing" / "not proof none happened").
 *   MC4  there is ONE Mind projection home. A second projection module must declare a Spine
 *        Change Request marker (`sharedPrimitiveChange: "SCR-..."` or `// mind-projection-scr: <ref>`).
 *   MC5  the Chat adapter RENDERS VIA the Mind projection and does not re-derive the states
 *        itself (the three-state union literal must not appear in the Chat adapter).
 *
 * SCOPE (§00): this guard's jurisdiction is correctness and honesty of the data contract.
 * It has zero opinion about how the Mind surface LOOKS. It only proves the states stay
 * three, stay fail-closed, and stay honestly worded.
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
const FIXTURE_DIR = join(REPO_ROOT, "scripts", "fixtures", "mind-contract");

/** The one true set of Mind states. Extended only by an owner-approved Spine Change Request. */
export const CANONICAL_MIND_STATES = Object.freeze(["no_evidence", "recorded", "unavailable"]);

/** An SCR marker permits a second Mind projection home (the §18 escape, made explicit). */
const SCR_MARKER = /sharedPrimitiveChange\s*:\s*["'`]SCR-|\/\/\s*mind-projection-scr\s*:\s*\S+/;

/**
 * A file DEFINES a Mind projection when it exports a `*MindEvidence` union type and that
 * union carries all three canonical `status` literals. This deliberately does NOT match the
 * `*ChatEvidence.ts` adapters or the domain descriptors, which reference `mindBinding` but
 * define no three-state union.
 */
export function isMindProjection(content) {
  if (!/export\s+type\s+\w*MindEvidence\b/.test(content)) return false;
  return CANONICAL_MIND_STATES.every((state) => new RegExp(`status\\s*:\\s*["']${state}["']`).test(content));
}

/**
 * Extract the `status` string literals from the exported `*MindEvidence` union, scoped to the
 * union members (lines that, trimmed, start with `|`) so projector/return-site literals do not
 * leak in. Returns a sorted, de-duplicated array.
 */
export function extractMindStateLiterals(content) {
  const lines = content.split(/\r?\n/);
  const states = new Set();
  let inUnion = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^export\s+type\s+\w*MindEvidence\b/.test(line)) {
      inUnion = true;
      // A single-line union declaration is possible; scan the same line too.
      for (const m of line.matchAll(/status\s*:\s*["']([a-z_]+)["']/g)) states.add(m[1]);
      if (line.endsWith(";") && line.includes("|")) inUnion = false;
      continue;
    }
    if (!inUnion) continue;
    if (line.startsWith("|") || line.startsWith("{")) {
      for (const m of line.matchAll(/status\s*:\s*["']([a-z_]+)["']/g)) states.add(m[1]);
      if (line.endsWith(";")) inUnion = false; // last member terminates the type
      continue;
    }
    // A non-member, non-blank line ends the union block.
    if (line.length > 0) inUnion = false;
  }
  return [...states].sort();
}

/**
 * The whole check, as a pure function of file contents, so a test can drive it with fixtures.
 * @param {{ projections: {path:string, content:string}[], chatAdapter: {path:string, content:string} }} inputs
 * @returns {{ code:string, path:string, message:string }[]}
 */
export function analyzeMindContract(inputs) {
  const violations = [];
  const projections = inputs.projections ?? [];
  const chat = inputs.chatAdapter;

  // MC4 — one home (or an SCR marker on the extras). Evaluate first so the "primary" is stable.
  if (projections.length === 0) {
    violations.push({
      code: "MC4",
      path: relative(REPO_ROOT, SPINE_DIR),
      message: "No Mind projection found. The three-state Mind contract must live in exactly one projection module.",
    });
  }
  if (projections.length > 1) {
    // The canonical home is the shortest-path projection (mindEvidence.ts at the spine root);
    // every additional projection must carry an SCR marker.
    const sorted = [...projections].sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path));
    for (const extra of sorted.slice(1)) {
      if (!SCR_MARKER.test(extra.content)) {
        violations.push({
          code: "MC4",
          path: extra.path,
          message:
            "A second Mind projection exists without a Spine Change Request. Generalising Mind retrieval is a shared-primitive change — declare `sharedPrimitiveChange: \"SCR-<ref>\"` or `// mind-projection-scr: <ref>`, or fold it back into the one home (§18).",
        });
      }
    }
  }

  // MC1/MC2/MC3 run against each projection (there is normally exactly one).
  for (const proj of projections) {
    const states = extractMindStateLiterals(proj.content);
    const canonical = [...CANONICAL_MIND_STATES].sort();
    if (states.length !== canonical.length || states.some((s, i) => s !== canonical[i])) {
      violations.push({
        code: "MC1",
        path: proj.path,
        message: `Mind state union is {${states.join(", ") || "∅"}} but must be exactly {${canonical.join(", ")}}. A fourth or renamed state silently changes what the Mind surface can honestly claim.`,
      });
    }

    const nonAvailableClosed = /status\s*!==\s*["']available["'][\s\S]{0,120}?["']unavailable["']/.test(proj.content);
    const emptyIsNoEvidence = /\.signals\.length[\s\S]{0,120}?["']no_evidence["']/.test(proj.content);
    const unprojectableClosed = /===\s*null[\s\S]{0,120}?["']unavailable["']/.test(proj.content);
    if (!nonAvailableClosed || !emptyIsNoEvidence || !unprojectableClosed) {
      const missing = [
        nonAvailableClosed ? null : "non-available resolver result -> unavailable",
        emptyIsNoEvidence ? null : "empty signal set -> no_evidence",
        unprojectableClosed ? null : "any un-projectable signal -> unavailable (no partial answer)",
      ].filter(Boolean);
      violations.push({
        code: "MC2",
        path: proj.path,
        message: `Mind projector is not provably fail-closed. Missing: ${missing.join("; ")}. A projector that returns a partial answer can imply activity it never verified (§13).`,
      });
    }

    const saysInferNothing = /infer\s+(nothing|activity)/i.test(proj.content);
    const saysNotProofOfNone = /not\s+(treat\s+that\s+as\s+proof|proof)|no\s+activity\s+occurred/i.test(proj.content);
    if (!saysInferNothing || !saysNotProofOfNone) {
      const missing = [
        saysInferNothing ? null : "UNAVAILABLE must tell the reader to infer nothing",
        saysNotProofOfNone ? null : "NO_EVIDENCE must say absence is not proof that nothing happened",
      ].filter(Boolean);
      violations.push({
        code: "MC3",
        path: proj.path,
        message: `An absence render block is missing its honesty guardrail: ${missing.join("; ")}. Absence must never read as activity, or as proof of none (§13/§00).`,
      });
    }
  }

  // MC5 — Chat is a caller, not a second author.
  if (chat) {
    const rendersViaProjection = /render\w*MindEvidence\s*\(/.test(chat.content);
    const rederivesStates = CANONICAL_MIND_STATES.filter((s) => s !== "unavailable" && s !== "recorded")
      // Only `no_evidence` is unique enough to be a re-derivation tell; `unavailable`/`recorded`
      // are ordinary words. If the Chat adapter constructs the `no_evidence` literal itself, it
      // is re-deriving the state machine instead of calling the projection.
      .some((s) => new RegExp(`["']${s}["']`).test(chat.content));
    if (!rendersViaProjection || rederivesStates) {
      const why = !rendersViaProjection
        ? "it does not render via the Mind projection (render*MindEvidence)"
        : "it constructs a Mind state literal itself";
      violations.push({
        code: "MC5",
        path: chat.path,
        message: `The Chat adapter re-derives Mind evidence (${why}). Chat must be a caller of the one projection so Chat and Mind cannot drift into two accounts of the same record (§18).`,
      });
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

/** Read the real Spine projection files + the Chat adapter into `analyzeMindContract` inputs. */
export function readRealSpineInputs() {
  const files = walk(SPINE_DIR).map((abs) => ({
    path: relative(REPO_ROOT, abs).split(sep).join("/"),
    content: readFileSync(abs, "utf8"),
  }));
  const projections = files.filter((f) => isMindProjection(f.content));
  const chatAbs = join(REPO_ROOT, CHAT_ADAPTER_REL);
  let chatAdapter;
  try {
    chatAdapter = { path: CHAT_ADAPTER_REL, content: readFileSync(chatAbs, "utf8") };
  } catch {
    chatAdapter = undefined;
  }
  return { projections, chatAdapter };
}

function loadFixture(name) {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

function selfTest() {
  let ok = true;
  const fail = (msg) => {
    ok = false;
    console.error(`SELF-TEST FAIL: ${msg}`);
  };

  const goodProjection = { path: "fixtures/good-projection.ts", content: loadFixture("good-projection.ts") };
  const goodChat = { path: "fixtures/good-chat.ts", content: loadFixture("good-chat.ts") };

  // 0) The compliant fixtures must produce zero violations.
  const clean = analyzeMindContract({ projections: [goodProjection], chatAdapter: goodChat });
  if (clean.length !== 0) fail(`compliant fixtures produced ${clean.length} violation(s): ${clean.map((v) => v.code).join(", ")}`);
  else console.log("SELF-TEST: compliant fixtures produced 0 violations.");

  // 1) One planted violation per code must be caught, and nothing else.
  const cases = [
    { code: "MC1", inputs: { projections: [{ path: "bad-mc1.ts", content: loadFixture("bad-mc1-projection.ts") }], chatAdapter: goodChat } },
    { code: "MC2", inputs: { projections: [{ path: "bad-mc2.ts", content: loadFixture("bad-mc2-projection.ts") }], chatAdapter: goodChat } },
    { code: "MC3", inputs: { projections: [{ path: "bad-mc3.ts", content: loadFixture("bad-mc3-projection.ts") }], chatAdapter: goodChat } },
    { code: "MC4", inputs: { projections: [goodProjection, { path: "bad-mc4.ts", content: loadFixture("bad-mc4-second-projection.ts") }], chatAdapter: goodChat } },
    { code: "MC5", inputs: { projections: [goodProjection], chatAdapter: { path: "bad-mc5.ts", content: loadFixture("bad-mc5-chat.ts") } } },
  ];
  for (const c of cases) {
    const codes = analyzeMindContract(c.inputs).map((v) => v.code);
    if (!codes.includes(c.code)) fail(`${c.code} fixture was NOT flagged (got: ${codes.join(", ") || "none"}).`);
    else console.log(`SELF-TEST: ${c.code} fixture correctly flagged.`);
  }

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
