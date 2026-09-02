#!/usr/bin/env node
/**
 * mcp-destructive-confirm-lint — a boolean in the model's own arguments is not an approval.
 *
 * WHAT THIS GUARDS. `paige-mcp` exposes its tools to an external MCP client (Claude Desktop,
 * ChatGPT, and anything else the operator connects over OAuth). Every argument those tools receive
 * is authored by a MODEL. So a tool that reads `confirm: true` out of its own arguments and then
 * performs a destructive act has gated destruction on a value the thing being gated wrote.
 *
 * `docs/doctrine/one-approval-gate.md` names this shape by name and forbids it:
 *
 *     | Trusting `confirm: true` from the model's arguments alone
 *     |   → That flag is the model's own JSON. It selects a branch; it proves nothing.
 *
 * WHY A SEPARATE GUARD FROM `one-approval-gate-lint`. That guard is scoped to the Chat handler and
 * two Chat surfaces; `paige-mcp` appears zero times in its file list, which is exactly how this
 * pattern shipped and stayed shipped. This guard is the same doctrine applied to the other door.
 * It is deliberately NOT a second approval mechanism, and it does not try to become one.
 *
 * THE ANCHORING CASE (issue #784, 2026-09-02). `bulk_delete_contacts` permanently hard-deleted up
 * to 100 `clients` rows — cascading per FK rules — using the SERVICE-ROLE client, gated only by
 * `confirm: z.boolean()` in its own inputSchema. It carried no action-risk classification, no
 * autonomy lane, and no approval proof. The identical act in Chat is `crm_delete_contact`,
 * classified `high`, where Chat refuses model-asserted approval outright. Contained by removing
 * the destructive branch; this guard is what stops the next one arriving.
 *
 * WHAT IT DOES NOT CLAIM. Passing this lint does not mean an MCP tool is governed. It means this
 * one specific invalid pattern is absent. Routing mutating MCP tools through the shared governed
 * Spine execution seam is the real fix, and it is a separate, sequenced workstream.
 *
 * THE RULE. Inside one `mcp.tool("name", { … })` block, FAIL when BOTH hold:
 *   (A) the tool declares a model-settable approval boolean (`confirm`, `auto_confirm`, `force`, …)
 *   (B) the handler performs a destructive act (`.delete()`, a delete/purge RPC, or `DELETE FROM`)
 *
 * ESCAPE HATCH. A genuine exception marks the line `// mcp-confirm-exempt: <reason>` inside the
 * block — deliberate and explained, never silent.
 *
 *   node scripts/ci/mcp-destructive-confirm-lint.mjs
 *   node scripts/ci/mcp-destructive-confirm-lint.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";

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
 * Count `mcp.tool(` CALL SITES, form-agnostically and without interpreting the file.
 *
 * Deliberately a raw regex with no comment/string stripping. The first version of this counter
 * stripped the whole file first, and that stripper DESYNCHRONISED on the real source — measured:
 * it lost exactly one of the 117 declarations (`send_btf_template_email`) after mis-reading a quote
 * upstream, then recovered. A counter that can silently lose a declaration is precisely the failure
 * this check exists to detect, so the counter must be the dumb one and the extractor the clever one.
 *
 * The trade is deliberate and one-directional: a literal `mcp.tool(` written inside a comment or a
 * string WILL trip this check. That is a loud, easily-fixed false positive. The alternative — a
 * clever counter that quietly under-counts — hides a real unparsed tool, which is the hole.
 */
export function countToolCallSites(src) {
  return (src.match(/\bmcp\.tool\s*\(/g) || []).length;
}

/**
 * Split source into `mcp.tool(<name>, { … })` blocks by brace matching.
 *
 * The scan tracks string, template and comment state, because this file is thousands of lines of
 * prose-heavy handlers and a naive brace count trips on the first `{` inside a description.
 *
 * ALL THREE QUOTE FORMS ARE ACCEPTED. The first version matched only a double-quoted name, so
 * `mcp.tool('bulk_delete_contacts', { … })` — valid TypeScript — was never extracted, and a
 * model-confirmed delete inside it would never have been inspected. The zero-tools check below
 * could not save it either: it is aggregate-only, so the other 116 declarations keep the count
 * nonzero and CI passes in silence. Raised as a P1 by the Codex review of `f663fe0d`.
 */
export function extractToolBlocks(src) {
  const blocks = [];
  const re = /mcp\.tool\(\s*(?:"([^"]+)"|'([^']+)'|`([^`$\\]+)`)\s*,\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1] ?? m[2] ?? m[3];
    let i = m.index + m[0].length - 1; // at the opening brace
    let depth = 0, inS = null, inTpl = false, inLine = false, inBlock = false;
    for (; i < src.length; i++) {
      const c = src[i], n = src[i + 1], p = src[i - 1];
      if (inLine) { if (c === "\n") inLine = false; continue; }
      if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
      if (inS) { if (c === "\\") { i++; continue; } if (c === inS) inS = null; continue; }
      if (inTpl) { if (c === "\\") { i++; continue; } if (c === "`") inTpl = false; continue; }
      if (c === "/" && n === "/") { inLine = true; i++; continue; }
      if (c === "/" && n === "*") { inBlock = true; i++; continue; }
      if (c === '"' || c === "'") { inS = c; continue; }
      if (c === "`") { inTpl = true; continue; }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
      void p;
    }
    blocks.push({ name, body: src.slice(m.index, i) });
  }
  return blocks;
}

