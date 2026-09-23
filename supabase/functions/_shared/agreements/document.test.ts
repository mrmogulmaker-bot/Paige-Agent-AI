// deno test --allow-import --node-modules-dir=none supabase/functions/_shared/agreements/document.test.ts
//
// --node-modules-dir=none matters: with a package.json present, Deno otherwise builds its own npm
// layout inside node_modules and shadows the npm-installed vite, which breaks `npm run test`.
//
// §32: a green typecheck proves this file parses. It proves nothing about whether pdf-lib can load
// the bytes we produced, embed a font, take a PNG, append a page and save — which is exactly the
// class of failure that compiles clean and then blanks at runtime. These tests RUN that path.
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  assertNamesAreStampable,
  assertUploadedPdfIsSealable,
  hashDocument,
  renderPresentedPdf,
  sealAgreementPdf,
  UnsealablePdfError,
  UnrenderableDocumentError,
  UnrenderableNameError,
  wouldLoseCharacters,
} from "./document.ts";
import { sanitizeWinAnsi } from "../doc-render.ts";

const PDF_MAGIC = "%PDF";

function head(bytes: Uint8Array, n = 4): string {
  return new TextDecoder().decode(bytes.slice(0, n));
}

// A real 1×1 PNG. Signature images arrive from a browser canvas; this is the smallest valid one.
const ONE_PX_PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

const BODY = [
  "# Services Agreement",
  "",
  "This agreement is between the parties named below.",
  "",
  "1. The provider will deliver the services described in the attached schedule.",
  "2. Either party may end this agreement with thirty days written notice.",
  "",
  "Signed by the parties as of the date last written below.",
].join("\n");

function party(over: Record<string, unknown> = {}) {
  return {
    fullName: "Jordan Avery",
    email: "jordan@example.com",
    role: "counterparty",
    signingOrder: 1,
    status: "signed",
    typedName: "Jordan Avery",
    signedAt: "2026-06-01T12:00:00.000Z",
    consentAt: "2026-06-01T11:59:40.000Z",
    consentSlug: "esign-consent",
    consentVersion: 1,
    signingIp: "203.0.113.7",
    signingUserAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    signatureImagePng: null as Uint8Array | null,
    ...over,
  };
}

const EVENTS = [
  { eventType: "created", at: "2026-06-01T10:00:00.000Z", actorKind: "owner", actorLabel: "owner@acme.test", ip: null },
  { eventType: "sent", at: "2026-06-01T10:05:00.000Z", actorKind: "owner", actorLabel: "owner@acme.test", ip: null },
  { eventType: "viewed", at: "2026-06-01T11:58:00.000Z", actorKind: "signer", actorLabel: "jordan@example.com", ip: "203.0.113.7" },
  { eventType: "consented", at: "2026-06-01T11:59:40.000Z", actorKind: "signer", actorLabel: "jordan@example.com", ip: "203.0.113.7" },
  { eventType: "signed", at: "2026-06-01T12:00:00.000Z", actorKind: "signer", actorLabel: "jordan@example.com", ip: "203.0.113.7" },
];

function sealInput(over: Record<string, unknown> = {}) {
  return {
    presentedBytes: new Uint8Array(),
    presentedSha256: "0".repeat(64),
    presentedKind: "file" as const,
    agreementTitle: "Services Agreement",
    agreementId: "6f1c2a1e-0000-4000-8000-000000000001",
    tenantName: "Acme Consulting",
    parties: [party()],
    events: EVENTS,
    sealedAtIso: "2026-06-01T12:00:01.000Z",
    ...over,
  };
}

Deno.test("the presented document actually renders to real PDF bytes", async () => {
  const bytes = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  assert(bytes.length > 500, `suspiciously small PDF: ${bytes.length} bytes`);
  assertEquals(head(bytes), PDF_MAGIC);
});

Deno.test("hashing is stable over the same array and is 64 hex characters", async () => {
  const bytes = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  const a = await hashDocument(bytes);
  const b = await hashDocument(bytes);
  assertEquals(a, b);
  assert(/^[0-9a-f]{64}$/.test(a), a);
});

