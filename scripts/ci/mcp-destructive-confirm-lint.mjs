#!/usr/bin/env node
/**
 * mcp-destructive-confirm-lint — a boolean in the model's own arguments is not an approval.
 *
 * WHAT THIS GUARDS. `paige-mcp` exposes its tools to an external MCP client (Claude Desktop,
 * ChatGPT, anything the operator connects over OAuth). Every argument those tools receive is
 * authored by a MODEL. So a tool that reads an approval flag out of its own arguments and then
 * performs a destructive act has gated destruction on a value the thing being gated wrote.
 *
 * `docs/doctrine/one-approval-gate.md` forbids the shape by name:
 *
 *     | Trusting `confirm: true` from the model's arguments alone
 *     |   → That flag is the model's own JSON. It selects a branch; it proves nothing.
 *
 * THE ANCHORING CASE (#784). `bulk_delete_contacts` hard-deleted up to 100 `clients` rows with the
 * SERVICE-ROLE client, gated only by `confirm: z.boolean()`. No action-risk class, no autonomy
 * lane, no approval proof. The same act in Chat is `crm_delete_contact`, classified `high`, where
 * model-asserted approval is refused outright.
 *
 * WHY THIS USES THE TYPESCRIPT AST AND NOT A REGEX SCANNER.
 * -------------------------------------------------------
 * The first version hand-rolled a brace matcher over lightly-stripped source. Codex review found
 * four independent ways past it, and every one was the same mistake — reading a SPELLING where the
 * meaning is what matters:
 *
 *   · `mcp.tool('name', …)`             — single quotes; the extractor matched only double quotes
 *   · `pattern: /}/` before the handler — a brace inside a regex literal ended the block early,
 *                                         truncating the body before the destructive call
 *   · `mcp.tool /* c *\/ ("name", …)`   — a comment before `(` hid the call from the extractor AND
 *                                         from the independent counter, so the cross-check agreed
 *                                         with itself and the tool was never inspected
 *   · `approved: z.boolean()`           — an approval-shaped name outside the hand-written list
 *
 * Chasing those one at a time is unwinnable: each fix is another spelling. A parser removes the
 * whole class, because it reads the program rather than the text. `typescript` is already a
 * devDependency here, so this costs nothing.
 *
 * TWO RULES, BOTH SEMANTIC RATHER THAN LEXICAL
 * --------------------------------------------
 *   1. Every `X.tool(…)` call is found via the AST, so there is no "declaration form the parser
 *      cannot read" and no separate inventory to disagree with. A tool whose NAME is computed is
 *      still analysed; the name is only used for the report.
 *   2. A tool is flagged when its handler performs a destructive act AND its input schema declares
 *      ANY boolean — whatever that field is called. That is the inversion the review's finding
 *      demanded: an allowlist of forbidden names loses to the next name, while "a destructive tool
 *      may not take a boolean from the model at all" holds regardless of vocabulary.
 *
 * WHAT PASSING DOES NOT MEAN. It does not mean an MCP tool is governed. It means this one invalid
 * pattern is absent. Routing mutating MCP tools through the shared governed Spine execution seam is
 * a separate, sequenced workstream (#784).
 *
 * THE EXACT PROMISE, AND WHERE IT STOPS
 * -------------------------------------
 * Five review rounds all landed here rather than on the containment, and the pattern is worth
 * naming: a rule that tries to prove a NEGATIVE over arbitrary TypeScript ("nowhere in this file
 * does a destructive tool take a boolean") has a receding edge, because aliasing, indirection and
 * dataflow have no closed form. A guard that quietly overpromises is its own false green. So the
 * promise is stated positively and narrowly, and the gap is stated rather than papered over.
 *
 * IT DOES PROMISE, and each of these is bounded and complete rather than a list of known evasions:
 *   · Every call to a method named `tool` — `x.tool(…)` or `x["tool"](…)` — is found by the parser.
 *   · Such a registration is inspected ONLY when the guard can both SEE every member and LOOK
 *     INSIDE the two that matter. Every member must be a property assignment or method with a
 *     readable name — a spread, a shorthand, a computed key hides members it cannot enumerate — AND
 *     the `handler` / `inputSchema` initializers must carry their content INLINE — a handler must
 *     be a function literal, a schema must contain an inline object literal. Anything else is
 *     UNANALYSABLE and FAILS the run.
 *
 *     Visibility alone was not enough, and it took two passes to get right. First `{ handler }` was
 *     rejected while `{ handler: handler }` sailed through — the key was visible and only the BODY
 *     was elsewhere, so the walkers found no deletion and "declares nothing" read as safe. Then
 *     `{ handler: makeHandler("purge") }` sailed through the fix for THAT, because a call is not a
 *     reference. Each time the question had been half-answered, and a half-answered question reads
 *     as a green check. The test is now what can actually be READ, per member.
 *
 *     This is an allowlist of what can be read, not an enumeration of what to catch, which is why
 *     it cannot be outrun by a new spelling. Once a member is both visible and inline, an ABSENT
 *     member is a fact and not a gap — a tool declaring no schema takes no boolean and one
 *     declaring no handler performs no act, so both pass rather than raising a false alarm.
 *   · An inspected destructive handler may not declare ANY model-settable boolean, by shape.
 *   · A tool name this guard cannot resolve is never CLEARED by the scope map — unknown counts as
 *     possibly delete-scoped.
 *
 * IT DOES NOT PROMISE:
 *   · Resolving a constant, an import, or any other indirection to a value. A computed name is
 *     analysed and failed closed on, never resolved. General dataflow is out of scope by choice.
 *   · Detecting a registration whose METHOD name is itself computed (`mcp[k](…)` where `k` is a
 *     variable). Measured: zero such calls exist across the three surfaces.
 *   · Resolving ANY name to a value. Not an import, not a local, not a same-file constant. An
 *     earlier version resolved same-file top-level constants and review found three ways past it
 *     within one round — a `let` rebound before use, a `const` object mutated by assignment, and a
 *     parameter shadowing the name. Each fix wanted more of a symbol table, and a half-built type
 *     checker inside a lint is a fail-open with good manners. The stopping point is deliberate.
 *   · Judging the schema of a tool whose handler this guard does not read as destructive. That is
 *     the one place the `destructiveCall` enumeration below carries real weight: miss a novel
 *     destruction primitive and its schema stops being checked at all.
 *   · `destructiveCall` remains partly an enumeration (`.delete()`, a delete-shaped `.rpc()`,
 *     literal `DELETE FROM`). It is backstopped — not replaced — by the file's own `*.delete` scope
 *     classification, which is why an opaque RPC like `handle_data_subject_request` is caught
 *     despite carrying no delete-ish substring. A genuinely novel destruction primitive calling
 *     none of these, on a tool the file does not scope `*.delete`, would pass.
 *
 * That last bullet is the real residual risk, and it is deliberately left rather than papered over
 * with another pattern: the durable fix is not a longer list here, it is routing mutating MCP tools
 * through the governed seam (#784), where the classification is the authority instead of the shape.
 *
 * ESCAPE HATCH: `// mcp-confirm-exempt: <reason>` inside the block — deliberate and explained.
 *
 *   node scripts/ci/mcp-destructive-confirm-lint.mjs
 *   node scripts/ci/mcp-destructive-confirm-lint.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Every MCP-surface entrypoint. A new MCP function is picked up by living in this directory. */
