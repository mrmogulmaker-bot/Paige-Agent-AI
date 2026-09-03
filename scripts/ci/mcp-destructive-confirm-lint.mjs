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
 *   · `destructiveCall` remains partly an enumeration (a removal-verb method, a delete-shaped
 *     `.rpc()`, literal `DELETE FROM`). It is backstopped — not replaced — by the file's own
 *     removal-verb scope classification, which is why an opaque RPC like
 *     `handle_data_subject_request` is caught despite carrying no delete-ish substring. A genuinely
 *     novel destruction primitive calling none of these, on a tool the file does not scope for
 *     removal, would pass.
 *
 * That last bullet is the real residual risk, and it is deliberately left rather than papered over
 * with another pattern: the durable fix is not a longer list here, it is routing mutating MCP tools
 * through the governed seam (#784), where the classification is the authority instead of the shape.
 *
 * What it is NOT any more, because review found both and both reproduced: a call this guard cannot
 * READ is no longer scored harmless. `admin.rpc(rpcName)` and `admin.from("t")[op]()` used to be
 * classified non-destructive — not because the guard judged them safe, but because it could not see
 * the target — so their schemas were never inspected at all. Both now fail closed. That is a
 * different class from the residual above: the residual is a destruction primitive the guard has
 * never heard of; these two were destruction the guard was looking straight at and could not name.
 *
 * The removal vocabulary also had TWO copies — `destructiveCall` tested the method name `delete`
 * exactly, `destructiveScopes` tested the scope suffix `.delete` exactly — so widening one would
 * have left the other behind. They now read one shared `REMOVAL_VERB`.
 *
 * NO ESCAPE HATCH, deliberately. There was one, and review picked it SIX different ways: a plain
 * string, a template tail, JSX text, a comment belonging to the PRECEDING statement, a block comment
 * merely EXPLAINING the marker, and an inner tool's exemption covering the outer one it was nested
 * in. It was also entirely UNUSED — zero occurrences across the surfaces. A hatch nobody opens that
 * six people can pick is not a feature. A genuine exception now edits THIS FILE: visible in a diff,
 * reviewed, and impossible to write by accident.
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



/**
 * Every LEAF token's span, cached per source file. A comment cannot overlap a token — that is what
 * makes it trivia — so the parser's own token spans are the ground truth for validating a
 * candidate comment range, whatever produced it.
 */

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
 * The method a call invokes, whether written `x.m(…)` or `x["m"](…)`.
 *
 * `findToolCalls` already normalised these two spellings for the REGISTRATION; the classifiers
 * below did not, so `admin.from("clients")["delete"]()` was a delete the guard did not see while
 * the dotted form was rejected. One file disagreeing with itself about what a method call is, is
 * a hole — so the normalisation has one home and every classifier uses it.
 */
function calleeMethod(callee) {
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  if (ts.isElementAccessExpression(callee)) return literalText(callee.argumentExpression);
  return null;
}

/**
 * A member call whose method name this guard cannot read.
 *
 * `calleeMethod` collapses two very different answers into `null`: "this is not a member call at
 * all" (`ok(…)`, `String(x)`) and "this IS a member call, but its method name is computed"
 * (`admin.from("t")[op]()`). Only the second is ignorance, and ignorance must not read as
 * innocence — so the classifiers below need to tell them apart.
 */
const UNREADABLE_METHOD = Symbol("unreadable-method");

/** `calleeMethod`, but returning `UNREADABLE_METHOD` instead of `null` for a computed member call. */
function calleeMethodOrUnreadable(callee) {
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  if (ts.isElementAccessExpression(callee)) return literalText(callee.argumentExpression) ?? UNREADABLE_METHOD;
  return null;
}

/**
 * Method and scope names that remove data, as ONE regex both classifiers read.
 *
 * `destructiveCall` matched the method name `delete` EXACTLY and `destructiveScopes` matched the
 * scope suffix `.delete` exactly, so every other spelling of removal was invisible to both:
 * Supabase Storage's `.remove([...])` deletes objects, `auth.admin.deleteUser` deletes a user, and
 * a future `storage.remove` scope would not have been read as destructive either. Two enumerations
 * of the same idea in one file drift apart, so there is one.
 *
 * Anchored deliberately: this matches a name that BEGINS with a removal verb (`delete`,
 * `deleteUser`, `removeAll`), not one that merely contains one (`softDelete`, `markDeleted` — a
 * flag write, not a row destruction, and out of scope for a guard about destroying rows).
 *
 * The WORDS are separate from the anchoring, because the two name shapes this file classifies want
 * different anchoring over the same vocabulary. A method or scope is a JS name and is matched from
 * its start. A stored-procedure name is `snake_case` and puts its verb anywhere — `remove_contacts`,
 * `contacts_truncate` — so `REMOVAL_IN_NAME` matches the same words unanchored. The RPC classifier
 * previously carried its OWN five-word list; a third of the vocabulary was invisible to it, so
 * `.rpc("remove_contacts")` beside a model-settable boolean produced zero violations while
 * `.remove()` beside the same schema was caught. One list, two anchorings, no drift.
 */
const REMOVAL_WORDS = "delete|remove|destroy|purge|wipe|erase|truncate|drop|unlink|discard";
const REMOVAL_VERB = new RegExp(`^(${REMOVAL_WORDS})`, "i");
const REMOVAL_IN_NAME = new RegExp(`(${REMOVAL_WORDS})`, "i");

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
    if (calleeMethod(callee) !== "tool") return;
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
function walkValues(node, visit, prune) {
  visit(node);
  node.forEachChild((c) => {
    if (ts.isTypeNode(c)) return;
    if (prune && prune(c)) return;    // a definition the object literal overwrote: not in the schema
    walkValues(c, visit, prune);
  });
}

/** An identifier that merely NAMES a property, rather than standing for a value. */
function isKeyPosition(id) {
  const p = id.parent;
  if (!p) return false;
  // A SHORTHAND is both at once. `{ id }` is `{ id: id }`, so its identifier is a VALUE as well as
  // a key, and treating it as key-only let a bare name stand for a schema unread — which is the
  // one thing `schemaIsComplete` exists to refuse. The consequence was a reason that lied: the
  // shorthand was reported as the field `id` admitting a boolean, while the identical longhand was
  // correctly reported as a schema this guard cannot read. Same idiom, same refusal, same message.
  if (ts.isShorthandPropertyAssignment(p)) return false;
  return "name" in p && p.name === id;
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
 * stale, shadowed or rebound. What remains is a pure visibility test, with no exceptions at all:
 *
 *   permitted  literals, object and array literals, `z.…` builder chains, and property keys
 *   refused    a bare identifier used as a value, a call not rooted at `z` (`buildSchema()`,
 *              `jsonObjectOrString.describe(…)`), a spread of a name — anything whose content is
 *              decided somewhere this guard has not looked
 *
 * There WAS one further exception — an identifier in `z.enum(…)` position — justified on the
 * grounds that `z.enum` yields a string-literal union and so no argument could produce a boolean.
 *
 * THIS REPOSITORY CARRIES TWO ZODS, AND THEY DISAGREE. Measured, both:
 *
 *     zod 3.25.76   z.enum([true, false]).safeParse(true)  ->  rejected
 *     zod 4.5.4     z.enum([true, false]).safeParse(true)  ->  { success: true, data: true }
 *
 * `supabase/functions/paige-mcp/index.ts:21` imports 3.25.76 from esm.sh; 4.5.4 is the installed
 * dependency. So the justification holds on the zod the MCP surface runs TODAY and fails on the
 * one the repository is otherwise on — which is worse than being simply wrong, because it makes
 * the guard's correctness depend on which zod a given surface happens to import, and a version
 * bump would silently open it.
 *
 * (An earlier commit message and PR comment stated this as "false on the version this repository
 * runs", citing only 4.5.4. That was imprecise about the surface that actually matters, and the
 * correction is recorded here and on the PR rather than quietly amended.)
 *
 * The exception is gone either way, and removing it changed nothing: still 117 tools, still zero
 * violations — the free identifiers it covered sit beside handlers that destroy nothing, where
 * schema readability was never required. It was defended, not needed.
 *
 * The trade, stated plainly: an unreadable schema beside a destructive handler now fails, always,
 * and no exception exists to argue about. That is a visibility test with no escape, against a
 * symbol table and three live fail-opens.
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
    if (isKeyPosition(n) || isBuilderChain(n)) return;
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
    // The action segment of a `resource.action` scope, matched against the SAME removal vocabulary
    // `destructiveCall` uses. Measured on the three surfaces at the time of writing: this selects
    // exactly `admin.delete` and `crm.delete`, identical to the previous exact-`.delete` test.
    const action = typeof v === "string" ? v.slice(v.lastIndexOf(".") + 1) : null;
    if (!action || v.indexOf(".") < 0 || !REMOVAL_VERB.test(action)) return;
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
    if (ts.isCallExpression(n) && calleeMethod(n.expression) === "rpc") found = true;
  });
  return found;
}

