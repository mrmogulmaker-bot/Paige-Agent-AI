// Paige sub-tab strip (IA slice 1c-vi) — Chat · Sub-Agents · Actions · Skills.
// Absorbs three formerly-standalone surfaces as Paige sub-tabs WITHOUT moving
// their URLs (the pathless PaigeTabsLayout wraps the existing routes). This strip
// is gate-AWARE: a tab is shown iff its route would actually render for the current
// user, so no tab ever dead-ends on a "Restricted area" card.
//
// The predicates below MIRROR the route gates 1:1 (B5). If a child gate ever
// changes (e.g. coaches gain Chat), change the matching `canSee` here in lockstep.
import { Link, useLocation } from "react-router-dom";
import { MessageSquare, Bot, ClipboardCheck, Sparkles, type LucideIcon } from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useTenantContext } from "@/hooks/useTenantContext";
import { cn } from "@/lib/utils";

type Access = { isAdmin: boolean; isPlatformOwner: boolean; isPlatformStaff: boolean };
type Tab = { label: string; href: string; icon: LucideIcon; canSee: (a: Access) => boolean };

const TABS: Tab[] = [
  // Chat = /admin/playbook, gated AdminOnly (RoleGate allow=["admin"], allowOwner default).
  { label: "Chat", href: "/admin/playbook", icon: MessageSquare, canSee: (a) => a.isPlatformOwner || a.isAdmin },
  // Sub-Agents — ungated route.
  { label: "Sub-Agents", href: "/admin/sub-agents", icon: Bot, canSee: () => true },
  // Actions — RoleGate allow=["admin"] allowPlatformStaff.
  { label: "Actions", href: "/admin/actions", icon: ClipboardCheck, canSee: (a) => a.isAdmin || a.isPlatformOwner || a.isPlatformStaff },
  // Skills — ungated route.
  { label: "Skills", href: "/admin/skills", icon: Sparkles, canSee: () => true },
];

export function PaigeSubTabs() {
  const { pathname } = useLocation();
  const roles = useUserRoles();
  const tenant = useTenantContext();

  // Don't render a wrong subset mid-resolution: while roles/tenant load, both
  // isAdmin and isPlatformOwner read false, which would briefly hide Chat/Actions
  // for an admin. Hold the strip until access is known (S5).
  if (roles.loading || tenant.loading) return null;

  // §9 operator seam: a platform-staff operator reaching these routes via the God
  // Automation dropdown with NO active tenant is not in a tenant context — don't
  // paint tenant chrome (the sub-tab strip) into the operator flow.
  if (tenant.isPlatformStaff && !tenant.activeTenantId) return null;

  const access: Access = {
    isAdmin: roles.isAdmin,
    isPlatformOwner: tenant.isPlatformOwner,
    isPlatformStaff: tenant.isPlatformStaff,
  };

  // Exact match for the chat index; prefix for the leaf surfaces (mirrors AdminLayout.isActive).
  const isActive = (href: string) =>
    href === "/admin/playbook" ? pathname === "/admin/playbook" : pathname.startsWith(href);

  const tabs = TABS.filter((t) => t.canSee(access));
  if (tabs.length <= 1) return null; // nothing to switch between → no strip clutter

  // If the current route isn't one this user can see as a tab (e.g. a coach who
  // deep-linked /admin/playbook, which they can't access), don't wrap the gated
  // surface in a strip that disowns it — let the route's own gate speak.
  if (!tabs.some((t) => isActive(t.href))) return null;

  return (
    <nav
      aria-label="Paige"
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
