// supabase/functions/track-referral-click/index.ts
// Edge function — records a single referral click, returns 204 quickly.
// Public endpoint (no JWT required). Uses service_role to insert bypassing RLS.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

interface ClickPayload {
  referral_code: string;
  landing_path?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  user_agent?: string;
}

async function sha256(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  let payload: ClickPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const code = (payload.referral_code || "").trim().toUpperCase();
  if (!code || code.length > 32) {
    return new Response(JSON.stringify({ error: "invalid code" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Resolve the affiliate the code belongs to (if any).
  const { data: codeRow } = await supabase
    .from("referral_codes")
    .select("affiliate_id, active")
    .eq("code", code)
    .maybeSingle();

  if (!codeRow || !codeRow.active) {
    // Still acknowledge — don't leak which codes are valid.
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Hash the IP — never store raw.
  const rawIp =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  const ipHash = rawIp ? await sha256(rawIp) : null;

  const country =
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-vercel-ip-country") ||
    null;

  const userAgent =
    payload.user_agent || req.headers.get("user-agent") || null;

  const { error: insertErr } = await supabase.from("referral_clicks").insert({
    referral_code: code,
    affiliate_id: codeRow.affiliate_id,
    ip_hash: ipHash,
    user_agent: userAgent?.slice(0, 500) ?? null,
    landing_path: payload.landing_path?.slice(0, 500) ?? null,
    utm_source: payload.utm_source?.slice(0, 100) ?? null,
    utm_medium: payload.utm_medium?.slice(0, 100) ?? null,
    utm_campaign: payload.utm_campaign?.slice(0, 100) ?? null,
    country,
  });

  if (insertErr) {
    console.error("track-referral-click insert error", insertErr);
    return new Response(JSON.stringify({ error: "insert failed" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  return new Response(null, { status: 204, headers: corsHeaders });
});
