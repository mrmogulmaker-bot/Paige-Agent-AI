import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useBuildScore() {
  return useQuery({
    queryKey: ["build-score"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("build_scores")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      
      // Return default BUILD score if none exists
      if (!data) {
        return {
          build_score: 0,
          compliance_score: 0,
          vendors_score: 0,
          bureau_health_score: 0,
          funding_readiness_score: 0,
          activity_recency_score: 0,
          current_tier: 'B',
          tier_b_unlocked: true,
          tier_u_unlocked: false,
          tier_i_unlocked: false,
          tier_l_unlocked: false,
          tier_d_unlocked: false,
          compliance_pass: false,
          duns_verified: false,
          active_vendors: 0,
          paydex: 0,
          intelliscore: 0,
          months_clean_reporting: 0,
        };
      }
      
      return data;
    },
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