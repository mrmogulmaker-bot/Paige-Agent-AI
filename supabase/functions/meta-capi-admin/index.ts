// Admin-only edge function to manage the Meta CAPI access token.
// Replaces direct RPC calls so the underlying SECURITY DEFINER functions
// can have EXECUTE revoked from anon and authenticated.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: { action?: string; token?: string | null } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = body.action ?? "status";

  try {
    if (action === "status") {
      const { data, error } = await admin.rpc("admin_meta_capi_token_is_set");
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, is_set: Boolean(data) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "set") {
      const { error } = await admin.rpc("admin_set_meta_capi_token", { _token: body.token ?? null });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "clear") {
      const { error } = await admin.rpc("admin_set_meta_capi_token", { _token: null });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "unknown_action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