function mcpSources() {
  const root = "supabase/functions";
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((d) => /mcp/i.test(d) && !/-smoke$/.test(d))
    .map((d) => path.join(root, d, "index.ts"))
    .filter((p) => fs.existsSync(p));
}

const EXEMPT = /\/\/\s*mcp-confirm-exempt:\s*\S/;

/**
 * Comment text inside a node — read from real COMMENT TRIVIA, never from the node's source text.
 *
 * Matching the exemption pattern against raw block text meant any string could carry it: putting
 * `// mcp-confirm-exempt: whatever` inside a tool's own `description` exempted a destructive
 * handler with a model-settable boolean, and the guard reported zero violations. An escape hatch
 * that a data field can open is not an escape hatch, it is a bypass.
 *
 * The scanner is asked for comments directly, so a marker in a string, a template or a regex is
 * simply not a comment and cannot exempt anything.
 */
function commentTextWithin(node, sf) {
  return collectComments(sf, node.pos, node.end).join("\n");
}

/**
 * Every LEAF token's span, cached per source file. A comment cannot overlap a token — that is what
 * makes it trivia — so the parser's own token spans are the ground truth for validating a
 * candidate comment range, whatever produced it.
 */
/** Every leaf token, punctuation included — `getChildren`, not `forEachChild`. */
function eachLeaf(node, sf, fn) {
  const kids = node.getChildren(sf);
  if (kids.length === 0) { fn(node); return; }
  for (const k of kids) eachLeaf(k, sf, fn);
}

const leafSpansCache = new WeakMap();
function leafSpans(sf) {
  let spans = leafSpansCache.get(sf);
  if (spans) return spans;
  spans = [];
  // getChildren, NOT forEachChild: punctuation is a real token and a real comment anchor.
  // `inputSchema: …, // exempt` hangs off the COMMA, which forEachChild never visits.
  eachLeaf(sf, sf, (n) => spans.push([n.getStart(sf), n.end]));
  spans.sort((a, b) => a[0] - b[0]);
  leafSpansCache.set(sf, spans);
  return spans;
}

/** Does this candidate range collide with a real token? Then it is token TEXT, not a comment. */
function overlapsToken(spans, pos, end) {
  let lo = 0, hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [s0, e0] = spans[mid];
    if (e0 <= pos) lo = mid + 1;
    else if (s0 >= end) hi = mid - 1;
    else return true;
  }
  return false;
}

/**
 * Comments between `from` and `to`, validated against the parser's token spans.
 *
 * Three attempts got here, and the first two were guesses about where text can hide:
 *   1. a raw regex over block text  -> a plain string exempted a destructive tool
 *   2. a standalone scanner         -> a template tail did, lacking the parser's rescan
 * The third is a PROPERTY rather than a position: a comment cannot overlap a token. Candidates come
 * from both the leading and trailing scans — leading-only is not enough, because
 * `getLeadingCommentRanges` deliberately excludes a same-line trailing comment and dropping
 * trailing scans breaks the legitimate `code(); // exempt` form — and each is then checked against
 * real tokens. A template tail, a string body and JSX text are all tokens; nothing inside one
 * survives, however it was produced.
 */
function collectComments(sf, from, to) {
  const full = sf.getFullText();
  const spans = leafSpans(sf);
  const seen = new Map();
  const add = (ranges) => {
    for (const r of ranges || []) {
      if (r.pos < from || r.end > to) continue;
      if (overlapsToken(spans, r.pos, r.end)) continue;
      seen.set(r.pos, full.slice(r.pos, r.end));
    }
  };
  eachLeaf(sf, sf, (n) => {
    if (n.end < from || n.pos > to) return;
    add(ts.getLeadingCommentRanges(full, n.pos));
    add(ts.getTrailingCommentRanges(full, n.end));
  });
  return [...seen.values()];
}

