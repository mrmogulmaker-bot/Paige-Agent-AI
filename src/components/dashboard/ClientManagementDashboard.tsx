import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users, Search, TrendingUp, UserCheck, UserPlus, Upload, Building2, MoreHorizontal, Trash2, UserCog, ArrowRightLeft, Mail, Send } from "lucide-react";
import { AddClientDialog } from "./AddClientDialog";
import { AddInternalClientDialog } from "./AddInternalClientDialog";
import { QuickUploadReportModal } from "./QuickUploadReportModal";
import { toast } from "sonner";

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

interface AuthClient {
  user_id: string;
  full_name: string | null;
  email?: string | null;
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
  const [activeView, setActiveView] = useState<"internal" | "auth" | "team">("internal");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ type: "internal" | "auth"; id: string; name: string } | null>(null);

  useEffect(() => {
    fetchAllClients();
  }, []);

  const fetchAllClients = async () => {
    setLoading(true);
    try {
      const { data: intClients } = await supabase
        .from("clients" as any)
        .select("*")
        .order("created_at", { ascending: false });

      setInternalClients((intClients as any[] || []) as InternalClient[]);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles = roleData?.map((r: any) => r.role) || [];
      const isAdmin = roles.includes("admin");

      if (isAdmin) {
        const [profilesRes, allRolesRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("user_id, full_name, city, state, created_at, estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, onboarding_completed")
            .order("created_at", { ascending: false }),
          supabase
            .from("user_roles")
            .select("user_id, role"),
        ]);

        const allRoles = allRolesRes.data || [];
        const enriched = (profilesRes.data || []).map((p: any) => ({
          ...p,
          roles: allRoles.filter((r: any) => r.user_id === p.user_id).map((r: any) => r.role),
        }));
        setAuthClients(enriched as AuthClient[]);
      }
    } catch (err) {
      console.error("Error loading clients:", err);
    } finally {
      setLoading(false);
    }
  };

  // Separate auth users into clients vs team/staff
  const clientUsers = authClients.filter((c) => {
    const r = c.roles || [];
    return r.length === 0 || (r.length === 1 && r[0] === "user");
  });
  const teamUsers = authClients.filter((c) => {
    const r = c.roles || [];
    return r.some((role) => ["admin", "coach", "moderator"].includes(role));
  });

  const filteredInternal = internalClients.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.entity_name || "").toLowerCase().includes(q)
    );
  });

  const filterAuth = (list: AuthClient[]) =>
    list.filter((c) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (c.full_name || "").toLowerCase().includes(q);
    });

  const activeCount = internalClients.filter((c) => c.status === "active").length;
  const withEntity = internalClients.filter((c) => c.entity_name).length;

  // --- Actions ---

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert([{ user_id: userId, role: newRole as any }]);
      if (error) throw error;
      toast.success("Role updated successfully");
      fetchAllClients();
    } catch (err: any) {
      console.error("Error updating role:", err);
      toast.error("Failed to update role");
    }
  };

  const updateInternalStatus = async (clientId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("clients" as any)
        .update({ status: newStatus } as any)
        .eq("id", clientId);
      if (error) throw error;
      toast.success(`Status updated to ${newStatus}`);
      fetchAllClients();
    } catch (err: any) {
      console.error("Error updating status:", err);
      toast.error("Failed to update status");
    }
  };

  const deleteInternalClient = async (clientId: string) => {
    try {
      const { error } = await supabase
        .from("clients" as any)
        .delete()
        .eq("id", clientId);
      if (error) throw error;
      toast.success("Client deleted");
      fetchAllClients();
    } catch (err: any) {
      console.error("Error deleting client:", err);
      toast.error("Failed to delete client");
    }
  };

  const deleteAuthUser = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke("admin-delete-user", {
        body: { user_id: userId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      toast.success("User deleted");
      fetchAllClients();
    } catch (err: any) {
      console.error("Error deleting user:", err);
      toast.error(err.message || "Failed to delete user");
    }
  };

  const moveToInternal = async (client: AuthClient) => {
    try {
      const nameParts = (client.full_name || "Unknown").split(" ");
      const firstName = nameParts[0] || "Unknown";
      const lastName = nameParts.slice(1).join(" ") || "";

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("clients" as any).insert({
        first_name: firstName,
        last_name: lastName,
        email: null,
        linked_user_id: client.user_id,
        status: "active",
        city: client.city,
        state: client.state,
        created_by: user.id,
      } as any);

      if (error) throw error;
      toast.success(`${client.full_name} moved to Internal Clients`);
      fetchAllClients();
    } catch (err: any) {
      console.error("Error moving to internal:", err);
      toast.error(err.message || "Failed to move client");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "internal") {
      await deleteInternalClient(deleteTarget.id);
    } else {
      await deleteAuthUser(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  // --- Render helpers ---

  const renderAuthTable = (list: AuthClient[], showPromoteToInternal: boolean) => {
    const filtered = filterAuth(list);
    if (filtered.length === 0) {
      return <p className="text-center text-muted-foreground py-8">No users found.</p>;
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>FICO</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const bestFICO = Math.max(c.estimated_fico_eq || 0, c.estimated_fico_ex || 0, c.estimated_fico_tu || 0);
              const primaryRole = c.roles?.[0] || "user";
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
                    <Select
                      defaultValue={primaryRole}
                      onValueChange={(value) => updateUserRole(c.user_id, value)}
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="coach">Coach</SelectItem>
                        <SelectItem value="moderator">Moderator</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="affiliate">Affiliate</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.onboarding_completed ? "default" : "outline"}>
                      {c.onboarding_completed ? "Active" : "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onViewClient(c.user_id)}>
                        View
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {showPromoteToInternal && (
                            <DropdownMenuItem onClick={() => moveToInternal(c)}>
                              <ArrowRightLeft className="w-4 h-4 mr-2" /> Move to Internal
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget({ type: "auth", id: c.user_id, name: c.full_name || "this user" })}
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
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
            <CardTitle className="text-sm font-medium">Clients</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientUsers.length}</div>
            <p className="text-xs text-muted-foreground">Registered users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <UserCog className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamUsers.length}</div>
            <p className="text-xs text-muted-foreground">Admin / Coach / Mod</p>
          </CardContent>
        </Card>
      </div>

      {/* Client List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Client Management</CardTitle>
            <CardDescription>Manage clients, team members, and internal records</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
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
              <TabsTrigger value="auth">Clients ({clientUsers.length})</TabsTrigger>
              <TabsTrigger value="team">Team / Admin ({teamUsers.length})</TabsTrigger>
            </TabsList>

            {/* Internal Clients Tab */}
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
                        <TableHead className="text-right">Actions</TableHead>
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
                            <Select
                              defaultValue={c.status}
                              onValueChange={(value) => updateInternalStatus(c.id, value)}
                            >
                              <SelectTrigger className="w-[110px] h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                                <SelectItem value="archived">Archived</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.linked_user_id ? "default" : "outline"} className="text-xs">
                              {c.linked_user_id ? "Linked" : "—"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onViewInternalClient?.(c.id)}>
                                View
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTarget({ type: "internal", id: c.id, name: `${c.first_name} ${c.last_name}` })}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" /> Delete Client
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Clients (regular users) Tab */}
            <TabsContent value="auth">
              {renderAuthTable(clientUsers, true)}
            </TabsContent>

            {/* Team / Admin Tab */}
            <TabsContent value="team">
              {renderAuthTable(teamUsers, false)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogs */}
      <AddInternalClientDialog open={addInternalOpen} onOpenChange={setAddInternalOpen} onClientAdded={fetchAllClients} />
      <AddClientDialog open={addLegacyOpen} onOpenChange={setAddLegacyOpen} onClientAdded={fetchAllClients} />
      <QuickUploadReportModal open={quickUploadOpen} onOpenChange={setQuickUploadOpen} />
    </div>
  );
}
