/**
 * Header dropdown that IS the operator/tenant mode switch (Option B, Super Admin
 * restructure). For platform staff it is the single control that flips the whole
 * shell between OPERATOR mode (no tenant selected = the "Platform" pinned entry)
 * and TENANT mode (any tenant selected = the real Slice 1c tenant IA). The gate
 * itself lives in AdminLayout (`godMode = isPlatformStaff && activeTenantId === null`);
 * this component just drives `activeTenantId` via `switchTenant`.
 *
 * Hidden when the user belongs to a single tenant and is not platform staff.
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
  const { loading, isPlatformStaff, tenants, activeTenant, activeTenantId, switchTenant } =
    useTenantContext();

  if (loading) return null;
  if (!isPlatformStaff && tenants.length <= 1) return null;

  const inPlatformView = activeTenantId === null;
  // Trigger reads the ACTIVE mode: a tenant's name in tenant mode (tenant chrome),
  // or "Platform" in operator mode — never a raw master-account name. A non-staff
  // multi-tenant member falls back to "Tenant".
  const label = activeTenant?.name ?? (isPlatformStaff ? "Platform" : "Tenant");
  const TriggerIcon = inPlatformView && isPlatformStaff ? Globe2 : Building2;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50 max-w-[180px]"
        >
          <TriggerIcon className="w-4 h-4 mr-1.5 flex-shrink-0" />
          <span className="truncate text-xs">{label}</span>
          <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {/* PINNED-AT-TOP operator entry. Selecting it = switchTenant(null) = operator
            mode. The on-state is carried by the gold Check (below) when Platform is
            active — §11: gold is spent ONLY on the on/selected moment, never as a
            resting row accent. The Globe2 icon marks identity, not state. */}
        {isPlatformStaff && (
          <>
            <DropdownMenuLabel>Mode</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => switchTenant(null)}
              className="flex items-center gap-2"
            >
              <Globe2 className="w-4 h-4 text-foreground flex-shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">Platform</div>
                <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                  {PLATFORM.platformScopeLabel}
                </div>
              </div>
              {inPlatformView && <Check className="w-4 h-4 ml-auto text-accent flex-shrink-0" />}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuLabel>{isPlatformStaff ? "Tenants" : "Active tenant"}</DropdownMenuLabel>
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
                  {t.slug === PLATFORM.defaultsTenantSlug
                    ? "System · Platform defaults"
                    : `${t.plan_offer ?? "—"} · ${t.status}`}
                </div>
              </div>
            </div>
            {activeTenantId === t.id && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