/**
 * A call that destroys rows: a removal-verb method, a delete-shaped RPC, or literal `DELETE FROM` —
 * plus the two calls this guard cannot READ, which fail closed.
 *
 * The two unreadable cases are the same defect as everywhere else in this file: answering "not
 * destructive" because the target could not be seen. `admin.rpc(rpcName)` and
 * `admin.from("t")[op]()` were both classified harmless, so their schemas were never checked at
 * all — a silent bypass rather than a loud one. Ignorance is not innocence, so both are now
 * treated as destructive and marked `[unreadable]` so the failure can say why.
 *
 * A `.rpc()` with a LITERAL name that is not delete-shaped stays non-destructive: that name is a
 * readable choice the guard evaluated, and it is separately backstopped by the `*.delete` scope +
 * opaque-RPC pairing below. Only the unreadable one fails closed.
 */
function destructiveCall(node) {
  let found = null;
  walk(node, (n) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const m = calleeMethodOrUnreadable(n.expression);
      if (m === UNREADABLE_METHOD) { found = "[unreadable] a call whose method name is computed"; return; }
      if (typeof m === "string" && REMOVAL_VERB.test(m)) { found = `.${m}()`; return; }
      if (m === "rpc") {
        const a = literalText(n.arguments[0]);
        if (a === null) { found = "[unreadable] .rpc() with a computed target"; return; }
        if (REMOVAL_IN_NAME.test(a)) { found = `.rpc("${a}")`; return; }
      }
    }
    const lit = literalText(n);
    if (lit && /\bDELETE\s+FROM\b/i.test(lit)) found = "DELETE FROM";
  });
  return found;
}

/**
 * Is this builder call the type of a FIELD, rather than a type argument inside a container?
 *
 * Walking out to the owning property is not enough on its own: `z.record(z.string(), z.any())`
 * and `z.any()` both belong to a property, but only the second says the FIELD is unconstrained.
 * The difference is structural and needs no vocabulary of container names — if the walk out ever
 * passes through an ARGUMENT position, the call describes something inside another builder.
 * A chain like `z.any().optional()` never does, so it is still the field's own type.
 */
// Containers whose ARGUMENT is an element or value type, so an unconstrained schema inside one
// describes the elements rather than the field.
//
// `promise` was in this list and does not belong: a zod promise does not constrain the input to a
// container. Measured on BOTH zods this repository carries —
//
//   z.object({ confirm: z.promise(z.any()) }).safeParseAsync({ confirm: true })  ->  accepted
//
// on 3.25.76 (what paige-mcp imports) and on 4.5.4 (the installed devDependency). So a destructive
// tool could take `confirm: z.promise(z.any())` and the model could send `true`.
const ELEMENT_TYPE_CONTAINERS = new Set(["record", "array", "map", "set", "tuple"]);

function unconstrainedField(call) {
  let n = call;
  while (n.parent) {
    // STOPPING at the first argument boundary was wrong in the other direction, and Codex
    // caught that too: `items: z.array(z.union([z.string(), z.any()]))` returned at the
    // union and never reached the array, so a legitimate payload was flagged. The walk
    // continues outward, and only an ELEMENT-TYPE CONTAINER anywhere on the path settles it.
    //
    // Enumerating containers rather than combinators stays deliberate: a zod method this
    // guard has never heard of does not settle anything, so the walk carries on to the
    // property and the field is FLAGGED. The other direction would let each new combinator
    // through in silence, which is how the boolean-spelling list kept losing.
    if (ts.isCallExpression(n.parent) && n.parent.arguments.includes(n) &&
        ELEMENT_TYPE_CONTAINERS.has(calleeMethod(n.parent.expression) ?? "")) return false;
    if (ts.isPropertyAssignment(n.parent)) return n.parent.initializer === n;
    n = n.parent;
  }
  return false;
}

/**
 * ANY boolean the model can set, whatever it is called.
 *
 * Deliberately not a list of approval-ish names. `confirm`, `approved`, `approval`, `force`,
 * `really`, `yes_do_it` — the next one is always outside the list. A destructive tool has no
 * business taking a boolean from the model at all, so the rule is the shape, not the vocabulary.
 */
/** Strip syntax that does not change a value: parens, `as const`, `satisfies`, `!`. */
function unwrapValue(node) {
  let n = node;
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) ||
               ts.isSatisfiesExpression?.(n) || ts.isNonNullExpression(n) ||
               ts.isTypeAssertionExpression?.(n))) n = n.expression;
  return n;
}

