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
/**
 * The text of a string literal, seeing through transparent wrappers.
 *
 * `bindingKeyName` unwrapped a computed `["x"]` key but then handed the inner expression to a `lit`
 * that only knew a bare literal, so `({ [("rpc")]: rpc } = client)` returned null and R4 reported
 * zero hits on a seam that had acquired `rpc`. That is the THIRD time a wrapper has hidden a
 * literal from a caller of this function — `namesDoor` grew its own `effectiveParent` walk for the
 * same reason. Unwrapping HERE fixes every caller at once instead of a fourth caller-side patch.
 */
function lit(node) {
  let n = node;
  while (isTransparent(n)) n = n.expression;
  return n && ts.isStringLiteralLike(n) ? n.text : null;
}

/**
 * The target of a read this guard could not name. Distinct from `null`, which means "read it, and
 * it is not interesting" — the whole failure class both of these rules had is treating those two
 * as the same answer. Ignorance is not innocence.
 */
const UNREADABLE = Symbol("unreadable");

/**
 * Same-file names that provably stand for ONE string, so a named specifier can be resolved.
 *
 * The first version of this flattened every declaration into a first-name-wins map, ignoring scope,
 * reassignment, and the difference between `const` and `let`. Review found it wrong in BOTH
 * directions on the same input shape: `const p = "./safe.ts"` at top level with
 * `const p = "../toolConfirmation.ts"` inside a function resolved to the SAFE one and hid a gate
 * load, and reversing the two falsely reported a safe load as the gate. A resolver that answers
 * confidently from the wrong binding is worse than one that declines — it is the fail-open this
 * whole rule exists to remove, reintroduced by the fix for it.
 *
 * A lint has no scope resolver, so this does not pretend to have one. A name is trusted ONLY when
 * the file leaves no room for it to mean anything else:
 *
 *   1. exactly ONE binding site for that name anywhere in the file — any kind counts, including a
 *      parameter, an import, and a function or class declaration, because each is a way for the
 *      name to mean something different at the call site;
 *   2. that binding is a `const` variable declaration with a string-literal initializer; and
 *   3. the name is never the target of an assignment.
 *
 * Anything else is UNREADABLE and fails closed, which is the correct side to err on: the message
 * tells the author to write a literal or an unambiguous const. Measured against the scan roots,
 * the four real dynamic imports all name a unique module-level const, so this costs nothing.
 */
function constStrings(sf) {
  const bindingCount = new Map();
  const assigned = new Set();
  const constValue = new Map();
  const bind = (name) => {
    if (!name || !ts.isIdentifier(name)) return;
    bindingCount.set(name.text, (bindingCount.get(name.text) ?? 0) + 1);
  };
  walk(sf, (n) => {
    if (ts.isVariableDeclaration(n)) {
      bind(n.name);
      // `const` is a property of the declaration LIST, not of the declaration.
      const isConst = n.parent && ts.isVariableDeclarationList(n.parent)
        && (n.parent.flags & ts.NodeFlags.Const) !== 0;
      if (isConst && n.initializer && ts.isIdentifier(n.name)) {
        const v = lit(n.initializer);
        if (v !== null) constValue.set(n.name.text, v);
      }
      return;
    }
    if (ts.isParameter(n) || ts.isBindingElement(n)) { bind(n.name); return; }
    if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) { bind(n.name); return; }
    if (ts.isImportSpecifier(n) || ts.isNamespaceImport(n)) { bind(n.name); return; }
    if (ts.isImportClause(n) && n.name) { bind(n.name); return; }
    if (ts.isBinaryExpression(n) && ts.isIdentifier(n.left)
        && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      assigned.add(n.left.text); return;
    }
    if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) && ts.isIdentifier(n.operand)) {
      assigned.add(n.operand.text);
    }
  });
  const out = new Map();
  for (const [name, v] of constValue) {
    if (bindingCount.get(name) === 1 && !assigned.has(name)) out.set(name, v);
  }
  return out;
}

