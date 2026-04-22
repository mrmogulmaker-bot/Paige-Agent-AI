import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live-computed BUILD score.
 *
 * The legacy `build_scores` table is treated as a fallback only — no edge
 * function currently writes to it, which is why the dashboard would otherwise
 * stay frozen at zero. We compute every sub-score directly from the source
 * tables that the user actually edits:
 *
 *   - `businesses`         → bureau scores (Paydex, Intelliscore, Equifax),
 *                            DUNS verification, formation/EIN/bank inputs
 *                            for compliance, and the months_clean_reporting
 *                            estimate from `business_credit_last_updated`.
 *   - `business_vendors`   → active tradeline count, on-time / early-pay
 *                            ratios for the vendors sub-score.
 *   - `financial_kpis`     → avg_balance_90d + DSCR for funding readiness.
 *   - `connected_bank_accounts.last_sync_at` → activity recency.
 *
 * Anything that mutates one of those tables should call
 * `useFundabilityRefresh().invalidate()` (or this hook's queryKey directly)
 * so the dashboard reflects the change without a page reload.
 */
export function useBuildScore() {
  return useQuery({
    queryKey: ["build-score"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Pull all source rows in parallel.
      const [
        legacyRes,
        businessesRes,
        vendorsRes,
        kpisRes,
        accountsRes,
      ] = await Promise.all([
        supabase
          .from("build_scores")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("businesses")
          .select(
            "id, ein, formation_date, has_bank_account, dnb_duns, dnb_duns_number, dnb_paydex, dnb_paydex_score, experian_intelliscore, experian_intelliscore_score, equifax_payment_index, equifax_payment_index_score, business_credit_last_updated"
          )
          .eq("owner_user_id", user.id)
          .eq("is_active", true),
        supabase
          .from("business_vendors")
          .select(
            "id, is_active, on_time_payments, late_payments, early_payments, total_payments, last_payment_date, reports_to_bureaus"
          )
          .eq("user_id", user.id),
        supabase
          .from("financial_kpis")
          .select("avg_balance_90d, dscr")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("connected_bank_accounts")
          .select("last_sync_at")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("last_sync_at", { ascending: false })
          .limit(1),
      ]);

      const legacy = legacyRes.data ?? null;
      const businesses = businessesRes.data ?? [];
      const vendors = vendorsRes.data ?? [];
      const kpis = kpisRes.data ?? null;
      const accounts = accountsRes.data ?? [];

      // Pick the "primary" business (first active row). All bureau math is
      // anchored to that record because the BUILD ladder is per-entity.
      const primary = businesses[0] ?? null;

      // ---- Bureau snapshot --------------------------------------------------
      const paydex =
        primary?.dnb_paydex_score ??
        primary?.dnb_paydex ??
        legacy?.paydex ??
        0;
      const intelliscore =
        primary?.experian_intelliscore_score ??
        primary?.experian_intelliscore ??
        legacy?.intelliscore ??
        0;
      const equifax =
        primary?.equifax_payment_index_score ??
        primary?.equifax_payment_index ??
        0;
      const dunsVerified = Boolean(
        primary?.dnb_duns || primary?.dnb_duns_number || legacy?.duns_verified
      );

      // ---- Vendor signal ----------------------------------------------------
      const activeVendorList = vendors.filter((v) => v.is_active !== false);
      const activeVendors = activeVendorList.length;

      let totalPayments = 0;
      let onTimePayments = 0;
      let earlyPayments = 0;
      for (const v of activeVendorList) {
        totalPayments += v.total_payments ?? 0;
        onTimePayments += v.on_time_payments ?? 0;
        earlyPayments += v.early_payments ?? 0;
      }
      const onTimeRate =
        totalPayments > 0 ? (onTimePayments / totalPayments) * 100 : 0;
      const earlyPayRate =
        totalPayments > 0 ? (earlyPayments / totalPayments) * 100 : 0;

      // ---- Compliance signal ------------------------------------------------
      // "Compliance pass" = has EIN + formation date + business bank account.
      const compliancePass = Boolean(
        primary?.ein && primary?.formation_date && primary?.has_bank_account
      );
      // No registry-of-good-standing field yet; treat compliancePass as proxy.
      const goodStanding = compliancePass;

      // ---- Activity recency -------------------------------------------------
      const lastVendorPayment = activeVendorList
        .map((v) => (v.last_payment_date ? new Date(v.last_payment_date).getTime() : 0))
        .reduce((max, t) => Math.max(max, t), 0);
      const lastPaymentDays = lastVendorPayment
        ? Math.floor((Date.now() - lastVendorPayment) / (1000 * 60 * 60 * 24))
        : 999;

      const lastBankSync = accounts[0]?.last_sync_at
        ? new Date(accounts[0].last_sync_at).getTime()
        : 0;
      const lastSyncDays = lastBankSync
        ? Math.floor((Date.now() - lastBankSync) / (1000 * 60 * 60 * 24))
        : 999;

      // ---- Months of clean reporting ---------------------------------------
      // Approximated from the date the bureau row was last refreshed minus the
      // earliest vendor account_opened_date isn't available here; fall back to
      // the legacy snapshot when present.
      const monthsClean =
        legacy?.months_clean_reporting ??
        (primary?.business_credit_last_updated
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(primary.business_credit_last_updated).getTime()) /
                  (1000 * 60 * 60 * 24 * 30)
              )
            )
          : 0);

      // ---- Sub-scores -------------------------------------------------------
      const complianceScore = calculateComplianceScore(
        compliancePass,
        dunsVerified,
        goodStanding
      );
      const vendorsScore = calculateVendorsScore(
        activeVendors,
        onTimeRate,
        earlyPayRate
      );
      const bureauHealthScore = calculateBureauHealthScore(paydex, intelliscore);
      const fundingReadinessScore = calculateFundingReadinessScore(
        kpis?.avg_balance_90d ?? 0,
        kpis?.dscr ?? 0
      );
      const activityRecencyScore = calculateActivityRecencyScore(
        lastPaymentDays,
        lastSyncDays
      );

      const buildScore = calculateBuildScore(
        complianceScore,
        vendorsScore,
        bureauHealthScore,
        fundingReadinessScore,
        activityRecencyScore
      );

      // ---- Tier unlocks -----------------------------------------------------
      const tierUnlocks = checkTierUnlocks({
        compliance_pass: compliancePass,
        duns_verified: dunsVerified,
        active_vendors: activeVendors,
        paydex,
        intelliscore,
        months_clean_reporting: monthsClean,
      });

      return {
        // Aggregate
        build_score: buildScore,
        compliance_score: complianceScore,
        vendors_score: vendorsScore,
        bureau_health_score: bureauHealthScore,
        funding_readiness_score: fundingReadinessScore,
        activity_recency_score: activityRecencyScore,
        // Inputs the UI displays directly
        compliance_pass: compliancePass,
        duns_verified: dunsVerified,
        active_vendors: activeVendors,
        on_time_rate: Math.round(onTimeRate),
        early_pay_rate: Math.round(earlyPayRate),
        paydex,
        intelliscore,
        equifax_payment_index: equifax,
        months_clean_reporting: monthsClean,
        last_payment_days: lastPaymentDays,
        last_sync_days: lastSyncDays,
        // Tier ladder
        current_tier: tierUnlocks.currentTier,
        tier_b_unlocked: true,
        tier_u_unlocked: tierUnlocks.tier_u_unlocked,
        tier_i_unlocked: tierUnlocks.tier_i_unlocked,
        tier_l_unlocked: tierUnlocks.tier_l_unlocked,
        tier_d_unlocked: tierUnlocks.tier_d_unlocked,
      };
    },
    staleTime: 30_000,
  });
}

