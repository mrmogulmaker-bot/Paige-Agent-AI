// paige-heartbeat — the proactive COO beat (roadmap #111 / decision #19 layer 3).
//
// THE PROMISE THIS KEEPS (feature-crew synthesis): "Paige shows up between logins with
// the follow-up already written." A daily beat that finds clients gone quiet, files a
// client.followup action (the kind email-composer drafts → the coach's approval lane),
// and lets the EXISTING machinery do the rest: paige-action-worker (*/2) drafts it,
// receipts land on the Rail with the desk's name, and the COO briefing book opens with
// "CURA — Re-engagement: <client> — WAITING ON YOUR APPROVAL".
//
// -- SIGNAL (MVP, honest) ------------------------------------------------------------------------
// A client is STALE when their last message activity (public.messages by contact) is
// older than STALE_DAYS, or they have no messages at all and were created more than
// NEW_CLIENT_DAYS ago (onboarded but never engaged). Thresholds are env-tunable; the
// scoring grows richer (portal logins, journey stages vs the game plan) in later beats.
//
// -- GAME-PLAN CORRELATION (owner directive 2026-09-11: features correlate, never double-code) --
// When the tenant has a live business_mission (the Game Plan's spine record), its
// title/state rides the action payload as mission_context — client work speaks the
// game plan's language. Absent mission → the field is absent (null is never guessed).
//
// -- IDEMPOTENCY (durable-job contract kinship) ---------------------------------------------------
// One open client.followup per contact: a client already queued for re-engagement is
// never re-filed. Terminal actions don't block a future beat.
//
// -- SECURITY (§9/§13) -----------------------------------------------------------------------------
// Service-role bearer or Vault cron token only (verify_cron_token). Tenant comes from
// each CLIENT row, never the request. FILING ONLY — nothing is sent; the send still
// waits for a human yes in the approval lane. Cap per run so a first-ever beat cannot
// flood the queue (HEARTBEAT_MAX_FILE).

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STALE_DAYS = Number(Deno.env.get("HEARTBEAT_STALE_DAYS") ?? 14);
const NEW_CLIENT_DAYS = Number(Deno.env.get("HEARTBEAT_NEW_CLIENT_DAYS") ?? 7);
const MAX_FILE = Number(Deno.env.get("HEARTBEAT_MAX_FILE") ?? 5);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

  // 1) Stale clients: last activity older than STALE_DAYS (or never engaged after
  //    NEW_CLIENT_DAYS). One row per client with their activity fingerprint.
  const { data: stale, error: staleErr } = await admin.rpc("heartbeat_stale_clients", {
    p_stale_days: STALE_DAYS,
    p_new_client_days: NEW_CLIENT_DAYS,
    p_limit: MAX_FILE,
  });
  if (staleErr) return json({ error: "stale_scan_failed", detail: staleErr.message }, 500);
  const rows = (stale ?? []) as Array<{
    client_id: string; tenant_id: string; client_name: string | null;
    days_silent: number | null; last_activity_at: string | null;
    mission_title: string | null; mission_state: string | null;
  }>;
  if (!rows.length) return json({ ok: true, filed: 0 }, 200);

  const filed: string[] = [];
  for (const r of rows) {
    const name = (r.client_name ?? "a client").trim() || "a client";
    const { error: fileErr } = await admin.rpc("file_action", {
      p_action_kind: "client.followup",
      p_title: `Re-engagement: ${name}`,
      p_summary: r.days_silent == null
        ? `${name} onboarded but never engaged — heartbeat save play.`
        : `No contact with ${name} in ${r.days_silent} days — heartbeat save play.`,
      p_contact_id: r.client_id,
      p_payload: {
        source: "paige-heartbeat",
        days_silent: r.days_silent,
        last_activity_at: r.last_activity_at,
        ...(r.mission_title ? { mission_context: { title: r.mission_title, state: r.mission_state } } : {}),
        // The drafting brief the worker spreads into the composer's input contract.
        draft_input: {
          intent: r.days_silent == null
            ? `Re-engage a client who onboarded but never engaged — restart the relationship warmly.`
            : `Re-engage a client who has gone quiet for ${r.days_silent} days — check in, add value, invite a next step.`,
          key_points: [
            r.days_silent == null
              ? "They signed up but we have never really talked"
              : `It has been ${r.days_silent} days since our last exchange`,
            ...(r.mission_title ? [`Current focus: ${r.mission_title}`] : []),
          ],
          tone: "warm",
          cta: "invite a quick call or a simple reply",
        },
      },
      p_to_department: "owner_ops",
      p_priority: "normal",
      p_created_by_agent: "paige-heartbeat",
      p_tenant_id: r.tenant_id,
    });
    if (fileErr) {
      console.error("[paige-heartbeat] file failed", r.client_id, fileErr.message);
      continue;
    }
    filed.push(r.client_id);
  }

  return json({ ok: true, scanned: rows.length, filed: filed.length, client_ids: filed }, 200);
});
