// =============================================================================
// INT-162 — `sign-agreement`: the native agreement-signing door.
// =============================================================================
// An external counterparty opens a link, reads the wording their tenant sent them, types their
// legal name, ticks both consents, and signs. There is no Supabase session behind any of that, so
// `verify_jwt = false` (declared in config.toml with its reason) and THE TOKEN IS THE AUTHORISATION.
// Signing needs pdf-lib, which is why this is a function and not an RPC.
//
// WHAT THIS FUNCTION EXISTS TO NOT DO (§32). `finalize-agreement` builds its PDF inside a
// try/catch, logs a warning when the storage upload fails, and STILL returns `ok:true` with
// `signed_pdf_path: null` (index.ts:193-207). For months that meant a tenant could be told their
// agreement was signed while the document proving it did not exist — and it was not a theoretical
// risk: migration 20260808170000 records that the `btf-onboarding` bucket was simply ABSENT on
// prod, so every one of those uploads threw and every one was swallowed. This function FAILS
// LOUDLY instead: if the PDF does not build, does not upload, or cannot be read back, nothing is
// marked completed and the caller is told exactly which step failed. The DB CHECK
// (`tas_completed_is_evidenced_ck`) refuses a completed row with a null path as a second line of
// defence — it is NOT this function's error handling.
//
// §9  / §51 Tenancy is derived from the TOKEN ROW, never from the request. The body carries no
//           tenant, contact, agreement or signing id, and none would be honoured if it did.
// §13 Honesty: `signer_drew` is recorded true ONLY when a signature raster actually embedded into
//           the document. A raster the renderer could not embed is reported, not quietly claimed.
// §2  Coaching-generic copy and a coaching-generic bucket. Uploads go to `tenant-agreements`; the
//           funding-vertical `btf-onboarding` bucket is `finalize-agreement`'s and stays there.
// §58 `finalize-agreement` is NOT modified. It has a live producer
//           (src/pages/onboard/Step2Agreement.tsx:188) and keeps its own behaviour.
//
// WHAT IT DELIBERATELY DOES NOT TOUCH: `public.clients`. No `linked_user_id` claim (live issue
// #1354) and no `onboarding_stage` write (that is `finalize-agreement`'s BTF side effect, filed
// and out of scope). An external counterparty signing a document is not an onboarding event.
//
// NO ENUMERATION ORACLE. Unknown, malformed, expired, already-completed, declined, voided and
// re-issued tokens all return ONE byte-identical refusal, and the token is validated BEFORE any
// field validation — otherwise a 400 for a missing consent would itself confirm that a token is
// real. Nothing derived from the raw token is ever logged or returned.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAgreementPdf, decodeSignatureImage, type AgreementPdfWarning } from "../_shared/agreement-pdf.ts";
import { trustedClientIp, overRateLimit } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Coaching-generic (§2). Never `btf-onboarding` — that name is a funding vertical's. */
const BUCKET = "tenant-agreements";
const TABLE = "tenant_agreement_signings";

/** Generous: a real signer makes one request. This only stops a script from farming the renderer. */
const RL_PER_IP = 30;
const RL_WINDOW_SECONDS = 300;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * The ONE refusal. Every invalid-token case returns exactly this — same status, same code, same
 * sentence — so the response can never be read as an answer about which tokens exist.
 */
function refuse(): Response {
  return json({
    ok: false,
    error_code: "INVALID_LINK",
    error: "This signing link is no longer valid. Ask the sender for a new one.",
  }, 403);
}

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, error_code: code, error: message, ...extra }, status);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `signer_ip` is an `inet` column, so a malformed value is a write error, not a null. Only a
 * value that genuinely parses is recorded; anything else is recorded as unknown rather than
 * failing a legitimate signature over a proxy header.
 */
function parseInet(raw: string | null): string | null {
  if (!raw) return null;
  const candidate = raw.split(",")[0]?.trim() ?? "";
  if (!candidate) return null;
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  if (ipv4.test(candidate)) return candidate;
  if (candidate.includes(":") && ipv6.test(candidate) && candidate.length <= 45) return candidate;
  return null;
}