/**
 * A module specifier's VALUE, resolved as far as this file allows: a literal, a substitution-free
 * template, a same-file string const, or a concatenation of those. Anything else is UNREADABLE.
 *
 * `import(p)` where `p` is a variable was the hole: `lit()` returned null, the rule read that as
 * "not the superseded module", and a dynamic adoption of the #711 bare-boolean gate stayed green.
 * The four real non-literal dynamic imports in the scan roots are all `import(SPEC)` over a
 * module-level const, so resolving that form is what keeps failing closed from costing anything.
 */
function specifierValue(node, consts) {
  let n = node;
  while (n && isTransparent(n)) n = n.expression;
  if (!n) return UNREADABLE;
  if (ts.isStringLiteralLike(n)) return n.text;
  if (ts.isIdentifier(n)) return consts.has(n.text) ? consts.get(n.text) : UNREADABLE;
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = specifierValue(n.left, consts), r = specifierValue(n.right, consts);
    return l === UNREADABLE || r === UNREADABLE ? UNREADABLE : l + r;
  }
  if (ts.isTemplateExpression(n)) {
    let out = n.head.text;
    for (const sp of n.templateSpans) {
      const v = specifierValue(sp.expression, consts);
      if (v === UNREADABLE) return UNREADABLE;
      out += v + sp.literal.text;
    }
    return out;
  }
  return UNREADABLE;
}

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
    // A property read whose KEY this guard cannot read. `caller["do" + "or"]` names the door and no
    // single string-literal node carries the text, so `namesDoor` declined it and R1 stayed green
    // on a seam branching on the calling door. Constant-folding that ONE expression form would lose
    // to the next one (a template, a constant, a variable), so the answer is the same inversion the
    // rest of this guard already uses: a key the guard cannot name is not a key it may clear.
    //
    // Receiver-agnostic deliberately — testing for `caller` would be its own enumeration of
    // aliases. Numeric indexing (`parts[0]`) stays clean because a number is readable and is not a
    // property NAME. Measured on the seam: zero element accesses of any kind, so this costs nothing
    // today and its whole value is the next edit.
    if (ts.isElementAccessExpression(n)) {
      const key = n.argumentExpression;
      const readable = lit(key) !== null || (!!key && ts.isNumericLiteral(key));
      if (!readable) {
        const line = lineOf(sf, n);
        hits.push({ line, text: lineText(src, line), unreadable: true });
        return;
      }
    }
    if (!namesDoor(n)) return;
    if (permittedDoorPosition(n)) return;
    const line = lineOf(sf, n);
    hits.push({ line, text: lineText(src, line) });
  });
  const byLine = new Map();
  for (const h of hits) if (!byLine.has(h.line)) byLine.set(h.line, h);
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/** A destructuring key's name, seeing through a computed `["x"]` wrapper. */
function bindingKeyName(node) {
  if (!node) return null;
  if (ts.isComputedPropertyName(node)) return lit(node.expression);
  if (ts.isIdentifier(node)) return node.text;
  return lit(node);
}

/** Is this node a wrapper that changes nothing about what its child IS? */
function isTransparent(n) {
  return !!n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) ||
                 ts.isTypeAssertionExpression(n) || ts.isNonNullExpression(n) ||
                 (ts.isSatisfiesExpression?.(n) ?? false));
}

/** The nearest parent that is not a transparent wrapper, and the child as that parent sees it. */
function effectiveParent(n) {
  let child = n, p = n.parent;
  while (isTransparent(p)) { child = p; p = p.parent; }
  return { parent: p, child };
}

/** Does this node NAME the door — as an identifier, or as a string standing in for one? */
function namesDoor(n) {
  if (ts.isIdentifier(n)) return n.text === "door";
  // A string is only a NAME when it is being used as one: a key or an index. Prose that happens to
  // contain the word is not, which is why this checks the parent rather than the text alone.
  //
  // Through TRANSPARENT WRAPPERS, because `caller[("door")]` reads the door and a direct-parent
  // test sees a ParenthesizedExpression and declines. Measured: zero hits before this.
  if (!ts.isStringLiteralLike(n) || n.text !== "door") return false;
  const { parent: p, child } = effectiveParent(n);
  if (!p) return false;
  return (ts.isElementAccessExpression(p) && p.argumentExpression === child) ||
         ts.isComputedPropertyName(p) ||
         ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === child);
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

