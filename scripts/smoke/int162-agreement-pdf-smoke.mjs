// INT-162 — headless §32 smoke for `_shared/agreement-pdf.ts`.
//
// WHY THIS EXISTS. A PDF pipeline is the textbook "compiles clean, crashes at runtime" class §32
// was written for, and this repo already paid for it once: `finalize-agreement` wraps its whole
// PDF build in a try/catch that swallows the throw and STILL returns ok with a NULL path
// (index.ts:193-207), so for months a bad glyph or a missing bucket looked like a success. The
// native signing path (`sign-agreement`) FAILS LOUDLY instead — which means every latent throw in
// the renderer stops being cosmetic and starts refusing real signings. So the renderer gets RUN
// here, in Node, against real inputs, before it ships.
//
// Run:  node scripts/smoke/int162-agreement-pdf-smoke.mjs
// Exit: 0 = the renderer runs clean on every case.  1 = it would refuse or corrupt a real signing.
//
// HONEST SCOPE (§13). This proves the RENDERER runs and emits a structurally valid PDF. It does
// NOT prove the edge function's storage upload, DB update, or token gate — those need a deployed
// function and a real bucket, and are owed to a live run. Nothing here mocks pdf-lib: the real
// library renders every byte asserted below.
//
// pdf-lib is a Deno-side dependency (imported by URL), not a package.json dependency, so Node
// cannot resolve it on its own. This script resolves it in three steps — an ordinary resolve
// first, so that adding `pdf-lib@1.17.1` to devDependencies makes the rest of this vanish — and
// then maps the module's `https://esm.sh/pdf-lib@1.17.1` specifier onto it with a loader hook.
// Any OTHER remote specifier is a hard error, never a permissive stub (§13).

