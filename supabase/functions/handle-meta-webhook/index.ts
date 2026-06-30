// Meta Graph webhook receiver (FB + IG comments/DMs).
// GET = subscription verification handshake.
// POST = verified via X-Hub-Signature-256 with META_APP_SECRET.
import { corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";
import { verifyHmacSha256Hex } from "../_shared/webhookSig.ts";
import { fireAndForgetBridge } from "../_shared/mmaOsBridge.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Meta subscription verification handshake
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const raw = await req.text();
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) return jsonResponse({ error: "webhook_not_configured" }, 500);
  const sig = req.headers.get("x-hub-signature-256");
  const ok = await verifyHmacSha256Hex(appSecret, raw, sig);
  if (!ok) return jsonResponse({ error: "invalid_signature" }, 401);

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return jsonResponse({ error: "invalid_json" }, 400); }

  // Walk entry → changes/messaging and forward each comment-like event.
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field === "comments" || change?.field === "feed") {
        const v = change.value ?? {};
        fireAndForgetBridge("social_comment_received", {
          platform: payload.object === "instagram" ? "instagram" : "facebook",
          platform_post_id: v.post_id ?? v.parent_id ?? null,
          comment_id: v.comment_id ?? v.id ?? null,
          from: v.from ?? null,
          message: v.message ?? v.text ?? null,
          created_time: v.created_time ?? new Date().toISOString(),
        });
      }
    }
  }

  return jsonResponse({ ok: true });
});