/** A `z.literal(...)` argument that is, or contains, a boolean keyword. */
function literalArgAdmitsBoolean(arg) {
  const a = unwrapValue(arg);
  if (!a) return true;
  if (a.kind === ts.SyntaxKind.TrueKeyword || a.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (ts.isArrayLiteralExpression(a)) return a.elements.some(literalArgAdmitsBoolean);
  // Every VISIBLY non-boolean literal form, not just the two I happened to think of. Reading only
  // string and numeric literals made `z.literal(null)`, `z.literal(1n)` and `z.literal(-1)` — a
  // NullKeyword, a BigIntLiteral and a PrefixUnaryExpression — look unreadable, so a legitimate
  // field on a destructive tool failed CI. Both zods reject `true` for all three.
  if (ts.isStringLiteralLike(a) || ts.isNumericLiteral(a) || ts.isBigIntLiteral(a)) return false;
  if (a.kind === ts.SyntaxKind.NullKeyword || a.kind === ts.SyntaxKind.UndefinedKeyword) return false;
  if (ts.isPrefixUnaryExpression(a) &&
      (a.operator === ts.SyntaxKind.MinusToken || a.operator === ts.SyntaxKind.PlusToken)) {
    return literalArgAdmitsBoolean(a.operand);
  }
  return true;
}

/**
 * Builders whose value is provably not a bare boolean.
 *
 * THIS IS AN ALLOWLIST, AND THAT IS THE WHOLE POINT. The previous version enumerated the builders
 * that ADMIT a boolean — `boolean`, then `literal`, then `any`/`unknown`, then the multi-value
 * `literal` overload — and review found a way past it six times running: `z.promise`, `z.enum` with
 * an unread argument, `z.literal([true,false])`, `z.literal((true))`, `z.literal(true as const)`,
 * `z.nativeEnum({T:true})`, `z.json()`. Each fix was another name and the next name won.
 *
 * Inverted, an unrecognised builder is not proven safe, so it is REFUSED. A new zod construct — or
 * one whose behaviour differs between the two zods this repository carries — fails closed instead
 * of passing silently. The cost is that a legitimately safe new builder needs a line here, in a
 * diff someone reads. That is the trade this guard has now made four times in other rules.
 */
const NON_BOOLEAN_HEADS = new Set([
  "string", "number", "bigint", "date", "symbol", "object", "array", "record", "map", "set",
  "tuple", "instanceof", "void", "never", "null", "undefined", "nan", "file", "email", "uuid",
  "url", "emoji", "base64", "cuid", "cuid2", "ulid", "ipv4", "ipv6", "iso",
]);

/** Wrappers that carry another schema through without constraining it. */
const SCHEMA_WRAPPERS = new Set([
  "optional", "nullable", "nullish", "default", "catch", "readonly", "describe", "brand",
  "transform", "refine", "superRefine", "pipe", "promise", "lazy", "meta", "register",
  "union", "intersection", "discriminatedUnion", "or", "and",
]);

/**
 * Can the model set this FIELD to a boolean, as far as this guard can prove?
 *
 * Fail-closed by construction: anything it cannot read, and any builder not named above, is `true`.
 */
function fieldAdmitsBoolean(node) {
  const e = unwrapValue(node);
  if (!e || !ts.isCallExpression(e)) return true;          // an identifier, a spread, anything unread
  const method = calleeMethod(e.expression);
  if (method === null) return true;
  const receiver = (ts.isPropertyAccessExpression(e.expression) || ts.isElementAccessExpression(e.expression))
    ? e.expression.expression : null;
  // A head call is `z.x(...)` or a call under a NAMED SAFE NAMESPACE. Generalising this to "any
  // namespace under z" was a fail-open I introduced while fixing a false positive: `z.coerce`
  // is a namespace too, and `z.coerce.string()` COERCES a boolean rather than rejecting it —
  // measured, `z.coerce.string().safeParse(true)` yields `"true"`, on both zods. So the terminal
  // `string` looked safe while the field accepted `true` and reached a truthy destructive branch.
  //
  // Namespaces are therefore allowlisted by name, like everything else on this side of the guard.
  // An unrecognised namespace falls to the chained branch, hits a non-call receiver, and refuses.
  const isHead = receiver && (
    (ts.isIdentifier(receiver) && receiver.text === SCHEMA_NS) ||
    (ts.isPropertyAccessExpression(receiver) && chainRoot(receiver) === SCHEMA_NS &&
     !ts.isCallExpression(receiver.expression) &&
     SAFE_NAMESPACED.has(`${receiver.name.text}.${method}`)));

  if (!isHead) {
    // A chained call — `z.string().optional()`. The receiver decides, and a schema handed to a
    // combining method (`.or(z.boolean())`) decides too.
    if (SCHEMA_WRAPPERS.has(method) && e.arguments.some(memberAdmitsBoolean)) return true;
    return receiver ? fieldAdmitsBoolean(receiver) : true;
  }

  if (method === "literal") return e.arguments.some(literalArgAdmitsBoolean);
  if (method === "enum") {
    const a = unwrapValue(e.arguments[0]);
    // Only a visible array of string literals is provably boolean-free. An identifier is not.
    return !(a && ts.isArrayLiteralExpression(a) &&
             a.elements.every((el) => ts.isStringLiteralLike(unwrapValue(el))));
  }
  if (method === "nativeEnum") {
    const a = unwrapValue(e.arguments[0]);
    return !(a && ts.isObjectLiteralExpression(a) && a.properties.every((prop) =>
      ts.isPropertyAssignment(prop) && !literalArgAdmitsBoolean(prop.initializer)));
  }
  if (SCHEMA_WRAPPERS.has(method)) return e.arguments.some(memberAdmitsBoolean);
  if (receiver && ts.isPropertyAccessExpression(receiver)) return false;   // an allowlisted full name
  return !NON_BOOLEAN_HEADS.has(method);
}

/** A union member or wrapper argument: an array literal spreads to its elements. */
function memberAdmitsBoolean(arg) {
  const a = unwrapValue(arg);
  if (!a) return true;
  if (ts.isArrayLiteralExpression(a)) return a.elements.some(memberAdmitsBoolean);
  if (ts.isStringLiteralLike(a) || ts.isNumericLiteral(a)) return false;   // a discriminator key
  return fieldAdmitsBoolean(a);
}

/**
 * The builders whose object argument IS a schema's field shape.
 *
 * `augment` is zod 3's alias for `extend` and was missing, so a field added through it was ignored
 * entirely — one of three fail-opens review found in the bottom-up version of this test.
 */
const SHAPE_BUILDERS = new Set([
  "object", "strictObject", "looseObject", "extend", "safeExtend", "augment", "interface",
]);

/**
 * Namespace-qualified builders that reject a boolean, by FULL name.
 *
 * Allowlisting the `iso` namespace alone was not enough: the terminal method still had to appear in
 * `NON_BOOLEAN_HEADS`, so `z.iso.date()` passed only because `date` happened to be in the generic
 * list while `z.iso.time()`, `z.iso.datetime()` and `z.iso.duration()` were reported as
 * model-settable booleans. Full names remove the accident.
 */
const SAFE_NAMESPACED = new Set(["iso.date", "iso.time", "iso.datetime", "iso.duration"]);

/**
 * Every FIELD of every schema shape in this expression, found TOP-DOWN.
 *
 * The previous version asked, of each property, "am I inside a shape?" and walked UP through
 * whatever syntax sat between. Review found three ways past that walk in one round — an
 * angle-bracket type assertion, an inline spread, and a builder alias — because the set of things
 * that can sit between a property and its call is open-ended and I was enumerating it.
 *
 * Descending instead makes the traversal MINE: find the shape builders, unwrap their object
 * argument once, and read the properties directly. An inline spread of an object literal is
 * followed, because its fields are as visible as any other; a spread of a NAME is not followed and
 * needs no special case here — `schemaIsComplete` already refuses the whole schema for it.
 */
function shapeFields(schemaNode) {
  const out = [];
  if (!schemaNode) return out;
  // A definition that a later one overwrites is not in the runtime schema, so its SUBTREE must not
  // be searched either. Without this, `z.object({ ...{ x: z.object({ confirm: z.boolean() }) },
  // x: z.string() })` reported `confirm`: the outer resolution correctly dropped the first `x`,
  // and then the blanket walk found the nested `z.object` inside the definition it had just
  // dropped. Resolving a literal top-down means `discarded` is always populated before the walk
  // descends into it.
  const discarded = new Set();
  walkValues(schemaNode, (n) => {
    if (!ts.isCallExpression(n)) return;
    if (!SHAPE_BUILDERS.has(calleeMethod(n.expression) ?? "")) return;
    for (const arg of n.arguments) {
      const a = unwrapValue(arg);
      if (!a || !ts.isObjectLiteralExpression(a)) continue;
      const { surviving, dropped } = resolveObjectLiteral(a);
      for (const f of surviving) out.push(f);
      for (const d of dropped) discarded.add(d);
    }
  }, (n) => discarded.has(n));
  return out;
}

function resolveObjectLiteral(objectLiteral) {
  const byName = new Map();
  const unreadableName = [];   // a computed key never removes a key it might not be
  const dropped = [];

  const add = (entry) => {
    if (entry.name === null) { unreadableName.push(entry); return; }
    const prev = byName.get(entry.name);
    if (prev) dropped.push(prev.node);        // overwritten: not in the runtime schema
    byName.delete(entry.name);                // re-insert so the survivor is the LAST written
    byName.set(entry.name, entry);
  };

  const visit = (obj) => {
    for (const m of obj.properties) {
      if (ts.isSpreadAssignment(m)) {
        const inner = unwrapValue(m.expression);
        if (inner && ts.isObjectLiteralExpression(inner)) visit(inner);
        continue;   // an opaque spread is caught by the completeness check, not here
      }
      const name = m.name ? staticPropertyName(m.name) : null;
      if (ts.isPropertyAssignment(m)) { add({ name, value: m.initializer, node: m }); continue; }
      if (ts.isGetAccessorDeclaration(m)) { add({ name, value: getterSchema(m), node: m }); continue; }
      // EVERY OTHER MEMBER FORM DEFINES A FIELD WHOSE SCHEMA THIS CANNOT READ.
      //
      // Shorthand (`{ confirm }`), a setter, a method, and any member kind added to the language
      // later all reach here. Reading only property assignments meant each of them was dropped
      // SILENTLY — the field vanished from the schema this guard believes it is inspecting, and a
      // destructive tool declaring `{ confirm }` passed with zero violations. Four fail-opens of
      // one shape; the review named one of them, and the sweep found the rest.
      //
      // `value: null` makes the field unreadable rather than absent, and `fieldAdmitsBoolean`
      // treats an unreadable field as admitting a boolean. So the failure mode is now a loud,
      // easily-fixed false positive instead of a silent pass — the correct side to err on.
      add({ name, value: null, node: m });
    }
  };
  visit(objectLiteral);

  return { surviving: [...byName.values(), ...unreadableName], dropped };
}

/** A getter's schema, when its body is a single `return`. Anything else is unreadable. */
function getterSchema(node) {
  const body = node.body;
  if (!body || body.statements.length !== 1) return null;
  const only = body.statements[0];
  return ts.isReturnStatement(only) && only.expression ? only.expression : null;
}

/** A property key readable at parse time, or null when it is computed/unresolvable. */
function staticPropertyName(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

/**
 * Every FIELD in this schema the model could set to a boolean.
 *
 * Deliberately NOT a list of approval-ish names. `confirm`, `approved`, `force`, `really` — the
 * next one is always outside the list. A destructive tool has no business taking a boolean from the
 * model at all, so the rule is the shape, not the vocabulary.
 */
function modelSettableBooleans(schemaNode) {
  const names = [];
  for (const field of shapeFields(schemaNode)) {
    if (!fieldAdmitsBoolean(field.value)) continue;
    const nm = field.name ?? "<computed>";
    if (!names.includes(nm)) names.push(nm);
  }
  return names;
}


/**
 * Is this schema's KEY SPACE provably closed — can the model send a key the shape does not declare?
 *
 * `modelSettableBooleans` answers "is a DECLARED field a boolean". It cannot answer this, because
 * an open object declares nothing about the key the model actually sends. Measured, nine ways to
 * leave the key space open all passed with zero violations while `args.confirm` reached a
 * `.delete()`:
 *
 *   z.object({}).passthrough()            z.looseObject({})
 *   z.object({}).catchall(z.boolean())    z.object({}).nonstrict()
 *   z.object({ id }).passthrough()        z.object({}).and(z.record(z.string(), z.boolean()))
 *   z.object({}).catchall(z.any())        z.intersection(z.object({}), z.record(…))
 *                                         z.union([z.object({}), z.record(…)])
 *
 * ALLOWLIST, NOT DENYLIST — the third inversion in this file, for the third time the same reason.
 * Enumerating the ways to OPEN a schema loses to the next combinator; enumerating the ways to keep
 * it CLOSED means an unrecognised one fails closed. A closed schema is a closed-object builder at
 * the head of a chain of methods that provably do not widen the key space, and nothing else.
 */
// MEASURED ON BOTH ZODS THIS REPOSITORY USES, rather than assumed:
//
//   zod 3.25.76 (paige-mcp's esm.sh import)   z.object({id}).parse({id,confirm:true}) → {"id":"a"}
//   zod 4.5.4   (the installed devDependency) z.object({id}).parse({id,confirm:true}) → {"id":"a"}
//
// `z.object` ACCEPTS the extra key and STRIPS it from the output, so the handler never receives it
// — which is what "closed" has to mean here, since the handler reads the output. `z.strictObject`
// rejects outright on both. Either way no undeclared key reaches a destructive branch.
//
// `interface` was on this list and is `undefined` in BOTH versions — it exists in neither zod this
// repository runs. Removed: an allowlist entry that cannot be verified is exactly the unchecked
// assumption this file keeps being caught by, and dropping it means a future `z.interface` fails
// CLOSED until someone measures it, which is the right default for the base case every chain
// stands on.
const CLOSED_OBJECT_BUILDERS = new Set(["object", "strictObject"]);
// THE QUESTION IS THE OUTPUT, NOT THE INPUT — which is the frame the first version got wrong.
//
// A handler reads what the schema PRODUCES. I built this list by asking which methods preserve the
// accepted-key space, and four of them leave that space alone while changing what comes out.
// Measured against the installed zod:
//
//   z.object({id}).transform(() => ({ id:"f", confirm:true }))  →  { id:"f", confirm:true }
//   z.object({id}).catch({ id:"x", confirm:true })   on bad input →  { id:"x", confirm:true }
//   z.object({id}).default({ id:"x", confirm:true }) on undefined →  { id:"x", confirm:true }
//
// The last of those is mine, not the review's: `default` has the identical shape and nobody named
// it. All three hand the handler a `confirm` the declared shape never mentions, and `catch` and
// `default` are model-TRIGGERABLE even though their value is author-written — send malformed input,
// or omit the field, and the fallback fires. `pipe` joins them because its downstream can produce
// anything at all.
//
// `readonly` and `optional` were measured too, and they strip as expected, so they stay.
const KEYSPACE_PRESERVING = new Set([
  // Wrappers that change cardinality, docs or validation but never the keys that come OUT.
  "optional", "nullable", "nullish", "readonly", "describe", "brand",
  "refine", "superRefine", "meta", "register",
  // Shape edits. They add, remove or relax DECLARED fields — every one of which `shapeFields`
  // already collects — and leave the object as closed as it found it.
  "extend", "safeExtend", "augment", "merge", "pick", "omit", "partial", "required",
  "deepPartial", "strict",
]);

// The ONE method whose ARGUMENT's key policy is inherited by the result. Recursing into every
// `z.`-rooted argument was too broad: `z.object({…}).register(z.registry(), {…})` passes a REGISTRY,
// not a schema, and calling it not-closed refused a boolean-free destructive tool.
const INHERITS_ARGUMENT_KEYSPACE = new Set(["merge"]);

function schemaKeySpaceIsClosed(node) {
  const e = unwrapValue(node);
  if (!e || !ts.isCallExpression(e)) return false;
  const method = calleeMethod(e.expression);
  if (method === null) return false;
  const receiver = (ts.isPropertyAccessExpression(e.expression) || ts.isElementAccessExpression(e.expression))
    ? e.expression.expression : null;
  if (receiver && ts.isIdentifier(receiver) && receiver.text === SCHEMA_NS) {
    return CLOSED_OBJECT_BUILDERS.has(method);      // the head decides
  }
  if (!KEYSPACE_PRESERVING.has(method)) return false;   // widens, or this guard does not know it
  // A PRESERVING METHOD PRESERVES THE RECEIVER'S KEY POLICY — NOT ITS ARGUMENT'S.
  //
  // `z.object({}).merge(z.object({}).passthrough())` inherits the RIGHT-hand schema's unknown-key
  // policy in both installed zods, and `.pipe()` likewise validates against the schema handed to
  // it. Recursing only into the receiver called both closed. Measured, four ways: merge with a
  // passthrough, with a catchall, with a looseObject, and pipe with a passthrough.
  //
  // Generalised rather than special-cased to `merge`, because "the methods whose argument is also a
  // schema" is one more list to get wrong: ANY argument that is itself a `z.` chain must prove its
  // own closedness. A method added to KEYSPACE_PRESERVING later inherits this check for free.
  if (INHERITS_ARGUMENT_KEYSPACE.has(method)) {
    for (const arg of e.arguments) {
      const a = unwrapValue(arg);
      if (a && ts.isCallExpression(a) && chainRoot(a.expression) === SCHEMA_NS &&
          !schemaKeySpaceIsClosed(a)) return false;
    }
  }
  return receiver ? schemaKeySpaceIsClosed(receiver) : false;
}

export function findViolations(src, file = "<memory>") {
  const out = [];
  const scopes = destructiveScopes(src, file);
  for (const tool of findToolCalls(src, file)) {
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
    // A schema that admits an UNDECLARED key admits an undeclared boolean, whatever its declared
    // fields say. This is checked separately from the field walk because the field walk cannot see
    // it: an open object's shape is silent about the key the model actually sends.
    if (schema && !schemaKeySpaceIsClosed(schema)) {
      out.push({ file, tool: tool.name, line: tool.line, evidence: destructive,
                 fields: ["<schema admits undeclared keys — a model-settable boolean cannot be ruled out>"] });
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

  // THE RPC CLASSIFIER CARRIED ITS OWN, SHORTER VOCABULARY (Codex, post-merge on #789).
  // `destructiveCall` matched a METHOD name against the shared `REMOVAL_VERB` and then matched an
  // `.rpc()` TARGET against a separate five-word regex, so a third of the vocabulary was invisible
  // on that path: `.rpc("remove_contacts")` beside a model-settable boolean produced ZERO
  // violations while `.remove()` beside the identical schema was caught. Two enumerations of one
  // idea in one file — which is the exact drift the shared regex was introduced to end, left in
  // place on the one call site that did not read it.
  {
    const rpcTool = (name) => `
mcp.tool("t", { inputSchema: z.object({ confirm: z.boolean() }),
  handler: async (args) => { if (args.confirm) await admin.rpc("${name}", {}); } });
const TOOL_SCOPE = { t: "crm.write" };`;
    for (const name of ["remove_contacts", "erase_contacts", "truncate_contacts",
                        "unlink_contacts", "discard_contacts"]) {
      check(`catches .rpc("${name}") — a word the RPC path could not see`, v(rpcTool(name)), 1);
    }
    // The five it already saw must not regress out the other side of the change.
    for (const name of ["delete_contacts", "purge_contacts", "destroy_contacts",
                        "wipe_contacts", "drop_contacts"]) {
      check(`still catches .rpc("${name}")`, v(rpcTool(name)), 1);
    }
    // And the controls that keep the rule usable: a read is not a removal.
    for (const name of ["get_contacts", "list_contacts", "upsert_contact", "send_email"]) {
      check(`allows .rpc("${name}")`, v(rpcTool(name)), 0);
    }
  }

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

  // ── review, on head 0c7402d8: `destructiveCall` was the enumeration that decides whether a tool
  // is EXAMINED AT ALL, so a miss there is silent rather than loud. Two were found and both
  // reproduced against the shipped guard, returning 0. A third — a computed METHOD name — is the
  // same defect one step over and was found by sweeping the class rather than the two instances.
  const GATED = `handler: async (a) => { if (a.confirm) await `;
  const BOOL = `inputSchema: z.object({ confirm: z.boolean() })`;

  // (1) A call whose RPC TARGET is computed. The guard cannot read it, so it must not score it
  // harmless — that is how `admin.rpc(rpcName)` where rpcName is "purge_everything" got a pass.
  check("fails closed on .rpc() with a computed target", v(`
const rpcName = "purge_everything";
mcp.tool("t", { ${BOOL}, ${GATED}admin.rpc(rpcName); } });`), 1);
  check("fails closed on .rpc() with a template target", v(`
mcp.tool("t", { ${BOOL}, ${GATED}admin.rpc(\`purge_\${a.x}\`); } });`), 1);
  // The negative control that makes the two above mean something: a LITERAL, non-delete-shaped RPC
  // on a tool with no removal scope is still not destructive. Failing closed on the unreadable one
  // must not have quietly promoted every RPC.
  check("a literal non-delete rpc is still NOT destructive", v(`
mcp.tool("t", { ${BOOL}, ${GATED}admin.rpc("recalculate_totals"); } });`), 0);

  // (2) Removal spelled as something other than the exact method `delete`. Supabase Storage's
  // `.remove()` deletes objects; `deleteUser` / `deleteBucket` delete through the admin API.
  check("catches storage .remove()", v(`
mcp.tool("t", { ${BOOL}, ${GATED}admin.storage.from("b").remove(["k"]); } });`), 1);
  check("catches auth.admin.deleteUser()", v(`
mcp.tool("t", { ${BOOL}, ${GATED}admin.auth.admin.deleteUser(a.id); } });`), 1);
  check("catches storage.deleteBucket()", v(`
mcp.tool("t", { ${BOOL}, ${GATED}admin.storage.deleteBucket("b"); } });`), 1);
  check("catches .truncate()", v(`
mcp.tool("t", { ${BOOL}, ${GATED}admin.from("clients").truncate(); } });`), 1);
  // Negative control for the widened vocabulary: the ordinary read/write methods a tool actually
  // uses must not have become destructive. If this ever returns non-zero the regex is too greedy.
  check("ordinary reads and writes are NOT removals", v(`
mcp.tool("t", { ${BOOL}, handler: async (a) => { if (a.confirm) {
  await admin.from("c").select("id"); await admin.from("c").update({ x: 1 });
  await admin.from("c").insert({ x: 1 }); await admin.from("c").upsert({ x: 1 });
  await admin.storage.from("b").download("k"); await admin.from("c").softDelete();
} } });`), 0);

  // (3) The class the review did not name: a computed METHOD. Same ignorance, same fail-open.
  check("fails closed on a computed method name", v(`
mcp.tool("t", { ${BOOL}, ${GATED}admin.from("clients")[a.op](); } });`), 1);
  // …but a computed member READ is not a call, and an element access with a literal is readable.
  check("a computed member read is not a call", v(`
mcp.tool("t", { ${BOOL}, handler: async (a) => { if (a.confirm) return ok(a.rows[a.i]); } });`), 0);
  check("still reads a literal element-access method", v(`
mcp.tool("t", { ${BOOL}, ${GATED}admin.from("clients")["select"]("id"); } });`), 0);

  // (4) The scope vocabulary is the SAME enumeration in a second place. Widening only the call
  // classifier would have left it behind, so both read one regex — and the pre-existing behaviour
  // (`admin.delete`, `crm.delete`) must be unchanged.
  check("a *.remove scope is destructive, like *.delete", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.boolean() }),
  handler: async (a) => { if (a.confirm) await admin.rpc("handle_data_subject_request"); return ok({}); } });
const TOOL_SCOPE = { t: "storage.remove" };`), 1);
  check("a *.read scope is still not destructive", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.boolean() }),
  handler: async (a) => { if (a.confirm) await admin.rpc("handle_data_subject_request"); return ok({}); } });
const TOOL_SCOPE = { t: "crm.read" };`), 0);

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
  // Codex, on 841b1333: a schema can admit `true` without spelling `boolean`, and a delete can be
  // written without spelling `.delete`. Both reproduced against the shipped guard before the fix.
  check("a FIELD typed z.any(), beside a destructive handler", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.any() }), ${DESTRUCTIVE} });`), 1);
  check("a FIELD typed z.unknown().optional(), beside a destructive handler", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.unknown().optional() }), ${DESTRUCTIVE} });`), 1);
  // The live `handle_data_subject_request` shape. An unconstrained VALUE TYPE inside a container is
  // a data payload, not a branch flag — the coarse version of this rule failed the real surface.
  check("z.record(z.string(), z.any()) is a payload, not a settable flag", v(`
mcp.tool("t", { inputSchema: z.object({ id: z.string(), corrections: z.record(z.string(), z.any()).optional() }), handler: async ({ id }) => { await admin.rpc("handle_data_subject_request", { id }); } });`), 0);
  // Codex on 70c7f0c5: argument position alone cannot tell a container's element type from a
  // combinator that widens the field itself. Both reproduced at 0 violations before this fix.
  check("z.union([z.string(), z.any()]) leaves the FIELD unconstrained", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.union([z.string(), z.any()]) }), ${DESTRUCTIVE} });`), 1);
  check("z.optional(z.any()) leaves the FIELD unconstrained", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.optional(z.any()) }), ${DESTRUCTIVE} });`), 1);
  check("z.array(z.any()) is an element type, not the field", v(`
mcp.tool("t", { inputSchema: z.object({ id: z.string(), items: z.array(z.any()) }), handler: async ({ id }) => { await admin.rpc("handle_data_subject_request", { id }); } });`), 0);
  // Zod 4.5.4 measured: z.enum([true,false]).safeParse(true) -> { success: true, data: true }.
  // The exception that let an unread identifier through here rested on that being impossible.
  check("an unread z.enum argument no longer passes", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.enum(FLAGS) }), ${DESTRUCTIVE} });`), 1);
  // Codex on 40462543, both about the container list this guard now leans on.
  // z.promise does NOT constrain its input to a container — measured on zod 3.25.76 AND 4.5.4:
  //   z.object({ confirm: z.promise(z.any()) }).safeParseAsync({ confirm: true })  ->  accepted
  check("z.promise(z.any()) leaves the FIELD unconstrained", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.promise(z.any()) }), ${DESTRUCTIVE} });`), 1);
  // And the walk must CONTINUE past a combinator to find the container outside it, or a
  // legitimate payload is flagged. Verified: this schema rejects a bare `true`.
  check("array(union([string, any])) is elements, not the field", v(`
mcp.tool("t", { inputSchema: z.object({ id: z.string(), items: z.array(z.union([z.string(), z.any()])) }), handler: async ({ id }) => { await admin.rpc("handle_data_subject_request", { id }); } });`), 0);
  check("record(string, union([string, any])) is values, not the field", v(`
mcp.tool("t", { inputSchema: z.object({ id: z.string(), m: z.record(z.string(), z.union([z.string(), z.any()])) }), handler: async ({ id }) => { await admin.rpc("handle_data_subject_request", { id }); } });`), 0);
  // Codex on 553a8c1e: zod 4's multi-value literal overload. Measured — zod 4.5.4 accepts a
  // boolean here, zod 3.25.76 rejects it, so bumping paige-mcp's import would have opened this.
  check("z.literal([true, false]) is a model-settable boolean", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.literal([true, false]) }), ${DESTRUCTIVE} });`), 1);
  check("z.literal([\"a\", \"b\"]) is not", v(`