interface SigningRow {
  id: string;
  tenant_id: string;
  document_title: string | null;
  document_body: string | null;
  document_path: string | null;
  signature_state: string;
  expires_at: string | null;
  token_hash: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "POST required");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── 1. Parse. Independent of the token, so it leaks nothing about which tokens exist. ────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "INVALID_BODY", "Invalid JSON");
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";

  // ── 2. Cheapest possible refusal: token SHAPE, before a single byte of DB or render work. ────
  // `issue_agreement_signing_link` mints `encode(gen_random_bytes(32),'hex')`, so anything that is
  // not 64 lowercase hex characters cannot be a token this platform ever issued.
  if (!/^[0-9a-f]{64}$/.test(token)) return refuse();

  // ── 3. Throttle before the first DB read. Fails OPEN on limiter error by design — a limiter
  //       hiccup must never block a legitimate signature. ────────────────────────────────────────
  const ip = trustedClientIp(req);
  if (await overRateLimit(admin, `sign-agreement:ip:${ip}`, RL_PER_IP, RL_WINDOW_SECONDS)) {
    return fail(429, "RATE_LIMITED", "Too many attempts. Please wait a moment and try again.");
  }

  // ── 4. Resolve the row BY HASH. The raw token is never stored, never logged, never returned. ──
  const tokenHash = await sha256Hex(token);
  const { data: rowData, error: rowErr } = await admin
    .from(TABLE)
    .select("id, tenant_id, document_title, document_body, document_path, signature_state, expires_at, token_hash")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (rowErr) {
    // A lookup FAILURE is ours, not the caller's, and must not masquerade as a bad link (§13):
    // reporting it as INVALID_LINK would send a legitimate signer away over our own outage.
    console.error("[sign-agreement] signing lookup failed", rowErr.message);
    return fail(503, "LOOKUP_FAILED", "Could not verify this link right now. Please try again shortly.");
  }

  const row = rowData as SigningRow | null;
  const now = Date.now();
  const stillLive =
    !!row &&
    row.token_hash !== null &&
    (row.signature_state === "sent" || row.signature_state === "viewed") &&
    !!row.expires_at && Date.parse(row.expires_at) > now;

  // Unknown · expired · completed · declined · voided · token rotated — one refusal for all of it.
  if (!stillLive || !row) return refuse();

  // ── 5. Only NOW may the response vary: the caller has proven possession of a live token. ─────
  const typedName = typeof body?.typed_name === "string" ? body.typed_name.trim() : "";
  const consentRead = body?.consent_read === true;
  const consentEsign = body?.consent_esign === true;
  const signatureImageBase64 = typeof body?.signature_image_base64 === "string" ? body.signature_image_base64 : "";

  if (!typedName) return fail(400, "MISSING_NAME", "Type your full legal name to sign.");
  if (typedName.length > 200) return fail(400, "NAME_TOO_LONG", "That name is too long to record.");
  if (!consentRead || !consentEsign) {
    return fail(400, "CONSENT_REQUIRED", "Both confirmations must be ticked before you can sign.");
  }

  // The renderer composes the accepted WORDING. A file-backed signing (document_path with no
  // document_body) has no wording to compose, and inventing one would put a signature on a
  // document nobody agreed to. Refused honestly and specifically — this is reachable only with a
  // valid token, so the specificity costs nothing. See the report: the contract permits such rows,
  // and counter-signing an uploaded file is a separate, unbuilt capability.
  const bodyText = (row.document_body ?? "").trim();
  if (!bodyText) {
    console.error(`[sign-agreement] signing ${row.id} has no document_body (document_path=${!!row.document_path})`);
    return fail(409, "DOCUMENT_NOT_RENDERABLE",
      "This document cannot be signed online yet. Please contact the sender.");
  }

  // ── 6. Build. A throw here refuses the signing; it never produces a completed row. ────────────
  const warnings: Array<{ code: AgreementPdfWarning; detail: string }> = [];
  const signatureImage = decodeSignatureImage(signatureImageBase64);
  const signedAtIso = new Date().toISOString();

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildAgreementPdf({
      documentTitle: row.document_title ?? "Agreement",
      bodyText,
      typedName,
      signatureImage,
      signedAtIso,
      onWarning: (code, detail) => warnings.push({ code, detail }),
    });
  } catch (e) {
    console.error(`[sign-agreement] PDF build FAILED for signing ${row.id}:`, String(e));
    return fail(500, "PDF_BUILD_FAILED",
      "We could not produce the signed document, so nothing was recorded. Please try again.");
  }
  for (const w of warnings) console.warn(`[sign-agreement] ${row.id} ${w.code}: ${w.detail}`);

  // §13 — a raster the renderer could not embed is NOT in the document, so it is not claimed.
  const signerDrew = !!signatureImage && !warnings.some((w) => w.code === "signature_image_embed_failed");

  // ── 7. Upload. The tenant id is the FIRST path segment because the bucket's RLS keys its reads
  //       on `(storage.foldername(name))[1]` (migration 20260630190349). ──────────────────────────
  const fileName = `${row.id}-${now}.pdf`;
  const dir = `${row.tenant_id}/signed`;
  const storagePath = `${dir}/${fileName}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });

  if (upErr) {
    // THE FALSE-GREEN THIS FUNCTION EXISTS TO PREVENT. Nothing is marked completed.
    console.error(`[sign-agreement] STORAGE UPLOAD FAILED for signing ${row.id} -> ${BUCKET}/${storagePath}:`, upErr.message);
    return fail(502, "PDF_UPLOAD_FAILED",
      "We could not store the signed document, so your signature was NOT recorded. Please try again.",
      { detail: upErr.message });
  }

  // A clean `upload` is the storage API's word for it. This is a legal record, so read it back and
  // let the object itself say so (§32 — persisted, not merely attempted).
  const { data: listed, error: listErr } = await admin.storage.from(BUCKET).list(dir, { search: fileName, limit: 1 });
  if (listErr || !listed?.some((o) => o.name === fileName)) {
    console.error(`[sign-agreement] PDF READBACK FAILED for signing ${row.id} at ${BUCKET}/${storagePath}:`, listErr?.message ?? "object not found after upload");
    return fail(502, "PDF_NOT_PERSISTED",
      "We could not confirm the signed document was stored, so your signature was NOT recorded. Please try again.");
  }

  // ── 8. Complete — atomically, and only against the row that still holds THIS token. ───────────
  // The state and token_hash predicates make this a compare-and-set: a concurrent second submit,
  // a re-issue that rotated the token, or a void that cleared it all lose here rather than
  // double-completing. `token_hash: null` burns the link in the same write that completes it.
  const { data: updated, error: updErr } = await admin
    .from(TABLE)
    .update({
      signature_state: "completed",
      completed_at: signedAtIso,
      signer_name: typedName,
      signer_drew: signerDrew,
      consent_read: true,
      consent_esign: true,
      signed_pdf_path: storagePath,
      signer_ip: parseInet(req.headers.get("x-forwarded-for")),
      signer_user_agent: req.headers.get("user-agent"),
      token_hash: null,
      updated_at: signedAtIso,
    })
    .eq("id", row.id)
    .eq("token_hash", tokenHash)
    .in("signature_state", ["sent", "viewed"])
    .select("id, signed_pdf_path")
    .maybeSingle();

  if (updErr || !updated) {
    // The document is stored but the record did not complete. Say so — and clean up the orphan so
    // the bucket does not accumulate PDFs for signings that were never completed.
    const reason = updErr?.message ?? "row no longer in a signable state (already completed, voided or re-issued)";
    console.error(`[sign-agreement] COMPLETION WRITE FAILED for signing ${row.id}: ${reason}`);
    const { error: rmErr } = await admin.storage.from(BUCKET).remove([storagePath]);
    if (rmErr) console.error(`[sign-agreement] orphan PDF left at ${BUCKET}/${storagePath}: ${rmErr.message}`);
    return fail(409, "SIGNATURE_NOT_RECORDED",
      "Your signature could not be recorded. It may already have been signed, or the link may have been withdrawn.");
  }

  console.log(`[sign-agreement] signing ${updated.id} completed for tenant ${row.tenant_id}`);
  return json({ ok: true, signing_id: updated.id, signed_pdf_path: updated.signed_pdf_path });
});