/**
 * Is this expression being USED as a value, rather than standing as an assignment target?
 *
 * CONTAINERS PROPAGATE, THEY DO NOT DECIDE. My first version accepted a PropertyAssignment or an
 * array element as proof of a value, which is only true if the CONTAINER is itself a value —
 * `({ payload: { door: d } } = caller)` and `([{ door: d }] = callers)` are both destructuring
 * targets whose inner object sits inside exactly those containers. Measured: zero hits before this.
 *
 * So a container asks its own position instead of answering for its child, and only the terminals
 * below decide. Third time this predicate's family has lost to a locally-correct test; propagating
 * is the structural answer rather than a fourth exclusion.
 */
function isValuePosition(node) {
  const { parent: p, child } = effectiveParent(node);
  if (!p) return false;

  // CONTAINERS — inherit the position of whatever holds them.
  if (ts.isPropertyAssignment(p) && p.initializer === child) return isValuePosition(p.parent);
  if (ts.isShorthandPropertyAssignment(p)) return isValuePosition(p.parent);
  if (ts.isArrayLiteralExpression(p) && p.elements.includes(child)) return isValuePosition(p);
  if ((ts.isSpreadAssignment(p) || ts.isSpreadElement(p)) && p.expression === child) {
    return isValuePosition(p.parent);
  }
  if (ts.isConditionalExpression(p)) return isValuePosition(p);

  // TERMINALS — these decide.
  if (ts.isVariableDeclaration(p) || ts.isPropertyDeclaration(p)) return p.initializer === child;
  // DEFAULT VALUES. `function f(a = { door: caller.door })` and `const { a = { door: caller.door } }`
  // are both an object literal used as a value; the destructuring TARGET forms of each use an
  // ObjectBindingPattern, a different node kind entirely, so admitting these cannot admit a target.
  // Review named the parameter case; the binding-element case is the same construct one step over.
  if (ts.isParameter(p) || ts.isBindingElement(p)) return p.initializer === child;
  if (ts.isReturnStatement(p)) return p.expression === child;
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) return (p.arguments ?? []).includes(child);
  if (ts.isArrowFunction(p)) return p.body === child;
  if (ts.isBinaryExpression(p)) {
    // The RIGHT of an assignment is a value; the LEFT is a target. Any other operator takes values.
    if (p.operatorToken.kind === ts.SyntaxKind.EqualsToken) return p.right === child;
    return true;
  }
  // ForOf/ForIn initialisers, binding patterns, and anything not listed. An omission here reports a
  // legitimate audit record as a violation — friction, not a hole — which is why this list may stay
  // conservative and grow only when a real shape needs it.
  return false;
}

/**
 * R2 — any load of the superseded module: static import, dynamic `import()`, or `require()`.
 *
 * Keyed on the MODULE, never on the binding: `import * as c from …` then `c.decideToolConfirmation`
 * names the function nowhere in the import clause, and `await import(…)` is not an import
 * declaration at all. The repository uses dynamic imports widely, so that form is not hypothetical.
 */
/**
 * Why a file counts as loading the superseded gate: `"loads"` when the specifier RESOLVES to it,
 * `"unreadable"` when a dynamic load's specifier cannot be read at all — and `null` only when the
 * guard actually read every specifier and none matched.
 */
export function gateLoadReason(src, fileName = "in-memory.ts") {
  const sf = parse(src, fileName);
  const consts = constStrings(sf);
  let found = null;
  walk(sf, (n) => {
    if (found) return;
    // `export * from "…"` and `export { x } from "…"` load the module just as an import does, and
    // a barrel re-export lets a consumer adopt the gate through a different specifier entirely.
    if (ts.isExportDeclaration(n) && n.moduleSpecifier) {
      const m = lit(n.moduleSpecifier);
      if (m && SUPERSEDED.test(m)) { found = "loads"; return; }
    }
    if (ts.isImportDeclaration(n)) {
      const m = lit(n.moduleSpecifier);
      if (m && SUPERSEDED.test(m)) { found = "loads"; return; }
      // A named import of the function through some other path still counts.
      const clause = n.importClause?.namedBindings;
      if (clause && ts.isNamedImports(clause) &&
          clause.elements.some((e) => e.name.text === "decideToolConfirmation")) found = "loads";
      return;
    }
    if (ts.isCallExpression(n)) {
      const isDynamicImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(n.expression) && ts.isIdentifier(n.expression) &&
                        n.expression.text === "require";
      if (!isDynamicImport && !isRequire) return;
      // A dynamic load with no argument at all loads nothing this rule can be wrong about.
      if (!n.arguments.length) return;
      const m = specifierValue(n.arguments[0], consts);
      if (m === UNREADABLE) { found = "unreadable"; return; }
      if (SUPERSEDED.test(m)) found = "loads";
    }
  });
  return found;
}

