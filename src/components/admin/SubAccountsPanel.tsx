/**
 * Sub-accounts — a tenant OWNER spins up child workspaces under their own.
 *
 * Gated by account_type (the front-door capability flag):
 *   - standalone → cannot create sub-accounts; shown a one-click upgrade to
 *     Agency instead (set_tenant_account_type — flip a flag, no data migration).
 *   - agency / enterprise → full sub-account management.
 *
 * Each sub-account is a full tenant (its own clients, pipeline, calendar, brand)
 * nested under the parent via tenants.parent_tenant_id. The owner owns every one
 * and can switch into it to run it. Backed by the create_subaccount RPC
 * (owner + agency/enterprise enforced server-side). Rendered only for the owner.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Network, Loader2, RefreshCw, ArrowRightLeft, Sparkles, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";

interface SubAccount { id: string; slug: string; name: string; status: string; }

export function SubAccountsPanel() {
  const { activeTenant, activeTenantId, switchTenant } = useTenantContext();
  const [uid, setUid] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [creating, setCreating] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  // "Invite owner" flow — hand a sub-account to its principal as the child's ADMIN.
  const [inviteFor, setInviteFor] = useState<SubAccount | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  // Only the tenant owner may spin up sub-accounts (the RPC enforces this too).
  const isOwner = !!activeTenant && !!uid && activeTenant.owner_user_id === uid;
  // Only agency/enterprise accounts get sub-accounts (RPC enforces this too).
  const canSubaccounts = activeTenant?.account_type === "agency" || activeTenant?.account_type === "enterprise";

  const load = useCallback(async () => {
    if (!activeTenantId || !canSubaccounts) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, slug, name, status")
        .eq("parent_tenant_id", activeTenantId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setSubs((data ?? []) as SubAccount[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load sub-accounts");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, canSubaccounts]);

  useEffect(() => { load(); }, [load]);

  const upgradeToAgency = async () => {
    if (!activeTenantId) return;
    setUpgrading(true);
    try {
      const { error } = await supabase.rpc("set_tenant_account_type", {
        _tenant_id: activeTenantId,
        _account_type: "agency",
      });
      if (error) throw error;
      toast.success("You're an Agency now — you can create sub-accounts.");
      // Capability changed platform-wide; hard-reload so every consumer of the
      // tenant context re-reads the new account_type.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upgrade");
      setUpgrading(false);
    }
  };

  const create = async () => {
    if (name.trim().length < 2) { toast.error("Give the sub-account a name"); return; }
    setCreating(true);
    try {
      const { error } = await supabase.rpc("create_subaccount", {
        _name: name.trim(),
        _industry: industry.trim() || null,
        _description: null,
        _parent_tenant_id: activeTenantId,
      });
      if (error) throw error;
      toast.success("Sub-account created");
      setName(""); setIndustry("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create sub-account");
    } finally {
      setCreating(false);
    }
  };

  const openSub = async (id: string) => {
    // useTenantContext is a plain hook (per-component state), so a soft switch
    // wouldn't reach the header switcher or the CRM data pages. Persist the
    // active tenant, then hard-navigate so every consumer re-reads it fresh
    // (same pattern the signup flow uses after provisioning).
    await switchTenant(id);
    window.location.assign("/admin");
  };

  // Invite the sub-account's owner. Mints a `subaccount_owner` invite ON THE CHILD
  // (auth passes: the agency owner is the child's owner + a member → is_tenant_admin
  // is true), bound to the owner's email, then emails the child/agency-branded /join
  // link via send-portal-invite. On accept they become the child's ADMIN — the
  // agency stays owner_user_id and keeps white-label control. No clients row.
  const sendOwnerInvite = async () => {
    if (!inviteFor) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter a valid email address"); return; }
    setInviteBusy(true);
    try {
      const { data: tokRes, error: mintErr } = await supabase.rpc("create_tenant_invite_token", {
        _tenant_id: inviteFor.id,
        _kind: "subaccount_owner",
        _default_role: "admin",
        _expires_in_days: 30,
        _max_uses: 1,
        _contact_id: null,
        _email: email,
      });
      if (mintErr) throw mintErr;
      const row = Array.isArray(tokRes) ? tokRes[0] : tokRes;
      const token = (row as { token?: string } | null)?.token;
      if (!token) throw new Error("Could not create the invite");

      const joinUrl = `${window.location.origin}/join/${token}`;
      const { data: sent } = await supabase.functions.invoke("send-portal-invite", {
        body: { token, email },
      });
      try { await navigator.clipboard.writeText(joinUrl); } catch { /* clipboard optional */ }
      const emailed = (sent as { emailed?: boolean } | null)?.emailed;
      toast.success(emailed ? `Owner invite emailed to ${email} — link also copied` : `Invite link copied — send it to ${email}`);
      setInviteFor(null);
      setInviteEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the owner invite");
    } finally {
      setInviteBusy(false);
    }
  };

  if (!activeTenantId || !isOwner) return null;

  // Standalone owner → offer the upgrade instead of the management UI.
  if (!canSubaccounts) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="w-4 h-4" /> Sub-accounts
          </CardTitle>
          <CardDescription>
            Sub-accounts let you run multiple businesses under one roof — each with its own clients,
            brand, and pipeline. They're part of the Agency and Enterprise plans.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Sparkles className="w-4 h-4 text-primary" /> Become an Agency
              </div>
              <p className="text-sm text-muted-foreground">
                Upgrade {activeTenant?.name ?? "this workspace"} to create and manage sub-accounts.
                It's a flag — nothing about your current workspace changes, and you can do it now.
              </p>
            </div>
            <Button onClick={upgradeToAgency} disabled={upgrading} className="shrink-0">
              {upgrading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Upgrade
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="w-4 h-4" /> Sub-accounts
        </CardTitle>
        <CardDescription>
          Spin up a child workspace under {activeTenant?.name ?? "this workspace"} — a separate space for a
          team, brand, or client business you run. You own each one and can switch between them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Northwind Team" />
          </div>
          <div className="space-y-1.5">
            <Label>What they do (optional)</Label>
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Consulting, agency, advisory…" />
          </div>
          <Button onClick={create} disabled={creating || name.trim().length < 2}>
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Create
          </Button>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Your sub-accounts</h4>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          {subs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No sub-accounts yet.</p>
          ) : (
            <div className="space-y-2">
              {subs.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground">/{s.slug} · <span className="capitalize">{s.status}</span></div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setInviteFor(s); setInviteEmail(""); }}
                    >
                      <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Invite owner
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openSub(s.id)}>
                      <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" /> Open
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={!!inviteFor} onOpenChange={(o) => { if (!o && !inviteBusy) { setInviteFor(null); setInviteEmail(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite the owner of {inviteFor?.name ?? "this sub-account"}</DialogTitle>
            <DialogDescription>
              They'll get a branded link to set up their account and take the reins as this
              workspace's admin. You stay the owner and keep full control — hand off the day-to-day,
              not the keys.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="owner-invite-email">Owner's email</Label>
            <Input
              id="owner-invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="owner@business.com"
              disabled={inviteBusy}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void sendOwnerInvite(); }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setInviteFor(null); setInviteEmail(""); }}
              disabled={inviteBusy}
            >
              Cancel
            </Button>
            <Button onClick={sendOwnerInvite} disabled={inviteBusy || inviteEmail.trim().length === 0}>
              {inviteBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
