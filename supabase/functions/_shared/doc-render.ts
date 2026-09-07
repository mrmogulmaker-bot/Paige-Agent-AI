// _shared/doc-render.ts — In-band document renderers for the Vibe Studio model router (doc-render lane).
//
// One seam that turns a title + structured blocks (or markdown/plain text) into a real, downloadable
// document in one of four formats. This is the RELIABLE in-band path — pure-JS/npm renderers that run
// inside the Supabase Deno runtime. HTML→PDF pixel-fidelity (headless chromium) is a SEPARATE deferred
// microservice and is intentionally NOT attempted here (§13 — don't pretend a capability we can't prove).
//
// FAIL-CLOSED, PER-FORMAT (doctrine §13 + the DENO/npm reality): this codebase cannot be run locally
// here, so each npm lib's compatibility with the Supabase Deno runtime is UNPROVEN until post-deploy.
// Therefore every format is INDEPENDENTLY fail-closed: the lib is dynamically imported INSIDE that
// format's own try/catch, so a broken import or a render throw in ONE format returns a
// NeedsConfigError (→ the router's honest `needs_config` degrade) WITHOUT touching the other three.
// A broken docx lib can never take down pdf/pptx/epub, and the router never crashes — it degrades.
//
// ── Per-lib Deno-compat risk (for the integrator's sequencing) ───────────────────────────────────────
//   FORMAT | lib               | purity        | risk   | notes
//   pdf    | npm:pdf-lib        | pure-JS       | LOW    | zero Node built-ins; Deno-proven. The safe default.
//   epub   | npm:fflate         | pure-JS       | LOW    | pure-JS zip; EPUB is assembled by hand here.
//   docx   | npm:docx           | node-built-ins| MEDIUM | pulls Buffer/stream + jszip via npm-compat; usually OK on Deno.
//   pptx   | npm:pptxgenjs      | node-built-ins| MEDIUM | pulls jszip + Node shims; base64 output path avoids fs.
// Each renderer is guarded independently, so a MEDIUM-risk lib failing at runtime degrades ONLY its own
// format to needs_config — pdf/epub (LOW risk) keep working regardless.

import { NeedsConfigError } from "./provider-types.ts";

// Pin versions for reproducibility; each is imported dynamically inside its renderer's try/catch.
const PDFLIB_SPEC = "npm:pdf-lib@1.17.1";
const DOCX_SPEC = "npm:docx@8.5.0";
const PPTX_SPEC = "npm:pptxgenjs@3.12.0";
const FFLATE_SPEC = "npm:fflate@0.8.2";

// ── Public contract ──────────────────────────────────────────────────────────────────────────────────
export type DocFormat = "pdf" | "docx" | "pptx" | "epub" | "md";

export interface DocRenderInput {
  format: DocFormat;
  title?: string;
  /** Structured blocks (array), a markdown/plain string, or {blocks|content} wrapping either — coerced defensively. */
  content: unknown;
  style?: Record<string, unknown>;
}

export interface DocRenderResult {
  bytes: Uint8Array;
  mime: string;
  ext: string;
}

// ── Internal normalized block model ────────────────────────────────────────────────────────────────
type Block =
  | { type: "heading"; text: string; level: number }
  // `raw` marks a paragraph whose text must NOT be inline-cleaned (a fenced code block from parseMarkdown):
  // its backticks/`*`/`_` are content, not markup, so the binary path renders it verbatim (Codex round-12c).
  | { type: "paragraph"; text: string; raw?: boolean }
  | { type: "list"; items: string[]; ordered: boolean }
  | { type: "pagebreak" };

const MIME: Record<DocFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  epub: "application/epub+zip",
  md: "text/markdown; charset=utf-8",
};

function msg(e: unknown): string {
  return (e as Error)?.message ?? String(e);
}

/**
 * renderDoc — dispatch by format. Each format renders in its own independently fail-closed function
 * (dynamic import + try/catch inside), so one broken format can never affect another (§13).
 */
