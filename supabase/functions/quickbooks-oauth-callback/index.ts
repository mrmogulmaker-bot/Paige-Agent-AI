import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { exchangeAuthCodeForTokens, fetchCompanyInfo } from "../_shared/quickbooks-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_BASE = Deno.env.get("APP_PUBLIC_URL") || "https://paigeagent.ai";

function htmlRedirect(url: string, message: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>QuickBooks</title>
    <meta http-equiv="refresh" content="2;url=${url}">
    <style>body{font-family:system-ui;background:#0a1628;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;}
    .card{background:#1a2840;border:1px solid #d4a574;padding:32px;border-radius:12px;max-width:480px;}
    .gold{color:#d4a574;}</style></head>
    <body><div class="card"><h1 class="gold">${message}</h1><p>Redirecting you back to PaigeAgent...</p>
    <p><a href="${url}" style="color:#d4a574">Click here if not redirected</a></p></div></body></html>`,
    { headers: { "Content-Type": "text/html" }, status: 200 }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return htmlRedirect(`${APP_BASE}/app/business-profile?qb_error=${encodeURIComponent(oauthError)}`, "QuickBooks authorization cancelled");
  }
  if (!code || !state || !realmId) {
    return htmlRedirect(`${APP_BASE}/app/business-profile?qb_error=missing_params`, "Invalid QuickBooks callback");
  }

  try {
    const decoded = JSON.parse(atob(state));
    const userId: string = decoded.uid;
    const businessId: string | null = decoded.bid;
    const environment: string = decoded.env || "sandbox";

    if (!userId) throw new Error("State missing user id");

    // Exchange auth code for tokens
    const tokens = await exchangeAuthCodeForTokens(code);

    // Fetch company info
    const companyInfo = await fetchCompanyInfo(realmId, tokens.access_token, environment);
    const companyName: string =
      companyInfo?.CompanyInfo?.CompanyName ||
      companyInfo?.CompanyInfo?.LegalName ||
      "Unknown Company";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Encrypt tokens via DB function
    const { data: encAccess, error: e1 } = await supabase.rpc("qb_encrypt_token", { _plaintext: tokens.access_token });
    const { data: encRefresh, error: e2 } = await supabase.rpc("qb_encrypt_token", { _plaintext: tokens.refresh_token });
    if (e1 || e2 || !encAccess || !encRefresh) {
      throw new Error(`Token encryption failed: ${e1?.message || e2?.message || "no result"}`);
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Upsert connection
    const { error: upsertErr } = await supabase
      .from("quickbooks_connections")
      .upsert({
        user_id: userId,
        business_id: businessId,
        qb_realm_id: realmId,
        qb_company_name: companyName,
        access_token_encrypted: encAccess,
        refresh_token_encrypted: encRefresh,
        token_expires_at: expiresAt,
        scope: "com.intuit.quickbooks.accounting com.intuit.quickbooks.payment",
        environment,
        is_active: true,
      }, { onConflict: "user_id" });

    if (upsertErr) throw new Error(`Connection upsert failed: ${upsertErr.message}`);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      entity: "quickbooks_connection",
      action: "connected",
      data: { realm_id: realmId, company_name: companyName, environment },
    });

    // Trigger initial sync (fire-and-forget)
    try {
      await supabase.functions.invoke("quickbooks-sync-financials", {
        body: { user_id: userId },
      });
    } catch (syncErr) {
      console.warn("[qb-callback] initial sync failed (non-blocking):", syncErr);
    }

    return htmlRedirect(
      `${APP_BASE}/app/business-profile?tab=financials&connected=true`,
      "QuickBooks Connected!"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[qb-callback]", msg);
    return htmlRedirect(
      `${APP_BASE}/app/business-profile?qb_error=${encodeURIComponent(msg)}`,
      "Connection Failed"
    );
  }
});
