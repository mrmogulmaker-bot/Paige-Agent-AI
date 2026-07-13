/**
 * Tenant Detail & Lifecycle — the Fleet Console drill-in.
 * A platform-owner slide-over to edit a tenant's plan/limits and drive its
 * lifecycle (extend/expire trial, activate, suspend, cancel). Writes are
 * RLS-gated to is_platform_owner(); destructive transitions confirm first.
 * Blueprint §02 · Phase 1 (no Stripe).
 */
import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Clock, Users, Contact as ContactIcon } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  type TenantStatus, STATUS_META, allowedTransitions, isDestructiveStatus,
  trialDaysLeft, tenantHealth, setTenantStatus, extendTrial, expireTrial, updateTenant,
} from "@/lib/platform/tenantLifecycle";

export interface FleetTenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  plan_offer: string | null;
  seat_limit: number;
  customer_limit: number;
  trial_ends_at: string | null;
  member_count: number;
  customer_count: number;
}

const TONE_CLASS: Record<string, string> = {
  positive: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.3)]",
  notice: "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.3)]",
  warn: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.3)]",
  critical: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.3)]",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function TenantDetailSheet({
  tenant, open, onOpenChange, onChanged,
}: {
  tenant: FleetTenant | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [plan, setPlan] = useState("");
  const [seats, setSeats] = useState("");
  const [customers, setCustomers] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TenantStatus | null>(null);

  useEffect(() => {
    if (tenant) {
      setPlan(tenant.plan_offer ?? "");
      setSeats(String(tenant.seat_limit ?? 0));
      setCustomers(String(tenant.customer_limit ?? 0));
    }
  }, [tenant]);

  if (!tenant) return null;

  const health = tenantHealth(tenant);
  const days = trialDaysLeft(tenant.trial_ends_at);
  const statusMeta = STATUS_META[tenant.status];

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      toast({ title: "Done", description: `${tenant.name}: ${label}.` });
      onChanged();
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      await updateTenant(tenant.id, {
        plan_offer: plan.trim() || null,
        seat_limit: Math.max(0, parseInt(seats, 10) || 0),
        customer_limit: Math.max(0, parseInt(customers, 10) || 0),
      });
      toast({ title: "Saved", description: `${tenant.name} updated.` });
      onChanged();
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = (s: TenantStatus) => {
    if (isDestructiveStatus(s)) setConfirm(s);
    else run(`set to ${STATUS_META[s].label}`, () => setTenantStatus(tenant.id, s));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <SheetTitle className="text-xl">{tenant.name}</SheetTitle>
            <Badge variant="outline" className={TONE_CLASS[statusMeta.tone]}>{statusMeta.label}</Badge>
          </div>
          <SheetDescription>/{tenant.slug}</SheetDescription>
        </SheetHeader>

        {/* Health */}
        {health.level !== "healthy" && (
          <div className={`mt-4 rounded-lg border p-3 text-sm flex items-start gap-2 ${health.level === "critical" ? TONE_CLASS.critical : TONE_CLASS.warn}`}>
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{health.reasons.join(" · ")}</span>
          </div>
        )}

        {/* Usage */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <UsageStat icon={Users} label="Seats" used={tenant.member_count} limit={tenant.seat_limit} />
          <UsageStat icon={ContactIcon} label="Customers" used={tenant.customer_count} limit={tenant.customer_limit} />
        </div>

        <Separator className="my-5" />

        {/* Trial */}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Clock className="w-4 h-4 text-muted-foreground" /> Trial
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {tenant.trial_ends_at
              ? days !== null && days >= 0
                ? `Ends in ${days} day${days === 1 ? "" : "s"} (${new Date(tenant.trial_ends_at).toLocaleDateString()}).`
                : `Lapsed on ${new Date(tenant.trial_ends_at!).toLocaleDateString()}.`
              : "No trial set."}
          </p>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((d) => (
              <Button key={d} size="sm" variant="outline" disabled={!!busy}
                onClick={() => run(`trial extended ${d}d`, async () => { await extendTrial(tenant.id, tenant.trial_ends_at, d); })}>
                +{d}d
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={!!busy || tenant.status !== "trial"}
              onClick={() => run("trial expired", () => expireTrial(tenant.id))}>
              Expire now
            </Button>
          </div>
        </div>

        <Separator className="my-5" />

        {/* Plan & limits */}
        <div className="space-y-3">
          <div className="text-sm font-medium">Plan &amp; limits</div>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="plan" className="text-xs">Plan offer</Label>
              <Input id="plan" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. crm_coach" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="seats" className="text-xs">Seat limit</Label>
                <Input id="seats" type="number" min={0} value={seats} onChange={(e) => setSeats(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="customers" className="text-xs">Customer limit</Label>
                <Input id="customers" type="number" min={0} value={customers} onChange={(e) => setCustomers(e.target.value)} />
              </div>
            </div>
          </div>
          <Button size="sm" onClick={saveEdits} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Save changes
          </Button>
        </div>

        <Separator className="my-5" />

        {/* Lifecycle status */}
        <div>
          <div className="text-sm font-medium mb-2">Lifecycle</div>
          <div className="flex flex-wrap gap-2">
            {allowedTransitions(tenant.status).map((s) => (
              <Button key={s} size="sm" disabled={!!busy}
                variant={isDestructiveStatus(s) ? "destructive" : "default"}
                onClick={() => applyStatus(s)}>
                {busy === `set to ${STATUS_META[s].label}` && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {s === "active" && tenant.status !== "trial" ? "Reactivate" : STATUS_META[s].label}
              </Button>
            ))}
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "canceled" ? "Cancel" : "Suspend"} {tenant.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "canceled"
                ? "This retires the tenant. Members lose access until it's reactivated."
                : "This freezes the tenant. Members lose access until you reactivate it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as-is</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const s = confirm!;
                setConfirm(null);
                run(`set to ${STATUS_META[s].label}`, () => setTenantStatus(tenant.id, s));
              }}>
              {confirm === "canceled" ? "Cancel tenant" : "Suspend tenant"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function UsageStat({
  icon: Icon, label, used, limit,
}: { icon: typeof Users; label: string; used: number; limit: number }) {
  const atLimit = limit > 0 && used >= limit;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-lg font-bold tabular-nums mt-1 ${atLimit ? "text-[hsl(var(--warning))]" : ""}`}>
        {used}<span className="text-muted-foreground font-normal text-sm">/{limit || "∞"}</span>
      </div>
    </div>
  );
}
