import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Search, TrendingUp, DollarSign, UserCheck, UserPlus, Upload, Building2, Shield } from "lucide-react";
import { AddClientDialog } from "./AddClientDialog";
import { AddInternalClientDialog } from "./AddInternalClientDialog";
import { QuickUploadReportModal } from "./QuickUploadReportModal";
import { toast } from "sonner";

// Internal client from the new clients table
interface InternalClient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
  entity_type: string | null;
  funding_goal: number | null;
  monthly_revenue: number | null;
  status: string;
  linked_user_id: string | null;
  created_at: string;
}

// Auth-based client from profiles (legacy)
interface AuthClient {
  user_id: string;
  full_name: string | null;
  city: string | null;
  state: string | null;
  created_at: string | null;
  estimated_fico_eq: number | null;
  estimated_fico_ex: number | null;
  estimated_fico_tu: number | null;
  onboarding_completed: boolean | null;
  roles: string[];
}

interface ClientManagementDashboardProps {
  onViewClient: (clientUserId: string) => void;
  onViewInternalClient?: (clientId: string) => void;
}

export function ClientManagementDashboard({ onViewClient, onViewInternalClient }: ClientManagementDashboardProps) {
  const [internalClients, setInternalClients] = useState<InternalClient[]>([]);
  const [authClients, setAuthClients] = useState<AuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addInternalOpen, setAddInternalOpen] = useState(false);
  const [addLegacyOpen, setAddLegacyOpen] = useState(false);
  const [quickUploadOpen, setQuickUploadOpen] = useState(false);
  const [activeView, setActiveView] = useState<"internal" | "auth">("internal");

  useEffect(() => {
    fetchAllClients();
  }, []);

  const fetchAllClients = async () => {
    setLoading(true);
    try {
      // Fetch internal clients from clients table
      const { data: intClients } = await supabase
        .from("clients" as any)
        .select("*")
        .order("created_at", { ascending: false });

      setInternalClients((intClients as any[] || []) as InternalClient[]);

      // Fetch auth-based clients (legacy) from profiles
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles = roleData?.map((r: any) => r.role) || [];
      const isAdmin = roles.includes("admin");

      if (isAdmin) {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, full_name, city, state, created_at, estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, onboarding_completed")
          .order("created_at", { ascending: false });
        setAuthClients((data || []) as AuthClient[]);
      }
    } catch (err) {
      console.error("Error loading clients:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredInternal = internalClients.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.entity_name || "").toLowerCase().includes(q)
    );
  });

  const filteredAuth = authClients.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (c.full_name || "").toLowerCase().includes(q);
  });

  const activeCount = internalClients.filter((c) => c.status === "active").length;
  const withEntity = internalClients.filter((c) => c.entity_name).length;

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
            <CardTitle className="text-sm font-medium">Internal Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{internalClients.length}</div>
            <p className="text-xs text-muted-foreground">{activeCount} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">With Entities</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{withEntity}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Portal Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {internalClients.filter((c) => c.linked_user_id).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Auth Users</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{authClients.length}</div>
            <p className="text-xs text-muted-foreground">Legacy accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* Client List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Client Management</CardTitle>
            <CardDescription>Manage internal client records and legacy auth accounts</CardDescription>
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
            <Button size="sm" onClick={() => setAddInternalOpen(true)}>
              <UserPlus className="w-4 h-4 mr-1" /> New Client
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="internal">Internal Clients ({internalClients.length})</TabsTrigger>
              <TabsTrigger value="auth">Auth Users ({authClients.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="internal">
              {filteredInternal.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground mb-4">
                    {searchQuery ? "No clients match your search" : "No internal clients yet"}
                  </p>
                  {!searchQuery && (
                    <Button onClick={() => setAddInternalOpen(true)}>
                      <UserPlus className="w-4 h-4 mr-1" /> Create First Client
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>Funding Goal</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Portal</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInternal.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                          <TableCell className="text-sm">{c.email || "—"}</TableCell>
                          <TableCell className="text-sm">{c.entity_name || "—"}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {c.funding_goal ? `$${Number(c.funding_goal).toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {c.monthly_revenue ? `$${Number(c.monthly_revenue).toLocaleString()}/mo` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.status === "active" ? "default" : "secondary"}>
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.linked_user_id ? "default" : "outline"} className="text-xs">
                              {c.linked_user_id ? "Linked" : "—"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onViewInternalClient?.(c.id)}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="auth">
              {filteredAuth.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No auth users found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>FICO</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAuth.map((c) => {
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddInternalClientDialog open={addInternalOpen} onOpenChange={setAddInternalOpen} onClientAdded={fetchAllClients} />
      <AddClientDialog open={addLegacyOpen} onOpenChange={setAddLegacyOpen} onClientAdded={fetchAllClients} />
      <QuickUploadReportModal open={quickUploadOpen} onOpenChange={setQuickUploadOpen} />
    </div>
  );
}
