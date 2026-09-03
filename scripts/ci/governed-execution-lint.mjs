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
 * NO ESCAPE HATCH, deliberately. There was one, and review picked it five different ways across
 * this guard and its MCP sibling: a plain string, a template tail, JSX text, a comment belonging to
 * the PRECEDING statement, and a block comment merely EXPLAINING the marker. It was also entirely
 * UNUSED — zero occurrences in product code. A hatch nobody opens that five people can pick is not
 * a feature. A genuine exception now edits THIS FILE: a visible, reviewable act rather than a
 * comment anyone can write.
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

/**
 * Every LEAF token's span, cached per source file.
 *
 * A comment cannot overlap a token — that is what makes it trivia. So the parser's own token spans
 * are the ground truth for validating a candidate comment range, whatever produced it.
 */

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
 * R1 — every mention of `door` except the two that are legitimate.
 *
 * INVERTED, on Codex's recommendation and after this guard was extended three times by adding
 * whichever access form had just been demonstrated: element access, then plain destructuring, then
 * a computed destructuring key, and then a destructuring ASSIGNMENT (`({ door: d } = caller)`),
 * which TypeScript models as a PropertyAssignment rather than a BindingElement and so slipped past
 * all three. A denylist of access forms loses to the next form every time — the same losing shape
 * inverted twice already in the MCP guard on the sibling PR.
 *
 * So the rule is now an ALLOWLIST OF POSITIONS. Any node naming `door` is a hit unless it sits in
 * one of exactly two permitted places:
 *
 *   1. a TYPE-LEVEL declaration of the field   `door: GovernedDoor` in a type or interface
 *   2. the audit record copying it             `door: <expr>.door` as an object-literal property
 *
 * A new syntax for reading a property lands in neither, so it fails CLOSED rather than passing
 * unseen. The cost is that a genuinely new legitimate use must be added here deliberately, which
 * is the correct direction for a guard whose other failure mode is a door-dependent seam shipping
 * with the check green.
 */
export function doorBranches(src, fileName = "in-memory.ts") {
  const sf = parse(src, fileName);
  const hits = [];
  walk(sf, (n) => {
    if (!namesDoor(n)) return;
    if (permittedDoorPosition(n)) return;
    const line = lineOf(sf, n);
    hits.push({ line, text: lineText(src, line) });
  });
  const byLine = new Map();
  for (const h of hits) if (!byLine.has(h.line)) byLine.set(h.line, h);
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/** Does this node NAME the door — as an identifier, or as a string standing in for one? */
function namesDoor(n) {
  if (ts.isIdentifier(n)) return n.text === "door";
  // A string is only a NAME when it is being used as one: a key or an index. Prose that happens to
  // contain the word is not, which is why this checks the parent rather than the text alone.
  if (!ts.isStringLiteralLike(n) || n.text !== "door") return false;
  const p = n.parent;
  if (!p) return false;
  return (ts.isElementAccessExpression(p) && p.argumentExpression === n) ||
         ts.isComputedPropertyName(p) ||
         ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === n);
}

/** The two places `door` may legitimately appear. Everything else is a read this seam must not do. */
function permittedDoorPosition(n) {
  const p = n.parent;
  if (!p) return false;

  // 1. A TYPE-LEVEL declaration: `door: GovernedDoor` in a type/interface, or a type reference.
  if (ts.isPropertySignature(p) && p.name === n) return true;
  if (ts.isTypeNode(p)) return true;

  // 2. THE AUDIT COPY, and only in its exact shape: `door: <expr>.door` as an object-literal
  //    property. Both halves are permitted — the key, and the read that feeds it.
  if (ts.isPropertyAssignment(p) && p.name === n) return isAuditDoorAssignment(p);
  if ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) &&
      (p.name === n || p.argumentExpression === n)) {
    const owner = p.parent;
    return !!owner && ts.isPropertyAssignment(owner) && owner.initializer === p &&
           isAuditDoorAssignment(owner);
  }
  return false;
}

