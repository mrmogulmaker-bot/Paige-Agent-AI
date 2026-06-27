// Publish or schedule a Facebook/Instagram post via Meta Graph API.
// Body: { platform: "facebook"|"instagram", caption?, media_urls: string[], scheduled_at?: ISO }
import { corsHeaders, jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";

const GRAPH = "https://graph.facebook.com/v20.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  const pageId = Deno.env.get("META_DEFAULT_PAGE_ID");
  const igId = Deno.env.get("META_IG_BUSINESS_ID");
  if (!token) return jsonResponse({ error: "meta_not_configured" }, 500);

  const body = await req.json().catch(() => ({}));
  const { platform, caption = "", media_urls = [], scheduled_at } = body ?? {};
  if (!platform || !["facebook", "instagram"].includes(platform)) {
    return jsonResponse({ error: "invalid_platform" }, 400);
  }

  try {
    let platformPostId: string | null = null;

    if (platform === "facebook") {
      if (!pageId) return jsonResponse({ error: "missing_page_id" }, 500);
      const params = new URLSearchParams({ access_token: token });
      if (caption) params.set("message", caption);
      if (media_urls?.[0]) params.set("link", media_urls[0]);
      if (scheduled_at) {
        params.set("published", "false");
        params.set("scheduled_publish_time", String(Math.floor(new Date(scheduled_at).getTime() / 1000)));
      }
      const res = await fetch(`${GRAPH}/${pageId}/feed`, { method: "POST", body: params });
      const json = await res.json();
      if (!res.ok) return jsonResponse({ error: "fb_failed", detail: json }, 502);
      platformPostId = json.id ?? null;
    } else {
      if (!igId) return jsonResponse({ error: "missing_ig_business_id" }, 500);
      if (!media_urls?.[0]) return jsonResponse({ error: "ig_requires_media" }, 400);
      const create = await fetch(`${GRAPH}/${igId}/media`, {
        method: "POST",
        body: new URLSearchParams({
          image_url: media_urls[0],
          caption,
          access_token: token,
        }),
      });
      const createJson = await create.json();
      if (!create.ok) return jsonResponse({ error: "ig_create_failed", detail: createJson }, 502);
      const publish = await fetch(`${GRAPH}/${igId}/media_publish`, {
        method: "POST",
        body: new URLSearchParams({ creation_id: createJson.id, access_token: token }),
      });
      const pubJson = await publish.json();
      if (!publish.ok) return jsonResponse({ error: "ig_publish_failed", detail: pubJson }, 502);
      platformPostId = pubJson.id ?? null;
    }

    const status = scheduled_at && platform === "facebook" ? "scheduled" : "posted";
    const postedAt = status === "posted" ? new Date().toISOString() : null;

    await guard.admin.from("paige_social_posts").insert({
      platform,
      platform_post_id: platformPostId,
      caption,
      media_urls,
      scheduled_at: scheduled_at ?? null,
      posted_at: postedAt,
      status,
      created_by: guard.userId,
    });

    return jsonResponse({ ok: true, platform_post_id: platformPostId, status });
  } catch (e) {
    return jsonResponse({ error: "exception", detail: String((e as Error).message) }, 500);
  }
});
