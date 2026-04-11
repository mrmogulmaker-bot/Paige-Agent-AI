import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreditFactors } from "./useCreditFactors";
import { useBuildScore } from "./useBuildScore";
import { useFinancialKPIs } from "./useFinancialKPIs";
import { useFundingMatches } from "./useFundingMatches";

export interface FundingReadinessBreakdown {
  label: string;
  weight: number;
  score: number; // 0-1000 scaled
  rawScore: number; // 0-100 raw
  explanation: string;
}

export interface FundingReadinessResult {
  overallScore: number;
  breakdown: FundingReadinessBreakdown[];
  topBlockers: string[];
}

function calcPersonalCreditScore(factors: any): { score: number; explanation: string } {
  if (!factors) return { score: 0, explanation: "No personal credit data available. Upload a credit report to get started." };
  const fundability = factors.overall_fundability_score ?? 0;
  const score = Math.min(100, fundability);
  if (score >= 80) return { score, explanation: "Strong personal credit profile supporting funding eligibility." };
  if (score >= 50) return { score, explanation: "Moderate personal credit. Reducing utilization and resolving negatives would help." };
  return { score, explanation: "Personal credit needs improvement. Focus on payment history and reducing balances." };
}

function calcBusinessCreditScore(buildData: any): { score: number; explanation: string } {
  if (!buildData || buildData.build_score === 0) return { score: 0, explanation: "No business credit profile. Start the BUILD program to establish business credit." };
  const score = Math.min(100, buildData.build_score);
  if (score >= 70) return { score, explanation: "Strong business credit profile with good bureau reporting." };
  if (score >= 40) return { score, explanation: "Business credit developing. Add more reporting vendors and maintain on-time payments." };
  return { score, explanation: "Business credit is early-stage. Complete compliance steps and add starter vendors." };
}

function calcEntityStructureScore(docCount: number, businessCount: number): { score: number; explanation: string } {
  if (businessCount === 0) return { score: 0, explanation: "No business entities registered. Add your business to start building your entity structure." };
  // Simple heuristic: more docs = more complete
  const docsPerBiz = docCount / businessCount;
  let score = Math.min(100, docsPerBiz * 10); // ~10 docs per business = 100%
  if (businessCount > 0 && docCount === 0) score = 15; // Entity exists but no docs
  if (score >= 80) return { score, explanation: "Entity documentation is comprehensive and lender-ready." };
  if (score >= 40) return { score, explanation: "Some entity documents present. Upload EIN letter, articles, and operating agreement." };
  return { score, explanation: "Entity structure incomplete. Lenders require formation docs, EIN, and operating agreements." };
}

function calcBankingScore(kpis: any): { score: number; explanation: string } {
  if (!kpis) return { score: 0, explanation: "No banking data connected. Link your bank accounts via Plaid to build banking history." };
  let score = 0;
  const balance = kpis.avg_balance_90d ?? 0;
  if (balance >= 25000) score += 40;
  else if (balance >= 10000) score += 25;
  else if (balance >= 5000) score += 15;
  else score += Math.round((balance / 5000) * 15);

  const dscr = kpis.dscr ?? 0;
  if (dscr >= 1.5) score += 30;
  else if (dscr >= 1.25) score += 20;
  else score += Math.round(dscr * 13);

  const nsf = kpis.nsf_count ?? 0;
  if (nsf === 0) score += 30;
  else if (nsf <= 2) score += 15;

  score = Math.min(100, score);
  if (score >= 70) return { score, explanation: "Banking history is strong with healthy balances and no overdrafts." };
  if (score >= 40) return { score, explanation: "Banking is adequate. Increase average balances and avoid NSF/overdraft events." };
  return { score, explanation: "Banking history needs work. Maintain consistent balances and eliminate NSF activity." };
}

function calcRevenueDocScore(hasAnalysis: boolean, avgRevenue: number | null): { score: number; explanation: string } {
  if (!hasAnalysis) return { score: 0, explanation: "No revenue documentation analyzed. Upload bank statements or P&L for AI extraction." };
  let score = 20; // Base for having any analysis
  if (avgRevenue && avgRevenue >= 50000) score = 100;
  else if (avgRevenue && avgRevenue >= 25000) score = 75;
  else if (avgRevenue && avgRevenue >= 10000) score = 50;
  else if (avgRevenue) score = 30;
  if (score >= 70) return { score, explanation: "Revenue documentation is strong and supports funding applications." };
  return { score, explanation: "Revenue documentation present but could be strengthened with additional periods." };
}

