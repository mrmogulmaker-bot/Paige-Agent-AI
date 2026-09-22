// supabase/functions/_shared/agreement-pdf.ts
//
// ONE HOME (§18) for rendering a signed agreement PDF: the exact document wording the
// counterparty accepted, plus the signature block that evidences their acceptance.
//
// PROVENANCE. Lifted from `finalize-agreement/index.ts`'s private `buildPdf` (index.ts:54-140)
// and generalised so a caller supplies the document title. `finalize-agreement` itself is NOT
// modified (§58 — it has a live BTF producer at src/pages/onboard/Step2Agreement.tsx:188), so
// the two now coexist: the BTF path keeps its own copy, the native signing path uses this.
//
// WHAT WAS WRONG WITH THE ORIGINAL, AND IS FIXED HERE. Every one of these was invisible in
// `finalize-agreement` because its caller wraps the whole build in a try/catch that swallows the
// throw and still returns ok with a NULL path (index.ts:193-207) — the §32 false-green this
// module's caller must not reproduce. Once the caller FAILS LOUDLY, these stop being cosmetic:
//
//   1. WINANSI. pdf-lib's StandardFonts encode WinAnsi (CP1252) ONLY, and BOTH `drawText` AND
//      `widthOfTextAtSize` THROW on anything outside it — so even the WRAP pass throws, before a
//      single glyph is drawn. Measured against pdf-lib 1.17.1 by the §32 smoke's codepoint scan:
//      CP1252 punctuation is FINE (curly quotes, em dash, ellipsis, euro, accented Latin all
//      encode), but Cyrillic, CJK, emoji and the rupee sign all throw. A client named in Cyrillic,
//      a CJK counterparty, or ONE emoji anywhere in a pasted contract is enough. Unfixed, that is a
//      hard refusal of a legitimate signing once the caller stops swallowing the throw.
//   2. OVERLONG TOKENS. The original word-wrap pushes a single token wider than the column as
//      its own line, which then runs off the right edge and is silently clipped by the page.
//      A long URL or a signing id did that. Hard-broken by character measurement here.
//   3. SIGNATURE DRAWN OFF-PAGE. The original decrements `y` by the image height with no page
//      check, so a signature landing near the page foot is drawn below y=0 and is invisible in
//      a document whose whole purpose is to evidence it. Page-break guarded here.
//   4. SILENT IMAGE FAILURE. The original `console.warn`s a failed embed and returns a PDF with
//      no signature mark. That is still the right call — the typed name and the consents are the
//      legally operative act, and losing a signing over a cosmetic raster would be worse — but
//      the caller must LEARN it happened so it never records `signer_drew` for a mark that is not
//      in the document (§13). Surfaced through `onWarning`, and JPEG is now tried as well as PNG.
//
// The WinAnsi sanitiser below is a deliberate copy of the proven one in `_shared/doc-render.ts`
// (its private `sanitizeWinAnsi`, doc-render.ts:651). It is private there, so it cannot be
// imported; importing doc-render outright would pull its whole module graph into every function
// that signs. Kept in sync by hand — if one changes, change both.

import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

/** pdf-lib does not re-export PDFImage from this build; derive it rather than reach for `any`. */
type EmbeddedImage = Awaited<ReturnType<PDFDocument["embedPng"]>>;

/** Non-fatal conditions the caller must be able to record truthfully (§13). */
export type AgreementPdfWarning =
  | "signature_image_embed_failed"
  | "body_text_transcoded";

export interface BuildAgreementPdfInput {
  /** Rendered as the document's title line. */
  documentTitle: string;
  /** The exact wording the signer accepted. `# `/`## `/`### ` lines render as headings. */
  bodyText: string;
  /** The typed legal name. This is the operative signature. */
  typedName: string;
  /** Optional drawn signature, PNG or JPEG bytes. Cosmetic; never the operative act. */
  signatureImage?: Uint8Array | null;
  /** ISO-8601 instant the signature was taken. */
  signedAtIso: string;
  /** Called for every non-fatal condition. The caller decides what to persist. */
  onWarning?: (code: AgreementPdfWarning, detail: string) => void;
}

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 56;
const BODY_SIZE = 10;
const HEADING_SIZE = 12;
const LINE_H = 14;
const COLUMN = PAGE_W - MARGIN * 2;

