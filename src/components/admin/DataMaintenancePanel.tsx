import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Database, RefreshCw, Loader2, CheckCircle, AlertTriangle, XCircle, Play, Brain, Mail, Eye,
} from "lucide-react";
import { toast } from "sonner";

interface BackfillSummary {
  total_processed: number;
  total_accounts_updated: number;
  fields_populated: {
    account_numbers: number;
    original_amounts: number;
    payment_histories: number;
    dates: number;
  };
  failed_reports: { report_id: string; error: string }[];
  quality_scores: { report_id: string; score: number }[];
}

export function DataMaintenancePanel() {
  const queryClient = useQueryClient();
  const [backfillResult, setBackfillResult] = useState<BackfillSummary | null>(null);
  const [memoryBackfillResult, setMemoryBackfillResult] = useState<{
    total_processed: number; total_updated: number; error_count: number;
  } | null>(null);
  const [betaLaunchResult, setBetaLaunchResult] = useState<{
    total_profiles: number; sent: number; skipped_already_sent: number;
    skipped_unsubscribed: number; failed: number;
  } | null>(null);

  // Beta launch email preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewName, setPreviewName] = useState("Antonio");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);

  // Count total users with email so the confirm dialog can show the impact
  const { data: betaEligibleCount } = useQuery({
    queryKey: ["beta-launch-eligible-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .not("email", "is", null);
      return count ?? 0;
    },
  });

  const sendBetaLaunch = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await supabase.functions.invoke("send-beta-launch-email", {
        body: {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data as {
        total_profiles: number; sent: number; skipped_already_sent: number;
        skipped_unsubscribed: number; failed: number;
      };
    },
    onSuccess: (data) => {
      setBetaLaunchResult(data);
      toast.success(
        `Beta launch email sent to ${data.sent} user${data.sent === 1 ? "" : "s"}` +
          (data.skipped_already_sent ? ` · ${data.skipped_already_sent} already received` : "") +
          (data.skipped_unsubscribed ? ` · ${data.skipped_unsubscribed} unsubscribed` : "") +
          (data.failed ? ` · ${data.failed} failed` : "")
      );
    },
    onError: (err: Error) => toast.error(err.message || "Beta launch send failed"),
  });

  const previewBetaLaunch = useMutation({
    mutationFn: async (name: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await supabase.functions.invoke("preview-beta-launch-email", {
        body: { name: name.trim() || undefined },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data as {
        templateName: string; displayName: string; subject: string;
        sampleName: string | null; html: string;
      };
    },
    onSuccess: (data) => {
      setPreviewHtml(data.html);
      setPreviewSubject(data.subject);
    },
    onError: (err: Error) => toast.error(err.message || "Preview render failed"),
  });

  const openPreview = () => {
    setPreviewOpen(true);
    setPreviewHtml(null);
    setPreviewSubject(null);
    previewBetaLaunch.mutate(previewName);
  };

  const memoryBackfill = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await supabase.functions.invoke("backfill-memory-embeddings", {
        body: {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data) => {
      setMemoryBackfillResult({
        total_processed: data.total_processed,
        total_updated: data.total_updated,
        error_count: data.error_count,
      });
      toast.success(`Embedded ${data.total_updated} of ${data.total_processed} memories${data.error_count ? ` (${data.error_count} errors)` : ""}.`);
    },
    onError: (err: Error) => toast.error(err.message || "Memory backfill failed"),
  });

  // Re-extract: runs analyze-credit-report on the user's latest upload, which auto-syncs accounts
  const reExtractLatest = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data: latestUpload, error: uploadErr } = await supabase
        .from("credit_report_uploads")
        .select("id, file_name, created_at")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (uploadErr) throw new Error(uploadErr.message);
      if (!latestUpload) throw new Error("No credit report uploads found for this client");

      const analyzeResp = await supabase.functions.invoke("analyze-credit-report", {
        body: { uploadId: latestUpload.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (analyzeResp.error) throw new Error(analyzeResp.error.message || "Analysis failed");
      const data: any = analyzeResp.data;
      if (data?.error) throw new Error(data.error);

      const analysis = data?.analysis || {};
      const positiveCount = analysis.positive_accounts?.length || 0;
      const negativeCount = analysis.negative_items?.length || 0;
      const inquiryCount = analysis.hard_inquiries?.length || 0;

      return {
        userId: targetUserId,
        fileName: latestUpload.file_name,
        positiveCount,
        negativeCount,
        inquiryCount,
        syncOk: data?.sync?.ok !== false,
        syncError: data?.sync?.error || null,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-data-quality"] });
      const total = result.positiveCount + result.negativeCount;
      if (total === 0) {
        toast.warning(`Re-extraction of "${result.fileName}" returned 0 accounts — the PDF may be unreadable or not a credit report.`);
      } else if (!result.syncOk) {
        toast.error(`Extracted ${total} accounts but sync failed: ${result.syncError}`);
      } else {
        toast.success(`Re-extraction complete: ${result.positiveCount} accounts, ${result.negativeCount} negatives, ${result.inquiryCount} inquiries.`);
      }
    },
    onError: (err: Error) => toast.error(err.message || "Re-extraction failed"),
  });

  // Fetch data quality overview
  const { data: qualityData, isLoading: qualityLoading } = useQuery({
    queryKey: ["admin-data-quality"],
    queryFn: async () => {
      // Get all users with credit reports
      const { data: uploads } = await supabase
        .from("credit_report_uploads")
        .select("id, user_id, client_id, file_name, analysis_status, backfill_status, backfill_completed_at, last_analyzed_at, created_at")
        .in("analysis_status", ["completed", "complete"])
        .order("created_at", { ascending: false });

      if (!uploads) return [];

      // Group by user_id
      const userMap = new Map<string, any>();
      for (const u of uploads) {
        const uid = u.user_id as string;
        if (!userMap.has(uid)) {
          userMap.set(uid, { user_id: uid, reports: [], client_id: u.client_id });
        }
        userMap.get(uid).reports.push(u);
      }

      // Get profiles for names
      const userIds = Array.from(userMap.keys());
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));

      // Get account completeness per user
      const results = [];
      for (const [userId, info] of userMap) {
        const { data: accounts } = await supabase
          .from("credit_accounts")
          .select("id, account_number, original_amount, payment_history_json, account_open_date")
          .eq("user_id", userId);

        const total = accounts?.length || 0;
        let complete = 0;
        if (accounts) {
          for (const a of accounts) {
            const fields = [
              a.account_number != null,
              a.original_amount != null && a.original_amount !== 0,
              a.payment_history_json != null,
              a.account_open_date != null,
            ];
            if (fields.filter(Boolean).length >= 3) complete++;
          }
        }

        // Get quality score if available
        const { data: qualityLog } = await supabase
          .from("extraction_quality_log")
          .select("overall_quality_score")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);

        results.push({
          user_id: userId,
          name: profileMap.get(userId) || "Unknown",
          report_count: info.reports.length,
          account_count: total,
          completeness: total > 0 ? Math.round((complete / total) * 100) : 0,
          last_extraction: info.reports[0]?.last_analyzed_at || info.reports[0]?.created_at,
          backfill_status: info.reports[0]?.backfill_status || "not_needed",
          quality_score: (qualityLog as any)?.[0]?.overall_quality_score || null,
        });
      }

      return results.sort((a, b) => a.completeness - b.completeness);
    },
  });

  // Bulk backfill mutation
  const bulkBackfill = useMutation({
    mutationFn: async (targetUserId?: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("backfill-credit-extractions", {
        body: targetUserId ? { target_user_id: targetUserId } : {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data) => {
      setBackfillResult(data.summary);
      queryClient.invalidateQueries({ queryKey: ["admin-data-quality"] });
      toast.success(`Backfill complete: ${data.summary.total_accounts_updated} accounts updated across ${data.summary.total_processed} reports.`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Backfill failed");
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "in_progress": return <Badge variant="default" className="bg-blue-600">In Progress</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      case "pending": return <Badge variant="secondary">Pending</Badge>;
      default: return <Badge variant="outline">Not Needed</Badge>;
    }
  };

  const getQualityBadge = (score: number | null) => {
    if (score === null) return <span className="text-muted-foreground text-xs">—</span>;
    if (score >= 80) return <Badge className="bg-green-600">{score}/100</Badge>;
    if (score >= 60) return <Badge className="bg-amber-600">{score}/100</Badge>;
    return <Badge variant="destructive">{score}/100</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Database className="w-6 h-6" />
            Data Maintenance
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor data quality and trigger re-extractions for client credit reports.
          </p>
        </div>
        <Button
          onClick={() => bulkBackfill.mutate(undefined)}
          disabled={bulkBackfill.isPending}
          className="gap-2"
        >
          {bulkBackfill.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Backfill Missing Data
        </Button>
      </div>

      {/* Backfill Progress */}
      {bulkBackfill.isPending && (
        <Card className="border-blue-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-sm font-medium">Backfill in progress — re-extracting credit reports...</span>
            </div>
            <Progress value={undefined} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Backfill Results */}
      {backfillResult && !bulkBackfill.isPending && (
        <Card className="border-green-500/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Backfill Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{backfillResult.total_processed}</p>
                <p className="text-xs text-muted-foreground">Reports Processed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{backfillResult.total_accounts_updated}</p>
                <p className="text-xs text-muted-foreground">Accounts Updated</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{backfillResult.fields_populated.account_numbers}</p>
                <p className="text-xs text-muted-foreground">Account #s Added</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{backfillResult.fields_populated.original_amounts}</p>
                <p className="text-xs text-muted-foreground">Amounts Added</p>
              </div>
            </div>
            {backfillResult.failed_reports.length > 0 && (
              <div className="mt-4 p-3 bg-destructive/10 rounded-lg">
                <p className="text-sm font-medium text-destructive mb-2">
                  {backfillResult.failed_reports.length} report(s) failed:
                </p>
                {backfillResult.failed_reports.map((f, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    Report {f.report_id.slice(0, 8)}...: {f.error}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data Quality Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Data Quality Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {qualityLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !qualityData || qualityData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No credit reports uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-center">Reports</TableHead>
                    <TableHead className="text-center">Accounts</TableHead>
                    <TableHead className="text-center">Completeness</TableHead>
                    <TableHead className="text-center">Quality</TableHead>
                    <TableHead className="text-center">Backfill</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qualityData.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-center">{row.report_count}</TableCell>
                      <TableCell className="text-center">{row.account_count}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <Progress value={row.completeness} className="h-2 w-16" />
                          <span className="text-xs">{row.completeness}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{getQualityBadge(row.quality_score)}</TableCell>
                      <TableCell className="text-center">{getStatusBadge(row.backfill_status)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reExtractLatest.mutate(row.user_id)}
                          disabled={reExtractLatest.isPending && reExtractLatest.variables === row.user_id}
                          className="gap-1"
                        >
                          {reExtractLatest.isPending && reExtractLatest.variables === row.user_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          Re-extract
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Memory & AI Backfill */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Memory & AI Backfill
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Backfill Memory Embeddings</p>
              <p className="text-xs text-muted-foreground max-w-xl">
                Generate vector embeddings for any client_memory rows that are missing them.
                Required for semantic recall in Paige's AI chat and voice context. Safe to
                re-run; only processes records where embeddings are NULL.
              </p>
            </div>
            <Button
              onClick={() => memoryBackfill.mutate()}
              disabled={memoryBackfill.isPending}
              className="gap-2 shrink-0"
            >
              {memoryBackfill.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Brain className="w-4 h-4" />
              )}
              {memoryBackfill.isPending ? "Backfilling..." : "Backfill Memory Embeddings"}
            </Button>
          </div>

          {memoryBackfillResult && !memoryBackfill.isPending && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Last run complete</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Processed <strong className="text-foreground">{memoryBackfillResult.total_processed}</strong> memories ·{" "}
                <strong className="text-foreground">{memoryBackfillResult.total_updated}</strong> embedded
                {memoryBackfillResult.error_count > 0 && (
                  <> · <span className="text-destructive font-medium">{memoryBackfillResult.error_count} errors</span></>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Beta Launch Email — one-time send */}
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Beta Launch Announcement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Send Beta Launch Email to All Users</p>
              <p className="text-xs text-muted-foreground max-w-xl">
                One-time celebratory announcement covering the latest platform updates
                (3 fundability scores, Product Approval Readiness, bureau-specific strategy).
                Skips users who unsubscribed and any who already received it — safe to click
                even if some users were sent earlier.
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={sendBetaLaunch.isPending}
                  className="gap-2 shrink-0"
                >
                  {sendBetaLaunch.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  {sendBetaLaunch.isPending ? "Sending..." : "Send Beta Launch Email to All Users"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Send Beta Launch Email?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will send the Beta launch email to all{" "}
                    <strong>{betaEligibleCount ?? "…"}</strong> users with an email
                    address. Each user can only receive this email once — users who
                    already received it will be skipped automatically. Continue?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => sendBetaLaunch.mutate()}>
                    Send to All Users
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {betaLaunchResult && !sendBetaLaunch.isPending && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Last run complete</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Of <strong className="text-foreground">{betaLaunchResult.total_profiles}</strong> profiles ·{" "}
                <strong className="text-foreground">{betaLaunchResult.sent}</strong> sent ·{" "}
                {betaLaunchResult.skipped_already_sent} already received ·{" "}
                {betaLaunchResult.skipped_unsubscribed} unsubscribed
                {betaLaunchResult.failed > 0 && (
                  <> · <span className="text-destructive font-medium">{betaLaunchResult.failed} failed</span></>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* FRED API Key Notice */}
      <Card className="border-accent/30 bg-accent/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-accent" />
            FRED API Key Required (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            To enable <strong className="text-foreground">live interest rate data</strong> for Paige (current Prime rate, mortgage rates, Fed Funds rate, etc.), add a free FRED API key as a backend secret named{" "}
            <code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-xs">FRED_API_KEY</code>.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Get a free key at{" "}
            <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noopener noreferrer" className="text-accent underline">
              fred.stlouisfed.org/docs/api/api_key.html
            </a>
            . Without this key Paige will fall back to static rate estimates and rate-aware lender cards will be hidden.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
