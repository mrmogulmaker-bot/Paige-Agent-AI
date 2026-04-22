// Wrapper for the BUILD Business program component.
// IMPORTANT: TODO action handlers are intentionally NOT passed through.
// BuildProgramBusiness conditionally renders each action button only when its
// handler is wired — leaving them undefined here hides the "Coming Soon"
// stubs so paying subscribers don't see dead buttons. Wire each handler
// here as the corresponding API/route ships.

import { useBuildScore } from "@/hooks/useBuildScore";
import { useFinancialKPIs } from "@/hooks/useFinancialKPIs";
import BuildProgramBusiness from "./BuildProgramBusiness";

export function BuildProgramBusinessWrapper() {
  const { data: buildData } = useBuildScore();
  const { data: kpiData } = useFinancialKPIs();

  // Mock vendor data — replace with actual data source when wired.
  const mockVendors = [
    { name: "Uline", status: "Reported" as const, days_to_pay: 15, early_pay: true },
    { name: "Quill", status: "Reported" as const, days_to_pay: 20, early_pay: true },
    { name: "Grainger", status: "Pending" as const, days_to_pay: 30, early_pay: false },
  ];

  const generateInsights = (): string[] => {
    const insights: string[] = [];
    const score = buildData?.build_score ?? 0;

    if (score < 70) {
      insights.push("Your BUILD score is below 70. Focus on improving compliance and vendor relationships to unlock funding opportunities.");
    }
    if (!buildData?.duns_verified) {
      insights.push("Verify your D-U-N-S number to unlock Tier U and improve your BUILD score by 40 points.");
    }
    if ((buildData?.active_vendors ?? 0) < 3) {
      insights.push("Add at least 3 active vendor tradelines to unlock Tier I. Start with Net-30 starter vendors.");
    }
    if ((buildData?.paydex ?? 0) < 80) {
      insights.push("Pay invoices early to boost your Paydex score above 80. This unlocks better funding terms.");
    }
    if ((kpiData?.dscr ?? 0) < 1.25) {
      insights.push("Improve your Debt Service Coverage Ratio to 1.25+ by increasing revenue or reducing debt obligations.");
    }
    if (insights.length === 0) {
      insights.push("Great work! Your BUILD fundamentals are strong. Continue maintaining early payment patterns.");
    }
    return insights;
  };

  const fundabilityPct = buildData?.build_score ?? 0;

  const stages = {
    B: { percent: buildData?.tier_b_unlocked ? 100 : 0 },
    U: { percent: buildData?.tier_u_unlocked ? 100 : buildData?.compliance_score ?? 0 },
    I: { percent: buildData?.tier_i_unlocked ? 100 : (buildData?.vendors_score ?? 0) * 0.6 },
    L: { percent: buildData?.tier_l_unlocked ? 100 : (buildData?.bureau_health_score ?? 0) * 0.8 },
    D: { percent: buildData?.tier_d_unlocked ? 100 : ((buildData?.months_clean_reporting ?? 0) / 12) * 100 },
  };

  return (
    <BuildProgramBusiness
      bureaus={{
        dnb: {
          paydex: buildData?.paydex,
          status: buildData?.duns_verified ? "Verified" : "Pending"
        },
        experian: {
          intelliscore: buildData?.intelliscore,
          status: "Update Needed"
        },
        equifax: {
          status: "Update Needed"
        }
      }}
      plaid={{
        avg_balance_90d: kpiData?.avg_balance_90d,
        dscr: kpiData?.dscr
      }}
      build={{
        score: buildData?.build_score,
        fundability_pct: fundabilityPct,
        stages
      }}
      vendors={mockVendors}
      insights={generateInsights()}
      // TODO: wire handlers below as their backends ship. Until then the
      // corresponding buttons stay hidden in the child component.
      // onRunAssessment={...}
      // onSyncBureaus={...}
      // onParseReport={...}
      // onOpenStageTasks={...}
      // onAddVendors={...}
      // onOpenFundingPlan={...}
    />
  );
}
