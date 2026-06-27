// List recent comments on a Meta post.
// Query: platform_post_id
import { corsHeaders, jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  if (!token) return jsonResponse({ error: "meta_not_configured" }, 500);
  const id = new URL(req.url).searchParams.get("platform_post_id");
  if (!id) return jsonResponse({ error: "missing_platform_post_id" }, 400);

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${id}/comments?fields=id,from,message,created_time&limit=50&access_token=${token}`,
  );
  const text = await res.text();
  if (!res.ok) return jsonResponse({ error: `meta_${res.status}`, detail: text.slice(0, 500) }, 502);
  return new Response(text, {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
