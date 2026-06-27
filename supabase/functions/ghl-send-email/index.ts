// Send email through GHL Conversations API.
// Body: { contactId: string, subject: string, html?: string, text?: string, replyTo?: string }
// Writes paige_messages_audit row.
import { adminClient, corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

const GHL_BASE = "https://services.leadconnectorhq.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  if (!body?.contactId || !body?.subject || !(body?.html || body?.text)) {
    return jsonResponse({ error: "missing_fields", required: ["contactId", "subject", "html|text"] }, 400);
  }

  const pit = Deno.env.get("GHL_PIT");
  if (!pit) return jsonResponse({ error: "ghl_not_configured" }, 500);

  const res = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pit}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "Email",
      contactId: body.contactId,
      subject: body.subject,
      html: body.html,
      message: body.text,
      replyTo: body.replyTo,
    }),
  });
  const text = await res.text();
  const admin = adminClient();
  await admin.from("paige_messages_audit").insert({
    direction: "outbound",
    provider: "ghl",
    channel: "email",
    contact_id: null,
    external_id: tryJson(text)?.messageId ?? null,
    subject: body.subject,
    body: body.html ?? body.text,
    status: res.ok ? "sent" : "failed",
    error: res.ok ? null : text.slice(0, 500),
  });
  if (!res.ok) return jsonResponse({ error: `ghl_${res.status}`, detail: text.slice(0, 500) }, 502);
  return jsonResponse({ ok: true, response: tryJson(text) });
});

function tryJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { return null; }
}