function calcLenderAlignmentScore(matchCount: number, eligibleCount: number): { score: number; explanation: string } {
  if (matchCount === 0) return { score: 0, explanation: "No funding matches run yet. Use the Funding Marketplace to find eligible products." };
  const ratio = matchCount > 0 ? (eligibleCount / matchCount) * 100 : 0;
  const score = Math.min(100, ratio);
  if (score >= 70) return { score, explanation: "Strong alignment with multiple lender products." };
  if (score >= 30) return { score, explanation: "Some lender alignment. Improve credit factors to unlock more products." };
  return { score, explanation: "Low lender alignment. Focus on the areas holding your score down to qualify for more products." };
}

export function useFundingReadiness() {
  const queryClient = useQueryClient();
  const { factors } = useCreditFactors();
  const { data: buildData } = useBuildScore();
  const { data: kpis } = useFinancialKPIs();
  const { matches, eligible } = useFundingMatches();

  const { data: supplemental } = useQuery({
    queryKey: ["funding-readiness-supplemental"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const [docsRes, bizRes, analysisRes] = await Promise.all([
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("businesses").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id),
        supabase.from("financial_document_analyses").select("avg_monthly_revenue").eq("user_id", user.id).eq("analysis_status", "completed").order("created_at", { ascending: false }).limit(1),
      ]);

      return {
        docCount: docsRes.count ?? 0,
        businessCount: bizRes.count ?? 0,
        latestRevenue: (analysisRes.data as any)?.[0]?.avg_monthly_revenue ?? null,
        hasAnalysis: (analysisRes.data?.length ?? 0) > 0,
      };
    },
  });

  const result: FundingReadinessResult | null = (() => {
    if (!supplemental) return null;

    const personal = calcPersonalCreditScore(factors);
    const business = calcBusinessCreditScore(buildData);
    const entity = calcEntityStructureScore(supplemental.docCount, supplemental.businessCount);
    const banking = calcBankingScore(kpis);
    const revenue = calcRevenueDocScore(supplemental.hasAnalysis, supplemental.latestRevenue);
    const lender = calcLenderAlignmentScore(matches?.length ?? 0, eligible?.length ?? 0);

    const categories: FundingReadinessBreakdown[] = [
      { label: "Personal Credit", weight: 0.25, rawScore: personal.score, score: Math.round(personal.score * 10 * 0.25), explanation: personal.explanation },
      { label: "Business Credit", weight: 0.20, rawScore: business.score, score: Math.round(business.score * 10 * 0.20), explanation: business.explanation },
      { label: "Entity Structure", weight: 0.20, rawScore: entity.score, score: Math.round(entity.score * 10 * 0.20), explanation: entity.explanation },
      { label: "Banking History", weight: 0.15, rawScore: banking.score, score: Math.round(banking.score * 10 * 0.15), explanation: banking.explanation },
      { label: "Revenue Docs", weight: 0.10, rawScore: revenue.score, score: Math.round(revenue.score * 10 * 0.10), explanation: revenue.explanation },
      { label: "Lender Alignment", weight: 0.10, rawScore: lender.score, score: Math.round(lender.score * 10 * 0.10), explanation: lender.explanation },
    ];

    const overallScore = categories.reduce((sum, c) => sum + c.score, 0);

    const topBlockers = categories
      .filter(c => c.rawScore < 60)
      .sort((a, b) => (a.rawScore - b.rawScore) || (b.weight - a.weight))
      .slice(0, 3)
      .map(c => c.explanation);

    return { overallScore, breakdown: categories, topBlockers };
  })();

  // Save score to DB
  const saveScore = useMutation({
    mutationFn: async (data: FundingReadinessResult) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const row = {
        user_id: user.id,
        overall_score: data.overallScore,
        personal_credit_score: data.breakdown[0].rawScore,
        business_credit_score: data.breakdown[1].rawScore,
        entity_structure_score: data.breakdown[2].rawScore,
        banking_history_score: data.breakdown[3].rawScore,
        revenue_documentation_score: data.breakdown[4].rawScore,
        lender_alignment_score: data.breakdown[5].rawScore,
        score_explanations: Object.fromEntries(data.breakdown.map(b => [b.label, b.explanation])),
        last_calculated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("funding_readiness_scores")
        .upsert(row, { onConflict: "user_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funding-readiness-scores"] });
    },
  });

  return { result, saveScore };
}
