/**
 * Sub-accounts — a tenant OWNER spins up child workspaces under their own.
 *
 * Each sub-account is a full tenant (its own clients, pipeline, calendar, brand)
 * nested under the parent via tenants.parent_tenant_id. The owner owns every
 * one and can switch into it to run it. Backed by the create_subaccount RPC
 * (owner-only, server-enforced). Rendered only for the tenant owner.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Network, Loader2, RefreshCw, ArrowRightLeft } from "lucide-react";
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  // Only the tenant owner may spin up sub-accounts (the RPC enforces this too).
  const isOwner = !!activeTenant && !!uid && activeTenant.owner_user_id === uid;

  const load = useCallback(async () => {
    if (!activeTenantId) return;
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
  }, [activeTenantId]);

  useEffect(() => { load(); }, [load]);

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

  if (!activeTenantId || !isOwner) return null;

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
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Coaching, consulting, agency…" />
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
                  <Button variant="outline" size="sm" onClick={() => openSub(s.id)}>
                    <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" /> Open
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
