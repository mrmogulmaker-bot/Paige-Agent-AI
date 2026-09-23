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
  hashDocument,
  renderPresentedPdf,
  sealAgreementPdf,
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

Deno.test("rendering is byte-deterministic TODAY — measured, not assumed", async () => {
  // This started life as the opposite assertion. The design analysis said pdf-lib stamps a varying
  // /CreationDate, so two renders of identical content would differ. Run against this code path, it
  // is false: doc-render sets no document metadata, and three separate processes produced the same
  // digest. Recorded here rather than quietly dropped, because the next person will read the same
  // analysis and reach the same wrong conclusion.
  const first = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  const second = await renderPresentedPdf({ title: "Services Agreement", bodyMarkdown: BODY });
  assertEquals(await hashDocument(first), await hashDocument(second));
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
