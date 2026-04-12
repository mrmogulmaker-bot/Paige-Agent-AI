import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FundingProfileData {
  // Bureau scores
  middleScore: number | null;
  scores: { tu: number | null; ex: number | null; eq: number | null };
  scoreModel: string;
  lastReportDate: string | null;

  // Negative items
  negativeItems: any[];
  activeChargeOffs: any[];
  chargeOffTotal: number;
  activeCollections: any[];
  derogWithin12mo: number;
  derogWithin24mo: number;
  totalActiveNegatives: number;

  // Credit accounts (tradelines)
  creditAccounts: any[];
  highestRevolvingLimit: number;
  revolvingLimitIsHistorical: boolean;
  highestInstallmentBalance: number;
  highestLOCLimit: number;
  openAccountCount: number;
  oldestAccountAgeMonths: number;

  // Business info
  businesses: any[];
  hasEntityStructure: boolean;
  timeInBusinessMonths: number | null;
  hasEIN: boolean;

  // Financial KPIs
  financialKpis: any | null;
  hasRevenueData: boolean;
  annualRevenue: number | null;
  monthlyCashFlow: number | null;

  // Banking
  connectedBanks: number;
  hasBankingRelationship: boolean;

  // Business credit
  buildScores: any | null;
  hasBusinessCreditScores: boolean;

  // Profile completeness
  completeness: number;
  missingItems: { label: string; weight: number; cta: string; unlocks: string }[];

  // Fraud/freeze flags
  hasFraudAlert: boolean;
  hasSecurityFreeze: boolean;

  // Funding goals
  fundingGoals: any | null;

  isLoading: boolean;
}

function getMiddleScore(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => s != null);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  if (valid.length === 2) return Math.min(...valid);
  const sorted = [...valid].sort((a, b) => a - b);
  return sorted[1];
}

