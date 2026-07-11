// Ingest a tenant-private knowledge doc: chunk it, embed via Voyage voyage-3
// (1024-dim) through embeddingsCompat, and write to tenant_knowledge_docs +
// tenant_knowledge_chunks. Tenant-scoped via RLS on the caller's JWT — the
// row's tenant_id is derived from the caller, not trusted from the client
// payload.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { embeddingsCompat } from "../_shared/voyage.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(500_000),
  summary: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  source: z.enum(["upload", "url", "paste", "sync", "scan"]).optional(),
  source_url: z.string().url().max(2000).optional(),
  share_to_network: z.boolean().optional(),
  tenant_id: z.string().uuid().optional(), // platform-owner override
});

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= CHUNK_SIZE) return [clean];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + CHUNK_SIZE, clean.length);
    out.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - CHUNK_OVERLAP;
  }
  return out;
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
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
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

    // Resolve tenant_id: explicit param (platform owner only) → caller's active tenant.
    let tenantId = body.data.tenant_id ?? null;
    if (!tenantId) {
      const { data: prof } = await admin
        .from("profiles").select("active_tenant_id").eq("user_id", userId).maybeSingle();
      tenantId = prof?.active_tenant_id ?? null;
    }
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "No active tenant for this user" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chunks = chunkText(body.data.content);

    // Create the doc row first (RLS-enforced via user-scoped client).
    const { data: doc, error: docErr } = await supabase
      .from("tenant_knowledge_docs")
      .insert({
        tenant_id: tenantId,
        title: body.data.title,
        content: body.data.content,
        summary: body.data.summary ?? null,
        category: body.data.category ?? null,
        tags: body.data.tags ?? [],
        source: body.data.source ?? "paste",
        source_url: body.data.source_url ?? null,
        share_to_network: body.data.share_to_network ?? false,
        network_review_status: body.data.share_to_network ? "pending" : "none",
        token_count: Math.ceil(body.data.content.length / 4),
        chunk_count: chunks.length,
        created_by: userId,
      })
      .select("id, tenant_id")
      .single();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: docErr?.message ?? "insert failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Embed chunks sequentially (shares the embedding rate-limit bucket with chat).
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const vec = await embed(chunks[i]);
        rows.push({
          tenant_id: doc.tenant_id,
          doc_id: doc.id,
          chunk_index: i,
          content: chunks[i],
          embedding: vec,
          token_count: Math.ceil(chunks[i].length / 4),
        });
      } catch (e) {
        console.warn(`[kb-ingest] chunk ${i} embed failed:`, (e as Error).message);
      }
    }
    if (rows.length) {
      // Service-role insert (RLS already validated tenant ownership above).
      const { error: chunkErr } = await admin.from("tenant_knowledge_chunks").insert(rows);
      if (chunkErr) console.warn("[kb-ingest] chunk insert error:", chunkErr.message);
    }

    // HONESTY: if NOTHING embedded (embedding provider down / key missing), the doc is
    // not retrievable — it is NOT a real save. Delete the orphan row so the KB doesn't
    // fill with phantom un-searchable entries, and tell the caller the truth so Paige
    // doesn't claim it was saved. (Root cause is usually a missing/invalid VOYAGE_API_KEY.)
    if (chunks.length > 0 && rows.length === 0) {
      await admin.from("tenant_knowledge_docs").delete().eq("id", doc.id);
      return new Response(JSON.stringify({
        ok: false,
        error: "embedding_failed",
        detail: "The entry could not be embedded, so it wouldn't be searchable — nothing was saved. The embedding service looks unavailable (check VOYAGE_API_KEY). Try again once it's back.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reconcile the doc's chunk_count to the number of chunks that actually
    // embedded — the row was created with the intended count, but embeds can
    // fail (rate limit / provider down). Without this, the UI would show
    // "Ready · N recall" for a doc Paige can't actually retrieve (0 vectors).
    if (rows.length !== chunks.length) {
      await admin
        .from("tenant_knowledge_docs")
        .update({ chunk_count: rows.length })
        .eq("id", doc.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      doc_id: doc.id,
      chunk_count: rows.length,
      embedded: rows.length === chunks.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[kb-ingest] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
