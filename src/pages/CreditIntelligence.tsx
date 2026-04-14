import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreditFactors } from "@/hooks/useCreditFactors";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, TrendingUp, AlertTriangle, CheckCircle, XCircle, Upload, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { BureauScorePanel } from "@/components/dashboard/BureauScorePanel";
import { CreditFileHealthAssessment } from "@/components/credit/CreditFileHealthAssessment";
import { AccountManager } from "@/components/credit/AccountManager";
import { toast } from "sonner";

export default function CreditIntelligence() {
  const { factors, isLoading, recalculate } = useCreditFactors();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);

  // Check if client has any accounts
  const { data: hasAccounts } = useQuery({
    queryKey: ["has-credit-accounts"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return false;
      const [{ count: acctCount }, { count: negCount }] = await Promise.all([
        supabase.from("credit_accounts").select("id", { count: "exact", head: true }).eq("user_id", session.user.id),
        supabase.from("credit_negative_items").select("id", { count: "exact", head: true }).eq("user_id", session.user.id),
      ]);
      return ((acctCount ?? 0) + (negCount ?? 0)) > 0;
    },
  });

  // Get last analyzed timestamp from most recent report upload
  const { data: lastAnalyzed } = useQuery({
    queryKey: ["last-analyzed-at"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;
      const { data } = await supabase
        .from("credit_report_uploads")
        .select("last_analyzed_at, created_at")
        .eq("user_id", session.user.id)
        .eq("analysis_status", "completed")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        return (data[0] as any).last_analyzed_at || (data[0] as any).created_at;
      }
      return null;
    },
  });

  // Re-extract from original PDF mutation
  const reExtract = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Get most recent completed upload
      const { data: uploads } = await supabase
        .from("credit_report_uploads")
        .select("id, file_path, file_name")
        .eq("user_id", session.user.id)
        .eq("analysis_status", "completed")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!uploads || uploads.length === 0) {
        throw new Error("No previously analyzed credit report found. Please upload a new report.");
      }

      const upload = uploads[0];
      toast.info(`Re-analyzing ${(upload as any).file_name}...`, { duration: 5000 });

      // Re-run the analyze function on the same upload
      const response = await supabase.functions.invoke("analyze-credit-report", {
        body: { uploadId: (upload as any).id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw new Error(response.error.message || "Re-analysis failed");

      // After analysis, trigger sync
      const analysisData = response.data?.analysis;
      if (analysisData) {
        await supabase.functions.invoke("sync-credit-report-data", {
          body: {
            target_user_id: session.user.id,
            report_type: analysisData.report_type || "consumer",
            scores: analysisData.scores,
            score_model: analysisData.score_model,
            negative_items: (analysisData.negative_items || []).map((item: any) => ({
              creditor_name: item.creditor_name,
              account_number: item.account_number || item.account_number_masked || null,
              account_number_masked: item.account_number || item.account_number_masked || null,
              bureau: item.bureau || item.bureaus_reporting?.[0] || "unknown",
              item_type: item.category || "collection",
              amount: item.amount,
              original_amount: item.original_amount || null,
              date_of_occurrence: item.date_of_occurrence,
              date_reported: item.date_reported,
              dispute_basis: item.dispute_reason_suggestion,
              estimated_score_impact: item.estimated_score_impact,
              status: item.status || "active",
            })),
            hard_inquiries: analysisData.hard_inquiries || [],
            positive_accounts: (analysisData.positive_accounts || []).map((acct: any) => ({
              creditor: acct.creditor,
              account_number: acct.account_number || null,
              account_type: acct.account_type,
              balance: acct.balance,
              credit_limit: acct.credit_limit,
              original_amount: acct.original_amount || null,
              utilization: acct.utilization,
              payment_status: acct.payment_status,
              payment_history_percentage: acct.payment_history_percentage || null,
              account_open_date: acct.opened_date,
              date_closed: acct.date_closed || null,
              is_open: acct.is_open,
              responsibility: acct.responsibility || null,
            })),
            discrepancies: analysisData.cross_bureau_discrepancies || [],
            priority_disputes: [],
            report_upload_id: (upload as any).id,
            fraud_alerts: analysisData.fraud_alerts,
            security_freezes: analysisData.security_freezes,
            validation_flags: response.data?.validation_flags || [],
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["credit-factors"] });
      queryClient.invalidateQueries({ queryKey: ["credit-factors-history"] });
      queryClient.invalidateQueries({ queryKey: ["has-credit-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["last-analyzed-at"] });
      queryClient.invalidateQueries({ queryKey: ["credit-health-assessment"] });
      queryClient.invalidateQueries({ queryKey: ["bureau-scores"] });

      const flags = data?.validation_flags || [];
      const flagCount = flags.length;
      if (flagCount > 0) {
        toast.success(`Re-analysis complete. ${flagCount} item(s) flagged for review.`);
      } else {
        toast.success("Re-analysis complete. All data refreshed from original report.");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Re-analysis failed. Please try again.");
    },
  });

  const hasData = factors && (
    factors.payment_history_score != null ||
    factors.utilization_score != null ||
    factors.credit_age_score != null ||
    factors.credit_mix_score != null ||
    factors.inquiry_score != null
  );

  const factorCards = hasData
    ? [
        {
          label: "Payment History",
          weight: "35%",
          score: factors.payment_history_score ?? 0,
          details: [
            `${factors.active_negatives ?? 0} active negatives`,
            `${factors.removed_negatives ?? 0} removed`,
            `${factors.total_negatives ?? 0} total tracked`,
          ],
          action: "Dispute negative items",
        },
        {
          label: "Utilization",
          weight: "30%",
          score: factors.utilization_score ?? 0,
          details: [
            `${Math.round(factors.aggregate_utilization || 0)}% aggregate`,
            `${factors.cards_over_30_pct ?? 0} cards over 30%`,
            `${factors.cards_over_70_pct ?? 0} cards over 70%`,
            `$${Number(factors.total_balance || 0).toLocaleString()} / $${Number(factors.total_credit_limit || 0).toLocaleString()}`,
          ],
          action: "Optimize paydown strategy",
        },
        {
          label: "Credit Age",
          weight: "15%",
          score: factors.credit_age_score ?? 0,
          details: [
            `${factors.average_account_age_months ?? 0} months average`,
            `${factors.oldest_account_age_months ?? 0} months oldest`,
            `${factors.newest_account_age_months ?? 0} months newest`,
          ],
          action: "Don't close old accounts",
        },
        {
          label: "Credit Mix",
          weight: "10%",
          score: factors.credit_mix_score ?? 0,
          details: [
            `${factors.revolving_count ?? 0} revolving`,
            `${factors.installment_count ?? 0} installment`,
            `${factors.mortgage_count ?? 0} mortgage`,
          ],
          action: "Diversify account types",
        },
        {
          label: "Inquiries",
          weight: "10%",
          score: factors.inquiry_score ?? 0,
          details: [
            `TU: ${factors.total_inquiries_tu ?? 0} | EX: ${factors.total_inquiries_ex ?? 0} | EQ: ${factors.total_inquiries_eq ?? 0}`,
            `${factors.inquiry_budget_remaining ?? 0} safe inquiries remaining`,
          ],
          action: "Manage inquiry timing",
        },
      ]
    : [];

  const lastCalculated = factors?.calculated_at;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Credit Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Your 5-factor FICO breakdown — stop guessing, see the data.
          </p>
          {hasData && lastCalculated && (
            <p className="text-xs text-muted-foreground mt-1">
              Last synced: {format(new Date(lastCalculated), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
          {lastAnalyzed && (
            <p className="text-xs text-muted-foreground">
              Last extracted from report: {format(new Date(lastAnalyzed), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {(hasData || hasAccounts) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAccountManagerOpen(true)}
              className="gap-1.5"
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">Edit Accounts</span>
            </Button>
          )}
          {hasData ? (
            <Button
              onClick={() => reExtract.mutate()}
              disabled={reExtract.isPending}
              className="bg-gradient-gold hover:opacity-90"
            >
              {reExtract.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh Credit Analysis
            </Button>
          ) : (
            <Button
              onClick={() => navigate("/app")}
              className="bg-gradient-gold hover:opacity-90"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload a Credit Report
            </Button>
          )}
        </div>
      </div>

      {/* Bureau Score Panel */}
      <BureauScorePanel />

      {/* Fundability Score Ring */}
      {hasData && (
        <Card className="p-8 bg-card border-border text-center">
          <div className="inline-flex flex-col items-center">
            <div className="relative w-36 h-36">
              <svg className="w-36 h-36 transform -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="50" fill="none"
                  stroke={getScoreHSL(factors.overall_fundability_score ?? 0)}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${((factors.overall_fundability_score ?? 0) / 100) * 314} 314`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${getScoreTextColor(factors.overall_fundability_score ?? 0)}`}>
                  {factors.overall_fundability_score ?? 0}
                </span>
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
            </div>
            <h2 className="text-xl font-bold mt-4">Fundability Score</h2>
            <p className="text-sm text-muted-foreground">
              {getFundabilityLabel(factors.overall_fundability_score ?? 0)}
            </p>
          </div>
        </Card>
      )}

      {/* Factor Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : hasData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {factorCards.map((fc) => (
            <Card key={fc.label} className="p-5 bg-card border-border hover:border-accent/50 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <StatusIcon score={fc.score} />
                <span className="text-xs text-muted-foreground">{fc.weight}</span>
              </div>
              <div className={`text-2xl font-bold ${getScoreTextColor(fc.score)}`}>
                {fc.score}/100
              </div>
              <h3 className="font-semibold text-sm mt-1">{fc.label}</h3>
              <ul className="mt-3 space-y-1">
                {fc.details.map((d, i) => (
                  <li key={i} className="text-xs text-muted-foreground">{d}</li>
                ))}
              </ul>
              <p className="text-xs text-accent mt-3 font-medium">💡 {fc.action}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg">Upload a credit report to see your FICO breakdown</h3>
          <p className="text-muted-foreground text-sm mt-2">
            Open Paige chat and attach a PDF credit report. She'll analyze it and your factor scores will appear here automatically.
          </p>
        </Card>
      )}

      {/* Credit File Health Assessment */}
      <CreditFileHealthAssessment />

      {/* Account Manager */}
      <AccountManager isOpen={accountManagerOpen} onClose={() => setAccountManagerOpen(false)} />
    </div>
  );
}

function StatusIcon({ score }: { score: number }) {
  if (score >= 80) return <CheckCircle className="w-5 h-5 text-fundability-excellent" />;
  if (score >= 60) return <TrendingUp className="w-5 h-5 text-fundability-good" />;
  if (score >= 40) return <AlertTriangle className="w-5 h-5 text-fundability-fair" />;
  return <XCircle className="w-5 h-5 text-fundability-poor" />;
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return "text-fundability-excellent";
  if (score >= 60) return "text-fundability-good";
  if (score >= 40) return "text-fundability-fair";
  return "text-fundability-poor";
}

function getScoreHSL(score: number): string {
  if (score >= 80) return "hsl(142, 76%, 36%)";
  if (score >= 60) return "hsl(174, 62%, 47%)";
  if (score >= 40) return "hsl(38, 92%, 50%)";
  return "hsl(0, 72%, 51%)";
}

function getFundabilityLabel(score: number): string {
  if (score >= 90) return "Ready for funding.";
  if (score >= 80) return "Nearly fundable.";
  if (score >= 66) return "Getting closer.";
  if (score >= 51) return "Making progress.";
  if (score >= 31) return "Building foundation.";
  return "Needs significant work.";
}