/** (A) an approval-shaped boolean the MODEL fills in. */
const APPROVAL_BOOLEAN =
  /\b(confirm|confirmed|confirmation|auto_confirm|autoconfirm|force|force_delete|skip_confirm\w*|i_am_sure|really)\s*:\s*z\s*\.\s*(boolean|literal)\s*\(/;

/** (B) an act that destroys rows. */
const DESTRUCTIVE = [
  /\.\s*delete\s*\(\s*\)/,
  /\.\s*rpc\(\s*["'][a-z0-9_]*(delete|purge|destroy|wipe|drop)[a-z0-9_]*["']/i,
  /\bDELETE\s+FROM\b/i,
];

const EXEMPT = /\/\/\s*mcp-confirm-exempt:\s*\S/;

export function findViolations(src, file = "<memory>") {
  const out = [];
  for (const { name, body } of extractToolBlocks(src)) {
    if (!APPROVAL_BOOLEAN.test(body)) continue;
    const hit = DESTRUCTIVE.find((r) => r.test(body));
    if (!hit) continue;
    if (EXEMPT.test(body)) continue;
    out.push({ file, tool: name, evidence: (body.match(hit) || [""])[0].trim() });
  }
  return out;
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  let bad = 0;
  const check = (label, src, expected) => {
    const got = findViolations(src).length;
    const okc = got === expected;
    if (!okc) bad++;
    console.log(`${okc ? "✓" : "✗"} ${label} — expected ${expected}, got ${got}`);
  };

  // POSITIVE: the exact #784 shape must be caught.
  check("catches a model-confirmed hard delete", `
mcp.tool("bulk_delete_contacts", {
  description: "Delete up to 100 contacts. Braces { } in prose must not confuse the scanner.",
  inputSchema: z.object({
    contact_ids: z.array(z.string()),
    confirm: z.boolean().optional(),
  }),
  handler: async ({ contact_ids, confirm }) => {
    if (!confirm) return ok({ dry_run: true });
    const { data } = await admin.from("clients").delete().in("id", contact_ids).select("id");
    return ok({ data });
  },
});
`, 1);

  // POSITIVE: a delete RPC counts too.
  check("catches a model-confirmed delete RPC", `
mcp.tool("nuke_thing", {
  inputSchema: z.object({ force: z.boolean() }),
  handler: async ({ force }) => { if (force) await admin.rpc("purge_thing", {}); return ok({}); },
});
`, 1);

  // NEGATIVE: the contained shape — confirm accepted, nothing destroyed.
  check("passes a preview-only tool that never deletes", `
mcp.tool("bulk_delete_contacts", {
  inputSchema: z.object({ contact_ids: z.array(z.string()), confirm: z.boolean().optional() }),
  handler: async ({ contact_ids, confirm }) => {
    if (confirm !== true) return ok({ preview_only: true });
    return err("Nothing was deleted, and nothing will be.");
  },
});
`, 0);

  // NEGATIVE: a destructive tool with NO model-settable approval boolean is out of scope here.
  check("passes a delete with no approval boolean", `
mcp.tool("remove_row", {
  inputSchema: z.object({ id: z.string() }),
  handler: async ({ id }) => { await admin.from("t").delete().eq("id", id); return ok({}); },
});
`, 0);

  // NEGATIVE: an explained exemption is allowed.
  check("respects an explained exemption", `
mcp.tool("bulk_delete_contacts", {
  inputSchema: z.object({ confirm: z.boolean() }),
  // mcp-confirm-exempt: server re-validates a single-use claim before this runs
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); return ok({}); },
});
`, 0);

  // POSITIVE: the P1 from the Codex review — a single-quoted name must not be invisible.
  check("catches a single-quoted destructive tool", `
mcp.tool('bulk_delete_contacts', {
  inputSchema: z.object({ confirm: z.boolean() }),
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); return ok({}); },
});
`, 1);

  // POSITIVE: and a backtick-named one.
  check("catches a template-literal-named destructive tool", `
mcp.tool(\`bulk_delete_contacts\`, {
  inputSchema: z.object({ confirm: z.boolean() }),
  handler: async ({ confirm }) => { if (confirm) await admin.from("clients").delete(); return ok({}); },
});
`, 1);

  // NEGATIVE: braces inside strings must not swallow the next tool.
  check("does not let a brace in prose merge two tools", `
mcp.tool("safe_one", {
  description: "A } brace and a { brace in prose",
  handler: async () => ok({}),
});
mcp.tool("safe_two", {
  inputSchema: z.object({ id: z.string() }),
  handler: async () => ok({}),
});
`, 0);

  // The mismatch detector: every quote form parses, so parsed === call sites.
  check("every quote form parses, so the counts agree", (() => {
    const src = `
mcp.tool("a", { handler: async () => ok({}) });
mcp.tool('b', { handler: async () => ok({}) });
mcp.tool(\`c\`, { handler: async () => ok({}) });
`;
    return countToolCallSites(src) === 3 && extractToolBlocks(src).length === 3 ? 0 : 1;
  })(), 0);

  // A name form the extractor cannot read is VISIBLE as a mismatch rather than silently skipped.
  check("an unreadable name form shows up as a mismatch", (() => {
    const src = `mcp.tool(NAME_CONST, { handler: async () => ok({}) });`;
    return countToolCallSites(src) === 1 && extractToolBlocks(src).length === 0 ? 0 : 1;
  })(), 0);

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
const skipped = [];
for (const file of sources) {
  const src = fs.readFileSync(file, "utf8");
  const parsed = extractToolBlocks(src);
  const declared = countToolCallSites(src);
  // PARTIAL PARSING FAILS CLOSED. A declaration the extractor does not recognise is a tool this
  // guard never looks at, and the aggregate zero-check cannot see it because the others keep the
  // count nonzero. Comparing against a form-agnostic count is what makes a skip loud.
  if (parsed.length !== declared) skipped.push({ file, parsed: parsed.length, declared });
  tools += parsed.length;
  violations = violations.concat(findViolations(src, file));
}

if (skipped.length) {
  console.error("✗ mcp-destructive-confirm-lint: the parser skipped at least one tool declaration.\n");
  for (const s of skipped) {
    console.error(`  ${s.file} — parsed ${s.parsed} of ${s.declared} declaration(s)`);
  }
  console.error("\n  A declaration this guard cannot parse is a tool it never inspects, and the");
  console.error("  zero-tools check below cannot catch it because the rest keep the count nonzero.");
  console.error("  Teach `extractToolBlocks` the declaration form rather than lowering this check.");
  process.exit(1);
}

if (tools === 0) {
  console.error("✗ mcp-destructive-confirm-lint: parsed 0 tool declarations. Failing closed —\n" +
                "  the declaration shape probably changed, and a guard that sees nothing passes everything.");
  process.exit(1);
}

if (violations.length) {
  console.error(`✗ mcp-destructive-confirm-lint: ${violations.length} destructive MCP tool(s) gated on a model-supplied boolean.\n`);
  for (const v of violations) {
    console.error(`  ${v.file} → ${v.tool}`);
    console.error(`     destructive call: ${v.evidence}`);
  }
  console.error("\n  A boolean inside the tool's own arguments is written by the model. It selects a");
  console.error("  branch; it proves nothing. See docs/doctrine/one-approval-gate.md.");
  console.error("\n  Fix: remove the destructive branch from this surface until the capability is");
  console.error("  classified in _shared/action-risk.ts and routed through the shared governed Spine");
  console.error("  execution seam. Do NOT invent an approval channel here — that decision is the Chat");
  console.error("  build's, and a second channel is the failure the doctrine exists to stop.");
  console.error("\n  Genuine exception: mark the line `// mcp-confirm-exempt: <reason>` inside the block.");
  process.exit(1);
}

console.log(`✓ mcp-destructive-confirm-lint: ${tools} MCP tool(s) across ${sources.length} surface(s); no destructive act gated on a model-supplied boolean.`);
