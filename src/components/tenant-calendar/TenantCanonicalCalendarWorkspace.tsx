import { CalendarDays, ShieldAlert } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import CalendarAdmin, { type TenantCalendarTab } from "@/pages/admin/CalendarAdmin";
import { useTenantContext } from "@/hooks/useTenantContext";
import { subtabByKey, subtabBySlug, type RouteTierKey } from "@/lib/routing/tierBranches";
import { tenantRoutePrefixForPath } from "@/components/tenant-shell/tenantShellRoutes";

export interface TenantCanonicalCalendarWorkspaceProps {
  tier: Extract<RouteTierKey, "solo" | "agency">;
  openPaige?: () => void;
}

function CalendarBoundary({ kind }: { kind: "loading" | "permission" }) {
  const loading = kind === "loading";
  const Icon = loading ? CalendarDays : ShieldAlert;
  return (
    <section className="grid min-h-[420px] place-items-center px-6 text-center" aria-live="polite">
      <div className="max-w-md space-y-3">
        <Icon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {loading ? "Loading" : "Permission limited"}
        </p>
        <h1 className="text-2xl font-semibold">
          {loading ? "Resolving Calendar" : "Calendar access is limited"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {loading
            ? "The prior account is cleared while the authenticated account context loads."
            : "This session did not resolve an authorized tenant Calendar. No other account is substituted."}
        </p>
      </div>
    </section>
  );
}

/**
 * Tenant adapter for the one canonical Calendar owner.
 *
 * The URL is used only to preserve the already-authorized account tree while
 * navigating. Every read/write receives the server-resolved activeTenantId.
 */
export function TenantCanonicalCalendarWorkspace({ tier, openPaige }: TenantCanonicalCalendarWorkspaceProps) {
  const { activeTenantId, loading, accountContextLoading } = useTenantContext();
  const location = useLocation();
  const navigate = useNavigate();
  const routeRoot = tenantRoutePrefixForPath(location.pathname);
  const calendarRoot = routeRoot ? `${routeRoot}/calendar` : null;
  const tail = calendarRoot && location.pathname.startsWith(`${calendarRoot}/`)
    ? location.pathname.slice(calendarRoot.length + 1).split("/")[0]
    : null;
  const activeTab = (tail
    ? subtabBySlug(tier, "calendar", tail)?.key
    : "calendar") as TenantCalendarTab;

  if (loading || accountContextLoading) return <CalendarBoundary kind="loading" />;
  if (!activeTenantId) return <CalendarBoundary kind="permission" />;

  const onTabChange = (tab: TenantCalendarTab) => {
    const slug = subtabByKey(tier, "calendar", tab)?.slug;
    if (!slug || !calendarRoot) return;
    navigate(`${calendarRoot}/${slug}`);
  };

  return (
    <CalendarAdmin
      key={activeTenantId}
      activeTenantId={activeTenantId}
      activeTab={activeTab}
      onTabChange={onTabChange}
      connectionsHref={routeRoot ? `${routeRoot}/integrations` : "/admin/setup/integrations"}
      openPaige={openPaige}
      tenantMode
    />
  );
}

export default TenantCanonicalCalendarWorkspace;
