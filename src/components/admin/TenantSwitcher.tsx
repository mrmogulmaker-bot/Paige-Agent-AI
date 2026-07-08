/**
 * Header dropdown for switching the active tenant.
 * Hidden when the user belongs to a single tenant and is not the platform owner.
 */
import { Building2, Check, ChevronDown, Globe2 } from "lucide-react";
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
import { PLATFORM } from "@/lib/platform/identity";

export function TenantSwitcher() {
  const { loading, isPlatformOwner, tenants, activeTenant, activeTenantId, switchTenant } =
    useTenantContext();

  if (loading) return null;
  if (!isPlatformOwner && tenants.length <= 1) return null;

  // Platform owner with no tenant filter = the master account itself: Paige Agent AI.
  const label = activeTenant?.name ?? (isPlatformOwner ? PLATFORM.allTenantsLabel : "Tenant");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50 max-w-[180px]"
        >
          <Building2 className="w-4 h-4 mr-1.5 flex-shrink-0" />
          <span className="truncate text-xs">{label}</span>
          <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Active tenant</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => switchTenant(t.id)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm">{t.name}</div>
                <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t.plan_offer ?? "—"} · {t.status}
                </div>
              </div>
            </div>
            {activeTenantId === t.id && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
          </DropdownMenuItem>
        ))}
        {isPlatformOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => switchTenant(null)}>
              <Globe2 className="w-4 h-4 mr-2" />
              <div className="min-w-0">
                <div className="truncate text-sm">{PLATFORM.allTenantsLabel}</div>
                <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                  {PLATFORM.platformScopeLabel}
                </div>
              </div>
              {activeTenantId === null && <Check className="w-4 h-4 ml-auto text-accent flex-shrink-0" />}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
