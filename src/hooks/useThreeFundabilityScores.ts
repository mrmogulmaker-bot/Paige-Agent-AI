import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreditFactors } from "./useCreditFactors";
import {
  computeAllFundabilityScores,
  type FundabilityProfileInputs,
  type FundabilityScoreResult,
} from "@/lib/fundabilityScores";

export interface ThreeFundabilityScoresResult {
  personal: FundabilityScoreResult;
  small_business: FundabilityScoreResult;
  commercial: FundabilityScoreResult;
  isLoading: boolean;
}

/**
 * Loads every input the three fundability models need, applies the
 * validation gates inside `computeAllFundabilityScores`, and returns
 * three score results. A score is `locked` when its required inputs
 * aren't present — never a fabricated number.
 *
 * If `businessId` is provided, scores are computed against that specific
 * entity. Otherwise the user's first business is used (legacy behavior).
 */
export function useThreeFundabilityScores(
  businessId?: string | null
): ThreeFundabilityScoresResult {
  const { factors } = useCreditFactors();

  const { data, isLoading } = useQuery({
    queryKey: ["three-fundability-inputs", businessId ?? "primary"],
    queryFn: async (): Promise<{
      profile: any | null;
      personalReportCount: number;
      business: any | null;
      hasBusinessCreditDataPoint: boolean;
      negatives: Array<{ date: string | null; itemType: string | null; isActive: boolean }>;
    }> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { profile: null, personalReportCount: 0, business: null, hasBusinessCreditDataPoint: false, negatives: [] };
      }

      const bizQuery = businessId
        ? supabase
            .from("businesses")
            .select(
              "id, entity_type, formation_date, ein, has_bank_account, bank_account_opened_date, estimated_annual_revenue, dnb_paydex, experian_intelliscore, equifax_payment_index"
            )
            .eq("id", businessId)
            .maybeSingle()
        : supabase
            .from("businesses")
            .select(
              "id, entity_type, formation_date, ein, has_bank_account, bank_account_opened_date, estimated_annual_revenue, dnb_paydex, experian_intelliscore, equifax_payment_index"
            )
            .eq("owner_user_id", user.id)
            .order("display_order", { ascending: true, nullsFirst: false })
            .limit(1)
            .maybeSingle();

      const [profileRes, reportRes, bizRes, negRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("estimated_fico_eq, estimated_fico_ex, estimated_fico_tu")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("credit_report_personal_info")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        bizQuery,
        supabase
          .from("credit_negative_items")
          .select("date_of_occurrence, date_reported, item_type, status")
          .eq("user_id", user.id),
      ]);

      const biz = bizRes.data;
      const hasBusinessCreditDataPoint = Boolean(
        biz && (
          (biz.dnb_paydex != null && biz.dnb_paydex > 0) ||
          (biz.experian_intelliscore != null && biz.experian_intelliscore > 0) ||
          (biz.equifax_payment_index != null && biz.equifax_payment_index > 0)
        )
      );

      const negatives = ((negRes.data ?? []) as any[]).map((n) => ({
        date: n.date_of_occurrence ?? n.date_reported ?? null,
        itemType: n.item_type ?? null,
        isActive: (n.status ?? "active") !== "removed",
      }));

      return {
        profile: profileRes.data,
        personalReportCount: reportRes.count ?? 0,
        business: biz,
        hasBusinessCreditDataPoint,
        negatives,
      };
    },
  });

  const inputs: FundabilityProfileInputs = {
    ficoEq: data?.profile?.estimated_fico_eq ?? null,
    ficoEx: data?.profile?.estimated_fico_ex ?? null,
    ficoTu: data?.profile?.estimated_fico_tu ?? null,
    paymentHistoryScore: factors?.payment_history_score ?? null,
    utilizationScore: factors?.utilization_score ?? null,
    inquiryScore: factors?.inquiry_score ?? null,
    creditMixScore: factors?.credit_mix_score ?? null,
    activeNegatives: factors?.active_negatives ?? null,
    negativeAccounts: data?.negatives ?? null,
    oldestAccountAgeMonths: factors?.oldest_account_age_months ?? null,
    hasPersonalCreditFile: (data?.personalReportCount ?? 0) > 0,

    hasBusiness: Boolean(data?.business?.id),
    entityType: data?.business?.entity_type ?? null,
    formationDate: data?.business?.formation_date ?? null,
    ein: data?.business?.ein ?? null,
    hasBusinessBankAccount: data?.business?.has_bank_account ?? null,
    bankAccountOpenedDate: data?.business?.bank_account_opened_date ?? null,
    estimatedAnnualRevenue: data?.business?.estimated_annual_revenue ?? null,
    paydex: data?.business?.dnb_paydex ?? null,
    intelliscore: data?.business?.experian_intelliscore ?? null,
    hasBusinessCreditDataPoint: data?.hasBusinessCreditDataPoint ?? false,
  };

  const scores = computeAllFundabilityScores(inputs);

  return { ...scores, isLoading };
}
