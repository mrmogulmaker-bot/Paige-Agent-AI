// Headless §32 smoke for _shared/attachment-extract.ts (#176 — Conversations attachments →
// draft-with-Paige). Run via: node --experimental-strip-types scripts/attachment-extract-smoke.mts
//
// A green `tsc`/`vite` proves the code TYPE-CHECKS; it proves NOTHING about whether the
// extraction wiring actually runs. This exercises the REAL shipped helpers against tiny
// fixtures and asserts they return non-empty text without throwing, and that the multimodal
// path builds the correct `data:` URI content-part shape.
//
// HONEST (§13): the MODEL CALL is mocked. This asserts the WIRING/shape (base64 → data URI →
// injected model seam → returned text), NOT a live gateway extraction. The real end-to-end
// (a live PDF read by gemini) is owed to a deployed/live run — it cannot be driven headless.
import {
  bytesToBase64,
  extractAttachmentText,
  ATTACHMENT_SOURCE_INSTRUCTION,
  type ModelInvoker,
} from "../supabase/functions/_shared/attachment-extract.ts";

let failures = 0;
function assert(cond: unknown, msg: string) {
  if (cond) { console.log(`  ok   — ${msg}`); }
  else { console.error(`  FAIL — ${msg}`); failures++; }
}

// ── 1. Text-family path decodes directly (no model round-trip). ──────────────────────
{
  const fixture = "INVOICE #4412\nAmount due: $1,250.00\nDue: 2026-09-01";
  const base64 = Buffer.from(fixture, "utf-8").toString("base64");
  let modelCalled = false;
  const mock: ModelInvoker = async () => { modelCalled = true; return ""; };
  const out = await extractAttachmentText(
    { base64, mimeType: "text/plain", fileName: "invoice.txt" }, mock,
  );
  assert(out.includes("INVOICE #4412") && out.includes("$1,250.00"), "text/plain decodes to non-empty readable text");
  assert(modelCalled === false, "text path does NOT call the model (direct decode)");
}

// ── 2. PDF/binary path inlines a base64 data: URI and routes through the injected seam. ─
{
  // Minimal valid PDF header bytes — content is irrelevant since the model is mocked; the
  // point is to prove the base64→data-URI→model wiring builds the right shape.
  const pdfBytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
  const base64 = bytesToBase64(pdfBytes);
  let seenSystem = "";
  let seenParts: any[] = [];
  const mock: ModelInvoker = async (system, parts) => {
    seenSystem = system;
    seenParts = parts as any[];
    // Simulate the gateway returning extracted text.
    return "INVOICE #4412 — Amount due $1,250.00, due 2026-09-01.";
  };
  const out = await extractAttachmentText(
    { base64, mimeType: "application/pdf", fileName: "invoice.pdf" }, mock,
  );
  assert(out.length > 0 && out.includes("INVOICE #4412"), "pdf path returns non-empty extracted text via the model seam");
  assert(seenSystem === ATTACHMENT_SOURCE_INSTRUCTION, "pdf path carries the DOCUMENT_SOURCE honesty guard as system prompt");
  const imgPart = seenParts.find((p) => p?.type === "image_url");
  assert(!!imgPart, "pdf path includes an image_url content-part");
  assert(
    typeof imgPart?.image_url?.url === "string" &&
      imgPart.image_url.url.startsWith("data:application/pdf;base64,") &&
      imgPart.image_url.url.includes(base64),
    "content-part is a base64 data: URI (inlined, not a remote URL) — matches paige-ai-chat pattern",
  );
  const textPart = seenParts.find((p) => p?.type === "text");
  assert(!!textPart && /invoice\.pdf/.test(textPart.text), "pdf path includes a text instruction naming the file");
}

// ── 2b. Office binaries are SKIPPED, not falsely "read" (Codex P1 #176, §13). ─────────
// The comms-attachments bucket accepts doc/docx/xls/xlsx, but gatewayCompat only inlines
// PDF + images — everything else becomes a `[unsupported attachment: …]` placeholder, so
// the model never sees the bytes. extractAttachmentText must return "" for these (counted
// SKIPPED by the caller) rather than route them through the model where a chatty reply
// would be miscounted as a transcription.
{
  const officeMimes = [
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "brief.docx"],
    ["application/msword", "brief.doc"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "budget.xlsx"],
    ["application/vnd.ms-excel", "budget.xls"],
    ["application/octet-stream", "unknown.bin"],
  ] as const;
  for (const [mimeType, fileName] of officeMimes) {
    const base64 = bytesToBase64(new TextEncoder().encode("PK\x03\x04 binary office bytes"));
    let modelCalled = false;
    const mock: ModelInvoker = async () => { modelCalled = true; return "totally made-up transcription"; };
    const out = await extractAttachmentText({ base64, mimeType, fileName }, mock);
    assert(out === "", `${mimeType} returns "" (skipped, not read)`);
    assert(modelCalled === false, `${mimeType} does NOT reach the model (no placeholder hallucination)`);
  }
}

// ── 3. bytesToBase64 round-trips large arrays without a call-stack blowup. ────────────
{
  const big = new Uint8Array(200_000).map((_, i) => i % 256);
  const b64 = bytesToBase64(big);
  const back = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  assert(back.length === big.length && back[123] === big[123], "bytesToBase64 round-trips a 200KB array chunk-safely");
}

// ── 4. Empty model result yields empty string, never throws. ─────────────────────────
{
  const base64 = bytesToBase64(new TextEncoder().encode("%PDF-1.4"));
  const out = await extractAttachmentText(
    { base64, mimeType: "application/pdf", fileName: "x.pdf" },
    async () => "",
  );
  assert(out === "", "empty model output degrades to empty string (no throw)");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll attachment-extract smoke assertions passed.");