/**
 * `door: <anything>` sitting as a property of an object literal that is BEING BUILT AS A VALUE.
 *
 * The "as a value" half is load-bearing and my first attempt got it wrong twice over. An object
 * literal is also the syntax for a destructuring TARGET, so `({ door: d } = caller)` is a door READ
 * wearing the audit record's shape. I excluded that one case by testing for the left of `=` — and
 * Codex immediately produced `for ({ door: d } of callers)`, whose parent is a ForOfStatement and
 * not a BinaryExpression at all. Measured on that head: zero hits.
 *
 * That is the same losing shape as the guard this function belongs to: enumerating the TARGET
 * contexts loses to the next one (for-in, nested patterns, a default in a parameter list). So it is
 * inverted here too — enumerate the VALUE positions, where an object literal is unambiguously a
 * record being constructed, and treat everything else as a target. A context nobody listed fails
 * CLOSED, which for this predicate means "not an audit record", which means the read is reported.
 */
function isAuditDoorAssignment(assignment) {
  if (!assignment.name) return false;
  const key = ts.isIdentifier(assignment.name) ? assignment.name.text : lit(assignment.name);
  if (key !== "door") return false;
  const obj = assignment.parent;
  if (!obj || !ts.isObjectLiteralExpression(obj)) return false;
  return isValuePosition(obj);
}

/** Is this expression being USED as a value, rather than standing as an assignment target? */
function isValuePosition(node) {
  const p = node.parent;
  if (!p) return false;
  // Transparent wrappers keep whatever position their parent has.
  if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) ||
      ts.isSatisfiesExpression?.(p) || ts.isTypeAssertionExpression(p) ||
      ts.isNonNullExpression(p)) return isValuePosition(p);
  if (ts.isVariableDeclaration(p) || ts.isPropertyDeclaration(p)) return p.initializer === node;
  if (ts.isPropertyAssignment(p)) return p.initializer === node;
  if (ts.isReturnStatement(p)) return p.expression === node;
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) return (p.arguments ?? []).includes(node);
  if (ts.isArrowFunction(p)) return p.body === node;
  if (ts.isArrayLiteralExpression(p)) return p.elements.includes(node);
  if (ts.isSpreadAssignment(p) || ts.isSpreadElement(p)) return p.expression === node;
  if (ts.isConditionalExpression(p)) return p.whenTrue === node || p.whenFalse === node;
  if (ts.isBinaryExpression(p)) {
    // The RIGHT of an assignment is a value; the LEFT is a target. Any other operator takes values.
    if (p.operatorToken.kind === ts.SyntaxKind.EqualsToken) return p.right === node;
    return true;
  }
  return false;   // ForOf/ForIn initialisers, binding patterns, and anything not listed
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
/**
 * Members `GovernedApproval` may declare.
 *
 * An allowlist, so every addition is a deliberate act rather than a drift. The test an entry has to
 * pass is not "is it a boolean" — it is: CAN THIS MEMBER GRANT? A member that can only ever narrow
 * what runs is safe here; one that can express "yes, approved" is the thing this rule exists to
 * keep out.
 *
 * The name alone does not carry that. Admitting `claimedFor` by NAME left `claimedFor?: boolean`
 * passing green — the same field, re-typed into exactly the success flag this rule forbids, with
 * the allowlist recording only the label and not the reason it was admitted.
 *
 * So the allowlist pins the exact TYPE each member was admitted with, and a member whose annotation
 * differs by anything but whitespace is refused. My first fix instead scanned for boolean-ish
 * spellings, which left `claimedFor?: ApprovalFlag` passing — an alias this guard cannot read, and
 * reading it would mean resolving names, the machinery deleted from the sibling guard today for
 * producing three fail-opens in one round. Pinning needs no resolution: an unreadable type is
 * simply not the admitted one, so it is refused rather than guessed at.
 *
 * The cost is that a deliberate type change must edit this map — which is the point. That edit is
 * where someone restates why the member still cannot grant.
 *
 *   autonomyLane  the workspace's resolved lane. Selects how much approval is REQUIRED; every
 *                 unrecognised value refuses.
 *   claimedArgs   the RESULT of an atomic claim. Its presence is the approval, and it carries the
 *                 stored call — there is no separate "it worked" flag to drift from it.
 *   claimedFor    the capability id the claim was redeemed against. A string that names WHAT was
 *                 approved and cannot express THAT something was. It only ever REFUSES: absent or
 *                 mismatched means the stored claim is rejected. Added after measuring that an
 *                 approval granted for an ordinary create otherwise executed a high-risk delete —
 *                 the live mechanism binds tool identity in the fingerprint, and that binding is
 *                 lost at this boundary unless it is restated.
 */
