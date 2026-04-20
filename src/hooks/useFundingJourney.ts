import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FundingJourneyApplication, FundingJourneyStatus } from "@/lib/fundingJourney";

export interface FundingJourneySummary {
  totalApplications: number;
  approvalRate: number; // 0-100
  totalCapitalSecured: number;
  scoreImprovement: number | null;
  topDenialReason: string | null;
  mostRecent: FundingJourneyApplication | null;
  byStatus: Record<FundingJourneyStatus, number>;
}

const EMPTY_BY_STATUS: Record<FundingJourneyStatus, number> = {
  draft: 0,
  submitted: 0,
  under_review: 0,
  approved: 0,
  denied: 0,
  withdrawn: 0,
  funded: 0,
};

export function useFundingJourney(targetUserId?: string | null) {
  return useQuery({
    queryKey: ["funding-journey", targetUserId ?? "self"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = targetUserId || user?.id;
      if (!uid) return { applications: [] as FundingJourneyApplication[], summary: emptySummary() };

      const { data, error } = await supabase
        .from("funding_journey_applications")
        .select("*")
        .eq("user_id", uid)
        .order("application_date", { ascending: false });
      if (error) throw error;

      const applications = (data || []) as FundingJourneyApplication[];
      const summary = computeSummary(applications, uid);
      return { applications, summary };
    },
    staleTime: 60 * 1000,
  });
}

function emptySummary(): FundingJourneySummary {
  return {
    totalApplications: 0,
    approvalRate: 0,
    totalCapitalSecured: 0,
    scoreImprovement: null,
    topDenialReason: null,
    mostRecent: null,
    byStatus: { ...EMPTY_BY_STATUS },
  };
}

function computeSummary(apps: FundingJourneyApplication[], uid: string): FundingJourneySummary {
  if (apps.length === 0) return emptySummary();

  const decided = apps.filter((a) => a.status === "approved" || a.status === "denied" || a.status === "funded");
  const approvedOrFunded = apps.filter((a) => a.status === "approved" || a.status === "funded").length;
  const approvalRate = decided.length > 0 ? Math.round((approvedOrFunded / decided.length) * 100) : 0;

  const totalCapitalSecured = apps
    .filter((a) => a.status === "funded")
    .reduce((sum, a) => sum + (a.amount_approved || a.amount_requested || 0), 0);

  // Score improvement: latest credit_score_at_application - earliest non-null
  const withScore = apps
    .filter((a) => a.credit_score_at_application != null)
    .sort((a, b) => new Date(a.application_date).getTime() - new Date(b.application_date).getTime());
  let scoreImprovement: number | null = null;
  if (withScore.length >= 2) {
    const first = withScore[0].credit_score_at_application!;
    const last = withScore[withScore.length - 1].credit_score_at_application!;
    scoreImprovement = last - first;
  }

  // Top denial reason
  const reasonCounts = new Map<string, number>();
  for (const app of apps) {
    if (app.denial_reason_category) {
      reasonCounts.set(app.denial_reason_category, (reasonCounts.get(app.denial_reason_category) || 0) + 1);
    }
  }
  const topDenialReason = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const byStatus = { ...EMPTY_BY_STATUS };
  for (const app of apps) byStatus[app.status]++;

  return {
    totalApplications: apps.length,
    approvalRate,
    totalCapitalSecured,
    scoreImprovement,
    topDenialReason,
    mostRecent: apps[0],
    byStatus,
  };
}
