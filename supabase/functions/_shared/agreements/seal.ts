// _shared/agreements/seal.ts — turning a fully-signed agreement into the retained record (INT-163).
//
// THE ORDER HERE IS THE DESIGN. Completion is the legal act, so it may only be claimed once the
// sealed bytes genuinely exist and genuinely match what we say they are:
//
//   render/load the frozen bytes -> stamp -> upload (upsert:false, random key) -> RE-DOWNLOAD and
//   RE-HASH -> only then mark completed.
//
// The re-read is not ceremony. Uploading and hashing the in-memory array proves what we MEANT to
// store; re-reading proves what IS stored. The existing precedent this replaces got that wrong in
// the other direction: `finalize-agreement` console.errors a failed upload, leaves the path null,
// and still writes the row as signed — a signed agreement with no retained copy, reported as
// success. `pa_completed_is_sealed_ck` now makes that state unrepresentable, and this function
// makes sure we never try.
//
// A FAILED NOTIFICATION IS NOT A FAILED SEAL. Sealing is the act; the email is an announcement of
// it. Nothing here rolls a completed agreement back because a message did not go out — that would
// destroy a legal record to fix a delivery problem. Delivery is retried separately.

import { sealAgreementPdf, UnrenderableNameError } from "./document.ts";
import { expiryFromNow, mintSignerToken, RETRIEVAL_TOKEN_TTL_DAYS, sha256Hex } from "./token.ts";
import { notify, ownerNotificationEmail } from "./notify.ts";

export type SealOutcome =
  | { ok: true; sealedSha256: string; sealedKey: string }
  | { ok: false; reason: "not_ready" | "already_sealed" | "missing_presented" | "render_failed" | "storage_failed" | "verify_failed" | "unrenderable_name"; detail: string };

interface Db {
  from: (t: string) => any;
  storage: { from: (b: string) => any };
}

export async function sealAndComplete(db: Db, agreementId: string): Promise<SealOutcome> {
  const { data: agreement } = await db.from("paige_agreements")
    .select("id,tenant_id,title,status,content_storage_key,content_sha256,sealed_sha256")
    .eq("id", agreementId).maybeSingle();

  if (!agreement) return { ok: false, reason: "not_ready", detail: "agreement not found" };
  if (agreement.sealed_sha256) {
    // Idempotent: a retry after a successful seal is answered from the committed result rather than
    // burning a second seal. The write-once trigger would refuse anyway; this makes it graceful.
    return { ok: true, sealedSha256: agreement.sealed_sha256, sealedKey: "" };
  }
  if (!agreement.content_storage_key || !agreement.content_sha256) {
    return { ok: false, reason: "missing_presented", detail: "no frozen document to seal" };
  }

  const { count: outstanding } = await db.from("paige_agreement_signers")
    .select("id", { count: "exact", head: true }).eq("agreement_id", agreementId).neq("status", "signed");
  if ((outstanding ?? 1) > 0) return { ok: false, reason: "not_ready", detail: "signatures outstanding" };

  const { data: signers } = await db.from("paige_agreement_signers")
    .select("full_name,email,signer_role,signing_order,status,typed_name,signed_at,esign_consent_at,esign_consent_slug,esign_consent_version,signing_ip,signing_user_agent,signature_image_png")
    .eq("agreement_id", agreementId).order("signing_order", { ascending: true });

  // Ordered by (created_at, seq) so two renderings of the same history can never disagree.
  const { data: events } = await db.from("paige_agreement_events")
    .select("event_type,created_at,actor_kind,actor_email,ip,seq")
    .eq("agreement_id", agreementId).order("created_at", { ascending: true }).order("seq", { ascending: true });

  const { data: tenant } = await db.from("tenants").select("name").eq("id", agreement.tenant_id).maybeSingle();

  const presented = await db.storage.from("paige-agreements").download(agreement.content_storage_key);
  if (presented.error || !presented.data) {
    return { ok: false, reason: "storage_failed", detail: presented.error?.message ?? "presented document unreadable" };
  }
  const presentedBytes = new Uint8Array(await presented.data.arrayBuffer());

  let sealedBytes: Uint8Array;
  try {
    sealedBytes = await sealAgreementPdf({
      presentedBytes,
      presentedSha256: agreement.content_sha256,
      agreementTitle: agreement.title,
      agreementId: agreement.id,
      tenantName: tenant?.name ?? "",
      sealedAtIso: new Date().toISOString(),
      parties: (signers ?? []).map((s: Record<string, unknown>) => ({
        fullName: String(s.full_name ?? ""),
        email: String(s.email ?? ""),
        role: String(s.signer_role ?? ""),
        signingOrder: Number(s.signing_order ?? 1),
        status: String(s.status ?? ""),
        typedName: (s.typed_name as string) ?? null,
        signedAt: (s.signed_at as string) ?? null,
        consentAt: (s.esign_consent_at as string) ?? null,
        consentSlug: (s.esign_consent_slug as string) ?? null,
        consentVersion: (s.esign_consent_version as number) ?? null,
        signingIp: (s.signing_ip as string) ?? null,
        signingUserAgent: (s.signing_user_agent as string) ?? null,
        signatureImagePng: s.signature_image_png
          ? Uint8Array.from(atob(String(s.signature_image_png)), (c) => c.charCodeAt(0))
          : null,
      })),
      events: (events ?? []).map((e: Record<string, unknown>) => ({
        eventType: String(e.event_type ?? ""),
        at: String(e.created_at ?? ""),
        actorKind: String(e.actor_kind ?? ""),
        actorLabel: (e.actor_email as string) ?? null,
        ip: (e.ip as string) ?? null,
      })),
    });
  } catch (e) {
    if (e instanceof UnrenderableNameError) {
      console.error("[agreements] seal refused — unrenderable signer name", { agreementId, names: e.names });
      return { ok: false, reason: "unrenderable_name", detail: e.message };
    }
    console.error("[agreements] seal render failed", { agreementId, error: String(e) });
    return { ok: false, reason: "render_failed", detail: String(e) };
  }

  // upsert:false plus a random component: a retry can never overwrite a sealed document and quietly
  // make the stored hash a lie about the current object.
  const sealedKey = `${agreement.tenant_id}/${agreement.id}/sealed-${crypto.randomUUID()}.pdf`;
  const up = await db.storage.from("paige-agreements")
    .upload(sealedKey, sealedBytes, { contentType: "application/pdf", upsert: false });
  if (up.error) {
    console.error("[agreements] sealed upload failed — agreement left uncompleted", { agreementId, error: up.error.message });
    return { ok: false, reason: "storage_failed", detail: up.error.message };
  }

  // What is actually stored, not what we meant to store.
  const readBack = await db.storage.from("paige-agreements").download(sealedKey);
  if (readBack.error || !readBack.data) {
    console.error("[agreements] sealed document could not be re-read", { agreementId, sealedKey });
    return { ok: false, reason: "verify_failed", detail: "sealed document could not be re-read" };
  }
  const storedBytes = new Uint8Array(await readBack.data.arrayBuffer());
  const sealedSha256 = await sha256Hex(storedBytes);
  if (sealedSha256 !== await sha256Hex(sealedBytes)) {
    console.error("[agreements] stored bytes differ from sealed bytes", { agreementId, sealedKey });
    return { ok: false, reason: "verify_failed", detail: "stored document does not match what was sealed" };
  }

  const completedAt = new Date().toISOString();
  const { error: updateError } = await db.from("paige_agreements").update({
    status: "completed",
    completed_at: completedAt,
    sealed_storage_key: sealedKey,
    sealed_sha256: sealedSha256,
  }).eq("id", agreementId).in("status", ["sent", "viewed", "partially_signed"]);

  if (updateError) {
    console.error("[agreements] completion write refused after a successful seal", { agreementId, error: updateError.message });
    return { ok: false, reason: "verify_failed", detail: updateError.message };
  }

  for (const eventType of ["sealed", "completed"]) {
    const { error } = await db.from("paige_agreement_events").insert({
      agreement_id: agreementId,
      tenant_id: agreement.tenant_id,
      event_type: eventType,
      actor_kind: "system",
      detail: eventType === "sealed" ? { sealed_sha256: sealedSha256, presented_sha256: agreement.content_sha256 } : {},
    });
    if (error) console.error("[agreements] completion event not recorded", { agreementId, eventType, error: error.message });
  }

  // ── Tell both parties, and give the counterparty a way BACK to their own record ────────────────
  // Their signing token's plaintext is gone by design, so a fresh retrieval token is minted here and
  // emailed. That is what makes "an accurate record available to both parties" true for somebody who
  // has no account on this platform — without it, their only copy is whatever they saved in the one
  // moment they were on the page. It is a longer window than the signing one, and still finite.
  await deliverCompletionNotices(db, {
    agreementId,
    tenantId: agreement.tenant_id,
    title: agreement.title,
    sealedSha256,
    signers: (signers ?? []) as Array<Record<string, unknown>>,
  });

  return { ok: true, sealedSha256, sealedKey };
}

