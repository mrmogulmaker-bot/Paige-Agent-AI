/**
 * Platform → Team (God tier)
 * Owner-managed roster of platform staff + pending invites. The owner invites
 * scoped Platform Admins by email (server-minted token → shareable link), sees
 * the roster, and can revoke staff. Platform Admins may view the roster but not
 * mutate it. Blueprint §02 · Phase 1 (no Stripe). Invite email delivery rides
 * the platform email path (deferred) — the link works today.
 */
import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck, UserPlus, Copy, Trash2, Loader2, Crown, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PageShell, PageHeader, StatRow, StatTile, SectionCard,
  DataTableShell, EmptyState, StatePill, type Column,
} from "@/components/ui/page";
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
      const { data, error } = await supabase.functions.invoke("send-platform-invite", {
        body: { email: e, origin: window.location.origin },
      });
      const res = data as { token?: string; emailed?: boolean; error?: string } | null;
      if (error || res?.error) throw new Error(res?.error ?? error?.message ?? "Invite failed");
      setEmail("");
      await load();
      if (res?.token) await copyLink(res.token);
      toast({
        title: res?.emailed ? "Invite sent" : "Invite created",
        description: res?.emailed
          ? `Emailed ${e} — link also copied to your clipboard.`
          : `Invite link for ${e} copied — send it over.`,
      });
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
  const adminCount = staff.length - ownerCount;

  if (ctxLoading) {
    return (
      <PageShell width="wide">
        <div className="text-muted-foreground text-sm">Loading platform team…</div>
      </PageShell>
    );
  }

  if (!isPlatformStaff) {
    return (
      <PageShell width="narrow">
        <SectionCard title="Platform team only" icon={ShieldAlert}>
          <p className="text-sm text-muted-foreground">This area is restricted to the platform team.</p>
        </SectionCard>
      </PageShell>
    );
  }

  const inviteColumns: Column[] = [
    { key: "email", header: "Email" },
    { key: "expires", header: "Expires" },
    { key: "actions", header: "Actions", className: "text-right" },
  ];

  const staffColumns: Column[] = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "role", header: "Role" },
    { key: "actions", header: "Actions", className: "text-right" },
  ];

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        eyebrow="Platform · Team"
        title="Platform Team"
        description={`Your ${PLATFORM.name} staff. Invite scoped Platform Admins who can run the fleet and support tenants — but never touch billing, other admins, or global config.`}
      />

      <StatRow cols={3}>
        <StatTile label="Staff" value={staff.length} icon={Users} loading={loading} />
        <StatTile label="Platform Admins" value={adminCount} icon={ShieldCheck} loading={loading} />
        <StatTile label="Pending invites" value={invites.length} icon={UserPlus} loading={loading} />
      </StatRow>

      {/* Invite (owner-only) */}
      {isPlatformOwner && (
        <SectionCard title="Invite a Platform Admin" icon={UserPlus}>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email" value={email} placeholder="staff@yourcompany.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendInvite(); }}
              disabled={inviting} className="sm:max-w-sm"
            />
            <Button variant="gold" onClick={sendInvite} disabled={inviting}>
              {inviting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Create invite
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Creates a secure invite link (copied to your clipboard). Automated email delivery is coming with the
            platform email engine — for now, send them the link.
          </p>
        </SectionCard>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-base font-semibold text-foreground">Pending invites</h2>
          <DataTableShell columns={inviteColumns}>
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
          </DataTableShell>
        </div>
      )}

      {/* Staff roster */}
      <div className="space-y-3">
        <h2 className="font-display text-base font-semibold text-foreground">Staff ({staff.length})</h2>
        <DataTableShell
          columns={staffColumns}
          loading={loading}
          isEmpty={staff.length === 0}
          empty={
            <EmptyState
              icon={Users}
              title="No staff yet"
              description="Invite your first Platform Admin to help run the fleet."
            />
          }
        >
          {staff.map((s) => {
            const isOwner = s.role === "super_admin";
            return (
              <TableRow key={s.user_id}>
                <TableCell className="font-medium">{s.full_name || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.email}</TableCell>
                <TableCell>
                  {isOwner ? (
                    <StatePill state="included" icon={<Crown className="w-3 h-3" />}>
                      {ROLE_LABEL[s.role] ?? s.role}
                    </StatePill>
                  ) : (
                    <StatePill state="off" icon={<ShieldCheck className="w-3 h-3" />}>
                      {ROLE_LABEL[s.role] ?? s.role}
                    </StatePill>
                  )}
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
        </DataTableShell>
      </div>

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
    </PageShell>
  );
}