mcp.tool("t", { inputSchema: z.object({ mode: z.literal(["a", "b"]), id: z.string() }), handler: async ({ id }) => { await admin.rpc("handle_data_subject_request", { id }); } });`), 0);
  // The inversion's proof: every evasion review found against the enumerated version, plus the
  // legitimate schemas that must stay clean. Six of these defeated the old rule one at a time.
  const SAFE_H = `handler: async ({ id }) => { await admin.rpc("handle_data_subject_request", { id }); }`;
  for (const [label, schema] of [
    ["z.literal((true))", `z.object({ confirm: z.literal((true)) })`],
    ["z.literal(true as const)", `z.object({ confirm: z.literal(true as const) })`],
    ["z.nativeEnum with boolean values", `z.object({ confirm: z.nativeEnum({ T: true, F: false } as any) })`],
    ["z.json()", `z.object({ confirm: z.json() })`],
    ["z.string().or(z.boolean())", `z.object({ confirm: z.string().or(z.boolean()) })`],
    ["an unread identifier as a field type", `z.object({ confirm: someSchema })`],
  ]) check(`REFUSES ${label}`, v(`
mcp.tool("t", { inputSchema: ${schema}, ${DESTRUCTIVE} });`), 1);
  for (const [label, schema] of [
    ["z.string().uuid()", `z.object({ id: z.string().uuid() })`],
    ["z.enum of string literals", `z.object({ mode: z.enum(["a","b"]), id: z.string() })`],
    ["z.nativeEnum of strings", `z.object({ m: z.nativeEnum({ A: "a", B: "b" } as any), id: z.string() })`],
    ["number, date and a nested object", `z.object({ n: z.number().min(1), d: z.date(), o: z.object({ s: z.string() }) })`],
  ]) check(`ADMITS ${label}`, v(`
