// Setup sub-tab strip (IA slice 1c-xi) — the tenant-config consolidation home:
// General · Brand · Automations · Integrations · Legal · Billing · Playbook & Paige
// · Team. MIRRORS ClientsSubTabs 1:1 (the proven 1c-viii-c pattern): a gate-AWARE
// strip wrapped by a pathless layout, so a tab is shown iff its route would
// actually render for the current viewer — no tab ever dead-ends on a "Restricted
// area" card. Indigo underline on the active tab, NEVER gold (§11 — nav-active is
// not an ACT).
//
// The CANONICAL REGISTRY below is the single source of truth for order, labels,
// paths, department (§16), and gate. The router implements the SAME paths; if a
// child gate changes, change the matching `canSee` here in lockstep. Each `canSee`
// mirrors its route's real gate in Admin.tsx EXACTLY (no shown-but-dead-end tab):
//   • admin+platformStaff (RoleGate allow=["admin"] allowPlatformStaff) — General
//   • admin-or-owner (AdminOnly = RoleGate allow=["admin"]) — Integrations · Legal ·
//     Billing · Playbook  (AdminOnly does NOT admit scoped platform staff)
//   • coach-visible (all staff) — Brand · Automations · Team
import { Link, useLocation } from "react-router-dom";
import {
  SlidersHorizontal,
  Palette,
  Workflow,
  Plug,
  Scale,
  CreditCard,
  BookOpen,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useTenantContext } from "@/hooks/useTenantContext";
import { cn } from "@/lib/utils";

type Access = { isAdmin: boolean; isPlatformOwner: boolean; isPlatformStaff: boolean };
type SetupTab = {
  key: string;
  label: string;
  href: string;
  /** §16 — the org department this surface belongs to (surfaced as the tab title). */
  dept: string;
  icon: LucideIcon;
  canSee: (a: Access) => boolean;
};

// General's route is RoleGate allow=["admin"] allowPlatformStaff — so it admits
// tenant admins AND scoped platform staff. isPlatformStaff already means "owner OR
// scoped platform admin" (see useTenantContext), so it covers the owner too.
const adminOrStaff = (a: Access) => a.isAdmin || a.isPlatformStaff;
// AdminOnly (Integrations/Legal/Billing/Playbook) is RoleGate allow=["admin"] with
// the default allowOwner=true and allowPlatformStaff=false — it admits tenant admins
// and the hardcoded platform owner, but NOT a scoped platform-staff who isn't an
// admin. Match that exactly so these tabs never show to a viewer the route denies.
const adminOnly = (a: Access) => a.isAdmin || a.isPlatformOwner;
// coach-visible group — every staffer in a tenant context can see it.
const coachVisible = () => true;

// CANONICAL TAB REGISTRY — order locked; default = general. Paths: /admin/setup/<key>.
// Kept local (not exported): the router implements the same paths independently, so
// this stays the strip's single source of truth without a shared-export coupling.
const SETUP_TABS: SetupTab[] = [
  { key: "general", label: "General", href: "/admin/setup/general", dept: "Operations", icon: SlidersHorizontal, canSee: adminOrStaff },
  { key: "brand", label: "Brand", href: "/admin/setup/brand", dept: "Marketing", icon: Palette, canSee: coachVisible },
  { key: "automations", label: "Automations", href: "/admin/setup/automations", dept: "Technology", icon: Workflow, canSee: coachVisible },
  { key: "integrations", label: "Integrations", href: "/admin/setup/integrations", dept: "Technology", icon: Plug, canSee: adminOnly },
  { key: "legal", label: "Legal", href: "/admin/setup/legal", dept: "Legal & Compliance", icon: Scale, canSee: adminOnly },
  { key: "billing", label: "Billing", href: "/admin/setup/billing", dept: "Finance", icon: CreditCard, canSee: adminOnly },
  { key: "playbook", label: "Playbook & Paige", href: "/admin/setup/playbook", dept: "Product", icon: BookOpen, canSee: adminOnly },
  { key: "team", label: "Team", href: "/admin/setup/team", dept: "People", icon: Users, canSee: coachVisible },
];

const GENERAL_HREF = "/admin/setup/general";

export function SetupSubTabs() {
  const { pathname } = useLocation();
  const roles = useUserRoles();
  const tenant = useTenantContext();

  // Don't render a wrong subset mid-resolution: while roles/tenant load, the admin
  // flags read false, which would briefly hide the admin-only tabs. Hold the strip
  // until access is known.
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

  // Exact/prefix match. general is the default: the bare /admin/setup index resolves
  // to it. The eight leaf keys are mutually non-prefixing, so `=== href || startsWith
  // href + "/"` is unambiguous for the rest.
  const isActive = (href: string) => {
    if (href === GENERAL_HREF && pathname === "/admin/setup") return true;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const tabs = SETUP_TABS.filter((t) => t.canSee(access));
  if (tabs.length <= 1) return null; // nothing to switch between → no strip clutter

  // If the current route isn't one this viewer can see as a tab (e.g. a coach who
  // deep-linked the admin-only Billing tab), don't wrap the gated surface in a strip
  // that disowns it — let the route's own gate speak.
  if (!tabs.some((t) => isActive(t.href))) return null;

  return (
    <nav
      aria-label="Setup"
      className="shrink-0 flex items-center gap-1 overflow-x-auto border-b border-border bg-background px-3 sm:px-4 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.key}
            to={t.href}
            title={t.dept}
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
