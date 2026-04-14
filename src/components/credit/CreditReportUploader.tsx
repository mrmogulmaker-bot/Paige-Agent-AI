import { useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Upload, Loader2, CheckCircle, FileText, RefreshCw, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

interface CreditReportUploaderProps {
  lastAnalyzed: string | null;
  lastBureau: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function CreditReportUploader({ lastAnalyzed, lastBureau, onRefresh, isRefreshing }: CreditReportUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ bureau?: string; accounts?: number } | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const processUpload = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File size must be under 20MB");
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const userId = session.user.id;
      const filePath = `${userId}/${Date.now()}_${file.name}`;

      const { error: storageError } = await supabase.storage
        .from("credit-report-uploads")
        .upload(filePath, file);
      if (storageError) throw storageError;

      const { data: uploadRecord, error: insertError } = await supabase
        .from("credit_report_uploads")
        .insert({
          user_id: userId,
          uploaded_by: userId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          analysis_status: "pending",
        })
        .select()
        .single();
      if (insertError) throw insertError;

      toast.info("Analyzing your report — this takes about 30 seconds.", { duration: 8000 });

      const { data: analysisData, error: fnError } = await supabase.functions.invoke("analyze-credit-report", {
        body: { uploadId: uploadRecord.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) throw fnError;

      const analysis = analysisData?.analysis;
      if (analysis) {
        await supabase.functions.invoke("sync-credit-report-data", {
          body: {
            target_user_id: userId,
            report_type: analysis.report_type || "consumer",
            scores: analysis.scores,
            score_model: analysis.score_model,
            negative_items: (analysis.negative_items || []).map((item: any) => ({
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
            hard_inquiries: analysis.hard_inquiries || [],
            positive_accounts: (analysis.positive_accounts || []).map((acct: any) => ({
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
            discrepancies: analysis.cross_bureau_discrepancies || [],
            priority_disputes: [],
            report_upload_id: uploadRecord.id,
            fraud_alerts: analysis.fraud_alerts,
            security_freezes: analysis.security_freezes,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }

      const { data: updated } = await supabase
        .from("credit_report_uploads")
        .select("bureau_detected, analysis_result")
        .eq("id", uploadRecord.id)
        .single();

      const result = updated as any;
      const totalAccounts = ((result?.analysis_result?.negative_items?.length || 0) + (result?.analysis_result?.positive_accounts?.length || 0));

      setUploadResult({ bureau: result?.bureau_detected || undefined, accounts: totalAccounts });

      queryClient.invalidateQueries({ queryKey: ["credit-factors"] });
      queryClient.invalidateQueries({ queryKey: ["credit-factors-history"] });
      queryClient.invalidateQueries({ queryKey: ["has-credit-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["last-analyzed-at"] });
      queryClient.invalidateQueries({ queryKey: ["credit-health-assessment"] });
      queryClient.invalidateQueries({ queryKey: ["bureau-scores"] });

      toast.success(`Analysis complete! Found ${totalAccounts} accounts${result?.bureau_detected ? ` from ${result.bureau_detected}` : ""}.`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error?.message || "Failed to upload report");
    } finally {
      setIsUploading(false);
    }
  }, [queryClient]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processUpload(file);
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processUpload(file);
  }, [processUpload]);

  const handleReset = async () => {
    if (resetConfirmText !== "RESET") return;
    setIsResetting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const userId = session.user.id;

      // Step 1: Delete all extracted data across every dependent table
      await Promise.all([
        supabase.from("credit_accounts").delete().eq("user_id", userId),
        supabase.from("credit_negative_items").delete().eq("user_id", userId),
        supabase.from("credit_report_personal_info").delete().eq("user_id", userId),
        supabase.from("credit_alerts").delete().eq("client_id", userId),
        supabase.from("extraction_quality_log" as any).delete().eq("client_id", userId),
        supabase.from("credit_factor_scores").delete().eq("user_id", userId),
        supabase.from("client_memory").delete().eq("client_user_id", userId),
        supabase.from("chat_messages").delete().eq("user_id", userId),
      ]);

      // Step 2: Reset upload records to pending (preserve PDFs)
      await supabase
        .from("credit_report_uploads")
        .update({
          analysis_status: "pending",
          analysis_result: null,
          negative_items_extracted: null,
          positive_accounts_extracted: null,
          profile_summary: null,
          estimated_score_impact: null,
          last_analyzed_at: null,
          bureau_detected: null,
          backfill_status: null,
          backfill_completed_at: null,
          backfill_fields_updated: null,
        })
        .eq("user_id", userId);

      // Step 3: Clear bureau scores on profile
      await supabase
        .from("profiles")
        .update({
          estimated_fico_eq: null,
          estimated_fico_ex: null,
          estimated_fico_tu: null,
        })
        .eq("user_id", userId);

      // Step 4: Audit log
      await supabase.from("audit_logs").insert({
        user_id: userId,
        entity: "credit_file",
        action: "reset",
        data: { source: "client_ui", triggered_by: userId, timestamp: new Date().toISOString() },
      });

      // Step 5: Invalidate ALL React Query cache — forces every component to re-fetch
      queryClient.invalidateQueries();

      // Step 6: Clear local upload result state
      setUploadResult(null);
      setResetDialogOpen(false);
      setResetConfirmText("");

      toast.success("Credit file reset complete. Your uploaded reports are still available — click Refresh Analysis to re-analyze them without re-uploading.");

      // Step 7: Force page reload so all components re-initialize from scratch
      setTimeout(() => window.location.reload(), 500);
    } catch (error: any) {
      console.error("Reset error:", error);
      toast.error(error?.message || "Reset failed");
    } finally {
      setIsResetting(false);
    }
  };

  const hasReport = !!lastAnalyzed;

  // State B — Compact banner when report exists
  if (hasReport) {
    return (
      <>
        <Card className="p-4 bg-card border-border">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-fundability-excellent shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Last analyzed: {format(new Date(lastAnalyzed), "MMM d, yyyy 'at' h:mm a")}
                  {lastBureau && <span className="text-muted-foreground"> — {lastBureau} report</span>}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing || isUploading}
                className="gap-1.5"
              >
                {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh Analysis
              </Button>
              <div>
                <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="bg-gradient-gold hover:opacity-90 gap-1.5"
                >
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload New Report
                </Button>
              </div>
            </div>
          </div>

          {uploadResult && (
            <div className="mt-3 p-3 bg-muted/30 border border-border rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-fundability-excellent" />
              <span className="text-sm">
                Analysis complete — {uploadResult.accounts} accounts found
                {uploadResult.bureau && ` from ${uploadResult.bureau}`}
              </span>
            </div>
          )}

          <div className="mt-2 text-center">
            <button
              onClick={() => { setResetDialogOpen(true); setResetConfirmText(""); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              <RotateCcw className="w-3 h-3 inline mr-1" />
              Reset Credit File
            </button>
          </div>
        </Card>

        {/* Reset Confirmation Dialog */}
        <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive">Reset your credit file?</DialogTitle>
              <DialogDescription>
                This will clear all extracted account data, scores, and analysis results. Your uploaded PDF files will be preserved so you can re-analyze them. This cannot be undone without re-uploading your report.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm font-medium">Type RESET to confirm:</p>
              <Input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="font-mono"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={resetConfirmText !== "RESET" || isResetting}
                onClick={handleReset}
              >
                {isResetting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Reset Credit File
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // State A — Full upload area when no report exists
  return (
    <Card
      className={`p-8 border-2 border-dashed transition-colors ${
        isDragOver ? "border-accent bg-accent/5" : "border-accent/40 bg-card"
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10">
          {isUploading ? (
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-accent" />
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {isUploading ? "Analyzing your report..." : "Upload your credit report to get started"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isUploading
              ? "This takes about 30 seconds. We're extracting every account, score, and item."
              : "We accept PDF credit reports from Experian, TransUnion, and Equifax."}
          </p>
        </div>

        {!isUploading && (
          <>
            <div>
              <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="bg-gradient-gold hover:opacity-90"
                size="lg"
              >
                <FileText className="w-4 h-4 mr-2" />
                Browse Files
              </Button>
              <p className="text-xs text-muted-foreground mt-2">or drag and drop your PDF here</p>
            </div>

            <div className="flex items-center justify-center gap-3">
              <Badge variant="outline" className="text-xs">Experian</Badge>
              <Badge variant="outline" className="text-xs">TransUnion</Badge>
              <Badge variant="outline" className="text-xs">Equifax</Badge>
            </div>

            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Upload one report per bureau for the most accurate analysis. Tri-merge reports that contain all three bureaus in one PDF are also accepted.
            </p>
          </>
        )}

        {uploadResult && (
          <div className="p-3 bg-muted/30 border border-border rounded-lg inline-flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-fundability-excellent" />
            <span className="text-sm">
              Analysis complete — {uploadResult.accounts} accounts found
              {uploadResult.bureau && ` from ${uploadResult.bureau}`}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