function walk(node, visit) {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

/** The literal text of a string-ish node, or null when the name is computed. */
function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  return null;
}

/**
 * Every `<something>.tool(<name>, <object>)` call in the file, via the AST.
 *
 * Matching on the METHOD rather than on `mcp.tool` specifically means a renamed or destructured
 * server binding is still seen. Trivia — comments, line breaks — is invisible to the parser, which
 * is the point: `mcp.tool /* registration *\/ ("x", {…})` is the same call to a parser and was
 * invisible to the regex.
 */
export function findToolCalls(src, fileName = "in-memory.ts") {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out = [];
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    // `mcp.tool(...)` and `mcp["tool"](...)` are the same call with different syntax. Matching only
    // the first made the second invisible — not flagged, not counted, simply absent.
    const method = ts.isPropertyAccessExpression(callee) ? callee.name.text
      : ts.isElementAccessExpression(callee) ? literalText(callee.argumentExpression)
      : null;
    if (method !== "tool") return;
    const [nameArg, configArg] = node.arguments;
    // A configuration this guard cannot READ is a tool it cannot inspect. Recording it as
    // unanalysable rather than skipping it is the whole difference between a guard and a guard
    // that reports success — `mcp.tool("x", config)` and `.forEach(t => mcp.tool(t.name, t.config))`
    // are both valid registrations, and both were silently discarded before.
    out.push({
      name: literalText(nameArg) ?? "<computed name>",
      // READABLE, not merely present. An object literal is not enough: `mcp.tool("x", { ...cfg })`
      // is an object literal whose handler and schema live somewhere this guard cannot follow, so
      // it was inspected, found to declare nothing, and passed — a fail-OPEN inside the very check
      // written to fail closed. The rule is therefore an allowlist of the ONE shape that can
      // actually be read, which is complete by construction rather than by enumerating evasions.
      config: configArg && ts.isObjectLiteralExpression(configArg) && readableConfig(configArg)
        ? configArg : null,
      text: node.getFullText(sf),
      comments: commentTextWithin(node, sf),
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    });
  });
  return out;
}

/**
 * Can this guard SEE every member of this configuration?
 *
 * The question is visibility, not content. `mcp.tool("x", { ...cfg })` is an object literal whose
 * real handler and schema live somewhere this guard does not follow — so `prop()` finds nothing,
 * the tool looks like it declares no destructive act, and it passes. That is a fail-OPEN inside the
 * check written to fail closed, and the fix is an allowlist of the one member form that can
 * actually be read rather than a list of the ways to hide one.
 *
 * A spread, a shorthand referring to a binding elsewhere, a computed key, a method or accessor —
 * each can carry members this guard cannot enumerate, so any of them makes the whole configuration
 * unanalysable and fails the run.
 *
 * Deliberately NOT a requirement that `handler` and `inputSchema` be present. My first version
 * demanded both, and that was wrong in a way worth recording: once every member is visible, an
 * ABSENT member is a fact, not a gap. A tool declaring no `inputSchema` takes no model-settable
 * boolean and one declaring no `handler` performs no act — both trivially safe, and failing them as
 * "a configuration this guard cannot read" would be a false alarm about a config it reads perfectly.
 * A guard that cries wolf gets an exemption written for it, and that is how a real one gets waved
 * through later.
 *
 * Measured against the real surfaces: all 117 registrations are inline object literals whose members
 * are exclusively PropertyAssignment, so this costs zero exemptions today.
 */
/** The member's name, when it has one this guard can read. Identifier or string literal only. */
function memberName(p) {
  if (!p.name) return null;
  if (ts.isIdentifier(p.name)) return p.name.text;
  if (ts.isStringLiteralLike(p.name)) return p.name.text;
  return null;                                   // computed or otherwise unnameable
}

/** The two members whose CONTENT this guard has to walk, not merely see the name of. */
const CRITICAL_MEMBERS = new Set(["handler", "inputSchema"]);

/** `x as T`, `(x)`, `x satisfies T` — wrappers that say nothing about what is underneath. */
function unwrap(node) {
  let n = node;
  while (n && (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) ||
               (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n)))) n = n.expression;
  return n;
}

/**
 * Is this initializer something the walkers can actually look INSIDE — asked per member, because
 * the two members need different things and one shared answer was wrong for both.
 *
 * The first version asked only "is this a bare reference?", which is necessary and not sufficient.
 * `handler: makeHandler("purge")` is a call, not a reference, so it passed as inspectable — and
 * then `destructiveCall` walked a call expression whose body lives in another function, found no
 * deletion, and the tool passed. Same for `inputSchema: buildSchema()`: no boolean visible, so a
 * destructive handler beside it looked safe. I found both by attacking my own fix rather than
 * waiting for a review to; they are the same mistake as the aliased form, one indirection further
 * out, and they are why this is now member-specific.
 *
 *   handler      must be a FUNCTION LITERAL — an arrow, a function expression, or method syntax.
 *                A closed set, and what the surface actually contains: 117 of 117 are arrows.
 *   inputSchema  required to be fully readable ONLY beside a destructive handler, which is the
 *                combination that can hurt. There, every value must be one this guard has SEEN:
 *                literals, `z.…` builder chains, and an identifier in `z.enum(…)` position — the
 *                single exception, and not because the name is trusted but because `z.enum` cannot
 *                produce a boolean whatever it holds. A bare name used as a value, or a call not
 *                rooted at `z`, means the question was not answered, and that is reported as the
 *                violation. NO NAME RESOLUTION anywhere; type positions are skipped.
 *
 * Both are stated as what CAN be read rather than as ways to hide, which is the only formulation
 * that does not lose to the next spelling.
 */