export async function renderDoc(input: DocRenderInput): Promise<DocRenderResult> {
  // The whole body is wrapped: per-format renderers already fail closed with their own NeedsConfigError,
  // but normalization/dispatch runs here too — so ANY unexpected throw degrades to needs_config rather
  // than escaping the router. This is the "router never crashes, it degrades" guarantee, end to end (§13).
  try {
    const title = typeof input?.title === "string" ? input.title : undefined;
    // Flatten inline markdown (strip emphasis, links → `label (url)`) ONLY for the binary renderers, which
    // can't parse markdown. The `.md` exporter is markdown — it keeps prose's raw markup verbatim (Codex P2).
    const blocks = normalizeBlocks(input?.content, title, String(input?.format).toLowerCase() !== "md");
    const style = (input?.style && typeof input.style === "object") ? input.style : {};

    switch (input?.format) {
      case "pdf":  return { ...(await renderPdf(title, blocks, style)),  mime: MIME.pdf,  ext: "pdf" };
      case "docx": return { ...(await renderDocx(title, blocks, style)), mime: MIME.docx, ext: "docx" };
      case "pptx": return { ...(await renderPptx(title, blocks, style)), mime: MIME.pptx, ext: "pptx" };
      case "epub": return { ...(await renderEpub(title, blocks, style)), mime: MIME.epub, ext: "epub" };
      case "md":   return { ...renderMarkdownDoc(title, blocks),         mime: MIME.md,   ext: "md" };
      default:
        // Unknown/unsupported format is an honest fail-closed, same shape the router already handles.
        throw new NeedsConfigError("doc-render", `unsupported doc format: ${String(input?.format)}`);
    }
  } catch (e) {
    if (e instanceof NeedsConfigError) throw e; // per-format tag already set — pass through.
    throw new NeedsConfigError("doc-render", `render failed: ${msg(e)}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Content normalization — accept blocks OR markdown/plain, coerce EVERYTHING defensively (§13).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
function normalizeBlocks(content: unknown, title?: string, flattenInline = true): Block[] {
  // For a `.md` export (flattenInline === false) a RAW markdown source — a top-level string, a
  // `{markdown}`/`{text}` wrapper, or a legacy body PostgREST handed us as a plain string — must round-trip
  // VERBATIM: `parseMarkdown` would collapse fenced code, tables and hard line breaks (Codex round-12). The
  // md serializer preserves a paragraph's internal newlines, so ONE raw paragraph reproduces the source.
  // Binary renderers still parse (they can't render markup), so this only changes the md path. This mirrors
  // the `prose`-block passthrough in coerceBlockArray for the string/object shapes that never became blocks.
  const md = (s: string): Block[] =>
    flattenInline ? parseMarkdown(s)
      : s.trim() ? [{ type: "paragraph", text: s }] : (title ? [] : [{ type: "paragraph", text: "" }]);
  // {blocks:[...]} / {content:[...]} wrappers → unwrap to the inner array/string.
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const c = content as Record<string, unknown>;
    // Prefer the wrapper's own title when the caller passed none, so a cover block can dedupe against it.
    const innerTitle = title ?? (typeof c.title === "string" ? c.title : undefined);
    if (Array.isArray(c.blocks)) return coerceBlockArray(c.blocks, innerTitle, flattenInline);
    if (Array.isArray(c.content)) return coerceBlockArray(c.content, innerTitle, flattenInline);
    if (typeof c.markdown === "string") return md(c.markdown);
    if (typeof c.text === "string") return md(c.text);
    // Some unknown object — stringify so we still produce a real (if plain) document.
    try { return md(JSON.stringify(content, null, 2)); } catch { return []; }
  }
  if (Array.isArray(content)) return coerceBlockArray(content, title, flattenInline);
  if (typeof content === "string") return md(content);
  if (content == null) return title ? [] : [{ type: "paragraph", text: "" }];
  return md(String(content));
}

function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function coerceBlockArray(arr: unknown[], docTitle?: string, flattenInline = true): Block[] {
  const out: Block[] = [];
  for (const raw of arr) {
    if (typeof raw === "string") { out.push({ type: "paragraph", text: raw }); continue; }
    if (!raw || typeof raw !== "object") { out.push({ type: "paragraph", text: asText(raw) }); continue; }
    const b = raw as Record<string, unknown>;
    const t = typeof b.type === "string" ? b.type.toLowerCase() : "paragraph";
    if (t === "pagebreak" || t === "break") { out.push({ type: "pagebreak" }); continue; }
    if (t === "heading" || t === "title" || t === "h1" || t === "h2" || t === "h3" || t === "subheading") {
      const level = clampLevel(
        typeof b.level === "number" ? b.level
          : t === "h3" || t === "subheading" ? 3 : t === "h2" ? 2 : 1,
      );
      out.push({ type: "heading", text: asText(b.text ?? b.content ?? b.value), level });
      continue;
    }
    if (t === "list" || t === "bullets" || t === "ul" || t === "ol") {
      const itemsRaw = Array.isArray(b.items) ? b.items : Array.isArray(b.content) ? b.content : [];
      // A `checklist`-styled list is a real checkbox list on canvas; a flat export must keep that job
      // (Codex P2 — dropping the style rendered checkboxes as ordinary bullets). Prefix each item with an
      // ASCII empty checkbox `[ ]`: it survives the PDF WinAnsi sanitizer (a Unicode `☐` is transcoded to
      // `?` by sanitizeWinAnsi — Codex P2), renders in md/docx/pptx/pdf, and is the GFM task-list form so a
      // markdown viewer shows a real checkbox. A checklist is never ordered.
      const isChecklist = b.style === "checklist";
      const items = itemsRaw.map(asText).filter((s) => s.length > 0).map((s) => (isChecklist ? `[ ] ${s}` : s));
      out.push({ type: "list", items, ordered: !isChecklist && (t === "ol" || b.ordered === true || b.style === "numbered") });
      continue;
    }
    // ── document_generate's RICH block schema (the on-canvas document contract: cover · section-header ·
    //    chapter-divider · toc · prose · callout · pull-quote · stat · worksheet-field · pricing-table ·
    //    cta). Map each to the renderer's flat model so an exported proposal/guide/one-pager carries its
    //    REAL content, not just its title (Codex P1 — the normalizer previously read only text/content/
    //    value, so a `prose` block's `markdown`, a `cover`'s `title`, a `pricing-table`'s `rows`, etc.
    //    were all silently dropped and the file exported near-empty). Each maps to a heading/paragraph/
    //    list/pagebreak; nothing is dropped without a reason.
    const push = (text: string, kind: "heading" | "paragraph" = "paragraph", level = 1) => {
      const s = text.trim();
      if (s) out.push(kind === "heading" ? { type: "heading", text: s, level: clampLevel(level) } : { type: "paragraph", text: s });
    };
    if (t === "cover") {
      push(asText(b.eyebrow));
      // The renderer ALWAYS prints the document's outer title as the H1; the cover's title is normally
      // that same string (export-document passes the row title as both), so emitting it again renders the
      // title twice (Codex P2). Emit the cover title only when it DIFFERS from the outer title — or when
      // there is no outer title, so a bare content array with a cover still gets its H1.
      const coverTitle = asText(b.title ?? b.text).trim();
      if (coverTitle && coverTitle.toLowerCase() !== (docTitle ?? "").trim().toLowerCase()) {
        push(coverTitle, "heading", 1);
      }
      push(asText(b.subhead));
      continue;
    }
    // A section-header is a TOP-LEVEL section, so it coerces to level 1 — the serializer's title-offset
    // (+1 when a doc title is present) then renders it as `## ` (H2), one level under the doc's H1 title,
    // the same depth a generic heading-level-1 lands at. (Coercing to level 2 would push it to H3, one
    // level too deep — a section rendering DEEPER than a plain heading — and would make the `## Scope`
    // test pass only on an offset-substring coincidence rather than the real heading prefix.)
    if (t === "section-header") {
      // Fold the kicker (eyebrow) + number INTO the one heading, rather than a separate paragraph BEFORE it:
      // a pre-heading paragraph attaches to the PREVIOUS pptx slide (Codex P2). One heading block, no
      // ordering hazard, and the kicker/number are still preserved as content.
      push(headingWithKicker(b.kicker, b.number, asText(b.title ?? b.text)), "heading", 1);
      continue;
    }
    if (t === "chapter-divider") {
      out.push({ type: "pagebreak" });
      push(headingWithKicker(b.kicker, b.number, asText(b.title ?? b.text)), "heading", 1);
      push(asText(b.subhead)); // subhead follows the heading (correct order — it is body, not an eyebrow)
      continue;
    }
    if (t === "prose") {
      // prose carries raw MARKDOWN (the canvas renders it via ReactMarkdown). Pushing it as one flat
      // paragraph leaks literal `**bold**` / `[label](url)` / heading / list syntax into docx/pptx/pdf
      // (Codex P2). Parse it into real structural blocks (headings/lists/paragraphs) and strip inline
      // markdown to clean text (links kept as `label (url)`) so every format renders structure, not syntax.
      const md = asText(b.markdown ?? b.text ?? b.content);
      if (!flattenInline) {
        // `.md` export: pass the prose's raw markdown through VERBATIM as one block. Parsing it (as the
        // binary path does) would collapse fenced code blocks, tables and hard line breaks — parseMarkdown
        // joins lines it doesn't recognize with spaces (Codex P2). The md serializer preserves a block's
        // internal newlines, so the source round-trips (headings, emphasis, links, code fences, tables).
        if (md.trim()) out.push({ type: "paragraph", text: md });
        continue;
      }
      // Binary renderers can't parse markdown: recover structure (headings/lists/paragraphs) AND flatten
      // inline markup to clean text (links kept as `label (url)`), so no raw `**` / `[](…)` leaks into the file.
      for (const blk of parseMarkdown(md)) {
        if (blk.type === "heading") push(inlineMdToText(blk.text), "heading", blk.level);
        // A `raw` (fenced-code) paragraph is pushed VERBATIM — no inlineMdToText, no trim (its indentation is
        // code), so a ```ts … ``` block is not corrupted into visible double-backticks (Codex round-12c).
        else if (blk.type === "paragraph") { if (blk.raw) { if (blk.text) out.push({ type: "paragraph", text: blk.text }); } else push(inlineMdToText(blk.text)); }
        else if (blk.type === "list") {
          const items = blk.items.map(inlineMdToText).filter((s) => s.length > 0);
          if (items.length) out.push({ type: "list", items, ordered: blk.ordered });
        } else out.push(blk); // pagebreak
      }
      continue;
    }
    if (t === "callout") {
      push(asText(b.title));            // a titled callout ("Key insight: …") keeps its title, not just its body
      push(asText(b.body ?? b.text));
      continue;
    }
    if (t === "pull-quote") {
      const q = asText(b.quote).trim();
      const attr = asText(b.attribution).trim();
      if (q) push(attr ? `"${q}" — ${attr}` : `"${q}"`);
      continue;
    }
    if (t === "stat") { push([asText(b.value), asText(b.label)].map((s) => s.trim()).filter(Boolean).join(" — ")); continue; }
    if (t === "worksheet-field") {
      // A worksheet-field is a REAL printable blank (§319) — the label alone gives a prompt with nowhere
      // to write/rate/check/sign (Codex P1). Emit the prompt + helper, then the fill affordance for the
      // field kind: ruled write-lines, an open box (a few lines), a numbered rating scale, or a checkbox.
      const RULE = "________________________________________"; // a write-on line, visible in every format
      push(asText(b.label));
      push(asText(b.helper));
      const kind = typeof b.field === "string" ? b.field.toLowerCase() : "lines";
      if (kind === "scale") {
        const min = Number.isFinite(b.scaleMin as number) ? Math.round(b.scaleMin as number) : 1;
        const max = Number.isFinite(b.scaleMax as number) ? Math.round(b.scaleMax as number) : 5;
        const nums: string[] = [];
        for (let i = min; i <= max && nums.length < 20; i++) nums.push(String(i));
        const minL = asText(b.minLabel).trim();
        const maxL = asText(b.maxLabel).trim();
        push([minL, nums.join(" — "), maxL].filter((s) => s.length > 0).join("   "));
      } else if (kind === "checkbox") {
        push(`[ ] ${RULE}`); // ASCII checkbox (PDF-safe; a Unicode ☐ becomes `?` under sanitizeWinAnsi)
      } else if (kind === "box") {
        for (let i = 0; i < 4; i++) push(RULE); // an open box → a small area of write-lines in a flat export
      } else {
        // "line" | "lines" (default): 1 line, or `lines` clamped 1–12 (default 3)
        const n = kind === "line" ? 1 : clampLines(b.lines);
        for (let i = 0; i < n; i++) push(RULE);
      }
      continue;
    }
    if (t === "cta") {
      push([asText(b.headline), asText(b.action)].map((s) => s.trim()).filter(Boolean).join(" — "));
      const href = asText(b.href).trim();
      if (href) push(href); // the destination the canvas links — a flat export shows the URL so it's followable (Codex P2)
      continue;
    }
    if (t === "pricing-table") {
      const caption = asText(b.caption).trim();
      if (caption) out.push({ type: "heading", text: caption, level: 3 });
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const items = rows.map((r) => {
        const rr = (r && typeof r === "object") ? r as Record<string, unknown> : {};
        const label = asText(rr.item).trim() + (asText(rr.detail).trim() ? ` (${asText(rr.detail).trim()})` : "");
        const amount = asText(rr.amount).trim();
        return [label, amount].filter(Boolean).join(": ");
      }).filter((s) => s.length > 0);
      const total = asText(b.total).trim();
      if (total) items.push(`Total: ${total}`);
      if (items.length) out.push({ type: "list", items, ordered: false });
      continue;
    }
    if (t === "toc") {
      // Explicit entries win; otherwise — a VALID schema shape, entries MAY be omitted — auto-build from
      // the document's own section-header/chapter-divider titles, mirroring the canvas (DocumentPreview),
      // so an exported guide/ebook keeps its table of contents instead of silently dropping it (Codex P2).
      const entries = Array.isArray(b.entries) ? b.entries.map(asText).map((s) => s.trim()).filter((s) => s.length > 0) : [];
      if (!entries.length) {
        for (const x of arr) {
          if (!x || typeof x !== "object") continue;
          const xb = x as Record<string, unknown>;
          const xt = typeof xb.type === "string" ? xb.type.toLowerCase() : "";
          if (xt === "section-header" || xt === "chapter-divider") {
            const heading = asText(xb.title ?? xb.text).trim();
            if (heading) entries.push(heading);
          }
        }
      }
      if (entries.length) {
        push((asText(b.title).trim() || "Contents"), "heading", 1);
        out.push({ type: "list", items: entries, ordered: false });
      }
      continue;
    }
    // paragraph / text / anything else
    out.push({ type: "paragraph", text: asText(b.text ?? b.content ?? b.value ?? "") });
  }
  return out;
}

function clampLevel(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return n > 3 ? 3 : Math.floor(n);
}

// section-header / chapter-divider carry an optional `kicker` (eyebrow) and `number` (section index /
// chapter number) the canvas renders prominently — real content, not decoration (Codex P2). Fold BOTH
// into the single heading line ("Kicker — 2. Title") so nothing is emitted as a separate pre-heading
// paragraph (which would attach to the previous pptx slide).
function headingWithKicker(kicker: unknown, n: unknown, t: string): string {
  const num = typeof n === "number" && Number.isFinite(n) ? String(Math.trunc(n))
    : (typeof n === "string" && n.trim() ? n.trim() : "");
  const numbered = num ? `${num}. ${t}`.trim() : t;
  const eyebrow = typeof kicker === "string" ? kicker.trim() : "";
  return [eyebrow, numbered].filter((s) => s.length > 0).join(" — ");
}

// A worksheet-field's ruled-line count: clamp to 1–12, default 3 (mirrors the StudioDocBlock contract).
function clampLines(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 1) return 3;
  return v > 12 ? 12 : Math.floor(v);
}

