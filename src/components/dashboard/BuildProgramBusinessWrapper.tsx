// Wrapper for the BUILD Business program component.
// IMPORTANT: TODO action handlers are intentionally NOT passed through.
// BuildProgramBusiness conditionally renders each action button only when its
// handler is wired — leaving them undefined here hides the "Coming Soon"
// stubs so paying subscribers don't see dead buttons. Wire each handler
// here as the corresponding API/route ships.

import { useQuery } from "@tanstack/react-query";
import { useBuildScore } from "@/hooks/useBuildScore";
import { useFinancialKPIs } from "@/hooks/useFinancialKPIs";
import { supabase } from "@/integrations/supabase/client";
import BuildProgramBusiness from "./BuildProgramBusiness";

type VendorRow = {
  vendor_name: string;
  is_active: boolean | null;
  reports_to_bureaus: boolean | null;
  on_time_payments: number | null;
  late_payments: number | null;
  early_payments: number | null;
  total_payments: number | null;
  payment_terms: string | null;
};

export function BuildProgramBusinessWrapper() {
  const { data: buildData } = useBuildScore();
  const { data: kpiData } = useFinancialKPIs();

  // Real vendor data from `business_vendors`. The shape is mapped to the
  // {name, status, days_to_pay, early_pay} contract that BuildProgramBusiness
  // expects so the presentation layer stays untouched.
  const { data: vendors = [] } = useQuery({
    queryKey: ["business-vendors", "build-wrapper"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as VendorRow[];
      const { data } = await supabase
        .from("business_vendors")
        .select(
          "vendor_name, is_active, reports_to_bureaus, on_time_payments, late_payments, early_payments, total_payments, payment_terms"
        )
        .eq("user_id", user.id)
        .order("vendor_name");
      return (data ?? []) as VendorRow[];
    },
    staleTime: 30_000,
  });

  const mappedVendors = vendors.map((v) => {
    // Status mapping: "Reported" if the vendor reports to bureaus AND has at
    // least one recorded payment; "Pending" if it reports but has no activity
    // yet; "Missing" if the vendor never reports to bureaus (still useful as
    // a tradeline but doesn't help BUILD bureau scores).
    const total = v.total_payments ?? 0;
    let status: "Reported" | "Pending" | "Missing" = "Missing";
    if (v.reports_to_bureaus) {
      status = total > 0 ? "Reported" : "Pending";
    }

    // Approximate days_to_pay from payment_terms when set ("Net 30" → 30).
    // Falls back to undefined so the UI shows "—" instead of a wrong number.
    const termsMatch = v.payment_terms?.match(/(\d+)/);
    const days_to_pay = termsMatch ? Number(termsMatch[1]) : undefined;

    const early_pay = (v.early_payments ?? 0) > 0;

    return { name: v.vendor_name, status, days_to_pay, early_pay };
  });

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

  // Equifax status: "Verified" if we have a payment-index reading, otherwise
  // tell the user to upload (matches D&B / Experian copy).
  const equifaxStatus = (buildData?.equifax_payment_index ?? 0) > 0
    ? "Verified"
    : "Update Needed";
  const experianStatus = (buildData?.intelliscore ?? 0) > 0
    ? "Verified"
    : "Update Needed";

  return (
    <BuildProgramBusiness
      bureaus={{
        dnb: {
          paydex: buildData?.paydex,
          status: buildData?.duns_verified ? "Verified" : "Pending"
        },
        experian: {
          intelliscore: buildData?.intelliscore,
          status: experianStatus
        },
        equifax: {
          status: equifaxStatus
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
      vendors={mappedVendors}
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