mcp.tool("t", { inputSchema: ${schema}, ${SAFE_H} });`), 0);
  // Codex on 6d554580, all three FALSE POSITIVES — the axis I asked to be attacked after the
  // inversion. Each is a legitimate field on a destructive tool that this guard was blocking.
  for (const [label, schema] of [
    ["z.literal(null)", `z.object({ mode: z.literal(null), id: z.string() })`],
    ["z.literal(1n)", `z.object({ mode: z.literal(1n), id: z.string() })`],
    ["z.literal(-1)", `z.object({ mode: z.literal(-1), id: z.string() })`],
    ["a builder's options object", `z.object({ id: z.string().regex(/x/, { message: "bad" }) })`],
    ["z.iso.date() (namespace-qualified)", `z.object({ created_on: z.iso.date(), id: z.string() })`],
  ]) check(`ADMITS ${label} beside a destructive handler`, v(`
mcp.tool("t", { inputSchema: ${schema}, ${DESTRUCTIVE} });`), 0);
  // …and the fail-closed direction still holds where it must.
  check("an options object does NOT hide a real field", v(`
mcp.tool("t", { inputSchema: z.object({ id: z.string().regex(/x/, { message: "bad" }), confirm: z.boolean() }), ${DESTRUCTIVE} });`), 1);
  // Codex on 8e210fbd: three FAIL-OPENS, each introduced by the previous commit's false-positive
  // fixes. Relaxing a guard is exactly where holes get made, so these are permanent.
  for (const [label, schema] of [
    ["z.coerce.string() (coerces true -> \"true\")", `z.object({ confirm: z.coerce.string() })`],
    ["z.coerce.number()", `z.object({ confirm: z.coerce.number() })`],
    ["a parenthesised shape", `z.object(({ confirm: z.boolean() }))`],
    ["a shape behind an `as` assertion", `z.object(({ confirm: z.boolean() }) as z.ZodRawShape)`],
    ["a shape added by safeExtend", `z.object({ id: z.string() }).safeExtend({ confirm: z.boolean() })`],
  ]) check(`REFUSES ${label}`, v(`
