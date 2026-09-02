#!/usr/bin/env node
/**
 * governed-execution-lint — one governed pathway, and no door that skips it.
 *
 * WHAT THIS GUARDS. `_shared/paige-spine/governedExecution.ts` is the shared seam every caller —
 * Chat, an automation, an agent, a skill, a future MCP surface — runs a capability through. Its
 * load-bearing property is that it is BLIND to which door knocked: identical inputs must produce
 * identical decisions, because the moment a decision consults the door, "reach it a different way"
 * becomes a way to gain permission.
 *
 * A test asserts that property across the inputs it enumerates. This guard asserts the ABSENCE of
 * the branch, which is the stronger claim and survives inputs nobody thought of.
 *
 * WHY THIS USES THE TYPESCRIPT AST AND NOT REGEXES.
 * ------------------------------------------------
 * The first two versions matched patterns over lightly-stripped source. Codex review found SEVEN
 * ways past them across two rounds, and every one was the same mistake — reading a SPELLING where
 * the meaning is what matters:
 *
 *   R1  `caller["door"] === "mcp"`                     computed access; stripping removed `door`
 *   R2  `import * as c from "../toolConfirmation.ts"`  the binding never names the function
 *   R2  `await import("../toolConfirmation.ts")`       not a static `import … from` at all
 *   R3  `approved?: true | false`                      no `boolean` token
 *   R3  `readonly approved?: boolean`                  a modifier before the property name
 *   R4  `client["rpc"](…)`                             computed access again
 *   R4  `const claim = client.rpc.bind(client)`        an alias, not a call — and the repository
 *                                                      really does write this, at
 *                                                      `src/components/admin/studio/studio.ts:200`
 *
 * Each fix was another pattern, and the next spelling always won. A parser removes the class:
 * `typescript` is already a devDependency, so the guard now reads the program instead of the text.
 *
 * THE FOUR RULES
 *   R1  The seam never READS the calling door except to record it on the audit line.
 *   R2  Nothing imports the superseded, unwired #711 gate — statically, dynamically, or by require.
 *   R3  `GovernedApproval` declares `autonomyLane` and `claimedArgs` and nothing else. An allowlist,
 *       not a hunt for `boolean`: a forbidden-name list loses to the next name, and a type-shape
 *       check loses to the next type alias.
 *   R4  The seam never touches a claim or a data client — not `.rpc(`/`.from(`, and not a reference
 *       to them either, since `.rpc.bind(client)` is a claim wearing a different hat.
 *
 * ESCAPE HATCH: `// governed-execution-exempt: <reason>` on the line — deliberate and explained.
 *
 * WHAT PASSING DOES NOT MEAN. Nothing is required to USE the seam yet, so this proves the seam has
 * not acquired a door-dependent branch, a rival assembly, a boolean approval input, or its own
 * claim. It does not prove any capability is governed.
 *
 *   node scripts/ci/governed-execution-lint.mjs
 *   node scripts/ci/governed-execution-lint.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SEAM = "supabase/functions/_shared/paige-spine/governedExecution.ts";
const SUPERSEDED = /(^|\/)toolConfirmation(\.ts)?$/;
const CLAIM_NAMES = /^(paige_pending_confirmations|claimConfirmation|confirmFingerprint)$/;
const DATA_METHODS = new Set(["rpc", "from"]);
const EXEMPT = /\/\/\s*governed-execution-exempt:\s*\S/;

function parse(src, fileName = "in-memory.ts") {
  // Parse TSX as TSX. With ScriptKind.TS a JSX element derails error recovery and constructs AFTER
  // it can vanish from the tree — so a dynamic gate load in a `.tsx` file read as `.ts` was simply
  // not there to find. The script kind must follow the real extension.
  const kind = /\.tsx$/i.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, kind);
}
function walk(node, visit) { visit(node); node.forEachChild((c) => walk(c, visit)); }
function lineOf(sf, node) { return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1; }
function lineText(src, line) { return (src.split("\n")[line - 1] ?? "").trim(); }

/** The string a node denotes, when it is a literal. */
function lit(node) { return node && ts.isStringLiteralLike(node) ? node.text : null; }

/**
 * R1 — every READ of a `door` property, except the one that records it on the audit line.
 *
 * Structural rather than spelling-based: `caller.door` and `caller["door"]` are the same read to a
 * parser, and so is any future spelling. Recording it (`door: caller.door` inside an object
 * literal) is the single legitimate use, so that shape — and only that shape — is allowed.
 */
