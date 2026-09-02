#!/usr/bin/env node
/**
 * governed-execution-lint — one governed pathway, and no door that skips it.
 *
 * WHAT THIS GUARDS. `_shared/paige-spine/governedExecution.ts` is the shared seam every caller —
 * Chat, an automation, an agent, a skill, a future MCP surface — runs a capability through. Its
 * load-bearing property is that it is BLIND to which door knocked: identical inputs must produce
 * identical decisions whether the caller is Chat or an MCP client, because the moment a decision
 * consults the door, "reach it a different way" becomes a way to gain permission.
 *
 * A test already asserts that property across every door. This guard exists because a test asserts
 * the property for the inputs it enumerates, and a later edit can add a branch for a door the test
 * did not think of. The guard asserts the ABSENCE of the branch, which is the stronger claim, and
 * it is the same reason `action-risk.ts` is a file rather than a Set beside the gate.
 *
 * THE THREE RULES
 *
 *   R1  DOOR-BLIND. `governedExecution.ts` may record `door` on the audit line and may name it in
 *       types. It may not compare it, switch on it, or condition on it.
 *
 *   R2  NO SECOND ASSEMBLY. `decideToolConfirmation` is the canonical approval decision. Only the
 *       Chat handler (which owns the inline sequence this seam was extracted from) and the seam
 *       itself may call it directly. A new caller assembling the gate for itself is how a platform
 *       ends up with three locks on one door, which is what `one-approval-gate-lint` and
 *       `docs/doctrine/one-approval-gate.md` exist to stop — this extends that rule to the shared
 *       pathway rather than duplicating its guard.
 *
 *   R3  NO BOOLEAN APPROVAL INPUT. `GovernedApproval` may not declare a boolean field. An approval
 *       that a caller can express as `true` is an approval a MODEL can express as `true` — the
 *       #784 shape. On this seam an approval is a successful atomic claim of a server-held
 *       proposal, or it is nothing, and that must remain structurally true rather than merely
 *       conventional.
 *
 * ESCAPE HATCH. `// governed-execution-exempt: <reason>` on the line — deliberate and explained.
 *
 * WHAT PASSING DOES NOT MEAN. It does not mean a capability is governed; nothing is required to USE
 * the seam yet. It means the seam has not acquired a door-dependent branch, a rival assembly, or a
 * boolean approval input.
 *
 *   node scripts/ci/governed-execution-lint.mjs
 *   node scripts/ci/governed-execution-lint.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";

const SEAM = "supabase/functions/_shared/paige-spine/governedExecution.ts";

/**
 * `_shared/toolConfirmation.ts` (#711) is SUPERSEDED and, by the Chat handler's own merge note at
 * `paige-ai-chat/index.ts:7922`, "in the tree unwired". It was replaced on 2026-09-02 by the inline
 * sequence over `paige_pending_confirmations`, which executes the STORED arguments and proves the
 * proposal predates the turn by REQUEST identity rather than by a timestamp.
 *
 * Nothing in production imports it. Re-wiring it is an approval-SEMANTICS change and belongs to the
 * Chat build, so no file may adopt it quietly — including this seam, which nearly did, because it
 * is a pure decision function of exactly the right shape and its two decisions agree on the obvious
 * fixtures. Agreement on fixtures is not the same as being the mechanism production runs.
 */
const GATE_ADOPTION_ALLOWLIST = new Set([]);