Deno.test("re-rendering does NOT reproduce the bytes — which is why the sealed copy is stored, never re-made", async () => {
  // THIS TEST PREVIOUSLY ASSERTED THE OPPOSITE, and it was wrong. It claimed rendering was
  // byte-deterministic "measured, not assumed", on the strength of three runs that happened to
  // agree — and it contradicted this module's own header, which says pdf-lib stamps /CreationDate
  // and /ModDate so "two renders of byte-identical content produce different bytes".
  //
  // The header is right. Measured directly: two renders inside the SAME clock second are byte
  // identical, and two renders that straddle a second boundary are NOT. The old assertion passed
  // only because both of its renders landed in the same second on a fast machine — a race it won
  // locally and lost on a slower CI runner, on both this branch and main.
  //
  // This matters far beyond a flaky test. "Re-rendering reproduces the bytes" would license
  // re-making the document on demand and trusting the stored hash — and the hash would then
  // describe an artifact that no longer exists. The RENDER ONCE, NEVER RE-RENDER rule at the top
  // of this file is load-bearing precisely because of what is asserted below.
  const first = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  const immediate = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  // Within one clock tick the bytes DO agree — the timestamp is the only varying input.
  assertEquals(await hashDocument(first), await hashDocument(immediate));

  // Across a tick they do not. 1.1s is measured to be sufficient; if that ever stops being true
  // this fails loudly and the next person re-measures rather than inheriting a false claim.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const later = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  assertNotEquals(await hashDocument(first), await hashDocument(later));
});

Deno.test("different content hashes differently — the digest tracks the document", async () => {
  const a = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  const b = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY + "\n\n9. An added clause." });
  assertNotEquals(await hashDocument(a), await hashDocument(b));
});

// WHY WE STILL RENDER ONCE AND STORE THE BYTES, despite that determinism.
// Determinism today is a property of pdf-lib 1.17.1 plus this exact renderer plus these fonts. A
// library bump, a font substitution or a tweak to doc-render's layout would change the output and
// every historical hash would stop verifying at once — silently, and years after the signature. The
// integrity claim must not depend on our ability to reproduce a render in 2031. So the bytes shown
// to the signer are uploaded once and served from storage forever after, and the determinism above
// is a convenience we do not build on.

Deno.test("sealing loads the presented bytes and returns a larger, still-valid PDF", async () => {
  const presented = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  const presentedSha256 = await hashDocument(presented);
  const sealed = await sealAgreementPdf(sealInput({ presentedBytes: presented, presentedSha256 }));

  assertEquals(head(sealed), PDF_MAGIC);
  assert(sealed.length > presented.length, "the seal adds signatures and a certificate; it cannot shrink");
  assertNotEquals(await hashDocument(sealed), presentedSha256, "sealed and presented are different artifacts");
});

Deno.test("sealing does not mutate the presented array it was handed", async () => {
  const presented = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  const before = await hashDocument(presented);
  await sealAgreementPdf(sealInput({ presentedBytes: presented, presentedSha256: before }));
  assertEquals(await hashDocument(presented), before, "the frozen document must survive its own sealing");
});

Deno.test("a drawn signature image embeds without taking down the seal", async () => {
  const presented = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  const sealed = await sealAgreementPdf(sealInput({
    presentedBytes: presented,
    presentedSha256: await hashDocument(presented),
    parties: [party({ signatureImagePng: ONE_PX_PNG })],
  }));
  assertEquals(head(sealed), PDF_MAGIC);
});

Deno.test("a CORRUPT signature image degrades to the typed signature instead of losing the record", async () => {
  const presented = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  const sealed = await sealAgreementPdf(sealInput({
    presentedBytes: presented,
    presentedSha256: await hashDocument(presented),
    parties: [party({ signatureImagePng: new Uint8Array([1, 2, 3, 4, 5]) })],
  }));
  assertEquals(head(sealed), PDF_MAGIC, "a bad PNG must never cost us the sealed agreement");
});

Deno.test("A NON-LATIN SIGNER NAME IS REFUSED, NOT SILENTLY STAMPED AS '?'", async () => {
  // This test previously asserted only that sealing did not CRASH — and it passed, while the sealed
  // certificate recorded the signer as `?????? ??????`. A legal record that is quietly wrong about
  // who signed it is worse than one that fails loudly, so the engine now refuses.
  const presented = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  await assertRejects(
    () => sealAgreementPdf(sealInput({
      presentedBytes: presented,
      presentedSha256: "0".repeat(64),
      parties: [party({ fullName: "Дмитрий Иванов", typedName: "Дмитрий Иванов" })],
    })),
    UnrenderableNameError,
  );
});

Deno.test("the unrenderable-name check names the offender and passes clean Latin text", () => {
  assert(wouldLoseCharacters("Дмитрий"), "Cyrillic is not WinAnsi-encodable");
  assert(wouldLoseCharacters("イワノフ"), "Japanese is not WinAnsi-encodable");
  assert(!wouldLoseCharacters("Jordan Avery"), "plain Latin must pass");
  assert(!wouldLoseCharacters("Zoë Ravensbourne-O'Neill"), "Latin-1 accents and punctuation must pass");
  assert(!wouldLoseCharacters("Who? Me?"), "a name that already contains ? is not a loss");

  try {
    assertNamesAreStampable(["Jordan Avery", "Дмитрий Иванов", "Sam Okafor"]);
    throw new Error("expected a refusal");
  } catch (e) {
    assert(e instanceof UnrenderableNameError);
    assertEquals(e.names, ["Дмитрий Иванов"], "it names exactly the offender, not the whole party list");
  }
});