const APPROVAL_FIELDS_ALLOWED = new Map([
  ["autonomyLane", `"auto" | "confirm" | "off" | string`],
  ["claimedArgs", `Record<string, unknown> | null`],
  ["claimedFor", `string`],
]);

export function booleanApprovalFields(src, fileName = "in-memory.ts") {
  const sf = parse(src, fileName);
  // EVERY declaration, not the first one. TypeScript merges interfaces of the same name, so
  // stopping at the first match let `interface GovernedApproval extends ApprovalFlag {}` sit
  // unread after a clean declaration — the merged type inherits `approved?: boolean` while this
  // rule reports nothing. Collect them all and refuse a merge rather than trying to combine them:
  // combining is resolution by another name, and the shape this guard must read is ONE declaration.
  const decls = [];
  walk(sf, (n) => {
    if (ts.isTypeAliasDeclaration(n) && n.name.text === "GovernedApproval" &&
        ts.isTypeLiteralNode(n.type)) decls.push({ members: n.type.members, heritage: false });
    if (ts.isInterfaceDeclaration(n) && n.name.text === "GovernedApproval")
      decls.push({ members: n.members, heritage: !!n.heritageClauses?.length });
  });
  if (decls.length > 1) {
    return { parsed: true,
             fields: [`<declared ${decls.length} times — a merged type cannot be read as one shape>`] };
  }
  const only = decls[0];
  let members = !only ? null : only.heritage ? "heritage" : only.members;

  if (members === "heritage") {
    return { parsed: true, fields: ["<extends another type — inherited members cannot be read>"] };
  }
  if (!members) return { parsed: false, fields: [] };
  const declared = [];
  for (const m of members) {
    // A member this rule cannot read is NOT a member it may ignore. `approved(): boolean`, a call
    // signature and an index signature are all valid TypeScript that add a caller-expressible
    // channel, and all three were skipped here — reported by Codex against the doc sentence
    // claiming the type declares only three members, which the code did not enforce.
    // Refusing is the same answer as everywhere else in this guard: a shape I cannot read is not
    // the admitted one.
    if (!ts.isPropertySignature(m) || !m.name) {
      declared.push(`<unreadable member kind: ${ts.SyntaxKind[m.kind]}>`);
      continue;
    }
    // Identifier, string literal, OR a computed name with a constant inside (`["approved"]?: …`),
    // which is a perfectly ordinary property signature and extracted by neither of the first two.
    let nm = null;
    if (ts.isIdentifier(m.name)) nm = m.name.text;
    else if (ts.isComputedPropertyName(m.name)) nm = lit(m.name.expression) ?? "<computed>";
    else nm = lit(m.name);
    // A name this rule cannot resolve is not waved through: an unnameable member is still a member.
    const name = nm ?? "<unresolved>";
    if (!APPROVAL_FIELDS_ALLOWED.has(name)) { declared.push(name); continue; }
    // ALLOWLISTED BY NAME IS NOT ENOUGH. Each entry was admitted for a stated reason — that it can
    // only ever narrow — and for `claimedFor` that reason is precisely its being a string. Checking
    // the name alone means a later `claimedFor?: boolean` keeps the guard green while turning the
    // field into the success flag this whole rule exists to forbid. The allowlist has to enforce
    // the REASON, not the label.
    const want = APPROVAL_FIELDS_ALLOWED.get(name);
    const got = m.type ? normaliseType(m.type.getText()) : "<none>";
    if (got !== normaliseType(want)) declared.push(`${name} (declared \`${got}\`, admitted as \`${want}\`)`);
  }
  return { parsed: true, fields: declared };
}

