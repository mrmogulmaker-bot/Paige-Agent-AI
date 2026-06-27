// Meta Conversions API (CAPI) server-side event helper.
// POST body: { event_name, event_id?, event_source_url?, user_data?: { email?, phone?, fbp?, fbc?, client_ip_address?, client_user_agent? }, custom_data?, action_source? }
// No admin auth required: this is invoked from public landing pages.
// Configuration is read from paige_config (meta_pixel_id, meta_capi_access_token, meta_capi_test_event_code).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashUserData(ud: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...ud };
  for (const k of ["em", "ph", "fn", "ln", "external_id"]) {
    const v = ud[k];
    if (typeof v === "string" && v && !/^[a-f0-9]{64}$/i.test(v)) {
      out[k] = await sha256Hex(v);
    }
  }
  // Convenience: accept email/phone keys and convert
  if (typeof ud.email === "string") out.em = await sha256Hex(ud.email);
  if (typeof ud.phone === "string") out.ph = await sha256Hex(ud.phone.replace(/\D/g, ""));
  delete (out as any).email;
  delete (out as any).phone;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { event_name, event_id, event_source_url, user_data = {}, custom_data = {}, action_source = "website" } = body ?? {};
  if (!event_name || typeof event_name !== "string") {
    return new Response(JSON.stringify({ error: "missing_event_name" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: cfg } = await supabase
    .from("paige_config")
    .select("meta_pixel_id, meta_capi_access_token, meta_capi_test_event_code")
    .eq("id", 1)
    .maybeSingle();

  const pixelId = cfg?.meta_pixel_id;
  const token = cfg?.meta_capi_access_token;
  if (!pixelId || !token) {
    return new Response(JSON.stringify({ ok: true, skipped: "meta_capi_not_configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Enrich with request-side fields if missing
  const ud = { ...user_data };
  if (!ud.client_ip_address) ud.client_ip_address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ud.client_user_agent) ud.client_user_agent = req.headers.get("user-agent") ?? undefined;

  const hashedUd = await hashUserData(ud);
  const payload: Record<string, unknown> = {
    data: [{
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      event_source_url,
      action_source,
      user_data: hashedUd,
      custom_data,
    }],
  };
  if (cfg.meta_capi_test_event_code) payload.test_event_code = cfg.meta_capi_test_event_code;

  const res = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: `meta_${res.status}`, detail: text.slice(0, 500) }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(text, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