Deno.test("a long event history and several parties still seal", async () => {
  const presented = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  const many = Array.from({ length: 60 }, (_, i) => ({
    eventType: "viewed",
    at: `2026-06-01T${String(10 + (i % 12)).padStart(2, "0")}:00:00.000Z`,
    actorKind: "signer",
    actorLabel: `person${i}@example.com`,
    ip: "203.0.113.7",
  }));
  const sealed = await sealAgreementPdf(sealInput({
    presentedBytes: presented,
    presentedSha256: await hashDocument(presented),
    parties: [party(), party({ fullName: "Sam Okafor", email: "sam@example.com", signingOrder: 2 })],
    events: many,
  }));
  assertEquals(head(sealed), PDF_MAGIC);
});

// ── The document's own text, not just a signer's name ────────────────────────────────────────────
// The review caught the asymmetry: the engine refused a name it could not stamp and silently
// replaced the entire contract text with question marks. `renderPresentedPdf`'s docstring claimed a
// refusal it did not perform, which is worse than no docstring — the next reader trusts it.
Deno.test("a body the exporter cannot reproduce is REFUSED, not silently mangled", async () => {
  await assertRejects(
    () => renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: "Платёжные условия: 50%." }),
    UnrenderableDocumentError,
  );
});

Deno.test("a title the exporter cannot reproduce is refused too", async () => {
  await assertRejects(
    () => renderPresentedPdf({ title: "契約書", bodyMarkdown: BODY }),
    UnrenderableDocumentError,
  );
});

Deno.test("an ordinary Latin document still renders", async () => {
  const bytes = await renderPresentedPdf({ title: "Services Agreement — Q3", bodyMarkdown: BODY });
  assert(bytes.length > 500);
  assertEquals(head(bytes), PDF_MAGIC);
});

Deno.test("the certificate names WHICH medium the frozen hash covers", async () => {
  // Two freeze paths hash different things. A reader re-computing the digest against the wrong
  // medium concludes the document was altered, so the page has to say which one it is.
  const presented = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  const asFile = await sealAgreementPdf(sealInput({ presentedBytes: presented, presentedKind: "file" as const }));
  const asText = await sealAgreementPdf(sealInput({ presentedBytes: presented, presentedKind: "text" as const }));
  // pdf-lib writes text as glyph runs, so assert on the artifacts differing rather than on a
  // substring: identical inputs but for the label must not produce identical bytes.
  assertNotEquals(await hashDocument(asFile), await hashDocument(asText));
});

/**
 * RENDER WHAT YOU VALIDATED — the name on the signature block.
 *
 * `normaliseFormatting` used to be private to this module and was reached only from
 * `wouldLoseCharacters`, i.e. from the VALIDATION. The RENDER called `sanitizeWinAnsi` on the raw
 * original. Every codepoint below is handled by the former and absent from the latter's allow-list,
 * so a name carrying one PASSED the check at send and was then stamped into the executed PDF as
 * `?` — a legally executed document asserting that someone whose name is not the signer's signed
 * it. These characters arrive from ordinary copy-paste (a narrow no-break space out of a word
 * processor, a zero-width joiner out of a web page), so this was not an exotic path.
 *
 * The normalisation now lives inside `sanitizeWinAnsi`, which means the validated string and the
 * rendered string are the same string by construction. These tests hold that property down.
 */
Deno.test("a name that passes validation renders faithfully — no `?` in the signature block", () => {
  const divergent: Array<[string, string]> = [
    ["U+202F narrow no-break space", " "],
    ["U+2007 figure space", " "],
    ["U+200B zero-width space", "​"],
    ["U+200C zero-width non-joiner", "‌"],
    ["U+200D zero-width joiner", "‍"],
    ["U+2060 word joiner", "⁠"],
    ["U+FEFF byte-order mark", "﻿"],
    ["CR from a Windows paste", "\r"],
  ];
  for (const [label, ch] of divergent) {
    const name = `Antonia${ch}Daniels`;
    // The validation accepts it — it always did, which is why the defect was silent.
    assertEquals(wouldLoseCharacters(name), false, `${label}: validation should accept`);
    assertNamesAreStampable([name]);
    // ...and the render must now agree rather than substituting `?`.
    assert(
      !sanitizeWinAnsi(name).includes("?"),
      `${label}: rendered as "${sanitizeWinAnsi(name)}" — the PDF would carry a name that is not the signer's`,
    );
  }
});

