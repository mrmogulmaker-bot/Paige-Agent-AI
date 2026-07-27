// Twilio SMS delivery-receipt (DLR) status-callback handler — Comms C-2s-C.
//
// send-message/index.ts (~L622) already points each outbound SMS's per-message
// StatusCallback at  <supabaseUrl>/functions/v1/twilio-status-callback  (or the
// TWILIO_STATUS_CALLBACK_URL override). Until now that callback was DEAD — this
// function is the receiver it always referenced. It is a genuinely-new fn (§18:
// not a second suppression store, not a rival webhook — the ONLY consumer of the
// URL send-message computes), so nothing existing is re-scaffolded.
//
// Twilio POSTs application/x-www-form-urlencoded with (at least):
//   MessageSid     — the provider message id (== messages.provider_message_id)
//   MessageStatus  — queued | sent | delivered | undelivered | failed | ... (+ read for WA/RCS)
//   ErrorCode      — numeric Twilio error code, present on undelivered/failed
//
// Behavior (task spec):
//   • Verify x-twilio-signature (mirrors handle-inbound-sms exactly, §-webhook-security).
//   • Map Twilio status -> messages.status and UPDATE the row keyed by
//     provider_message_id = MessageSid, ADVANCE-ONLY (never regress a
//     delivered/read row backward, §13 honest state).
//   • Record the REAL status Twilio sent (never a fabricated delivered/opt-out),
//     persist ErrorCode into the existing messages.error column on failure, and
//     stamp a delivered timestamp on delivery (see the delivered_at gap note).
//   • If no messages row matches the MessageSid: log + 200 (Twilio retries on a
//     non-2xx, and a phantom row would violate §13) — never fabricate a row.
//
// §9  The row is matched by provider_message_id, which is GLOBALLY UNIQUE from
//     Twilio (uq_messages_provider_message_id partial unique index), so the
//     service-role UPDATE is scoped to exactly one row (.eq("id", row.id) after
//     the lookup) — no cross-tenant write is possible. verify_jwt MUST be false:
//     Twilio cannot present a Supabase JWT.
//
// §37 messages.status gains a NEW WRITER here (delivered/failed/sent/queued/read).
//     These are all pre-existing enum values already produced by send-message and
//     already consumed by ClientsConversations.tsx (delivered/read/sent -> "Sent"
//     pill; failed -> "Failed" pill showing messages.error). No new enum value,
//     no consumer break. The pre-send reader (pre-send-pipeline.ts) is untouched.
//
// delivered_at GAP (§13, honest): the C-1 messages table (migration
// 20260726190000) has NO delivered_at column — it has sent_at (occurred-at:
// send-at for outbound), error, and a meta jsonb catch-all. A migration is out
// of scope for THIS lane (dlr owns only this fn), so the delivered timestamp is
// stored NON-DESTRUCTIVELY in meta.dlr.delivered_at (never overwriting sent_at,
// which would corrupt the send occurred-at). The report FLAGS that a first-class
// messages.delivered_at column is the right home in a follow-up migration.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};

// Twilio MessageStatus -> messages.status enum (draft,queued,sent,delivered,failed,received,read).
// Only statuses that map to a real enum value are actioned; anything else is logged + 200.
const STATUS_MAP: Record<string, string> = {
  accepted: "queued",
  scheduled: "queued",
  queued: "queued",
  sending: "queued",
  sent: "sent",
  delivered: "delivered",
  undelivered: "failed",
  failed: "failed",
  read: "read", // WhatsApp/RCS; harmless for plain SMS which never sends it
};

// Forward-progress ladder for the ADVANCE-ONLY guard. failed is intentionally
// absent — it is a side track handled explicitly in shouldApply().
const RANK: Record<string, number> = {
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
};

// Never regress a terminal-success (delivered/read) row; among the ladder,
// only advance. A non-terminal row (queued/sent/failed/draft) may take the
// mapped status (e.g. sent -> failed on a late undelivered).
function shouldApply(current: string, mapped: string): boolean {
  if (current === "delivered" || current === "read") {
    return current === "delivered" && mapped === "read";
  }
  if (current in RANK && mapped in RANK) {
    return RANK[mapped] > RANK[current];
  }
  return true;
}

