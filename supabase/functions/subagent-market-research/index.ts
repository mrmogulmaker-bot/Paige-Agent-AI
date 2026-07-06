// Sub-Agent: Market & Competitive Research
// Firecrawl-backed search + AI-Gateway synthesis. Returns a structured
// market brief (trends, top competitors, signals) for a given query.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

import { gatewayCompat } from "../_shared/claude.ts";
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const LOVABLE_API_KEY = "unused";

function ok(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let payload: { input?: { query?: string; industry?: string; geo?: string; limit?: number } } = {};
  try { payload = await req.json(); } catch { return ok({ ok: false, error: "Invalid JSON" }, 400); }
  const input = payload.input ?? {};
  const query = (input.query ?? "").trim() ||
    (input.industry ? `${input.industry} market trends ${input.geo ?? ""}`.trim() : "");
  if (!query) return ok({ ok: false, error: "query or industry required" }, 400);
  if (!FIRECRAWL_API_KEY) return ok({ ok: false, error: "FIRECRAWL_API_KEY not configured" }, 500);

  const limit = Math.max(3, Math.min(input.limit ?? 6, 10));

  const fcRes = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit, tbs: "qdr:m" }),
  });
  if (!fcRes.ok) {
    return ok({ ok: false, error: `firecrawl_${fcRes.status}`, detail: (await fcRes.text()).slice(0, 400) }, 502);
  }
  const fcJson = await fcRes.json();
  const raw: Array<{ title?: string; description?: string; url?: string }> =
    fcJson?.data?.web ?? fcJson?.data ?? fcJson?.web ?? fcJson?.results ?? [];
  const sources = raw.filter((r) => r.url).map((r) => ({
    title: r.title ?? r.url!,
    description: r.description ?? "",
    url: r.url!,
  }));

  let brief = "";
  if (LOVABLE_API_KEY && sources.length > 0) {
    const ctx = sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.description}\n${s.url}`).join("\n\n");
    const aiRes = await gatewayCompat("anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are a market research analyst writing for a small-business funding strategist. Be concise, factual, and cite source numbers like [1]. Never fabricate stats. Output sections: TRENDS · COMPETITORS · DEMAND SIGNALS · RISKS · FUNDING IMPLICATIONS.",
          },
          { role: "user", content: `Topic: ${query}\n\nSources:\n${ctx}\n\nWrite a tight brief (under 350 words).` },
        ],
      }),
    });
    if (aiRes.ok) {
      const j = await aiRes.json();
      brief = j?.choices?.[0]?.message?.content ?? "";
    }
  }

  return ok({
    ok: true,
    subagent: "market-research",
    summary: brief.split("\n")[0]?.slice(0, 200) ?? `${sources.length} source(s) gathered for "${query}".`,
    brief,
    sources,
    query,
    confidence: sources.length >= 3 ? "medium" : "low",
    requires_approval: false,
  });
});