/** The seam receives a claim result; it must never perform a claim. Claiming has one home. */
const CLAIMING = /paige_pending_confirmations|claimConfirmation|confirmFingerprint|\.from\(|\.rpc\(/;

const EXEMPT = /\/\/\s*governed-execution-exempt:\s*\S/;

/** Remove comments and string/template bodies so prose and messages cannot trip a rule. */
export function stripCommentsAndStrings(src) {
  let out = "", i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < src.length) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}

/** R1 — any `door` used in a comparison or a condition. */
export function doorBranches(src) {
  const code = stripCommentsAndStrings(src);
  const hits = [];
  const patterns = [
    /\bdoor\b\s*(===|!==|==|!=)/g,                    // door === "mcp"
    /(===|!==|==|!=)\s*[A-Za-z0-9_.?]*\bdoor\b/g,     // "mcp" === caller.door
    /\b(if|switch|while)\s*\([^)]*\bdoor\b/g,         // if (caller.door …)
    /\bdoor\b[^;\n]*\?[^:\n]*:/g,                     // caller.door ? … : …
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code))) {
      const line = code.slice(0, m.index).split("\n").length;
      const raw = src.split("\n")[line - 1] ?? "";
      if (EXEMPT.test(raw)) continue;
      hits.push({ line, text: raw.trim() });
    }
  }
  // One violation is a LINE, not a regex match — several patterns describe the same branch
  // (`if (caller.door === "mcp")` is both an equality and a condition), and counting it twice
  // would make the self-test's expected numbers meaningless.
  const byLine = new Map();
  for (const h of hits) if (!byLine.has(h.line)) byLine.set(h.line, h);
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/** R3 — a boolean field anywhere in the GovernedApproval declaration. */
export function booleanApprovalFields(src) {
  const code = stripCommentsAndStrings(src);
  const m = code.match(/type\s+GovernedApproval\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return { parsed: false, fields: [] };
  const fields = [...m[1].matchAll(/(\w+)\s*\??\s*:\s*boolean\b/g)].map((x) => x[1]);
  return { parsed: true, fields };
}

/**
 * R2 — every file that IMPORTS the canonical gate.
 *
 * Keyed on the import rather than on the identifier, because the module that DEFINES
 * `decideToolConfirmation` necessarily names it and is not a caller of itself. A guard whose
 * first real run flags its own source of truth is a guard people learn to ignore.
 */
export function importsGate(src) {
  const code = stripCommentsAndStrings(src);
  return /import\s[^;]*\bdecideToolConfirmation\b[^;]*from/.test(code);
}

/** Every file that calls the canonical gate directly. */
export function gateCallers(roots) {
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(p); continue; }
      if (!/\.(ts|tsx|mts)$/.test(e.name)) continue;
      const src = fs.readFileSync(p, "utf8");
      if (!importsGate(src)) continue;
      const rel = p.split(path.sep).join("/");
      if (/\.(test|spec)\.(ts|tsx)$/.test(rel)) continue;   // tests exercise it on purpose
      if (EXEMPT.test(src)) continue;
      found.push(rel);
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  return found;
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  let bad = 0;
  const check = (label, got, want) => {
    const okc = JSON.stringify(got) === JSON.stringify(want);
    if (!okc) bad++;
    console.log(`${okc ? "✓" : "✗"} ${label}${okc ? "" : ` — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`);
  };

  check("R1 catches an equality branch on the door",
    doorBranches(`if (caller.door === "mcp") return { kind: "execute" };`).length, 1);
  check("R1 catches a reversed comparison",
    doorBranches(`const x = "mcp" !== caller.door;`).length, 1);
  check("R1 catches a switch on the door",
    doorBranches(`switch (caller.door) { case "mcp": break; }`).length, 1);
  check("R1 catches a ternary on the door",
    doorBranches(`const lane = caller.door ? "auto" : "confirm";`).length, 1);
  check("R1 allows recording the door on the audit line",
    doorBranches(`const audit = { door: caller.door, decision };`).length, 0);
  check("R1 allows the door in a type declaration",
    doorBranches(`export type GovernedCaller = { door: GovernedDoor };`).length, 0);
  check("R1 is not tripped by the word door in prose",
    doorBranches(`// no caller gains permission through a different door === ever\nconst a = 1;`).length, 0);
  check("R1 is not tripped by the word door in a string",
    doorBranches(`const msg = "the door === here is prose";`).length, 0);
  check("R1 respects an explained exemption",
    doorBranches(`if (caller.door === "mcp") return x; // governed-execution-exempt: owner-ruled`).length, 0);

  check("R2 does not flag the module that DEFINES the gate",
    importsGate(`export function decideToolConfirmation(input) { return { kind: "execute" }; }`), false);
  check("R2 flags a file that imports the gate",
    importsGate(`import { decideToolConfirmation } from "../toolConfirmation.ts";`), true);
  check("R2 is not tripped by the name in prose",
    importsGate(`// decideToolConfirmation is the canonical gate\nconst a = 1;`), false);

  check("R3 catches a boolean approval field",
    booleanApprovalFields(`type GovernedApproval = {\n  autonomyLane: string;\n  confirm?: boolean;\n};`).fields,
    ["confirm"]);
  check("R3 passes a claim-only approval",
    booleanApprovalFields(`type GovernedApproval = {\n  autonomyLane: string;\n  claim?: ConfirmationClaim;\n};`).fields,
    []);
  check("R3 reports when it could not parse the type",
    booleanApprovalFields(`type Something = { a: boolean };`).parsed, false);

  console.log(bad ? `\n✗ governed-execution-lint self-test: ${bad} failure(s).`
                  : "\n✓ governed-execution-lint self-test passed.");
  process.exit(bad ? 1 : 0);
}

// ── real run ─────────────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(SEAM)) {
  console.error(`✗ governed-execution-lint: ${SEAM} is missing. Failing closed.`);
  process.exit(1);
}
const src = fs.readFileSync(SEAM, "utf8");
let failed = false;

const branches = doorBranches(src);
if (branches.length) {
  failed = true;
  console.error(`✗ R1 door-blindness: ${branches.length} decision(s) branch on the calling door.\n`);
  for (const b of branches) console.error(`  ${SEAM}:${b.line}  ${b.text}`);
  console.error("\n  A decision that consults the door makes 'reach it a different way' a way to gain");
  console.error("  permission. Record the door on the audit line; never read it in a branch.");
}

const approval = booleanApprovalFields(src);
if (!approval.parsed) {
  failed = true;
  console.error("\n✗ R3: could not parse the GovernedApproval declaration. Failing closed — a guard");
  console.error("  that cannot find what it checks passes everything.");
} else if (approval.fields.length) {
  failed = true;
  console.error(`\n✗ R3 no boolean approval input: GovernedApproval declares ${approval.fields.map((f) => `\`${f}\``).join(", ")}.`);
  console.error("  An approval a caller can express as `true` is one a MODEL can express as `true`.");
  console.error("  On this seam an approval is a successful atomic claim, or it is nothing (#784).");
}

const callers = gateCallers(["supabase/functions", "src"]);
const rogue = callers.filter((f) => !GATE_ADOPTION_ALLOWLIST.has(f));
if (rogue.length) {
  failed = true;
  console.error(`\n✗ R2 no quiet adoption: ${rogue.length} file(s) import the SUPERSEDED #711 gate.\n`);
  for (const f of rogue) console.error(`  ${f}`);
  console.error("\n  `_shared/toolConfirmation.ts` is unwired and superseded by the inline sequence over");
  console.error("  `paige_pending_confirmations`. Adopting it would make a superseded design the shared");
  console.error("  contract — an approval-semantics change, which belongs to the Chat build.");
}

// R4 — the seam receives a claim; it does not perform one.
const seamCode = stripCommentsAndStrings(src);
if (CLAIMING.test(seamCode)) {
  failed = true;
  console.error("\n✗ R4 one home for claiming: the seam performs its own claim or data access.");
  console.error("  It must RECEIVE the result of the canonical atomic claim, never run one. Two claim");
  console.error("  protocols in series deadlock the first time their notions of \"the same action\" differ.");
}

if (failed) process.exit(1);
console.log("✓ governed-execution-lint: seam is door-blind, declares no boolean approval input, "
  + "performs no claim of its own, and nothing adopts the superseded #711 gate.");
