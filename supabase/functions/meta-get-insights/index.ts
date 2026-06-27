// Get insights for a page or a specific post.
// Query: platform_post_id? OR page=true
import { corsHeaders, jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  const pageId = Deno.env.get("META_DEFAULT_PAGE_ID");
  if (!token) return jsonResponse({ error: "meta_not_configured" }, 500);

  const params = new URL(req.url).searchParams;
  const postId = params.get("platform_post_id");

  let endpoint: string;
  if (postId) {
    endpoint = `https://graph.facebook.com/v20.0/${postId}/insights?metric=post_impressions,post_engaged_users,post_clicks&access_token=${token}`;
  } else {
    if (!pageId) return jsonResponse({ error: "missing_page_id" }, 500);
    endpoint = `https://graph.facebook.com/v20.0/${pageId}/insights?metric=page_impressions,page_engaged_users,page_fan_adds&period=day&access_token=${token}`;
  }

  const res = await fetch(endpoint);
  const text = await res.text();
  if (!res.ok) return jsonResponse({ error: `meta_${res.status}`, detail: text.slice(0, 500) }, 502);
  return new Response(text, {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
