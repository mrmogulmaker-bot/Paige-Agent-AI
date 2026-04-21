import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SearchResult = { title: string; description: string; url: string };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query } = await req.json().catch(() => ({ query: "" }));
    const q = typeof query === "string" ? query.trim() : "";

    if (!q || q.length < 2 || q.length > 500) {
      return new Response(
        JSON.stringify({ error: "Invalid query. Provide 2-500 characters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("BRAVE_SEARCH_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          configured: false,
          query: q,
          results: [] as SearchResult[],
          note: "Web search is not yet configured. The site owner needs to add a BRAVE_SEARCH_API_KEY from https://api.search.brave.com to enable live web search.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", q);
    url.searchParams.set("count", "5");
    url.searchParams.set("safesearch", "moderate");

    const braveRes = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!braveRes.ok) {
      const body = await braveRes.text().catch(() => "");
      console.error(`[paige-web-search] Brave API error ${braveRes.status}: ${body.slice(0, 500)}`);
      return new Response(
        JSON.stringify({
          configured: true,
          query: q,
          results: [] as SearchResult[],
          error: `Search provider returned ${braveRes.status}.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await braveRes.json();
    const raw = data?.web?.results ?? [];
    const results: SearchResult[] = (Array.isArray(raw) ? raw : [])
      .slice(0, 5)
      .map((r: any) => ({
        title: String(r?.title ?? "").slice(0, 240),
        description: String(r?.description ?? "").replace(/<[^>]+>/g, "").slice(0, 600),
        url: String(r?.url ?? ""),
      }))
      .filter((r) => r.url);

    return new Response(
      JSON.stringify({
        configured: true,
        query: q,
        results,
        count: results.length,
        fetched_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[paige-web-search] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
