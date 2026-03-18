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

    // Fetch user profile, credit factors, and lender products in parallel
    const [profileRes, factorsRes, productsRes, accountsRes, inquiriesRes, negativesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("credit_factor_scores").select("*").eq("user_id", userId).order("calculated_at", { ascending: false }).limit(1),
      supabase.from("lender_products").select("*").eq("is_active", true),
      supabase.from("credit_accounts").select("*").eq("user_id", userId),
      supabase.from("credit_inquiries").select("*").eq("user_id", userId).eq("status", "active"),
      supabase.from("credit_negative_items").select("*").eq("user_id", userId).eq("status", "active"),
    ]);

    const profile = profileRes.data;
    const factors = factorsRes.data?.[0];
    const products = productsRes.data || [];
    const accounts = accountsRes.data || [];
    const inquiries = inquiriesRes.data || [];
    const negatives = negativesRes.data || [];

    // Use estimated FICO or a default
    const ficoScore = profile?.estimated_fico_tu || profile?.estimated_fico_ex || profile?.estimated_fico_eq || 600;
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const inquiries6mo = inquiries.filter(i => new Date(i.inquiry_date) >= sixMonthsAgo).length;
    const inquiries12mo = inquiries.filter(i => new Date(i.inquiry_date) >= twelveMonthsAgo).length;
    const openAccountCount = accounts.filter(a => a.is_open !== false).length;
    const derogatoryCount = negatives.length;
    const utilization = factors?.aggregate_utilization || 0;
    const avgAccountAge = factors?.average_account_age_months || 0;

    const matches = [];

    for (const product of products) {
      const blockingFactors: string[] = [];
      let score = 100;

      // Check FICO score
      if (product.min_fico_score && ficoScore < product.min_fico_score) {
        blockingFactors.push(`Need ${product.min_fico_score}+ FICO (you have ${ficoScore})`);
        score -= 30;
      }

      // Check inquiries
      if (product.max_inquiries_6mo && inquiries6mo > product.max_inquiries_6mo) {
        blockingFactors.push(`Max ${product.max_inquiries_6mo} inquiries in 6mo (you have ${inquiries6mo})`);
        score -= 20;
      }
      if (product.max_inquiries_12mo && inquiries12mo > product.max_inquiries_12mo) {
        blockingFactors.push(`Max ${product.max_inquiries_12mo} inquiries in 12mo (you have ${inquiries12mo})`);
        score -= 15;
      }

      // Check account age
      if (product.min_account_age_months && avgAccountAge < product.min_account_age_months) {
        blockingFactors.push(`Need ${product.min_account_age_months}+ month account history (you have ${avgAccountAge})`);
        score -= 15;
      }

      // Check open accounts
      if (product.min_open_accounts && openAccountCount < product.min_open_accounts) {
        blockingFactors.push(`Need ${product.min_open_accounts}+ open accounts (you have ${openAccountCount})`);
        score -= 10;
      }

      // Check derogatory items
      if (product.max_derogatory_items !== null && derogatoryCount > (product.max_derogatory_items || 0)) {
        blockingFactors.push(`Max ${product.max_derogatory_items} derogatory items (you have ${derogatoryCount})`);
        score -= 25;
      }

      // Check utilization
      if (product.max_utilization_pct && utilization > Number(product.max_utilization_pct)) {
        blockingFactors.push(`Need under ${product.max_utilization_pct}% utilization (you have ${Math.round(utilization)}%)`);
        score -= 15;
      }

      score = Math.max(0, score);

      const matchStatus = blockingFactors.length === 0 
        ? "eligible" 
        : score >= 50 
          ? "near_eligible" 
          : "not_eligible";

      // Estimate approval amount
      let estimatedAmount = null;
      if (matchStatus === "eligible" && product.min_amount && product.max_amount) {
        const scoreRatio = Math.min(ficoScore, 800) / 800;
        estimatedAmount = Math.round(
          Number(product.min_amount) + (Number(product.max_amount) - Number(product.min_amount)) * scoreRatio
        );
      }

      // Build improvement path for near-eligible
      const improvementPath = blockingFactors.map(bf => {
        if (bf.includes("FICO")) return { action: "Improve credit score", impact: "high" };
        if (bf.includes("inquiries")) return { action: "Wait for inquiries to age", impact: "medium" };
        if (bf.includes("utilization")) return { action: "Pay down balances", impact: "high" };
        if (bf.includes("derogatory")) return { action: "Remove negative items", impact: "high" };
        if (bf.includes("account")) return { action: "Build credit history", impact: "medium" };
        return { action: "Improve profile", impact: "low" };
      });

      matches.push({
        user_id: userId,
        lender_product_id: product.id,
        match_score: score,
        estimated_approval_amount: estimatedAmount,
        match_status: matchStatus,
        blocking_factors: blockingFactors,
        improvement_path: improvementPath,
        calculated_at: new Date().toISOString(),
      });
    }

    // Delete old matches and insert new ones
    await supabase.from("user_funding_matches").delete().eq("user_id", userId);

    if (matches.length > 0) {
      const { error } = await supabase.from("user_funding_matches").insert(matches);
      if (error) throw error;
    }

    const eligible = matches.filter(m => m.match_status === "eligible");
    const nearEligible = matches.filter(m => m.match_status === "near_eligible");
    const totalEstimated = eligible.reduce((sum, m) => sum + (m.estimated_approval_amount || 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_products: matches.length,
          eligible: eligible.length,
          near_eligible: nearEligible.length,
          estimated_total_funding: totalEstimated,
        },
        matches: matches.sort((a, b) => b.match_score - a.match_score),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
