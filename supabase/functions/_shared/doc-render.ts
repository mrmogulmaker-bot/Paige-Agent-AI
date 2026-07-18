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
export type DocFormat = "pdf" | "docx" | "pptx" | "epub";

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
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[]; ordered: boolean }
  | { type: "pagebreak" };

const MIME: Record<DocFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  epub: "application/epub+zip",
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
    const blocks = normalizeBlocks(input?.content, title);
    const style = (input?.style && typeof input.style === "object") ? input.style : {};

    switch (input?.format) {
      case "pdf":  return { ...(await renderPdf(title, blocks, style)),  mime: MIME.pdf,  ext: "pdf" };
      case "docx": return { ...(await renderDocx(title, blocks, style)), mime: MIME.docx, ext: "docx" };
      case "pptx": return { ...(await renderPptx(title, blocks, style)), mime: MIME.pptx, ext: "pptx" };
      case "epub": return { ...(await renderEpub(title, blocks, style)), mime: MIME.epub, ext: "epub" };
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
function normalizeBlocks(content: unknown, title?: string): Block[] {
  // {blocks:[...]} / {content:[...]} wrappers → unwrap to the inner array/string.
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const c = content as Record<string, unknown>;
    if (Array.isArray(c.blocks)) return coerceBlockArray(c.blocks);
    if (Array.isArray(c.content)) return coerceBlockArray(c.content);
    if (typeof c.markdown === "string") return parseMarkdown(c.markdown);
    if (typeof c.text === "string") return parseMarkdown(c.text);
    // Some unknown object — stringify so we still produce a real (if plain) document.
    try { return parseMarkdown(JSON.stringify(content, null, 2)); } catch { return []; }
  }
  if (Array.isArray(content)) return coerceBlockArray(content);
  if (typeof content === "string") return parseMarkdown(content);
  if (content == null) return title ? [] : [{ type: "paragraph", text: "" }];
  return parseMarkdown(String(content));
}

function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function coerceBlockArray(arr: unknown[]): Block[] {
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
      const items = itemsRaw.map(asText).filter((s) => s.length > 0);
      out.push({ type: "list", items, ordered: t === "ol" || b.ordered === true });
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

// Minimal, dependency-free markdown/plain parser. Handles: ATX headings (#/##/###), unordered
// (-/*/+) and ordered (1.) lists, thematic-break as a page break (---/***), blank-line-separated
// paragraphs. Anything it doesn't recognize becomes paragraph text — never a crash.
function parseMarkdown(src: string): Block[] {
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  let list: { items: string[]; ordered: boolean } | null = null;

  const flushPara = () => { if (para.length) { out.push({ type: "paragraph", text: para.join(" ").trim() }); para = []; } };
  const flushList = () => { if (list && list.items.length) out.push({ type: "list", items: list.items, ordered: list.ordered }); list = null; };
  const flushAll = () => { flushPara(); flushList(); };

  for (const line of lines) {
    const s = line.trim();
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
  flushAll();
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// PDF — pdf-lib (pure-JS, Deno-proven). The reliable in-band PDF path: title + text blocks with
// sane margins, word wrapping, and pagination. (HTML→PDF fidelity is a separate deferred service.)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
async function renderPdf(title: string | undefined, blocks: Block[], _style: Record<string, unknown>): Promise<{ bytes: Uint8Array }> {
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

// pdf-lib's StandardFonts encode WinAnsi only — normalize smart punctuation to ASCII and drop any
// codepoint it can't encode, so an em-dash or an emoji never throws mid-render (§13 defensive).
function sanitizeWinAnsi(text: string): string {
  return String(text)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/[…]/g, "...")
    .replace(/[ ]/g, " ")
    .replace(/[•]/g, "•") // keep bullet (WinAnsi 0x95)
    // Keep tab, newline, printable ASCII, and the Latin-1 supplement (\xA0-\xFF — all defined in
    // WinAnsi); drop the C1 range (\x7F-\x9F) whose undefined slots make pdf-lib throw mid-render.
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF•]/g, "?");
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

    // Group into { heading, body[] } sections.
    const slides: { heading: string; body: string[] }[] = [];
    let cur: { heading: string; body: string[] } | null = null;
    const push = (line: string) => { if (!cur) cur = { heading: title || "Overview", body: [] }; cur.body.push(line); };
    for (const b of blocks) {
      if (b.type === "heading") { if (cur) slides.push(cur); cur = { heading: b.text || " ", body: [] }; }
      else if (b.type === "list") b.items.forEach((it, i) => push(b.ordered ? `${i + 1}. ${it}` : it));
      else if (b.type === "paragraph") { if ((b).text?.trim()) push((b).text.trim()); }
      // pagebreak: force a new slide boundary
      else if (b.type === "pagebreak" && cur) { slides.push(cur); cur = null; }
    }
    if (cur) slides.push(cur);

    // Title slide.
    if (title) {
      const s = pptx.addSlide();
      s.addText(title, { x: 0.5, y: 2.4, w: 9, h: 1.2, fontSize: 36, bold: true, align: "center" });
    }
    if (slides.length === 0) {
      const s = pptx.addSlide();
      s.addText(title || "Untitled", { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 28, bold: true });
    }
    for (const sec of slides) {
      const s = pptx.addSlide();
      s.addText(sec.heading, { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 26, bold: true });
      if (sec.body.length) {
        s.addText(sec.body.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.7, y: 1.6, w: 8.6, h: 5, fontSize: 16, valign: "top" });
      }
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
