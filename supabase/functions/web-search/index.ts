// Tavily web search proxy for Paige.
// Body: { query: string, search_depth?: "basic"|"advanced", max_results?: number }
import { corsHeaders, jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  if (!body?.query || typeof body.query !== "string") return jsonResponse({ error: "missing_query" }, 400);

  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) return jsonResponse({ error: "tavily_not_configured" }, 500);

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: body.query,
      search_depth: body.search_depth ?? "basic",
      max_results: Math.min(body.max_results ?? 5, 10),
      include_answer: true,
    }),
  });
  if (!res.ok) return jsonResponse({ error: `tavily_${res.status}`, detail: (await res.text()).slice(0, 500) }, 502);
  const json = await res.json();
  return jsonResponse({ ok: true, answer: json.answer ?? null, results: json.results ?? [] });
});