function inspectableInitializer(node, member) {
  const n = unwrap(node);
  if (!n) return false;
  if (member === "handler") {
    return ts.isArrowFunction(n) || ts.isFunctionExpression(n);
  }
  return schemaIsComplete(n);
}

/**
 * Like `walk`, but never descends into a TYPE.
 *
 * Types are erased before this code runs and hide nothing at runtime. Walking into them produced a
 * real false positive: `as const` parses as a TypeReference whose type name is an identifier
 * literally called `const`, which the value walk then treated as an unread name.
 */
function walkValues(node, visit) {
  visit(node);
  node.forEachChild((c) => { if (!ts.isTypeNode(c)) walkValues(c, visit); });
}

/** An identifier that merely NAMES a property, rather than standing for a value. */
function isKeyPosition(id) {
  const p = id.parent;
  return !!p && "name" in p && p.name === id;
}

/** The leftmost identifier a call/property chain is built on: the `z` of `z.object({…}).optional()`. */
function chainRoot(expr) {
  let n = expr;
  while (n && (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n) ||
               ts.isElementAccessExpression(n))) n = n.expression;
  return n && ts.isIdentifier(n) ? n.text : null;
}

/** Part of a schema-builder chain — `z` and `object` in `z.object(…)` name the builder, not a value. */
function isBuilderChain(id) {
  let n = id;
  while (n.parent && ts.isPropertyAccessExpression(n.parent)) n = n.parent;
  if (!(n.parent && ts.isCallExpression(n.parent) && n.parent.expression === n)) return false;
  return chainRoot(n) === SCHEMA_NS;
}
const SCHEMA_NS = "z";

/**
 * An identifier passed to `z.enum(…)`.
 *
 * The one place a name may go unread, and NOT because it is trusted — because it cannot matter.
 * `z.enum` produces a string-literal union; there is no argument it can be given that yields a
 * boolean field. So the guard's question ("does this schema declare a model-settable boolean?") is
 * answered for that field without knowing what the name holds. A fact about the builder, not a
 * claim about the value.
 */
function isEnumArgument(id) {
  const p = id.parent;
  return !!p && ts.isCallExpression(p) && p.arguments.includes(id) &&
    ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === "enum";
}

/**
 * Is every value in this schema one this guard has actually SEEN?
 *
 * NO NAME RESOLUTION. An earlier version of this guard resolved same-file top-level constants so
 * that `z.enum(CONFIDENCE)` would not need an exemption, and review immediately found three ways
 * past it: a `let` rebound before use, a `const` object mutated by property assignment, and a
 * parameter shadowing the constant's name. Each fix wanted more of a symbol table — scope
 * analysis, mutability analysis, a whitelist of builder calls — which is a type checker, and a
 * half-built type checker inside a lint is a fail-open with good manners.
 *
 * So resolution is GONE, and with it that whole class: nothing is resolved, so nothing can be
 * stale, shadowed or rebound. What remains is a visibility test with one narrow, type-theoretic
 * exception:
 *
 *   permitted  literals, object and array literals, `z.…` builder chains, property keys, and an
 *              identifier in `z.enum(…)` position (where no value can produce a boolean)
 *   refused    a bare identifier used as a value, a call not rooted at `z` (`buildSchema()`,
 *              `jsonObjectOrString.describe(…)`), a spread of a name — anything whose content is
 *              decided somewhere this guard has not looked
 *
 * Measured against the real surfaces: 1,147 of 1,148 schema calls are `z`-rooted, and all 9 free
 * identifiers are `z.enum` arguments. The cost is ONE explained exemption, against a symbol table
 * and three live fail-opens. That is the trade, made deliberately.
 */
function schemaIsComplete(node) {
  let sawShape = false;
  let complete = true;
  walkValues(node, (n) => {
    if (ts.isObjectLiteralExpression(n) || ts.isArrayLiteralExpression(n)) sawShape = true;
    if (ts.isCallExpression(n) && chainRoot(n.expression) !== SCHEMA_NS) {
      complete = false;                      // a value produced somewhere this guard cannot see
      return;
    }
    if (!ts.isIdentifier(n)) return;
    if (isKeyPosition(n) || isBuilderChain(n) || isEnumArgument(n)) return;
    complete = false;                        // a name standing for a value, unread
  });
  return sawShape && complete;
}

function readableConfig(objectLiteral) {
  for (const p of objectLiteral.properties) {
    // `async handler(args) { … }` is an inline body with a readable name, and `prop()` already
    // returns method declarations. Rejecting it was a false failure on a config this guard reads
    // perfectly well.
    if (ts.isMethodDeclaration(p)) {
      if (memberName(p) === null) return false;
      continue;
    }
    if (!ts.isPropertyAssignment(p)) return false;      // spread, shorthand, accessor
    const nm = memberName(p);
    if (nm === null) return false;                      // computed key
    // Only the HANDLER must be readable for a registration to be inspectable at all: it is what
    // decides whether this tool is destructive, and that decision gates everything else. The schema
    // is required to be readable only where it is load-bearing — beside a destructive handler — so
    // the 116 tools that destroy nothing are never failed for a schema shape that cannot hurt them.
    if (nm === "handler" && !inspectableInitializer(p.initializer, nm)) return false;
  }
  return true;
}

function prop(objectLiteral, name) {
  for (const p of objectLiteral.properties) {
    // Name matching must accept exactly what `readableConfig` accepted. When it accepted a quoted
    // key that this did not, `{ "handler": … }` was marked readable and then read as ABSENT — the
    // tool was neither reported unanalysable nor inspected, and a destructive handler passed. Two
    // functions disagreeing about what a name is, is a hole; they now share `memberName`.
    if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) && memberName(p) === name) {
      return ts.isPropertyAssignment(p) ? p.initializer : p;
    }
  }
  return null;
}

