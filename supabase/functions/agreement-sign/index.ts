// agreement-sign — the PUBLIC signing ceremony (INT-163). `verify_jwt = false`.
//
// THIS IS THE HIGHEST-RISK SURFACE ON THE PLATFORM, and the reason is structural: the person signing
// has no account here and never will, so there is no session to check and the 256-bit token IS the
// authorization. Every control below assumes the URL is a credential and that credentials leak.
//
// THE ONE RULE. Tenant, agreement and signer are read FROM THE TOKEN ROW. No path segment, query
// parameter, header or body field names or steers any of the three, ever. This is deliberately the
// inverse of `docusign-send-envelope`, which takes contact_id off the request body and resolves it
// with the service-role client and no tenant filter — reachable by any global admin of any tenant.
//
// WHY THE TOKEN LEAVES THE URL ON FIRST LOAD. A GET with `?token=` puts a working credential into
// browser history, the Referer header of every third-party asset, shared screenshots and the address
// bar. So the first request sets it as an HttpOnly, Secure, SameSite=Strict cookie scoped to this
// function's path and redirects to a clean URL. That closes four leak classes at once and makes the
// POST CSRF-proof for free.
//
// WHAT IS DELIBERATELY NOT HERE. The signer never receives a Supabase signed URL: its object path is
// literally `${tenant_id}/${agreement_id}/`, which hands tenant internals to an outside party, and it
// keeps working after the agreement is voided. Their copy is STREAMED through this endpoint, where
// the same liveness predicate is re-evaluated on every byte served. Short-lived signed URLs remain
// correct on the authenticated tenant side, which is a different trust boundary.
//
// WHAT NO CONTROL HERE CAN FIX (§13). A forwarded email is a forwarded credential. Nothing
// server-side distinguishes the intended reader from whoever they forwarded it to. What bounds it:
// one token per signer per agreement so a leak never widens, a 30-day default expiry, instant
// revocation on void, and an audit row for every view recording the origin it came from.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { overRateLimit, trustedClientIp } from "../_shared/rateLimit.ts";
import { sha256Hex } from "../_shared/agreements/token.ts";
import {
  decideSigningAccess,
  explainCannotSign,
  MAX_BODY_BYTES,
  signerFacingView,
  TOKEN_SHAPE,
} from "../_shared/agreements/signing-guard.ts";
import { consentEvidenceText, ESIGN_CONSENT_DISCLOSURE, renderDisclosure } from "../_shared/agreements/disclosure.ts";
// Markup and styling live in ONE file so the UI/UX lane's approved template replaces exactly that
// file and nothing else. This function owns the route, the token, consent, evidence and security.
import { esc, renderRefusalPage, renderSigningPage } from "../_shared/agreements/signing-page.ts";
import { sealAndComplete } from "../_shared/agreements/seal.ts";
import { notify, ownerNotificationEmail } from "../_shared/agreements/notify.ts";

const FUNCTION_PATH = "/functions/v1/agreement-sign";
const COOKIE = "paige_agreement_token";

// There is no legitimate cross-origin caller for a signing page: the only browser that should talk
// to this is the one displaying it. `*` is the precedent elsewhere in the repo and is wrong here.
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  "Vary": "Cookie",
};

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

