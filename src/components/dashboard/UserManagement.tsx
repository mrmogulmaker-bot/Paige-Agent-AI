import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserPlus, Shield, Users as UsersIcon, Trash2, X, Pencil } from "lucide-react";
import { MemberProfileDrawer, type MemberProfile } from "@/components/admin/MemberProfileDrawer";

// Assignable staff roles surfaced in the Members & Roles UI. Keep this in
// sync with STAFF_ROLES below; "owner" / "super_admin" are protected and
// only granted through DB bootstrap, never through this dropdown.
const ASSIGNABLE_ROLES = [
  "admin",
  "coach",
  "moderator",
  "sales_rep",
  "broker",
  "affiliate",
  "cs_rep",
  "finance",
  "viewer",
] as const;
type AssignableRole = typeof ASSIGNABLE_ROLES[number];

// A "staff role" grants platform/workspace authority. Anything else (bare
// "user", or no role at all) is a client/lead and belongs in Contacts — NOT
// in Team & Roles. Keep this list in sync with src/pages/admin/MembersAdmin.tsx.
const STAFF_ROLES = new Set<string>([
  "admin", "coach", "sales_rep", "broker", "broker_team_member", "affiliate",
  "cs_rep", "finance", "viewer", "moderator", "owner", "super_admin",
]);
const isStaffUser = (roles: string[]) => roles.some((r) => STAFF_ROLES.has(r));

interface User {
  id: string;
  email: string;
  full_name: string | null;
  roles: string[];
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AssignableRole>("coach");
  const [sending, setSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [profileTarget, setProfileTarget] = useState<MemberProfile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const openProfile = (u: User) => {
    setProfileTarget({
      user_id: u.id,
      email: u.email,
      full_name: u.full_name,
      created_at: u.created_at,
      last_sign_in_at: null,
      suspended_at: null,
      suspended_reason: null,
      roles: u.roles.filter((r) => r !== "user"),
      is_owner: u.roles.includes("owner") || u.roles.includes("super_admin"),
    });
    setProfileOpen(true);
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { user_id: deleteTarget.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Deleted ${deleteTarget.email || "user"}`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: any) {
      toast.error("Failed to delete user", { description: err?.message });
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      await Promise.all([fetchUsers(), fetchInvitations()]);
    } catch (err: any) {
      console.error("Failed to load users", err);
      toast.error("Failed to load users", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, full_name, created_at");

    if (profilesError) throw profilesError;

    // auth.admin.* cannot be called from the browser; use the secure
    // admin-list-users edge function instead.
    const { data: listData, error: listErr } = await supabase.functions.invoke(
      "admin-list-users",
    );
    if (listErr) throw listErr;
    const authUsers = (listData?.users ?? []) as Array<{
      id: string;
      email: string | null;
      created_at: string;
    }>;

    const { data: rolesData, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (rolesError) throw rolesError;

    const usersWithRoles = authUsers.map((user) => {
      const profile = profilesData?.find((p) => p.user_id === user.id);
      const userRoles = rolesData?.filter((r) => r.user_id === user.id).map((r) => r.role) || [];

      return {
        id: user.id,
        email: user.email || "",
        full_name: profile?.full_name || null,
        roles: userRoles.length > 0 ? userRoles : ["user"],
        created_at: user.created_at,
      };
    })
    // Staff-only view. Clients/leads (bare "user" role or no role) live in Contacts.
    .filter((u) => isStaffUser(u.roles));

    setUsers(usersWithRoles);
  };

  const fetchInvitations = async () => {
    const { data, error } = await supabase
      .from("invitations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setInvitations(data || []);
  };

  const sendInvitation = async () => {
    if (!inviteEmail || !inviteRole) {
      toast.error("Please fill in all fields");
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke("send-admin-invitation", {
        body: { email: inviteEmail, role: inviteRole },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;

      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("coach");
      fetchInvitations();
    } catch (error: any) {
      console.error("Error sending invitation:", error);
      toast.error(error.message || "Failed to send invitation");
    } finally {
      setSending(false);
    }
  };

  // Additive: grant an additional role without wiping existing ones. This is
  // what lets the Mr. Mogul Maker account hold admin + coach simultaneously.
  const addUserRole = async (userId: string, newRole: AssignableRole) => {
    try {
      const currentRoles = users.find((u) => u.id === userId)?.roles || [];
      if (currentRoles.includes(newRole)) {
        toast.info(`Already has ${newRole}`);
        return;
      }
      const { error } = await supabase
        .from("user_roles")
        .insert([{ user_id: userId, role: newRole as any }]);
      if (error) throw error;
      toast.success(`Granted ${newRole}`);
      fetchUsers();
    } catch (error: any) {
      console.error("Error granting role:", error);
      toast.error("Failed to grant role", { description: error?.message });
    }
  };

  const removeUserRole = async (userId: string, role: string) => {
    if (role === "owner" || role === "super_admin") {
      toast.error(`${role} is protected and cannot be removed from this screen`);
      return;
    }
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role as any);
      if (error) throw error;
      toast.success(`Removed ${role}`);
      fetchUsers();
    } catch (error: any) {
      console.error("Error removing role:", error);
      toast.error("Failed to remove role", { description: error?.message });
    }
  };

  const deleteInvitation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("invitations")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Invitation deleted");
      fetchInvitations();
    } catch (error: any) {
      console.error("Error deleting invitation:", error);
      toast.error("Failed to delete invitation");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>Manage user accounts and roles</CardDescription>
          </div>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite User</DialogTitle>
                <DialogDescription>
                  Send an invitation email to add a new team member
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={(value: AssignableRole) => setInviteRole(value)}>
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={sendInvitation} disabled={sending} className="w-full">
                  {sending ? "Sending..." : "Send Invitation"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const protectedRole = (r: string) => r === "owner" || r === "super_admin";
                return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.full_name || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {user.roles.map((role) => (
                        <Badge
                          key={role}
                          variant={role === "admin" || role === "owner" || role === "super_admin" ? "default" : "secondary"}
                          className="flex items-center gap-1"
                        >
                          {role}
                          {!protectedRole(role) && role !== "user" && (
                            <button
                              onClick={() => removeUserRole(user.id, role)}
                              className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
                              title={`Remove ${role}`}
                              aria-label={`Remove ${role}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value=""
                        onValueChange={(value: AssignableRole) => addUserRole(user.id, value)}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue placeholder="+ Add role" />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.filter((r) => !user.roles.includes(r)).map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openProfile(user)}
                        title="Edit profile"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(user)}
                        title="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
          <CardDescription>Active invitation links that haven't been accepted yet</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No pending invitations</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{invite.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {invite.accepted_at ? (
                        <Badge variant="default">Accepted</Badge>
                      ) : new Date(invite.expires_at) < new Date() ? (
                        <Badge variant="destructive">Expired</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>{new Date(invite.expires_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {!invite.accepted_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteInvitation(invite.id)}
                        >
                          <Trash2 className="w-4 h-4" />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.email || deleteTarget?.full_name || "this user"}
              </span>{" "}
              and all of their associated data — credit reports, disputes, chat history, subscriptions, and profile.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteUser();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
