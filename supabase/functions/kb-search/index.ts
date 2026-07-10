// Semantic search across tenant-private chunks merged with the global canon.
// Embeds via Voyage voyage-3 (1024-dim) through embeddingsCompat. Logs a
// metadata-only telemetry row (sha256 hash of query, never raw text).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { embeddingsCompat } from "../_shared/voyage.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  query: z.string().min(2).max(2000),
  match_count: z.number().int().min(1).max(20).optional(),
  intent_tags: z.array(z.string().max(40)).max(10).optional(),
  tenant_id: z.string().uuid().optional(),
});

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function embed(text: string): Promise<number[]> {
  const r = await embeddingsCompat("voyage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: text }),
  });
  if (!r.ok) throw new Error(`embed ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.data[0].embedding as number[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = auth.replace("Bearer ", "");
    const { data: claims } = await supabase.auth.getClaims(token);
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = BodySchema.safeParse(await req.json());
    if (!body.success) {
      return new Response(JSON.stringify({ error: body.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { query, intent_tags } = body.data;
    const matchCount = body.data.match_count ?? 6;

    let tenantId = body.data.tenant_id ?? null;
    if (!tenantId) {
      const { data: prof } = await admin
        .from("profiles").select("active_tenant_id").eq("user_id", userId).maybeSingle();
      tenantId = prof?.active_tenant_id ?? null;
    }

    const queryVec = await embed(query);

    // Tenant-private semantic results.
    let tenantResults: Array<Record<string, unknown>> = [];
    if (tenantId) {
      const { data, error } = await admin.rpc("match_tenant_knowledge", {
        p_tenant_id: tenantId,
        p_query_embedding: queryVec as unknown as string,
        p_match_count: matchCount,
      });
      if (error) console.warn("[kb-search] tenant rpc:", error.message);
      tenantResults = (data ?? []) as Array<Record<string, unknown>>;
    }

    // Global canon — keyword fallback (knowledge_base has no embeddings yet).
    const tokens = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 6);
    const orFilter = tokens.length
      ? tokens.map((t) => `title.ilike.%${t}%,content.ilike.%${t}%`).join(",")
      : null;
    let globalResults: Array<Record<string, unknown>> = [];
    if (orFilter) {
      const { data } = await admin
        .from("knowledge_base")
        .select("id, title, content, summary, category, tags")
        .or(orFilter)
        .limit(matchCount);
      globalResults = (data ?? []).map((r) => ({
        source_tier: "global",
        doc_id: r.id,
        chunk_id: null,
        title: r.title,
        content: r.summary ?? (r.content as string)?.slice(0, 1200),
        similarity: 0.6, // keyword baseline
        category: r.category,
        tags: r.tags,
      }));
    }

    const merged = [...tenantResults, ...globalResults]
      .sort((a, b) => (Number(b.similarity ?? 0) - Number(a.similarity ?? 0)))
      .slice(0, matchCount);

    // Fire-and-forget telemetry: metadata only.
    const queryHash = await sha256(query);
    const topSim = merged[0]?.similarity ?? 0;
    admin.from("kb_query_telemetry").insert({
      tenant_id: tenantId,
      query_hash: queryHash,
      query_length: query.length,
      query_intent_tags: intent_tags ?? [],
      result_count: merged.length,
      top_similarity: Number(topSim).toFixed(4),
      had_global_match: globalResults.length > 0,
      had_tenant_match: tenantResults.length > 0,
    }).then(({ error }) => { if (error) console.warn("[kb-search] telemetry:", error.message); });

    return new Response(JSON.stringify({
      ok: true,
      results: merged,
      counts: { tenant: tenantResults.length, global: globalResults.length },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[kb-search] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