/** Boolean face of `gateLoadReason`, kept because every caller and case reads it as one. */
export function importsGate(src, fileName = "in-memory.ts") {
  return gateLoadReason(src, fileName) !== null;
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
      if (DATA_METHODS.has(bindingKeyName(n.propertyName ?? n.name) ?? "")) {
        why = `destructured ${bindingKeyName(n.propertyName ?? n.name)}`;
      }
    }
    // …and so does `({ rpc } = client)`, which is a PropertyAssignment rather than a BindingElement.
    // R1 had this exact blind spot and I fixed it there WITHOUT checking whether the sibling rule
    // reading the same syntax had it too. It did. The class sweep is the point, not the instance.
    if (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) {
      const nm = bindingKeyName(n.name);
      if (!isValuePosition(n.parent)) {
        if (nm && DATA_METHODS.has(nm)) why = `destructured ${nm}`;
        // `({ [m]: fn } = client)` — the computed-key form of the destructuring ASSIGNMENT that
        // already slipped past this rule once. It is only unreadable in a TARGET position; an
        // object being BUILT (`const o = { [k]: v }`) is a value position and stays untouched.
        else if (nm === null && ts.isComputedPropertyName(n.name)) {
          why = "[unreadable] a destructured key this guard cannot name";
        }
      }
    }
    // `client["rpc"]` was caught; `client["r"+"pc"]`, `client[m]` and `const { [m]: fn } = client`
    // were NOT — `lit()` returned null and the rule read that as "not a data method". That is the
    // same fail-open the sibling MCP guard closed one PR earlier with an explicit unreadable
    // sentinel, and I swept this file for DESTRUCTURING rather than for the class the sentinel
    // names. Enumerate what is provably harmless and refuse the rest: a string key that is not a
    // data method, or a numeric index, can never be `.rpc`. Anything else fails CLOSED.
    if (ts.isElementAccessExpression(n)) {
      const a = n.argumentExpression;
      const k = lit(a);
      if (k !== null) { if (DATA_METHODS.has(k)) why = `["${k}"]`; }
      else if (!a || !ts.isNumericLiteral(a)) why = "[unreadable] a property read whose key this guard cannot name";
    }
    // `const { [m]: fn } = client` — a computed key on a BindingElement, unreadable for the same
    // reason and reachable for the same purpose.
    if (ts.isBindingElement(n) && n.propertyName && ts.isComputedPropertyName(n.propertyName)
        && lit(n.propertyName.expression) === null) {
      why = "[unreadable] a destructured key this guard cannot name";
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
      const reason = gateLoadReason(src, rel);
      if (reason) found.push({ file: rel, reason });
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walkDir(r);
  return found;
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  let bad = 0;
  // Counted HERE rather than reconstructed by a grep. The doc quoted `grep -c '^  check('` as the
  // way to reproduce "72 cases"; that grep returns 62, because loops run several checks from one
  // call site. Counting output lines instead over-counts by the trailing summary — which is how 43
  // was once published as 44, and is why the doc argued against the only method that worked. A
  // number the run emits about itself cannot drift from the run.
  let ran = 0;
  const check = (label, got, want) => {
    ran++;
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
  // Codex on 58230534: a container was accepting a value position LOCALLY, so an object literal
  // nested inside a destructuring target inherited the audit's permission. Containers now
  // propagate their own position instead of answering for their child.
  check("R1 nested object destructuring target (Codex)", doorBranches("let d; ({ payload: { door: d } } = caller); if (d === \"mcp\") return 1;").length, 1);
  check("R1 array-wrapped destructuring target (Codex)", doorBranches("let d; ([{ door: d }] = callers); if (d === \"mcp\") return 1;").length, 1);
  check("R1 parenthesised element-access key (Codex)", doorBranches("if (caller[(\"door\")] === \"mcp\") return x;").length, 1);
  check("R1 allows the audit nested in a record", doorBranches("const d = { audit: { door: caller.door } };").length, 0);
  check("R1 allows the audit as an array element", doorBranches("const rows = [{ door: caller.door }];").length, 0);
  // R4 had R1's destructuring-assignment blind spot too, and I fixed R1 without checking.
  check("R4 destructuring ASSIGNMENT of rpc (Codex)", claimTouches("let rpc; ({ rpc } = client); await rpc(\"redeem\", {});").length, 1);
  check("R4 destructuring ASSIGNMENT of from", claimTouches("let table; ({ from: table } = client); table(\"x\");").length, 1);
  check("R4 still ignores a record that merely NAMES rpc", claimTouches("const doc = { rpc: \"documented\" };").length, 0);
  check("R1 ignores an unrelated destructured key", doorBranches("const { tenantId } = caller; return tenantId;").length, 0);

  // R2 AND R3 SWEPT FOR DESTRUCTURING, after it was found in R1 and then in R4.
  //
  // It is not there — neither rule reads a destructurable expression: R2 reads module specifiers
  // and R3 reads type members. That is a negative result, and it is asserted rather than merely
  // concluded, because "I checked once" and "CI checks forever" are different guarantees and this
  // stack has already lost a helper to a silent deletion no test noticed.
  //
  // §13 CORRECTION, 2026-09-03. That sweep was reported as covering "R1's and R4's blind spot".
  // It covered the INSTANCE — destructuring — and not the CLASS, which is a target this guard
  // cannot read, and which I had named with an explicit sentinel in the sibling MCP guard one PR
  // earlier. Review then found the class alive in BOTH swept-adjacent rules: R2 read a dynamic
  // `import(p)` as "not the superseded module" and R4 read `client[m]` as "not a data method".
  // Both now fail closed, and the cases below run the forms that were green.
  for (const [label, decl] of [
    ["a plain boolean", `export type GovernedApproval = { confirm: boolean };`],
    ["a QUOTED key", `export type GovernedApproval = { "confirm": boolean };`],
    ["an OPTIONAL boolean", `export type GovernedApproval = { confirm?: boolean };`],
    ["a COMPUTED key", `export type GovernedApproval = { ["confirm"]: boolean };`],
    ["a UNION containing boolean", `export type GovernedApproval = { confirm: string | boolean };`],
    ["an INTERFACE declaration", `export interface GovernedApproval { confirm: boolean }`],
  ]) {
    check(`R3 sees a boolean through ${label}`,
      Number(booleanApprovalFields(decl, "t.ts").fields.some((f) => f.startsWith("confirm"))), 1);
  }
  for (const [label, src] of [
    ["an import", `import { x } from "../toolConfirmation.ts";`],
    ["an export-from", `export { x } from "../toolConfirmation.ts";`],
    ["a DYNAMIC import", `const g = await import("../toolConfirmation.ts");`],
    ["a require", `const g = require("../toolConfirmation.ts");`],
  ]) check(`R2 sees the superseded gate through ${label}`, Number(importsGate(src, "t.ts")), 1);
  check("R2 ignores an unrelated module", Number(importsGate(`import { x } from "./other.ts";`, "t.ts")), 0);

  // R2 — THE UNREADABLE-SPECIFIER CLASS (Codex, post-merge on #792). Each of these returned FALSE
  // before, so the superseded #711 bare-boolean gate could have been adopted dynamically with the
  // guard green. The specifier is now RESOLVED through the same file first, and only what still
  // cannot be read fails closed.
  for (const [label, src] of [
    ["a variable specifier", `const p = "../toolConfirmation.ts"; const g = await import(p);`],
    ["a CONCATENATED specifier", `const g = await import("../toolConfirm" + "ation.ts");`],
    ["a TEMPLATE specifier", "const d = \"..\"; const g = await import(`${d}/toolConfirmation.ts`);"],
    ["require() with a variable", `const p = "../toolConfirmation.ts"; const g = require(p);`],
  ]) check(`R2 RESOLVES the gate through ${label}`, gateLoadReason(src, "t.ts"), "loads");
  check("R2 FAILS CLOSED on a specifier it cannot resolve at all",
    gateLoadReason("const g = await import(pickAtRuntime());", "t.ts"), "unreadable");

  // THE RESOLVER'S OWN FAIL-OPEN (Codex, on the first version of this fix). A first-name-wins map
  // over every declaration in the file, ignoring scope, reassignment and const-ness, was wrong in
  // BOTH directions on one input shape: it resolved a shadowed name to the SAFE binding and hid a
  // gate load, and reversing the two values falsely reported a safe load as the gate. A resolver
  // that answers confidently from the wrong binding is the fail-open this rule exists to remove,
  // reintroduced by the fix for it. A name is now trusted only when the file leaves no room for it
  // to mean anything else.
  for (const [label, src] of [
    ["a SHADOWED const (the load was hidden)",
      `const p = "./safe.ts"; function f() { const p = "../toolConfirmation.ts"; return import(p); }`],
    ["a shadowed const the other way round (a safe load was falsely reported as the gate)",
      `const p = "../toolConfirmation.ts"; function f() { const p = "./safe.ts"; return import(p); }`],
    ["a REASSIGNED let", `let p = "./safe.ts"; p = "../toolConfirmation.ts"; const g = import(p);`],
    ["a var", `var p = "../toolConfirmation.ts"; const g = import(p);`],
    ["a PARAMETER shadowing a const", `const p = "./safe.ts"; function f(p) { return import(p); }`],
  ]) check(`R2 refuses to resolve ${label}`, gateLoadReason(src, "t.ts"), "unreadable");
  // The control that keeps resolution worth having: a UNIQUE, unassigned const still resolves, or
  // the four real dynamic imports in the scan roots would all start failing closed.
  check("R2 still resolves a unique, unassigned const naming the gate",
    gateLoadReason(`const p = "../toolConfirmation.ts"; const g = import(p);`, "t.ts"), "loads");
  check("R2 still resolves a unique const naming something else, and stays quiet",
    gateLoadReason(`const S = "npm:pdf-lib@1.17.1"; const l = import(S);`, "t.ts"), null);
  // The controls that make failing closed affordable: the four real non-literal dynamic imports in
  // the scan roots are all `import(SPEC)` over a module-level const, and they must stay silent.
  check("R2 resolves an UNRELATED const specifier and stays quiet",
    gateLoadReason(`const S = "npm:pdf-lib@1.17.1"; const l = await import(S);`, "t.ts"), null);
  check("R2 stays quiet on a literal unrelated module",
    gateLoadReason(`import { x } from "./other.ts";`, "t.ts"), null);
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

  // R4 — THE UNREADABLE-KEY CLASS (Codex, post-merge on #792). `client["rpc"]` was caught and each
  // of these was not, because an unreadable key read as "not a data method" — ignorance answering
  // as innocence. Enumerate what is provably harmless (a string key that is not a data method, a
  // numeric index) and refuse the rest.
  for (const [label, src] of [
    ["a CONCATENATED key", `const r = await client["r" + "pc"]("x", {});`],
    ["a VARIABLE key", `const m = "rpc"; const r = await client[m]("x", {});`],
    ["a computed DESTRUCTURING key", `const m = "rpc"; const { [m]: fn } = client; await fn("x", {});`],
    ["a computed destructuring ASSIGNMENT key", `const m = "rpc"; let fn; ({ [m]: fn } = client); await fn("x", {});`],
  ]) check(`R4 FAILS CLOSED on ${label}`, claimTouches(src).length, 1);
  // Controls: what is provably harmless must stay silent, or the rule is unusable and the next
  // person weakens it to get CI green — which is how a guard dies.
  check("R4 allows a numeric index", claimTouches("const first = rows[0];").length, 0);
  check("R4 allows a readable non-data key", claimTouches('const v = cfg["timeout"];').length, 0);
  check("R4 allows BUILDING an object with a computed key", claimTouches('const k = "a"; const o = { [k]: 1 };').length, 0);

  // ── review, on head eb0dbd83 ────────────────────────────────────────────────────────────────
  // Three code findings, all reproduced against the shipped guard first. Two are fail-OPEN, one is
  // a false POSITIVE, and each got its opposite-direction control so neither fix can be vacuous.

  // R1/F1 — a default value is a value. Omitting it reported a legitimate audit record.
  check("R1 audit record as a PARAMETER default (Codex)",
        doorBranches("function f(a = { door: caller.door, decision }) {}").length, 0);
  check("R1 audit record as a BINDING-ELEMENT default",
        doorBranches("const { a = { door: caller.door, decision } } = o;").length, 0);
  // …and the control that keeps those two honest: a default value is not a licence for a TARGET.
  check("R1 destructuring target is still a read, not a default",
        doorBranches("function f(o) { let d; ({ door: d } = o); }").length, 1);
  check("R1 a door read inside a parameter default is still a read",
        doorBranches("function f(a = caller.door) {}").length, 1);

  // R1/F3 — a key this guard cannot read cannot be cleared. `caller["do" + "or"]` names the door
  // and no single literal node carries the text.
  check("R1 CONSTANT-FOLDED door key (Codex)",
        doorBranches('if (caller["do" + "or"] === "mcp") return x;').length, 1);
  check("R1 VARIABLE key fails closed", doorBranches("if (caller[k] === \"mcp\") return x;").length, 1);
  check("R1 TEMPLATE key fails closed", doorBranches("if (caller[`do${x}`]) return x;").length, 1);
  // Controls: readable keys still decide on their own merits, in both directions.
  check("R1 a readable NON-door key is still clean", doorBranches('const d = caller["decision"];').length, 0);
  check("R1 NUMERIC indexing is not a property name", doorBranches("const p = parts[0];").length, 0);

  // R4/F2 — a computed destructuring key wrapped in parentheses hid the method name, so the seam
  // could acquire and invoke `rpc` with R4 green.
  check("R4 PARENTHESISED computed destructuring key (Codex)",
        claimTouches('let rpc; ({ [("rpc")]: rpc } = client);').length, 1);
  check("R4 `as`-wrapped computed destructuring key",
        claimTouches('let rpc; ({ [("rpc" as string)]: rpc } = client);').length, 1);
  // Control: unwrapping must not have made every computed key a hit.
  check("R4 a wrapped NON-data key is still clean",
        claimTouches('let id; ({ [("id")]: id } = row);').length, 0);

  console.log(bad ? `\n✗ governed-execution-lint self-test: ${bad} failure(s) of ${ran} case(s).`
                  : `\n✓ governed-execution-lint self-test passed — ${ran} runtime case(s).`);
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
  for (const b of branches) {
    console.error(`  ${SEAM}:${b.line}  ${b.text}${b.unreadable ? "   ← key unreadable" : ""}`);
  }
  console.error("\n  A decision that consults the door makes 'reach it a different way' a way to gain");
  console.error("  permission. Record the door on the audit line; never read it anywhere else.");
  if (branches.some((b) => b.unreadable)) {
    console.error("\n  A line marked 'key unreadable' is a property read whose key this guard cannot name,");
    console.error("  so it cannot rule out that the key is `door`. It fails CLOSED. Write the key as a");
    console.error("  string or numeric literal; do not teach the guard to skip keys it cannot read.");
  }
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
  console.error(`\n✗ R2 no quiet adoption: ${rogue.length} file(s) load, or may load, the SUPERSEDED #711 gate.\n`);
  for (const f of rogue) {
    console.error(`  ${f.file}${f.reason === "unreadable" ? "   ← dynamic load with an unreadable specifier" : ""}`);
  }
  console.error("\n  That module is unwired and superseded by the inline sequence over");
  console.error("  `paige_pending_confirmations`. Adopting it is an approval-semantics change,");
  console.error("  which belongs to the Chat build.");
  if (rogue.some((f) => f.reason === "unreadable")) {
    console.error("\n  A line marked 'unreadable specifier' is a dynamic import or require whose target this");
    console.error("  guard cannot name, so it cannot rule out that the target is the superseded gate. It");
    console.error("  fails CLOSED. Write the specifier as a literal or a same-file string const; do not");
    console.error("  teach the guard to skip the loads it cannot read.");
  }
}

if (failed) process.exit(1);
console.log("✓ governed-execution-lint: seam parsed via the TypeScript AST — door-blind, approval "
  + "inputs allowlisted, no claim of its own, and nothing loads the superseded #711 gate.");