export function calculateBuildScore(
  complianceScore: number,
  vendorsScore: number,
  bureauHealthScore: number,
  fundingReadinessScore: number,
  activityRecencyScore: number
): number {
  // BUILD Score = (Compliance 20%) + (Vendors 25%) + (Bureau Health 20%) + (Funding Readiness 20%) + (Activity Recency 15%)
  const buildScore =
    complianceScore * 0.20 +
    vendorsScore * 0.25 +
    bureauHealthScore * 0.20 +
    fundingReadinessScore * 0.20 +
    activityRecencyScore * 0.15;

  return Math.round(buildScore * 100) / 100;
}

export function calculateComplianceScore(
  compliancePass: boolean,
  dunsVerified: boolean,
  goodStanding: boolean
): number {
  let score = 0;
  if (compliancePass) score += 40;
  if (dunsVerified) score += 40;
  if (goodStanding) score += 20;
  return score;
}

export function calculateVendorsScore(
  activeVendors: number,
  onTimeRate: number,
  earlyPayRate: number
): number {
  let score = 0;

  // Vendor count (up to 50 points)
  if (activeVendors >= 10) score += 50;
  else if (activeVendors >= 5) score += 35;
  else if (activeVendors >= 3) score += 20;
  else score += activeVendors * 5;

  // On-time payment rate (up to 30 points)
  score += onTimeRate * 0.30;

  // Early payment rate bonus (up to 20 points)
  score += earlyPayRate * 0.20;

  return Math.min(100, score);
}