/**
 * Scope keys the file itself classifies as destructive (`*.delete`).
 *
 * Read from the source rather than hard-coded, so the guard and the surface cannot disagree.
 */
export function destructiveScopes(src, fileName = "in-memory.ts") {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out = new Set();
  walk(sf, (n) => {
    if (!ts.isPropertyAssignment(n) || !n.name) return;
    const v = literalText(n.initializer);
    if (!v || !/\.delete$/.test(v)) return;
    const k = ts.isIdentifier(n.name) ? n.name.text : literalText(n.name);
    if (k) out.add(k);
  });
  return out;
}

/**
 * Does the handler make an OPAQUE call — an RPC whose destination this guard cannot see into?
 *
 * Pairs with the `*.delete` scope below. A destructive act reached through an RPC named nothing
 * like a delete is invisible to `destructiveCall`, and `handle_data_subject_request` is exactly
 * that: it calls `admin.rpc("handle_data_subject_request", …)`, which destroys, while carrying no
 * delete-ish substring anywhere.
 */
function callsRpc(node) {
  if (!node) return false;
  let found = false;
  walk(node, (n) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "rpc") found = true;
  });
  return found;
}

/** A call that destroys rows: `.delete()`, a delete/purge-shaped RPC, or literal `DELETE FROM`. */
function destructiveCall(node) {
  let found = null;
  walk(node, (n) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const m = n.expression.name.text;
      if (m === "delete") { found = ".delete()"; return; }
      if (m === "rpc") {
        const a = literalText(n.arguments[0]);
        if (a && /(delete|purge|destroy|wipe|drop)/i.test(a)) { found = `.rpc("${a}")`; return; }
      }
    }
    const lit = literalText(n);
    if (lit && /\bDELETE\s+FROM\b/i.test(lit)) found = "DELETE FROM";
  });
  return found;
}

/**
 * ANY boolean the model can set, whatever it is called.
 *
 * Deliberately not a list of approval-ish names. `confirm`, `approved`, `approval`, `force`,
 * `really`, `yes_do_it` — the next one is always outside the list. A destructive tool has no
 * business taking a boolean from the model at all, so the rule is the shape, not the vocabulary.
 */
function modelSettableBooleans(schemaNode) {
  const names = [];
  if (!schemaNode) return names;
  walkValues(schemaNode, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return;
    const method = n.expression.name.text;
    // `.boolean()`, and also `z.literal(true)` / `z.literal(false)` — a boolean the model can set,
    // spelled as a literal. The pre-AST matcher recognised `z.literal(...)`, so omitting it here
    // was a regression against this guard's own promise to reject ANY model-settable boolean.
    const isBooleanLiteral = method === "literal" && n.arguments.length === 1 &&
      (n.arguments[0].kind === ts.SyntaxKind.TrueKeyword ||
       n.arguments[0].kind === ts.SyntaxKind.FalseKeyword);
    if (method !== "boolean" && !isBooleanLiteral) return;
    // Walk out to the property this z.boolean() chain is assigned to.
    let cur = n;
    while (cur.parent && !ts.isPropertyAssignment(cur.parent)) cur = cur.parent;
    const owner = cur.parent;
    const nm = owner && ts.isPropertyAssignment(owner) && owner.name && ts.isIdentifier(owner.name)
      ? owner.name.text : "<unnamed>";
    if (!names.includes(nm)) names.push(nm);
  });
  return names;
}

export function findViolations(src, file = "<memory>") {
  const out = [];
  const scopes = destructiveScopes(src, file);
  for (const tool of findToolCalls(src, file)) {
    if (EXEMPT.test(tool.comments)) continue;
    if (!tool.config) continue;           // reported separately as unanalysable
    const handler = prop(tool.config, "handler");
    const schema = prop(tool.config, "inputSchema");
    // Three independent signals, two of them the FILE'S OWN classification rather than this
    // guard's inference. `handle_data_subject_request` is the worked example: its RPC name carries
    // no delete-ish substring, but it declares `destructiveHint: true` and is scoped `admin.delete`.
    // Two signals, and the second is the FILE'S OWN classification rather than this guard's guess.
    //
    // NOT `annotations.destructiveHint`, though it was the obvious candidate and this guard tried
    // it: in the MCP spec that hint covers non-additive UPDATES, not deletion, so it over-fires —
    // measured, it flagged `upsert_email_template` (scope `admin.write`, an `.upsert()`, and an
    // ordinary `active` data field). The `*.delete` scope is the narrower and truer signal.
    //
    // The scope alone is not enough either: the contained `bulk_delete_contacts` still carries
    // `crm.delete` while its handler now only reads and returns a refusal. So the scope counts only
    // when the handler ALSO makes a call this guard cannot see into.
    // A name this guard could not resolve cannot be looked up in the scope map, and a failed lookup
    // must not read as "not delete-scoped". `const N = "handle_data_subject_request"` moves the key
    // one hop away and the join silently returns false — clearing a destructive tool by accident.
    // Unknown name therefore counts as possibly-scoped. Resolving the constant is NOT attempted:
    // that is general dataflow with no closed form, and guessing at it would restore the same
    // false confidence in a longer function.
    const maybeDeleteScoped = tool.name === "<computed name>" || scopes.has(tool.name);
    const destructive = (handler ? destructiveCall(handler) : null)
      ?? ((maybeDeleteScoped && callsRpc(handler)) ? "scope *.delete + an opaque rpc" : null);
    if (!destructive) continue;
    // A destructive handler beside a schema this guard cannot fully read is not "no boolean found";
    // it is "the question was not answered". Fail closed exactly where it matters.
    //
    // But an ABSENT schema is an answer, not a gap. `readableConfig` has already established that
    // every member of this configuration is visible, so a missing `inputSchema` means the tool
    // takes no arguments — which is proof of no model-settable boolean, the strongest form of the
    // thing being checked. Failing it said "cannot rule out a boolean" about a tool that provably
    // has none, and blocked a legitimate no-argument registration. The unreadable failure is
    // reserved for a schema that is PRESENT and cannot be inspected.
    if (schema && !schemaIsComplete(schema)) {
      out.push({ file, tool: tool.name, line: tool.line, evidence: destructive,
                 fields: ["<schema not fully readable — cannot rule out a model-settable boolean>"] });
      continue;
    }
    const booleans = modelSettableBooleans(schema);
    if (booleans.length === 0) continue;
    out.push({ file, tool: tool.name, line: tool.line, evidence: destructive, fields: booleans });
  }
  return out;
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  let bad = 0;
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) bad++;
    console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`);
  };
  const v = (src) => findViolations(src).length;

  check("catches the #784 shape", v(`