mcp.tool("t", { inputSchema: ${schema}, ${DESTRUCTIVE} });`), 1);
  // Codex on 36f5fe72: three more fail-opens in the bottom-up shape test, plus the iso namespace
  // reporting three of its four builders as booleans. The test is top-down now; these hold it.
  const SAFE_H2 = `handler: async ({ id }) => { await admin.rpc("handle_data_subject_request", { id }); }`;
  for (const [label, schema] of [
    ["a field added by augment (zod 3)", `z.object({ id: z.string() }).augment({ confirm: z.boolean() })`],
    ["a shape behind an angle-bracket assertion", `z.object(<z.ZodRawShape>{ confirm: z.boolean() })`],
    ["a field arriving via an inline spread", `z.object({ ...{ confirm: z.boolean() } })`],
  ]) check(`REFUSES ${label}`, v(`
mcp.tool("t", { inputSchema: ${schema}, ${DESTRUCTIVE} });`), 1);
  // Codex on 991ce9bf: a getter supplying the effective schema was dropped. The SWEEP then found
  // that every non-PropertyAssignment member form was dropped the same way — four silent
  // fail-opens, of which the review named one. Each is now a case, because "the member kinds I
  // happened to handle" is exactly the enumeration this file keeps losing to.
  for (const [label, schema] of [
    ["a SHORTHAND property", `z.object({ confirm })`],
    ["a SHORTHAND naming an ordinary constant", `z.object({ id })`],
    ["a GETTER member", `z.object({ get confirm() { return z.boolean(); } })`],
    ["a SETTER member", `z.object({ set confirm(v) { } })`],
    ["a METHOD member", `z.object({ confirm() { return z.boolean(); } })`],
    ["a getter that OVERWRITES a spread string", `z.object({ ...{ confirm: z.string() }, get confirm() { return z.boolean(); } })`],
  ]) check(`REFUSES ${label}`, v(`