function html(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { ...SECURITY_HEADERS, ...extra, "Content-Type": "text/html; charset=utf-8" },
  });
}
function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...extra, "Content-Type": "application/json" },
  });
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function refusalPage(title: string, detail: string, status: number): Response {
  return html(renderRefusalPage(title, detail), status);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const ip = trustedClientIp(req);
  const db = admin();
  const now = new Date();

  // ── Ceiling 1: per-IP, BEFORE the token is read or hashed. Fail-OPEN: a limiter hiccup must never
  // strand a real signer mid-ceremony, and entropy (not this) is what defeats guessing.
  if (await overRateLimit(db, `agr:ip:${ip}`, 20, 60) || await overRateLimit(db, `agr:iph:${ip}`, 120, 3600)) {
    return refusalPage("Too many requests", "Please wait a moment and reload this page.", 429);
  }

  // ── The token: cookie first, then the one-time query parameter.
  const fromQuery = url.searchParams.get("token");
  const fromCookie = readCookie(req, COOKIE);
  const token = (fromCookie ?? fromQuery ?? "").trim();

  // Shape-check before hashing. Anything not 64 hex is garbage and is refused for the cost of a
  // regex — without this the function hashes whatever arrives, which is free CPU for an attacker.
  if (!TOKEN_SHAPE.test(token)) {
    return refusalPage(
      "This signing link is not valid",
      "Open the link from your email again. If it still does not work, ask the sender to resend it.",
      404,
    );
  }

  // Move the credential out of the URL and reload clean. Done before any database work so a leaked
  // Referer never carries a token even on a request that was going to fail anyway.
  if (fromQuery && !fromCookie) {
    return new Response(null, {
      status: 302,
      headers: {
        ...SECURITY_HEADERS,
        Location: url.pathname,
        "Set-Cookie":
          `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=${FUNCTION_PATH}; Max-Age=3600`,
      },
    });
  }

  const tokenHash = await sha256Hex(token);

  // ── The ONLY lookup. Scope comes from this row and nowhere else.
  const { data: signer } = await db
    .from("paige_agreement_signers")
    .select("id,agreement_id,tenant_id,status,signing_order,full_name,email,signer_role,token_hash,token_expires_at,token_revoked_at,esign_consent_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  // ── Ceiling 2: per-token, only AFTER a successful lookup. Keyed on the HASH, never the raw token:
  // the limiter persists its bucket string in a durable table with no prune job, so keying on the
  // plaintext would re-store the credential we went to the trouble of never storing.
  const tokenBucket = tokenHash.slice(0, 32);
  if (signer && await overRateLimit(db, `agr:tok:${tokenBucket}`, 60, 60)) {
    return refusalPage("Too many requests", "Please wait a moment and reload this page.", 429);
  }

  const { data: agreement } = signer
    ? await db.from("paige_agreements")
        .select("id,tenant_id,title,body_markdown,status,expires_at,content_sha256,content_storage_key,sealed_storage_key")
        .eq("id", signer.agreement_id).maybeSingle()
    : { data: null };

  const { count: earlierUnsigned } = signer
    ? await db.from("paige_agreement_signers")
        .select("id", { count: "exact", head: true })
        .eq("agreement_id", signer.agreement_id)
        .lt("signing_order", signer.signing_order)
        .neq("status", "signed")
    : { count: 0 };

  const decision = decideSigningAccess({
    signer: signer as never,
    agreement: agreement as never,
    earlierUnsignedCount: earlierUnsigned ?? 0,
    now,
  });

  if (!decision.allow) {
    const copy: Record<string, [string, string, number]> = {
      expired: ["This signing link has expired", "Ask the sender to send you a new one.", 410],
      not_found: ["This signing link is not valid", "Open the link from your email again. If it still does not work, ask the sender to resend it.", 404],
      agreement_not_signable: ["This agreement is no longer open for signing", "It may have been completed, declined or withdrawn. Contact the sender if you were expecting to sign.", 409],
      malformed_token: ["This signing link is not valid", "Open the link from your email again.", 404],
      already_signed: ["You have already signed", "Nothing further is needed from you.", 409],
      already_declined: ["You declined this agreement", "Contact the sender if this was a mistake.", 409],
      waiting_on_earlier_signer: ["Not your turn yet", "You will be emailed when it is your turn to sign.", 409],
    };
    const [title, detail, status] = copy[decision.reason] ?? copy.not_found;
    return refusalPage(title, detail, status);
  }

  const tenant = await db.from("tenants").select("name").eq("id", signer!.tenant_id).maybeSingle();
  const tenantName = (tenant.data?.name as string) ?? "the sender";
  const tenantContact = `the sender of this agreement`;

  // ── GET the document bytes. Streamed, never a signed URL.
  if (req.method === "GET" && url.searchParams.get("document") === "1") {
    if (await overRateLimit(db, `agr:doc:${tokenBucket}`, 10, 60)) {
      return refusalPage("Too many requests", "Please wait a moment and try again.", 429);
    }
    // The completed file if there is one, otherwise the frozen bytes they were sent.
    const key = (agreement!.sealed_storage_key ?? agreement!.content_storage_key) as string | null;
    if (!key) return refusalPage("The document is not ready", "Try again shortly, or contact the sender.", 409);

    const file = await db.storage.from("paige-agreements").download(key);
    if (file.error || !file.data) {
      console.error("[agreement-sign] document download failed", { key, error: file.error?.message });
      return refusalPage("The document could not be loaded", "Please try again, or contact the sender.", 502);
    }
    await recordEvent(db, signer!, "downloaded", ip, req);
    return new Response(await file.data.arrayBuffer(), {
      headers: {
        ...SECURITY_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="agreement.pdf"`,
      },
    });
  }

  // ── POST: sign or decline.
  if (req.method === "POST") {
    if (await overRateLimit(db, `agr:sign:${tokenBucket}`, 5, 60, true)) {
      return json({ ok: false, error: "Too many attempts. Please wait a minute." }, 429);
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ ok: false, error: "That request was too large." }, 413);
    }
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(raw || "{}"); } catch { /* handled below */ }

    const action = String(body.action ?? "");
    if (action === "decline") {
      return await handleDecline(
        db,
        { ...signer!, agreement_title: agreement!.title },
        String(body.reason ?? ""), ip, req,
      );
    }
    if (action !== "sign") return json({ ok: false, error: "Unrecognised action." }, 400);
    if (!decision.canSign) {
      return json({ ok: false, error: explainCannotSign(signer!.status as string, earlierUnsigned ?? 0) }, 409);
    }
    return await handleSign(db, signer!, agreement!, body, ip, req, tenantName, tenantContact);
  }

  // ── GET the signing page.
  await recordEvent(db, signer!, "viewed", ip, req);
  if (signer!.status === "pending") {
    await db.from("paige_agreement_signers").update({ status: "viewed", first_viewed_at: now.toISOString() })
      .eq("id", signer!.id).eq("status", "pending");
    await db.from("paige_agreements").update({ status: "viewed" })
      .eq("id", agreement!.id).eq("status", "sent");
    // Only on the FIRST view — the idempotency key would fold repeats anyway, but not asking is
    // cheaper than asking and having the answer thrown away.
    await tellOwner(db, signer!, String(agreement!.title), "viewed");
  }

  const others = await db.from("paige_agreement_signers")
    .select("full_name,status,signing_order").eq("agreement_id", signer!.agreement_id).neq("id", signer!.id);

  const view = signerFacingView({
    agreement: agreement as never,
    signer: signer as never,
    tenantDisplayName: tenantName,
    otherParties: (others.data ?? []) as never,
    canSign: decision.canSign,
    cannotSignReason: decision.canSign ? null : explainCannotSign(String(signer!.status), earlierUnsigned ?? 0),
    disclosure: decision.canSign
      ? {
        slug: ESIGN_CONSENT_DISCLOSURE.slug,
        version: ESIGN_CONSENT_DISCLOSURE.version,
        body: renderDisclosure(ESIGN_CONSENT_DISCLOSURE, tenantName, tenantContact),
        checkboxLabel: ESIGN_CONSENT_DISCLOSURE.checkboxLabel,
      }
      : null,
  });

  if ((req.headers.get("accept") ?? "").includes("application/json")) return json(view);
  return html(renderSigningPage(view));
});

/** Tell the business what just happened on their agreement. Never blocks the signer's request:
 *  a notification that does not go out is logged, and the workspace still shows the truth. */
async function tellOwner(
  db: ReturnType<typeof admin>,
  signer: Record<string, unknown>,
  agreementTitle: string,
  event: "viewed" | "signed" | "declined",
  declineReason?: string,
): Promise<void> {
  const to = await ownerNotificationEmail(db as never, String(signer.tenant_id));
  if (!to) {
    console.warn("[agreement-sign] no owner address resolved — activity notice not sent", {
      tenantId: signer.tenant_id, event,
    });
    return;
  }
  await notify({
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    templateName: "agreement-activity",
    recipientEmail: to,
    tenantId: String(signer.tenant_id),
    // One notice per signer per event — a reloaded page does not re-mail the owner.
    idempotencyKey: `agreement-${event}-${signer.agreement_id}-${signer.id}`,
    templateData: {
      event,
      signer_name: signer.full_name,
      agreement_title: agreementTitle,
      decline_reason: declineReason ?? null,
    },
  });
}

async function recordEvent(
  db: ReturnType<typeof admin>,
  signer: Record<string, unknown>,
  eventType: string,
  ip: string,
  req: Request,
): Promise<void> {
  // The trail is evidence, so a failure to write one is logged loudly rather than swallowed — but it
  // never fails the signer's request, because losing an audit row is not a reason to block a
  // signature the person is entitled to give.
  const { error } = await db.from("paige_agreement_events").insert({
    agreement_id: signer.agreement_id,
    tenant_id: signer.tenant_id,
    signer_id: signer.id,
    event_type: eventType,
    actor_kind: "signer",
    actor_email: signer.email,
    ip: ip === "unknown" ? null : ip,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500),
  });
  if (error) console.error("[agreement-sign] audit event not recorded", { eventType, error: error.message });
}

async function handleDecline(
  db: ReturnType<typeof admin>,
  signer: Record<string, unknown>,
  reason: string,
  ip: string,
  req: Request,
): Promise<Response> {
  const now = new Date().toISOString();
  // Conditional on the current status, so a replayed POST folds into "already declined" instead of
  // writing a second decline.
  const { data, error } = await db.from("paige_agreement_signers")
    .update({ status: "declined", declined_at: now, decline_reason: reason.slice(0, 1000) })
    .eq("id", signer.id).in("status", ["pending", "viewed"]).select("id");
  if (error) {
    console.error("[agreement-sign] decline failed", { error: error.message });
    return json({ ok: false, error: "That could not be recorded. Please try again." }, 500);
  }
  if (!data || data.length === 0) return json({ ok: true, status: "declined", note: "already recorded" });

  // ONE decline ends the agreement for everyone. The alternative — leaving it live with a declined
  // party — strands every later signer behind someone who will never sign, and the signing-order
  // rule would block them forever while the document still looked open.
  await db.from("paige_agreements")
    .update({ status: "declined", declined_at: now })
    .eq("id", signer.agreement_id).in("status", ["sent", "viewed", "partially_signed"]);
  await db.from("paige_agreement_signers")
    .update({ token_revoked_at: now })
    .eq("agreement_id", signer.agreement_id).is("token_revoked_at", null);

  await recordEvent(db, signer, "declined", ip, req);
  await tellOwner(db, signer, String(signer.agreement_title ?? "your agreement"), "declined", reason);
  return json({ ok: true, status: "declined" });
}

async function handleSign(
  db: ReturnType<typeof admin>,
  signer: Record<string, unknown>,
  agreement: Record<string, unknown>,
  body: Record<string, unknown>,
  ip: string,
  req: Request,
  tenantName: string,
  tenantContact: string,
): Promise<Response> {
  const typedName = String(body.typedName ?? "").trim();
  const consented = body.consent === true;
  const signatureImage = typeof body.signatureImagePng === "string" ? body.signatureImagePng : null;

  if (!consented) {
    return json({ ok: false, error: "Please agree to sign electronically before continuing." }, 400);
  }
  if (typedName.length < 2) {
    return json({ ok: false, error: "Please type your full legal name." }, 400);
  }
  // A drawn mark is accepted as inline base64 ONLY. A URL here would make the sealer fetch an
  // attacker-chosen address, which is an SSRF with our credentials.
  if (signatureImage && /^\s*https?:/i.test(signatureImage)) {
    return json({ ok: false, error: "A drawn signature must be sent as image data, not a link." }, 400);
  }

  const consentText = consentEvidenceText(ESIGN_CONSENT_DISCLOSURE, tenantName, tenantContact);
  const now = new Date().toISOString();

  // The write is conditional on the signer still being unsigned, which is what makes a double-submit
  // idempotent at the row rather than in a handler's memory. The database's own triggers independently
  // refuse an out-of-turn or already-signed write, so this is the friendly layer over a hard one.
  const { data, error } = await db.from("paige_agreement_signers").update({
    status: "signed",
    signed_at: now,
    typed_name: typedName.slice(0, 200),
    signature_image_png: signatureImage ? signatureImage.replace(/^data:image\/png;base64,/, "").slice(0, 400_000) : null,
    esign_consent_at: now,
    esign_consent_slug: ESIGN_CONSENT_DISCLOSURE.slug,
    esign_consent_version: ESIGN_CONSENT_DISCLOSURE.version,
    esign_consent_sha256: await sha256Hex(consentText),
    signing_ip: ip === "unknown" ? null : ip,
    signing_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500),
  }).eq("id", signer.id).in("status", ["pending", "viewed"]).is("token_revoked_at", null).select("id");

  if (error) {
    console.error("[agreement-sign] signature write refused", { error: error.message, code: (error as { code?: string }).code });
    return json({ ok: false, error: "That signature could not be recorded. Please reload and try again." }, 409);
  }
  if (!data || data.length === 0) {
    // Nothing changed: they already signed, or the link was revoked between the read and the write.
    return json({ ok: true, status: "signed", note: "already recorded" });
  }

  await recordEvent(db, signer, "consented", ip, req);
  await recordEvent(db, signer, "signed", ip, req);
  await tellOwner(db, signer, String(agreement.title ?? "your agreement"), "signed");

  // Is everyone done? Sealing is triggered from here, but performed by the sealer so that this
  // endpoint owns the ceremony and not the document assembly.
  const { count: outstanding } = await db.from("paige_agreement_signers")
    .select("id", { count: "exact", head: true })
    .eq("agreement_id", signer.agreement_id).neq("status", "signed");

  if ((outstanding ?? 0) === 0) {
    // Seal HERE, server-side, rather than trusting the browser to ask for it. A ceremony whose final
    // step depends on the client staying on the page is a ceremony that silently does not finish
    // when somebody closes the tab on the last signature.
    const sealed = await sealAndComplete(db, String(signer.agreement_id));
    if (!sealed.ok) {
      // The signature IS recorded and stands. Only completion is deferred, and the signer is told
      // the truth rather than shown a success that did not happen.
      console.error("[agreement-sign] sealing failed after the final signature", {
        agreementId: signer.agreement_id, reason: sealed.reason, detail: sealed.detail,
      });
      return json({
        ok: true,
        status: "signed",
        allSigned: true,
        completed: false,
        note: "Your signature is recorded. The completed copy is still being prepared and will be emailed to you.",
      });
    }
    return json({ ok: true, status: "signed", allSigned: true, completed: true });
  }

  await db.from("paige_agreements").update({ status: "partially_signed" })
    .eq("id", agreement.id).in("status", ["sent", "viewed"]);
  return json({ ok: true, status: "signed", allSigned: false });
}