mcp.tool("bulk_delete_contacts", {
  description: "Delete contacts. Braces { } in prose must not confuse anything.",
  inputSchema: z.object({ contact_ids: z.array(z.string()), confirm: z.boolean().optional() }),
  handler: async ({ contact_ids, confirm }) => {
    if (!confirm) return ok({ dry_run: true });
    return ok(await admin.from("clients").delete().in("id", contact_ids));
  },
});`), 1);

  check("catches a delete RPC", v(`
mcp.tool("nuke", { inputSchema: z.object({ force: z.boolean() }),
  handler: async ({ force }) => { if (force) await admin.rpc("purge_thing", {}); return ok({}); } });`), 1);

  // Codex P1 (f663fe0d): single quotes.
  check("catches a single-quoted name", v(`
mcp.tool('bulk_delete_contacts', { inputSchema: z.object({ confirm: z.boolean() }),
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); return ok({}); } });`), 1);

  // Codex P1 (6ef1e97f): a regex literal whose brace used to end the block early.
  check("a regex literal with an unmatched brace does not truncate the block", v(`
mcp.tool("sneaky", {
  pattern: /}/,
  inputSchema: z.object({ confirm: z.boolean() }),
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); return ok({}); },
});`), 1);

  // Codex P1 (6ef1e97f): a comment between `tool` and `(` hid the call from BOTH old checks.
  check("a comment before the paren does not hide the call", v(`
mcp.tool /* registration */ ("sneaky2", {
  inputSchema: z.object({ confirm: z.boolean() }),
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); return ok({}); },
});`), 1);

  // Codex P1 (6ef1e97f): approval-shaped names outside any hand-written list.
  for (const field of ["approved", "approval", "really", "yes_i_am_sure", "go"]) {
    check(`catches an approval boolean named \`${field}\``, v(`
mcp.tool("x", { inputSchema: z.object({ ${field}: z.boolean() }),
  handler: async (a) => { if (a.${field}) await admin.from("clients").delete(); return ok({}); } });`), 1);
  }

  check("catches a computed tool name", v(`
mcp.tool(NAME, { inputSchema: z.object({ confirm: z.boolean() }),
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); return ok({}); } });`), 1);

  // Negatives.
  check("passes the contained preview-only shape", v(`
mcp.tool("bulk_delete_contacts", { inputSchema: z.object({ confirm: z.boolean().optional() }),
  handler: async ({ confirm }) => { if (confirm !== true) return ok({ preview_only: true });
    return err("Nothing was deleted, and nothing will be."); } });`), 0);
  check("passes a delete with no boolean input", v(`
mcp.tool("remove_row", { inputSchema: z.object({ id: z.string() }),
  handler: async ({ id }) => { await admin.from("t").delete().eq("id", id); return ok({}); } });`), 0);
  // Codex P1 (8c051c15): a destructive RPC whose NAME carries no delete-ish substring, caught by
  // the file's own `*.delete` scope. This is `handle_data_subject_request`'s exact shape.
  check("catches a scope-classified destructive RPC with an approval boolean", v(`
mcp.tool("handle_data_subject_request", {
  inputSchema: z.object({ contact_id: z.string(), confirm: z.boolean() }),
  handler: async (a) => { if (a.confirm) await admin.rpc("handle_data_subject_request", {}); return ok({}); },
});
const TOOL_SCOPE = { handle_data_subject_request: "admin.delete" };`), 1);

  check("does NOT flag a *.delete-scoped tool whose handler only reads", v(`
mcp.tool("bulk_delete_contacts", {
  inputSchema: z.object({ confirm: z.boolean().optional() }),
  handler: async ({ confirm }) => { await admin.from("clients").select("id");
    if (confirm !== true) return ok({ preview_only: true }); return err("Nothing was deleted."); },
});
const TOOL_SCOPE = { bulk_delete_contacts: "crm.delete" };`), 0);

  // z.literal(true) is a model-settable boolean spelled as a literal — the pre-AST matcher caught
  // this and the first AST version regressed on it.
  check("catches z.literal(true) as a boolean (Codex)", v(`
mcp.tool("x", { inputSchema: z.object({ confirm: z.literal(true) }),
  handler: async (a) => { if (a.confirm) await admin.from("clients").delete(); return ok({}); } });`), 1);

  // Codex P1 (8c051c15): a configuration this guard cannot read must not pass silently.
  check("a non-literal configuration is recorded as unanalysable",
    findToolCalls('mcp.tool("x", config);').filter((t) => !t.config).length, 1);
  // Round 5 (Codex). Each was reproduced against the shipped guard before being fixed.
  check("a SPREAD configuration is unanalysable, not silently empty (Codex)",
    findToolCalls(`mcp.tool("x", { ...cfg });`).map((t) => t.config !== null), [false]);
  check("ELEMENT-ACCESS registration is seen (Codex)",
    findToolCalls(`mcp["tool"]("x", { inputSchema: z.object({}), handler: async () => {} });`).length, 1);
  // Once every member is visible, an ABSENT member is a fact rather than a gap: no handler means
  // no act, no schema means no model input. Failing these would be a false alarm.
  check("a fully-visible config missing handler is readable, not unanalysable",
    findToolCalls(`mcp.tool("x", { inputSchema: z.object({}) });`).map((t) => t.config !== null), [true]);
  check("a SHORTHAND member makes the config unanalysable",
    findToolCalls(`mcp.tool("x", { handler, inputSchema: z.object({}) });`).map((t) => t.config !== null), [false]);
  check("a readable config still parses",
    findToolCalls(`mcp.tool("x", { inputSchema: z.object({}), handler: async () => {} });`).map((t) => t.config !== null), [true]);
  // Round 6 (Codex). The first two are holes I introduced with the visibility rule an hour earlier.
  check("QUOTED member names are read, not marked readable-then-absent (Codex)", v(`
mcp.tool("quoted_purge", {
  "inputSchema": z.object({ confirm: z.boolean() }),
  "handler": async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); },
});`), 1);
  check("an ALIASED handler is unanalysable, exactly like the shorthand form (Codex)",
    findToolCalls(`mcp.tool("x", { inputSchema: z.object({}), handler: destructiveHandler });`)
      .map((t) => t.config !== null), [false]);
  check("a METHOD-syntax handler is inspectable, not a false failure (Codex)",
    findToolCalls(`mcp.tool("x", { inputSchema: z.object({}), async handler(a) { return a; } });`)
      .map((t) => t.config !== null), [true]);
  check("a destructive tool with NO schema takes no arguments, so it PASSES (Codex)", v(`
mcp.tool("vacuum", { handler: async () => { await admin.from("events").delete(); } });`), 0);
  check("a destructive tool with a PRESENT but unreadable schema still FAILS", v(`
mcp.tool("vacuum2", { inputSchema: buildSchema(), handler: async () => { await admin.from("events").delete(); } });`), 1);
  check("a method-syntax destructive handler is still CAUGHT", v(`
mcp.tool("method_purge", {
  inputSchema: z.object({ confirm: z.boolean() }),
  async handler({ confirm }) { if (confirm) await admin.from("clients").delete(); },
});`), 1);
  // Found by attacking my own fix, not by review: a CALL is not a reference, so it passed the
  // first version of the inspectability test while its body lived elsewhere.
  check("a FACTORY-BUILT handler is unanalysable",
    findToolCalls(`mcp.tool("x", { inputSchema: z.object({}), handler: makeHandler("purge") });`)
      .map((t) => t.config !== null), [false]);
  check("a schema referencing a SAME-FILE const resolves rather than failing",
    findToolCalls(`const LEVELS = ["a", "b"] as const;
mcp.tool("x", { inputSchema: z.object({ level: z.enum(LEVELS) }), handler: async () => {} });`)
      .map((t) => t.config !== null), [true]);
  check("a const that itself hides a boolean is CAUGHT through resolution", v(`
const approvalFields = { confirm: z.boolean() };
mcp.tool("resolved_purge", {
  inputSchema: z.object(approvalFields),
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); },
});`), 1);
  check("an `as const` schema is not mistaken for an unresolved reference",
    findToolCalls(`mcp.tool("x", { inputSchema: z.object({ a: z.enum(["p"] as const) }), handler: async () => {} });`)
      .map((t) => t.config !== null), [true]);
  // An unreadable SCHEMA only matters beside a destructive handler — that is the load-bearing
  // combination, and where the guard must fail closed. A tool that destroys nothing is never failed
  // for a schema shape that cannot hurt it.
  const DESTRUCTIVE = `handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); }`;
  check("an ALIASED schema (Codex), beside a destructive handler", v(`
mcp.tool("t", { inputSchema: schemas.purge, ${DESTRUCTIVE} });`), 1);
  check("a FACTORY-BUILT schema, beside a destructive handler", v(`
mcp.tool("t", { inputSchema: buildSchema("p"), ${DESTRUCTIVE} });`), 1);
  check("a SPREAD inside the schema (Codex), beside a destructive handler", v(`
mcp.tool("t", { inputSchema: z.object({ ...approvalFields }), ${DESTRUCTIVE} });`), 1);
  check("a schema property whose VALUE is a reference, beside a destructive handler", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: someSchema }), ${DESTRUCTIVE} });`), 1);
  check("a .merge(ref) schema, beside a destructive handler", v(`