export function doorBranches(src, fileName = "in-memory.ts") {
  const sf = parse(src, fileName);
  const hits = [];
  walk(sf, (n) => {
    let isDoorRead = false;
    if (ts.isPropertyAccessExpression(n) && n.name.text === "door") isDoorRead = true;
    if (ts.isElementAccessExpression(n) && lit(n.argumentExpression) === "door") isDoorRead = true;
    // `const { door } = caller` extracts the same value with no property access at all.
    if (ts.isBindingElement(n)) {
      const src_ = n.propertyName ?? n.name;
      const nm = src_ && ts.isIdentifier(src_) ? src_.text : lit(src_);
      if (nm === "door") isDoorRead = true;
    }
    if (!isDoorRead) return;
    // The one permitted use: `door: <this read>` as an object-literal property.
    const p = n.parent;
    if (p && ts.isPropertyAssignment(p) && p.initializer === n &&
        p.name && ts.isIdentifier(p.name) && p.name.text === "door") return;
    const line = lineOf(sf, n);
    if (EXEMPT.test(lineText(src, line))) return;
    hits.push({ line, text: lineText(src, line) });
  });
  const byLine = new Map();
  for (const h of hits) if (!byLine.has(h.line)) byLine.set(h.line, h);
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/**
 * R2 — any load of the superseded module: static import, dynamic `import()`, or `require()`.
 *
 * Keyed on the MODULE, never on the binding: `import * as c from …` then `c.decideToolConfirmation`
 * names the function nowhere in the import clause, and `await import(…)` is not an import
 * declaration at all. The repository uses dynamic imports widely, so that form is not hypothetical.
 */
export function importsGate(src, fileName = "in-memory.ts") {
  const sf = parse(src, fileName);
  let found = false;
  walk(sf, (n) => {
    if (found) return;
    // `export * from "…"` and `export { x } from "…"` load the module just as an import does, and
    // a barrel re-export lets a consumer adopt the gate through a different specifier entirely.
    if (ts.isExportDeclaration(n) && n.moduleSpecifier) {
      const m = lit(n.moduleSpecifier);
      if (m && SUPERSEDED.test(m)) { found = true; return; }
    }
    if (ts.isImportDeclaration(n)) {
      const m = lit(n.moduleSpecifier);
      if (m && SUPERSEDED.test(m)) { found = true; return; }
      // A named import of the function through some other path still counts.
      const clause = n.importClause?.namedBindings;
      if (clause && ts.isNamedImports(clause) &&
          clause.elements.some((e) => e.name.text === "decideToolConfirmation")) found = true;
      return;
    }
    if (ts.isCallExpression(n)) {
      const isDynamicImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(n.expression) && n.expression.text === "require";
      if (!isDynamicImport && !isRequire) return;
      const m = lit(n.arguments[0]);
      if (m && SUPERSEDED.test(m)) found = true;
    }
  });
  return found;
}

/**
 * R3 — `GovernedApproval` may declare these members and nothing else.
 *
 * Reads real PropertySignature nodes, so a modifier (`readonly`), a quoted name, several members on
 * one line, or any type spelling are all handled by the parser rather than by this rule. Fails
 * closed when the declaration cannot be found.
 */
const APPROVAL_FIELDS_ALLOWED = new Set(["autonomyLane", "claimedArgs"]);

export function booleanApprovalFields(src, fileName = "in-memory.ts") {
  const sf = parse(src, fileName);
  let members = null;
  walk(sf, (n) => {
    if (members) return;
    if (ts.isTypeAliasDeclaration(n) && n.name.text === "GovernedApproval" &&
        ts.isTypeLiteralNode(n.type)) members = n.type.members;
    if (ts.isInterfaceDeclaration(n) && n.name.text === "GovernedApproval") members = n.members;
  });
  if (!members) return { parsed: false, fields: [] };
  const declared = [];
  for (const m of members) {
    if (!ts.isPropertySignature(m) || !m.name) continue;
    // Identifier, string literal, OR a computed name with a constant inside (`["approved"]?: …`),
    // which is a perfectly ordinary property signature and extracted by neither of the first two.
    let nm = null;
    if (ts.isIdentifier(m.name)) nm = m.name.text;
    else if (ts.isComputedPropertyName(m.name)) nm = lit(m.name.expression) ?? "<computed>";
    else nm = lit(m.name);
    // A name this rule cannot resolve is not waved through: an unnameable member is still a member.
    declared.push(nm ?? "<unresolved>");
  }
  return { parsed: true, fields: declared.filter((f) => !APPROVAL_FIELDS_ALLOWED.has(f)) };
}

/**
 * R4 — the seam receives a claim result; it never performs one.
 *
 * Flags a REFERENCE to a data method, not only a call, because `client.rpc.bind(client)` is a claim
 * one alias away from being made — an idiom this repository already uses.
 */
/** Receivers whose `.from` is a standard-library conversion, not a data client. */
const NOT_A_CLIENT = new Set(["Array", "Object", "String", "Number", "Date", "Buffer", "Set", "Map",
                              "Promise", "JSON", "Math", "Reflect", "Uint8Array", "BigInt"]);

export function claimTouches(src, fileName = "in-memory.ts") {
  const sf = parse(src, fileName);
  const hits = [];
  walk(sf, (n) => {
    let why = null;
    if (ts.isIdentifier(n) && CLAIM_NAMES.test(n.text)) why = n.text;
    if (ts.isPropertyAccessExpression(n) && DATA_METHODS.has(n.name.text)) {
      // `Array.from(items)` is a conversion, not a data client. Flagging it would force a
      // misleading exemption into the seam, and an exemption written to silence a false positive is
      // how a guard gets weakened for real.
      const recv = n.expression;
      const isLib = ts.isIdentifier(recv) && NOT_A_CLIENT.has(recv.text);
      if (!isLib) why = `.${n.name.text}`;
    }
    // `const { rpc } = client` extracts the method with no property access left to match.
    if (ts.isBindingElement(n)) {
      const src_ = n.propertyName ?? n.name;
      const nm = src_ && ts.isIdentifier(src_) ? src_.text : lit(src_);
      if (nm && DATA_METHODS.has(nm)) why = `destructured ${nm}`;
    }
    if (ts.isElementAccessExpression(n)) {
      const k = lit(n.argumentExpression);
      if (k && DATA_METHODS.has(k)) why = `["${k}"]`;
    }
    if (ts.isStringLiteralLike(n) && CLAIM_NAMES.test(n.text)) why = n.text;
    if (!why) return;
    const line = lineOf(sf, n);
    if (EXEMPT.test(lineText(src, line))) return;
    hits.push({ line, why });
  });
  const byLine = new Map();
  for (const h of hits) if (!byLine.has(h.line)) byLine.set(h.line, h);
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/** Every file that loads the superseded gate. */
export function gateCallers(roots) {
  const found = [];
  const walkDir = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && !e.name.startsWith(".")) walkDir(p); continue; }
      if (!/\.(ts|tsx|mts)$/.test(e.name)) continue;
      const rel = p.split(path.sep).join("/");
      if (/\.(test|spec)\.(ts|tsx)$/.test(rel)) continue;
      const src = fs.readFileSync(p, "utf8");
      if (EXEMPT.test(src)) continue;
      if (importsGate(src, rel)) found.push(rel);
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walkDir(r);
  return found;
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  let bad = 0;
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) bad++;
    console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`);
  };

  // R1
  check("R1 equality branch", doorBranches('if (caller.door === "mcp") return x;').length, 1);
  check("R1 reversed comparison", doorBranches('const a = "mcp" !== caller.door;').length, 1);
  check("R1 switch", doorBranches("switch (caller.door) { case \"mcp\": break; }").length, 1);
  check("R1 ternary", doorBranches('const l = caller.door ? "auto" : "confirm";').length, 1);
  check("R1 COMPUTED access (Codex)", doorBranches('if (caller["door"] === "mcp") return x;').length, 1);
  check("R1 computed, single quotes", doorBranches("if (caller['door']) return x;").length, 1);
  check("R1 allows the audit assignment", doorBranches("const audit = { door: caller.door, decision };").length, 0);
  check("R1 allows a type declaration", doorBranches("export type C = { door: GovernedDoor };").length, 0);
  check("R1 ignores the word in prose", doorBranches('// a different door === ever\nconst a = 1;').length, 0);
  check("R1 ignores the word in a string", doorBranches('const m = "the door === here";').length, 0);
  check("R1 respects an exemption",
    doorBranches('if (caller.door === "mcp") return x; // governed-execution-exempt: owner-ruled').length, 0);

  // R2
  check("R2 named import", importsGate('import { decideToolConfirmation } from "../toolConfirmation.ts";'), true);
  check("R2 NAMESPACE import (Codex)", importsGate('import * as c from "../toolConfirmation.ts";'), true);
  check("R2 DYNAMIC import (Codex)",
    importsGate('const { decideToolConfirmation } = await import("../toolConfirmation.ts");'), true);
  check("R2 require()", importsGate('const c = require("../toolConfirmation.ts");'), true);
  check("R2 does not flag the defining module",
    importsGate("export function decideToolConfirmation(i) { return i; }"), false);
  check("R2 ignores the name in prose", importsGate("// decideToolConfirmation is canonical\nconst a=1;"), false);

  // R3
  check("R3 plain boolean",
    booleanApprovalFields("type GovernedApproval = { autonomyLane: string; confirm?: boolean; };").fields, ["confirm"]);
  check("R3 boolean-equivalent (Codex)",
    booleanApprovalFields("type GovernedApproval = { autonomyLane: string; approved?: true | false; };").fields, ["approved"]);
  check("R3 aliased type (Codex)",
    booleanApprovalFields("type GovernedApproval = { autonomyLane: string; approved?: ApprovalFlag; };").fields, ["approved"]);
  check("R3 READONLY modifier (Codex)",
    booleanApprovalFields("type GovernedApproval = { autonomyLane: string; readonly approved?: boolean; };").fields, ["approved"]);
  check("R3 QUOTED property (Codex)",
    booleanApprovalFields('type GovernedApproval = { autonomyLane: string; "approved"?: boolean; };').fields, ["approved"]);
  check("R3 two members on one line",
    booleanApprovalFields("type GovernedApproval = { autonomyLane: string; a?: boolean; b?: boolean; };").fields, ["a", "b"]);
  check("R3 passes the real shape",
    booleanApprovalFields("type GovernedApproval = { autonomyLane: string; claimedArgs?: Record<string, unknown> | null; };").fields, []);
  check("R3 fails closed when absent", booleanApprovalFields("type Other = { a: boolean };").parsed, false);

  // R4
  check("R4 direct rpc call", claimTouches('const r = await client.rpc("x", {});').length, 1);
  check("R4 computed rpc call (Codex)", claimTouches('const r = await client["rpc"]("x", {});').length, 1);
  check("R4 BOUND ALIAS (Codex)", claimTouches("const claim = client.rpc.bind(client);").length, 1);
  check("R4 from()", claimTouches('const r = client.from("t");').length, 1);
  check("R4 claim table name", claimTouches('const t = "paige_pending_confirmations";').length, 1);
  check("R4 clean seam code", claimTouches("const risk = classifyAction(capability.id);").length, 0);

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

const branches = doorBranches(src, SEAM);
if (branches.length) {
  failed = true;
  console.error(`✗ R1 door-blindness: ${branches.length} place(s) read the calling door outside the audit line.\n`);
  for (const b of branches) console.error(`  ${SEAM}:${b.line}  ${b.text}`);
  console.error("\n  A decision that consults the door makes 'reach it a different way' a way to gain");
  console.error("  permission. Record the door on the audit line; never read it anywhere else.");
}

const approval = booleanApprovalFields(src, SEAM);
if (!approval.parsed) {
  failed = true;
  console.error("\n✗ R3: could not find the GovernedApproval declaration. Failing closed.");
} else if (approval.fields.length) {
  failed = true;
  console.error(`\n✗ R3 approval-input allowlist: GovernedApproval declares ${approval.fields.map((f) => `\`${f}\``).join(", ")}.`);
  console.error("  Only `autonomyLane` and `claimedArgs` are permitted. Any other member is a new");
  console.error("  approval input whatever its type says — and an approval a caller can express is");
  console.error("  one a MODEL can express (#784).");
}

const claims = claimTouches(src, SEAM);
if (claims.length) {
  failed = true;
  console.error(`\n✗ R4 one home for claiming: ${claims.length} reference(s) to a claim or data client.\n`);
  for (const c of claims) console.error(`  ${SEAM}:${c.line}  ${c.why}`);
  console.error("\n  The seam RECEIVES the result of the canonical atomic claim; it never runs one.");
}

const rogue = gateCallers(["supabase/functions", "src"]);
if (rogue.length) {
  failed = true;
  console.error(`\n✗ R2 no quiet adoption: ${rogue.length} file(s) load the SUPERSEDED #711 gate.\n`);
  for (const f of rogue) console.error(`  ${f}`);
  console.error("\n  That module is unwired and superseded by the inline sequence over");
  console.error("  `paige_pending_confirmations`. Adopting it is an approval-semantics change,");
  console.error("  which belongs to the Chat build.");
}

if (failed) process.exit(1);
console.log("✓ governed-execution-lint: seam parsed via the TypeScript AST — door-blind, approval "
  + "inputs allowlisted, no claim of its own, and nothing loads the superseded #711 gate.");
