import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Target, BarChart3 } from "lucide-react";

function useFundingOutcomes() {
  return useQuery({
    queryKey: ["funding-outcomes-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funding_application_outcomes" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

export function FundingMatchAccuracy() {
  const { data: outcomes, isLoading } = useFundingOutcomes();

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const all = outcomes || [];
  if (all.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No funding application outcomes logged yet. Data will appear as applications are tracked.</p>
        </CardContent>
      </Card>
    );
  }

  // Exclude pending/withdrawn for accuracy calculation
  const decided = all.filter(o => ["approved", "approved_lower_amount", "declined", "counter_offered"].includes(o.outcome));
  const approved = decided.filter(o => o.outcome === "approved" || o.outcome === "approved_lower_amount");

  // Precision: When score > 70, what % approved?
  const highScore = decided.filter(o => o.predicted_match_score != null && o.predicted_match_score >= 70);
  const highScoreApproved = highScore.filter(o => o.outcome === "approved" || o.outcome === "approved_lower_amount");
  const precisionRate = highScore.length > 0 ? (highScoreApproved.length / highScore.length * 100).toFixed(1) : null;

  // By product type
  const productTypes = [...new Set(all.map(o => o.product_type))];
  const byProduct = productTypes.map(pt => {
    const ptDecided = decided.filter(o => o.product_type === pt);
    const ptApproved = ptDecided.filter(o => o.outcome === "approved" || o.outcome === "approved_lower_amount");
    const ptWithScore = ptDecided.filter(o => o.predicted_match_score != null);
    const avgScoreApproved = ptApproved.filter(o => o.predicted_match_score != null);
    const avgScoreDeclined = ptDecided.filter(o => o.outcome === "declined" && o.predicted_match_score != null);

    return {
      productType: pt,
      total: ptDecided.length,
      approvalRate: ptDecided.length > 0 ? (ptApproved.length / ptDecided.length * 100).toFixed(1) : "0",
      avgScoreApproved: avgScoreApproved.length > 0
        ? Math.round(avgScoreApproved.reduce((s: number, o: any) => s + o.predicted_match_score, 0) / avgScoreApproved.length)
        : null,
      avgScoreDeclined: avgScoreDeclined.length > 0
        ? Math.round(avgScoreDeclined.reduce((s: number, o: any) => s + o.predicted_match_score, 0) / avgScoreDeclined.length)
        : null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Overall Approval Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {decided.length > 0 ? (approved.length / decided.length * 100).toFixed(1) : "0"}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">{approved.length} approved of {decided.length} decided</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Platform Precision Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{precisionRate != null ? `${precisionRate}%` : "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              When match score ≥70, approval rate
              {highScore.length > 0 ? ` (${highScoreApproved.length}/${highScore.length})` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{all.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{all.filter(o => o.outcome === "pending").length} pending</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Accuracy by Product Category</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Type</TableHead>
                <TableHead className="text-right">Applications</TableHead>
                <TableHead className="text-right">Approval Rate</TableHead>
                <TableHead className="text-right">Avg Score (Approved)</TableHead>
                <TableHead className="text-right">Avg Score (Declined)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byProduct.map(p => (
                <TableRow key={p.productType}>
                  <TableCell className="font-medium">{p.productType}</TableCell>
                  <TableCell className="text-right">{p.total}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={parseFloat(p.approvalRate) >= 50 ? "default" : "secondary"}>{p.approvalRate}%</Badge>
                  </TableCell>
                  <TableCell className="text-right">{p.avgScoreApproved ?? "—"}</TableCell>
                  <TableCell className="text-right">{p.avgScoreDeclined ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