import { register, createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const VENDOR = path.join(REPO, "node_modules", ".cache", "int162-smoke");
const PDF_LIB_SPEC = "pdf-lib@1.17.1";

// ── resolve pdf-lib ──────────────────────────────────────────────────────────────────────────
function resolvePdfLib() {
  const req = createRequire(path.join(REPO, "package.json"));
  try { return req.resolve("pdf-lib"); } catch { /* not a project dependency — expected today */ }

  const vendored = path.join(VENDOR, "node_modules", "pdf-lib");
  if (!existsSync(vendored)) {
    console.log(`  · pdf-lib not resolvable; vendoring ${PDF_LIB_SPEC} into node_modules/.cache/int162-smoke …`);
    execFileSync("npm", ["install", "--no-save", "--no-package-lock", "--prefix", VENDOR, PDF_LIB_SPEC],
      { stdio: "inherit", cwd: REPO });
  }
  return createRequire(path.join(vendored, "package.json")).resolve("pdf-lib");
}

let pdfLibEntry;
try {
  pdfLibEntry = resolvePdfLib();
} catch (e) {
  console.error(`✗ could not obtain pdf-lib: ${e.message}`);
  console.error("  Add `pdf-lib@1.17.1` to devDependencies, or allow this script network access once.");
  process.exit(1);
}
const pdfLibUrl = pathToFileURL(pdfLibEntry).href;

register(
  "data:text/javascript," + encodeURIComponent(`
    let target;
    export async function initialize(d) { target = d.pdfLibUrl; }
    export async function resolve(spec, ctx, next) {
      if (/^(https:\\/\\/esm\\.sh\\/|npm:)pdf-lib@/.test(spec)) {
        return { url: target, shortCircuit: true, format: "commonjs" };
      }
      if (spec.startsWith("https://") || spec.startsWith("npm:")) {
        throw new Error("int162 smoke: unstubbed remote import " + spec + " — add it deliberately (§13).");
      }
      return next(spec, ctx);
    }
  `),
  { parentURL: import.meta.url, data: { pdfLibUrl } },
);

const MODULE = pathToFileURL(path.join(REPO, "supabase/functions/_shared/agreement-pdf.ts")).href;
const { buildAgreementPdf, decodeSignatureImage, sanitizeWinAnsi, wrapLine } = await import(MODULE);
const { PDFDocument, StandardFonts } = await import(pdfLibUrl);

// ── harness ──────────────────────────────────────────────────────────────────────────────────
let failures = 0;
const ok = (name, cond, detail = "") => {
  if (cond) console.log(`  ok   — ${name}`);
  else { failures++; console.error(`  FAIL — ${name}${detail ? ` :: ${detail}` : ""}`); }
};
async function mustNotThrow(name, fn) {
  try { return await fn(); }
  catch (e) { failures++; console.error(`  FAIL — ${name} THREW :: ${e && e.stack ? e.stack : e}`); return null; }
}

/** Every assertion a rendered agreement must satisfy to be worth persisting. */
async function assertRealPdf(label, bytes, { minPages = 1 } = {}) {
  ok(`${label}: returns a Uint8Array`, bytes instanceof Uint8Array, `got ${Object.prototype.toString.call(bytes)}`);
  if (!(bytes instanceof Uint8Array)) return;
  ok(`${label}: non-empty`, bytes.byteLength > 0, `${bytes.byteLength} bytes`);
  const magic = new TextDecoder().decode(bytes.slice(0, 5));
  ok(`${label}: starts with the %PDF magic`, magic === "%PDF-", `saw ${JSON.stringify(magic)}`);
  // Magic bytes alone would pass on a truncated file; re-parse to prove it is structurally a PDF.
  const reloaded = await mustNotThrow(`${label}: re-parses via PDFDocument.load`, () => PDFDocument.load(bytes));
  if (reloaded) {
    ok(`${label}: has >= ${minPages} page(s)`, reloaded.getPageCount() >= minPages, `${reloaded.getPageCount()} pages`);
  }
}

// ── a REAL PNG, encoded here rather than stubbed ─────────────────────────────────────────────
// A genuine 240x80 RGBA PNG with an ink stroke across it — the shape a signature-pad canvas
// exports. Built with real zlib + CRC32 so pdf-lib's PNG decoder does real work on real bytes.
function makeSignaturePng(w = 240, h = 80) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let yy = 0; yy < h; yy++) {
    const row = yy * (1 + w * 4);
    raw[row] = 0; // filter: none
    for (let xx = 0; xx < w; xx++) {
      const p = row + 1 + xx * 4;
      const curve = h / 2 + Math.sin((xx / w) * Math.PI * 3) * (h / 3);
      const onStroke = Math.abs(yy - curve) < 2.5;
      raw[p] = onStroke ? 12 : 255;
      raw[p + 1] = onStroke ? 18 : 255;
      raw[p + 2] = onStroke ? 40 : 255;
      raw[p + 3] = onStroke ? 255 : 0;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const SIGNATURE_DATA_URL = "data:image/png;base64," + makeSignaturePng().toString("base64");

// A real multi-paragraph agreement with headings — and the smart punctuation that real pasted
// contract text is full of, which is exactly what makes pdf-lib's WinAnsi fonts throw.
const AGREEMENT_BODY = `# Consulting Services Agreement

This Agreement is entered into between the Provider and the Client as of the date of signature
below. It sets out the scope of work, the fees, and the terms under which either party may end
the engagement.

## 1. Scope of work

The Provider will deliver the services described in the attached statement of work. Changes to
scope are agreed in writing before any additional work begins — neither party is obliged to
accept a change it has not approved.

## 2. Fees and payment

Fees are invoiced monthly in arrears and are due within fourteen (14) days of the invoice date.
The Client's obligations under this section survive termination of the Agreement.

## 3. Confidentiality

Each party will keep the other's confidential information confidential, and will not disclose it
to any third party except where disclosure is required by law.

### 3.1 Return of materials

On termination, each party returns or destroys the other's confidential information within
thirty (30) days.

## 4. Termination

Either party may terminate this Agreement on thirty (30) days' written notice. Termination does
not affect any right or obligation accrued before the termination date.`;

console.log("\nINT-162 · agreement-pdf renderer — §32 headless runtime smoke");
console.log(`pdf-lib: ${pdfLibEntry}\n`);

// ── 1. the real thing: multi-paragraph body + headings + a real drawn signature ───────────────
console.log("1. real agreement, real headings, real PNG signature");
{
  const warnings = [];
  const sig = decodeSignatureImage(SIGNATURE_DATA_URL);
  ok("data: URL decodes to signature bytes", sig instanceof Uint8Array && sig.byteLength > 200,
     `${sig ? sig.byteLength : "null"} bytes`);
  const bytes = await mustNotThrow("render", () => buildAgreementPdf({
    documentTitle: "Consulting Services Agreement — Meridian Studio",
    bodyText: AGREEMENT_BODY,
    typedName: "Dana Okonkwo",
    signatureImage: sig,
    signedAtIso: new Date().toISOString(),
    onWarning: (code, detail) => warnings.push([code, detail]),
  }));
  if (bytes) await assertRealPdf("multi-paragraph", bytes, { minPages: 2 });
  ok("the drawn signature embedded (no embed-failure warning)",
     !warnings.some(([c]) => c === "signature_image_embed_failed"), JSON.stringify(warnings));
  // A real agreement's punctuation is CP1252-encodable, so the accepted wording must survive
  // byte-for-byte. A transcode warning here would mean we silently altered a legal record (§13).
  ok("ordinary contract text renders with NO transcoding (exact accepted wording)",
     !warnings.some(([c]) => c === "body_text_transcoded"), JSON.stringify(warnings));
  ok("sanitiser is the identity on the real agreement body",
     sanitizeWinAnsi(AGREEMENT_BODY) === AGREEMENT_BODY);
}

// ── 2. the wrap stressor: a long unbroken token ──────────────────────────────────────────────
console.log("\n2. long unbroken string (hard-break stressor)");
{
  const monster = "X".repeat(180) + "-" + "9".repeat(180);           // no whitespace at all
  const url = "https://portal.example.com/agreements/" + "a1b2c3d4".repeat(24) + "?ref=signature";
  const bytes = await mustNotThrow("render", () => buildAgreementPdf({
    documentTitle: "Unbroken-token stress " + "T".repeat(120),       // the TITLE overflows too
    bodyText: `## Reference\n\n${monster}\n\nSee ${url} for the full schedule.\n\n${monster}`,
    typedName: "Dana Okonkwo",
    signatureImage: decodeSignatureImage(SIGNATURE_DATA_URL),
    signedAtIso: new Date().toISOString(),
  }));
  if (bytes) await assertRealPdf("long-token", bytes);

  // Assert the invariant directly, not by inference: NO produced line may exceed the column.
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  const COLUMN = 612 - 56 * 2;
  const measure = (s) => font.widthOfTextAtSize(s, 10);
  const lines = wrapLine(`${monster} ${url}`, measure, COLUMN);
  ok("hard-break produced lines", lines.length > 1, `${lines.length} lines`);
  const widest = Math.max(...lines.map(measure));
  ok("no wrapped line exceeds the text column (would run off the page)",
     widest <= COLUMN, `widest ${widest.toFixed(1)}pt vs column ${COLUMN}pt`);
  ok("hard-break is lossless (every character survives)",
     lines.join("").replace(/\s+/g, "") === `${monster}${url}`.replace(/\s+/g, ""));
}

// ── 3. the glyph that would refuse a real signing ────────────────────────────────────────────
console.log("\n3. non-WinAnsi glyphs (the case that THROWS unsanitised)");
{
  const hostile = "Fee: €2,500 — see § 4. “Quoted” ‘term’…\n\n" +
                  "Client name: Михаил — 東京 — 🚀 🎉";
  const warnings = [];
  const bytes = await mustNotThrow("render", () => buildAgreementPdf({
    documentTitle: "Agreement — “Meridian” 🚀",
    bodyText: hostile,
    typedName: "Mihaïl Švejk",                    // Latin-1 + CP1252 special, both encodable
    signatureImage: null,
    signedAtIso: new Date().toISOString(),
    onWarning: (code, detail) => warnings.push([code, detail]),
  }));
  if (bytes) await assertRealPdf("hostile-glyphs", bytes);
  ok("caller is warned the body was transcoded",
     warnings.some(([c]) => c === "body_text_transcoded"), JSON.stringify(warnings.map(([c]) => c)));
  const cp1252 = "€2,500 “x” — it’s fine…";
  ok("CP1252 currency + curly punctuation survive VERBATIM (not folded to ASCII, not blanked)",
     sanitizeWinAnsi(cp1252) === cp1252, JSON.stringify(sanitizeWinAnsi(cp1252)));
  ok("genuinely unencodable scripts degrade to `?` rather than throwing",
     sanitizeWinAnsi("東京") === "??", JSON.stringify(sanitizeWinAnsi("東京")));
}

// ── 3b. two-way codepoint scan: the keep-set must match pdf-lib EXACTLY ──────────────────
// The sanitiser's character class is a hand-written CLAIM about what pdf-lib can encode. This
// proves it against the library instead of trusting it: nothing it KEEPS may be unmeasurable
// (that is a latent runtime throw waiting for the wrong contract), and nothing it REPLACES may in
// fact be measurable (that is a needless `?` in someone's legal record). Both directions, every
// BMP codepoint. This is what stops the keep-set drifting out of sync with the library.
console.log("\n3b. keep-set vs pdf-lib — two-way codepoint scan");
{
  const scanFont = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  const encodable = (ch) => { try { scanFont.widthOfTextAtSize(ch, 10); return true; } catch { return false; } };
  const NEAR_MISS = ["‛", "‟", "―"];   // deliberately mapped to their CP1252 twin, not lost
  const keptButUnencodable = [];
  const replacedButEncodable = [];
  for (let cp = 0x20; cp <= 0xffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;        // lone surrogates are not characters
    const ch = String.fromCodePoint(cp);
    const kept = sanitizeWinAnsi(ch) === ch;
    const enc = encodable(ch);
    if (kept && !enc) keptButUnencodable.push(cp);
    if (!kept && enc && ch !== "?" && !NEAR_MISS.includes(ch)) replacedButEncodable.push(cp);
  }
  const hex = (a) => a.slice(0, 12).map((c) => "U+" + c.toString(16).toUpperCase().padStart(4, "0")).join(" ");
  ok("every codepoint the sanitiser KEEPS is encodable by pdf-lib (no latent runtime throw)",
     keptButUnencodable.length === 0, `${keptButUnencodable.length} leak(s): ${hex(keptButUnencodable)}`);
  ok("every codepoint the sanitiser REPLACES is genuinely unencodable (no needless `?`)",
     replacedButEncodable.length === 0, `${replacedButEncodable.length} over-replacement(s): ${hex(replacedButEncodable)}`);
  ok("the near-miss glyphs map to their CP1252 twin rather than to `?`",
     sanitizeWinAnsi("‛‟―") === "’”—", JSON.stringify(sanitizeWinAnsi("‛‟―")));
}

// ── 4. typed name only — no drawn mark ───────────────────────────────────────────────────────
console.log("\n4. typed name only (no drawn signature)");
{
  const bytes = await mustNotThrow("render", () => buildAgreementPdf({
    documentTitle: "Mutual Non-Disclosure Agreement",
    bodyText: "The parties agree to keep confidential information confidential.",
    typedName: "Dana Okonkwo",
    signatureImage: null,
    signedAtIso: new Date().toISOString(),
  }));
  if (bytes) await assertRealPdf("typed-only", bytes);
  ok("decodeSignatureImage(null/empty) is null, not a throw",
     decodeSignatureImage(null) === null && decodeSignatureImage("") === null &&
     decodeSignatureImage("data:image/png;base64,") === null);
}

// ── 5. a corrupt signature must not lose the signing — but must be REPORTED ───────────────────
console.log("\n5. corrupt signature bytes (non-fatal, but reported)");
{
  const warnings = [];
  const junk = new Uint8Array(512);
  for (let i = 0; i < junk.length; i++) junk[i] = (i * 37) % 251;   // neither PNG nor JPEG
  const bytes = await mustNotThrow("render", () => buildAgreementPdf({
    documentTitle: "Service Agreement",
    bodyText: "Body text.",
    typedName: "Dana Okonkwo",
    signatureImage: junk,
    signedAtIso: new Date().toISOString(),
    onWarning: (code, detail) => warnings.push([code, detail]),
  }));
  if (bytes) await assertRealPdf("corrupt-signature", bytes);
  ok("a corrupt raster does NOT lose the signing", bytes instanceof Uint8Array);
  ok("…but the caller IS told, so it never records a drawn mark that is not there",
     warnings.some(([c]) => c === "signature_image_embed_failed"), JSON.stringify(warnings.map(([c]) => c)));
}

// ── 6. the signature must survive a body that ends exactly at the page foot ──────────────────
console.log("\n6. body ending near the page foot (signature-block page-break guard)");
{
  // Sweep body lengths across the page boundary; the block must never be drawn off-page. A
  // negative y is invisible ink in the one document whose entire job is to evidence a signature.
  let rendered = 0;
  for (let n = 46; n <= 56; n++) {
    const body = Array.from({ length: n }, (_, i) => `Clause ${i + 1}. The parties agree to the terms.`).join("\n");
    const bytes = await mustNotThrow(`render at ${n} lines`, () => buildAgreementPdf({
      documentTitle: "Page-boundary sweep",
      bodyText: body,
      typedName: "Dana Okonkwo",
      signatureImage: decodeSignatureImage(SIGNATURE_DATA_URL),
      signedAtIso: new Date().toISOString(),
    }));
    if (bytes instanceof Uint8Array && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") rendered++;
  }
  ok("every body length across the page boundary renders a valid PDF", rendered === 11, `${rendered}/11`);
}

// ── 7. degenerate input must not produce a zero-byte "success" ────────────────────────────────
console.log("\n7. degenerate input");
{
  const bytes = await mustNotThrow("empty body renders a signature-only page", () => buildAgreementPdf({
    documentTitle: "",
    bodyText: "",
    typedName: "Dana Okonkwo",
    signatureImage: null,
    signedAtIso: new Date().toISOString(),
  }));
  if (bytes) await assertRealPdf("empty-body", bytes);
}

// ── verdict ──────────────────────────────────────────────────────────────────────────────────
console.log("");
if (failures) {
  console.error(`✗ ${failures} check(s) failed — the renderer would refuse or corrupt a real signing.`);
  process.exit(1);
}
console.log("✓✓ agreement-pdf renderer runs clean on every case — real pdf-lib, real PNG, real bytes.");
process.exit(0);