// Minimal, dependency-free markdown/plain parser. Handles: ATX headings (#/##/###), unordered
// (-/*/+) and ordered (1.) lists, thematic-break as a page break (---/***), blank-line-separated
// paragraphs. Anything it doesn't recognize becomes paragraph text — never a crash.
export function parseMarkdown(src: string): Block[] {
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  let list: { items: string[]; ordered: boolean } | null = null;
  // Fenced code state. A ```/~~~ fence is captured VERBATIM (its newlines + indentation preserved) and
  // emitted as a `raw` paragraph, so the binary path renders it without `inlineMdToText` mangling the
  // triple-backticks into an inline span or eating an intraword `_`/`*` inside the code (Codex round-12c).
  // The `.md` path never reaches here (prose is raw passthrough); this is the binary (pdf/docx/pptx) fix.
  let fence: { mark: string; body: string[] } | null = null;

  const flushPara = () => { if (para.length) { out.push({ type: "paragraph", text: para.join(" ").trim() }); para = []; } };
  const flushList = () => { if (list && list.items.length) out.push({ type: "list", items: list.items, ordered: list.ordered }); list = null; };
  const flushAll = () => { flushPara(); flushList(); };

  for (const line of lines) {
    const s = line.trim();
    if (fence) {
      // A line that is ONLY the fence marker (same char, at least as many) closes the block; else it's code.
      if (new RegExp("^" + fence.mark[0] + "{" + fence.mark.length + ",}$").test(s)) {
        out.push({ type: "paragraph", text: fence.body.join("\n"), raw: true });
        fence = null;
      } else { fence.body.push(line); }   // keep the RAW line — indentation inside code is significant
      continue;
    }
    const open = /^(`{3,}|~{3,})/.exec(s);
    if (open) { flushAll(); fence = { mark: open[1], body: [] }; continue; }
    if (s === "") { flushAll(); continue; }
    if (/^([-*_])\1{2,}$/.test(s)) { flushAll(); out.push({ type: "pagebreak" }); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(s);
    if (h) { flushAll(); out.push({ type: "heading", text: h[2].trim(), level: clampLevel(h[1].length) }); continue; }
    const ul = /^[-*+]\s+(.*)$/.exec(s);
    if (ul) { flushPara(); if (!list || list.ordered) { flushList(); list = { items: [], ordered: false }; } list.items.push(ul[1].trim()); continue; }
    const ol = /^\d+[.)]\s+(.*)$/.exec(s);
    if (ol) { flushPara(); if (!list || !list.ordered) { flushList(); list = { items: [], ordered: true }; } list.items.push(ol[1].trim()); continue; }
    flushList();
    para.push(s);
  }
  // An unclosed fence (no terminating marker) still emits its captured code, never silently dropped.
  if (fence && fence.body.length) out.push({ type: "paragraph", text: fence.body.join("\n"), raw: true });
  flushAll();
  return out;
}

// Strip inline markdown to clean, readable text for the flat block model (which has no inline runs).
// A link keeps its destination as `label (url)` so the URL survives into every format; bold/italic/
// code/strike markers are removed rather than shown literally. Used ONLY on `prose` (which is raw
// markdown by contract) — never on plain-text fields, where a stray `_`/`*` is a literal character.
export function inlineMdToText(s: string): string {
  // Extract link/image destinations into placeholders BEFORE the emphasis passes, so an underscore in a
  // URL (e.g. `?utm_source=…&utm_medium=…`) is never eaten by the italic-underscore rule (Codex P2). The
  // label is left inline and IS emphasis-cleaned (label markdown is real markdown); the raw URL is spliced
  // back only at the end. The `@@URL0@@` sentinel is plain ASCII with no markdown-special or control
  // char, so no emphasis pass touches it and (unlike a NUL/BEL delimiter) it can never leak a bad byte.
  const codes: string[] = [];
  const urls: string[] = [];
  // Balanced-paren destination: non-paren runs OR one level of nested `(...)`, so a URL like
  // `https://ex.co/a_(b)?utm_source=x` is captured WHOLE (a bare `[^)]+` would stop at the first `)` and
  // leak the query into the emphasis pass — Codex P2). One nesting level covers real-world links.
  const DEST = "((?:[^()]|\\([^()]*\\))*)";
  let str = String(s).replace(/^\s*>\s?/gm, "");         // blockquote markers
  str = str
    // Protect inline code VERBATIM first — its contents (`tenant_id_value`, `a*b*c`) must never be seen by
    // the emphasis passes, which would otherwise strip the `_id_`/`*b*` inside it (Codex P2).
    .replace(/`([^`]+)`/g, (_m, c) => `@@CODE${codes.push(String(c)) - 1}@@`)
    .replace(new RegExp("!\\[([^\\]]*)\\]\\(" + DEST + "\\)", "g"), "$1")      // image → alt text (dest dropped)
    .replace(new RegExp("\\[([^\\]]+)\\]\\(" + DEST + "\\)", "g"),
      (_m, label, url) => `${label}@@URL${urls.push(String(url)) - 1}@@`);     // link → label + placeheld url
  // Emphasis stripping, CommonMark-aligned so bare identifiers/URLs written DIRECTLY in prose (not as a
  // markdown link, so NOT placeheld) survive intact: `?utm_source=x&utm_medium=y`, `tenant_id_value`
  // (Codex M2). Asterisk emphasis MAY be intraword (`a*b*c`), so the asterisk rules strip unguarded.
  // Underscore emphasis may NOT be intraword per CommonMark — an `_` flanked by an alphanumeric on its
  // OUTER side opens/closes nothing — so the underscore rules are boundary-guarded (lookbehind/lookahead,
  // supported on the V8 runtime this bundles to): a snake_case or query-string underscore is never eaten.
  // Bold runs before italic so `**x**` / `__x__` is not consumed as two italics.
  // The underscore rules boundary-anchor the DELIMITERS (an `_` flanked by an alphanumeric on its outer
  // side opens/closes nothing, so `utm_source` / `tenant_id_value` are literal) BUT allow intraword
  // underscores INSIDE the emphasis, so a genuine `_tenant_id_` still flattens to `tenant_id` (Codex round-12).
  // `(?=\S)`/`(?<=\S)` keep the content non-empty and non-whitespace-flanked (CommonMark: `_ x_` is not
  // emphasis); the non-greedy `.+?` stops at the first boundary-delimited closing `_`, never an intraword one.
  str = str
    .replace(/\*\*(.+?)\*\*/g, "$1")                                             // bold (asterisks may be intraword)
    .replace(/(?<![A-Za-z0-9])__(?=\S)(.+?)(?<=\S)__(?![A-Za-z0-9])/g, "$1")     // bold (underscore-delimited)
    .replace(/\*([^*]+?)\*/g, "$1")                                              // italic (asterisks may be intraword)
    .replace(/(?<![A-Za-z0-9])_(?=\S)(.+?)(?<=\S)_(?![A-Za-z0-9])/g, "$1")       // italic (underscore-delimited)
    .replace(/~~(.+?)~~/g, "$1");                                                // strikethrough
  str = str
    .replace(/@@CODE(\d+)@@/g, (_m, i) => codes[Number(i)] ?? "")             // restore code verbatim
    .replace(/@@URL(\d+)@@/g, (_m, i) => ` (${urls[Number(i)] ?? ""})`);      // restore raw URL as `(url)`
  return str.trim();
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Markdown — pure serializer, ZERO dependency (so it cannot fail on a Deno/npm import; it is the one
// format that never degrades to needs_config). Serializes the normalized block model back to clean
// markdown: a title as an H1, headings by level, paragraphs, unordered/ordered lists, page breaks as
// thematic breaks. This is the "give me the words in a portable text file" path (§13 — a real .md file,
// not a document dressed up).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
function renderMarkdownDoc(title: string | undefined, blocks: Block[]): { bytes: Uint8Array } {
  const lines: string[] = [];
  const t = (title ?? "").trim();
  if (t) { lines.push(`# ${t}`); lines.push(""); }
  for (const b of blocks) {
    switch (b.type) {
      case "heading": {
        // The title is already the H1; a block heading sits one level below so the outline stays sane.
        const level = Math.min(6, (b.level ?? 1) + (t ? 1 : 0));
        lines.push(`${"#".repeat(Math.max(1, level))} ${b.text}`.trimEnd());
        lines.push("");
        break;
      }
      case "paragraph":
        // Emptiness is checked with trim(), but the PUSHED text strips only TRAILING whitespace — LEADING
        // indentation is significant in a raw-markdown passthrough block (an indented code block's 4 spaces),
        // so trimming both ends would demote its first line to prose while later lines stayed code (Codex
        // round-12b). The serializer adds its own single blank separator below, so trailing whitespace is the
        // only part safe to drop.
        if (b.text.trim()) { lines.push(b.text.replace(/\s+$/, "")); lines.push(""); }
        break;
      case "list":
        b.items.forEach((item, i) => lines.push(b.ordered ? `${i + 1}. ${item}` : `- ${item}`));
        lines.push("");
        break;
      case "pagebreak":
        lines.push("---");
        lines.push("");
        break;
    }
  }
  // Normalize ONLY the trailing run of blank lines to a single terminating newline. Internal blank runs
  // are deliberately NOT collapsed: a `prose` block is raw-markdown passthrough (K3/L2), so a fenced code
  // block or an intentional blank line inside it must round-trip verbatim — a global `\n{3,}→\n\n` would
  // silently corrupt code that carries ≥2 consecutive blank lines (Codex M3). Nothing else produces a
  // triple newline: every block case pushes its content then exactly one lone "", so block separators are
  // already a single blank line and there is no run to collapse there.
  const md = lines.join("\n").replace(/\n+$/, "\n");
  return { bytes: new TextEncoder().encode(md.length ? md : (t ? `# ${t}\n` : "")) };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// PDF — pdf-lib (pure-JS, Deno-proven). The reliable in-band PDF path: title + text blocks with
// sane margins, word wrapping, and pagination. (HTML→PDF fidelity is a separate deferred service.)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Count characters `sanitizeWinAnsi` would turn into `?` — i.e. codepoints pdf-lib's WinAnsi fonts can't
// encode. Reuses the ONE sanitizer (§18) instead of re-listing the range, so the two can never drift.
function winAnsiLoss(text: string): number {
  const q = (s: string) => (s.match(/\?/g) || []).length;
  return Math.max(0, q(sanitizeWinAnsi(text)) - q(String(text)));
}
function blockPlainText(b: Block): string {
  if (b.type === "heading" || b.type === "paragraph") return (b as { text?: string }).text ?? "";
  if (b.type === "list") return ((b as { items?: string[] }).items ?? []).join(" ");
  return "";
}

async function renderPdf(title: string | undefined, blocks: Block[], _style: Record<string, unknown>): Promise<{ bytes: Uint8Array }> {
  // §13/§70 — pdf-lib's StandardFonts are WinAnsi (Latin) only, so a document written in Cyrillic / CJK /
  // Arabic (or heavy emoji) would render as a page of `?` while STILL returning a valid file + a success
  // outcome. Detect that a MATERIAL share of the text can't be encoded and fail closed to needs_config, so
  // the caller degrades honestly (DOCX/MD preserve Unicode) instead of shipping a corrupted PDF called a
  // win. Incidental loss (a stray emoji, one foreign name in an English doc) stays best-effort.
  const sample = [title ?? "", ...blocks.map(blockPlainText)].join("\n");
  const nonWs = sample.replace(/\s+/g, "").length;
  if (nonWs > 0) {
    // Every non-empty document is checked (a title-only `Привет` must fail closed too — Codex P2). A short
    // doc needs a MAJORITY unencodable to reject, so one stray emoji in a short English line stays
    // best-effort; a longer doc rejects once 15% is unrenderable. Either way a wholesale non-Latin doc fails.
    const ratio = winAnsiLoss(sample) / nonWs;
    const threshold = nonWs >= 8 ? 0.15 : 0.5;
    // A LOST currency symbol fails closed on its OWN, independent of the ratio: a single unencodable mark in
    // `₹10,000` stays far below the percentage threshold, yet sanitizeWinAnsi would ship `?10,000` — a
    // materially WRONG price reported as success (§13/§32; Codex round-12). `\p{Sc}` matches every currency
    // mark; `winAnsiLoss(ch)` keeps only the ones WinAnsi can't encode, so $/£/€/¥/¢ pass and ₹/₽/₩/₪/฿ reject.
    const lostCurrency = (sample.match(/\p{Sc}/gu) || []).some((ch) => winAnsiLoss(ch) > 0);
    if (lostCurrency || ratio > threshold) {
      throw new NeedsConfigError("doc-render:pdf-charset",
        "This document uses characters the PDF exporter can't render yet (Latin text only, and some currency symbols) — export it as DOCX or Markdown to keep them.");
    }
  }

  let lib: any;
  try {
    lib = await import(PDFLIB_SPEC);
  } catch (e) {
    throw new NeedsConfigError("doc-render:pdf", `pdf renderer unavailable (import failed): ${msg(e)}`);
  }
  try {
    const { PDFDocument, StandardFonts, rgb } = lib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 612, PAGE_H = 792, MARGIN = 72;
    const maxWidth = PAGE_W - MARGIN * 2;
    const ink = rgb(0.09, 0.09, 0.11);
    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
    const space = (h: number) => { if (y - h < MARGIN) newPage(); };

    // Wrap one logical line to maxWidth at the given font/size and draw it, paginating as needed.
    const drawText = (text: string, size: number, f: any, indent = 0) => {
      const avail = maxWidth - indent;
      const lineH = size * 1.4;
      for (const rawLine of sanitizeWinAnsi(text).split("\n")) {
        const words = rawLine.split(/\s+/).filter((w) => w.length > 0);
        let line = "";
        const emit = (t: string) => { space(lineH); page.drawText(t, { x: MARGIN + indent, y: y - size, size, font: f, color: ink }); y -= lineH; };
        if (words.length === 0) { y -= lineH; continue; }
        for (const w of words) {
          const trial = line ? `${line} ${w}` : w;
          if (f.widthOfTextAtSize(trial, size) > avail && line) { emit(line); line = w; }
          else line = trial;
        }
        if (line) emit(line);
      }
    };

    if (title) { drawText(title, 24, bold); y -= 10; }

    for (const b of blocks) {
      switch (b.type) {
        case "pagebreak": newPage(); break;
        case "heading": {
          const size = b.level === 1 ? 18 : b.level === 2 ? 15 : 13;
          y -= 8; drawText(b.text, size, bold); y -= 4; break;
        }
        case "list": {
          b.items.forEach((it, i) => drawText(`${b.ordered ? `${i + 1}.` : "•"} ${it}`, 11, font, 16));
          y -= 4; break;
        }
        case "paragraph":
        default: {
          if ((b as any).text?.trim()) { drawText((b as any).text, 11, font); y -= 6; }
          break;
        }
      }
    }
    if (doc.getPageCount() === 0) doc.addPage([PAGE_W, PAGE_H]);
    const bytes: Uint8Array = await doc.save();
    return { bytes };
  } catch (e) {
    throw new NeedsConfigError("doc-render:pdf", `pdf render failed: ${msg(e)}`);
  }
}

// pdf-lib's StandardFonts encode WinAnsi (CP1252) only — normalize a few smart-punctuation runs to ASCII
// and drop any codepoint WinAnsi genuinely can't encode, so an emoji never throws mid-render (§13 defensive).
function sanitizeWinAnsi(text: string): string {
  return String(text)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/[\u00A0]/g, " ")
    // Keep tab, newline, printable ASCII, the Latin-1 supplement (\xA0-\xFF), AND the CP1252 "specials"
    // that WinAnsi DOES encode but Unicode places above \xFF — the euro (U+20AC), trademark (U+2122),
    // bullet (U+2022), dagger (U+2020/1), Oe/oe, Sca/sca, Y-diaeresis, Z/z-caron, florin, etc. (Codex P2:
    // `\u20ac2,500` was becoming `?2,500` because the euro was wrongly dropped). Real non-Latin scripts and
    // emoji still map to `?`.
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2020\u2021\u2022\u2030\u2039\u203A\u20AC\u2122]/g, "?");
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// DOCX — npm:docx (Document/Packer). Packer.toBuffer() → Uint8Array.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
async function renderDocx(title: string | undefined, blocks: Block[], _style: Record<string, unknown>): Promise<{ bytes: Uint8Array }> {
  let lib: any;
  try {
    lib = await import(DOCX_SPEC);
  } catch (e) {
    throw new NeedsConfigError("doc-render:docx", `docx renderer unavailable (import failed): ${msg(e)}`);
  }
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } = lib;
    const headingFor = (level: number) =>
      level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;

    const children: any[] = [];
    if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));

    for (const b of blocks) {
      switch (b.type) {
        case "pagebreak":
          children.push(new Paragraph({ children: [new PageBreak()] }));
          break;
        case "heading":
          children.push(new Paragraph({ text: b.text, heading: headingFor(b.level) }));
          break;
        case "list":
          b.items.forEach((it, i) => {
            children.push(b.ordered
              ? new Paragraph({ children: [new TextRun(`${i + 1}. ${it}`)] })
              : new Paragraph({ text: it, bullet: { level: 0 } }));
          });
          break;
        case "paragraph":
        default:
          children.push(new Paragraph({ children: [new TextRun((b as any).text ?? "")] }));
          break;
      }
    }
    if (children.length === 0) children.push(new Paragraph({ children: [new TextRun("")] }));

    const doc = new Document({ sections: [{ children }] });
    const buf = await Packer.toBuffer(doc);
    return { bytes: new Uint8Array(buf) };
  } catch (e) {
    throw new NeedsConfigError("doc-render:docx", `docx render failed: ${msg(e)}`);
  }
}

