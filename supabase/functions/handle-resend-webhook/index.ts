// handle-resend-webhook — the listener that did not exist.
//
// WHY THIS IS NEW RATHER THAN AN EXTENSION. The platform already has ONE email-truth table
// (`public.email_send_log`) and one suppression receiver (`handle-email-suppression`) — but that
// receiver is Mailgun-shaped, arrives via the Go API, and is verified with the Lovable webhook
// helper. Resend signs with Svix and speaks a different event vocabulary, so its events need their
// own door. What they do NOT need is their own table: every event below appends to the same
// `email_send_log` the eight existing senders already write (§18, one home for email truth).
//
// WHAT THIS CHANGES ABOUT WHAT WE CAN SAY. Before it, the strongest honest claim about an
// invitation was "the POST to the provider was accepted". Nothing in the system could distinguish
// accepted-by-Resend from landed-in-an-inbox from read. Resend has been recording delivery, opens
// and clicks for `paigeagent.ai` all along (both tracking flags are ON) and the account had ZERO
// webhooks configured — the data existed and nothing was listening.
//
// SECURITY POSTURE. This endpoint is PUBLIC by necessity: Resend calls it with no bearer token, so
// `verify_jwt` must be off for it. The signature IS the authentication. An unsigned or badly signed
// request is rejected before a single row is written, and a request that cannot be verified because
// the secret is unset is rejected too — never accepted "for now".
import { createClient } from "npm:@supabase/supabase-js@2";

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
    console.error("[handle-resend-webhook] RESEND_WEBHOOK_SECRET is not set; refusing every event");
    return json({ ok: false, error: "webhook not configured" }, 503);
  }

  const id = req.headers.get("svix-id") ?? "";
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signature = req.headers.get("svix-signature") ?? "";
  const body = await req.text();
  if (!id || !timestamp || !signature) return json({ ok: false, error: "unsigned request" }, 401);

  // Replay window. A captured, correctly-signed request stays valid for ever without one; five
  // minutes is Svix's own recommendation and is generous for a webhook.
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60 * 1000) {
    return json({ ok: false, error: "stale or malformed timestamp" }, 401);
  }

  if (!(await verify(WEBHOOK_SECRET, id, timestamp, signature, body))) {
    console.error("[handle-resend-webhook] signature rejected");
    return json({ ok: false, error: "invalid signature" }, 401);
  }

  let event: { type?: string; created_at?: string; data?: { email_id?: string; to?: string[]; subject?: string } };
  try { event = JSON.parse(body); } catch { return json({ ok: false, error: "bad payload" }, 400); }

  const status = EVENT_STATUS[String(event.type ?? "")];
  // 200 on purpose. An event we do not model is not an error on Resend's side, and answering
  // non-2xx would make them retry something we will never accept.
  if (!status) return json({ ok: true, ignored: String(event.type ?? "unknown") });

  const messageId = event.data?.email_id ?? null;
  if (!messageId) return json({ ok: true, ignored: "no email_id" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, error: "server not configured" }, 500);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Find the row the SENDER wrote, to inherit its tenant, recipient and invitation. Delivery events
  // carry a message id and nothing else we can trust: `data.to` is the provider's copy of the
  // address, and reading tenancy from an inbound payload would let the payload choose the tenant.
  const { data: origin, error: originError } = await admin
    .from("email_send_log")
    .select("tenant_id, recipient_email, template_name, metadata")
    .eq("message_id", messageId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // A FAILED LOOKUP IS NOT AN ABSENT ROW, and supabase-js does not throw — it returns
  // `{ data: null, error }`. Reading only `data` made a transient PostgREST failure indistinguishable
  // from "we never sent this", and the branch below would then answer 200 and Resend would never
  // retry: the event is lost for ever, which is precisely the silence this function exists to end.
  // 500 first, so a retry can still find the row once the database is reachable again.
  if (originError) {
    console.error("[handle-resend-webhook] origin lookup failed", originError.message);
    return json({ ok: false, error: "could not resolve the originating send" }, 500);
  }

  // An event for an email this platform has no record of sending. Acknowledged, never written:
  // a row with no tenant is a row no RLS policy can scope.
  if (!origin) return json({ ok: true, ignored: "unknown message_id" });

  // APPEND, never update. The whole point is the timeline — collapsing it to a single mutable
  // status would answer "what is it now" and lose "when did it arrive", which is half the question.
  // Duplicate deliveries from a provider retry are tolerated by design: a repeated `delivered` is
  // harmless, and de-duplicating would risk discarding a genuine second open or click.
  const { error } = await admin.from("email_send_log").insert({
    template_name: origin.template_name,
    recipient_email: origin.recipient_email,
    message_id: messageId,
    status,
    tenant_id: origin.tenant_id,
    sender_account: "platform",
    metadata: {
      via: "handle-resend-webhook",
      event: event.type,
      svix_id: id,
      // Carried forward so the invitation read can find this event by invite, exactly as it finds
      // the original send.
      invite_id: (origin.metadata as { invite_id?: string } | null)?.invite_id ?? null,
      provider_created_at: event.created_at ?? null,
    },
  });

  if (error) {
    // `idx_email_send_log_message_sent_unique` (20260318203215) is UNIQUE on `message_id` WHERE
    // `status = 'sent'` — a pre-existing safety net against a worker double-sending. The sender
    // already writes that row, so an inbound `email.sent` is redundant BY CONSTRUCTION and its
    // insert always violates the index. Answering 500 there would have made every `email.sent`
    // event fail permanently and Resend retry it for ever — triggered by the very act of
    // subscribing to `email.*`. It is not a failure: the fact the event reports is already
    // recorded, so the honest answer is that there was nothing left to do.
    if (error.code === "23505") {
      return json({ ok: true, ignored: "already recorded", status });
    }
    console.error("[handle-resend-webhook] insert failed", error.message);
    // 500 so Resend retries. Losing a delivery event silently is the failure this function exists
    // to end, so it must not answer 200 for work it did not do.
    return json({ ok: false, error: "could not record event" }, 500);
  }

  return json({ ok: true, recorded: status });
});
