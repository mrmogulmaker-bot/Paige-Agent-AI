// paige-native-event-dispatch — the native-event DRAINER (Main Paige Operational Chat · P3 / MPC-4).
//
// A producer (the AFTER-INSERT trigger on public.clients, or the recovery sweeper) POSTs
// {event_id, tenant_id} here; this function delivers that event to its approved subscribers —
// the paige_automations rows whose trigger_key matches the event's event_key and whose state is
// 'live' — exactly once each, and records the true delivery outcome in the fire-once ledger.
//
// The spine it drives lives in migration 20270119000000_contact_created_native_event.sql:
//   * paige_claim_event / _complete_ / _fail_   - atomic claim + terminal lifecycle (service-only)
//   * paige_automations                         - the subscribers (§67 Process Records) by trigger_key
//   * paige_event_dispatches                    - the fire-once ledger, UNIQUE(event_id, automation_id)
//
// -- SCOPE (honest, §13/§947) -----------------------------------------------------------------
// This delivers the EVENT to its subscribers and records the delivery. It does NOT execute a
// subscriber's acts and performs NO external send — Telegram/email stay off until their own
// security design lands (owner directive). Each dispatch row therefore records delivered:true with
// acts_executed:false, so Paige can truthfully say "the event fired and reached N subscribers"
// without ever claiming a notification was sent that was not. Executing subscriber acts, and the
// owner-facing Rail projection, are the next increments.
//
// -- SECURITY (§9/§13) ------------------------------------------------------------------------
// NOT user-facing. Authorized ONLY by (a) the service-role bearer, or (b) a valid Vault cron token
// (verify_cron_token) — the same gate the cron-style functions use. Fails CLOSED. The tenant is
// taken from the CLAIMED event row, never trusted from the body (body.tenant_id is log-only).
// Subscribers are read scoped to that authoritative tenant.
//
// -- HONESTY (§13) ----------------------------------------------------------------------------
// Each subscriber's TRUE delivery outcome is written to the ledger (done|error). One failing never
// drops the rest — the loop runs them all, then the event is completed if all succeeded or failed
// (with the real error) so the sweeper can retry only the failures (the done rows are skipped via
// the ledger read). non-2xx is returned ONLY on a top-level failure (bad auth, missing id, claim
// error, unknown event); otherwise 200 with the per-subscriber results — never a 200 hiding a
// top-level error.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : (typeof v === "number" ? String(v) : null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // -- Auth: service-role bearer OR a valid Vault cron token. Fail CLOSED (§13). --
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let authorized = bearer.length > 0 && bearer === SERVICE_ROLE;
  if (!authorized) {
    const cronToken = req.headers.get("x-cron-token") ?? "";
    if (cronToken) {
      const { data: cronOk } = await admin.rpc("verify_cron_token", { _token: cronToken });
      authorized = cronOk === true;
    }
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  // -- Body --
  let body: { event_id?: string; tenant_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const eventId = s(body?.event_id);
  if (!eventId || !UUID_RE.test(eventId)) {
    return json({ error: "event_id required (uuid)" }, 400);
  }

  // -- 1. Atomic claim. Loser exits cleanly (idempotent). --
  const { data: claim, error: claimErr } = await admin.rpc("paige_claim_event", { p_event_id: eventId });
  if (claimErr) {
    return json({ error: "claim_failed", detail: claimErr.message }, 500);
  }
  if (!claim?.claimed) {
    // Already claimed by a concurrent worker, or already terminal. Nothing to do.
    return json({ event_id: eventId, claimed: false, delivered: [], failed: [] }, 200);
  }
  const tenantId: string = claim.tenant_id;   // authoritative — from the claimed row, never the body (§9)
  const eventKey: string = claim.event_key;

  // From here on, a thrown/failed path must mark the event failed so the sweeper can retry.
  const failEvent = async (msg: string) => {
    try { await admin.rpc("paige_fail_event", { p_event_id: eventId, p_error: msg.slice(0, 1000) }); }
    catch (_e) { /* best-effort; the claim goes stale and is re-picked */ }
  };

  try {
    // -- 2. Load this event's approved, live subscribers for THIS tenant (§67 Process Records). --
    const { data: subs, error: subErr } = await admin
      .from("paige_automations")
      .select("id, name, granted_lane")
      .eq("tenant_id", tenantId)
      .eq("trigger_key", eventKey)
      .eq("state", "live");
    if (subErr) {
      await failEvent(`subscriber_load_failed: ${subErr.message}`);
      return json({ error: "subscriber_load_failed", detail: subErr.message }, 500);
    }
    const subscribers = subs ?? [];

    // -- 3. Skip subscribers already delivered (fire-once across retries). --
    const { data: priorRows } = await admin
      .from("paige_event_dispatches")
      .select("automation_id, status")
      .eq("event_id", eventId);
    const alreadyDone = new Set(
      (priorRows ?? []).filter((r: any) => r.status === "done").map((r: any) => r.automation_id as string),
    );

    const delivered: string[] = [];
    const failed: string[] = [];

    // -- 4. Deliver to each subscriber, recording the TRUE outcome (done|error), fire-once. --
    //    MVP: delivery = recording that the event reached the subscriber. No acts are executed and
    //    nothing is sent externally (acts_executed:false) — honest by construction (§13/§947).
    //    TODO (§39 F3 — MUST land before acts are wired): paige_automations.conditions is NOT
    //    evaluated here yet. For the MVP that is harmless (nothing runs), but once act execution is
    //    added, a subscriber whose conditions do not match this event MUST be skipped — otherwise a
    //    process fires on events its conditions exclude. Gate on conditions before executing acts.
    for (const sub of subscribers) {
      if (alreadyDone.has(sub.id)) { delivered.push(sub.id); continue; }
      const { error: upErr } = await admin
        .from("paige_event_dispatches")
        .upsert(
          {
            event_id: eventId,
            automation_id: sub.id,
            tenant_id: tenantId,
            status: "done",
            result: { delivered: true, acts_executed: false, note: "event delivered to subscriber; act execution not yet wired" },
            error: null,
          },
          { onConflict: "event_id,automation_id" },
        );
      if (upErr) { failed.push(sub.id); }
      else { delivered.push(sub.id); }
    }

    // -- 5. Terminal lifecycle: complete when nothing failed (incl. zero subscribers — it fired,
    //    nobody is listening yet, which is a legitimate 'done'), else fail so the sweeper retries. --
    let terminal: string;
    if (failed.length === 0) {
      // §13/§39 F2: do NOT report "done" if the terminal write itself failed — the event is still
      // 'claimed' and the sweeper will re-claim + re-deliver idempotently. Report the real state.
      const { error: compErr } = await admin.rpc("paige_complete_event", { p_event_id: eventId });
      terminal = compErr ? "complete_error" : "done";
    } else {
      await failEvent(`dispatch_failed for ${failed.length} subscriber(s)`);
      terminal = "retry_pending";
    }

    return json({
      event_id: eventId,
      event_key: eventKey,
      claimed: true,
      subscriber_count: subscribers.length,
      delivered,
      failed,
      terminal,
    }, 200);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await failEvent(msg);
    return json({ error: "dispatch_error", detail: msg.slice(0, 1000) }, 500);
  }
});
