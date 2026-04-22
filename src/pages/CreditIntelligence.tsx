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
import { CreditReportUploader } from "@/components/credit/CreditReportUploader";
import { SoftPullAuthorizationCard } from "@/components/credit/SoftPullAuthorizationCard";
import { CreditFactorsPanel } from "@/components/credit/CreditFactorsPanel";
import { DataFreshnessIndicator } from "@/components/credit/DataFreshnessIndicator";
import { CreditAlertBanner } from "@/components/credit/CreditAlertBanner";
import { CreditAlertsTab } from "@/components/credit/CreditAlertsTab";
import { CreditIntelWalkthrough } from "@/components/credit/CreditIntelWalkthrough";
import { PredictionsPanel } from "@/components/dashboard/PredictionsPanel";
import { BusinessCreditTab } from "@/components/credit/BusinessCreditTab";
import { ThreeFundabilityScoresPanel } from "@/components/dashboard/ThreeFundabilityScoresPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { User, Building2 } from "lucide-react";
import { toast } from "sonner";

export default function CreditIntelligence() {
  const { factors, isLoading, recalculate } = useCreditFactors();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [selectedBureau, setSelectedBureau] = useState<"experian" | "transunion" | "equifax" | "all">("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useMemo(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setCurrentUserId(session?.user?.id ?? null));
  }, []);

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

  // Get last analyzed timestamp and bureau from most recent report upload
  const { data: lastReport } = useQuery({
    queryKey: ["last-analyzed-at"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;

      // Check credit_report_uploads for any completed analysis
      const { data } = await supabase
        .from("credit_report_uploads")
        .select("last_analyzed_at, created_at, bureau_detected, id, file_path, file_name")
        .eq("user_id", session.user.id)
        .in("analysis_status", ["completed", "complete"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const row = data[0] as any;
        return {
          timestamp: row.last_analyzed_at || row.created_at,
          bureau: row.bureau_detected || null,
          uploadId: row.id,
          filePath: row.file_path,
          fileName: row.file_name,
        };
      }
      return null;
    },
  });

  // Re-extract from original PDF mutation
  const reExtract = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      console.log("[Refresh] Looking for most recent upload for user:", session.user.id);

      // Step 1: Check credit_report_uploads (primary table)
      const { data: uploads, error: queryError } = await supabase
        .from("credit_report_uploads")
        .select("id, file_path, file_name, analysis_status, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      console.log("[Refresh] Found uploads:", uploads?.length, "Query error:", queryError);

      if (uploads && uploads.length > 0) {
        uploads.forEach((u: any, i: number) => {
          console.log(`[Refresh] Upload ${i}: id=${u.id}, status=${u.analysis_status}, file=${u.file_name}, path=${u.file_path}`);
        });
      }

      // Find the best upload — prefer completed, but accept any with a file_path
      const bestUpload = uploads?.find((u: any) => u.analysis_status === "completed")
        || uploads?.find((u: any) => u.file_path);

      if (!bestUpload) {
        throw new Error("We could not locate your previously uploaded credit report file. This may happen if the report was uploaded through a different pathway. Please upload your report using the upload area above to run a fresh analysis.");
      }

      const upload = bestUpload as any;
      console.log("[Refresh] Using upload:", upload.id, upload.file_name);

      // Verify the file exists in storage
      const { data: fileCheck } = await supabase.storage
        .from("credit-report-uploads")
        .createSignedUrl(upload.file_path, 60);

      if (!fileCheck?.signedUrl) {
        console.error("[Refresh] File not found in storage at path:", upload.file_path);
        throw new Error("The original report file could not be found in storage. Please upload your report again.");
      }

      toast.info(`Re-analyzing ${upload.file_name}...`, { duration: 5000 });

      // Re-run the analyze function on the same upload
      const response = await supabase.functions.invoke("analyze-credit-report", {
        body: { uploadId: upload.id },
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
            report_upload_id: upload.id,
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
        </div>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="personal" className="gap-2">
            <User className="w-4 h-4" /> Personal Credit
          </TabsTrigger>
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="w-4 h-4" /> Business Credit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-6 space-y-6">
          {/* Three Fundability Scores — primary placement at top of credit intelligence */}
          <section>
            <div className="mb-3">
              <h2 className="text-2xl font-bold text-primary">Your Fundability Intelligence</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Three scores that reflect how lenders actually evaluate you — updated as your profile grows.
              </p>
            </div>
            <ThreeFundabilityScoresPanel compactOnMobile />
          </section>

          {/* Page Walkthrough */}
          <CreditIntelWalkthrough />

          {/* Credit Alert Banner */}
          <CreditAlertBanner />

          {/* iSoftpull Soft Pull Authorization */}
          <SoftPullAuthorizationCard />

          {/* Credit Report Uploader */}
          <CreditReportUploader
            lastAnalyzed={lastReport?.timestamp || null}
            lastBureau={lastReport?.bureau || null}
            onRefresh={() => reExtract.mutate()}
            isRefreshing={reExtract.isPending}
          />

          {/* Bureau Score Panel */}
          <BureauScorePanel />

      {/* Data Freshness + Bureau Tab Selector */}
      {(hasData || hasAccounts) && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-2 flex-wrap">
            {(["all", "experian", "transunion", "equifax"] as const).map(b => (
              <Button
                key={b}
                variant={selectedBureau === b ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedBureau(b)}
                className={selectedBureau === b ? "bg-accent text-accent-foreground" : ""}
              >
                {b === "all" ? "All Bureaus" : b === "experian" ? "Experian" : b === "transunion" ? "TransUnion" : "Equifax"}
              </Button>
            ))}
          </div>
          <DataFreshnessIndicator />
        </div>
      )}

      {/* Legacy single Fundability Score replaced by ThreeFundabilityScoresPanel at top */}

      {/* Credit Factors Panel — between Bureau Strategy and Health Assessment */}
      <CreditFactorsPanel selectedBureau={selectedBureau} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      )}

      {/* Paige's Predictions — full panel */}
      <PredictionsPanel userId={currentUserId} variant="full" onNavigate={(s) => navigate(`/app?section=${s}`)} />

      {/* Credit File Health Assessment */}
      <div id="credit-health-assessment">
        <CreditFileHealthAssessment />
      </div>

          {/* Alerts History */}
          <CreditAlertsTab />
        </TabsContent>

        <TabsContent value="business" className="mt-6">
          <BusinessCreditTab />
        </TabsContent>
      </Tabs>

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