export function calculateBureauHealthScore(
  paydex: number,
  intelliscore: number
): number {
  // Average of Paydex and Intelliscore, normalized to 100
  const paydexNormalized = paydex; // Already 0-100
  const intelliscoreNormalized = intelliscore; // Already 0-100

  return (paydexNormalized * 0.5 + intelliscoreNormalized * 0.5);
}

export function calculateFundingReadinessScore(
  avgBalance90d: number,
  dscr: number
): number {
  let score = 0;

  // Balance component (up to 50 points)
  if (avgBalance90d >= 25000) score += 50;
  else if (avgBalance90d >= 10000) score += 35;
  else if (avgBalance90d >= 5000) score += 20;
  else score += (avgBalance90d / 5000) * 20;

  // DSCR component (up to 50 points)
  if (dscr >= 2.0) score += 50;
  else if (dscr >= 1.5) score += 40;
  else if (dscr >= 1.25) score += 25;
  else score += dscr * 20;

  return Math.min(100, score);
}

export function calculateActivityRecencyScore(
  lastPaymentDays: number,
  lastSyncDays: number
): number {
  let score = 100;

  // Deduct points for inactivity
  if (lastPaymentDays > 90) score -= 50;
  else if (lastPaymentDays > 60) score -= 30;
  else if (lastPaymentDays > 30) score -= 15;

  if (lastSyncDays > 30) score -= 25;
  else if (lastSyncDays > 14) score -= 15;
  else if (lastSyncDays > 7) score -= 5;

  return Math.max(0, score);
}

export function checkTierUnlocks(buildData: any) {
  const unlocks = {
    tier_u_unlocked: buildData.compliance_pass && buildData.duns_verified,
    tier_i_unlocked: buildData.active_vendors >= 3 && buildData.paydex >= 75,
    tier_l_unlocked: buildData.paydex >= 80 && buildData.intelliscore >= 75 && buildData.active_vendors >= 5,
    tier_d_unlocked: buildData.months_clean_reporting >= 12,
  };

  // Determine current tier
  let currentTier = 'B';
  if (unlocks.tier_d_unlocked) currentTier = 'D';
  else if (unlocks.tier_l_unlocked) currentTier = 'L';
  else if (unlocks.tier_i_unlocked) currentTier = 'I';
  else if (unlocks.tier_u_unlocked) currentTier = 'U';

  return { ...unlocks, currentTier };
}
