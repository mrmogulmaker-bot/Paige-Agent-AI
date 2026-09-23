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

import { renderPresentedPdf, sealAgreementPdf, UnrenderableDocumentError, UnrenderableNameError } from "./document.ts";
import { expiryFromNow, mintSignerToken, RETRIEVAL_TOKEN_TTL_DAYS, sha256Hex } from "./token.ts";
import { notify, ownerNotificationEmail } from "./notify.ts";
import { recordCompletedAgreementToKnowledge } from "./knowledge.ts";

/**
 * How long the completed-agreement knowledge write may hold the signer's response, when there is no
 * way to hand it off instead.
 *
 * ABANDONING THIS WORK IS NOT FREE, which an earlier version of this comment got wrong by claiming
 * "a late embed that still lands is harmless". It is not: `kb-ingest-core.ts` COMMITS the
 * `tenant_knowledge_docs` row before it calls the embedding provider, inserts the chunks after, and
 * deletes the orphan row only at the very end if nothing embedded. Every one of those repair lines
 * is downstream of the await that hangs, so a race that walks away mid-ingest can leave a durable
 * row carrying a `chunk_count` it never produced — listed in the tenant's knowledge base, never
 * retrievable, and lying about its own size.
 *
 * So the timeout is the FALLBACK, not the plan. Where the runtime can keep the isolate alive past
 * the response (`EdgeRuntime.waitUntil`, as `paige-tts` and `generate-image` already use), the
 * ingest is handed to it and allowed to finish and clean up after itself, off the signer's request
 * entirely. The bound below only applies where that hand-off is unavailable, and there it is the
 * lesser of two bad outcomes: a possible orphan row beats showing a signer a failed signing for an
 * agreement that is completed, sealed and emailed.
 */
const KNOWLEDGE_INGEST_TIMEOUT_MS = 8_000;

/**
 * DO NOT ADD AN INGEST OR NOTIFICATION REASON TO THIS UNION. The omission is the design, and the
 * distinction it encodes is easy to lose: a SEALING failure means the agreement has no executed
 * document, which decides whether it is validly executed at all. A knowledge-ingest or notification
 * failure means Paige did not write down something she already has. The first is a state of the
 * agreement; the second is not, and representing it here would make a completed, sealed, legally
 * executed agreement reportable as a failure because a summary did not embed.
 *
 * The rule that a sealing failure must surface as its own visible state is real and applies to every
 * reason listed below. It stops at the seal.
 */
export type SealOutcome =
  | { ok: true; sealedSha256: string; sealedKey: string }
  | { ok: false; reason: "not_ready" | "already_sealed" | "missing_presented" | "render_failed" | "storage_failed" | "verify_failed" | "unrenderable_name"; detail: string };

interface Db {
  from: (t: string) => any;
  storage: { from: (b: string) => any };
}