/** Whitespace is not meaning; everything else in a type annotation is. */
function normaliseType(text) { return String(text).replace(/\s+/g, " ").trim(); }

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
  // R1 is now an ALLOWLIST OF POSITIONS, not a denylist of access forms — inverted after being
  // extended three times by adding whichever form had just been demonstrated. These are every form
  // that has ever been raised, and the inversion means a form nobody has thought of yet fails
  // CLOSED instead of passing unseen.
  check("R1 destructured door", doorBranches("const { door } = caller; if (door === \"mcp\") return x;").length, 1);
  check("R1 COMPUTED destructured door (Codex)", doorBranches("const { [\"door\"]: d } = caller; if (d === \"mcp\") return x;").length, 1);
  check("R1 renamed destructure", doorBranches("const { door: d } = caller; if (d === \"mcp\") return x;").length, 1);
  // The fourth form, and the one that forced the inversion: a destructuring ASSIGNMENT is a
  // PropertyAssignment, not a BindingElement, so all three checks above missed it.
  check("R1 destructuring ASSIGNMENT (Codex)", doorBranches("let d; ({ door: d } = caller); if (d === \"mcp\") return x;").length, 1);
  // Codex on 7fa7b3f7: an object literal is ALSO the syntax for a destructuring target, so the
  // audit shape can be worn by a read. My first exclusion tested for the left of `=`; a for-of
  // target is not a BinaryExpression at all. Inverted to enumerate VALUE positions instead —
  // these hold both halves of that.
  check("R1 for-of destructuring target (Codex)", doorBranches("let d; for ({ door: d } of callers) { if (d === \"mcp\") return 1; }").length, 1);
  check("R1 for-in destructuring target", doorBranches("let d; for ({ door: d } in callers) { if (d === \"mcp\") return 1; }").length, 1);
  check("R1 allows the audit inside a return", doorBranches("function f(){ return { door: caller.door, decision }; }").length, 0);
  check("R1 allows the audit as a call argument", doorBranches("log({ door: caller.door });").length, 0);
  check("R1 allows the audit via an arrow body", doorBranches("const f = () => ({ door: caller.door });").length, 0);
  check("R1 ignores an unrelated destructured key", doorBranches("const { tenantId } = caller; return tenantId;").length, 0);
  check("R1 allows the audit assignment", doorBranches("const audit = { door: caller.door, decision };").length, 0);
  check("R1 allows a type declaration", doorBranches("export type C = { door: GovernedDoor };").length, 0);
  check("R1 ignores the word in prose", doorBranches('// a different door === ever\nconst a = 1;').length, 0);
  check("R1 ignores the word in a string", doorBranches('const m = "the door === here";').length, 0);
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
    booleanApprovalFields(`type GovernedApproval = { autonomyLane: "auto" | "confirm" | "off" | string; confirm?: boolean; };`).fields, ["confirm"]);
  check("R3 boolean-equivalent (Codex)",
    booleanApprovalFields(`type GovernedApproval = { autonomyLane: "auto" | "confirm" | "off" | string; approved?: true | false; };`).fields, ["approved"]);
  check("R3 aliased type (Codex)",
    booleanApprovalFields(`type GovernedApproval = { autonomyLane: "auto" | "confirm" | "off" | string; approved?: ApprovalFlag; };`).fields, ["approved"]);
  check("R3 READONLY modifier (Codex)",
    booleanApprovalFields(`type GovernedApproval = { autonomyLane: "auto" | "confirm" | "off" | string; readonly approved?: boolean; };`).fields, ["approved"]);
  check("R3 QUOTED property (Codex)",
    booleanApprovalFields(`type GovernedApproval = { autonomyLane: "auto" | "confirm" | "off" | string; "approved"?: boolean; };`).fields, ["approved"]);
  check("R3 two members on one line",
    booleanApprovalFields(`type GovernedApproval = { autonomyLane: "auto" | "confirm" | "off" | string; a?: boolean; b?: boolean; };`).fields, ["a", "b"]);
  // Round 6 (Codex). An allowlisted NAME whose type turns it into an assertion — and then the
  // alias hole I found in my own first fix for it.
  const APPROVAL = (extra) =>
    `type GovernedApproval = { autonomyLane: "auto" | "confirm" | "off" | string; claimedArgs?: Record<string, unknown> | null; ${extra} };`;
  check("R3 rejects an allowlisted field redeclared as a boolean (Codex)",
    booleanApprovalFields(APPROVAL(`claimedFor?: boolean`)).fields.length, 1);
  check("R3 rejects an allowlisted field narrowed to a boolean literal (Codex)",
    booleanApprovalFields(APPROVAL(`claimedFor?: true`)).fields.length, 1);
  check("R3 rejects a boolean hidden in a union",
    booleanApprovalFields(APPROVAL(`claimedFor?: string | boolean`)).fields.length, 1);
  check("R3 rejects a type ALIAS it cannot read, rather than passing it",
    booleanApprovalFields(APPROVAL(`claimedFor?: ApprovalFlag`)).fields.length, 1);
  check("R3 refuses a DECLARATION-MERGED type (Codex)",
    booleanApprovalFields(`interface GovernedApproval { autonomyLane: "auto" | "confirm" | "off" | string; claimedArgs?: Record<string, unknown> | null; claimedFor?: string; }
interface GovernedApproval extends ApprovalFlag {}`).fields.length, 1);
  check("R3 refuses a merge even when the second declaration looks harmless",
    booleanApprovalFields(`interface GovernedApproval { autonomyLane: "auto" | "confirm" | "off" | string; }
interface GovernedApproval { approved?: boolean; }`).fields.length, 1);
  check("R3 refuses an interface that EXTENDS another type (Codex)",
    booleanApprovalFields(`interface GovernedApproval extends ApprovalFlag { autonomyLane: "auto" | "confirm" | "off" | string; }`).fields.length, 1);
  check("R3 still reads a plain interface",
    booleanApprovalFields(`interface GovernedApproval { autonomyLane: "auto" | "confirm" | "off" | string; claimedArgs?: Record<string, unknown> | null; claimedFor?: string; }`).fields, []);
  check("R3 accepts the exact admitted shape",
    booleanApprovalFields(APPROVAL(`claimedFor?: string`)).fields, []);
  check("R3 ignores whitespace, not meaning",
    booleanApprovalFields(APPROVAL(`claimedFor?:\n    string`)).fields, []);
  check("R3 passes the real shape",
    booleanApprovalFields(`type GovernedApproval = { autonomyLane: "auto" | "confirm" | "off" | string; claimedArgs?: Record<string, unknown> | null; };`).fields, []);
  // Codex on 016ccbf5: a member this rule could not read was silently skipped, so all three of
  // these shapes returned no fields while adding a caller-expressible channel.
  check("R3 refuses a METHOD member",
    booleanApprovalFields(APPROVAL(`claimedFor?: string; approved(): boolean`)).fields,
    ["<unreadable member kind: MethodSignature>"]);
  check("R3 refuses an INDEX signature",
    booleanApprovalFields(APPROVAL(`claimedFor?: string; [k: string]: unknown`)).fields,
    ["<unreadable member kind: IndexSignature>"]);
  check("R3 refuses a CALL signature",
    booleanApprovalFields(APPROVAL(`claimedFor?: string; (): boolean`)).fields,
    ["<unreadable member kind: CallSignature>"]);
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
  console.error(`  Only ${[...APPROVAL_FIELDS_ALLOWED].map((f) => "`" + f + "`").join(", ")} are permitted. Any other member is a new`);
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
