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
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "tool") return;
    const [nameArg, configArg] = node.arguments;
    // A configuration this guard cannot READ is a tool it cannot inspect. Recording it as
    // unanalysable rather than skipping it is the whole difference between a guard and a guard
    // that reports success — `mcp.tool("x", config)` and `.forEach(t => mcp.tool(t.name, t.config))`
    // are both valid registrations, and both were silently discarded before.
    out.push({
      name: literalText(nameArg) ?? "<computed name>",
      config: configArg && ts.isObjectLiteralExpression(configArg) ? configArg : null,
      text: node.getFullText(sf),
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    });
  });
  return out;
}

function prop(objectLiteral, name) {
  for (const p of objectLiteral.properties) {
    if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) && p.name &&
        ts.isIdentifier(p.name) && p.name.text === name) {
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
  walk(schemaNode, (n) => {
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
    if (EXEMPT.test(tool.text)) continue;
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
    const destructive = (handler ? destructiveCall(handler) : null)
      ?? ((scopes.has(tool.name) && callsRpc(handler)) ? "scope *.delete + an opaque rpc" : null);
    if (!destructive) continue;
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
  check("a wrapper registration is recorded as unanalysable",
    findToolCalls("list.forEach((t) => mcp.tool(t.name, t.config));").filter((t) => !t.config).length, 1);

  check("passes a boolean on a NON-destructive tool", v(`
mcp.tool("list_things", { inputSchema: z.object({ include_archived: z.boolean() }),
  handler: async () => ok({ rows: [] }) });`), 0);
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
  for (const c of calls) if (!c.config && !EXEMPT.test(c.text)) unanalysable.push({ file, ...c });
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
