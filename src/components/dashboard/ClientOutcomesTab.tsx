import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Download, CheckCircle2, XCircle, DollarSign, AlertTriangle, TrendingUp, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const OUTCOME_LABELS: Record<string, string> = {
  deleted: "Deleted",
  updated_to_paid: "Updated to Paid",
  updated_to_settled: "Updated to Settled",
  verified_no_change: "Verified — No Change",
  no_response_35_days: "No Response (35 days)",
  withdrawn: "Withdrawn",
};

const FUNDING_OUTCOME_LABELS: Record<string, string> = {
  approved: "Approved",
  approved_lower_amount: "Approved (Lower Amount)",
  declined: "Declined",
  counter_offered: "Counter-Offered",
  withdrawn: "Withdrawn",
  pending: "Pending",
};

interface ClientOutcomesTabProps {
  clientId: string;
  clientName: string;
}

export function ClientOutcomesTab({ clientId, clientName }: ClientOutcomesTabProps) {
  const [exporting, setExporting] = useState(false);

  const { data: disputeOutcomes, isLoading: loadingDisputes } = useQuery({
    queryKey: ["dispute-outcomes", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispute_outcomes" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: fundingOutcomes, isLoading: loadingFunding } = useQuery({
    queryKey: ["funding-outcomes", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funding_application_outcomes" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("application_date", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const isLoading = loadingDisputes || loadingFunding;
  const disputes = disputeOutcomes || [];
  const funding = fundingOutcomes || [];

  // Build timeline
  const timeline = [
    ...disputes.map((d: any) => ({
      type: "dispute" as const,
      date: d.response_date || d.created_at,
      data: d,
    })),
    ...funding.map((f: any) => ({
      type: "funding" as const,
      date: f.application_date || f.created_at,
      data: f,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const exportPDF = async () => {
    setExporting(true);
    try {
      // Generate a text-based summary for download
      let content = `CLIENT OUTCOMES SUMMARY\n`;
      content += `${"=".repeat(50)}\n\n`;
      content += `Client: ${clientName}\n`;
      content += `Generated: ${format(new Date(), "MMMM d, yyyy")}\n\n`;

      // Dispute summary
      const deletions = disputes.filter((d: any) => d.outcome_type === "deleted");
      content += `DISPUTE OUTCOMES\n${"-".repeat(30)}\n`;
      content += `Total Resolved: ${disputes.length}\n`;
      content += `Items Deleted: ${deletions.length}\n`;
      content += `Deletion Rate: ${disputes.length > 0 ? (deletions.length / disputes.length * 100).toFixed(1) : 0}%\n`;
      const scoreImpacts = disputes.filter((d: any) => d.score_impact != null);
      if (scoreImpacts.length > 0) {
        const totalImpact = scoreImpacts.reduce((s: number, d: any) => s + d.score_impact, 0);
        content += `Net Score Impact: ${totalImpact > 0 ? "+" : ""}${totalImpact} points\n`;
      }
      content += `\n`;

      disputes.forEach((d: any) => {
        content += `  • ${d.creditor_name} (${d.bureau}) — ${OUTCOME_LABELS[d.outcome_type] || d.outcome_type}`;
        if (d.score_impact) content += ` [${d.score_impact > 0 ? "+" : ""}${d.score_impact} pts]`;
        if (d.response_date) content += ` — ${format(new Date(d.response_date), "MMM d, yyyy")}`;
        content += `\n`;
      });

      // Funding summary
      content += `\nFUNDING APPLICATION OUTCOMES\n${"-".repeat(30)}\n`;
      content += `Total Applications: ${funding.length}\n`;
      const approvals = funding.filter((f: any) => f.outcome === "approved" || f.outcome === "approved_lower_amount");
      content += `Approvals: ${approvals.length}\n`;
      const totalApproved = approvals.reduce((s: number, f: any) => s + Number(f.approved_amount || f.amount_requested || 0), 0);
      content += `Total Approved: $${totalApproved.toLocaleString()}\n\n`;

      funding.forEach((f: any) => {
        content += `  • ${f.lender_name} — ${f.product_type} — $${Number(f.amount_requested).toLocaleString()} — ${FUNDING_OUTCOME_LABELS[f.outcome] || f.outcome}`;
        if (f.approved_amount) content += ` ($${Number(f.approved_amount).toLocaleString()} approved)`;
        content += `\n`;
      });

      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${clientName.replace(/\s+/g, "-")}-outcomes-summary.txt`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Outcomes summary exported");
    } catch (err) {
      toast.error("Failed to export");
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (timeline.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No outcomes recorded yet. Dispute resolutions and funding applications will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  // Stats
  const deletions = disputes.filter((d: any) => d.outcome_type === "deleted").length;
  const approvals = funding.filter((f: any) => f.outcome === "approved" || f.outcome === "approved_lower_amount");
  const totalApproved = approvals.reduce((s: number, f: any) => s + Number(f.approved_amount || f.amount_requested || 0), 0);
  const scoreImpacts = disputes.filter((d: any) => d.score_impact != null);
  const netScoreImpact = scoreImpacts.reduce((s: number, d: any) => s + d.score_impact, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Client Outcomes</h3>
        <Button variant="outline" size="sm" onClick={exportPDF} disabled={exporting}>
          {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
          Export Summary
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Items Deleted</p>
            <p className="text-2xl font-bold text-primary">{deletions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Net Score Impact</p>
            <p className="text-2xl font-bold">{scoreImpacts.length > 0 ? `${netScoreImpact > 0 ? "+" : ""}${netScoreImpact}` : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Funding Approvals</p>
            <p className="text-2xl font-bold">{approvals.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Approved</p>
            <p className="text-2xl font-bold text-primary">${totalApproved.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Outcomes Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {timeline.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0">
                <div className={`mt-1 p-1.5 rounded-full shrink-0 ${
                  item.type === "dispute"
                    ? item.data.outcome_type === "deleted" ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
                    : item.data.outcome === "approved" || item.data.outcome === "approved_lower_amount"
                    ? "bg-green-100 dark:bg-green-900/30"
                    : item.data.outcome === "declined" ? "bg-red-100 dark:bg-red-900/30" : "bg-muted"
                }`}>
                  {item.type === "dispute" ? (
                    item.data.outcome_type === "deleted"
                      ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      : <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    item.data.outcome === "approved" || item.data.outcome === "approved_lower_amount"
                      ? <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                      : item.data.outcome === "declined"
                      ? <XCircle className="w-4 h-4 text-red-500" />
                      : <FileText className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {item.type === "dispute" ? item.data.creditor_name : item.data.lender_name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {item.type === "dispute" ? "Dispute" : "Funding Application"}
                    </Badge>
                    {item.type === "dispute" && (
                      <Badge variant={item.data.outcome_type === "deleted" ? "default" : "secondary"} className="text-xs">
                        {OUTCOME_LABELS[item.data.outcome_type] || item.data.outcome_type}
                      </Badge>
                    )}
                    {item.type === "funding" && (
                      <Badge
                        variant={
                          item.data.outcome === "approved" || item.data.outcome === "approved_lower_amount"
                            ? "default"
                            : item.data.outcome === "declined" ? "destructive" : "secondary"
                        }
                        className="text-xs"
                      >
                        {FUNDING_OUTCOME_LABELS[item.data.outcome] || item.data.outcome}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>{format(new Date(item.date), "MMM d, yyyy")}</span>
                    {item.type === "dispute" && item.data.bureau && <span>{item.data.bureau}</span>}
                    {item.type === "dispute" && item.data.score_impact != null && (
                      <span className={item.data.score_impact > 0 ? "text-green-600" : "text-red-500"}>
                        {item.data.score_impact > 0 ? "+" : ""}{item.data.score_impact} pts
                      </span>
                    )}
                    {item.type === "funding" && (
                      <span>${Number(item.data.amount_requested).toLocaleString()} requested</span>
                    )}
                    {item.type === "funding" && item.data.approved_amount && (
                      <span className="text-green-600">${Number(item.data.approved_amount).toLocaleString()} approved</span>
                    )}
                  </div>
                  {item.data.admin_notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{item.data.admin_notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
