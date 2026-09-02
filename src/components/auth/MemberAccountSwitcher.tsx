import { useEffect, useState } from "react";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenantContext } from "@/hooks/useTenantContext";
import { tenantAccountLabel } from "@/lib/auth/accountSelection";
import { toast } from "sonner";

export function MemberAccountSwitcher() {
  const { activeTenant, activeTenantId, isPlatformStaff, switchTenant, tenants = [] } = useTenantContext();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  useEffect(() => {
    try {
      const notice = sessionStorage.getItem("paige.accountSwitch.notice");
      if (!notice) return;
      sessionStorage.removeItem("paige.accountSwitch.notice");
      toast.success(notice);
    } catch {
      // Feedback is best-effort when session storage is unavailable.
    }
  }, []);

  // Agency parent/child management has its own server-gated AccountSwitcher.
  // This control owns only the independent-membership case approved for Solo.
  // tier-feature-exempt: routes independent memberships away from the separate agency parent-child control; this is switcher ownership, not a feature grant.
  if (isPlatformStaff || activeTenant?.account_type !== "standalone" || tenants.length < 2) return null;

  const choose = async (tenantId: string, tenantName: string) => {
    if (tenantId === activeTenantId || switchingTo) return;
    setSwitchingTo(tenantId);
    const switched = await switchTenant(tenantId);
    if (!switched) {
      toast.error("Couldn't switch accounts. Your current workspace is unchanged.");
      setSwitchingTo(null);
      return;
    }
    try {
      sessionStorage.setItem("paige.accountSwitch.notice", `Now working in ${tenantName}.`);
    } catch {
      // The hard navigation still completes when session storage is unavailable.
    }
    window.location.assign("/admin");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!!switchingTo} aria-label="Switch Paige account">
          {switchingTo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Building2 className="mr-1.5 h-4 w-4" />}
          <span className="max-w-40 truncate">{activeTenant.name}</span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Switch account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => {
          const current = tenant.id === activeTenantId;
          return (
            <DropdownMenuItem
              key={tenant.id}
              disabled={!!switchingTo}
              onClick={() => void choose(tenant.id, tenant.name)}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{tenant.name}</div>
                <div className="text-xs text-muted-foreground">
                  {tenantAccountLabel(tenant.account_type, tenant.parent_tenant_id)}
                </div>
              </div>
              {current && <Check className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Current account" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
