// Generate cash flow + funding readiness snapshot from 90d transactions.
import { requireAdmin, corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";
import { fireAndForgetBridge } from "../_shared/mmaOsBridge.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { admin } = gate;

  const { contact_id } = await req.json().catch(() => ({}));
  if (!contact_id) return jsonResponse({ error: "contact_id required" }, 400);

  const { data: cfg } = await admin
    .from("paige_config")
    .select("plaid_activated")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.plaid_activated) {
    return jsonResponse({ activated: false, message: "Plaid not yet activated" }, 200);
  }

  const { data: conns } = await admin
    .from("paige_bank_connections")
    .select("id")
    .eq("contact_id", contact_id);
  const connIds = (conns ?? []).map((c) => c.id);
  if (connIds.length === 0) return jsonResponse({ error: "no_bank_connections" }, 404);

  const end = new Date();
  const start = new Date(Date.now() - 90 * 86400000);
  const { data: txs } = await admin
    .from("paige_bank_transactions")
    .select("amount_cents, date")
    .in("bank_connection_id", connIds)
    .gte("date", start.toISOString().slice(0, 10))
    .lte("date", end.toISOString().slice(0, 10));

  let deposits = 0;
  let withdrawals = 0;
  for (const t of txs ?? []) {
    // Plaid convention: positive amount = outflow, negative = inflow
    if (t.amount_cents < 0) deposits += Math.abs(t.amount_cents);
    else withdrawals += t.amount_cents;
  }
  const avgDailyBalance = Math.max(0, Math.round((deposits - withdrawals) / 90));
  const burnRate = withdrawals / 90;
  const runwayDays = burnRate > 0 ? Math.round(avgDailyBalance / burnRate) : null;

  // Simple funding readiness score 0-100
  const depositConsistency = (txs?.length ?? 0) > 30 ? 35 : Math.round(((txs?.length ?? 0) / 30) * 35);
  const balanceScore = Math.min(35, Math.round(avgDailyBalance / 1000));
  const runwayScore = runwayDays && runwayDays > 90 ? 30 : runwayDays ? Math.round((runwayDays / 90) * 30) : 0;
  const readiness = Math.min(100, depositConsistency + balanceScore + runwayScore);

  const { data: snap, error } = await admin
    .from("paige_cash_flow_snapshots")
    .insert({
      contact_id,
      period_start: start.toISOString().slice(0, 10),
      period_end: end.toISOString().slice(0, 10),
      total_deposits_cents: deposits,
      total_withdrawals_cents: withdrawals,
      avg_daily_balance_cents: avgDailyBalance,
      runway_days: runwayDays,
      funding_readiness_score: readiness,
    })
    .select("id")
    .single();
  if (error) return jsonResponse({ error: error.message }, 500);

  fireAndForgetBridge("funding_readiness_assessed", {
    contact_id,
    composite_score: readiness,
    components: { cash_flow: { runway_days: runwayDays, avg_daily_balance_cents: avgDailyBalance } },
    recommended_lane: readiness >= 70 ? "fundable_now" : readiness >= 40 ? "build_phase" : "foundation",
  });

  return jsonResponse({ ok: true, snapshot_id: snap.id, funding_readiness_score: readiness });
});