async function verifyTwilio(req: Request, rawBody: string): Promise<boolean> {
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!token) {
    console.warn("[twilio-status-callback] TWILIO_AUTH_TOKEN not set — accepting unsigned");
    return true;
  }
  const sig = req.headers.get("x-twilio-signature");
  if (!sig) return false;
  const url = req.url;
  const params = new URLSearchParams(rawBody);
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const concatenated = url + sorted.map(([k, v]) => k + v).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(concatenated));
  const computed = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return computed === sig;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const rawBody = await req.text();
  const verified = await verifyTwilio(req, rawBody);
  if (!verified) return new Response("invalid_signature", { status: 401 });

  const params = new URLSearchParams(rawBody);
  const messageSid = params.get("MessageSid") ?? params.get("SmsSid") ?? "";
  const twilioStatus = (params.get("MessageStatus") ?? params.get("SmsStatus") ?? "").trim();
  const errorCodeRaw = params.get("ErrorCode");
  const errorCode = errorCodeRaw && errorCodeRaw.trim() !== "" ? errorCodeRaw.trim() : null;

  // A DLR with no MessageSid is unusable — ack 200 so Twilio stops retrying, but
  // do nothing (§13: nothing real to record).
  if (!messageSid) {
    console.warn("[twilio-status-callback] no MessageSid on callback — ignoring");
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const mapped = STATUS_MAP[twilioStatus.toLowerCase()];
  if (!mapped) {
    // An intermediate/unknown Twilio status with no enum home. Ack; do not guess.
    console.log(
      `[twilio-status-callback] unmapped MessageStatus="${twilioStatus}" sid=${messageSid} — ack, no update`,
    );
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Look up the row this DLR belongs to (globally-unique provider_message_id).
  const { data: row, error: lookupErr } = await admin
    .from("messages")
    .select("id, status, meta, error")
    .eq("provider_message_id", messageSid)
    .maybeSingle();

  if (lookupErr) {
    // A DB error is ours, not Twilio's — log it, but still 200 so Twilio does not
    // hammer retries against a transient blip (§13: we did not record a status).
    console.error("[twilio-status-callback] lookup_error", lookupErr, "sid=", messageSid);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (!row) {
    // No matching outbound row (e.g. a send we never persisted, or a number-level
    // callback for a message from another system). Log + 200; NEVER fabricate a
    // row (§13). Twilio would retry on a non-2xx.
    console.log(`[twilio-status-callback] no messages row for sid=${messageSid} — ack, no fabrication`);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const nowIso = new Date().toISOString();
  const currentStatus = String(row.status ?? "");
  const advance = shouldApply(currentStatus, mapped);

  // Merge the REAL DLR facts into meta.dlr non-destructively (§13). We ALWAYS
  // record what Twilio actually reported — even when the status itself does not
  // advance — so the audit trail reflects the true last-seen provider state.
  const prevMeta = (row.meta && typeof row.meta === "object" ? row.meta : {}) as Record<string, unknown>;
  const prevDlr = (prevMeta.dlr && typeof prevMeta.dlr === "object" ? prevMeta.dlr : {}) as Record<string, unknown>;
  const dlr: Record<string, unknown> = {
    ...prevDlr,
    provider: "twilio",
    provider_status: twilioStatus,
    mapped_status: mapped,
    error_code: errorCode,
    updated_at: nowIso,
  };
  // delivered_at lives in meta until a first-class column exists (see header gap note).
  if (mapped === "delivered") dlr.delivered_at = nowIso;

  const update: Record<string, unknown> = {
    meta: { ...prevMeta, dlr },
    updated_at: nowIso,
  };
  if (advance) {
    update.status = mapped;
    // Persist the Twilio error into the existing messages.error column on failure
    // (surfaced by the inbox: ClientsConversations shows m.error on failed rows).
    if (mapped === "failed") {
      update.error = errorCode
        ? `Twilio ${twilioStatus} (error ${errorCode})`
        : `Twilio ${twilioStatus}`;
    }
  }

  // §9: scope the write to the single matched row by primary key.
  const { error: updErr } = await admin.from("messages").update(update).eq("id", row.id);
  if (updErr) {
    console.error("[twilio-status-callback] update_error", updErr, "sid=", messageSid);
    // Ack anyway; a retry would re-run the same idempotent advance-only merge.
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  console.log(
    `[twilio-status-callback] sid=${messageSid} twilio="${twilioStatus}" mapped=${mapped} ` +
      `from=${currentStatus} applied=${advance}${errorCode ? ` errorCode=${errorCode}` : ""}`,
  );
  return new Response("ok", { status: 200, headers: corsHeaders });
});