export async function sealAndComplete(db: Db, agreementId: string): Promise<SealOutcome> {
  const { data: agreement } = await db.from("paige_agreements")
    .select("id,tenant_id,title,status,body_source,body_markdown,content_storage_key,content_sha256,sealed_sha256")
    .eq("id", agreementId).maybeSingle();

  if (!agreement) return { ok: false, reason: "not_ready", detail: "agreement not found" };
  if (agreement.sealed_sha256) {
    // Idempotent: a retry after a successful seal is answered from the committed result rather than
    // burning a second seal. The write-once trigger would refuse anyway; this makes it graceful.
    return { ok: true, sealedSha256: agreement.sealed_sha256, sealedKey: "" };
  }
  if (!agreement.content_sha256) {
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

  // ── WHAT THE SIGNER WAS SHOWN, and how we know ────────────────────────────────────────────────
  // There are two freeze paths and they freeze different media, so this reads whichever one applies
  // rather than assuming the first:
  //
  //   • `agreement-send` renders a PDF, stores it, and hashes the bytes it read back. The signer is
  //     shown that file, so `content_sha256` is the digest of the FILE.
  //   • `issue_agreement_signing_link` runs in the database, which cannot read storage or render a
  //     PDF. The approved page presents the agreement's TEXT, so it freezes the digest of the TEXT
  //     and stores no file.
  //
  // The earlier version demanded a stored file, which made the whole database-minted path — the one
  // the approved page actually uses — unsealable: every signature would land and completion could
  // never happen. The text is re-hashed here before it is rendered, so a body edited after the link
  // was issued is caught rather than quietly sealed.
  let presentedBytes: Uint8Array;
  let presentedLabel: "file" | "text";

  if (agreement.content_storage_key) {
    const presented = await db.storage.from("paige-agreements").download(agreement.content_storage_key);
    if (presented.error || !presented.data) {
      return { ok: false, reason: "storage_failed", detail: presented.error?.message ?? "presented document unreadable" };
    }
    presentedBytes = new Uint8Array(await presented.data.arrayBuffer());
    const actual = await sha256Hex(presentedBytes);
    if (actual !== agreement.content_sha256) {
      console.error("[agreements] the frozen document no longer matches its recorded hash", { agreementId });
      return { ok: false, reason: "verify_failed", detail: "the frozen document does not match its recorded hash" };
    }
    presentedLabel = "file";
  } else {
    const body = String(agreement.body_markdown ?? "");
    const actual = await sha256Hex(new TextEncoder().encode(body));
    if (actual !== agreement.content_sha256) {
      console.error("[agreements] the agreement text changed after the link was issued", { agreementId });
      return { ok: false, reason: "verify_failed", detail: "the agreement text changed after the link was issued" };
    }
    try {
      presentedBytes = await renderPresentedPdf({ title: agreement.title, bodyMarkdown: body });
    } catch (e) {
      if (e instanceof UnrenderableDocumentError) {
        console.error("[agreements] seal refused — the agreement text cannot be exported", { agreementId });
        return { ok: false, reason: "render_failed", detail: e.message };
      }
      console.error("[agreements] presented render failed at seal", { agreementId, error: String(e) });
      return { ok: false, reason: "render_failed", detail: String(e) };
    }
    presentedLabel = "text";
  }

  let sealedBytes: Uint8Array;
  try {
    sealedBytes = await sealAgreementPdf({
      presentedBytes,
      presentedSha256: agreement.content_sha256,
      presentedKind: presentedLabel,
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
        // Guarded independently of the boundary check in `sign-agreement`: this ran INSIDE the
        // argument object, so a blob that would not decode threw past `document.ts`'s deliberate
        // embedPng fallback and failed the seal permanently. Rows written before that boundary
        // existed still have to degrade to the typed name rather than strand the agreement.
        signatureImagePng: decodeSignatureImage(s.signature_image_png, agreementId),
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

  // THE COMPLETION WRITE IS THE CONCURRENCY GUARD, and `.select("id")` is what makes it one.
  // The read-then-write check at the top of this function has no atomicity: two final signatures
  // landing together both see `sealed_sha256` NULL, both render, and both upload under distinct
  // random keys. Without the returned rows, supabase-js reports a zero-row update as SUCCESS, so the
  // loser returned ok:true for a seal that was never recorded, orphaned its PDF in the bucket, and —
  // worst of all — ran the completion notices a second time, minting fresh retrieval tokens that
  // killed the links the winner had already emailed.
  const completedAt = new Date().toISOString();
  const { data: completed, error: updateError } = await db.from("paige_agreements").update({
    status: "completed",
    completed_at: completedAt,
    sealed_storage_key: sealedKey,
    sealed_sha256: sealedSha256,
  }).eq("id", agreementId).in("status", ["sent", "viewed", "partially_signed"]).select("id");

  if (updateError) {
    console.error("[agreements] completion write refused after a successful seal", { agreementId, error: updateError.message });
    return { ok: false, reason: "verify_failed", detail: updateError.message };
  }

  if (!completed || completed.length === 0) {
    // Another request sealed this agreement first. Clean up after ourselves, send nothing, and
    // answer from the committed row rather than from what this call produced.
    const rm = await db.storage.from("paige-agreements").remove([sealedKey]);
    if (rm.error) {
      console.error("[agreements] orphaned sealed copy could not be removed", { agreementId, sealedKey, error: rm.error.message });
    }
    const { data: winner } = await db.from("paige_agreements")
      .select("sealed_sha256,sealed_storage_key").eq("id", agreementId).maybeSingle();
    if (winner?.sealed_sha256) {
      return { ok: true, sealedSha256: String(winner.sealed_sha256), sealedKey: String(winner.sealed_storage_key ?? "") };
    }
    // Nobody sealed it and the status moved elsewhere — voided or declined between our read and our
    // write. Honest failure, not a claimed completion.
    return { ok: false, reason: "not_ready", detail: "the agreement left the signing states while it was being sealed" };
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

  // ── Remember it, so Paige can answer what this client agreed to ────────────────────────────────
  // LAST, and guarded twice. It runs after the parties have been told because a slow or failing
  // ingest must never delay the counterparty's retrieval link — that link is the only copy somebody
  // with no account on this platform gets. The module returns rather than throws, and this catches
  // anyway: `sign-agreement` has no top-level catch, so an escape here would hand a signer a 500
  // for an agreement that is completed, sealed and emailed. A knowledge miss is not a seal failure,
  // and `SealOutcome` deliberately has no way to say it was one.
  try {
    const ingest = () =>
      recordCompletedAgreementToKnowledge(db as never, {
        agreementId,
        tenantId: agreement.tenant_id,
        title: agreement.title,
        completedAt,
        signers: (signers ?? []) as Array<Record<string, unknown>>,
      });

    // PREFERRED PATH: hand the work off, so it finishes and cleans up after itself rather than
    // being abandoned half-written. The signer's response does not wait for it at all.
    const waitUntil = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
      .EdgeRuntime?.waitUntil;
    if (typeof waitUntil === "function") {
      waitUntil(
        ingest().then(
          (r) => {
            if (!r.ingested) {
              console.warn("[agreements] completed agreement not written to knowledge", { agreementId, reason: r.reason });
            }
          },
          (e) => console.error("[agreements] knowledge ingest threw after completion", { agreementId, error: String(e) }),
        ),
      );
      return { ok: true, sealedSha256, sealedKey };
    }

    // FALLBACK, where no hand-off exists: bound it, for the reason on the constant above.
    // `ReturnType<typeof setTimeout>` rather than `number`: under the Node-shaped typings this
    // bundle resolves, `setTimeout` returns a `Timeout` object, not a numeric handle.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const learned = await Promise.race([
      ingest(),
      new Promise<{ ingested: false; reason: string }>((resolve) => {
        timer = setTimeout(() => resolve({ ingested: false, reason: "ingest_timed_out" }), KNOWLEDGE_INGEST_TIMEOUT_MS);
      }),
    ]);
    // Do not leave a pending 8s timer behind on the happy path.
    if (timer !== undefined) clearTimeout(timer);
    if (!learned.ingested) {
      // Loud in the log, never silent (§32): a write that quietly never happens is
      // indistinguishable from one that was never wired.
      //
      // AND NEVER LOUDER THAN THAT — this is the line a future session will want to "fix", so the
      // reason is here rather than somewhere it can be missed. Returning a failure from here, or
      // giving `SealOutcome` a reason to carry one, would make an agreement that IS executed report
      // itself as not executed because a summary did not embed. The caller would then surface that
      // to a signer who has already signed, and a retry would re-enter a path guarded by a
      // write-once seal. Log it, leave the agreement completed, and let the miss be a miss.
      console.warn("[agreements] completed agreement not written to knowledge", { agreementId, reason: learned.reason });
    }
  } catch (e) {
    console.error("[agreements] knowledge ingest threw after completion", { agreementId, error: String(e) });
  }

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
        signer_name: s.full_name,
        agreement_title: input.title,
        document_url: `${supabaseUrl}/functions/v1/agreement-document?token=${token}`,
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
      // NO LINK FOR THE OWNER, and that is honest rather than lazy. `agreement-document`'s tenant
      // door authenticates with the caller's session — a browser following a link out of an inbox
      // sends no Authorization header, so the button would have answered the owner's own signed
      // contract with the generic refusal. There is no tenant-side surface to point at yet either.
      // So the notice states the fact and the fingerprint, and the retrieval endpoint waits for the
      // surface that can call it with a session. A dead button is worse than no button.
      document_url: null,
    },
  });
}

/**
 * Decode a stored drawn mark, or give up on it quietly.
 *
 * Never throws. The typed name is the signature the record relies on; the image corroborates it. A
 * corrupt blob costing an agreement its completion — permanently, with no repair path — is the
 * failure this exists to prevent.
 */
function decodeSignatureImage(raw: unknown, agreementId: string): Uint8Array | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
      console.error("[agreements] stored signature image is not a PNG — falling back to the typed name", { agreementId });
      return null;
    }
    return bytes;
  } catch (e) {
    console.error("[agreements] stored signature image could not be decoded — falling back to the typed name", {
      agreementId, error: String(e),
    });
    return null;
  }
}
