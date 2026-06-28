import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MoreHorizontal, UserPlus, Mail, ShieldOff, ShieldCheck, LogOut, Trash2, UserCog, Crown } from "lucide-react";
import { toast } from "sonner";
import { InviteMemberDialog } from "@/components/admin/InviteMemberDialog";
import { ReassignCoachDialog } from "@/components/admin/ReassignCoachDialog";

const ROLE_FILTERS = ["all", "owner", "admin", "coach", "sales_rep", "broker", "cs_rep", "finance", "client", "viewer"] as const;
type RoleFilter = typeof ROLE_FILTERS[number];

const ASSIGNABLE_ROLES = ["admin", "coach", "sales_rep", "broker", "cs_rep", "finance", "viewer", "client"];

const roleColor: Record<string, string> = {
  owner: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  admin: "bg-red-500/15 text-red-700 dark:text-red-300",
  coach: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  sales_rep: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  broker: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  cs_rep: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  finance: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  client: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  viewer: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
};

interface MemberRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  roles: string[];
  is_owner: boolean;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
}

export default function MembersAdmin() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [inviteOpen, setInviteOpen] = useState(false);

  // Suspend dialog
  const [suspendTarget, setSuspendTarget] = useState<MemberRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  // Add role dialog
  const [addRoleTarget, setAddRoleTarget] = useState<MemberRow | null>(null);
  const [newRole, setNewRole] = useState("coach");

  // Reassign dialog (when removing a coach)
  const [reassignCoachId, setReassignCoachId] = useState<string | null>(null);
  const [reassignLabel, setReassignLabel] = useState<string | undefined>();

  // Confirm remove user
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      // Pull users via the existing admin edge function
      const usersRes = await supabase.functions.invoke("admin-list-users", { body: {} });
      if (usersRes.error) throw usersRes.error;
      const users: any[] = usersRes.data?.users || [];

      const userIds = users.map(u => u.id);
      if (userIds.length === 0) {
        setMembers([]); setInvites([]); setLoading(false); return;
      }

      const [{ data: roleRows }, { data: profRows }, { data: ownerCheck }, { data: pendingInvites }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
        supabase.from("profiles").select("user_id, full_name, email, suspended_at, suspended_reason").in("user_id", userIds),
        supabase.rpc("is_platform_owner"),
        supabase.from("invitations").select("id, email, role, invited_by, created_at, expires_at")
          .is("accepted_at", null).order("created_at", { ascending: false }),
      ]);

      const rolesByUser = new Map<string, string[]>();
      (roleRows || []).forEach((r: any) => {
        const list = rolesByUser.get(r.user_id) || [];
        list.push(r.role);
        rolesByUser.set(r.user_id, list);
      });
      const profByUser = new Map<string, any>();
      (profRows || []).forEach((p: any) => profByUser.set(p.user_id, p));

      // Identify owner — the row matching is_platform_owner result for current admin doesn't
      // directly help, but Antonio is the only owner; we mark owner by checking which user
      // matches the well-known owner email pattern via profiles, OR we just call the RPC for
      // each user (expensive). Cheap proxy: any user_roles row with role='super_admin' OR the
      // server-side flag from profiles.is_owner is missing. We mark the current viewer if RPC=true.
      // For visual lock, we mark all super_admin users + use a server-side flag if available.
      const currentUserRes = await supabase.auth.getUser();
      const currentUserId = currentUserRes.data.user?.id;

      const built: MemberRow[] = users.map(u => {
        const prof = profByUser.get(u.id) || {};
        const roles = rolesByUser.get(u.id) || [];
        const isOwner = !!(ownerCheck && u.id === currentUserId) || roles.includes("super_admin");
        return {
          user_id: u.id,
          email: u.email ?? prof.email ?? null,
          full_name: prof.full_name ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          suspended_at: prof.suspended_at ?? null,
          suspended_reason: prof.suspended_reason ?? null,
          roles,
          is_owner: isOwner,
        };
      });

      // Sort: owner first, then by recent sign-in
      built.sort((a, b) => {
        if (a.is_owner && !b.is_owner) return -1;
        if (!a.is_owner && b.is_owner) return 1;
        const aT = a.last_sign_in_at || a.created_at;
        const bT = b.last_sign_in_at || b.created_at;
        return new Date(bT).getTime() - new Date(aT).getTime();
      });

      setMembers(built);
      setInvites((pendingInvites || []) as PendingInvite[]);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(m => {
      if (filter !== "all") {
        if (filter === "owner" && !m.is_owner) return false;
        if (filter !== "owner" && !m.roles.includes(filter)) return false;
      }
      if (q) {
        const hay = `${m.email ?? ""} ${m.full_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: members.length };
    ROLE_FILTERS.forEach(r => { if (r !== "all") c[r] = 0; });
    members.forEach(m => {
      if (m.is_owner) c.owner++;
      m.roles.forEach(r => { if (c[r] !== undefined) c[r]++; });
    });
    return c;
  }, [members]);

  // --- Actions ---

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    const { error } = await supabase.rpc("suspend_user", {
      _user_id: suspendTarget.user_id,
      _reason: suspendReason || "No reason provided",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("User suspended");
    setSuspendTarget(null); setSuspendReason("");
    loadAll();
  };

  const handleReactivate = async (m: MemberRow) => {
    const { error } = await supabase.rpc("reactivate_user", { _user_id: m.user_id });
    if (error) { toast.error(error.message); return; }
    toast.success("User reactivated");
    loadAll();
  };

  const handleForceSignout = async (m: MemberRow) => {
    const { error } = await supabase.functions.invoke("admin-force-signout", {
      body: { userId: m.user_id },
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Signed user out of all sessions");
  };

  const handleAddRole = async () => {
    if (!addRoleTarget) return;
    const { error } = await supabase.from("user_roles")
      .insert({ user_id: addRoleTarget.user_id, role: newRole as any });
    if (error) { toast.error(error.message); return; }
    toast.success(`Granted ${newRole}`);
    setAddRoleTarget(null);
    loadAll();
  };

  const handleRemoveRole = async (m: MemberRow, role: string) => {
    if (m.is_owner && role === "admin") {
      toast.error("Owner's admin role cannot be removed");
      return;
    }
    const { error } = await supabase.from("user_roles")
      .delete().eq("user_id", m.user_id).eq("role", role as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`Removed ${role}`);
    loadAll();
  };

  const handleRemoveUser = async () => {
    if (!removeTarget) return;
    // If this user is a coach with active clients, force reassignment first
    if (removeTarget.roles.includes("coach")) {
      const { count } = await supabase.from("clients").select("id", { count: "exact", head: true })
        .eq("assigned_coach_user_id", removeTarget.user_id);
      if ((count || 0) > 0) {
        setReassignCoachId(removeTarget.user_id);
        setReassignLabel(removeTarget.full_name || removeTarget.email || "Coach");
        setRemoveTarget(null);
        toast.message("Reassign their clients first", { description: "Then re-open Remove." });
        return;
      }
    }
    const { error } = await supabase.functions.invoke("admin-delete-user", {
      body: { userId: removeTarget.user_id },
    });
    if (error) { toast.error(error.message); return; }
    toast.success("User removed");
    setRemoveTarget(null);
    loadAll();
  };

  const handleRevokeInvite = async (id: string) => {
    const { error } = await supabase.from("invitations").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Invitation revoked");
    loadAll();
  };

  const handleResendInvite = async (inv: PendingInvite) => {
    const { error } = await supabase.functions.invoke("send-admin-invitation", {
      body: { email: inv.email, role: inv.role },
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Resent invite to ${inv.email}`);
    loadAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Members & Roles</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Invite teammates, grant roles, suspend access, and manage your platform users.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" /> Invite Member
        </Button>
      </div>

      {/* Role filter chips */}
      <div className="flex flex-wrap gap-2">
        {ROLE_FILTERS.map(r => (
          <Button
            key={r}
            size="sm"
            variant={filter === r ? "default" : "outline"}
            onClick={() => setFilter(r)}
            className="capitalize"
          >
            {r.replace("_", " ")} <span className="ml-1.5 opacity-60">{counts[r] ?? 0}</span>
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardHeader><CardTitle>Platform users ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No members match these filters.</TableCell></TableRow>
                )}
                {!loading && filtered.map(m => (
                  <TableRow key={m.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {m.is_owner && <Crown className="w-4 h-4 text-yellow-500" />}
                        <div>
                          <div className="font-medium">{m.full_name || m.email || "—"}</div>
                          {m.full_name && <div className="text-xs text-muted-foreground">{m.email}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {m.is_owner && <Badge className={roleColor.owner}>Owner</Badge>}
                        {m.roles.map(r => (
                          <Badge key={r} variant="outline" className={roleColor[r] || ""}>
                            {r.replace("_", " ")}
                          </Badge>
                        ))}
                        {m.roles.length === 0 && !m.is_owner && (
                          <span className="text-xs text-muted-foreground">No role</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {m.suspended_at ? (
                        <Badge variant="destructive" className="gap-1"><ShieldOff className="w-3 h-3" /> Suspended</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1"><ShieldCheck className="w-3 h-3" /> Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={m.is_owner}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel>Manage user</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => { setAddRoleTarget(m); setNewRole("coach"); }}>
                            <UserCog className="w-4 h-4 mr-2" /> Add role
                          </DropdownMenuItem>
                          {m.roles.length > 0 && (
                            <>
                              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground pt-2">Remove role</DropdownMenuLabel>
                              {m.roles.map(r => (
                                <DropdownMenuItem key={r} onClick={() => handleRemoveRole(m, r)}>
                                  <span className="capitalize">{r.replace("_", " ")}</span>
                                </DropdownMenuItem>
                              ))}
                            </>
                          )}
                          <DropdownMenuSeparator />
                          {m.suspended_at ? (
                            <DropdownMenuItem onClick={() => handleReactivate(m)}>
                              <ShieldCheck className="w-4 h-4 mr-2" /> Reactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => setSuspendTarget(m)}>
                              <ShieldOff className="w-4 h-4 mr-2" /> Suspend
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleForceSignout(m)}>
                            <LogOut className="w-4 h-4 mr-2" /> Force sign-out
                          </DropdownMenuItem>
                          {m.roles.includes("coach") && (
                            <DropdownMenuItem onClick={() => { setReassignCoachId(m.user_id); setReassignLabel(m.full_name || m.email || "Coach"); }}>
                              <UserCog className="w-4 h-4 mr-2" /> Reassign clients
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setRemoveTarget(m)} className="text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" /> Remove user
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pending invitations ({invites.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No pending invitations.</TableCell></TableRow>
                )}
                {invites.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{inv.role.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(inv.expires_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="sm" onClick={() => handleResendInvite(inv)}>
                          <Mail className="w-3.5 h-3.5 mr-1" /> Resend
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleRevokeInvite(inv.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={loadAll} />

      <ReassignCoachDialog
        open={!!reassignCoachId}
        onOpenChange={(o) => { if (!o) { setReassignCoachId(null); setReassignLabel(undefined); } }}
        fromCoachId={reassignCoachId}
        fromCoachLabel={reassignLabel}
        onReassigned={loadAll}
      />

      {/* Suspend dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={(o) => { if (!o) { setSuspendTarget(null); setSuspendReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {suspendTarget?.email}?</DialogTitle>
            <DialogDescription>
              They'll be blocked from signing in. You can reactivate them anytime.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason (saved to audit log)</Label>
            <Textarea value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} rows={3} placeholder="Why are you suspending this user?" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleSuspend}>Suspend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add role dialog */}
      <Dialog open={!!addRoleTarget} onOpenChange={(o) => { if (!o) setAddRoleTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a role to {addRoleTarget?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Role</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.filter(r => !addRoleTarget?.roles.includes(r)).map(r => (
                  <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddRoleTarget(null)}>Cancel</Button>
            <Button onClick={handleAddRole}>Add role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove user confirm */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently remove {removeTarget?.email}?</DialogTitle>
            <DialogDescription>
              This deletes their auth account. Their data may remain depending on table policies. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemoveUser}>Remove user</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
