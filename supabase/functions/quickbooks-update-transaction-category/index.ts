import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";
import { qbApiGet, qbApiPost, refreshAccessToken } from "../_shared/quickbooks-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const bodySchema = z.object({
  qb_transaction_id: z.string().min(1).max(64),
  new_account_id: z.string().min(1).max(64),
  new_account_name: z.string().min(1).max(200),
});

async function ensureFreshToken(supabase: any, connectionId: string) {
  const { data: conn } = await supabase.from("quickbooks_connections").select("*").eq("id", connectionId).maybeSingle();
  if (!conn) throw new Error("Connection not found");
  if (new Date(conn.token_expires_at).getTime() > Date.now() + 5 * 60 * 1000) {
    const { data: dec } = await supabase.rpc("qb_decrypt_token", { _ciphertext: conn.access_token_encrypted });
    return { accessToken: dec, realmId: conn.qb_realm_id, environment: conn.environment };
  }
  const { data: refDec } = await supabase.rpc("qb_decrypt_token", { _ciphertext: conn.refresh_token_encrypted });
  const newTokens = await refreshAccessToken(refDec);
  const { data: encA } = await supabase.rpc("qb_encrypt_token", { _plaintext: newTokens.access_token });
  const { data: encR } = await supabase.rpc("qb_encrypt_token", { _plaintext: newTokens.refresh_token });
  await supabase.from("quickbooks_connections").update({
    access_token_encrypted: encA,
    refresh_token_encrypted: encR,
    token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
  }).eq("id", conn.id);
  return { accessToken: newTokens.access_token, realmId: conn.qb_realm_id, environment: conn.environment };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { qb_transaction_id, new_account_id, new_account_name } = parsed.data;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await supabase.from("quickbooks_connections").select("id").eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (!conn) return new Response(JSON.stringify({ error: "No active QB connection" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { accessToken, realmId, environment } = await ensureFreshToken(supabase, conn.id);

    // Fetch the existing Purchase to get its SyncToken
    const purchaseRes = await qbApiGet(realmId, accessToken, environment, `/purchase/${qb_transaction_id}`);
    const existing = purchaseRes?.Purchase;
    if (!existing) throw new Error("Purchase not found in QuickBooks");

    // Build sparse update — change only the AccountRef on first line
    const updated = {
      Id: existing.Id,
      SyncToken: existing.SyncToken,
      sparse: true,
      Line: existing.Line.map((line: any, idx: number) => {
        if (idx === 0 && line.AccountBasedExpenseLineDetail) {
          return {
            ...line,
            AccountBasedExpenseLineDetail: {
              ...line.AccountBasedExpenseLineDetail,
              AccountRef: { value: new_account_id, name: new_account_name },
            },
          };
        }
        return line;
      }),
      PaymentType: existing.PaymentType,
      AccountRef: existing.AccountRef,
    };

    await qbApiPost(realmId, accessToken, environment, `/purchase`, updated);

    // Update local copy
    await supabase.from("quickbooks_transactions").update({
      category: new_account_name,
    }).eq("qb_connection_id", conn.id).eq("qb_transaction_id", qb_transaction_id);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      entity: "quickbooks_transaction",
      action: "category_updated",
      entity_id: qb_transaction_id,
      data: { new_account_id, new_account_name },
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[qb-update-txn]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
