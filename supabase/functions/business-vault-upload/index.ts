import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("BUSINESS_VAULT_ALLOWED_ORIGINS") ?? "https://paigeagent.ai,https://app.paigeagent.ai")
    .split(",")
    .map((value) => value.trim()),
);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const SECRET_NAME = /(password|passwd|api[-_ ]?key|secret|recovery[-_ ]?code|private[-_ ]?key|seed[-_ ]?phrase|wallet|credential|token)/i;
const LIKELY_SECRET = /(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|api[_ -]?key\s*[:=]|password\s*[:=]|recovery\s+code|seed\s+phrase)/i;

type Reservation = { tenant_id: string; record_id: string; version_id: string; storage_path: string };

function actualMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const cors = {
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (request.method === "OPTIONS") return new Response(null, { status: origin && ALLOWED_ORIGINS.has(origin) ? 204 : 403, headers: cors });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "upload_refused" }, 403);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES + 64 * 1024) return json({ error: "file_too_large" }, 413);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "session_required" }, 401);
  const scoped = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await scoped.auth.getUser();
  if (userError || !userData.user) return json({ error: "session_required" }, 401);

  let reservation: Reservation | null = null;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const attested = form.get("no_secrets_attested") === "true";
    const title = String(form.get("title") ?? "").trim();
    const section = String(form.get("section") ?? "");
    const recordType = String(form.get("record_type") ?? "").trim();
    const handlingMode = String(form.get("handling_mode") ?? "");
    const visibility = String(form.get("visibility") ?? "");
    const expectedTenant = String(form.get("expected_tenant") ?? "");
    const replaceRecordId = String(form.get("replace_record_id") ?? "") || null;
    if (!(file instanceof File) || !attested || !title || !recordType || !/^[0-9a-f-]{36}$/i.test(expectedTenant)) return json({ error: "invalid_request" }, 400);
    if (file.size <= 0 || file.size > MAX_BYTES) return json({ error: "file_too_large" }, 413);
    if (!ALLOWED_MIME.has(file.type)) return json({ error: "unsupported_file_type" }, 415);
    if (SECRET_NAME.test(file.name)) return json({ error: "credential_file_refused" }, 422);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detectedMime = actualMime(bytes);
    if (!detectedMime || detectedMime !== file.type) return json({ error: "file_signature_mismatch" }, 422);
    const inspectable = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (detectedMime === "application/pdf" && /\/Encrypt\b/.test(inspectable)) return json({ error: "encrypted_file_unavailable" }, 422);
    if (LIKELY_SECRET.test(inspectable)) return json({ error: "credential_content_refused" }, 422);
    const digest = toHex(await crypto.subtle.digest("SHA-256", bytes));

    const { data: reserved, error: reserveError } = await scoped.rpc("business_vault_reserve_upload", {
      p_expected_tenant: expectedTenant,
      p_title: title,
      p_section: section,
      p_record_type: recordType,
      p_handling_mode: handlingMode,
      p_visibility: visibility,
      p_original_filename: file.name,
      p_declared_mime: file.type,
      p_declared_size: file.size,
      p_replace_record_id: replaceRecordId,
    });
    if (reserveError || !reserved) return json({ error: "upload_refused" }, reserveError?.code === "42501" ? 403 : 422);
    reservation = reserved as Reservation;

    const { error: uploadError } = await admin.storage
      .from("business-vault-files")
      .upload(reservation.storage_path, bytes, { contentType: detectedMime, upsert: false, cacheControl: "0" });
    if (uploadError) throw new Error("storage_unavailable");

    const { data: finalized, error: finalizeError } = await admin.rpc("business_vault_finalize_upload", {
      p_actor: userData.user.id,
      p_expected_tenant: reservation.tenant_id,
      p_version_id: reservation.version_id,
      p_actual_mime: detectedMime,
      p_actual_size: bytes.byteLength,
      p_sha256: digest,
      p_validation_state: "validation_unavailable",
      p_validation_detail: "Stored after file signature and likely-secret checks. Malware and semantic DLP scanning are unavailable.",
    });
    if (finalizeError) {
      await admin.storage.from("business-vault-files").remove([reservation.storage_path]);
      if (finalizeError.message.includes("VAULT_DUPLICATE")) return json({ error: "duplicate_file" }, 409);
      throw new Error("finalize_failed");
    }
    if (finalized.duplicate === true) {
      const removed = await admin.storage.from("business-vault-files").remove([reservation.storage_path]);
      if (!removed.error) {
        await admin.rpc("business_vault_cancel_stale_upload", {
          p_version_id: reservation.version_id,
        });
      }
      return json({ error: "duplicate_file" }, 409);
    }
    return json({ ok: true, record_id: finalized.record_id, version_id: finalized.version_id, validation_state: finalized.state }, 201);
  } catch (error) {
    if (reservation) {
      const failed = await admin.rpc("business_vault_finalize_upload", {
        p_actor: userData.user.id,
        p_expected_tenant: reservation.tenant_id,
        p_version_id: reservation.version_id,
        p_actual_mime: "application/octet-stream",
        p_actual_size: 0,
        p_sha256: null,
        p_validation_state: "failed",
        p_validation_detail: "The upload could not be completed.",
      }).catch(() => null);
      if (failed && !failed.error) {
        const removed = await admin.storage.from("business-vault-files").remove([reservation.storage_path]);
        if (!removed.error) {
          await admin.rpc("business_vault_cancel_stale_upload", {
            p_version_id: reservation.version_id,
          });
        }
      }
    }
    console.warn("business_vault_upload_failed", { reason: error instanceof Error ? error.message : "unexpected_failure" });
    return json({ error: "upload_failed" }, 503);
  }
});
