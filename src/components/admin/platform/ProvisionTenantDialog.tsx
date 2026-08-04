/**
 * Provision Tenant — the Fleet Console's operator-only "stand up a workspace" act.
 * A God/Super-Admin dialog that provisions a brand-new tenant through the §10
 * canonical RPC seam (`operator_provision_tenant`, server-gated to
 * is_platform_owner()). Provisioning CREATES — it is not destructive (§4), so a
 * single gold primary is the legitimate act here. The slug auto-derives from the
 * name when left blank. Coaching-generic (§2); no finance/credit default.
 */
import { useState } from "react";
import { Loader2, Building2, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  type TenantStatus, STATUS_META, provisionTenant,
} from "@/lib/platform/tenantLifecycle";

// The operator provisions into a starting state — trial (default) or active.
// past_due/suspended/canceled aren't sensible birth states, so we don't offer them.
const START_STATES: TenantStatus[] = ["trial", "active"];

export function ProvisionTenantDialog({
  open, onOpenChange, onProvisioned,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called with the new tenant after a successful provision (Fleet Console refetches). */
  onProvisioned: (tenant: { id: string; slug: string; name: string }) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("");
  const [seats, setSeats] = useState("");
  const [customers, setCustomers] = useState("");
  const [status, setStatus] = useState<TenantStatus>("trial");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setSlug(""); setPlan(""); setSeats(""); setCustomers(""); setStatus("trial");
  };

  const close = (v: boolean) => {
    if (saving) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Name the workspace", description: "A display name is required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const tenant = await provisionTenant({
        name: trimmed,
        slug: slug.trim() || undefined,
        plan_offer: plan.trim() || null,
        seat_limit: seats.trim() ? Math.max(0, parseInt(seats, 10) || 0) : undefined,
        customer_limit: customers.trim() ? Math.max(0, parseInt(customers, 10) || 0) : undefined,
        status,
      });
      toast({
        title: "Workspace provisioned",
        description: `${tenant.name} is live at /${tenant.slug}.`,
      });
      reset();
      onOpenChange(false);
      onProvisioned(tenant);
    } catch (e) {
      toast({ title: "Provisioning failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            Provision a workspace
          </DialogTitle>
          <DialogDescription>
            Stand up a new tenant on the platform. The slug auto-derives from the
            name — override it only if you need a specific handle.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="prov-name" className="text-xs">Workspace name</Label>
            <Input
              id="prov-name" value={name} autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Northstar Advisory"
              disabled={saving}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="prov-slug" className="text-xs">
              Slug <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="prov-slug" value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={name.trim() ? "auto from name" : "e.g. northstar-advisory"}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="prov-plan" className="text-xs">
                Plan offer <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="prov-plan" value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="e.g. crm_coach"
                disabled={saving}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="prov-status" className="text-xs">Starting status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TenantStatus)} disabled={saving}>
                <SelectTrigger id="prov-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {START_STATES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="prov-seats" className="text-xs">
                Seat limit <span className="text-muted-foreground font-normal">(0 = ∞)</span>
              </Label>
              <Input
                id="prov-seats" type="number" min={0} value={seats}
                onChange={(e) => setSeats(e.target.value)}
                placeholder="0"
                disabled={saving}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="prov-customers" className="text-xs">
                Customer limit <span className="text-muted-foreground font-normal">(0 = ∞)</span>
              </Label>
              <Input
                id="prov-customers" type="number" min={0} value={customers}
                onChange={(e) => setCustomers(e.target.value)}
                placeholder="0"
                disabled={saving}
              />
            </div>
          </div>

          {status === "trial" && (
            <p className="text-xs text-muted-foreground -mt-1">
              Starts a 14-day trial. You can extend or convert it anytime from the tenant's drill-in.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={saving}>Cancel</Button>
          {/* Provisioning is a real create act → a single gold primary is legitimate (§11). */}
          <Button variant="gold" onClick={submit} disabled={saving || !name.trim()}>
            {saving
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Sparkles className="w-4 h-4 mr-2" />}
            Provision workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