async function deliverCompletionNotices(
  db: Db,
  input: {
    agreementId: string;
    tenantId: string;
    title: string;
    sealedSha256: string;
    signers: Array<Record<string, unknown>>;
  },
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const partyNames = input.signers.map((s) => String(s.full_name ?? "")).filter(Boolean).join(", ");
  const now = new Date();

  for (const s of input.signers) {
    const token = mintSignerToken();
    const { error } = await db.from("paige_agreement_signers").update({
      token_hash: await sha256Hex(token),
      token_expires_at: expiryFromNow(now, RETRIEVAL_TOKEN_TTL_DAYS),
      token_revoked_at: null,
    }).eq("agreement_id", input.agreementId).eq("email", s.email);

    if (error) {
      // They still have their signature on the record; what they lack is a way back to it. Logged
      // loudly, never silently, and never a reason to un-complete the agreement.
      console.error("[agreements] retrieval link could not be issued", {
        agreementId: input.agreementId, error: error.message,
      });
      continue;
    }

    await notify({
      supabaseUrl, serviceKey,
      templateName: "agreement-completed",
      recipientEmail: String(s.email),
      tenantId: input.tenantId,
      idempotencyKey: `agreement-completed-${input.agreementId}-${String(s.email)}`,
      templateData: {
        recipient_name: s.full_name,
        agreement_title: input.title,
        document_url: `${supabaseUrl}/functions/v1/agreement-sign?token=${token}`,
        sealed_sha256: input.sealedSha256,
        party_names: partyNames,
        is_signer: true,
      },
    });
  }

  const ownerEmail = await ownerNotificationEmail(db as never, input.tenantId);
  if (!ownerEmail) {
    console.warn("[agreements] no owner address resolved — completion notice not sent", {
      tenantId: input.tenantId, agreementId: input.agreementId,
    });
    return;
  }
  await notify({
    supabaseUrl, serviceKey,
    templateName: "agreement-completed",
    recipientEmail: ownerEmail,
    tenantId: input.tenantId,
    idempotencyKey: `agreement-completed-owner-${input.agreementId}`,
    templateData: {
      agreement_title: input.title,
      sealed_sha256: input.sealedSha256,
      party_names: partyNames,
      is_signer: false,
    },
  });
}
