import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { qbApiGet, parsePnL, parseBalanceSheet, parseMonthlyRevenue, refreshAccessToken } from "../_shared/quickbooks-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function ensureFreshToken(supabase: any, connectionId: string) {
  const { data: conn, error } = await supabase
    .from("quickbooks_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !conn) throw new Error(`Connection ${connectionId} not found`);

  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (expiresAt > Date.now() + 5 * 60 * 1000) {
    const { data: dec } = await supabase.rpc("qb_decrypt_token", { _ciphertext: conn.access_token_encrypted });
    return { accessToken: dec, realmId: conn.qb_realm_id, environment: conn.environment, conn };
  }

  const { data: refDec } = await supabase.rpc("qb_decrypt_token", { _ciphertext: conn.refresh_token_encrypted });
  const newTokens = await refreshAccessToken(refDec);
  const { data: encA } = await supabase.rpc("qb_encrypt_token", { _plaintext: newTokens.access_token });
  const { data: encR } = await supabase.rpc("qb_encrypt_token", { _plaintext: newTokens.refresh_token });
  const newExpiry = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
  await supabase.from("quickbooks_connections").update({
    access_token_encrypted: encA,
    refresh_token_encrypted: encR,
    token_expires_at: newExpiry,
  }).eq("id", conn.id);
  return { accessToken: newTokens.access_token, realmId: conn.qb_realm_id, environment: conn.environment, conn };
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function syncOneConnection(supabase: any, connectionId: string) {
  const { accessToken, realmId, environment, conn } = await ensureFreshToken(supabase, connectionId);

  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch reports in parallel
  const [pnlMonthly, pnl30, balance, txnQuery] = await Promise.all([
    qbApiGet(realmId, accessToken, environment, `/reports/ProfitAndLoss?start_date=${fmtDate(oneYearAgo)}&end_date=${fmtDate(today)}&summarize_column_by=Month`),
    qbApiGet(realmId, accessToken, environment, `/reports/ProfitAndLoss?start_date=${fmtDate(thirtyDaysAgo)}&end_date=${fmtDate(today)}`),
    qbApiGet(realmId, accessToken, environment, `/reports/BalanceSheet`),
    qbApiGet(realmId, accessToken, environment, `/query?query=${encodeURIComponent(`SELECT * FROM Purchase WHERE TxnDate >= '${fmtDate(thirtyDaysAgo)}' ORDERBY TxnDate DESC MAXRESULTS 100`)}`).catch(() => ({ QueryResponse: {} })),
  ]);

  const pnl = parsePnL(pnl30);
  const bs = parseBalanceSheet(balance);
  const monthlyRevenue = parseMonthlyRevenue(pnlMonthly);

  // Compute metrics
  const grossMarginPct = pnl.total_revenue > 0 ? (pnl.gross_profit / pnl.total_revenue) * 100 : 0;
  const netMarginPct = pnl.total_revenue > 0 ? (pnl.net_income / pnl.total_revenue) * 100 : 0;

  // Burn rate = avg monthly operating expenses over last 3 months (approximate from 30-day x3 if not available)
  const lastThreeMonthsRev = monthlyRevenue.slice(-3);
  const monthlyBurn = pnl.total_expenses; // 30-day expenses ≈ monthly burn
  const cashRunway = monthlyBurn > 0 ? bs.cash_and_bank_balance / monthlyBurn : null;

  // Insert financials snapshot
  const { error: finErr } = await supabase.from("quickbooks_financials").insert({
    user_id: conn.user_id,
    business_id: conn.business_id,
    qb_connection_id: conn.id,
    period_start: fmtDate(thirtyDaysAgo),
    period_end: fmtDate(today),
    total_revenue: pnl.total_revenue,
    total_expenses: pnl.total_expenses,
    gross_profit: pnl.gross_profit,
    gross_margin_percent: Math.round(grossMarginPct * 100) / 100,
    net_income: pnl.net_income,
    net_margin_percent: Math.round(netMarginPct * 100) / 100,
    cogs: pnl.cogs,
    operating_expenses: pnl.operating_expenses,
    payroll_expenses: pnl.payroll_expenses,
    marketing_expenses: pnl.marketing_expenses,
    professional_fees: pnl.professional_fees,
    cash_and_bank_balance: bs.cash_and_bank_balance,
    accounts_receivable: bs.accounts_receivable,
    accounts_payable: bs.accounts_payable,
    monthly_burn_rate: monthlyBurn,
    cash_runway_months: cashRunway !== null ? Math.round(cashRunway * 100) / 100 : null,
    revenue_per_month: monthlyRevenue,
    top_expense_categories: pnl.top_expense_categories,
  });
  if (finErr) console.warn("[qb-sync] financials insert err:", finErr.message);

  // Insert recent transactions (Purchase entities)
  const purchases = txnQuery?.QueryResponse?.Purchase || [];
  for (const p of purchases.slice(0, 100)) {
    const lineDetails = p.Line?.[0]?.AccountBasedExpenseLineDetail;
    const category = lineDetails?.AccountRef?.name || null;
    const vendor = p.EntityRef?.name || null;
    await supabase.from("quickbooks_transactions").upsert({
      user_id: conn.user_id,
      qb_connection_id: conn.id,
      qb_transaction_id: p.Id,
      transaction_date: p.TxnDate,
      transaction_type: "purchase",
      amount: parseFloat(p.TotalAmt || "0"),
      category,
      vendor_or_customer: vendor,
      description: p.PrivateNote || p.Line?.[0]?.Description || null,
      is_business_expense: true,
    }, { onConflict: "qb_connection_id,qb_transaction_id,transaction_type" });
  }

  await supabase.from("quickbooks_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", conn.id);

  return { connection_id: conn.id, total_revenue: pnl.total_revenue, gross_margin: grossMarginPct };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { user_id, sync_all } = body;

    if (sync_all) {
      // Cron mode: sync all active connections
      const { data: conns } = await supabase
        .from("quickbooks_connections")
        .select("id, user_id")
        .eq("is_active", true);
      const results = [];
      for (const c of conns || []) {
        try {
          const r = await syncOneConnection(supabase, c.id);
          results.push({ ...r, status: "ok" });
        } catch (e) {
          results.push({ connection_id: c.id, status: "error", error: e instanceof Error ? e.message : String(e) });
        }
      }
      return new Response(JSON.stringify({ synced: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single user sync — verify caller owns it OR is service role
    let targetUserId = user_id;
    const authHeader = req.headers.get("Authorization");
    if (authHeader && !authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)) {
      const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      targetUserId = user.id;
    }

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: conn } = await supabase
      .from("quickbooks_connections")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("is_active", true)
      .maybeSingle();
    if (!conn) {
      return new Response(JSON.stringify({ error: "No active QB connection" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await syncOneConnection(supabase, conn.id);
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[qb-sync]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
