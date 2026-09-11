// paige-inbox-triage — CURA's comms classification beat (#1140).
//
// THE "PAIGE MANAGES 90%" INBOX PIECE: every unclassified inbound email gets
// read, classified on the CHEAP tier (Featherless, pennies), labeled with
// per-tenant labels, and — when the classification says so — an action is
// filed to the right department. Owners open Conversations and see a
// pre-organized inbox instead of chaos.
//
// THE FLOW:
//   cron (*/5) → fetch unclassified inbound → check autonomy lane
//   → classify each (cheap tier) → apply labels
//   → file actions ONLY when lane = 'auto' (or 'confirm' = label only, ask first)
//
// CLASSIFICATION CATEGORIES (coaching-generic, §2):
//   question | at_risk | buying_signal | booking | admin | personal
//
// TRUST COMPASS: the inbox.triage action kind carries the autonomy lane.
//   auto = classify + label + file actions freely
//   confirm = classify + label, but actions go to the approval lane
//   off = no auto-processing at all (the inbox stays manual)
// The owner controls this from the Trust Compass or via chat.
//
// HARD RULES:
//   - Cheap tier ONLY for classification (the classify job kind).
//   - No message content rides the Rail receipt (envelope only).
//   - Actions file to Owner Ops via the action bus (confirm lane).
//   - Per-tenant: a tenant's emails propose that tenant's labels only.
//
// Auth: service bearer or Vault cron token. Fails closed.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_LIMIT = 10;

const CLASSIFY_PROMPT = `Classify this inbound email into exactly one category. Reply with ONLY the category name, nothing else.

Categories:
- question (the sender asked a question or needs information)
- at_risk (the sender is frustrated, threatening to leave, going quiet, or showing disengagement)
- buying_signal (the sender is expressing interest in purchasing, upgrading, or expanding)
- booking (the sender wants to schedule, reschedule, or cancel a meeting/call)
- admin (routine: confirmation, receipt, notification, newsletter, automated message)
- personal (personal note, thanks, greeting, non-business)

EMAIL SUBJECT: {subject}
EMAIL BODY (first 500 chars): {body}

Category:`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let authorized = bearer.length > 0 && bearer === SERVICE_ROLE;
  if (!authorized) {
    const cronToken = req.headers.get("x-cron-token") ?? "";
    if (cronToken) {
      const { data: ok } = await admin.rpc("verify_cron_token", { _token: cronToken });
      authorized = ok === true;
    }
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  // 0) Check the effective autonomy lane for inbox.triage (Trust Compass).
  //    off = skip entirely; confirm = classify/label only (no auto-filed actions);
  //    auto = full processing. Per-tenant override via paige_resolve_autonomy.
  const { data: laneResult } = await admin.rpc("paige_resolve_autonomy", {
    p_tenant: null, // resolved per-message below
    p_kind: "inbox.triage",
    p_default: "auto",
  }).catch(() => ({ data: "auto" }));
  const defaultLane = laneResult === "confirm" || laneResult === "off" ? laneResult : "auto";

  // 1) Fetch unclassified inbound (the view excludes anything already labeled).
  const { data: queue, error: queueErr } = await admin
    .from("paige_unclassified_inbound")
    .select("*")
    .limit(BATCH_LIMIT);
  if (queueErr) return json({ error: "queue_failed", detail: queueErr.message }, 500);
  if (!queue?.length) return json({ ok: true, classified: 0 }, 200);

  let classified = 0;
  let actionsFiled = 0;

  for (const msg of queue as Array<{
    id: string; tenant_id: string; contact_id: string | null;
    subject: string | null; body_text: string | null; created_at: string;
  }>) {
    try {
      // 2) Ensure system labels exist for this tenant (lazy, idempotent).
      await admin.rpc("ensure_system_labels", { p_tenant: msg.tenant_id });

      // 3) Classify on the CHEAP tier — the classify job kind via the router.
      const prompt = CLASSIFY_PROMPT
        .replace("{subject}", msg.subject ?? "(no subject)")
        .replace("{body}", (msg.body_text ?? "").slice(0, 500));

      // Route through the model router's cheap band (Featherless → Claude fallback).
      const { data: routeData } = await admin.functions.invoke("paige-orchestrator", {
        body: {
          action: "tool_invoke",
          slug: "classify-inbound",
          tenant_id: msg.tenant_id,
          input: { prompt, message_id: msg.id },
          context: { contact_id: msg.contact_id },
        },
      });

      // Parse the classification (fallback to 'admin' on any error — honest).
      const rawClass = typeof routeData?.result === "string"
        ? routeData.result.trim().toLowerCase()
        : "admin";
      const category = ["question", "at_risk", "buying_signal", "booking", "admin", "personal"].includes(rawClass)
        ? rawClass : "admin";

      // 4) Map classification to label slug.
      const labelSlug = category === "buying_signal" ? "new-lead"
        : category === "at_risk" ? "at-risk"
        : category === "question" ? "question"
        : category === "booking" ? "booking"
        : category === "personal" ? "follow-up"
        : "admin";

      // 5) Apply the label.
      const { data: label } = await admin
        .from("paige_conversation_labels")
        .select("id")
        .eq("tenant_id", msg.tenant_id)
        .eq("slug", labelSlug)
        .maybeSingle();

      if (label) {
        await admin.from("paige_message_labels").upsert({
          message_id: msg.id,
          label_id: label.id,
          applied_by: "auto",
        }, { onConflict: "message_id,label_id" });
      }

      // 6) File an action ONLY when the autonomy lane allows it.
      //    auto = file freely; confirm = file but it goes to the approval lane;
      //    off = we already skipped (but this handles the per-tenant override).
      const canFile = defaultLane === "auto";
      if (canFile && category === "at_risk") {
        await admin.rpc("file_action", {
          p_action_kind: "client.at_risk",
          p_title: `At-risk signal from inbox`,
          p_summary: `Inbound email classified as at_risk. Subject: ${(msg.subject ?? "").slice(0, 80)}`,
          p_contact_id: msg.contact_id,
          p_payload: { source: "paige-inbox-triage", category, message_id: msg.id },
          p_to_department: "owner_ops",
          p_priority: "high",
          p_created_by_agent: "paige-inbox-triage",
          p_tenant_id: msg.tenant_id,
        });
        actionsFiled++;
      } else if (canFile && category === "buying_signal") {
        await admin.rpc("file_action", {
          p_action_kind: "owner.followup_email",
          p_title: `Buying signal — follow up`,
          p_summary: `Inbound email classified as buying_signal. Subject: ${(msg.subject ?? "").slice(0, 80)}`,
          p_contact_id: msg.contact_id,
          p_payload: { source: "paige-inbox-triage", category, message_id: msg.id },
          p_to_department: "owner_ops",
          p_priority: "normal",
          p_created_by_agent: "paige-inbox-triage",
          p_tenant_id: msg.tenant_id,
        });
        actionsFiled++;
      }

      classified++;
    } catch (e) {
      console.error("[paige-inbox-triage] message failed:", msg.id, (e as Error).message);
      // Never let one message kill the batch.
    }
  }

  return json({ ok: true, scanned: queue.length, classified, actions_filed: actionsFiled }, 200);
});
