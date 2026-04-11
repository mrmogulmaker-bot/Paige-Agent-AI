import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, TrendingUp, DollarSign, UserCheck, UserPlus, Upload } from "lucide-react";
import { AddClientDialog } from "./AddClientDialog";
import { QuickUploadReportModal } from "./QuickUploadReportModal";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";

interface ClientRow {
  user_id: string;
  full_name: string | null;
  city: string | null;
  state: string | null;
  created_at: string | null;
  estimated_fico_eq: number | null;
  estimated_fico_ex: number | null;
  estimated_fico_tu: number | null;
  onboarding_completed: boolean | null;
}

interface ClientWithMeta extends ClientRow {
  roles: string[];
  fundingTotal: number;
  buildScore: number | null;
  fundingReadiness: number | null;
}

interface ClientManagementDashboardProps {
  onViewClient: (clientUserId: string) => void;
}

export function ClientManagementDashboard({ onViewClient }: ClientManagementDashboardProps) {
  const [clients, setClients] = useState<ClientWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [quickUploadOpen, setQuickUploadOpen] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if admin or coach
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles = roleData?.map((r: any) => r.role) || [];
      const isAdmin = roles.includes("admin");
      const isCoach = roles.includes("coach");

      let profilesData: ClientRow[] = [];

      if (isAdmin) {
        // Admin sees all profiles
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, full_name, city, state, created_at, estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, onboarding_completed")
          .order("created_at", { ascending: false });

        if (error) throw error;
        profilesData = (data || []) as ClientRow[];
      } else if (isCoach) {
        // Coach sees own clients
        const { data: coachClients } = await supabase
          .from("coach_clients")
          .select("client_user_id")
          .eq("coach_user_id", user.id)
          .eq("status", "active");

        const clientIds = coachClients?.map((c: any) => c.client_user_id) || [];
        if (clientIds.length > 0) {
          const { data, error } = await supabase
            .from("profiles")
            .select("user_id, full_name, city, state, created_at, estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, onboarding_completed")
            .in("user_id", clientIds);

          if (error) throw error;
          profilesData = (data || []) as ClientRow[];
        }
      }

      // Get user roles for all clients
      const userIds = profilesData.map((p) => p.user_id);
      
      // Fetch build scores, funding readiness, and funding totals in parallel
      const [rolesRes, buildRes, fundingRes, fundingSecuredRes] = await Promise.all([
        userIds.length > 0 ? supabase.from("user_roles").select("user_id, role").in("user_id", userIds) : { data: [] },
        userIds.length > 0 ? supabase.from("build_scores").select("user_id, build_score").in("user_id", userIds) : { data: [] },
        userIds.length > 0 ? supabase.from("funding_readiness_scores").select("user_id, overall_score").in("user_id", userIds) : { data: [] },
        userIds.length > 0 ? supabase.from("funding_secured").select("client_user_id, amount").in("client_user_id", userIds) : { data: [] },
      ]);

      const rolesMap = new Map<string, string[]>();
      (rolesRes.data || []).forEach((r: any) => {
        const existing = rolesMap.get(r.user_id) || [];
        existing.push(r.role);
        rolesMap.set(r.user_id, existing);
      });

      const buildMap = new Map<string, number>();
      (buildRes.data || []).forEach((b: any) => {
        buildMap.set(b.user_id, Number(b.build_score));
      });

      const fundingReadinessMap = new Map<string, number>();
      (fundingRes.data || []).forEach((f: any) => {
        fundingReadinessMap.set(f.user_id, Number(f.overall_score));
      });

      const fundingTotalMap = new Map<string, number>();
      (fundingSecuredRes.data || []).forEach((f: any) => {
        const current = fundingTotalMap.get(f.client_user_id) || 0;
        fundingTotalMap.set(f.client_user_id, current + Number(f.amount));
      });

      const enriched: ClientWithMeta[] = profilesData.map((p) => ({
        ...p,
        roles: rolesMap.get(p.user_id) || ["user"],
        fundingTotal: fundingTotalMap.get(p.user_id) || 0,
        buildScore: buildMap.get(p.user_id) ?? null,
        fundingReadiness: fundingReadinessMap.get(p.user_id) ?? null,
      }));

      setClients(enriched);
    } catch (err) {
      console.error("Error loading clients:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = clients.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.full_name || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q) ||
      (c.state || "").toLowerCase().includes(q)
    );
  });

  // Only show "user" role clients (not admin/coach/moderator) unless search overrides
  const clientsOnly = filtered.filter((c) =>
    c.roles.length === 1 && c.roles[0] === "user" || searchQuery
  );

  const totalFundingSecured = clients.reduce((s, c) => s + c.fundingTotal, 0);
  const avgFICO = (() => {
    const scores = clients
      .map((c) => Math.max(c.estimated_fico_eq || 0, c.estimated_fico_ex || 0, c.estimated_fico_tu || 0))
      .filter((s) => s > 0);
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients.filter((c) => c.roles.includes("user")).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg FICO</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgFICO || "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Funding Secured</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ${totalFundingSecured.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Onboarded</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clients.filter((c) => c.onboarding_completed).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Client Management</CardTitle>
            <CardDescription>View and manage all clients</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => setQuickUploadOpen(true)}>
              <Upload className="w-4 h-4 mr-1" /> Upload Report
            </Button>
            <Button size="sm" onClick={() => setAddClientOpen(true)}>
              <UserPlus className="w-4 h-4 mr-1" /> Add Client
            </Button>
            <AddClientDialog open={addClientOpen} onOpenChange={setAddClientOpen} onClientAdded={fetchClients} />
            <QuickUploadReportModal open={quickUploadOpen} onOpenChange={setQuickUploadOpen} />
          </div>
        </CardHeader>
        <CardContent>
          {clientsOnly.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No clients found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>FICO</TableHead>
                    <TableHead>BUILD Score</TableHead>
                    <TableHead>Funding Readiness</TableHead>
                    <TableHead className="text-right">Funding Secured</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientsOnly.map((c) => {
                    const bestFICO = Math.max(c.estimated_fico_eq || 0, c.estimated_fico_ex || 0, c.estimated_fico_tu || 0);
                    return (
                      <TableRow key={c.user_id}>
                        <TableCell className="font-medium">{c.full_name || "—"}</TableCell>
                        <TableCell>{c.city && c.state ? `${c.city}, ${c.state}` : "—"}</TableCell>
                        <TableCell>
                          {bestFICO > 0 ? (
                            <Badge variant={bestFICO >= 700 ? "default" : bestFICO >= 600 ? "secondary" : "destructive"}>
                              {bestFICO}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{c.buildScore != null ? c.buildScore : "—"}</TableCell>
                        <TableCell>
                          {c.fundingReadiness != null ? (
                            <Badge variant={c.fundingReadiness >= 700 ? "default" : c.fundingReadiness >= 400 ? "secondary" : "destructive"}>
                              {c.fundingReadiness}/1000
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {c.fundingTotal > 0 ? `$${c.fundingTotal.toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.onboarding_completed ? "default" : "outline"}>
                            {c.onboarding_completed ? "Active" : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => onViewClient(c.user_id)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
