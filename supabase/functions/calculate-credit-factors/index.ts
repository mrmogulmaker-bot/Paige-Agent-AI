import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    const userId = user.id;

    // Fetch all user credit data in parallel
    const [accountsRes, negativesRes, inquiriesRes] = await Promise.all([
      supabase.from("credit_accounts").select("*").eq("user_id", userId),
      supabase.from("credit_negative_items").select("*").eq("user_id", userId),
      supabase.from("credit_inquiries").select("*").eq("user_id", userId),
    ]);

    const accounts = accountsRes.data || [];
    const negatives = negativesRes.data || [];
    const inquiries = inquiriesRes.data || [];

    // === PAYMENT HISTORY (35%) ===
    const activeNegatives = negatives.filter((n) => n.status === "active").length;
    const removedNegatives = negatives.filter((n) => n.status === "removed").length;
    const totalNegatives = negatives.length;
    const oldestNegativeDate = negatives.length > 0
      ? negatives.reduce((oldest, n) => {
          const d = n.date_of_occurrence || n.date_reported;
          return d && (!oldest || d < oldest) ? d : oldest;
        }, null as string | null)
      : null;

    let paymentHistoryScore = 100;
    if (activeNegatives > 0) {
      paymentHistoryScore = Math.max(0, 100 - activeNegatives * 15);
    }
    if (totalNegatives > 0 && activeNegatives === 0) {
      paymentHistoryScore = Math.max(70, 100 - totalNegatives * 5);
    }

    // === UTILIZATION (30%) ===
    const revolvingAccounts = accounts.filter(
      (a) => a.type === "revolving" || a.type === "credit_card"
    );
    const totalLimit = revolvingAccounts.reduce(
      (sum, a) => sum + (Number(a.credit_limit) || Number(a.limit_amount) || 0), 0
    );
    const totalBalance = revolvingAccounts.reduce(
      (sum, a) => sum + (Number(a.current_balance) || Number(a.balance) || 0), 0
    );
    const aggregateUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;

    const cardsOver30 = revolvingAccounts.filter((a) => {
      const limit = Number(a.credit_limit) || Number(a.limit_amount) || 0;
      const bal = Number(a.current_balance) || Number(a.balance) || 0;
      return limit > 0 && (bal / limit) * 100 > 30;
    }).length;
    const cardsOver50 = revolvingAccounts.filter((a) => {
      const limit = Number(a.credit_limit) || Number(a.limit_amount) || 0;
      const bal = Number(a.current_balance) || Number(a.balance) || 0;
      return limit > 0 && (bal / limit) * 100 > 50;
    }).length;
    const cardsOver70 = revolvingAccounts.filter((a) => {
      const limit = Number(a.credit_limit) || Number(a.limit_amount) || 0;
      const bal = Number(a.current_balance) || Number(a.balance) || 0;
      return limit > 0 && (bal / limit) * 100 > 70;
    }).length;

    let utilizationScore = 100;
    if (aggregateUtilization > 70) utilizationScore = 20;
    else if (aggregateUtilization > 50) utilizationScore = 40;
    else if (aggregateUtilization > 30) utilizationScore = 60;
    else if (aggregateUtilization > 10) utilizationScore = 85;
    else if (aggregateUtilization > 0) utilizationScore = 95;

    // === CREDIT AGE (15%) ===
    const now = new Date();
    const openAccounts = accounts.filter((a) => a.is_open !== false);
    const accountAges = openAccounts
      .map((a) => {
        const opened = a.account_open_date || a.opened_on;
        if (!opened) return null;
        const months = Math.floor(
          (now.getTime() - new Date(opened).getTime()) / (1000 * 60 * 60 * 24 * 30)
        );
        return months;
      })
      .filter((a): a is number => a !== null);

    const avgAge = accountAges.length > 0
      ? Math.round(accountAges.reduce((s, a) => s + a, 0) / accountAges.length)
      : 0;
    const oldestAge = accountAges.length > 0 ? Math.max(...accountAges) : 0;
    const newestAge = accountAges.length > 0 ? Math.min(...accountAges) : 0;

    let creditAgeScore = 0;
    if (avgAge >= 84) creditAgeScore = 95;
    else if (avgAge >= 60) creditAgeScore = 80;
    else if (avgAge >= 36) creditAgeScore = 65;
    else if (avgAge >= 24) creditAgeScore = 50;
    else if (avgAge >= 12) creditAgeScore = 35;
    else creditAgeScore = 20;

    // === CREDIT MIX (10%) ===
    const revolvingCount = accounts.filter(
      (a) => a.type === "revolving" || a.type === "credit_card"
    ).length;
    const installmentCount = accounts.filter((a) => a.type === "installment").length;
    const mortgageCount = accounts.filter((a) => a.type === "mortgage").length;

    const typesPresent = [revolvingCount > 0, installmentCount > 0, mortgageCount > 0].filter(Boolean).length;
    let creditMixScore = typesPresent >= 3 ? 90 : typesPresent === 2 ? 70 : typesPresent === 1 ? 45 : 10;

    // === INQUIRIES (10%) ===
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const activeInquiries = inquiries.filter((i) => i.status === "active");
    const tuInquiries = activeInquiries.filter((i) => i.bureau === "transunion").length;
    const exInquiries = activeInquiries.filter((i) => i.bureau === "experian").length;
    const eqInquiries = activeInquiries.filter((i) => i.bureau === "equifax").length;

    const recentInquiries = activeInquiries.filter(
      (i) => new Date(i.inquiry_date) >= sixMonthsAgo
    ).length;

    let inquiryScore = 100;
    if (recentInquiries >= 6) inquiryScore = 20;
    else if (recentInquiries >= 4) inquiryScore = 40;
    else if (recentInquiries >= 3) inquiryScore = 55;
    else if (recentInquiries >= 2) inquiryScore = 70;
    else if (recentInquiries >= 1) inquiryScore = 85;

    const inquiryBudget = Math.max(0, 2 - recentInquiries);

    // === OVERALL FUNDABILITY ===
    const overallScore = Math.round(
      paymentHistoryScore * 0.35 +
      utilizationScore * 0.30 +
      creditAgeScore * 0.15 +
      creditMixScore * 0.10 +
      inquiryScore * 0.10
    );

    // Upsert the factor scores
    const factorData = {
      user_id: userId,
      calculated_at: new Date().toISOString(),
      payment_history_score: paymentHistoryScore,
      total_negatives: totalNegatives,
      active_negatives: activeNegatives,
      removed_negatives: removedNegatives,
      oldest_negative_date: oldestNegativeDate,
      utilization_score: utilizationScore,
      aggregate_utilization: Math.round(aggregateUtilization * 100) / 100,
      total_credit_limit: totalLimit,
      total_balance: totalBalance,
      cards_over_30_pct: cardsOver30,
      cards_over_50_pct: cardsOver50,
      cards_over_70_pct: cardsOver70,
      credit_age_score: creditAgeScore,
      average_account_age_months: avgAge,
      oldest_account_age_months: oldestAge,
      newest_account_age_months: newestAge,
      credit_mix_score: creditMixScore,
      revolving_count: revolvingCount,
      installment_count: installmentCount,
      mortgage_count: mortgageCount,
      inquiry_score: inquiryScore,
      total_inquiries_tu: tuInquiries,
      total_inquiries_ex: exInquiries,
      total_inquiries_eq: eqInquiries,
      inquiry_budget_remaining: inquiryBudget,
      overall_fundability_score: overallScore,
      data_sources: {
        accounts_count: accounts.length,
        negatives_count: negatives.length,
        inquiries_count: inquiries.length,
      },
    };

    const { data, error } = await supabase
      .from("credit_factor_scores")
      .insert(factorData)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
