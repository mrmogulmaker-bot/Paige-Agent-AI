// Clients sub-tab strip (IA slice 1c-viii-c) — People · Pipeline · Conversations ·
// Delivery · Client Portal. MIRRORS PaigeSubTabs 1:1 (the proven 1c-vi pattern): a
// gate-AWARE strip wrapped by a pathless layout, so a tab is shown iff its route
// would actually render for the current user — no tab ever dead-ends on a
// "Restricted area" card. Indigo underline on the active tab, NEVER gold (§11 —
// nav-active is not an ACT).
//
// The predicates below MIRROR the route gates 1:1. If a child gate changes, change
// the matching `canSee` here in lockstep. Today only Client Portal is gated
// (AdminOnly on its route); the other four are ungated container children.
import { Link, useLocation } from "react-router-dom";
import { Users, KanbanSquare, MessagesSquare, CalendarDays, LayoutTemplate, type LucideIcon } from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useTenantContext } from "@/hooks/useTenantContext";
import { cn } from "@/lib/utils";

type Access = { isAdmin: boolean; isPlatformOwner: boolean; isPlatformStaff: boolean };
type Tab = { label: string; href: string; icon: LucideIcon; canSee: (a: Access) => boolean };

const TABS: Tab[] = [
  { label: "People", href: "/admin/clients-hub", icon: Users, canSee: () => true },
  { label: "Pipeline", href: "/admin/clients-hub/pipeline", icon: KanbanSquare, canSee: () => true },
  { label: "Conversations", href: "/admin/clients-hub/conversations", icon: MessagesSquare, canSee: () => true },
  { label: "Delivery", href: "/admin/clients-hub/delivery", icon: CalendarDays, canSee: () => true },
  // Client Portal — MIRRORS AdminOnly on the route (RoleGate allow=["admin"], allowOwner default).
  { label: "Client Portal", href: "/admin/clients-hub/portal", icon: LayoutTemplate, canSee: (a) => a.isAdmin || a.isPlatformOwner },
];

export function ClientsSubTabs() {
  const { pathname } = useLocation();
  const roles = useUserRoles();
  const tenant = useTenantContext();

  // Don't render a wrong subset mid-resolution: while roles/tenant load, both
  // isAdmin and isPlatformOwner read false, which would briefly hide the Portal
  // tab for an admin. Hold the strip until access is known.
  if (roles.loading || tenant.loading) return null;

  // §9 operator seam: a platform-staff operator with NO active tenant is not in a
  // tenant context — don't paint tenant chrome (the sub-tab strip) into the
  // operator flow.
  if (tenant.isPlatformStaff && !tenant.activeTenantId) return null;

  const access: Access = {
    isAdmin: roles.isAdmin,
    isPlatformOwner: tenant.isPlatformOwner,
    isPlatformStaff: tenant.isPlatformStaff,
  };

  // Exact match for the People index; prefix for the leaf surfaces. The index MUST
  // be exact-match because /admin/clients-hub is a prefix of every other tab —
  // otherwise People would light up on every sub-route.
  const isActive = (href: string) =>
    href === "/admin/clients-hub" ? pathname === "/admin/clients-hub" : pathname.startsWith(href);

  const tabs = TABS.filter((t) => t.canSee(access));
  if (tabs.length <= 1) return null; // nothing to switch between → no strip clutter

  // If the current route isn't one this user can see as a tab (e.g. a coach who
  // deep-linked the gated Portal), don't wrap the gated surface in a strip that
  // disowns it — let the route's own gate speak.
  if (!tabs.some((t) => isActive(t.href))) return null;

  return (
    <nav
      aria-label="Clients"
      className="shrink-0 flex items-center gap-1 overflow-x-auto border-b border-border bg-background px-3 sm:px-4 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            to={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-t-md px-3 text-sm",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            <span>{t.label}</span>
            {/* Indigo underline — nav-active is not an ACT, so never gold (§11). */}
            {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}
