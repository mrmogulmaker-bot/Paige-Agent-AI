// Scheduled-send drainer (Comms C-1.5). Cron wakes this every minute; it CLAIMS due
// queued rows (claim_due_scheduled_messages, FOR UPDATE SKIP LOCKED + 5-min lease so two
// ticks never double-fire and a crashed drain self-heals) and RE-ENTERS send-message under
// the service role with message_id set + scheduled_for OMITTED — so the FULL pre-send
// pipeline (steps 1-5, C-2a) re-runs on release (SEND-MESSAGE-CONTRACT §4). A row that now
// hits quiet hours / DND simply re-queues; that is correct, not an error (§13).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

function json(status: number, b: unknown) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Internal-caller auth: a service-role bearer OR a valid x-cron-token (mirrors readiness-scan).
async function isAuthorizedInternalCaller(req: Request): Promise<boolean> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer.length > 0 && bearer === SERVICE_ROLE_KEY) return true;
  const cronToken = req.headers.get("x-cron-token") ?? "";
  if (!cronToken) return false;
  const { data, error } = await admin.rpc("verify_cron_token", { _token: cronToken });
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!(await isAuthorizedInternalCaller(req))) return json(401, { error: "unauthorized" });

  // Atomic claim (FOR UPDATE SKIP LOCKED + lease marker) — returns due rows this tick owns.
  const { data: due, error: claimErr } = await admin.rpc("claim_due_scheduled_messages", { _limit: 50 });
  if (claimErr) return json(500, { error: "claim_failed", detail: claimErr.message });

  const rows = (due ?? []) as Array<{
    id: string; channel_type: string; recipients: { address?: string }[] | null;
    body_text: string | null; body_html: string | null; subject: string | null;
    contact_id: string | null; connector_id: string | null; thread_key: string | null;
    attachments: unknown[] | null;
  }>;

  let released = 0, requeued = 0, failed = 0;
  for (const m of rows) {
    const to = m.recipients?.[0]?.address ?? "";
    const bodyStr = m.channel_type === "email"
      ? (m.body_html ?? m.body_text ?? "")
      : (m.body_text ?? m.body_html ?? "");
    if (!to || !bodyStr) {
      // Unsendable row — mark failed so the queue surfaces it (§13), never silently drop.
      await admin.from("messages").update({ status: "failed", error: "drain_missing_recipient_or_body" }).eq("id", m.id);
      failed++;
      continue;
    }
    const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        channel: m.channel_type,
        to,
        subject: m.subject ?? undefined,
        body: bodyStr,
        contact_id: m.contact_id ?? undefined,
        thread_key: m.thread_key ?? undefined,
        connector_id: m.connector_id ?? undefined,
        message_id: m.id,          // patch THIS queued row (release)
        attachments: m.attachments ?? undefined,
        // scheduled_for OMITTED → send-message runs the full pipeline, no re-queue-for-schedule
      }),
    });
    const r = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    const outcome = String(r.outcome ?? r.status ?? "");
    if (outcome === "sent") released++;
    else if (outcome.startsWith("queued_")) requeued++;   // hit DND/quiet-hours on release — correct
    else failed++;
  }
  return json(200, { claimed: rows.length, released, requeued, failed });
});