export function useFundingProfile(): FundingProfileData {
  const { data, isLoading } = useQuery({
    queryKey: ["funding-profile-complete"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const uid = user.id;

      const [
        profileRes,
        negItemsRes,
        accountsRes,
        businessRes,
        kpisRes,
        banksRes,
        buildScoresRes,
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
        supabase.from("credit_negative_items").select("*").eq("user_id", uid),
        supabase.from("credit_accounts").select("*").eq("user_id", uid),
        supabase.from("businesses").select("*").eq("owner_user_id", uid),
        supabase.from("financial_kpis").select("*").eq("user_id", uid).maybeSingle(),
        supabase.from("connected_bank_accounts").select("id").eq("user_id", uid).eq("is_active", true),
        supabase.from("build_scores").select("*").eq("user_id", uid).maybeSingle(),
      ]);

      const profile = profileRes.data;
      const negItems = negItemsRes.data || [];
      const accounts = accountsRes.data || [];
      const businesses = businessRes.data || [];
      const kpis = kpisRes.data;
      const banks = banksRes.data || [];
      const buildScores = buildScoresRes.data;

      // Scores
      const tu = profile?.estimated_fico_tu ?? null;
      const ex = profile?.estimated_fico_ex ?? null;
      const eq = profile?.estimated_fico_eq ?? null;
      const middleScore = getMiddleScore([tu, ex, eq]);

      // Negative items analysis
      const now = new Date();
      const activeChargeOffs = negItems.filter((n: any) => n.item_type?.toLowerCase().includes("charge") && n.status !== "removed");
      const chargeOffTotal = activeChargeOffs.reduce((s: number, n: any) => s + (n.amount || 0), 0);
      const activeCollections = negItems.filter((n: any) => n.item_type?.toLowerCase().includes("collection") && n.status !== "removed");
      
      const derogWithin = (months: number) => negItems.filter((n: any) => {
        if (n.status === "removed") return false;
        const d = n.date_of_occurrence || n.date_reported;
        if (!d) return true; // assume recent if no date
        const diff = (now.getTime() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30);
        return diff <= months;
      }).length;

      // Credit accounts analysis
      const openAccounts = accounts.filter((a: any) => a.is_open !== false);
      const revolving = openAccounts.filter((a: any) => a.type === "revolving");
      const installment = openAccounts.filter((a: any) => a.type === "installment");
      const loc = openAccounts.filter((a: any) => a.type === "line_of_credit");

      // Include closed revolving accounts in good standing for comparable credit
      const closedRevolvingGoodStanding = accounts.filter((a: any) => {
        if (a.is_open !== false) return false; // skip open accounts (already counted)
        if (a.type !== "revolving") return false;
        const status = (a.status || "").toLowerCase();
        // Exclude accounts with derogatory history
        if (status.includes("charge") || status.includes("collection") || status.includes("delinquent") || status.includes("default")) return false;
        return true;
      });

      const highestOpenRevolvingLimit = Math.max(0, ...revolving.map((a: any) => a.credit_limit || a.limit_amount || 0));
      const highestClosedRevolvingLimit = Math.max(0, ...closedRevolvingGoodStanding.map((a: any) => a.credit_limit || a.limit_amount || 0));
      const highestRevolvingLimit = Math.max(highestOpenRevolvingLimit, highestClosedRevolvingLimit);
      const revolvingLimitIsHistorical = highestClosedRevolvingLimit > highestOpenRevolvingLimit && highestClosedRevolvingLimit > 0;
      const highestInstallmentBalance = Math.max(0, ...installment.map((a: any) => a.balance || a.current_balance || 0));
      const highestLOCLimit = Math.max(0, ...loc.map((a: any) => a.credit_limit || a.limit_amount || 0));

      const oldestDate = openAccounts.reduce((oldest: Date | null, a: any) => {
        const d = a.account_open_date || a.opened_on;
        if (!d) return oldest;
        const dt = new Date(d);
        return !oldest || dt < oldest ? dt : oldest;
      }, null as Date | null);
      const oldestAccountAgeMonths = oldestDate
        ? Math.floor((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
        : 0;

      // Business
      const hasEntity = businesses.length > 0 && businesses.some((b: any) => b.entity_type);
      const hasEIN = businesses.some((b: any) => b.ein);
      const oldestBiz = businesses.reduce((oldest: Date | null, b: any) => {
        const d = b.created_at;
        if (!d) return oldest;
        const dt = new Date(d);
        return !oldest || dt < oldest ? dt : oldest;
      }, null as Date | null);
      const timeInBusinessMonths = oldestBiz
        ? Math.floor((now.getTime() - oldestBiz.getTime()) / (1000 * 60 * 60 * 24 * 30))
        : null;

      // Revenue
      const monthlyInflow = kpis?.monthly_inflow || 0;
      const annualRevenue = monthlyInflow > 0 ? monthlyInflow * 12 : null;
      const monthlyCashFlow = kpis ? (kpis.monthly_inflow || 0) - (kpis.monthly_outflow || 0) : null;

      // Completeness calculation
      const completenessItems: { label: string; weight: number; present: boolean; cta: string; unlocks: string }[] = [
        { label: "Bureau Scores", weight: 20, present: middleScore != null, cta: "Upload your credit report via Paige chat", unlocks: "score-based product matching" },
        { label: "Negative Items Analysis", weight: 15, present: negItems.length > 0 || (middleScore != null && middleScore >= 740), cta: "Upload a credit report to analyze derogatory items", unlocks: "accurate derogatory risk assessment" },
        { label: "Business Revenue", weight: 20, present: annualRevenue != null && annualRevenue > 0, cta: "Upload bank statements or enter revenue data", unlocks: "revenue-based funding products" },
        { label: "Entity Structure", weight: 10, present: hasEntity, cta: "Add your business entity in the Business section", unlocks: "business credit products" },
        { label: "Time in Business", weight: 10, present: timeInBusinessMonths != null && timeInBusinessMonths > 0, cta: "Complete your business profile with formation date", unlocks: "term loans and SBA products" },
        { label: "Banking Relationship", weight: 10, present: banks.length > 0, cta: "Connect a bank account via Plaid", unlocks: "cash-flow based lending products" },
        { label: "Business Credit Scores", weight: 10, present: buildScores?.paydex != null || buildScores?.intelliscore != null, cta: "Upload a business credit report", unlocks: "EIN-only business products" },
        { label: "Monthly Cash Flow", weight: 5, present: monthlyCashFlow != null && monthlyCashFlow !== 0, cta: "Connect bank accounts to calculate cash flow", unlocks: "improved estimate accuracy" },
      ];

      const completeness = completenessItems.reduce((sum, item) => sum + (item.present ? item.weight : 0), 0);
      const missingItems = completenessItems.filter(i => !i.present).map(({ label, weight, cta, unlocks }) => ({ label, weight, cta, unlocks }));

      return {
        middleScore,
        scores: { tu, ex, eq },
        scoreModel: profile?.score_model || "Unknown",
        lastReportDate: profile?.last_report_analyzed_at || null,
        negativeItems: negItems,
        activeChargeOffs,
        chargeOffTotal,
        activeCollections,
        derogWithin12mo: derogWithin(12),
        derogWithin24mo: derogWithin(24),
        totalActiveNegatives: negItems.filter((n: any) => n.status !== "removed").length,
        creditAccounts: accounts,
        highestRevolvingLimit,
        revolvingLimitIsHistorical,
        highestInstallmentBalance,
        highestLOCLimit,
        openAccountCount: openAccounts.length,
        oldestAccountAgeMonths,
        businesses,
        hasEntityStructure: hasEntity,
        timeInBusinessMonths,
        hasEIN,
        financialKpis: kpis,
        hasRevenueData: annualRevenue != null && annualRevenue > 0,
        annualRevenue,
        monthlyCashFlow,
        connectedBanks: banks.length,
        hasBankingRelationship: banks.length > 0,
        buildScores,
        hasBusinessCreditScores: buildScores?.paydex != null || buildScores?.intelliscore != null,
        completeness,
        missingItems,
        hasFraudAlert: false, // TODO: integrate with bureau API flags
        hasSecurityFreeze: false,
        fundingGoals: profile?.funding_goals || null,
        isLoading: false,
      };
    },
  });

  if (isLoading || !data) {
    return {
      middleScore: null, scores: { tu: null, ex: null, eq: null }, scoreModel: "Unknown", lastReportDate: null,
      negativeItems: [], activeChargeOffs: [], chargeOffTotal: 0, activeCollections: [], derogWithin12mo: 0, derogWithin24mo: 0, totalActiveNegatives: 0,
      creditAccounts: [], highestRevolvingLimit: 0, revolvingLimitIsHistorical: false, highestInstallmentBalance: 0, highestLOCLimit: 0, openAccountCount: 0, oldestAccountAgeMonths: 0,
      businesses: [], hasEntityStructure: false, timeInBusinessMonths: null, hasEIN: false,
      financialKpis: null, hasRevenueData: false, annualRevenue: null, monthlyCashFlow: null,
      connectedBanks: 0, hasBankingRelationship: false,
      buildScores: null, hasBusinessCreditScores: false,
      completeness: 0, missingItems: [],
      hasFraudAlert: false, hasSecurityFreeze: false,
      fundingGoals: null,
      isLoading: true,
    };
  }

  return { ...data, isLoading: false };
}
