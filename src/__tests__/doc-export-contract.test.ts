/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper loaded through a transpile port. */
// @vitest-environment node
//
// CAPABILITY SYSTEM · Doc-export MVP — turn a document a workspace already created into a real,
// DOWNLOADABLE file (pdf/docx/pptx/md) via the existing in-band doc-render lane + the model router's
// persist/sign path. This slice's NET-NEW render code is the `md` serializer (pdf/docx/pptx renderers
// already existed and are only newly REACHED). §32: the md serializer is pure (no Deno/npm import) so
// it is smoke-tested here headlessly — it must produce a real, non-empty .md file and never throw. The
// docx/pptx/pdf paths dynamic-import npm libs (Deno runtime) and stay PROOF-OWED until post-deploy, so
// they are covered by source contract, not executed here.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

// Load the edge module through a transpile port. Its ONLY top-level value import is NeedsConfigError
// from ./provider-types.ts; stub it. The npm doc libs are imported DYNAMICALLY inside the pdf/docx/pptx
// renderers, which the md path never touches — so loading + running renderDoc({format:"md"}) needs no lib.
function loadDocRender() {
  const src = readFileSync("supabase/functions/_shared/doc-render.ts", "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  const require = (k: string) => {
    if (k.includes("provider-types")) return { NeedsConfigError: class NeedsConfigError extends Error { tag?: string; constructor(tag?: string, m?: string) { super(m); this.tag = tag; } } };
    throw new Error(`unexpected runtime import: ${k}`);
  };
  new Function("require", "exports", js)(require, out);
  return out;
}

const { renderDoc } = loadDocRender();
const dec = (u: Uint8Array) => new TextDecoder().decode(u);

