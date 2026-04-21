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

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          configured: false,
          query: q,
          results: [] as SearchResult[],
          note: "Web search is not yet configured. Connect Firecrawl in Lovable Cloud to enable live web search.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fcRes = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: q,
        limit: 5,
      }),
    });

    if (!fcRes.ok) {
      const body = await fcRes.text().catch(() => "");
      console.error(`[paige-web-search] Firecrawl API error ${fcRes.status}: ${body.slice(0, 500)}`);
      return new Response(
        JSON.stringify({
          configured: true,
          query: q,
          results: [] as SearchResult[],
          error: `Search provider returned ${fcRes.status}.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await fcRes.json();
    // Firecrawl v2 search: results may be in data.data (array) or data.web (array)
    const raw = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.web)
        ? data.web
        : Array.isArray(data?.results)
          ? data.results
          : [];

    const results: SearchResult[] = raw
      .slice(0, 5)
      .map((r: any) => ({
        title: String(r?.title ?? r?.metadata?.title ?? "").slice(0, 240),
        description: String(r?.description ?? r?.snippet ?? r?.metadata?.description ?? "")
          .replace(/<[^>]+>/g, "")
          .slice(0, 600),
        url: String(r?.url ?? r?.metadata?.sourceURL ?? ""),
      }))
      .filter((r: SearchResult) => r.url);

    return new Response(
      JSON.stringify({
        configured: true,
        query: q,
        results,
        count: results.length,
        provider: "firecrawl",
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
