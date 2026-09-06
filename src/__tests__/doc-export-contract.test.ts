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
    if (k.includes("provider-types")) return { NeedsConfigError: class NeedsConfigError extends Error {} };
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
        { type: "cta", headline: "Ready to start?", action: "Approve & start" },
      ],
    });
    const md = dec(r.bytes);
    expect(md).toContain("A plan to scale");            // cover subhead
    expect(md).toContain("## Scope");                    // section-header → H2 (below the H1 title)
    expect(md).toContain("We will run three campaigns."); // prose markdown
    expect(md).toContain("Focus on retention first.");   // callout body
    expect(md).toContain("- Audit");                     // list
    expect(md).toContain("This changed our business");   // pull-quote
    expect(md).toContain("3x");                          // stat value
    expect(md).toContain("Retainer");                    // pricing-table row item
    expect(md).toContain("$2,500/mo");                   // pricing-table amount
    expect(md).toContain("Total: $30,000/yr");           // pricing-table total
    expect(md).toContain("Approve & start");             // cta action
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

describe("export-document edge function — the callable seam (source contract)", () => {
  const SRC = readFileSync("supabase/functions/export-document/index.ts", "utf8");

  it("renders through the ONE doc-render lane + records via the service-role Rail recorder (§18)", () => {
    expect(SRC).toContain('import { callModel } from "../_shared/model-router.ts"');
    expect(SRC).toContain('import { recordCapabilityRun } from "../_shared/capability-record.ts"');
    expect(SRC).toContain('await callModel(');
    expect(SRC).toContain('"doc-render"');
  });

  it("is admin/coach gated, reads with the CALLER JWT, and re-enforces caller tenant scope IN-BODY (§9/§59 source contract)", () => {
    expect(SRC).toContain('authed.auth.getUser()');
    expect(SRC).toContain('"admin" || r === "super_admin" || r === "platform_admin" || r === "coach"');
    expect(SRC).toContain('.from("marketing_content")');
    // the tenant the file is filed under is the row's tenant, never the request body
    expect(SRC).toContain("const tenantId = doc.tenant_id");
    expect(SRC).not.toContain("body?.tenant_id");
    // §59 — the caller-JWT read alone is NOT sufficient: marketing_content RLS has a global-`admin`
    // OR-branch, so a by-id EXPORT reader must RE-ENFORCE membership in-body; cross-tenant is operator-only.
    expect(SRC).toContain('roles.some((r: string) => r === "super_admin" || r === "platform_admin")');
    expect(SRC).toContain('authed.rpc("is_tenant_member", { _tenant: tenantId })');
    expect(SRC).toContain("You don't have access to that document's workspace.");
    // HONEST SCOPE (§32.c): this is a SOURCE contract that the in-body gate exists — a true two-tenant
    // RLS drive proving the IDOR is closed needs a live DB and is owed to the authenticated post-deploy pass.
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
