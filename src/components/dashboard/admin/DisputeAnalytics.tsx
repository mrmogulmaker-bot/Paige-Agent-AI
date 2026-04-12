import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, BarChart3, Clock } from "lucide-react";

// LAYER 2 — Platform Intelligence Engine:
// When this query reaches 100+ records, build an aggregation service
// that feeds outcome statistics into Paige's system prompt as real-time context.

function useDisputeOutcomes() {
  return useQuery({
    queryKey: ["dispute-outcomes-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispute_outcomes" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

const OUTCOME_LABELS: Record<string, string> = {
  deleted: "Deleted",
  updated_to_paid: "Updated to Paid",
  updated_to_settled: "Updated to Settled",
  verified_no_change: "Verified — No Change",
  no_response_35_days: "No Response (35 days)",
  withdrawn: "Withdrawn",
};

export function DisputeAnalytics() {
  const { data: outcomes, isLoading } = useDisputeOutcomes();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const all = outcomes || [];
  const resolved = all.filter(o => o.outcome_type !== "withdrawn");
  const deletions = all.filter(o => o.outcome_type === "deleted");

  // Overall deletion rate
  const deletionRate = resolved.length > 0 ? (deletions.length / resolved.length * 100).toFixed(1) : "0";

  // By bureau
  const bureaus = [...new Set(all.map(o => o.bureau))];
  const byBureau = bureaus.map(bureau => {
    const bResolved = resolved.filter(o => o.bureau === bureau);
    const bDeleted = deletions.filter(o => o.bureau === bureau);
    const avgResponseTime = bResolved.filter(o => o.response_time_days != null);
    return {
      bureau,
      total: bResolved.length,
      deleted: bDeleted.length,
      rate: bResolved.length > 0 ? (bDeleted.length / bResolved.length * 100).toFixed(1) : "0",
      avgDays: avgResponseTime.length > 0
        ? Math.round(avgResponseTime.reduce((s, o) => s + o.response_time_days, 0) / avgResponseTime.length)
        : null,
    };
  });

  // By creditor type (simple heuristic based on name patterns)
  function categorizeCreditor(name: string): string {
    const lower = (name || "").toLowerCase();
    if (lower.includes("collection") || lower.includes("recovery") || lower.includes("portfolio")) return "Collection Agency";
    if (lower.includes("credit union") || lower.includes("cu ")) return "Credit Union";
    if (lower.includes("auto") || lower.includes("motor") || lower.includes("car")) return "Auto Lender";
    return "Original Creditor / Bank";
  }

  const creditorTypes = [...new Set(all.map(o => categorizeCreditor(o.creditor_name)))];
  const byCreditorType = creditorTypes.map(type => {
    const cResolved = resolved.filter(o => categorizeCreditor(o.creditor_name) === type);
    const cDeleted = deletions.filter(o => categorizeCreditor(o.creditor_name) === type);
    return {
      type,
      total: cResolved.length,
      deleted: cDeleted.length,
      rate: cResolved.length > 0 ? (cDeleted.length / cResolved.length * 100).toFixed(1) : "0",
    };
  });

  // Most effective round
  const rounds = [...new Set(all.filter(o => o.dispute_round).map(o => o.dispute_round))].sort();
  const byRound = rounds.map(round => {
    const rResolved = resolved.filter(o => o.dispute_round === round);
    const rDeleted = deletions.filter(o => o.dispute_round === round);
    return {
      round,
      total: rResolved.length,
      deleted: rDeleted.length,
      rate: rResolved.length > 0 ? (rDeleted.length / rResolved.length * 100).toFixed(1) : "0",
    };
  });

  if (all.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No dispute outcomes recorded yet. Outcomes will appear here as disputes are resolved.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Overall Deletion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{deletionRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">{deletions.length} deleted of {resolved.length} resolved</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Outcomes</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{all.length}</div>
            <p className="text-xs text-muted-foreground mt-1">across {bureaus.length} bureau{bureaus.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {(() => {
              const withDays = resolved.filter(o => o.response_time_days != null);
              const avg = withDays.length > 0
                ? Math.round(withDays.reduce((s, o) => s + o.response_time_days, 0) / withDays.length)
                : null;
              return (
                <>
                  <div className="text-3xl font-bold">{avg != null ? `${avg} days` : "—"}</div>
                  <p className="text-xs text-muted-foreground mt-1">{withDays.length} responses tracked</p>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* By Bureau */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deletion Rate by Bureau</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bureau</TableHead>
                <TableHead className="text-right">Resolved</TableHead>
                <TableHead className="text-right">Deleted</TableHead>
                <TableHead className="text-right">Deletion Rate</TableHead>
                <TableHead className="text-right">Avg Response (days)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byBureau.map(b => (
                <TableRow key={b.bureau}>
                  <TableCell className="font-medium">{b.bureau}</TableCell>
                  <TableCell className="text-right">{b.total}</TableCell>
                  <TableCell className="text-right">{b.deleted}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={parseFloat(b.rate) >= 50 ? "default" : "secondary"}>{b.rate}%</Badge>
                  </TableCell>
                  <TableCell className="text-right">{b.avgDays != null ? b.avgDays : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* By Creditor Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deletion Rate by Creditor Type</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creditor Type</TableHead>
                <TableHead className="text-right">Resolved</TableHead>
                <TableHead className="text-right">Deleted</TableHead>
                <TableHead className="text-right">Deletion Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byCreditorType.map(c => (
                <TableRow key={c.type}>
                  <TableCell className="font-medium">{c.type}</TableCell>
                  <TableCell className="text-right">{c.total}</TableCell>
                  <TableCell className="text-right">{c.deleted}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={parseFloat(c.rate) >= 50 ? "default" : "secondary"}>{c.rate}%</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* By Round */}
      {byRound.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Effectiveness by Dispute Round</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Round</TableHead>
                  <TableHead className="text-right">Resolved</TableHead>
                  <TableHead className="text-right">Deleted</TableHead>
                  <TableHead className="text-right">Deletion Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byRound.map(r => (
                  <TableRow key={r.round}>
                    <TableCell className="font-medium">Round {r.round}</TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell className="text-right">{r.deleted}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={parseFloat(r.rate) >= 50 ? "default" : "secondary"}>{r.rate}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