describe("doc-render md serializer — a real, portable .md file (slice: doc export MVP)", () => {
  it("serializes title + headings + paragraphs + lists to clean markdown", async () => {
    const r = await renderDoc({
      format: "md",
      title: "Quarterly Plan",
      content: [
        { type: "heading", text: "Overview", level: 1 },
        { type: "paragraph", text: "Revenue is up 20% this quarter." },
        { type: "list", items: ["Ship export", "Tell the owner"], ordered: false },
        { type: "list", items: ["First", "Second"], ordered: true },
      ],
    });
    expect(r.ext).toBe("md");
    expect(r.mime).toMatch(/markdown/);
    const md = dec(r.bytes);
    expect(md).toContain("# Quarterly Plan");           // title is the H1
    expect(md).toContain("## Overview");                 // a block heading sits one level below the title
    expect(md).toContain("Revenue is up 20% this quarter.");
    expect(md).toContain("- Ship export");
    expect(md).toContain("1. First");
    expect(r.bytes.length).toBeGreaterThan(0);
  });

  it("accepts the {docType,title,blocks} wrapper document_generate saves (defensive unwrap)", async () => {
    const r = await renderDoc({ format: "md", title: "Wrapped", content: { docType: "guide", title: "Wrapped", blocks: [{ type: "paragraph", text: "Body." }] } });
    expect(dec(r.bytes)).toContain("Body.");
  });

  it("renders the REAL document_generate block schema (cover/section-header/prose/list/pricing-table/cta), not just the title", async () => {
    // Codex P1 regression: coerceBlockArray previously understood only heading/list/paragraph, so a real
    // generated proposal exported as basically its title while still returning success. This drives the
    // ACTUAL on-canvas block contract document_generate persists and asserts every block's content lands.
    const r = await renderDoc({
      format: "md",
      title: "Growth Proposal",
      content: [
        { type: "cover", eyebrow: "For Acme", title: "Growth Proposal", subhead: "A plan to scale" },
        { type: "section-header", title: "Scope" },
        { type: "prose", markdown: "We will run three campaigns." },
        { type: "callout", variant: "key-insight", body: "Focus on retention first." },
        { type: "list", style: "bullet", items: ["Audit", "Build", "Launch"] },
        { type: "pull-quote", quote: "This changed our business", attribution: "A client" },
        { type: "stat", value: "3x", label: "pipeline growth" },
        { type: "pricing-table", caption: "Investment", rows: [{ item: "Retainer", amount: "$2,500/mo" }], total: "$30,000/yr" },
        { type: "list", style: "checklist", items: ["Sign contract", "Kickoff call"] },
        { type: "worksheet-field", field: "lines", label: "Your top goal", lines: 2 },
        { type: "worksheet-field", field: "scale", label: "Confidence", scaleMin: 1, scaleMax: 5, minLabel: "Low", maxLabel: "High" },
        { type: "worksheet-field", field: "checkbox", label: "I agree to the terms" },
        { type: "cta", headline: "Ready to start?", action: "Approve & start" },
      ],
    });
    const md = dec(r.bytes);
    expect(md).toContain("A plan to scale");            // cover subhead
    // section-header → a REAL H2 line (below the H1 doc title). Line-anchored (^…$ /m) on purpose: a
    // plain toContain("## Scope") would also pass on "### Scope" (an offset substring), which is exactly
    // the false-green that hid a section rendering one level too deep. This asserts H2, never H3.
    expect(md).toMatch(/^## Scope$/m);
    expect(md).toContain("We will run three campaigns."); // prose markdown
    expect(md).toContain("Focus on retention first.");   // callout body
    expect(md).toContain("- Audit");                     // list
    expect(md).toContain("This changed our business");   // pull-quote
    expect(md).toContain("3x");                          // stat value
    expect(md).toContain("Retainer");                    // pricing-table row item
    expect(md).toContain("$2,500/mo");                   // pricing-table amount
    expect(md).toContain("Total: $30,000/yr");           // pricing-table total
    expect(md).toContain("Approve & start");             // cta action
    // Codex P2 — the cover's title equals the outer doc title, so it must render ONCE (as the H1), never
    // twice. Assert exactly one `# Growth Proposal` and NO `## Growth Proposal` duplicate heading.
    expect((md.match(/^# Growth Proposal$/gm) || []).length).toBe(1);
    expect(md).not.toContain("## Growth Proposal");
    // Codex P2 — a `checklist` list keeps its checkbox job as an ASCII `[ ]` (PDF-safe; a Unicode ☐ is
    // transcoded to `?` by the PDF WinAnsi sanitizer), never flattened to a plain bullet.
    expect(md).toContain("[ ] Sign contract");
    expect(md).not.toContain("☐");                       // the Unicode box must never reach the export
    // Codex P1 — a worksheet-field is a REAL printable blank: the prompt AND a place to write/rate/check.
    expect(md).toContain("Your top goal");               // lines field: prompt
    expect(md).toMatch(/_{10,}/);                        // lines field: an actual ruled write-line
    expect(md).toContain("Confidence");                  // scale field: prompt
    expect(md).toContain("1 — 2 — 3 — 4 — 5");           // scale field: the numbered rating
    expect(md).toContain("Low");                         // scale field: min anchor
    expect(md).toContain("High");                        // scale field: max anchor
    expect(md).toContain("I agree to the terms");        // checkbox field: prompt
  });

  it("preserves prose markdown structure/links, the CTA destination, a callout title, and TOC entries (Codex round-4 fidelity)", async () => {
    const r = await renderDoc({
      format: "md",
      title: "Fidelity",
      content: [
        { type: "toc", title: "Inside", entries: ["Overview", "Pricing"] },
        { type: "callout", variant: "key-insight", title: "The key point", body: "Retention beats acquisition." },
        { type: "prose", markdown: "## How it works\n\nWe use **three** campaigns and a [signup form](https://ex.co/x).\n\n- First\n- Second" },
        { type: "cta", headline: "Ready?", action: "Book a call", href: "https://ex.co/book" },
      ],
    });
    const md = dec(r.bytes);
    expect(md).toContain("Overview");                     // toc entries survive as content, not dropped
    expect(md).toContain("Pricing");
    expect(md).toContain("The key point");                // callout title is not lost to the body
    expect(md).toContain("Retention beats acquisition.");
    expect(md).toMatch(/^### How it works$/m);            // prose H2 recovered as a real heading (→ H3 under the doc H1)
    expect(md).toContain("We use three campaigns");       // prose inline **bold** stripped to clean text
    expect(md).not.toContain("**three**");                // no raw markdown syntax leaks into the export
    expect(md).toContain("signup form (https://ex.co/x)"); // a prose link keeps its destination as `label (url)`
    expect(md).toContain("- First");                      // prose list recovered as a real list, not one flat line
    expect(md).toContain("https://ex.co/book");           // the CTA destination is followable, not discarded
  });

  it("keeps underscores in a prose link URL intact and auto-derives an entries-less TOC (Codex round-5)", async () => {
    const r = await renderDoc({
      format: "md",
      title: "R5",
      content: [
        { type: "toc" },                                  // no entries — must auto-build from the sections below
        { type: "section-header", title: "Alpha" },
        { type: "prose", markdown: "See the [guide](https://ex.co/p?utm_source=email&utm_medium=doc)." },
        { type: "chapter-divider", title: "Beta" },
      ],
    });
    const md = dec(r.bytes);
    // G1 — a URL's underscores survive; the emphasis pass must not turn `utm_source` into `utmsource`.
    expect(md).toContain("https://ex.co/p?utm_source=email&utm_medium=doc");
    expect(md).not.toContain("utmsource");
    // G2 — an entries-less toc auto-builds from the section-header/chapter-divider titles (mirrors the canvas).
    expect(md).toContain("Contents");                     // toc default title
    expect(md).toContain("- Alpha");                      // derived TOC entry (a list item, not just the heading)
    expect(md).toContain("- Beta");
  });

  it("PDF fails closed on a title-only Cyrillic document — the charset guard covers SHORT docs too (Codex round-7 I2)", async () => {
    // The guard runs BEFORE the pdf-lib import and throws a distinctly-tagged NeedsConfigError, so this
    // executes headlessly: a 6-char all-Cyrillic title is 100% unencodable and must degrade, not ship `?`.
    await expect(renderDoc({ format: "pdf", title: "Привет", content: [] }))
      .rejects.toMatchObject({ tag: "doc-render:pdf-charset" });
    // And a purely-Latin PDF does NOT trip the charset guard (it fails later on the lib import in this
    // headless port — a DIFFERENT tag — proving the Cyrillic rejection above is the charset guard, not the import).
    await expect(renderDoc({ format: "pdf", title: "Hello world", content: [{ type: "paragraph", text: "All ASCII here." }] }))
      .rejects.toMatchObject({ tag: "doc-render:pdf" });
  });

  it("keeps code spans and balanced-paren link URLs verbatim, and md preserves Unicode (Codex round-6)", async () => {
    const r = await renderDoc({
      format: "md",
      title: "R6",
      content: [
        { type: "prose", markdown: "Set `tenant_id_value` and `a*b*c`; see [x](https://ex.co/a_(b)?utm_source=s&utm_medium=m)." },
        { type: "paragraph", text: "Привет мир 你好" },
      ],
    });
    const md = dec(r.bytes);
    // H2 — inline code is preserved VERBATIM; the `_id_` / `*b*` inside it must not be emphasis-stripped.
    expect(md).toContain("tenant_id_value");
    expect(md).toContain("a*b*c");
    // H3 — a link URL with a balanced `(b)` and query underscores survives whole (not truncated at the `)`).
    expect(md).toContain("https://ex.co/a_(b)?utm_source=s&utm_medium=m");
    expect(md).not.toContain("utmsource");
    // md keeps Unicode — only the PDF path has the WinAnsi (Latin-only) limit.
    expect(md).toContain("Привет мир 你好");
  });

  it("preserves section and chapter numbers in the exported heading (Codex round-8 J3)", async () => {
    const r = await renderDoc({
      format: "md",
      title: "Numbered",
      content: [
        { type: "section-header", number: 2, title: "Scope" },
        { type: "chapter-divider", number: 3, title: "Delivery" },
      ],
    });
    const md = dec(r.bytes);
    expect(md).toMatch(/^## 2\. Scope$/m);       // section number kept as content (→ H2 under the doc title)
    expect(md).toMatch(/^## 3\. Delivery$/m);    // chapter number kept
  });

  it("never throws and still produces a file for empty content (title-only)", async () => {
    const r = await renderDoc({ format: "md", title: "Only A Title", content: [] });
    expect(r.ext).toBe("md");
    expect(dec(r.bytes)).toContain("# Only A Title");
  });

  it("markdown output carries no forged trust markers by construction (it is the words, not a doc dressed up)", async () => {
    const r = await renderDoc({ format: "md", title: "T", content: [{ type: "paragraph", text: "plain" }] });
    expect(dec(r.bytes)).not.toContain("=== TENANT KNOWLEDGE ===");
  });
});

describe("doc-render binary-format guards (source contract — pdf/pptx use npm libs, PROOF-OWED)", () => {
  const SRC = readFileSync("supabase/functions/_shared/doc-render.ts", "utf8");

  it("PDF fails closed on non-WinAnsi content instead of shipping a `?`-corrupted file reported as success (§13/H1)", () => {
    // pdf-lib StandardFonts are Latin-only; a Cyrillic/CJK/Arabic doc would render `?`. The guard measures
    // the loss via the ONE sanitizer and degrades to needs_config so the caller reports honestly.
    expect(SRC).toContain("function winAnsiLoss");
    expect(SRC).toContain("winAnsiLoss(sample) / nonWs");
    expect(SRC).toContain('"doc-render:pdf-charset"');
    // Codex round-7 I2 — EVERY non-empty doc is checked (no `>= 8` floor exemption); short docs use a
    // majority threshold so a title-only Cyrillic doc still fails closed, one emoji in short English doesn't.
    expect(SRC).toContain("nonWs > 0");
    expect(SRC).toContain("nonWs >= 8 ? 0.15 : 0.5");
  });

  it("PPTX heads orphan content with a neutral 'Overview', never the doc title; nothing but the title rides the title slide (H4/I1/J2)", () => {
    // Codex round-8 J2 — the round-7 `lead → title slide` approach mis-classified intro prose and a first
    // section's kicker as cover copy. The fix drops lead entirely: orphan content opens an "Overview"
    // section, and the title slide carries the title ONLY, so no guess about cover metadata is needed.
    expect(SRC).toContain('{ heading: "Overview", body: [] }');
    expect(SRC).not.toContain('{ heading: title || "Overview", body: [] }'); // the duplicate-title default is gone
    expect(SRC).not.toContain("const lead: string[]");                        // no title-slide lead routing at all
    expect(SRC).not.toContain("sawHeading");
  });

  it("inline markdown protects code spans + link URLs before the emphasis passes (H2/H3)", () => {
    expect(SRC).toContain("@@CODE");
    expect(SRC).toContain("@@URL");
    expect(SRC).toContain("restore code verbatim");
  });
});

describe("export-document edge function — the callable seam (source contract)", () => {
  const SRC = readFileSync("supabase/functions/export-document/index.ts", "utf8");

  it("renders through the ONE doc-render lane + records via the service-role Rail recorder (§18)", () => {
    expect(SRC).toContain('import { callModel } from "../_shared/model-router.ts"');
    expect(SRC).toContain('import { recordCapabilityRun } from "../_shared/capability-record.ts"');
    expect(SRC).toContain('await callModel(');
    expect(SRC).toContain('"doc-render"');
  });

  it("authorizes ENTIRELY by tenant-scoped role (owner/admin/coach) or operator — no coarse global gate (§9/§59/§70 source contract)", () => {
    expect(SRC).toContain('authed.auth.getUser()');
    // Codex round-8 J1 (§70) — the coarse `admin|coach` GLOBAL gate is GONE: it 403'd a freshly-provisioned
    // Solo owner (global role only `user`; authority is an owner membership is_tenant_admin recognizes)
    // before the tenant check ran, so they couldn't export their OWN document. Authorization is the
    // tenant-scoped check (below) or the operator role — nothing else.
    expect(SRC).not.toContain('"admin" || r === "super_admin" || r === "platform_admin" || r === "coach"');
    expect(SRC).not.toContain("Admin or coach access required.");
    expect(SRC).toContain('.from("marketing_content")');
    // the tenant the file is filed under is the row's tenant, never the request body
    expect(SRC).toContain("const tenantId = doc.tenant_id");
    expect(SRC).not.toContain("body?.tenant_id");
    // Codex F1 — a platform_admin can't read marketing_content via RLS (it admits only is_platform_owner()
    // = super_admin cross-tenant), so operators read via the SERVICE-ROLE client; non-operators via JWT.
    expect(SRC).toContain('roles.some((r: string) => r === "super_admin" || r === "platform_admin")');
    expect(SRC).toContain("const reader = isOperator ? service : authed");
    // Codex F2 / §59 global-role trap — a plain member of the doc's tenant who holds a GLOBAL admin role
    // from ANOTHER tenant must NOT export. The in-body gate requires a MANAGE role IN THE DOC'S TENANT
    // (owner/admin via is_tenant_admin, coach via has_tenant_role), tenant-scoped — never is_tenant_member.
    expect(SRC).toContain('authed.rpc("is_tenant_admin", { _tenant: tenantId })');
    expect(SRC).toContain('authed.rpc("has_tenant_role", { _user_id: user.id, _tenant_id: tenantId, _role: "coach" })');
    expect(SRC).not.toContain('.rpc("is_tenant_member"'); // the any-role membership CALL was the F2 leak (a comment may still name it)
    expect(SRC).toContain("You don't have manage access to that document's workspace.");
    // HONEST SCOPE (§32.c): this is a SOURCE contract that the in-body gate exists — a true multi-tenant
    // RLS/role drive proving the IDOR is closed needs a live DB and is owed to the authenticated post-deploy pass.
  });

  it("offers only the renderer's real formats and degrades honestly, never a fake link (§13)", () => {
    expect(SRC).toContain('new Set(["pdf", "docx", "pptx", "md"])');
    expect(SRC).toContain("rendered?.needs_config");
    expect(SRC).toContain('record("capability_succeeded")');
    expect(SRC).toContain('record("capability_failed")');
    expect(SRC).toContain('record("capability_outcome_unknown")');
    expect(SRC).toContain('capabilityKey: "document_export"');
  });
});

describe("document_generate wires the export seam (source contract)", () => {
  const SRC = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

  it("adds the optional export_format param without adding a new inline tool name", () => {
    expect(SRC).toContain('export_format: { type: "string", enum: ["pdf", "docx", "pptx", "md"]');
  });

  it("invokes the export-document seam and attaches a download_url on success, honest status otherwise", () => {
    expect(SRC).toContain('/functions/v1/export-document');
    expect(SRC).toContain("base.download_url = ex.download_url");
    expect(SRC).toContain("base.export_status =");
    // it re-derives the tenant from the caller JWT at the seam — the invoke passes only content_id + format
    expect(SRC).toContain('body: JSON.stringify({ content_id: cid, format: exportFormat })');
  });
});