mcp.tool("t", { inputSchema: z.object({ id: z.string() }).merge(other), ${DESTRUCTIVE} });`), 1);
  check("a z.union with a referenced member, beside a destructive handler", v(`
mcp.tool("t", { inputSchema: z.union([z.object({ id: z.string() }), other]), ${DESTRUCTIVE} });`), 1);
  check("the SAME unreadable schemas pass on a harmless handler", v(`
mcp.tool("t1", { inputSchema: schemas.purge, handler: async () => ({ ok: true }) });
mcp.tool("t2", { inputSchema: z.object({ ...fields }), handler: async () => ({ ok: true }) });`), 0);
  check("a NESTED object in the schema still parses",
    findToolCalls(`mcp.tool("x", { inputSchema: z.object({ a: z.object({ b: z.string() }) }), handler: async () => {} });`)
      .map((t) => t.config !== null), [true]);
  check("a function-EXPRESSION handler stays readable",
    findToolCalls(`mcp.tool("x", { inputSchema: z.object({}), handler: async function (a) { return a; } });`)
      .map((t) => t.config !== null), [true]);
  check("an `as`-wrapped schema stays readable (matches the 5 real ones)",
    findToolCalls(`mcp.tool("x", { inputSchema: z.object({}) as Shape, handler: async () => {} });`)
      .map((t) => t.config !== null), [true]);
  check("a COMPUTED name cannot be cleared by the scope map (Codex)", v(`