// Split one section's body into slide-sized pages so a long section never overflows a single fixed-height
// text box (clipped or shrunk to unreadable while the export still reports success — Codex round-12c). The
// budget is an ESTIMATE (pptxgenjs can't measure text headless): each line costs ceil(len/charsPerLine)
// wrapped lines, and a page fills up to linesPerSlide. A single over-budget line still gets its own page
// rather than being dropped. Returns [[]] for an empty body so a heading-only section still renders once.
export function paginateSlideBody(
  body: string[],
  opts?: { charsPerLine?: number; linesPerSlide?: number },
): string[][] {
  const cpl = opts?.charsPerLine ?? 90;   // ~8.6in text box at 16pt
  const lps = opts?.linesPerSlide ?? 15;  // ~5in text box at 16pt
  const estLines = (t: string) => Math.max(1, Math.ceil((t.length || 1) / cpl));
  const pages: string[][] = [];
  let cur: string[] = [];
  let used = 0;
  for (const line of body) {
    const need = estLines(line);
    if (cur.length && used + need > lps) { pages.push(cur); cur = []; used = 0; }
    cur.push(line);
    used += need;
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// PPTX — npm:pptxgenjs. Group blocks into slides (a heading starts a slide; following paragraphs/list
// items become its body). Written to base64 → Uint8Array.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
async function renderPptx(title: string | undefined, blocks: Block[], _style: Record<string, unknown>): Promise<{ bytes: Uint8Array }> {
  let lib: any;
  try {
    lib = await import(PPTX_SPEC);
  } catch (e) {
    throw new NeedsConfigError("doc-render:pptx", `pptx renderer unavailable (import failed): ${msg(e)}`);
  }
  try {
    const PptxGen = lib.default ?? lib;
    const pptx = new PptxGen();

    // Group into { heading, body[] } sections: a heading starts a slide; following paragraphs/list items are
    // its body. Content with no current heading (a deduped cover's subhead, intro prose, a section's leading
    // kicker) opens a neutral "Overview" section — NEVER a slide headed with the document TITLE, which
    // duplicated the title slide (Codex P2). Nothing but the title rides the title slide, so there is no need
    // to guess which pre-heading paragraphs are cover metadata (a guess the flat block model can't make).
    const slides: { heading: string; body: string[] }[] = [];
    let cur: { heading: string; body: string[] } | null = null;
    const pushBody = (line: string) => { if (!cur) cur = { heading: "Overview", body: [] }; cur.body.push(line); };
    for (const b of blocks) {
      if (b.type === "heading") { if (cur) slides.push(cur); cur = { heading: b.text || " ", body: [] }; }
      else if (b.type === "list") b.items.forEach((it, i) => pushBody(b.ordered ? `${i + 1}. ${it}` : it));
      else if (b.type === "paragraph") { if ((b).text?.trim()) pushBody((b).text.trim()); }
      // pagebreak: force a new slide boundary
      else if (b.type === "pagebreak" && cur) { slides.push(cur); cur = null; }
    }
    if (cur) slides.push(cur);

    // Title slide (the title ONLY — no body content is placed here, so it never duplicates a section).
    if (title) {
      const s = pptx.addSlide();
      s.addText(title, { x: 0.5, y: 2.4, w: 9, h: 1.2, fontSize: 36, bold: true, align: "center" });
    }
    if (slides.length === 0 && !title) {
      const s = pptx.addSlide();
      s.addText("Untitled", { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 28, bold: true });
    }
    for (const sec of slides) {
      // A long section paginates into continuation slides instead of overflowing one fixed text box; each
      // continuation repeats the heading with a "(cont.)" marker so the reader keeps the thread (Codex round-12c).
      const pages = paginateSlideBody(sec.body);
      pages.forEach((body, i) => {
        const s = pptx.addSlide();
        s.addText(i === 0 ? sec.heading : `${sec.heading} (cont.)`, { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 26, bold: true });
        if (body.length) {
          s.addText(body.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.7, y: 1.6, w: 8.6, h: 5, fontSize: 16, valign: "top" });
        }
      });
    }

    const b64 = await pptx.write({ outputType: "base64" });
    return { bytes: toBytes(b64) };
  } catch (e) {
    throw new NeedsConfigError("doc-render:pptx", `pptx render failed: ${msg(e)}`);
  }
}

// pptxgenjs.write can hand back base64/arraybuffer/uint8array depending on the runtime — coerce all.
function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "string") {
    const b64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  throw new Error("unexpected pptx write() output type");
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// EPUB 3.0 — assembled by hand (mimetype stored first, container.xml, OPF, nav, XHTML chapter),
// zipped with npm:fflate (pure-JS). Accepts a cover image via style.coverImageBytes.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
async function renderEpub(title: string | undefined, blocks: Block[], style: Record<string, unknown>): Promise<{ bytes: Uint8Array }> {
  let fflate: any;
  try {
    fflate = await import(FFLATE_SPEC);
  } catch (e) {
    throw new NeedsConfigError("doc-render:epub", `epub renderer unavailable (import failed): ${msg(e)}`);
  }
  try {
    const enc = new TextEncoder();
    const bookTitle = title && title.trim() ? title.trim() : "Untitled";
    const language = typeof style.language === "string" ? style.language : "en";
    const author = typeof style.author === "string" ? style.author : undefined;
    const uuid = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    // Optional cover image.
    const cover = coerceBytes(style.coverImageBytes);
    const coverMime = cover ? sniffImageMime(cover) : undefined;
    const coverExt = coverMime === "image/jpeg" ? "jpg" : "png";

    // Chapter XHTML body from blocks.
    const bodyHtml = blocks.map(blockToXhtml).join("\n");
    const chapterXhtml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escXml(language)}">\n` +
      `<head><meta charset="utf-8"/><title>${escXml(bookTitle)}</title></head>\n` +
      `<body>\n<h1>${escXml(bookTitle)}</h1>\n${bodyHtml}\n</body>\n</html>\n`;

    const containerXml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n` +
      `  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>\n`;

    const coverPageXhtml = cover
      ? `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>Cover</title></head>` +
        `<body style="margin:0"><img src="cover.${coverExt}" alt="Cover" style="max-width:100%;height:auto"/></body></html>\n`
      : undefined;

    const navXhtml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escXml(language)}">\n` +
      `<head><meta charset="utf-8"/><title>${escXml(bookTitle)}</title></head>\n` +
      `<body>\n<nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="chapter1.xhtml">${escXml(bookTitle)}</a></li></ol></nav>\n</body>\n</html>\n`;

    const manifestItems = [
      `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      `    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>`,
    ];
    const spineItems: string[] = [];
    const metaExtra: string[] = [];
    if (cover) {
      manifestItems.push(`    <item id="cover-image" href="cover.${coverExt}" media-type="${coverMime}" properties="cover-image"/>`);
      manifestItems.push(`    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
      metaExtra.push(`    <meta name="cover" content="cover-image"/>`);
      spineItems.push(`    <itemref idref="cover"/>`);
    }
    spineItems.push(`    <itemref idref="chapter1"/>`);

    const opf =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escXml(language)}">\n` +
      `  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
      `    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>\n` +
      `    <dc:title>${escXml(bookTitle)}</dc:title>\n` +
      `    <dc:language>${escXml(language)}</dc:language>\n` +
      (author ? `    <dc:creator>${escXml(author)}</dc:creator>\n` : "") +
      `    <meta property="dcterms:modified">${modified}</meta>\n` +
      metaExtra.join("\n") + (metaExtra.length ? "\n" : "") +
      `  </metadata>\n` +
      `  <manifest>\n${manifestItems.join("\n")}\n  </manifest>\n` +
      `  <spine>\n${spineItems.join("\n")}\n  </spine>\n` +
      `</package>\n`;

    // Assemble the zip. mimetype MUST be first and STORED (level 0); everything else deflated.
    const files: Record<string, unknown> = {};
    files["mimetype"] = [enc.encode("application/epub+zip"), { level: 0 }];
    files["META-INF/container.xml"] = enc.encode(containerXml);
    files["OEBPS/content.opf"] = enc.encode(opf);
    files["OEBPS/nav.xhtml"] = enc.encode(navXhtml);
    files["OEBPS/chapter1.xhtml"] = enc.encode(chapterXhtml);
    if (cover && coverPageXhtml) {
      files["OEBPS/cover.xhtml"] = enc.encode(coverPageXhtml);
      files[`OEBPS/cover.${coverExt}`] = [cover, { level: 0 }]; // already-compressed image → store
    }

    const bytes: Uint8Array = fflate.zipSync(files);
    return { bytes };
  } catch (e) {
    throw new NeedsConfigError("doc-render:epub", `epub render failed: ${msg(e)}`);
  }
}

function blockToXhtml(b: Block): string {
  switch (b.type) {
    case "pagebreak": return `<div style="page-break-after:always"></div>`;
    case "heading": { const t = b.level === 1 ? "h2" : b.level === 2 ? "h3" : "h4"; return `<${t}>${escXml(b.text)}</${t}>`; }
    case "list": {
      const tag = b.ordered ? "ol" : "ul";
      return `<${tag}>${b.items.map((it) => `<li>${escXml(it)}</li>`).join("")}</${tag}>`;
    }
    case "paragraph":
    default: { const txt = (b as any).text ?? ""; return txt.trim() ? `<p>${escXml(txt)}</p>` : ""; }
  }
}

function escXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Accept a cover as Uint8Array, ArrayBuffer, or number[]; anything else → undefined (no crash).
function coerceBytes(v: unknown): Uint8Array | undefined {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v) && v.every((n) => typeof n === "number")) return Uint8Array.from(v as number[]);
  return undefined;
}

// Sniff PNG vs JPEG from magic bytes; default to png.
function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return "image/png";
}
