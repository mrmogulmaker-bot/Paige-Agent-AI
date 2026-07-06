// Backfills embeddings for client_memory rows where embedding IS NULL.
// Admin-only. Processes in batches of 20 with 500ms delay between batches.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { embeddingsCompat } from "../_shared/voyage.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = "unused";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: require admin
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: user.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for read/write bypassing RLS
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch all rows without an embedding
    const { data: rows, error: fetchErr } = await admin
      .from("client_memory")
      .select("id, content")
      .is("embedding", null)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Fetch failed", detail: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalProcessed = rows?.length || 0;
    let totalUpdated = 0;
    const errors: { id: string; error: string }[] = [];

    for (let i = 0; i < totalProcessed; i += BATCH_SIZE) {
      const batch = rows!.slice(i, i + BATCH_SIZE);
      const inputs = batch.map((r) =>
        (r.content || "").length > 8000 ? r.content.slice(0, 8000) : (r.content || "")
      );

      try {
        const resp = await embeddingsCompat("voyage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: "text-embedding-3-small", input: inputs }),
        });

        if (!resp.ok) {
          const t = await resp.text();
          for (const r of batch) errors.push({ id: r.id, error: `OpenAI ${resp.status}: ${t.slice(0, 200)}` });
        } else {
          const json = await resp.json();
          const embeddings: number[][] = (json.data || []).map((d: any) => d.embedding);

          await Promise.all(
            batch.map(async (row, idx) => {
              const emb = embeddings[idx];
              if (!emb) {
                errors.push({ id: row.id, error: "No embedding returned" });
                return;
              }
              const { error: updErr } = await admin
                .from("client_memory")
                .update({ embedding: emb as any })
                .eq("id", row.id);
              if (updErr) errors.push({ id: row.id, error: updErr.message });
              else totalUpdated++;
            })
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        for (const r of batch) errors.push({ id: r.id, error: msg });
      }

      if (i + BATCH_SIZE < totalProcessed) await sleep(BATCH_DELAY_MS);
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_processed: totalProcessed,
        total_updated: totalUpdated,
        error_count: errors.length,
        errors: errors.slice(0, 50),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("backfill-memory-embeddings error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
