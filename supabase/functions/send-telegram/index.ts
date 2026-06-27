// Send a Telegram message via the Bot API.
// Body: { text: string, chat_id?: string, parse_mode?: "HTML"|"Markdown" }
// Defaults chat_id to paige_telegram_config.default_admin_chat_id.
import { adminClient, corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  if (!body?.text) return jsonResponse({ error: "missing_text" }, 400);

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return jsonResponse({ error: "telegram_not_configured" }, 500);

  let chatId: string | null = body.chat_id ?? null;
  if (!chatId) {
    const admin = adminClient();
    const cfg = await admin.from("paige_telegram_config").select("default_admin_chat_id").eq("id", 1).maybeSingle();
    chatId = cfg.data?.default_admin_chat_id ?? Deno.env.get("TELEGRAM_DEFAULT_ADMIN_CHAT_ID") ?? null;
  }
  if (!chatId) return jsonResponse({ error: "missing_chat_id" }, 400);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: body.text,
      parse_mode: body.parse_mode ?? "HTML",
      disable_web_page_preview: true,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    return jsonResponse({ error: "telegram_send_failed", detail: json }, 502);
  }
  return jsonResponse({ ok: true, message_id: json.result?.message_id });
});
