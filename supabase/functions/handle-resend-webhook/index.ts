// handle-resend-webhook — the listener that did not exist.
//
// WHY THIS IS NEW RATHER THAN AN EXTENSION. The platform already has ONE email-truth table
// (`public.email_send_log`) and one suppression receiver (`handle-email-suppression`) — but that
// receiver is Mailgun-shaped, arrives via the Go API, and is verified with the Lovable webhook
// helper. Resend signs with Svix and speaks a different event vocabulary, so its events need their
// own door. Source outcomes still append to the existing email_send_log. A private processing
// journal deduplicates signed receipt identities and retains early arrivals; it is not a second
// delivery history, tenant read surface, or notification store.
//
// A configured sender is not proof that receipt tracking is configured. Only verified provider
// events matched to the existing source can establish delivery facts. This handler changes no
// provider settings and does not replay or modify historical outcomes.
//
// SECURITY POSTURE. This endpoint is PUBLIC by necessity: Resend calls it with no bearer token, so
// `verify_jwt` must be off for it. The signature IS the authentication. An unsigned or badly signed
// request is rejected before a single row is written, and a request that cannot be verified because
// the secret is unset is rejected too — never accepted "for now".
import { createClient } from "npm:@supabase/supabase-js@2";
import { persistVerifiedReceipt, readReceiptBody } from "./handler.ts";

const WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";

// Resend's event names, mapped onto the statuses `email_send_log` now accepts. Anything not on this
// list is acknowledged and ignored rather than guessed at: an unrecognised event written as an
// invented status would fail the CHECK constraint and, worse, would make the log say something the
// provider never said.
const EVENT_STATUS: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Constant-time compare. A timing-variable `===` on a signature leaks it a byte at a time. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * The `<ArrayBuffer>` is not decoration. `new Uint8Array(n)` infers the widened
 * `Uint8Array<ArrayBufferLike>`, whose buffer could in principle be a `SharedArrayBuffer`, and
 * `crypto.subtle.importKey` takes a `BufferSource` that cannot be one — so the widened type is
 * refused at the call site. Allocating the `ArrayBuffer` explicitly makes the narrower type TRUE
 * rather than asserting it with a cast. Every other HMAC call site in this tree passes
 * `TextEncoder.encode(...)`, which is already typed this way, which is why none of them hit it.
 */
function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Svix signature verification, implemented directly rather than pulled in as a dependency.
 *
 * The signed payload is `${id}.${timestamp}.${body}` and the secret is base64 after its `whsec_`
 * prefix. `svix-signature` may carry SEVERAL space-separated signatures (that is how Svix rotates
 * secrets), so every one is checked and any single match passes.
 */
async function verify(secret: string, id: string, timestamp: string, signature: string, body: string): Promise<boolean> {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array<ArrayBuffer>;
  try { keyBytes = b64ToBytes(raw); } catch { return false; }

  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  );

  for (const part of signature.split(" ")) {
    // Each part is `v1,<base64>`. Versions other than v1 are not understood and are not guessed at.
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    try { if (timingSafeEqual(mac, b64ToBytes(value))) return true; } catch { /* malformed part */ }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  // FAIL CLOSED. With no secret there is no way to tell Resend from anyone who found the URL, and
  // this endpoint writes to a table the product now reports from. Accepting unverified events would
  // let a stranger tell an owner their invitation had been opened.
  if (!WEBHOOK_SECRET) {
    console.error("receipt_not_configured");
    return json({ ok: false, error: "webhook not configured" }, 503);
  }

  const id = req.headers.get("svix-id") ?? "";
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signature = req.headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !signature) return json({ ok: false, error: "unsigned request" }, 401);
  if (id.length > 200 || signature.length > 2048) return json({ ok: false, error: "invalid request" }, 401);
  let body: string;
  try { body = await readReceiptBody(req); }
  catch { return json({ ok: false, error: "invalid request" }, 400); }

  // Replay window. A captured, correctly-signed request stays valid for ever without one; five
  // minutes is Svix's own recommendation and is generous for a webhook.
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60 * 1000) {
    return json({ ok: false, error: "stale or malformed timestamp" }, 401);
  }

  if (!(await verify(WEBHOOK_SECRET, id, timestamp, signature, body).catch(() => false))) {
    console.error("receipt_signature_rejected");
    return json({ ok: false, error: "invalid signature" }, 401);
  }

  // Signature verified above. Persist only minimal allowlisted receipt fields;
  // source resolution, deduplication and pending reconciliation are atomic in SQL.
  return persistVerifiedReceipt(body, id, EVENT_STATUS, {
    log: category => console.info(category),
    ingest: async receipt => {
      const url = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !serviceKey) return { data: null, error: true };
      const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
      return await admin.rpc("ingest_resend_receipt", {
        _receipt_id: receipt.receiptId, _message_id: receipt.messageId,
        _status: receipt.status, _event_at: receipt.eventAt,
      });
    },
  });
});