Deno.test("a name the exporter genuinely cannot stamp is still refused at send", () => {
  for (const name of ["Пётр Ильич", "山田太郎", "محمد عبد", "Dan 🎉 Smith"]) {
    assertEquals(wouldLoseCharacters(name), true, `${name} should still be refused`);
    assertThrows(() => assertNamesAreStampable([name]), UnrenderableNameError);
  }
});

Deno.test("ordinary Latin names are stamped verbatim", () => {
  for (const name of ["Antonio Daniel", "Zoë Müller", "Jean-Luc O'Brien", "José Álvarez"]) {
    assertEquals(sanitizeWinAnsi(name), name);
    assertEquals(wouldLoseCharacters(name), false);
  }
});

// ── An uploaded file is opened by the SEAL'S OWN parser at send, not sniffed ────────────────────
//
// The defect these cover: `agreement-send` used to accept any upload beginning `%PDF-`. The seal
// then calls `PDFDocument.load`, which rejects a truncated, corrupt or password-protected file —
// but by then the counterparty has signed and the send has frozen the document under
// `pa_sent_is_frozen_ck`, both one-way. The agreement would be permanently signed and permanently
// unable to complete. These assertions exist so that stays fixed: a claim the build checks rather
// than a sentence in a comment.

Deno.test("a file that only STARTS like a PDF is refused, not accepted on its magic bytes", async () => {
  const impostors: Array<[string, Uint8Array]> = [
    // pdf-lib PARSES this one — a bare header is a valid zero-page document — so the page-count
    // check is what refuses it. Measured; it is why the assertion is not just "does it load".
    ["a bare header with no pages", new TextEncoder().encode("%PDF-1.7")],
    ["magic bytes then prose", new TextEncoder().encode("%PDF-1.4\nthis is not actually a pdf at all")],
    ["a truncated document", new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n")],
  ];
  for (const [label, bytes] of impostors) {
    // It passes the cheap sniff that used to be the only gate...
    assertEquals(new TextDecoder("latin1").decode(bytes.slice(0, 5)), "%PDF-", `${label}: should pass the magic check`);
    // ...and the real parser refuses it, which is the point.
    await assertRejects(() => assertUploadedPdfIsSealable(bytes), UnsealablePdfError, undefined, label);
  }
});

Deno.test("a genuine PDF is accepted, and it is the same parser the seal will use", async () => {
  const real = await renderPresentedPdf({
    title: "Services Agreement",
    bodyMarkdown: "The parties agree to the terms set out below.",
  });
  assertEquals(new TextDecoder("latin1").decode(real.slice(0, 5)), "%PDF-");
  // No throw: if this parses here it parses at seal, because the call is byte-for-byte the same.
  await assertUploadedPdfIsSealable(real);
});

Deno.test("a page tree whose declared /Count disagrees with its real pages is refused", async () => {
  // THE CASE THAT DEFEATED THE PREVIOUS VERSION OF THIS CHECK. `getPageCount()` counts real page
  // leaves by traversal; `addPage()` gates on the DECLARED `/Count`. A file where the two disagree
  // passed a count-based check and threw at the seal — after the signature, after the freeze.
  //
  // Built by pdf-lib and then patched in place, length-preserving, so every xref offset stays
  // valid: this is a genuine PDF that miscounts, not a corrupt one.
  const { PDFDocument } = await import("npm:pdf-lib@1.17.1");
  const src = await PDFDocument.create();
  src.addPage([612, 792]);
  src.addPage([612, 792]);
  // `useObjectStreams: false` keeps the page tree in plain text so it can be patched; with the
  // default compressed layout the dictionary is inside an object stream and `/Count` is not
  // literal. The defect being reproduced is the same either way.
  const good = await src.save({ useObjectStreams: false });

  const text = new TextDecoder("latin1").decode(good);
  const idx = text.indexOf("/Count 2");
  assert(idx > 0, "expected a declared /Count 2 to patch");
  // Same byte length, so no offset in the xref table moves.
  const patched = new Uint8Array(good);
  patched[idx + "/Count ".length] = "1".charCodeAt(0);

  // It still loads, and still reports two real pages...
  const reloaded = await PDFDocument.load(patched);
  assertEquals(reloaded.getPageCount(), 2, "the real leaves are still there");
  // ...and must be refused anyway, because the seal's addPage will not survive it.
  await assertRejects(() => assertUploadedPdfIsSealable(patched), UnsealablePdfError);
});