mcp.tool("t", { inputSchema: ${schema}, ${DESTRUCTIVE} });`), 1);
  // …and the false positive from the same round: a definition that is overwritten must not have its
  // SUBTREE searched either, or the nested shape inside the discarded value is still reported.
  // Codex on d6d24e2e: an OPEN object admits a key the shape never declared, so the field walk —
  // which only ever inspects DECLARED fields — was structurally unable to see it. Nine forms,
  // measured, all passing with `args.confirm` reaching a `.delete()`. The check is an allowlist of
  // key-space-preserving methods over a closed-object head: the file's THIRD inversion, for the
  // third time the same reason.
  const OPEN_SCHEMAS = [
    ["passthrough", `z.object({}).passthrough()`],
    ["passthrough with a declared field", `z.object({ id: z.string() }).passthrough()`],
    ["catchall(boolean)", `z.object({}).catchall(z.boolean())`],
    ["catchall(any)", `z.object({}).catchall(z.any())`],
    ["looseObject (zod 4)", `z.looseObject({})`],
    ["looseObject with a field", `z.looseObject({ id: z.string() })`],
    ["nonstrict (zod 3)", `z.object({}).nonstrict()`],
    ["and(record)", `z.object({}).and(z.record(z.string(), z.boolean()))`],
    ["intersection(object, record)", `z.intersection(z.object({}), z.record(z.string(), z.boolean()))`],
    ["union([object, record])", `z.union([z.object({}), z.record(z.string(), z.boolean())])`],
    // Codex on a1f9b3e4: a preserving method preserves the RECEIVER's key policy, not its
    // ARGUMENT's. Both zods inherit the right-hand schema's unknown-key policy on merge, and pipe
    // validates against the schema handed to it. My own stated suspicion when I widened the list.
    ["merge(passthrough)", `z.object({}).merge(z.object({}).passthrough())`],
    ["merge(catchall)", `z.object({}).merge(z.object({}).catchall(z.boolean()))`],
    ["merge(looseObject)", `z.object({}).merge(z.looseObject({}))`],
    // NOTE: refused because `pipe` CHANGES THE OUTPUT, not because its argument's input is open.
    // The receiver strips first — measured, `z.object({}).pipe(z.object({}).passthrough())`
    // parses `{confirm:true}` to `{}` — so my original reason for this case was wrong even though
    // the verdict was right. A downstream can still produce anything, so it stays refused.
    ["pipe (output is the downstream's, whatever that is)", `z.object({}).pipe(z.object({}).passthrough())`],
    ["transform that injects a key", `z.object({ id: z.string() }).transform(() => ({ id: "f", confirm: true }))`],
    ["catch with a fallback carrying a key", `z.object({ id: z.string() }).catch({ id: "x", confirm: true })`],
    ["default with a fallback carrying a key", `z.object({ id: z.string() }).default({ id: "x", confirm: true })`],
  ];
  const OPEN_HANDLER = `handler: async (args) => { if (args.confirm) await admin.from("clients").delete(); }`;
  for (const [label, schema] of OPEN_SCHEMAS) {
    check(`REFUSES an OPEN schema: ${label}`, findViolations(`
