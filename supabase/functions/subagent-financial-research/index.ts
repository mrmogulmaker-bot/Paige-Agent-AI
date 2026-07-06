// Sub-Agent: Financial Research Agent
// Lender-fit and product research. Combines Firecrawl + AI-Gateway to produce
// a written brief grounded in current sources (recent denials, bureau prefs,
// rate environment) for a given lender or funding product.
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
  let payload: { input?: { lender?: string; product?: string; question?: string; limit?: number } } = {};
  try { payload = await req.json(); } catch { return ok({ ok: false, error: "Invalid JSON" }, 400); }
  const input = payload.input ?? {};

  const subject = input.lender ?? input.product ?? input.question ?? "";
  if (!subject) return ok({ ok: false, error: "lender, product, or question required" }, 400);
  if (!FIRECRAWL_API_KEY) return ok({ ok: false, error: "FIRECRAWL_API_KEY not configured" }, 500);

  const queries = [
    input.lender ? `${input.lender} business credit card requirements ${new Date().getFullYear()}` : null,
    input.lender ? `${input.lender} which bureau pulls business credit` : null,
    input.product ? `${input.product} approval criteria small business ${new Date().getFullYear()}` : null,
    input.question || subject,
  ].filter(Boolean) as string[];

  const allSources: Array<{ title: string; description: string; url: string; query: string }> = [];
  for (const q of queries) {
    const r = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, limit: Math.min(input.limit ?? 4, 6), tbs: "qdr:m" }),
    });
    if (!r.ok) continue;
    const j = await r.json();
    const raw: Array<{ title?: string; description?: string; url?: string }> =
      j?.data?.web ?? j?.data ?? j?.web ?? j?.results ?? [];
    for (const item of raw) {
      if (item.url && !allSources.find((s) => s.url === item.url)) {
        allSources.push({
          title: item.title ?? item.url,
          description: item.description ?? "",
          url: item.url,
          query: q,
        });
      }
    }
  }

  let brief = "";
  let verification_required = true;
  if (LOVABLE_API_KEY && allSources.length > 0) {
    const ctx = allSources.slice(0, 12).map((s, i) => `[${i + 1}] ${s.title}\n${s.description}\n${s.url}`).join("\n\n");
    const aiRes = await gatewayCompat("anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a funding research analyst for the Mogul Maker Academy. Hard rules: never guarantee approval; never claim to remove negatives; flag any bureau-pull claim as 'verify before applying' because lender policies change; cite sources with [n]. Output sections: BUREAU PULL · APPROVAL CRITERIA (FICO, TIB, revenue) · REPORTING TO PERSONAL BUREAUS · RECENT SIGNALS · STRATEGIC FIT · VERIFICATION DISCLAIMER.",
          },
          { role: "user", content: `Subject: ${subject}\n\nSources:\n${ctx}\n\nWrite a tight brief (under 400 words).` },
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
    subagent: "financial-research",
    summary: `Researched ${subject} across ${allSources.length} source(s). Verify bureau pull with a soft inquiry before applying.`,
    brief,
    sources: allSources,
    subject,
    verification_required,
    confidence: allSources.length >= 4 ? "medium" : "low",
    requires_approval: false,
  });
});
