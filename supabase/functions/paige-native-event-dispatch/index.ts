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
// -- SCOPE (honest, §13) — Layer C slice 1 -----------------------------------------------------
// This delivers the EVENT to its subscribers AND runs the governed act-execution engine
// (_shared/paige-orchestration): per subscriber it evaluates conditions, resolves the effective
// autonomy lane (grant ∧ most-restrictive act floor ∧ Trust-Compass ceiling ∧ §68 decay), and runs
// the ONE governed pathway (decideGovernedExecution) per act, recording the EXACT per-act outcome
// in paige_act_executions. It performs NO external send yet — an authorized act stops at
// `accepted_for_execution`; the connector-neutral adapter DISPATCH (n8n first) + signed readback +
// CRM update is slice 2. `acts_executed` is recorded true ONLY when an act truly executed (never in
// slice 1), so Paige can say "the event fired, reached N subscribers, and here is each act's exact
// governed outcome" — never a blanket "automation ran".
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
import { runEventActs, type AutomationRow, type ClaimedEvent, type EngineDb } from "../_shared/paige-orchestration/engine.ts";

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
      .select("id, name, granted_lane, conditions, created_by, state")
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

    // -- 4. Run the governed act-execution engine (Layer C). For each subscriber it evaluates the
    //    process's conditions (this CLOSES the former TODO F3 — a subscriber whose conditions exclude
    //    the event no longer even reaches an act), resolves the effective autonomy lane (grant ∧
    //    most-restrictive act floor ∧ Trust-Compass ceiling ∧ §68 decay), and runs the ONE governed
    //    pathway per act — recording the EXACT per-act outcome (condition_not_matched / held_by_lane /
    //    approval_pending / refused_* / accepted_for_execution / failed) in paige_act_executions,
    //    fire-once. SLICE 1 stops at accepted_for_execution; the external adapter dispatch + signed
    //    readback + CRM update is slice 2. A high external-effect act on an `auto` process correctly
    //    HOLDS for approval — the lane alone never authorizes a high act (§67 / RE-2 grant lift). --
    const engine = await runEventActs(
      admin as unknown as EngineDb,
      {
        event_id: eventId, tenant_id: tenantId, event_key: eventKey,
        subject_table: claim.subject_table, subject_id: claim.subject_id, payload: claim.payload ?? {},
      } as ClaimedEvent,
      (subscribers as any[]).map((s): AutomationRow => ({
        id: s.id, name: s.name, granted_lane: s.granted_lane,
        conditions: s.conditions, created_by: s.created_by ?? null, state: s.state,
      })),
    );

    // -- 5. Record DELIVERY per subscriber (paige_event_dispatches), now carrying the EXACT per-act
    //    outcomes from the engine. `acts_executed` is TRUE only if an act actually reached the
    //    `executed` outcome (never in slice 1) — never a blanket claim (§13 / owner directive). --
    for (const sub of subscribers) {
      if (alreadyDone.has(sub.id)) { delivered.push(sub.id); continue; }
      const actRecs = engine.records.filter((r) => r.automation_id === sub.id);
      const acts = actRecs.map((r) => ({
        act_id: r.act_id, position: r.act_position, adapter: r.adapter_kind, outcome: r.outcome,
      }));
      const anyExecuted = actRecs.some((r) => r.outcome === "executed");
      const { error: upErr } = await admin
        .from("paige_event_dispatches")
        .upsert(
          {
            event_id: eventId,
            automation_id: sub.id,
            tenant_id: tenantId,
            status: "done",
            result: { delivered: true, acts_governed: actRecs.length, acts_executed: anyExecuted, acts },
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
      act_outcomes: engine.by_outcome,
      terminal,
    }, 200);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await failEvent(msg);
    return json({ error: "dispatch_error", detail: msg.slice(0, 1000) }, 500);
  }
});
