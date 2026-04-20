import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { refreshAccessToken } from "../_shared/quickbooks-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Returns a fresh, decrypted access_token for a connection.
// If token has >5 min left, returns existing; otherwise refreshes and persists.
export async function ensureFreshAccessToken(supabase: any, connectionId: string): Promise<{ accessToken: string; realmId: string; environment: string }> {
  const { data: conn, error } = await supabase
    .from("quickbooks_connections")
    .select("id, qb_realm_id, environment, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !conn) throw new Error(`Connection ${connectionId} not found`);

  const expiresAt = new Date(conn.token_expires_at).getTime();
  const fiveMinFromNow = Date.now() + 5 * 60 * 1000;

  if (expiresAt > fiveMinFromNow) {
    // Still valid — decrypt and return
    const { data: decrypted, error: dErr } = await supabase.rpc("qb_decrypt_token", { _ciphertext: conn.access_token_encrypted });
    if (dErr || !decrypted) throw new Error(`Decrypt failed: ${dErr?.message}`);
    return { accessToken: decrypted, realmId: conn.qb_realm_id, environment: conn.environment };
  }

  // Refresh
  const { data: decryptedRefresh, error: rErr } = await supabase.rpc("qb_decrypt_token", { _ciphertext: conn.refresh_token_encrypted });
  if (rErr || !decryptedRefresh) throw new Error(`Refresh decrypt failed: ${rErr?.message}`);

  const newTokens = await refreshAccessToken(decryptedRefresh);

  const { data: encAccess } = await supabase.rpc("qb_encrypt_token", { _plaintext: newTokens.access_token });
  const { data: encRefresh } = await supabase.rpc("qb_encrypt_token", { _plaintext: newTokens.refresh_token });
  const newExpiry = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

  await supabase.from("quickbooks_connections").update({
    access_token_encrypted: encAccess,
    refresh_token_encrypted: encRefresh,
    token_expires_at: newExpiry,
  }).eq("id", conn.id);

  return { accessToken: newTokens.access_token, realmId: conn.qb_realm_id, environment: conn.environment };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: conn } = await supabase
      .from("quickbooks_connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!conn) return new Response(JSON.stringify({ error: "No active QB connection" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const result = await ensureFreshAccessToken(supabase, conn.id);
    // Don't return raw token — just confirm refresh succeeded
    return new Response(JSON.stringify({ refreshed: true, realm_id: result.realmId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[qb-refresh]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