const TOOL_SCOPE = { handle_data_subject_request: "admin.delete" };
mcp.tool(NAME, {
  inputSchema: z.object({ approved: z.boolean() }),
  handler: async () => { await admin.rpc("handle_data_subject_request", {}); },
});`), 1);

  check("a wrapper registration is recorded as unanalysable",
    findToolCalls("list.forEach((t) => mcp.tool(t.name, t.config));").filter((t) => !t.config).length, 1);

  check("passes a boolean on a NON-destructive tool", v(`
mcp.tool("list_things", { inputSchema: z.object({ include_archived: z.boolean() }),
  handler: async () => ok({ rows: [] }) });`), 0);
  check("an exemption marker in a STRING does not exempt (Codex)", v(`
mcp.tool("fake_exempt", {
  description: "// mcp-confirm-exempt: not a real comment",
  inputSchema: z.object({ confirm: z.boolean() }),
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); },
});`), 1);
  check("a marker after an INTERPOLATION does not exempt (Codex)", v(`
mcp.tool("tmpl_exempt", {
  description: \`\${v} // mcp-confirm-exempt: fake\`,
  inputSchema: z.object({ confirm: z.boolean() }),
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); },
});`), 1);
  check("an exemption marker in a TEMPLATE literal does not exempt", v(`
mcp.tool("fake_exempt2", {
  description: \`// mcp-confirm-exempt: still not a comment\`,
  inputSchema: z.object({ confirm: z.boolean() }),
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); },
});`), 1);
  check("respects an explained exemption", v(`
mcp.tool("x", { inputSchema: z.object({ confirm: z.boolean() }),
  // mcp-confirm-exempt: server re-validates a single-use claim before this runs
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); return ok({}); } });`), 0);
  check("finds every tool in a file with prose braces", findToolCalls(`
mcp.tool("a", { description: "a } brace and a { brace", handler: async () => ok({}) });
mcp.tool("b", { handler: async () => ok({}) });`).length, 2);

  console.log(bad ? `\n✗ mcp-destructive-confirm-lint self-test: ${bad} failure(s).`
                  : "\n✓ mcp-destructive-confirm-lint self-test passed.");
  process.exit(bad ? 1 : 0);
}

// ── real run ─────────────────────────────────────────────────────────────────────────────────
const sources = mcpSources();
if (sources.length === 0) {
  console.error("✗ mcp-destructive-confirm-lint: found no MCP entrypoint to inspect. Failing closed.");
  process.exit(1);
}

let violations = [];
let tools = 0;
const unanalysable = [];
for (const file of sources) {
  const src = fs.readFileSync(file, "utf8");
  const calls = findToolCalls(src, file);
  tools += calls.length;
  for (const c of calls) if (!c.config && !EXEMPT.test(c.comments)) unanalysable.push({ file, ...c });
  violations = violations.concat(findViolations(src, file));
}

if (unanalysable.length) {
  console.error(`✗ mcp-destructive-confirm-lint: ${unanalysable.length} tool registration(s) pass a configuration this guard cannot read.\n`);
  for (const u of unanalysable) console.error(`  ${u.file}:${u.line} → ${u.name}`);
  console.error("\n  A configuration built elsewhere — a variable, a spread, a factory — cannot be");
  console.error("  inspected, and a tool this guard cannot inspect must not pass silently. Inline the");
  console.error("  configuration, or teach the guard to resolve it.");
  process.exit(1);
}

if (tools === 0) {
  console.error("✗ mcp-destructive-confirm-lint: parsed 0 tool declarations. Failing closed —\n" +
                "  a guard that sees nothing passes everything.");
  process.exit(1);
}

if (violations.length) {
  console.error(`✗ mcp-destructive-confirm-lint: ${violations.length} destructive MCP tool(s) take a model-settable boolean.\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} → ${v.tool}`);
    console.error(`     destructive call: ${v.evidence}`);
    console.error(`     model-settable boolean(s): ${v.fields.join(", ")}`);
  }
  console.error("\n  A boolean in the tool's own arguments is written by the model. It selects a");
  console.error("  branch; it proves nothing. See docs/doctrine/one-approval-gate.md.");
  console.error("\n  Fix: remove the destructive branch from this surface until the capability is");
  console.error("  classified in _shared/action-risk.ts and routed through the shared governed Spine");
  console.error("  execution seam. Do NOT invent an approval channel here — that is the Chat build's");
  console.error("  decision, and a second channel is the failure the doctrine exists to stop.");
  console.error("\n  Genuine exception: mark the line `// mcp-confirm-exempt: <reason>` inside the block.");
  process.exit(1);
}

console.log(`✓ mcp-destructive-confirm-lint: ${tools} MCP tool(s) across ${sources.length} surface(s) parsed via the TypeScript AST; no destructive tool takes a model-settable boolean.`);
