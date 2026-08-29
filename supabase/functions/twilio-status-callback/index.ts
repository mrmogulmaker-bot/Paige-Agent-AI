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

// #168 VOICE EXTENSION (§18 extend, not fork): this fn now ALSO receives Twilio CALL-status callbacks
// (the voice-twiml <Number>/<Client> statusCallback), which carry CallSid + CallStatus + CallDuration
// (never MessageSid). A top-of-handler branch detects and handles those, stamping the voice row's
// terminal status + call_duration_seconds. The SMS DLR path below is UNCHANGED — a call payload has no
// MessageSid, so it can never reach the message logic (§37: the message branch reads MessageSid/SmsSid,
// the voice branch reads CallSid; disjoint by construction). The pure CallStatus mapping lives in
// ./call-status.ts and is smoke-tested headless (§32).
//
// Fleet Comms S3 P3 (§9/§53): the voice branch now resolves BOTH scopes by WHERE the row lives (the
// CallSid is globally unique and in exactly ONE store): TENANT public.messages OR OPERATOR
// public.operator_messages. A tenant call updates only messages; an operator call updates only
// operator_messages — never crossing (no guessing scope). It also persists recording_url / transcript
// when Twilio provides them (null otherwise — never fabricated, §13; recording is not enabled on the
// <Dial> yet, so today they are null — the read is defensive so enabling it later needs no code change).
import { authenticateTwilioWebhook, type WebhookAuthOutcome } from "../_shared/twilio-webhook-auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapCallStatus, callMatchSids, parseCallDuration, nonEmptyOrNull } from "./call-status.ts";

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

/**
 * FAIL CLOSED — same repair as handle-inbound-sms. With no auth token set, the
 * previous version accepted any unsigned POST, so a forged MessageSid could
 * mark another tenant's message delivered, or write attacker-supplied text into
 * `messages.error`, which the inbox renders.
 *
 * A delivery receipt carries no `To` we can key a tenant off, so the stamped
 * per-number secret in the URL is the proof here.
 */
async function verifyTwilio(req: Request, rawBody: string, admin: Admin): Promise<WebhookAuthOutcome> {
  const offered = new URL(req.url).searchParams.get("t");
  let expectedSecret: string | null = null;
  if (offered) {
    const { data } = await admin
      .from("tenant_twilio_subaccounts")
      .select("inbound_webhook_secret")
      .eq("inbound_webhook_secret", offered)
      .maybeSingle();
    expectedSecret = data?.inbound_webhook_secret ?? null;
  }
  return await authenticateTwilioWebhook(req, rawBody, { expectedSecret });
}

/** The REAL call facts a completion callback carries — resolved once, applied to whichever store owns the row. */
interface CallFacts {
  mapped: string;
  duration: number | null;
  recordingUrl: string | null;
  transcript: string | null;
  twilioStatus: string;
  callSid: string;
}

/**
 * Apply a completion callback's facts to the ONE matched voice row, on EITHER store (§18 one applier).
 * `table`/`metaKey` differ by scope: TENANT public.messages uses the `meta` jsonb + has an `updated_at`
 * column; OPERATOR public.operator_messages uses the `metadata` jsonb + has NO `updated_at` column. Status
 * is ADVANCE-ONLY (shouldApply: queued → delivered/failed advances; a duplicate 'completed' won't regress
 * delivered but STILL records duration). meta.call is merged non-destructively (§13). recording_url /
 * transcript are stamped ONLY when Twilio actually provided them (null otherwise — never fabricated, §13).
 */