mcp.tool("t", { inputSchema: ${schema}, ${OPEN_HANDLER} });`, "t.ts").length, 1);
  }
  // …and the closed forms must NOT trip it, or the guard blocks every legitimate destructive tool.
  for (const [label, schema] of [
    ["z.object", `z.object({ id: z.string() })`],
    ["z.strictObject", `z.strictObject({ id: z.string() })`],
    ["a chain of key-space-preserving wrappers",
     `z.object({ id: z.string() }).describe("x").optional().refine(() => true)`],
    ["extend", `z.object({ id: z.string() }).extend({ note: z.string() })`],
    ["partial + strict", `z.object({ id: z.string() }).partial().strict()`],
    ["merge with a CLOSED schema", `z.object({ id: z.string() }).merge(z.object({ note: z.string() }))`],
    ["register with a REGISTRY argument (not a schema)", `z.object({ id: z.string() }).register(z.registry(), { description: "x" })`],
    ["readonly on a closed object", `z.object({ id: z.string() }).readonly()`],
  ]) check(`ADMITS a CLOSED schema: ${label}`, findViolations(`
mcp.tool("t", { inputSchema: ${schema}, ${OPEN_HANDLER} });`, "t.ts").length, 0);

  // Codex on 909bbee6: a shorthand was reported as the FIELD admitting a boolean, while the
  // identical longhand was correctly reported as an unreadable schema. Same idiom, same refusal —
  // so the reasons must match too. Fixed in `isKeyPosition`, not by resolving the name: this guard
  // deliberately carries no name resolution, and re-adding it for shorthand would reopen the
  // let-rebind / const-mutation / shadowing class that removing it closed.
  {
    const UNREADABLE = "<schema not fully readable — cannot rule out a model-settable boolean>";
    const shorthand = findViolations(`const id = z.string();
mcp.tool("t", { inputSchema: z.object({ id }), ${DESTRUCTIVE} });`, "t.ts");
    const longhand = findViolations(`const id = z.string();
mcp.tool("t", { inputSchema: z.object({ id: id }), ${DESTRUCTIVE} });`, "t.ts");
    check("a shorthand and its longhand give the SAME reason",
      Number(shorthand[0]?.fields?.[0] === UNREADABLE && longhand[0]?.fields?.[0] === UNREADABLE), 1);
  }
  check("ADMITS a nested shape inside a DISCARDED definition", v(`
mcp.tool("t", { inputSchema: z.object({ ...{ x: z.object({ confirm: z.boolean() }) }, x: z.string() }), ${DESTRUCTIVE} });`), 0);

  // Codex on f2c17fe4: keeping BOTH definitions of a spread-then-overwritten key reported a boolean
  // field that does not exist at runtime. Last write wins WITHIN one object literal — and the
  // reversed order must still be caught, which is what stops the fix from becoming a fail-open.
  check("ADMITS a spread boolean that is overwritten by a non-boolean", v(`
mcp.tool("t", { inputSchema: z.object({ ...{ confirm: z.boolean() }, confirm: z.string() }), ${SAFE_H2} });`), 0);
  check("REFUSES a non-boolean that is overwritten BY a spread boolean", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.string(), ...{ confirm: z.boolean() } }), ${DESTRUCTIVE} });`), 1);
  check("REFUSES a quoted key overwritten by an identifier key of the same name", v(`
mcp.tool("t", { inputSchema: z.object({ "confirm": z.string(), confirm: z.boolean() }), ${DESTRUCTIVE} });`), 1);
  check("a COMPUTED key never cancels a readable boolean", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.boolean(), [k]: z.string() }), ${DESTRUCTIVE} });`), 1);
  for (const m of ["date", "time", "datetime", "duration"]) {
    check(`ADMITS z.iso.${m}()`, v(`
mcp.tool("t", { inputSchema: z.object({ t: z.iso.${m}(), id: z.string() }), ${SAFE_H2} });`), 0);
  }
  check("an ELEMENT-ACCESS delete is still a delete", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.boolean() }), handler: async ({ confirm }) => { if (confirm) await admin.from("clients")["delete"](); } });`), 1);
  check("an ELEMENT-ACCESS destructive rpc is still destructive", v(`
mcp.tool("t", { inputSchema: z.object({ confirm: z.boolean() }), handler: async ({ confirm }) => { if (confirm) await admin["rpc"]("purge_everything"); } });`), 1);
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
  for (const c of calls) if (!c.config) unanalysable.push({ file, ...c });
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
  if (violations.some((v) => v.evidence.startsWith("[unreadable]"))) {
    console.error("\n  One or more of the calls above is marked [unreadable]: this guard could not read the");
    console.error("  method or RPC target, so it failed CLOSED rather than scoring an unseen call harmless.");
    console.error("  If the call is genuinely not destructive, write its name as a string literal so the");
    console.error("  guard can read it. Do not widen the guard to accept computed targets — that restores");
    console.error("  the exact silent bypass this check exists to remove.");
  }
  console.error("\n  Fix: remove the destructive branch from this surface until the capability is");
  console.error("  classified in _shared/action-risk.ts and routed through the shared governed Spine");
  console.error("  execution seam. Do NOT invent an approval channel here — that is the Chat build's");
  console.error("  decision, and a second channel is the failure the doctrine exists to stop.");
  console.error("\n  There is no comment-based exemption. A genuine exception edits this guard, which is");
  console.error("  visible in a diff and reviewed — the comment marker was removed after review picked");
  console.error("  it six different ways while nothing in the codebase ever used it.");
  process.exit(1);
}

console.log(`✓ mcp-destructive-confirm-lint: ${tools} MCP tool(s) across ${sources.length} surface(s) parsed via the TypeScript AST; no destructive tool takes a model-settable boolean.`);
