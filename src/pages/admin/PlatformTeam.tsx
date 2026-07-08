/**
 * Platform → Team (God tier)
 * Owner-managed roster of platform staff + pending invites. The owner invites
 * scoped Platform Admins by email (server-minted token → shareable link), sees
 * the roster, and can revoke staff. Platform Admins may view the roster but not
 * mutate it. Blueprint §02 · Phase 1 (no Stripe). Invite email delivery rides
 * the platform email path (deferred) — the link works today.
 */
import { useEffect, useMemo, useState } from "react";
import { Building2, ShieldAlert, ShieldCheck, UserPlus, Copy, Trash2, Loader2, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PLATFORM } from "@/lib/platform/identity";

interface StaffRow { user_id: string; email: string; full_name: string | null; role: string; }
interface InviteRow { id: string; email: string; token: string; status: string; created_at: string; expires_at: string; }

const ROLE_LABEL: Record<string, string> = { super_admin: "Owner", platform_admin: "Platform Admin" };

function inviteLink(token: string) {
  return `${window.location.origin}/join-platform?token=${token}`;
}

export default function PlatformTeam() {
  const { isPlatformOwner, isPlatformStaff, loading: ctxLoading } = useTenantContext();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<StaffRow | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: staffData }, invitesRes] = await Promise.all([
      supabase.rpc("list_platform_staff"),
      isPlatformOwner
        ? supabase.from("platform_invites").select("id,email,token,status,created_at,expires_at").eq("status", "pending").order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as InviteRow[] }),
    ]);
    setStaff((staffData as StaffRow[]) ?? []);
    setInvites(((invitesRes as { data: InviteRow[] | null }).data) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (ctxLoading || !isPlatformStaff) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxLoading, isPlatformStaff]);

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      toast({ title: "Invite link copied", description: "Share it with your new staff member." });
    } catch {
      toast({ title: "Couldn't copy", description: inviteLink(token) });
    }
  };

  const sendInvite = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.rpc("create_platform_invite", { _email: e });
      if (error) throw new Error(error.message);
      const token = (data as { token?: string })?.token;
      setEmail("");
      await load();
      if (token) await copyLink(token);
      toast({ title: "Invite created", description: `Invite link for ${e} copied — send it over.` });
    } catch (err) {
      toast({ title: "Invite failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const cancelInvite = async (id: string) => {
    const { error } = await supabase.from("platform_invites").update({ status: "revoked" }).eq("id", id);
    if (error) { toast({ title: "Couldn't cancel", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Invite canceled" });
    load();
  };

  const revokeStaff = async (row: StaffRow) => {
    const { error } = await supabase.rpc("revoke_platform_admin", { _user_id: row.user_id });
    if (error) { toast({ title: "Couldn't revoke", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Access revoked", description: `${row.email} is no longer a Platform Admin.` });
    load();
  };

  const ownerCount = useMemo(() => staff.filter((s) => s.role === "super_admin").length, [staff]);

  if (ctxLoading) return <div className="text-muted-foreground text-sm">Loading…</div>;

  if (!isPlatformStaff) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            <CardTitle>Platform team only</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">This area is restricted to the platform team.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Platform Team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your {PLATFORM.name} staff. Invite scoped <strong>Platform Admins</strong> who can run the fleet and
          support tenants — but never touch billing, other admins, or global config.
        </p>
      </div>

      {/* Invite (owner-only) */}
      {isPlatformOwner && (
      <Card>
        <CardHeader><CardTitle className="text-base">Invite a Platform Admin</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email" value={email} placeholder="staff@yourcompany.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendInvite(); }}
              disabled={inviting} className="sm:max-w-sm"
            />
            <Button onClick={sendInvite} disabled={inviting}>
              {inviting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Create invite
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Creates a secure invite link (copied to your clipboard). Automated email delivery is coming with the
            platform email engine — for now, send them the link.
          </p>
        </CardContent>
      </Card>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pending invites</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Email</TableHead><TableHead>Expires</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {invites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => copyLink(inv.token)}>
                          <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy link
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => cancelInvite(inv.id)}>
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff roster */}
      <Card>
        <CardHeader><CardTitle className="text-base">Staff ({staff.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : staff.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No staff yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {staff.map((s) => {
                    const isOwner = s.role === "super_admin";
                    return (
                      <TableRow key={s.user_id}>
                        <TableCell className="font-medium">{s.full_name || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={isOwner
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            : "bg-violet-500/15 text-violet-300 border-violet-500/30"}>
                            {isOwner ? <Crown className="w-3 h-3 mr-1" /> : <ShieldCheck className="w-3 h-3 mr-1" />}
                            {ROLE_LABEL[s.role] ?? s.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {isOwner ? (
                            <span className="text-xs text-muted-foreground pr-2">Protected</span>
                          ) : isPlatformOwner ? (
                            <Button variant="ghost" size="sm" className="text-destructive"
                              onClick={() => setRevokeTarget(s)}>
                              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Revoke
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground pr-2">—</span>
                          )}
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

      <AlertDialog open={revokeTarget !== null} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose Platform Admin access immediately. You can re-invite them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { const t = revokeTarget!; setRevokeTarget(null); revokeStaff(t); }}>
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