const INK = rgb(0.05, 0.08, 0.16);
const MUTED = rgb(0.4, 0.4, 0.4);
const HAIRLINE = rgb(0.7, 0.7, 0.7);

/** Height the signature block needs so it is never orphaned or drawn off-page. */
const SIG_BLOCK_H = 110;

/**
 * Decode a signature supplied as a `data:` URL or as raw base64. Returns null when the input is
 * absent or not decodable — the caller treats null as "no drawn mark", never as an error.
 * Lifted verbatim in behaviour from finalize-agreement/index.ts:41-52.
 */
export function decodeSignatureImage(input: string | null | undefined): Uint8Array | null {
  if (!input) return null;
  const cleaned = String(input).replace(/^data:image\/\w+;base64,/, "").trim();
  if (!cleaned) return null;
  try {
    const bin = atob(cleaned);
    if (bin.length === 0) return null;
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * pdf-lib's StandardFonts encode WinAnsi (CP1252) only, and BOTH `drawText` and
 * `widthOfTextAtSize` throw on anything outside it. Everything CP1252 can carry is kept EXACTLY:
 * this renders a legal record, so an accepted \u201Cterm\u201D must not quietly become "term". Only the
 * genuinely unencodable (Cyrillic, CJK, emoji, \u20B9 \u20BD \u20A9) degrades to `?`, and the caller is told
 * through the `body_text_transcoded` warning so a lossy render is never mistaken for a faithful one.
 *
 * DIVERGES DELIBERATELY from `_shared/doc-render.ts:651`, which folds smart punctuation down to
 * ASCII. That is right for a generic document export and wrong for a signed agreement.
 *
 * The keep-set is asserted against pdf-lib itself by the \u00a732 smoke's two-way codepoint scan: every
 * codepoint this function KEEPS must be measurable by pdf-lib, and every codepoint it REPLACES must
 * genuinely be unmeasurable. That scan is what stops the set drifting out of sync with the library.
 */
export function sanitizeWinAnsi(text: string): string {
  return String(text)
    .replace(/\r\n?/g, "\n")
    // Three near-miss glyphs WinAnsi cannot encode but which have an exact CP1252 twin. Mapping
    // them preserves the author's intent; letting them fall through would print `?` in a contract.
    .replace(/\u201B/g, "\u2019")
    .replace(/\u201F/g, "\u201D")
    .replace(/\u2015/g, "\u2014")
    // Tab, newline, printable ASCII, the Latin-1 supplement, and the CP1252 "specials" that Unicode
    // places above \xFF: OE/oe, S/s-caron, Y-diaeresis, Z/z-caron, florin, circumflex, small tilde,
    // en/em dash, the curly quotes, dagger, double dagger, bullet, ellipsis, per-mille, single
    // guillemets, euro, trademark. Everything else is genuinely unencodable.
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFFŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/g, "?");
}

/**
 * Wrap one logical line to a width budget, HARD-BREAKING any single token wider than the budget so
 * it can never run off the page as a clipped line reported as success. Mirrors the proven
  * `wrapToWidth` in `_shared/doc-render.ts:538`. Exported so the §32 smoke can assert the
 * hard-break invariant directly instead of inferring it from a rendered page.
 */
export function wrapLine(text: string, measure: (s: string) => number, avail: number): string[] {
  const out: string[] = [];
  const words = String(text).split(/\s+/).filter((w) => w.length > 0);
  let line = "";
  const flush = () => { if (line) { out.push(line); line = ""; } };
  for (const w of words) {
    if (measure(w) > avail) {              // the token ALONE overflows -> flush, then hard-break it
      flush();
      let cur = "";
      for (const ch of w) {
        if (cur && measure(cur + ch) > avail) { out.push(cur); cur = ch; }
        else cur += ch;
      }
      line = cur;                          // keep the tail so a following short word packs onto it
      continue;
    }
    const trial = line ? `${line} ${w}` : w;
    if (measure(trial) > avail && line) { out.push(line); line = w; }
    else line = trial;
  }
  flush();
  return out;
}

/**
 * Render the signed agreement. Throws on any condition that would produce a document that does not
 * faithfully evidence the signature — the caller is expected to let that throw refuse the signing
 * rather than persist a `completed` row with no PDF behind it (§13/§32).
 */
export async function buildAgreementPdf(input: BuildAgreementPdfInput): Promise<Uint8Array> {
  const warn = input.onWarning ?? (() => {});

  const rawBody = String(input.bodyText ?? "");
  const body = sanitizeWinAnsi(rawBody);
  if (body !== rawBody) {
    warn("body_text_transcoded", "characters outside WinAnsi were normalised or replaced");
  }
  const title = sanitizeWinAnsi(String(input.documentTitle ?? "")).replace(/\n/g, " ").trim();
  const typedName = sanitizeWinAnsi(String(input.typedName ?? "")).replace(/\n/g, " ").trim();
  const signedAt = sanitizeWinAnsi(String(input.signedAtIso ?? "")).replace(/\n/g, " ").trim();

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  /** Start a new page when `need` points below the bottom margin. */
  const ensure = (need: number) => {
    if (y - need < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  // ── Title ────────────────────────────────────────────────────────────────────────────────────
  if (title) {
    for (const line of wrapLine(title, (s) => fontBold.widthOfTextAtSize(s, 16), COLUMN)) {
      ensure(20);
      page.drawText(line, { x: MARGIN, y, size: 16, font: fontBold, color: INK });
      y -= 20;
    }
    y -= 6;
    ensure(12);
    page.drawLine({
      start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5, color: HAIRLINE,
    });
    y -= 20;
  }

  // ── Body ─────────────────────────────────────────────────────────────────────────────────────
  for (const rawLine of body.split("\n")) {
    if (rawLine.trim() === "") { y -= LINE_H; continue; }   // preserve paragraph spacing
    const isHeading = /^#{1,3}\s/.test(rawLine);
    const clean = rawLine.replace(/^#{1,3}\s/, "");
    const size = isHeading ? HEADING_SIZE : BODY_SIZE;
    const face = isHeading ? fontBold : font;
    const step = isHeading ? LINE_H + 2 : LINE_H;
    for (const line of wrapLine(clean, (s) => face.widthOfTextAtSize(s, size), COLUMN)) {
      ensure(step);
      page.drawText(line, { x: MARGIN, y, size, font: face, color: INK });
      y -= step;
    }
  }

  // ── Signature block — never orphaned, never drawn below the page ─────────────────────────────
  // Reserve the whole block (rule + labels + the image's real height) up front, so the mark that
  // evidences the agreement can never land off-page (fix 3 in the header).
  let sigH = 0;
  let embedded: { image: EmbeddedImage; w: number; h: number } | null = null;
  if (input.signatureImage && input.signatureImage.byteLength > 0) {
    const bytes = input.signatureImage;
    try {
      let img: EmbeddedImage;
      try {
        img = await pdf.embedPng(bytes);
      } catch {
        // A signature-pad canvas exports PNG; a photographed wet-ink signature does not.
        img = await pdf.embedJpg(bytes);
      }
      const w = 220;
      const h = w * (img.height / (img.width || 1));
      embedded = { image: img, w, h };
      sigH = h + 8;
    } catch (e) {
      // NON-FATAL by design: the typed name + consents are the operative act. But the caller MUST
      // learn, so it never records a drawn mark that is not in the document (§13).
      warn("signature_image_embed_failed", String(e));
    }
  }

  ensure(SIG_BLOCK_H + sigH);
  y -= 24;
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5, color: HAIRLINE,
  });
  y -= 22;
  page.drawText("Signed by:", { x: MARGIN, y, size: 11, font: fontBold, color: INK });
  y -= 18;
  page.drawText(typedName, { x: MARGIN, y, size: 14, font: fontBold, color: INK });
  y -= 18;
  page.drawText(`Signed at: ${signedAt}`, { x: MARGIN, y, size: 9, font, color: MUTED });

  if (embedded) {
    y -= embedded.h + 8;
    page.drawImage(embedded.image, { x: MARGIN, y, width: embedded.w, height: embedded.h });
  }

  const bytes = await pdf.save();
  if (!bytes || bytes.byteLength === 0) {
    // Defensive: a zero-byte save would upload "successfully" and evidence nothing.
    throw new Error("agreement-pdf: pdf.save() produced zero bytes");
  }
  return bytes;
}
