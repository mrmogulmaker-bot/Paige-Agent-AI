import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText, CheckCircle, AlertTriangle, Loader2, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ReportRow {
  id: string;
  user_id: string;
  file_name: string;
  report_type: string;
  bureau_detected: string | null;
  analysis_status: string;
  estimated_score_impact: number | null;
  created_at: string;
  client_name?: string;
}

interface AllCreditReportsViewProps {
  onViewClient?: (clientUserId: string) => void;
}

export function AllCreditReportsView({ onViewClient }: AllCreditReportsViewProps) {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles = (roleData || []).map((r: any) => r.role);
      const isAdmin = roles.includes("admin");

      let reportData: any[] = [];

      if (isAdmin) {
        const { data } = await supabase
          .from("credit_report_uploads")
          .select("id, user_id, file_name, report_type, bureau_detected, analysis_status, estimated_score_impact, created_at")
          .order("created_at", { ascending: false });
        reportData = data || [];
      } else {
        // Coach — only assigned clients
        const { data: coachClients } = await supabase
          .from("coach_clients")
          .select("client_user_id")
          .eq("coach_user_id", user.id)
          .eq("status", "active");

        const clientIds = (coachClients || []).map((c: any) => c.client_user_id);
        if (clientIds.length > 0) {
          const { data } = await supabase
            .from("credit_report_uploads")
            .select("id, user_id, file_name, report_type, bureau_detected, analysis_status, estimated_score_impact, created_at")
            .in("user_id", clientIds)
            .order("created_at", { ascending: false });
          reportData = data || [];
        }
      }

      // Fetch client names
      const userIds = [...new Set(reportData.map((r) => r.user_id))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        const nameMap = new Map<string, string>();
        (profiles || []).forEach((p: any) => nameMap.set(p.user_id, p.full_name || "Unknown"));

        reportData = reportData.map((r) => ({
          ...r,
          client_name: nameMap.get(r.user_id) || "Unknown",
        }));
      }

      setReports(reportData);
    } catch (err) {
      console.error("Error fetching reports:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = reports.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.client_name || "").toLowerCase().includes(q) ||
      r.file_name.toLowerCase().includes(q) ||
      (r.bureau_detected || "").toLowerCase().includes(q)
    );
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />Complete</Badge>;
      case "processing":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Analyzing</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertTriangle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-accent" />
            All Credit Reports
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            View all uploaded credit reports across clients
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reports.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Analyzed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">
              {reports.filter((r) => r.analysis_status === "completed").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Consumer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reports.filter((r) => r.report_type === "consumer").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Business</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reports.filter((r) => r.report_type === "business").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reports Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No credit reports found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Bureau</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score Impact</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.client_name || "—"}</TableCell>
                    <TableCell className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm truncate max-w-[200px]">{r.file_name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{r.report_type}</Badge>
                    </TableCell>
                    <TableCell>{r.bureau_detected || "—"}</TableCell>
                    <TableCell>{statusBadge(r.analysis_status)}</TableCell>
                    <TableCell>
                      {r.estimated_score_impact != null ? (
                        <span className="text-red-400 font-mono">{r.estimated_score_impact}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {onViewClient && (
                        <Button size="sm" variant="outline" onClick={() => onViewClient(r.user_id)}>
                          View Client
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
