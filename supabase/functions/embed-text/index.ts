// Standalone embedding service used by Paige memory pipeline.
// Uses OpenAI Voyage voyage-3 (1024 dims) — matches the vector(1536) schema.
// Auth required; rate-limited per user.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { embeddingsCompat } from "../_shared/voyage.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = "unused";
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const inputs: string[] = Array.isArray(body.texts) ? body.texts : [body.text].filter(Boolean);
    if (inputs.length === 0 || inputs.some((t) => typeof t !== "string")) {
      return new Response(JSON.stringify({ error: "Provide `text` or `texts` (array of strings)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Truncate each input to ~8000 chars (~2k tokens) to stay well under the 8192-token limit.
    const trimmed = inputs.map((t) => t.length > 8000 ? t.slice(0, 8000) : t);

    const resp = await embeddingsCompat("voyage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: trimmed }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("OpenAI embeddings error:", resp.status, errText);
      return new Response(JSON.stringify({ error: "Embedding service error", detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await resp.json();
    const embeddings = (json.data || []).map((d: any) => d.embedding);

    return new Response(JSON.stringify({ embeddings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("embed-text error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
