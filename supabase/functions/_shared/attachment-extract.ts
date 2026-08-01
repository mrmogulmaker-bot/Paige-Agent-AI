// #176 — Conversations attachments → draft-with-Paige, document extraction primitives.
//
// PURE module by design: NO `npm:`/Deno imports and NO model client — only Web-standard
// globals (btoa/atob/TextDecoder/String.fromCharCode). That keeps it importable from a
// headless Node smoke (`node --experimental-strip-types`, §32) AND from the Deno edge fn,
// so the SAME code that ships is the code the smoke exercises. The actual model call is
// INJECTED (`ModelInvoker`) — the extraction reuses the ONE shared model seam via the
// caller (subagent-email-composer wraps gatewayCompat), never a second client (§18/§34).

/** Honesty guard mirrored from paige-ai-chat's DOCUMENT_SOURCE_INSTRUCTION (§13): only
 *  report what is literally readable from the document; never hallucinate beyond it. */
export const ATTACHMENT_SOURCE_INSTRUCTION =
  `You are reading the literal content of an attached document that has been provided to you. ` +
  `Report ONLY information you can directly read from this document. Do not use prior knowledge to ` +
  `fill in names, numbers, dates, or details. If something is not readable, omit it rather than guessing. ` +
  `Every fact you transcribe must be directly extractable from the provided document.`;

export interface ExtractFile { base64: string; mimeType: string; fileName: string }

/** The injected model seam: (system, userParts) → assistant text. Production wraps
 *  gatewayCompat; the smoke passes a mock to assert the wiring without a live gateway. */
export type ModelInvoker = (system: string, userParts: unknown[]) => Promise<string>;

/** Chunked binary→base64 (avoids call-stack blowups on large byte arrays). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Mimes the multimodal gateway can actually INGEST as document bytes. gatewayCompat
 *  (_shared/claude.ts) only inlines PDF + image content-parts; every other binary mime is
 *  replaced with a `[unsupported attachment: …]` placeholder before it reaches the model —
 *  so routing e.g. a .docx/.xlsx through it means the model NEVER sees the bytes, yet a
 *  chatty reply would be miscounted as a "read" attachment (§13 honesty, Codex P1 #176).
 *  Office formats (doc/docx/xls/xlsx) are accepted by the comms-attachments bucket but are
 *  NOT model-ingestible, so they are skipped here rather than falsely reported as read. */
function isModelIngestibleMime(mime: string): boolean {
  return mime === "application/pdf" || mime.startsWith("image/");
}

/**
 * Extract a document's readable text — the SAME pattern paige-ai-chat uses: text-family
 * mimes decode directly; PDFs/images are inlined as a base64 `data:` URI content-part and
 * read through the multimodal gateway (a remote URL alone is stringified to text by the
 * Claude normalizer, so it MUST be inlined). Carries the DOCUMENT_SOURCE honesty guard.
 *
 * Returns "" for anything the model can't actually ingest (Office binaries, unknown mimes),
 * so the caller counts it as SKIPPED, never as a read attachment (§13) — a nonempty model
 * reply to a placeholder-substituted document is a hallucination, not a transcription.
 */
export async function extractAttachmentText(
  file: ExtractFile,
  invokeModel: ModelInvoker,
): Promise<string> {
  const mime = (file.mimeType || "").toLowerCase();
  if (mime.startsWith("text/") || mime === "application/json") {
    try {
      const decoded = new TextDecoder().decode(
        Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)),
      );
      return decoded.slice(0, 60_000).trim();
    } catch {
      return "";
    }
  }
  // Only PDF + images survive gatewayCompat as real document bytes; skip everything else so
  // it is honestly counted as unread rather than "transcribed" from a placeholder (Codex P1).
  if (!isModelIngestibleMime(mime)) {
    return "";
  }
  const userParts = [
    {
      type: "text",
      text: `Transcribe the readable text/content of this document ("${file.fileName}"). ` +
        `Report ONLY what is literally present — do not summarize away specifics, do not invent.`,
    },
    { type: "image_url", image_url: { url: `data:${file.mimeType};base64,${file.base64}` } },
  ];
  const text = await invokeModel(ATTACHMENT_SOURCE_INSTRUCTION, userParts);
  return (text || "").trim();
}
