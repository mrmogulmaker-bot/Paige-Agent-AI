import { useState } from "react";
import { toast } from "sonner";
import { useBuildScore } from "@/hooks/useBuildScore";
import { useFinancialKPIs } from "@/hooks/useFinancialKPIs";
import BuildProgramBusiness from "./BuildProgramBusiness";

export function BuildProgramBusinessWrapper() {
  const { data: buildData } = useBuildScore();
  const { data: kpiData } = useFinancialKPIs();
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Mock vendor data - replace with actual data source
  const mockVendors = [
    { name: "Uline", status: "Reported" as const, days_to_pay: 15, early_pay: true },
    { name: "Quill", status: "Reported" as const, days_to_pay: 20, early_pay: true },
    { name: "Grainger", status: "Pending" as const, days_to_pay: 30, early_pay: false },
  ];

  // Generate insights based on BUILD score
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

  const handleRunAssessment = () => {
    toast.info("Running BUILD assessment...");
    // TODO: Implement actual assessment logic
    setTimeout(() => {
      toast.success("BUILD assessment complete! Check insights below.");
    }, 1500);
  };

  const handleSyncBureaus = async () => {
    setSyncing(true);
    toast.info("Syncing bureau data...");
    // TODO: Call actual sync API
    setTimeout(() => {
      setSyncing(false);
      toast.success("Bureau data synced successfully!");
    }, 2000);
  };

  const handleParseReport = async (file: File) => {
    setUploading(true);
    toast.info("Parsing credit report...");
    // TODO: Call actual parse API
    setTimeout(() => {
      setUploading(false);
      toast.success("Credit report parsed successfully!");
    }, 2000);
  };

  const handleOpenStageTasks = (stageKey: "B"|"U"|"I"|"L"|"D") => {
    toast.info(`Opening tasks for BUILD stage: ${stageKey}`);
    // TODO: Navigate to tasks filtered by stage
  };

  const handleAddVendors = () => {
    toast.info("Opening vendor selection...");
    // TODO: Open vendor add dialog
  };

  const handleOpenFundingPlan = () => {
    toast.info("Opening funding plan...");
    // TODO: Navigate to funding plan view
  };

  // Calculate fundability percentage
  const fundabilityPct = buildData?.build_score ?? 0;

  // Prepare stage percentages
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
          status: "Update Needed" // TODO: Get actual status
        },
        equifax: {
          status: "Update Needed" // TODO: Get actual status
        }
      }}
      banking={{
        avg_balance_90d: kpiData?.avg_balance_90d,
        dscr: kpiData?.dscr
      }}
      build={{
        score: buildData?.build_score,
        fundability_pct: fundabilityPct,
        stages
      }}
      vendors={mockVendors}
      onRunAssessment={handleRunAssessment}
      onSyncBureaus={handleSyncBureaus}
      onParseReport={handleParseReport}
      onOpenStageTasks={handleOpenStageTasks}
      onAddVendors={handleAddVendors}
      onOpenFundingPlan={handleOpenFundingPlan}
      insights={generateInsights()}
      uploading={uploading}
      syncing={syncing}
    />
  );
}