async function applyCallUpdate(
  // deno-lint-ignore no-explicit-any
  admin: any,
  table: "messages" | "operator_messages",
  metaKey: "meta" | "metadata",
  row: { id: string; status: string | null; meta?: unknown; metadata?: unknown },
  f: CallFacts,
): Promise<Response> {
  const nowIso = new Date().toISOString();
  const currentStatus = String(row.status ?? "");
  const advance = shouldApply(currentStatus, f.mapped);

  const prevMetaRaw = (row as Record<string, unknown>)[metaKey];
  const prevMeta = (prevMetaRaw && typeof prevMetaRaw === "object" ? prevMetaRaw : {}) as Record<string, unknown>;
  const prevCall = (prevMeta.call && typeof prevMeta.call === "object" ? prevMeta.call : {}) as Record<string, unknown>;
  const call: Record<string, unknown> = {
    ...prevCall,
    provider: "twilio",
    provider_status: f.twilioStatus,
    mapped_status: f.mapped,
    updated_at: nowIso,
  };
  if (f.duration !== null) call.duration_seconds = f.duration;

  const update: Record<string, unknown> = { [metaKey]: { ...prevMeta, call } };
  // Only public.messages has an updated_at column; operator_messages does not (§13 — never write a
  // column that doesn't exist, which would 42703-fail the whole update and lose the real facts).
  if (table === "messages") update.updated_at = nowIso;
  if (advance) update.status = f.mapped;
  // Duration / recording / transcript are stamped whenever Twilio reports them, independent of the
  // advance-only status guard. null ⇒ omitted (never overwrites a prior real value with null, §13).
  if (f.duration !== null) update.call_duration_seconds = f.duration;
  if (f.recordingUrl !== null) update.recording_url = f.recordingUrl;
  if (f.transcript !== null) update.transcript = f.transcript;

  const { error: updErr } = await admin.from(table).update(update).eq("id", row.id);
  if (updErr) {
    console.error(`[twilio-status-callback] ${table} voice update_error`, updErr, "callSid=", f.callSid);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  console.log(
    `[twilio-status-callback] ${table} voice callSid=${f.callSid} twilio="${f.twilioStatus}" mapped=${f.mapped} ` +
      `from=${currentStatus} applied=${advance}${f.duration !== null ? ` dur=${f.duration}s` : ""}` +
      `${f.recordingUrl ? " +rec" : ""}${f.transcript ? " +transcript" : ""}`,
  );
  return new Response("ok", { status: 200, headers: corsHeaders });
}

/**
 * #168 + Fleet Comms S3 P3 — stamp a VOICE row's terminal status + call_duration_seconds (+ recording_url /
 * transcript when Twilio provides them) from a Twilio call-status callback, on the CORRECT scope. Matched on
 * provider_message_id = the parent Call SID (voice-twiml / operator voice writer stored it); the child-leg
 * callback carries ParentCallSid (that parent) + CallSid (the child), so we match on either (callMatchSids).
 *
 * SCOPE RESOLUTION (§9/§53) — the CallSid is globally unique and lives in EXACTLY ONE store, so we resolve
 * the scope by WHERE the row is, never by guessing: try TENANT public.messages first, then OPERATOR
 * public.operator_messages. A tenant call updates only messages; an operator call updates only
 * operator_messages — the two scopes never cross. No matching row in either ⇒ log + 200, never a fabricated
 * row (§13). Ack 200 on every DB blip so Twilio doesn't hammer retries.
 */
async function handleCallStatus(
  params: URLSearchParams,
  callSid: string,
  twilioStatus: string,
): Promise<Response> {
  const parentCallSid = params.get("ParentCallSid") ?? "";
  const mapped = mapCallStatus(twilioStatus);
  if (!mapped) {
    console.log(`[twilio-status-callback] unmapped CallStatus="${twilioStatus}" callSid=${callSid} — ack, no update`);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  const sids = callMatchSids(callSid, parentCallSid);
  // The REAL facts Twilio sent — recording/transcript are read defensively so that once recording is
  // enabled on the <Dial> (not yet — human-answered bridge only), the same URL persists them with no
  // code change; today they are null and stored null (§13, never fabricated).
  const facts: CallFacts = {
    mapped,
    duration: parseCallDuration(params.get("CallDuration")),
    recordingUrl: nonEmptyOrNull(params.get("RecordingUrl")),
    transcript: nonEmptyOrNull(params.get("TranscriptionText")),
    twilioStatus,
    callSid,
  };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // 1) TENANT store. channel_type='voice' is defensive scoping (provider_message_id is globally unique,
  //    so a message row could never collide, but this guarantees we never touch a non-voice row).
  const { data: tRow, error: tErr } = await admin
    .from("messages")
    .select("id, status, meta")
    .in("provider_message_id", sids)
    .eq("channel_type", "voice")
    .maybeSingle();
  if (tErr) {
    console.error("[twilio-status-callback] messages voice lookup_error", tErr, "sids=", sids.join("|"));
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (tRow) {
    return await applyCallUpdate(admin, "messages", "meta", tRow, facts);
  }

  // 2) OPERATOR store (§9/§53). Reached ONLY when no tenant row matched — the SID lives in one store, so
  //    this is scope-resolution by the row, never a guess. Operator rows carry NO tenant_id.
  const { data: oRow, error: oErr } = await admin
    .from("operator_messages")
    .select("id, status, metadata")
    .in("provider_message_id", sids)
    .eq("channel_type", "voice")
    .maybeSingle();
  if (oErr) {
    console.error("[twilio-status-callback] operator_messages voice lookup_error", oErr, "sids=", sids.join("|"));
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (oRow) {
    return await applyCallUpdate(admin, "operator_messages", "metadata", oRow, facts);
  }

  // No voice row in EITHER store (e.g. the start-of-call write was skipped on an honest degrade).
  // Log + 200; NEVER fabricate a row (§13).
  console.log(`[twilio-status-callback] no voice row (tenant or operator) for callSid=${callSid} parent=${parentCallSid} — ack, no fabrication`);
  return new Response("ok", { status: 200, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const rawBody = await req.text();
  const authAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = await verifyTwilio(req, rawBody, authAdmin);
  if (!auth.ok) {
    console.error(`[twilio-status-callback] REFUSED unauthenticated callback: ${auth.reason}`);
    return new Response("unauthenticated", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);

  // #168 VOICE branch — a call-status callback carries CallSid + CallStatus (never MessageSid). Handle
  // it and return; the SMS DLR path below is reached ONLY by message callbacks (disjoint fields, §37).
  const callSid = params.get("CallSid") ?? "";
  const callStatusRaw = (params.get("CallStatus") ?? "").trim();
  if (callSid && callStatusRaw) {
    return await handleCallStatus(params, callSid, callStatusRaw);
  }

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
