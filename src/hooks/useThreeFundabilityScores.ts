import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getEffectiveUserId } from "@/lib/scopedUser";
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
    // Always refetch when invalidated; this query feeds money decisions.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<{
      profile: any | null;
      personalReportCount: number;
      business: any | null;
      hasBusinessCreditDataPoint: boolean;
      negatives: Array<{ date: string | null; itemType: string | null; isActive: boolean; bureau: string | null }>;
      bankingRelationships: any[];
    }> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { profile: null, personalReportCount: 0, business: null, hasBusinessCreditDataPoint: false, negatives: [], bankingRelationships: [] };
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

      const [profileRes, reportRes, bizRes, negRes, bankRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, primary_bank_name, primary_bank_months, primary_bank_average_balance, has_investment_accounts, investment_account_value_range, total_liquid_assets_range, has_real_estate_equity, real_estate_equity_range, has_equipment_assets, has_invoice_receivables, monthly_revenue_range")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("credit_report_personal_info")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        bizQuery,
        supabase
          .from("credit_negative_items")
          .select("date_of_occurrence, date_reported, item_type, status, bureau")
          .eq("user_id", user.id),
        supabase
          .from("banking_relationships" as any)
          .select("institution_name, institution_type, relationship_type, months_at_institution, average_monthly_balance, is_primary_institution, has_direct_deposit, overdraft_count_last_12_months, nsf_count_last_12_months, account_standing")
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
        bureau: n.bureau ?? null,
      }));

      return {
        profile: profileRes.data,
        personalReportCount: reportRes.count ?? 0,
        business: biz,
        hasBusinessCreditDataPoint,
        negatives,
        bankingRelationships: (bankRes.data ?? []) as any[],
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

    // 2026 enhanced banking + asset inputs
    bankingRelationships: (data?.bankingRelationships ?? []).map((b: any) => ({
      institutionName: b.institution_name ?? null,
      institutionType: b.institution_type ?? null,
      relationshipType: b.relationship_type ?? null,
      monthsAtInstitution: b.months_at_institution ?? null,
      averageMonthlyBalance: b.average_monthly_balance ? Number(b.average_monthly_balance) : null,
      isPrimaryInstitution: b.is_primary_institution ?? false,
      hasDirectDeposit: b.has_direct_deposit ?? false,
      overdraftCount12mo: b.overdraft_count_last_12_months ?? 0,
      nsfCount12mo: b.nsf_count_last_12_months ?? 0,
      accountStanding: b.account_standing ?? "good",
    })),
    primaryBankMonths: data?.profile?.primary_bank_months ?? null,
    primaryBankAverageBalance: data?.profile?.primary_bank_average_balance
      ? Number(data.profile.primary_bank_average_balance) : null,
    hasInvestmentAccounts: data?.profile?.has_investment_accounts ?? null,
    investmentRange: data?.profile?.investment_account_value_range ?? null,
    totalLiquidAssetsRange: data?.profile?.total_liquid_assets_range ?? null,
    hasRealEstateEquity: data?.profile?.has_real_estate_equity ?? null,
    realEstateEquityRange: data?.profile?.real_estate_equity_range ?? null,
    hasEquipmentAssets: data?.profile?.has_equipment_assets ?? null,
    hasInvoiceReceivables: data?.profile?.has_invoice_receivables ?? null,
    monthlyRevenueRange: data?.profile?.monthly_revenue_range ?? null,
    businessAverageMonthlyBalance: null,
  };

  const scores = computeAllFundabilityScores(inputs);

  return { ...scores, isLoading };
}
