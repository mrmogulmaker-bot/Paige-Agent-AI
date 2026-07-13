/**
 * Sub-accounts (tenant Settings entry point).
 *
 * The agency operator's actual book — create sub-accounts, invite their owners,
 * open them — now lives on its OWN top-level shell (`/agency`, §9), reached
 * through the one global AccountSwitcher. This Settings panel is deliberately
 * thin, and serves exactly two jobs that DO belong in the tenant workspace:
 *
 *   - standalone owner → the one-click UPGRADE to Agency (a capability flag on
 *     THIS tenant; a tenant-level workspace decision, so it stays in Settings).
 *   - agency/enterprise owner → a CROSS-LINK up to the /agency side, so there's
 *     one continuous path and no dead end (§6/§12) — never a duplicate of the
 *     management UI.
 *
 * The old in-Settings roster/create/invite/open UI was removed: it duplicated the
 * agency side, and its "Open" path used a bare active_tenant_id write that left
 * the admin unable to read the child under RLS. Entering a sub-account now goes
 * exclusively through agency_enter_subaccount (AccountSwitcher / AgencyBoard).
 * Rendered only for the tenant owner.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Network, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";

export function SubAccountsPanel() {
  const { activeTenant, activeTenantId } = useTenantContext();
  const [uid, setUid] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  // Only the tenant owner may spin up sub-accounts (the RPC enforces this too).
  const isOwner = !!activeTenant && !!uid && activeTenant.owner_user_id === uid;
  // Only agency/enterprise accounts get sub-accounts (RPC enforces this too).
  const canSubaccounts = activeTenant?.account_type === "agency" || activeTenant?.account_type === "enterprise";

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

  if (!activeTenantId || !isOwner) return null;

  // Standalone owner → offer the upgrade instead of a management UI.
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

  // Agency/enterprise owner → point them at the agency side (the one home for the
  // book), never a second copy of the management UI here (§6/§9/§12).
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="w-4 h-4" /> Sub-accounts
        </CardTitle>
        <CardDescription>
          You run your book of sub-accounts — create them, invite their owners, and open any one —
          on your Agency side, reached from the account switcher.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <a href="/agency">
            Go to your Agency side <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
